"""Pydantic schemas for API requests and responses."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AudioFileIn(BaseModel):
    filename: str


class AudioFileOut(BaseModel):
    id: str
    filename: str
    storage_path: str | None = None
    title: str | None = None
    artist: str | None = None
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channels: int | None = None
    bitrate: int | None = None
    format: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class SeparationRequest(BaseModel):
    file_id: str
    model: str = "htdemucs"
    stems: list[str] | None = None
    overlap: float = 0.25
    device: str | None = None
    segment_duration: float | None = None
    start_time: float | None = None
    end_time: float | None = None
    two_stem: str | None = None


class SeparationJobOut(BaseModel):
    id: str
    file_id: str
    model: str
    stems: list[str]
    overlap: float
    device: str | None = None
    status: str
    progress: float
    elapsed_seconds: float
    eta_seconds: float | None = None
    error_message: str | None = None
    result_dir: str | None = None
    stem_paths: dict[str, str] | None = None
    start_time: float | None = None
    end_time: float | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchSeparationRequest(BaseModel):
    file_ids: list[str]
    model: str = "htdemucs"
    stems: list[str] | None = None
    overlap: float = 0.25
    device: str | None = None
    segment_duration: float | None = None
    start_time: float | None = None
    end_time: float | None = None
    two_stem: str | None = None


class BatchSeparationOut(BaseModel):
    batch_id: str
    job_ids: list[str]


class ExportRequest(BaseModel):
    job_id: str
    format: str = "wav"
    quality: dict[str, Any] = Field(default_factory=dict)
    output_dir: str | None = None
    selected_stems: list[str] | None = None
    merge: bool = False
    zip_archive: bool = False
    base_name: str | None = None


class ExportOut(BaseModel):
    export_paths: dict[str, str]


class ModelInfo(BaseModel):
    id: str
    name: str
    stem_count: int
    stems: list[str]
    size_mb: float | None = None
    quality_score: float | None = None
    speed_score: str | None = None
    installed: bool = False
    default: bool = False
    checksum_sha256: str | None = None
    version: str | None = None
    local_path: str | None = None


class ModelDownloadProgress(BaseModel):
    model_id: str
    status: str
    progress: float
    bytes_downloaded: int = 0
    total_bytes: int = 0
    eta_seconds: float | None = None
    error_message: str | None = None


class ModelImportRequest(BaseModel):
    name: str
    path: str
    stems: list[str]


class SystemStatus(BaseModel):
    ffmpeg_available: bool
    ffprobe_available: bool
    device: str
    cuda_available: bool
    mps_available: bool
