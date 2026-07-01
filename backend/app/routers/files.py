"""Audio file management endpoints."""

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.db import AudioFile
from app.models.schemas import AudioFileOut
from app.services.audio_info import extract_audio_info

router = APIRouter(prefix="/files", tags=["files"])


class ImportFileRequest(BaseModel):
    """Import a file by its local filesystem path."""
    path: str


@router.post("/upload", response_model=AudioFileOut)
async def upload_file(
    upload: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> AudioFile:
    file_id = str(uuid.uuid4())
    filename = upload.filename or "unknown"
    extension = Path(filename).suffix.lstrip(".").lower() or "bin"
    storage_path = settings.uploads_dir / f"{file_id}.{extension}"

    with storage_path.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)

    info = extract_audio_info(storage_path)

    audio_file = AudioFile(
        id=file_id,
        filename=filename,
        storage_path=str(storage_path),
        title=info.get("title"),
        artist=info.get("artist"),
        duration_seconds=info.get("duration_seconds"),
        sample_rate=info.get("sample_rate"),
        channels=info.get("channels"),
        bitrate=info.get("bitrate"),
        format=info.get("format"),
    )
    db.add(audio_file)
    db.commit()
    db.refresh(audio_file)
    return audio_file


@router.get("", response_model=list[AudioFileOut])
def list_files(db: Session = Depends(get_db)) -> list[AudioFile]:
    return db.query(AudioFile).order_by(AudioFile.created_at.desc()).all()


@router.get("/{file_id}", response_model=AudioFileOut)
def get_file(file_id: str, db: Session = Depends(get_db)) -> AudioFile:
    audio_file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="File not found")
    return audio_file


@router.delete("/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db)) -> dict:
    audio_file = db.query(AudioFile).filter(AudioFile.id == file_id).first()
    if not audio_file:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        Path(audio_file.storage_path).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(audio_file)
    db.commit()
    return {"ok": True}
