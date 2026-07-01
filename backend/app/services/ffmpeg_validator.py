"""FFmpeg / FFprobe availability checks and system status helpers."""

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


def detect_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_system_status() -> dict:
    status = check_ffmpeg()
    device = detect_device()
    return {
        "ffmpeg_available": status.ffmpeg_available,
        "ffprobe_available": status.ffprobe_available,
        "device": device,
        "cuda_available": torch.cuda.is_available(),
        "mps_available": torch.backends.mps.is_available(),
    }
