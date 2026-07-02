"""Separation job endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.db import BatchJob, SeparationJob
from app.models.schemas import (
    BatchSeparationOut,
    BatchSeparationRequest,
    SeparationJobOut,
    SeparationRequest,
)

router = APIRouter(prefix="/separate", tags=["separate"])

# NOTE: app.services.separator imports torch + demucs (~5s). It is imported
# lazily inside the endpoints below (not at module load) so the server binds
# the port and answers /health fast; the torch cost is paid on the first
# separation instead of blocking startup. See the backend-readiness memo.


@router.post("", response_model=SeparationJobOut)
def start_separation(request: SeparationRequest, db: Session = Depends(get_db)) -> SeparationJob:
    from app.services import separator

    try:
        job_id = separator.create_job(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job creation failed: {str(e)}")
    
    job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=500, detail="Job created but not found in database")
    return job


@router.post("/batch", response_model=BatchSeparationOut)
def start_batch_separation(request: BatchSeparationRequest) -> BatchSeparationOut:
    if not request.file_ids:
        raise HTTPException(status_code=400, detail="No file IDs provided")

    from app.services import separator

    try:
        batch_id, job_ids = separator.create_batch_job(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch creation failed: {str(e)}")
        
    return BatchSeparationOut(batch_id=batch_id, job_ids=job_ids)


@router.get("/batch/{batch_id}")
def get_batch(batch_id: str, db: Session = Depends(get_db)) -> dict:
    batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    jobs = db.query(SeparationJob).filter(SeparationJob.batch_id == batch_id).all()
    return {
        "id": batch.id,
        "status": batch.status,
        "progress": batch.progress,
        "total_jobs": batch.total_jobs,
        "completed_jobs": batch.completed_jobs,
        "failed_jobs": batch.failed_jobs,
        "job_ids": [j.id for j in jobs],
    }


@router.get("/{job_id}", response_model=SeparationJobOut)
def get_job(job_id: str, db: Session = Depends(get_db)) -> SeparationJob:
    job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str, db: Session = Depends(get_db)) -> dict:
    job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from app.services import separator

    separator.cancel_job(job_id)
    return {"ok": True}
