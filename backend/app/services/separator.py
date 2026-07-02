"""Demucs separation service with process-based workers and cancellation."""

import json
import threading
import time
import types
import uuid
from datetime import datetime
from pathlib import Path

import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model_from_args
from demucs.separate import load_track

from app.config import settings
from app.database import SessionLocal
from app.models.db import AudioFile, BatchJob, JobStatus, SeparationJob
from app.models.schemas import BatchSeparationRequest, SeparationRequest
from app.services.ffmpeg_validator import detect_device, validate_ffmpeg_or_raise
from app.services.model_manager import MODEL_REGISTRY, get_model_stems, load_custom_models

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def _resolve_device(requested: str | None) -> str:
    """Resolve a requested device to one separation can actually run on.

    Falls back to auto-detection when the requested device isn't available
    (e.g. a persisted 'cuda:0' choice restored on a machine without CUDA)
    instead of letting apply_model crash the job. DirectML never resolves
    here: apply_model needs a torch device string, which DirectML can't be.
    """
    if requested and requested.startswith("cuda") and torch.cuda.is_available():
        return requested
    if requested == "mps" and torch.backends.mps.is_available():
        return requested
    if requested == "cpu":
        return "cpu"
    detected = detect_device()
    return "cpu" if detected == "directml" else detected


def _save_wav(wav, path, samplerate: int) -> None:
    """Write a (channels, samples) float tensor to a 32-bit float WAV via libsndfile.

    Avoids demucs.save_audio / torchaudio.save, which on recent torchaudio route
    through TorchCodec — an extra native dependency we neither install nor bundle.
    soundfile (libsndfile) is already a dependency and is bundled by PyInstaller.
    """
    data = wav.detach().cpu().numpy()
    if data.ndim == 1:
        data = data[None, :]
    # soundfile expects (frames, channels); demucs tensors are (channels, frames).
    sf.write(str(path), data.T, int(samplerate), subtype="FLOAT")





def create_job(request: SeparationRequest) -> str:
    """Create and queue a single separation job."""
    job_id = str(uuid.uuid4())
    model = request.model or settings.default_model
    stems = request.stems or get_model_stems(model)
    device = _resolve_device(request.device)

    db = SessionLocal()
    try:
        job = SeparationJob(
            id=job_id,
            file_id=request.file_id,
            model=model,
            stems=",".join(stems),
            overlap=request.overlap,
            segment_duration=request.segment_duration,
            device=device,
            status=JobStatus.QUEUED.value,
            progress=0.0,
            elapsed_seconds=0.0,
            start_time=request.start_time,
            end_time=request.end_time,
            two_stem=request.two_stem,
        )
        db.add(job)
        db.commit()
    finally:
        db.close()

    cancel_event = threading.Event()
    worker = threading.Thread(
        target=_run_separation_worker,
        args=(job_id,),
        kwargs={"cancel_event": cancel_event},
        daemon=True,
        name=f"separation-{job_id[:8]}",
    )
    try:
        worker.start()
    except Exception as exc:  # noqa: BLE001
        # Leaving the job stuck in QUEUED forever would be worse than surfacing
        # the error: mark it failed and re-raise so the API returns a real error.
        print(f"[separator] failed to start worker for job {job_id}: {exc}", flush=True)
        _update_status(job_id, JobStatus.FAILED.value, 0.0)
        _mark_error(job_id, f"Failed to start separation worker: {exc}")
        raise

    with _lock:
        _jobs[job_id] = {"cancel_event": cancel_event, "thread": worker}

    return job_id


def create_batch_job(request: BatchSeparationRequest) -> tuple[str, list[str]]:
    """Create a batch job and queue its separation jobs sequentially."""
    batch_id = str(uuid.uuid4())
    model = request.model or settings.default_model
    stems = request.stems or get_model_stems(model)
    device = _resolve_device(request.device)

    db = SessionLocal()
    try:
        batch = BatchJob(
            id=batch_id,
            model=model,
            total_jobs=len(request.file_ids),
        )
        db.add(batch)

        job_ids: list[str] = []
        for file_id in request.file_ids:
            job_id = str(uuid.uuid4())
            job_ids.append(job_id)
            job = SeparationJob(
                id=job_id,
                file_id=file_id,
                model=model,
                stems=",".join(stems),
                overlap=request.overlap,
                segment_duration=request.segment_duration,
                device=device,
                status=JobStatus.QUEUED.value,
                progress=0.0,
                elapsed_seconds=0.0,
                start_time=request.start_time,
                end_time=request.end_time,
                two_stem=request.two_stem,
                batch_id=batch_id,
            )
            db.add(job)
        db.commit()
    finally:
        db.close()

    cancel_event = threading.Event()
    worker = threading.Thread(
        target=_run_batch_worker,
        args=(batch_id, job_ids),
        kwargs={"cancel_event": cancel_event},
        daemon=True,
        name=f"batch-{batch_id[:8]}",
    )
    worker.start()

    with _lock:
        entry = {"cancel_event": cancel_event, "thread": worker, "job_ids": job_ids}
        _jobs[batch_id] = entry
        for job_id in job_ids:
            _jobs[job_id] = entry

    return batch_id, job_ids


