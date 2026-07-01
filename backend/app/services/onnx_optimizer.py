"""ONNX model export and optimization service."""

import threading
import types
from pathlib import Path

from app.config import settings

_status: dict[str, dict] = {}
_lock = threading.Lock()


def get_status(model_id: str) -> dict:
    with _lock:
        existing = _status.get(model_id)
    onnx_path = _onnx_path(model_id)
    if existing:
        return existing
    if onnx_path.exists():
        return _make_status(model_id, "completed", 100.0, str(onnx_path))
    return _make_status(model_id, "not_started", 0.0)


def start_optimization(model_id: str) -> None:
    with _lock:
        current = _status.get(model_id, {})
        if current.get("status") in ("running", "exporting", "verifying"):
            return
        _status[model_id] = _make_status(model_id, "queued", 0.0)
    t = threading.Thread(target=_run, args=(model_id,), daemon=True)
    t.start()


def get_onnx_path(model_id: str) -> Path | None:
    p = _onnx_path(model_id)
    return p if p.exists() else None


# ---------------------------------------------------------------------------

def _onnx_path(model_id: str) -> Path:
    return settings.models_dir / "onnx" / f"{model_id}.onnx"


def _set(model_id: str, status: str, progress: float, onnx_path: str | None = None, error: str | None = None) -> None:
    with _lock:
        _status[model_id] = _make_status(model_id, status, progress, onnx_path, error)


def _make_status(model_id: str, status: str, progress: float, onnx_path: str | None = None, error: str | None = None) -> dict:
    return {"model_id": model_id, "status": status, "progress": progress, "onnx_path": onnx_path, "error": error}


def _run(model_id: str) -> None:
    try:
        _set(model_id, "loading", 5.0)

        # Lazy import so the service loads even without onnx installed
        try:
            import torch
            import onnx
        except ImportError as exc:
            raise RuntimeError(f"Required packages missing: {exc}. Run: pip install onnx onnxruntime") from exc

        from demucs.pretrained import get_model_from_args
        args = types.SimpleNamespace(name=model_id, repo=None)
        model = get_model_from_args(args)
        model.eval()

        _set(model_id, "exporting", 30.0)

        out_dir = settings.models_dir / "onnx"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{model_id}.onnx"

        sample_rate = getattr(model, "samplerate", 44100)
        audio_channels = getattr(model, "audio_channels", 2)
        # 6-second dummy input — short but covers all static shapes
        dummy = torch.randn(1, audio_channels, sample_rate * 6)

        torch.onnx.export(
            model,
            dummy,
            str(out_path),
            input_names=["input"],
            output_names=["output"],
            dynamic_axes={"input": {0: "batch", 2: "length"}, "output": {0: "batch", 2: "length"}},
            opset_version=17,
            do_constant_folding=True,
        )

        _set(model_id, "verifying", 85.0)

        loaded = onnx.load(str(out_path))
        onnx.checker.check_model(loaded)

        size_mb = round(out_path.stat().st_size / 1024 / 1024, 1)
        _set(model_id, "completed", 100.0, onnx_path=str(out_path))

        import logging
        logging.getLogger(__name__).info("ONNX export complete: %s (%.1f MB)", out_path, size_mb)

    except Exception as exc:
        _set(model_id, "failed", 0.0, error=str(exc))
