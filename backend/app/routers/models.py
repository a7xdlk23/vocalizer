"""Model management endpoints."""

import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.models.schemas import ModelDownloadProgress, ModelImportRequest, ModelInfo
from app.services.model_downloader import download_model, get_download_progress
from app.services.model_manager import list_models, register_custom_model, remove_model

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=list[ModelInfo])
def get_models() -> list[dict]:
    return list_models()


@router.post("/download")
def download_model_endpoint(payload: dict) -> dict:
    model_id = payload.get("model_id")
    if not model_id:
        raise HTTPException(status_code=400, detail="model_id required")

    def _download():
        try:
            download_model(model_id)
        except Exception:
            pass

    threading.Thread(target=_download, daemon=True).start()
    return {"model_id": model_id, "status": "started"}


@router.get("/download/{model_id}", response_model=ModelDownloadProgress)
def get_download_model_progress(model_id: str) -> dict:
    return get_download_progress(model_id)


@router.post("/import", response_model=ModelInfo)
def import_custom_model(payload: ModelImportRequest) -> dict:
    file_path = Path(payload.path)
    if not file_path.exists():
        raise HTTPException(status_code=400, detail=f"File not found: {payload.path}")
    suffix = file_path.suffix.lower()
    if suffix not in (".pt", ".th", ".pth", ".onnx"):
        raise HTTPException(status_code=400, detail="Unsupported format — use .pt, .th, .pth, or .onnx")
    if not payload.stems:
        raise HTTPException(status_code=400, detail="At least one stem name is required")
    if suffix != ".onnx":
        try:
            import torch
            obj = torch.load(file_path, map_location="cpu", weights_only=False)
            if obj is None:
                raise ValueError("Empty checkpoint")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Cannot load model: {exc}") from exc
    model_id = f"custom_{uuid.uuid4().hex[:8]}"
    entry = register_custom_model(model_id, payload.name, str(file_path), payload.stems)
    return {
        "id": model_id,
        "name": entry["name"],
        "stem_count": entry["stem_count"],
        "stems": entry["stems"],
        "size_mb": entry.get("size_mb"),
        "quality_score": None,
        "speed_score": None,
        "installed": True,
        "default": False,
        "version": "custom",
        "checksum_sha256": None,
        "local_path": entry["local_path"],
    }


@router.post("/{model_id}/optimize")
def optimize_model(model_id: str) -> dict:
    from app.services.onnx_optimizer import start_optimization
    start_optimization(model_id)
    return {"model_id": model_id, "status": "started"}


@router.get("/{model_id}/optimize")
def get_optimization_status(model_id: str) -> dict:
    from app.services.onnx_optimizer import get_status
    return get_status(model_id)


@router.delete("/{model_id}")
def delete_model(model_id: str) -> dict:
    if remove_model(model_id):
        return {"ok": True}
    raise HTTPException(status_code=404, detail="Model not found in cache")