def cancel_job(job_id: str) -> bool:
    """Request cancellation of a running job or batch.

    Cancellation is cooperative: the worker thread checks ``cancel_event`` at each
    stage and stops at the next checkpoint. A thread can't be force-killed mid-
    inference, so a long ``apply_model`` call runs to completion before the job
    flips to CANCELLED — but no stems are written for a cancelled job.
    """
    with _lock:
        entry = _jobs.get(job_id)
    if entry is None:
        return False

    entry["cancel_event"].set()

    # Mark all associated jobs/batch as cancelled for immediate UI feedback.
    ids_to_cancel = {job_id}
    if "job_ids" in entry:
        ids_to_cancel.update(entry["job_ids"])

    for jid in ids_to_cancel:
        _update_status(jid, JobStatus.CANCELLED.value, progress=0.0)

    return True


def get_job(job_id: str) -> SeparationJob | None:
    db = SessionLocal()
    try:
        return db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
    finally:
        db.close()


def get_batch_job(batch_id: str) -> BatchJob | None:
    db = SessionLocal()
    try:
        return db.query(BatchJob).filter(BatchJob.id == batch_id).first()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _load_model(model_id: str):
    """Load a Demucs model by ID, supporting custom .pt/.onnx imports."""
    if model_id.startswith("custom_"):
        custom = load_custom_models()
        if model_id in custom:
            path = custom[model_id]["local_path"]
            if path.endswith(".onnx"):
                raise ValueError(f"ONNX separation is not natively supported by Demucs apply_model. Path: {path}")
            from demucs.states import load_model
            return load_model(path)
        raise ValueError(f"Custom model '{model_id}' not found in registry")
    args = types.SimpleNamespace(name=model_id, repo=None)
    return get_model_from_args(args)


# ---------------------------------------------------------------------------
# Worker entry points (must be module-level for spawn compatibility)
# ---------------------------------------------------------------------------

