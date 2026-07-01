"""Audio export service (WAV, MP3, FLAC)."""

import json
import subprocess
from pathlib import Path

import lameenc
import torch
import torchaudio

from app.config import settings

SUPPORTED_FORMATS = {
    "wav": {
        "extensions": ["wav"],
        "parameters": {
            "bit_depth": {"type": "choice", "values": [16, 24, 32], "default": 24},
            "sample_rate": {"type": "choice", "values": [44100, 48000, 96000], "default": 44100},
        },
    },
    "mp3": {
        "extensions": ["mp3"],
        "parameters": {
            "bitrate": {"type": "choice", "values": [128, 192, 256, 320], "default": 320},
            "mode": {"type": "choice", "values": ["cbr", "vbr"], "default": "cbr"},
            "vbr_quality": {"type": "choice", "values": [0, 2, 5, 7], "default": 2},
        },
    },
    "flac": {
        "extensions": ["flac"],
        "parameters": {
            "compression": {"type": "range", "min": 0, "max": 8, "default": 5},
            "bit_depth": {"type": "choice", "values": [16, 24], "default": 24},
        },
    },
    "ogg": {
        "extensions": ["ogg"],
        "parameters": {
            "quality": {"type": "range", "min": -1, "max": 10, "default": 6},
        },
        "requires_ffmpeg": True,
    },
    "m4a": {
        "extensions": ["m4a"],
        "parameters": {
            "bitrate": {"type": "choice", "values": [128, 192, 256, 320], "default": 256},
        },
        "requires_ffmpeg": True,
    },
}


def list_formats() -> dict:
    return SUPPORTED_FORMATS


def export_stems(
    stem_paths: dict[str, str],
    output_dir: Path,
    format_name: str,
    quality: dict,
    selected_stems: list[str] | None = None,
    base_name: str = "export",
) -> dict[str, str]:
    """Export selected stems to the requested format and return paths."""
    format_name = format_name.lower()
    if format_name not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported export format: {format_name}")

    output_dir.mkdir(parents=True, exist_ok=True)
    exported: dict[str, str] = {}

    targets = selected_stems if selected_stems else list(stem_paths.keys())
    for stem_name in targets:
        if stem_name not in stem_paths:
            continue
        source_path = Path(stem_paths[stem_name])
        out_path = output_dir / f"{base_name}_{stem_name}.{format_name}"

        if format_name == "wav":
            _export_wav(source_path, out_path, quality)
        elif format_name == "mp3":
            _export_mp3(source_path, out_path, quality)
        elif format_name == "flac":
            _export_flac(source_path, out_path, quality)
        elif format_name == "ogg":
            _export_ogg(source_path, out_path, quality)
        elif format_name == "m4a":
            _export_m4a(source_path, out_path, quality)

        exported[stem_name] = str(out_path)

    return exported


def _load_audio(path: Path) -> tuple[torch.Tensor, int]:
    waveform, sample_rate = torchaudio.load(str(path))
    return waveform, int(sample_rate)


def _resample(waveform: torch.Tensor, orig_sr: int, target_sr: int) -> torch.Tensor:
    if orig_sr == target_sr:
        return waveform
    resampler = torchaudio.transforms.Resample(orig_sr=orig_sr, new_sr=target_sr)
    return resampler(waveform)


def _export_wav(source: Path, destination: Path, quality: dict) -> None:
    bit_depth = quality.get("bit_depth", 24)
    sample_rate = quality.get("sample_rate", 44100)

    waveform, orig_sr = _load_audio(source)
    waveform = _resample(waveform, orig_sr, sample_rate)

    if bit_depth == 16:
        encoding = "PCM_S"
        bps = 16
    elif bit_depth == 24:
        encoding = "PCM_S"
        bps = 24
    else:
        encoding = "PCM_F"
        bps = 32

    torchaudio.save(str(destination), waveform, sample_rate, encoding=encoding, bits_per_sample=bps)


def _export_flac(source: Path, destination: Path, quality: dict) -> None:
    bit_depth = quality.get("bit_depth", 24)
    compression = quality.get("compression", 5)

    waveform, orig_sr = _load_audio(source)

    bps = bit_depth
    encoding = "PCM_S" if bps in (16, 24) else "PCM_F"

    torchaudio.save(
        str(destination),
        waveform,
        orig_sr,
        format="flac",
        encoding=encoding,
        bits_per_sample=bps,
        compression=compression,
    )


