"""System status endpoints."""

from fastapi import APIRouter

from app.models.schemas import ComputeDevice, SystemStatus

router = APIRouter(prefix="/system", tags=["system"])

# ffmpeg_validator imports torch (~5s); import it lazily inside the endpoints so
# startup stays fast. The first /system/status or /system/devices call pays the
# torch cost, which the frontend fires after the app is already interactive.


@router.get("/status", response_model=SystemStatus)
def get_status() -> dict:
    from app.services.ffmpeg_validator import get_system_status

    return get_system_status()


@router.get("/devices", response_model=list[ComputeDevice])
def get_devices() -> list[dict]:
    from app.services.ffmpeg_validator import list_compute_devices

    return list_compute_devices()
