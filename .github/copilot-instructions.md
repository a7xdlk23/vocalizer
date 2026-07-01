<!-- Generated: 2026-06-30 | Updated: 2026-06-30 -->

# vocalizer

## Purpose
Vocalizer (AudioStem) is a cross-platform desktop application for AI-powered audio stem separation. Users import audio files, select a Demucs model, run separation to isolate vocals/drums/bass/other stems, preview each stem, and export to WAV/MP3/FLAC. The app is packaged as a native desktop app via Tauri v2 with a Python FastAPI backend embedded inside.

## Key Files

| File | Description |
|------|-------------|
| `AGENTS.md` | This file — AI-readable project documentation |
| `README.md` | User-facing project overview |
| `AudioStem_Separator_PRD.docx` | Product requirements document (source of truth for scope) |
| `.gitignore` | Git ignore patterns |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `backend/` | Python FastAPI + Demucs separation engine (see `backend/AGENTS.md`) |
| `frontend/` | React 18 + TypeScript + Vite UI (see `frontend/AGENTS.md`) |
| `src-tauri/` | Tauri v2 Rust shell that packages and launches the backend (see `src-tauri/AGENTS.md`) |
| `scripts/` | Cross-platform build scripts (see `scripts/AGENTS.md`) |
| `.github/` | GitHub Actions CI workflows |

## For AI Agents

### Architecture
- **Frontend** (`frontend/src/`) communicates with the backend over HTTP at `http://127.0.0.1:8000/api/v1`.
- **Backend** (`backend/app/main.py`) is a FastAPI app with routers for files, separation, export, models, preview, and system.
- **AI engine** uses `demucs` via `demucs.apply.apply_model` and `demucs.pretrained.get_model_from_args`. `demucs.api.Separator` does NOT exist in demucs 4.0.1 — do not use it.
- **Model cache** is redirected to `~/.audiostem/models` via `TORCH_HOME` set in `app/main.py` before any demucs import.
- **Database** is SQLite at `~/.audiostem/library.db`; schema auto-created on startup via SQLAlchemy.
- **Uploads / stems / exports** all live under `~/.audiostem/`.
- **Separation** runs in a subprocess (`multiprocessing.Process`) so torch work never blocks the API.

### Developer Commands

Backend (run from `backend/`):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend (run from `frontend/`):
```powershell
npm install
npm run typecheck   # lightweight check; preferred over full build
npm run dev         # Vite dev server on http://localhost:1420
```

Tauri dev (repo root, requires Rust toolchain):
```powershell
cargo tauri dev
```

### Verification Loop
1. Start backend → `GET /health` returns `{"status":"ok"}`
2. `GET /api/v1/models` — lists models (all `installed: false` until first use)
3. `POST /api/v1/files/upload` with an audio file — returns `AudioFileOut`
4. `POST /api/v1/separate` — starts a job; first run downloads `htdemucs` (~80 MB)
5. Poll `GET /api/v1/separate/{job_id}` until `status == "COMPLETED"`
6. `POST /api/v1/export` — exports selected stems

Use a short test clip for smoke tests; separation is CPU/GPU intensive.

### Critical Gotchas
- Do **not** import `pydub` — requires `pyaudioop` unavailable on Python 3.13+. MP3 encoding uses `lameenc`; WAV/FLAC use `torchaudio`.
- `TORCH_HOME` must be set before any `demucs` import. This is done in `app/main.py` at module level.
- SQLAlchemy sessions: never return ORM instances after closing their session. Pass IDs and re-query as needed.
- Separation workers run in `multiprocessing.Process` (spawn mode). Worker entry points must be module-level functions.

## Dependencies

### Internal
- `backend/app/services/` — business logic: separator, exporter, model_manager, audio_info
- `backend/app/routers/` — FastAPI route handlers
- `backend/app/models/` — Pydantic schemas and SQLAlchemy DB models
- `frontend/src/components/` — React UI panels
- `frontend/src/store/useAppStore.ts` — Zustand global state
- `frontend/src/api/client.ts` — typed HTTP client

### External
- Python: `fastapi`, `sqlalchemy`, `demucs==4.0.1`, `torchaudio`, `lameenc`, `soundfile`, `mutagen`, `pydantic-settings`
- Frontend: React 18, TypeScript, Vite, Zustand, wavesurfer.js
- Desktop: Tauri v2 (Rust), `tauri-plugin-dialog`, `tauri-plugin-fs`

<!-- MANUAL: Project-specific notes preserved below -->
