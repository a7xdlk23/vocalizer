"""FFmpeg / FFprobe availability checks and system status helpers."""

import os
import shutil
from dataclasses import dataclass

import torch


@dataclass(frozen=True)
class FFmpegStatus:
    ffmpeg_available: bool
    ffprobe_available: bool


def ffmpeg_path() -> str | None:
    return shutil.which("ffmpeg")


def ffprobe_path() -> str | None:
    return shutil.which("ffprobe")


def check_ffmpeg() -> FFmpegStatus:
    return FFmpegStatus(
        ffmpeg_available=ffmpeg_path() is not None,
        ffprobe_available=ffprobe_path() is not None,
    )


def validate_ffmpeg_or_raise() -> None:
    status = check_ffmpeg()
    missing = []
    if not status.ffmpeg_available:
        missing.append("ffmpeg")
    if not status.ffprobe_available:
        missing.append("ffprobe")
    if missing:
        raise RuntimeError(
            f"Missing required tools: {', '.join(missing)}. "
            "Please install FFmpeg and ensure it is on your PATH."
        )


def is_directml_available() -> bool:
    try:
        import torch_directml
        return torch_directml.is_available()
    except ImportError:
        return False


def detect_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    if is_directml_available():
        return "directml"
    return "cpu"


def list_compute_devices() -> list[dict]:
    """Enumerate devices selectable for separation.

    Only devices demucs's ``apply_model`` can actually accept as a torch device
    string are listed — DirectML is intentionally excluded because it needs a
    ``torch_directml.device()`` object, not a device string.
    """
    default = detect_device()
    devices: list[dict] = []

    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            vram_gb = round(props.total_memory / 1024**3)
            devices.append(
                {
                    "id": f"cuda:{i}",
                    "name": f"{torch.cuda.get_device_name(i)} ({vram_gb} GB)",
                    "kind": "cuda",
                    "default": default == "cuda" and i == 0,
                }
            )

    if torch.backends.mps.is_available():
        devices.append(
            {"id": "mps", "name": "Apple Silicon (Metal)", "kind": "mps", "default": default == "mps"}
        )

    devices.append(
        {
            "id": "cpu",
            "name": f"CPU ({os.cpu_count() or 1} threads)",
            "kind": "cpu",
            "default": default == "cpu",
        }
    )
    return devices


def get_system_status() -> dict:
    status = check_ffmpeg()
    device = detect_device()
    return {
        "ffmpeg_available": status.ffmpeg_available,
        "ffprobe_available": status.ffprobe_available,
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "mps_available": torch.backends.mps.is_available(),
        "directml_available": is_directml_available(),
    }
