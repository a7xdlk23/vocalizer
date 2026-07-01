"""FastAPI application entrypoint."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ensure_dirs, settings

# Redirect Demucs / torch hub model cache into the app workspace.
os.environ["TORCH_HOME"] = str(settings.models_dir)
os.environ["XDG_CACHE_HOME"] = str(settings.data_dir / "cache")

from app.database import Base, engine
from app.routers import export, files, models, preview, separate, system


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix=settings.api_prefix)
app.include_router(separate.router, prefix=settings.api_prefix)
app.include_router(export.router, prefix=settings.api_prefix)
app.include_router(models.router, prefix=settings.api_prefix)
app.include_router(preview.router, prefix=settings.api_prefix)
app.include_router(system.router, prefix=settings.api_prefix)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
