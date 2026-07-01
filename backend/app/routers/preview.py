"""Audio streaming preview endpoints."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse

router = APIRouter(prefix="/preview", tags=["preview"])


@router.get("/{stem_id}")
async def preview_stem(stem_id: str, request: Request) -> Response:
    # stem_id is expected to be a URL-safe path to a stem file.
    # In production, resolve via a registry; for Phase 1 we accept absolute file paths.
    path = Path(stem_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stem file not found")

    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type="audio/wav", filename=path.name)

    file_size = path.stat().st_size
    byte_range = range_header.replace("bytes=", "").split("-")
    start = int(byte_range[0]) if byte_range[0] else 0
    end = int(byte_range[1]) if byte_range[1] else file_size - 1

    if start >= file_size or end >= file_size:
        raise HTTPException(status_code=416, detail="Range not satisfiable")

    chunk_size = end - start + 1
    with path.open("rb") as f:
        f.seek(start)
        data = f.read(chunk_size)

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
        "Content-Type": "audio/wav",
    }
    return Response(content=data, status_code=206, headers=headers)
