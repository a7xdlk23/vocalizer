"""System status endpoints."""

from fastapi import APIRouter

from app.models.schemas import SystemStatus
from app.services.ffmpeg_validator import get_system_status

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status", response_model=SystemStatus)
def get_status() -> dict:
    return get_system_status()
