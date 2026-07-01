"""Model download manager with resume, progress tracking, and SHA-256 validation."""

import hashlib
import json
import shutil
import threading
import time
from pathlib import Path

import httpx

from app.config import settings

import demucs

ROOT_URL = "https://dl.fbaipublicfiles.com/demucs/"
REMOTE_FILES_PATH = Path(demucs.__file__).parent / "remote" / "files.txt"

# Map model id to its yaml definition file names in demucs/remote.
MODEL_YAMLS = {
    "htdemucs": "htdemucs.yaml",
    "htdemucs_ft": "htdemucs_ft.yaml",
    "htdemucs_6s": "htdemucs_6s.yaml",
    "mdx_extra_q": "mdx_extra_q.yaml",
}

_downloads: dict[str, dict] = {}
_lock = threading.Lock()


def _parse_remote_files() -> dict[str, str]:
    """Parse demucs remote files.txt into {signature: url}."""
    if not REMOTE_FILES_PATH.exists():
        # Fallback for non-standard installs: fetch from remote
        return {}

    root = ""
    models: dict[str, str] = {}
    for line in REMOTE_FILES_PATH.read_text().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("root:"):
            root = line.split(":", 1)[1].strip()
        else:
            sig = line.split("-", 1)[0]
            models[sig] = ROOT_URL + root + line
    return models


def _get_model_signatures(model_id: str) -> list[str]:
    """Read the demucs yaml for a model to find its checkpoint signatures."""
    import yaml

    yaml_name = MODEL_YAMLS.get(model_id)
    if not yaml_name:
        return []
    yaml_path = REMOTE_FILES_PATH.parent / yaml_name
    if not yaml_path.exists():
        return []
    data = yaml.safe_load(yaml_path.read_text())
    return data.get("models", [])


def _manifest_path(model_id: str) -> Path:
    return settings.models_dir / f"{model_id}_manifest.json"


def _hub_checkpoints_dir() -> Path:
    path = settings.models_dir / "hub" / "checkpoints"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_model_files(model_id: str) -> list[dict]:
    """Return the list of checkpoint files required for a model."""
    remote = _parse_remote_files()
    signatures = _get_model_signatures(model_id)
    files = []
    for sig in signatures:
        url = remote.get(sig)
        if not url:
            continue
        filename = url.rsplit("/", 1)[-1]
        files.append({"signature": sig, "filename": filename, "url": url})
    return files


def get_download_progress(model_id: str) -> dict:
    with _lock:
        data = _downloads.get(model_id, {"status": "idle", "progress": 0.0}).copy()
        data["model_id"] = model_id
        return data


def _set_progress(model_id: str, status: str, progress: float, **kwargs) -> None:
    with _lock:
        entry = _downloads.setdefault(model_id, {})
        entry["status"] = status
        entry["progress"] = progress
        entry.update(kwargs)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def _download_file(url: str, destination: Path, progress_callback) -> None:
    """Download a single file with resume support, calling progress_callback(downloaded, total)."""
    headers = {}
    partial = destination.with_suffix(destination.suffix + ".part")
    start_byte = 0
    if partial.exists():
        start_byte = partial.stat().st_size
        headers["Range"] = f"bytes={start_byte}-"

    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=60.0) as response:
        response.raise_for_status()
        total = int(response.headers.get("Content-Length", 0))
        if response.status_code == 206 and start_byte:
            total += start_byte
        elif not total:
            total = 0

        mode = "ab" if response.status_code == 206 else "wb"
        downloaded = start_byte if response.status_code == 206 else 0
        with partial.open(mode) as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    progress_callback(downloaded, total)

    partial.replace(destination)


def download_model(model_id: str) -> None:
    """Download and validate all checkpoint files for a model."""
    if model_id in _downloads and _downloads[model_id]["status"] == "downloading":
        return

    files = get_model_files(model_id)
    if not files:
        raise ValueError(f"Unknown model or no remote files found for {model_id}")

    _set_progress(model_id, "downloading", 0.0, bytes_downloaded=0, total_bytes=0, start_time=time.time())
    checkpoint_dir = _hub_checkpoints_dir()
    manifest = {"model_id": model_id, "files": []}
    total_bytes = 0
    total_downloaded = 0

    try:
        # First pass: determine total sizes
        for file_info in files:
            try:
                head = httpx.head(file_info["url"], follow_redirects=True, timeout=30.0)
                length = int(head.headers.get("Content-Length", 0))
                file_info["size"] = length
                total_bytes += length
            except Exception:
                file_info["size"] = 0

        _set_progress(model_id, "downloading", 0.0, total_bytes=total_bytes)

        for file_info in files:
            destination = checkpoint_dir / file_info["filename"]
            if destination.exists():
                # Validate existing file with SHA-256 if manifest exists.
                existing_sha = _sha256_file(destination)
                old_manifest = _load_manifest(model_id)
                expected = next(
                    (f.get("sha256") for f in old_manifest.get("files", []) if f.get("filename") == file_info["filename"]),
                    None,
                )
                if expected and existing_sha == expected:
                    total_downloaded += file_info.get("size", destination.stat().st_size)
                    manifest["files"].append({"filename": file_info["filename"], "sha256": expected})
                    continue
                destination.unlink()

            file_last = [0]

            def callback(downloaded: int, total: int, last=file_last):
                nonlocal total_downloaded
                total_downloaded += downloaded - last[0]
                last[0] = downloaded
                progress = (total_downloaded / total_bytes * 100) if total_bytes else 0.0
                eta = _estimate_eta(model_id, total_downloaded, total_bytes)
                _set_progress(
                    model_id,
                    "downloading",
                    progress,
                    bytes_downloaded=total_downloaded,
                    total_bytes=total_bytes,
                    eta_seconds=eta,
                )

            _download_file(file_info["url"], destination, callback)
            sha = _sha256_file(destination)
            manifest["files"].append({"filename": file_info["filename"], "sha256": sha})
            total_downloaded += file_info.get("size", destination.stat().st_size)

        _save_manifest(model_id, manifest)
        _set_progress(model_id, "completed", 100.0, bytes_downloaded=total_bytes, total_bytes=total_bytes)

    except Exception as exc:
        _set_progress(model_id, "failed", 0.0, error_message=str(exc))
        raise


def _estimate_eta(model_id: str, downloaded: int, total: int) -> float | None:
    if not total or downloaded <= 0:
        return None
    entry = _downloads.get(model_id, {})
    start = entry.get("start_time")
    if start is None:
        return None
    elapsed = time.time() - start
    rate = downloaded / elapsed
    remaining = total - downloaded
    return remaining / rate if rate > 0 else None


def _load_manifest(model_id: str) -> dict:
    path = _manifest_path(model_id)
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _save_manifest(model_id: str, manifest: dict) -> None:
    _manifest_path(model_id).write_text(json.dumps(manifest, indent=2))


def validate_model(model_id: str) -> bool:
    """Verify all model files exist and SHA-256 checksums match."""
    manifest = _load_manifest(model_id)
    checkpoint_dir = _hub_checkpoints_dir()
    for file_entry in manifest.get("files", []):
        path = checkpoint_dir / file_entry["filename"]
        if not path.exists():
            return False
        expected = file_entry.get("sha256")
        if expected and _sha256_file(path) != expected:
            return False
    return bool(manifest.get("files"))
