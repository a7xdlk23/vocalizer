"""AI model cache management."""

import json
from pathlib import Path

from app.config import settings
from app.services.model_downloader import _load_manifest, get_model_files

_CUSTOM_REGISTRY_FILE = None


def _custom_registry_path() -> Path:
    global _CUSTOM_REGISTRY_FILE
    if _CUSTOM_REGISTRY_FILE is None:
        _CUSTOM_REGISTRY_FILE = settings.models_dir / "custom_models.json"
    return _CUSTOM_REGISTRY_FILE


def load_custom_models() -> dict:
    path = _custom_registry_path()
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            return {}
    return {}


def register_custom_model(model_id: str, name: str, file_path: str, stems: list[str]) -> dict:
    custom = load_custom_models()
    size_mb = None
    p = Path(file_path)
    if p.exists():
        size_mb = round(p.stat().st_size / 1024 / 1024, 1)
    entry = {
        "name": name,
        "stem_count": len(stems),
        "stems": stems,
        "local_path": file_path,
        "installed": True,
        "default": False,
        "custom": True,
        "version": "custom",
        "size_mb": size_mb,
    }
    custom[model_id] = entry
    registry = _custom_registry_path()
    registry.parent.mkdir(parents=True, exist_ok=True)
    registry.write_text(json.dumps(custom, indent=2))
    return entry


def remove_custom_model(model_id: str) -> bool:
    custom = load_custom_models()
    if model_id not in custom:
        return False
    del custom[model_id]
    _custom_registry_path().write_text(json.dumps(custom, indent=2))
    return True

MODEL_REGISTRY = {
    "htdemucs": {
        "name": "HT Demucs",
        "stem_count": 4,
        "stems": ["vocals", "drums", "bass", "other"],
        "size_mb": 80.0,
        "quality_score": 8.8,
        "speed_score": "Medium",
        "default": True,
        "version": "4.0.1",
    },
    "htdemucs_ft": {
        "name": "HT Demucs Fine-Tuned",
        "stem_count": 4,
        "stems": ["vocals", "drums", "bass", "other"],
        "size_mb": 320.0,
        "quality_score": 9.3,
        "speed_score": "Slow",
        "default": False,
        "version": "4.0.1",
    },
    "htdemucs_6s": {
        "name": "HT Demucs 6-Stem",
        "stem_count": 6,
        "stems": ["vocals", "drums", "bass", "guitar", "piano", "other"],
        "size_mb": 165.0,
        "quality_score": 8.5,
        "speed_score": "Medium",
        "default": False,
        "version": "4.0.1",
    },
    "mdx_extra_q": {
        "name": "MDX Extra Q",
        "stem_count": 4,
        "stems": ["vocals", "drums", "bass", "other"],
        "size_mb": 75.0,
        "quality_score": 8.2,
        "speed_score": "Fast",
        "default": False,
        "version": "4.0.1",
    },
}


def list_models() -> list[dict]:
    """Return model metadata with installation status, including custom models."""
    result = []
    for model_id, meta in MODEL_REGISTRY.items():
        installed = _is_model_installed(model_id)
        local_path = str(_hub_checkpoints_dir()) if installed else None
        result.append(
            {
                "id": model_id,
                "name": meta["name"],
                "stem_count": meta["stem_count"],
                "stems": meta["stems"],
                "size_mb": meta["size_mb"],
                "quality_score": meta["quality_score"],
                "speed_score": meta["speed_score"],
                "installed": installed,
                "default": meta["default"],
                "version": meta.get("version"),
                "checksum_sha256": _get_combined_checksum(model_id) if installed else None,
                "local_path": local_path,
                "custom": False,
            }
        )
    for model_id, meta in load_custom_models().items():
        installed = Path(meta.get("local_path", "")).exists()
        result.append(
            {
                "id": model_id,
                "name": meta["name"],
                "stem_count": meta["stem_count"],
                "stems": meta["stems"],
                "size_mb": meta.get("size_mb"),
                "quality_score": None,
                "speed_score": None,
                "installed": installed,
                "default": False,
                "version": "custom",
                "checksum_sha256": None,
                "local_path": meta.get("local_path"),
                "custom": True,
            }
        )
    return result


def _hub_checkpoints_dir() -> Path:
    return settings.models_dir / "hub" / "checkpoints"


def _is_model_installed(model_id: str) -> bool:
    """Cheap, network-free check that a model's checkpoint files are present locally.

    This runs on every ``GET /models`` request, so it must stay fast and offline-safe:
    no full-file SHA-256 hashing and no remote index lookups on the hot path.

    Prefer the manifest written by our own downloader (instant, offline). Only fall
    back to the remote file list to discover expected filenames when no manifest
    exists — e.g. a model fetched directly by demucs/torch-hub on first separation.
    """
    try:
        checkpoint_dir = _hub_checkpoints_dir()

        manifest_files = _load_manifest(model_id).get("files")
        if manifest_files:
            return all((checkpoint_dir / f["filename"]).exists() for f in manifest_files)

        files = get_model_files(model_id)
        if files:
            return all((checkpoint_dir / f["filename"]).exists() for f in files)

        return False
    except Exception:
        return False


def _get_combined_checksum(model_id: str) -> str | None:
    import hashlib
    import json

    manifest_path = settings.models_dir / f"{model_id}_manifest.json"
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text())
        hashes = [f.get("sha256", "") for f in manifest.get("files", [])]
        return hashlib.sha256("".join(hashes).encode()).hexdigest()
    except Exception:
        return None


def remove_model(model_id: str) -> bool:
    """Remove a cached model by ID (built-in or custom)."""
    if model_id.startswith("custom_"):
        return remove_custom_model(model_id)
    try:
        files = get_model_files(model_id)
        checkpoint_dir = _hub_checkpoints_dir()
        for file_info in files:
            path = checkpoint_dir / file_info["filename"]
            if path.exists():
                path.unlink()
        manifest = settings.models_dir / f"{model_id}_manifest.json"
        if manifest.exists():
            manifest.unlink()
        return True
    except Exception:
        return False


def get_model_stems(model_id: str) -> list[str]:
    """Return stem list for any model ID, including custom models."""
    if model_id in MODEL_REGISTRY:
        return MODEL_REGISTRY[model_id].get("stems", [])
    custom = load_custom_models()
    if model_id in custom:
        return custom[model_id].get("stems", [])
    return []