def _run_separation_worker(job_id: str, cancel_event) -> None:
    """Child-process entry point for a single separation job."""
    start_time = time.time()

    def update_progress(status: str, progress: float, eta: float | None = None) -> None:
        elapsed = time.time() - start_time
        _update_status(job_id, status, progress, elapsed, eta)

    try:
        validate_ffmpeg_or_raise()

        db = SessionLocal()
        try:
            job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
            if job is None:
                return
            audio_file = db.query(AudioFile).filter(AudioFile.id == job.file_id).first()
        finally:
            db.close()

        if audio_file is None:
            raise ValueError(f"Audio file {job.file_id} not found")

        input_path = Path(audio_file.storage_path)
        output_dir = settings.stems_dir / job_id
        output_dir.mkdir(parents=True, exist_ok=True)

        update_progress(JobStatus.LOADING_MODEL.value, 5.0)

        model = _load_model(job.model)

        if cancel_event.is_set():
            update_progress(JobStatus.CANCELLED.value, 0.0)
            return

        update_progress(JobStatus.PROCESSING.value, 10.0)

        model_audio_channels = getattr(model, "audio_channels", 2)
        model_samplerate = getattr(model, "samplerate", 44100)
        wav = load_track(input_path, model_audio_channels, model_samplerate)

        # Partial separation: slice by start/end time in seconds.
        if job.start_time is not None or job.end_time is not None:
            total_samples = wav.shape[-1]
            start_sample = int((job.start_time or 0.0) * model_samplerate)
            end_sample = (
                int(job.end_time * model_samplerate)
                if job.end_time is not None
                else total_samples
            )
            start_sample = max(0, min(start_sample, total_samples))
            end_sample = max(start_sample, min(end_sample, total_samples))
            wav = wav[:, start_sample:end_sample]

        if wav.shape[-1] == 0:
            raise ValueError("Selected time range is empty")

        if cancel_event.is_set():
            update_progress(JobStatus.CANCELLED.value, 0.0)
            return

        # Normalization matching demucs.separate CLI.
        ref = wav.mean(0)
        wav -= ref.mean()
        wav /= ref.std().clamp_min(1e-8)

        # Real chunk-level progress: demucs's split branch submits every audio
        # segment to the pool up front and computes lazily inside result(), so
        # a counting pool reports exactly how much of the track is done. The
        # 1s side thread persists it with fresh elapsed/ETA between chunks.
        n_sub_models = len(getattr(model, "models", [])) or 1
        shared_progress = {"value": 10.0}

        def _on_chunk_fraction(fraction: float) -> None:
            # Map apply_model's 0..1 onto the 10..80 span of the job.
            shared_progress["value"] = 10.0 + 69.5 * min(max(fraction, 0.0), 1.0)

        chunk_pool = _ChunkProgressPool(n_sub_models, _on_chunk_fraction)
        progress_thread, stop_event = _start_progress_thread(
            job_id, start_time, JobStatus.PROCESSING.value, shared_progress
        )
        try:
            target_device = job.device
            if target_device == "directml":
                import torch_directml
                target_device = torch_directml.device()

            sources = apply_model(
                model,
                wav[None],
                device=target_device,
                overlap=job.overlap,
                segment=job.segment_duration,
                split=True,
                progress=False,
                num_workers=0,
                pool=chunk_pool,
            )[0]
        finally:
            stop_event.set()
            progress_thread.join(timeout=1.0)

        if cancel_event.is_set():
            update_progress(JobStatus.CANCELLED.value, 0.0)
            return

        update_progress(JobStatus.SAVING.value, 80.0)

        sources *= ref.std().clamp_min(1e-8)
        sources += ref.mean()

        model_stems = (
            list(model.sources)
            if hasattr(model, "sources")
            else get_model_stems(job.model)
        )
        requested_stems = [s for s in job.stems.split(",") if s]
        stem_paths: dict[str, str] = {}

        if job.two_stem:
            if job.two_stem not in model_stems:
                raise ValueError(
                    f"Stem '{job.two_stem}' is not available in model {job.model}"
                )
            stem_idx = model_stems.index(job.two_stem)
            other = torch.zeros_like(sources[0])
            for idx, _ in enumerate(model_stems):
                if idx == stem_idx:
                    continue
                other += sources[idx]

            stem_path = output_dir / f"{job.two_stem}.wav"
            _save_wav(sources[stem_idx], stem_path, model_samplerate)
            stem_paths[job.two_stem] = str(stem_path)

            other_name = f"no_{job.two_stem}"
            other_path = output_dir / f"{other_name}.wav"
            _save_wav(other, other_path, model_samplerate)
            stem_paths[other_name] = str(other_path)
        else:
            for idx, stem_name in enumerate(model_stems):
                if stem_name not in requested_stems:
                    continue
                if idx >= sources.shape[0]:
                    continue
                stem_path = output_dir / f"{stem_name}.wav"
                _save_wav(sources[idx], stem_path, model_samplerate)
                stem_paths[stem_name] = str(stem_path)

        update_progress(JobStatus.COMPLETED.value, 100.0)

        db = SessionLocal()
        try:
            db_job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
            if db_job:
                db_job.result_dir = str(output_dir)
                db_job.stem_paths = json.dumps(stem_paths)
                db.commit()
        finally:
            db.close()

    except Exception as exc:  # noqa: BLE001
        # Surface the full stack in the backend logs (Tauri captures stderr) so
        # the exact separation failure is diagnosable, not just the DB message.
        import traceback

        print(f"[separator] job {job_id} failed: {exc}", flush=True)
        traceback.print_exc()

        elapsed = time.time() - start_time
        db = SessionLocal()
        try:
            db_job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
            if db_job:
                db_job.status = JobStatus.FAILED.value
                db_job.error_message = str(exc)
                db_job.elapsed_seconds = elapsed
                db.commit()
        finally:
            db.close()


