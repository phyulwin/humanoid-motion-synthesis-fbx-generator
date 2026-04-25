# File: kinetix-studio/backend/app/models.py
# This file defines the API models and internal job records.

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    # This function returns a UTC timestamp string for consistent job metadata.
    return datetime.now(timezone.utc).isoformat()


class JobStatus(str, Enum):
    # This enum tracks the lifecycle status for a processing job.
    queued = "queued"
    processing = "processing"
    ready = "ready"
    exporting = "exporting"
    completed = "completed"
    failed = "failed"


class JobStage(str, Enum):
    # This enum tracks the current user-facing stage in the workflow.
    upload = "upload"
    process = "process"
    review = "review"
    export = "export"


class JobSettings(BaseModel):
    # This model captures the upload and export choices selected by the user.
    avatar_rig: str = "Mixamo Standard"
    frame_rate: int = 30
    trim_start: float = 0.0
    trim_end: float = 18.0
    loop_animation: bool = True


class JointPoint(BaseModel):
    # This model stores one normalized joint position in 3D space.
    x: float
    y: float
    z: float


class PreviewFrame(BaseModel):
    # This model stores a single animation frame with timestamped joint positions.
    t: float
    joints: dict[str, JointPoint]


class JobRecord(BaseModel):
    # This model is the main record returned by the backend for each processing job.
    id: str
    filename: str
    stage: JobStage
    status: JobStatus
    progress: int = Field(default=0, ge=0, le=100)
    message: str = ""
    settings: JobSettings
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    upload_url: str | None = None
    thumbnail_url: str | None = None
    export_url: str | None = None
    preview_frames: list[PreviewFrame] = Field(default_factory=list)
    waveform: list[float] = Field(default_factory=list)
    reasoning_summary: str | None = None
    reasoning_actions: list[str] = Field(default_factory=list)
    reasoning_model: str | None = None
    error: str | None = None