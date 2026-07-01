"""SQLAlchemy models for the audio library."""

from datetime import datetime
from enum import Enum

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.database import Base


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    LOADING_MODEL = "LOADING_MODEL"
    DOWNLOADING = "DOWNLOADING"
    PROCESSING = "PROCESSING"
    SAVING = "SAVING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AudioFile(Base):
    __tablename__ = "audio_files"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    original_path = Column(String, nullable=True)
    storage_path = Column(String, nullable=False)
    title = Column(String, nullable=True)
    artist = Column(String, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    sample_rate = Column(Integer, nullable=True)
    channels = Column(Integer, nullable=True)
    bitrate = Column(Integer, nullable=True)
    format = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SeparationJob(Base):
    __tablename__ = "separation_jobs"

    id = Column(String, primary_key=True, index=True)
    file_id = Column(String, nullable=False, index=True)
    model = Column(String, nullable=False)
    stems = Column(Text, nullable=False)  # comma-separated
    overlap = Column(Float, default=0.25)
    segment_duration = Column(Float, nullable=True)
    device = Column(String, nullable=True)
    status = Column(String, default=JobStatus.QUEUED.value, nullable=False)
    progress = Column(Float, default=0.0)
    elapsed_seconds = Column(Float, default=0.0)
    eta_seconds = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    result_dir = Column(String, nullable=True)
    stem_paths = Column(Text, nullable=True)  # JSON dict
    start_time = Column(Float, nullable=True)
    end_time = Column(Float, nullable=True)
    two_stem = Column(String, nullable=True)
    batch_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id = Column(String, primary_key=True, index=True)
    model = Column(String, nullable=False)
    status = Column(String, default=JobStatus.QUEUED.value, nullable=False)
    total_jobs = Column(Integer, default=0)
    completed_jobs = Column(Integer, default=0)
    failed_jobs = Column(Integer, default=0)
    progress = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
