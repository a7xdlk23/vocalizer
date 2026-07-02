"""Export endpoints."""

import json
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.db import AudioFile, SeparationJob
from app.models.schemas import ExportOut, ExportRequest

router = APIRouter(prefix="/export", tags=["export"])

# app.services.exporter imports torch + torchaudio (~5s); import lazily inside
# the endpoints so startup stays fast (torch loads on first export).


@router.get("/formats")
def get_formats() -> dict:
    from app.services.exporter import list_formats

    return list_formats()


@router.post("", response_model=ExportOut)
def export_job(request: ExportRequest, db: Session = Depends(get_db)) -> ExportOut:
    job = db.query(SeparationJob).filter(SeparationJob.id == request.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="Separation job is not completed")

    stem_paths = json.loads(job.stem_paths or "{}")
    if not stem_paths:
        raise HTTPException(status_code=400, detail="No stems available to export")

    audio_file = db.query(AudioFile).filter(AudioFile.id == job.file_id).first()
    base_name = Path(audio_file.filename).stem if audio_file else "export"

    output_dir = Path(request.output_dir) if request.output_dir else settings.exports_dir / job.id
    output_dir.mkdir(parents=True, exist_ok=True)

    selected = request.selected_stems or list(stem_paths.keys())

    from app.services.exporter import export_merged, export_stems

    if request.merge:
        merged_path = export_merged(
            stem_paths=stem_paths,
            output_dir=output_dir,
            format_name=request.format,
            quality=request.quality,
            selected_stems=selected,
            base_name=base_name,
        )
        exported = {"merged": merged_path}
    else:
        exported = export_stems(
            stem_paths=stem_paths,
            output_dir=output_dir,
            format_name=request.format,
            quality=request.quality,
            selected_stems=selected,
            base_name=base_name,
        )

    if request.zip_archive and exported:
        zip_path = output_dir / f"{base_name}_stems.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for stem_name, file_path in exported.items():
                zf.write(file_path, Path(file_path).name)
        exported = {"archive": str(zip_path)}

    return ExportOut(export_paths=exported)