def _run_batch_worker(batch_id: str, job_ids: list[str], cancel_event) -> None:
    """Child-process entry point that runs jobs sequentially."""
    total = len(job_ids)
    _update_batch_status(batch_id, JobStatus.PROCESSING.value, 0.0)

    completed = 0
    failed = 0
    for idx, job_id in enumerate(job_ids):
        if cancel_event.is_set():
            _update_status(job_id, JobStatus.CANCELLED.value, 0.0)
            continue

        _run_separation_worker(job_id, cancel_event)

        db = SessionLocal()
        try:
            job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
            if job:
                if job.status == JobStatus.COMPLETED.value:
                    completed += 1
                elif job.status == JobStatus.FAILED.value:
                    failed += 1
        finally:
            db.close()

        batch_progress = ((idx + 1) / total) * 100.0 if total else 100.0
        _update_batch_status(
            batch_id,
            JobStatus.PROCESSING.value,
            batch_progress,
            completed_jobs=completed,
            failed_jobs=failed,
        )

    final_status = JobStatus.COMPLETED.value if failed == 0 else JobStatus.FAILED.value
    if cancel_event.is_set():
        final_status = JobStatus.CANCELLED.value
    _update_batch_status(batch_id, final_status, 100.0, completed_jobs=completed, failed_jobs=failed)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _ChunkProgressPool:
    """Drop-in for demucs's DummyPoolExecutor that reports real chunk progress.

    ``apply_model``'s split branch submits every chunk of a (sub-)model before
    pulling any result, and with a lazy pool the forward pass runs inside
    ``result()``. For a BagOfModels each sub-model forms one sequential group
    of submissions, detectable as "a submit arriving when everything submitted
    so far has already finished". Same-thread, sequential — identical output
    to the DummyPoolExecutor demucs would otherwise use.
    """

    def __init__(self, total_groups: int, on_fraction) -> None:
        self._total_groups = max(1, total_groups)
        self._on_fraction = on_fraction
        self._groups_done = 0
        self._submitted = 0  # within the current group
        self._done = 0  # within the current group

    def submit(self, func, *args, **kwargs):
        if self._submitted and self._done == self._submitted:
            self._groups_done += 1
            self._submitted = 0
            self._done = 0
        self._submitted += 1
        return _LazyChunkResult(self, func, args, kwargs)

    def _chunk_done(self) -> None:
        self._done += 1
        fraction = (
            self._groups_done + self._done / max(1, self._submitted)
        ) / self._total_groups
        self._on_fraction(min(fraction, 1.0))


class _LazyChunkResult:
    def __init__(self, pool: _ChunkProgressPool, func, args, kwargs) -> None:
        self._pool = pool
        self._func = func
        self._args = args
        self._kwargs = kwargs

    def result(self):
        out = self._func(*self._args, **self._kwargs)
        self._pool._chunk_done()
        return out


def _start_progress_thread(
    job_id: str,
    start_time: float,
    status: str,
    shared_progress: dict,
) -> tuple[threading.Thread, threading.Event]:
    """Persist the latest chunk progress with fresh elapsed time and ETA every second."""
    stop_event = threading.Event()

    def loop() -> None:
        while not stop_event.is_set():
            elapsed = time.time() - start_time
            progress = shared_progress["value"]
            eta = _estimate_eta(elapsed, progress)
            _update_status(job_id, status, progress, elapsed, eta)
            stop_event.wait(timeout=1.0)

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return thread, stop_event


def _estimate_eta(elapsed: float, progress: float) -> float | None:
    if progress <= 0 or progress >= 100:
        return None
    rate = progress / elapsed if elapsed > 0 else 0.0
    return (100.0 - progress) / rate if rate > 0 else None


def _update_status(
    job_id: str,
    status: str,
    progress: float,
    elapsed: float | None = None,
    eta: float | None = None,
) -> None:
    db = SessionLocal()
    try:
        job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
        if job:
            job.status = status
            job.progress = progress
            if elapsed is not None:
                job.elapsed_seconds = elapsed
            job.eta_seconds = eta
            job.updated_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()


def _mark_error(job_id: str, message: str) -> None:
    """Persist an error message on a job (used when a worker never starts)."""
    db = SessionLocal()
    try:
        job = db.query(SeparationJob).filter(SeparationJob.id == job_id).first()
        if job:
            job.error_message = message
            job.updated_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()


def _update_batch_status(
    batch_id: str,
    status: str,
    progress: float,
    completed_jobs: int | None = None,
    failed_jobs: int | None = None,
) -> None:
    db = SessionLocal()
    try:
        batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
        if batch:
            batch.status = status
            batch.progress = progress
            if completed_jobs is not None:
                batch.completed_jobs = completed_jobs
            if failed_jobs is not None:
                batch.failed_jobs = failed_jobs
            batch.updated_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()