def _export_ogg(source: Path, destination: Path, quality: dict) -> None:
    q = quality.get("quality", 6)
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(source), "-c:a", "libvorbis", "-q:a", str(q), str(destination)],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg OGG encode failed: {result.stderr.decode()}")


def _export_m4a(source: Path, destination: Path, quality: dict) -> None:
    bitrate = quality.get("bitrate", 256)
    result = subprocess.run(
        ["ffmpeg", "-y", "-i", str(source), "-c:a", "aac", "-b:a", f"{bitrate}k", str(destination)],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg M4A encode failed: {result.stderr.decode()}")


def _export_mp3(source: Path, destination: Path, quality: dict) -> None:
    bitrate = quality.get("bitrate", 320)
    mode = quality.get("mode", "cbr")
    vbr_quality = quality.get("vbr_quality", 2)

    waveform, sample_rate = _load_audio(source)
    # Ensure mono/stereo interleaved numpy array.
    samples = waveform.numpy().T
    if samples.ndim == 1:
        samples = samples.reshape(-1, 1)

    encoder = lameenc.Encoder()
    encoder.set_channels(samples.shape[1])
    encoder.set_in_samplerate(sample_rate)
    encoder.set_bit_rate(bitrate)

    if mode == "vbr":
        encoder.set_vbr_mode(lameenc.VBR_DEFAULT)
        encoder.set_vbr_quality(vbr_quality)
    else:
        encoder.set_vbr_mode(lameenc.VBR_OFF)

    encoder.set_quality(2)
    mp3_data = encoder.encode(samples.tobytes())
    mp3_data += encoder.flush()

    destination.write_bytes(mp3_data)


def export_merged(
    stem_paths: dict[str, str],
    output_dir: Path,
    format_name: str,
    quality: dict,
    selected_stems: list[str] | None = None,
    base_name: str = "export",
) -> str:
    """Mix selected stems into a single file and return its path."""
    format_name = format_name.lower()
    out_path = output_dir / f"{base_name}_merged.{format_name}"

    targets = selected_stems if selected_stems else list(stem_paths.keys())
    if not targets:
        raise ValueError("No stems selected for merge")

    mixed = None
    sample_rate = None
    for stem_name in targets:
        waveform, sr = _load_audio(Path(stem_paths[stem_name]))
        if mixed is None:
            mixed = waveform
            sample_rate = sr
        else:
            if waveform.shape != mixed.shape:
                raise ValueError("Stem shapes do not match for merge")
            mixed += waveform

    if mixed is None or sample_rate is None:
        raise ValueError("No stems to merge")

    # Clamp to avoid clipping.
    mixed = mixed / mixed.abs().max().clamp_min(1.0)

    if format_name == "wav":
        bit_depth = quality.get("bit_depth", 24)
        sample_rate_out = quality.get("sample_rate", sample_rate)
        mixed = _resample(mixed, sample_rate, sample_rate_out)
        bps = bit_depth
        encoding = "PCM_F" if bps == 32 else "PCM_S"
        torchaudio.save(str(out_path), mixed, sample_rate_out, encoding=encoding, bits_per_sample=bps)
    elif format_name == "flac":
        bit_depth = quality.get("bit_depth", 24)
        compression = quality.get("compression", 5)
        bps = bit_depth
        encoding = "PCM_S" if bps in (16, 24) else "PCM_F"
        torchaudio.save(
            str(out_path), mixed, sample_rate, format="flac", encoding=encoding,
            bits_per_sample=bps, compression=compression,
        )
    elif format_name == "mp3":
        _export_mp3_from_tensor(mixed, sample_rate, out_path, quality)

    return str(out_path)


def _export_mp3_from_tensor(waveform: torch.Tensor, sample_rate: int, destination: Path, quality: dict) -> None:
    bitrate = quality.get("bitrate", 320)
    mode = quality.get("mode", "cbr")
    vbr_quality = quality.get("vbr_quality", 2)

    samples = waveform.numpy().T
    if samples.ndim == 1:
        samples = samples.reshape(-1, 1)

    encoder = lameenc.Encoder()
    encoder.set_channels(samples.shape[1])
    encoder.set_in_samplerate(sample_rate)
    encoder.set_bit_rate(bitrate)

    if mode == "vbr":
        encoder.set_vbr_mode(lameenc.VBR_DEFAULT)
        encoder.set_vbr_quality(vbr_quality)
    else:
        encoder.set_vbr_mode(lameenc.VBR_OFF)

    encoder.set_quality(2)
    mp3_data = encoder.encode(samples.tobytes())
    mp3_data += encoder.flush()
    destination.write_bytes(mp3_data)
