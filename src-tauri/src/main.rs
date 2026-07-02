// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

struct BackendState {
    child: Mutex<Option<Child>>,
}

/// Returns the path to the bundled backend executable inside the Tauri resource dir.
fn bundled_backend_exe(resource_dir: &Path) -> PathBuf {
    let dir = resource_dir.join("audiostem-backend");
    if cfg!(windows) {
        dir.join("audiostem-backend.exe")
    } else {
        dir.join("audiostem-backend")
    }
}

/// Try to locate the Python `backend/` source directory by walking up from a
/// starting path until we find `backend/app/main.py`.
fn find_backend_from(start: &Path) -> Option<PathBuf> {
    let mut dir = start.to_path_buf();
    for _ in 0..8 {
        let candidate = dir.join("backend");
        if candidate.join("app").join("main.py").exists() {
            return Some(candidate);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// Prefer the project's virtualenv Python (which has the backend's dependencies
/// installed) over the bare `python` on PATH, which is typically the system
/// interpreter and lacks packages like `pydantic_settings`.
fn venv_python(backend_dir: &Path) -> PathBuf {
    let venv_python = if cfg!(windows) {
        backend_dir.join(".venv").join("Scripts").join("python.exe")
    } else {
        backend_dir.join(".venv").join("bin").join("python")
    };
    if venv_python.exists() {
        venv_python
    } else {
        PathBuf::from("python")
    }
}

/// Locate the Python backend source directory using multiple strategies:
/// 1. Walk up from the Tauri resource dir (works in `cargo tauri dev`)
/// 2. Walk up from the running executable (works for release builds run from the repo)
/// 3. Walk up from the current working directory
fn find_dev_backend() -> Option<PathBuf> {
    // Strategy 1: current exe location (e.g. src-tauri/target/release/audiostem.exe)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(found) = find_backend_from(&exe) {
            return Some(found);
        }
    }
    // Strategy 2: current working directory
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = find_backend_from(&cwd) {
            return Some(found);
        }
    }
    None
}

/// Append a child-process output stream to the backend log file with timestamps.
async fn stream_to_log_file<R>(reader: R, path: PathBuf)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut reader = BufReader::new(reader).lines();
    let mut file = match tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
    {
        Ok(f) => f,
        Err(_) => return,
    };

    while let Ok(Some(line)) = reader.next_line().await {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let entry = format!("[{}] {}\n", timestamp, line);
        let _ = file.write_all(entry.as_bytes()).await;
    }
}

/// Start the Python backend. In production this runs the bundled PyInstaller executable;
/// in development it falls back to `python -m uvicorn app.main:app`.
#[tauri::command]
async fn start_backend(app: AppHandle, state: State<'_, BackendState>) -> Result<String, String> {
    let mut lock = state.child.lock().await;
    if lock.is_some() {
        return Ok("Backend already running".to_string());
    }

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let backend_exe = bundled_backend_exe(&resource_dir);

    let (mut cmd, work_dir): (Command, PathBuf) = if backend_exe.exists() {
        (Command::new(&backend_exe), backend_exe.parent().unwrap().to_path_buf())
    } else {
        let backend_dir = find_dev_backend()
            .ok_or("Backend executable not found and dev source fallback unavailable")?;
        let mut c = Command::new(venv_python(&backend_dir));
        c.arg("-m")
            .arg("uvicorn")
            .arg("app.main:app")
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg("8000");
        (c, backend_dir)
    };

    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    // Ensure the log directory exists: ~/.audiostem/logs
    let log_dir = app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join(".audiostem")
        .join("logs");
    tokio::fs::create_dir_all(&log_dir)
        .await
        .map_err(|e| format!("Failed to create log directory: {}", e))?;
    let log_path = log_dir.join("backend.log");

    let mut child = cmd
        .current_dir(work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start backend: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let stdout_log = log_path.with_extension("stdout.log");
        tauri::async_runtime::spawn(async move {
            stream_to_log_file(stdout, stdout_log).await;
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let stderr_log = log_path.with_extension("stderr.log");
        tauri::async_runtime::spawn(async move {
            stream_to_log_file(stderr, stderr_log).await;
        });
    }

    *lock = Some(child);
    Ok("Backend started".to_string())
}

/// Open a native file dialog and return the selected file paths.
#[tauri::command]
async fn open_file_dialog(app: AppHandle, multiple: bool) -> Result<Vec<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Vec<String>>();
    let dialog = app.dialog().file();

    let send_result = move |paths: Vec<String>| {
        let _ = tx.send(paths);
    };

    if multiple {
        dialog.pick_files(move |files| {
            let paths = files
                .map(|f| {
                    f.into_iter()
                        .filter_map(|fp| fp.into_path().ok())
                        .map(|p| p.to_string_lossy().to_string())
                        .collect()
                })
                .unwrap_or_default();
            send_result(paths);
        });
    } else {
        dialog.pick_file(move |file| {
            let paths = file
                .and_then(|fp| fp.into_path().ok())
                .map(|p| vec![p.to_string_lossy().to_string()])
                .unwrap_or_default();
            send_result(paths);
        });
    }

    rx.await.map_err(|e| e.to_string())
}

/// Open a native folder picker dialog and return the selected directory path.
#[tauri::command]
async fn open_folder_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    let dialog = app.dialog().file();

    dialog.pick_folder(move |folder| {
        let path = folder.and_then(|fp| fp.into_path().ok()).map(|p| p.to_string_lossy().to_string());
        let _ = tx.send(path);
    });

    rx.await.map_err(|e| e.to_string())
}

/// Show a save-location dialog for choosing an output directory.
#[tauri::command]
async fn save_directory_dialog(app: AppHandle) -> Result<Option<String>, String> {
    // The Tauri dialog plugin does not have a dedicated "save directory" picker;
    // pick_folder is the idiomatic way to let the user choose an output directory.
    open_folder_dialog(app).await
}

/// Read a local audio file as raw bytes. The frontend can use this to preview
/// user-selected files without granting broad filesystem access to the webview.
#[tauri::command]
async fn read_audio_file(path: String) -> Result<Vec<u8>, String> {
    tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read audio file '{}': {}", path, e))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState { child: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            start_backend,
            open_file_dialog,
            open_folder_dialog,
            save_directory_dialog,
            read_audio_file
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state: State<BackendState> = handle.state();
                if let Err(e) = start_backend(handle.clone(), state).await {
                    eprintln!("Failed to start backend: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
