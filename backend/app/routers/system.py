"""System status endpoints."""

from fastapi import APIRouter

from app.models.schemas import ComputeDevice, SystemStatus
from app.services.ffmpeg_validator import get_system_status, list_compute_devices

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status", response_model=SystemStatus)
def get_status() -> dict:
    return get_system_status()


@router.get("/devices", response_model=list[ComputeDevice])
def get_devices() -> list[dict]:
    return list_compute_devices()
