"""Audio metadata extraction utilities."""

from pathlib import Path

import soundfile as sf
from mutagen import File as MutagenFile


def extract_audio_info(path: Path) -> dict:
    """Extract metadata and technical info from an audio file."""
    info = sf.info(str(path))
    duration = info.duration if info.duration else None
    sample_rate = info.samplerate
    channels = info.channels
    format_name = info.format

    mutagen = MutagenFile(str(path))
    title = None
    artist = None
    bitrate = None

    if mutagen is not None:
        if hasattr(mutagen, "info") and hasattr(mutagen.info, "bitrate"):
            bitrate = mutagen.info.bitrate
        tags = mutagen.tags or {}
        title = _first_tag(tags, ["TIT2", "TITLE", "\u00a9nam", "title"])
        artist = _first_tag(tags, ["TPE1", "ARTIST", "\u00a9ART", "artist"])

    return {
        "duration_seconds": duration,
        "sample_rate": sample_rate,
        "channels": channels,
        "bitrate": bitrate,
        "format": format_name,
        "title": title,
        "artist": artist,
    }


def _first_tag(tags, keys: list[str]) -> str | None:
    for key in keys:
        value = tags.get(key)
        if value is not None:
            if isinstance(value, list):
                return str(value[0])
            return str(value)
    return None
