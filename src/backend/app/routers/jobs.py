# File: kinetix-studio/backend/app/routers/jobs.py
# This file exposes the API endpoints for upload, polling, and FBX export.

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.models import JobSettings, JobStage, JobStatus


router = APIRouter()


def parse_bool(value: str) -> bool:
    # This helper converts form booleans into Python booleans using a conservative rule set.
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}


@router.post("")
async def create_job(
    request: Request,
    file: UploadFile = File(...),
    avatar_rig: str = Form("Mixamo Standard"),
    frame_rate: int = Form(30),
    trim_start: float = Form(0.0),
    trim_end: float = Form(18.0),
    loop_animation: str = Form("true"),
):
    # This endpoint accepts the uploaded video and enqueues a new processing job.
    if not file.filename:
        raise HTTPException(status_code=400, detail="A video file is required.")

    settings = JobSettings(
        avatar_rig=avatar_rig,
        frame_rate=frame_rate,
        trim_start=trim_start,
        trim_end=trim_end,
        loop_animation=parse_bool(loop_animation),
    )
    job = await request.app.state.store.create_job(file, settings)
    request.app.state.pipeline.start_processing(job.id)
    return job.model_dump(mode="json")


@router.get("/{job_id}")
def get_job(job_id: str, request: Request):
    # This endpoint returns the latest state of a processing job for polling clients.
    try:
        job = request.app.state.store.get_job(job_id)
        return job.model_dump(mode="json")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{job_id}/export")
def export_job(job_id: str, request: Request):
    # This endpoint starts a Blender export for a processed job.
    try:
        job = request.app.state.store.get_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not job.preview_frames:
        raise HTTPException(status_code=400, detail="Preview frames are missing. Process the video first.")

    request.app.state.export_service.start_export(job_id)
    updated_job = request.app.state.store.update_job(
        job_id,
        stage=JobStage.export,
        status=JobStatus.exporting,
        progress=90,
        message="Export request accepted. Blender worker is starting.",
    )
    return updated_job.model_dump(mode="json")