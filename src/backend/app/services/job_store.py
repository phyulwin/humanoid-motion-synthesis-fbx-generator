# File: kinetix-studio/backend/app/services/job_store.py
# This file manages job persistence, upload storage, and public file URLs.

import json
import threading
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import Settings
from app.models import JobRecord, JobSettings, JobStage, JobStatus, utc_now_iso


class JsonJobStore:
    # This class persists each job to a JSON file so the MVP stays simple and operational.
    def __init__(self, settings: Settings) -> None:
        # This constructor initializes the backing paths and a thread lock for safe writes.
        self.settings = settings
        self._lock = threading.Lock()

    def _job_path(self, job_id: str) -> Path:
        # This helper returns the JSON metadata path for a specific job.
        return self.settings.jobs_path / f"{job_id}.json"

    def _safe_filename(self, filename: str) -> str:
        # This helper normalizes uploaded filenames without using regular expressions.
        allowed = []
        for character in filename:
            if character.isalnum() or character in {"-", "_", "."}:
                allowed.append(character)
            else:
                allowed.append("_")
        safe_name = "".join(allowed).strip("._")
        return safe_name or "upload.mp4"

    def public_url(self, path: Path) -> str:
        # This helper converts an internal storage path to a URL served by FastAPI static files.
        relative_path = path.relative_to(self.settings.storage_path)
        return f"/files/{relative_path.as_posix()}"

    async def create_job(self, upload_file: UploadFile, job_settings: JobSettings) -> JobRecord:
        # This method creates a new job record and stores the uploaded video on disk.
        job_id = str(uuid.uuid4())
        safe_name = self._safe_filename(upload_file.filename or "upload.mp4")
        upload_path = self.settings.uploads_path / f"{job_id}_{safe_name}"

        with open(upload_path, "wb") as output_file:
            while True:
                chunk = await upload_file.read(1024 * 1024)
                if not chunk:
                    break
                output_file.write(chunk)

        job = JobRecord(
            id=job_id,
            filename=safe_name,
            stage=JobStage.upload,
            status=JobStatus.queued,
            progress=0,
            message="Upload received. Queueing motion pipeline.",
            settings=job_settings,
            upload_url=self.public_url(upload_path),
        )
        self.save_job(job)
        return job

    def get_job(self, job_id: str) -> JobRecord:
        # This method loads a job record from disk and rehydrates the Pydantic model.
        job_path = self._job_path(job_id)
        if not job_path.exists():
            raise FileNotFoundError(f"Job {job_id} does not exist.")
        payload = json.loads(job_path.read_text(encoding="utf-8"))
        return JobRecord.model_validate(payload)

    def save_job(self, job: JobRecord) -> JobRecord:
        # This method writes the full job record to disk using a lock for consistency.
        job.updated_at = utc_now_iso()
        with self._lock:
            self._job_path(job.id).write_text(
                json.dumps(job.model_dump(mode="json"), indent=2),
                encoding="utf-8",
            )
        return job

    def update_job(self, job_id: str, **changes) -> JobRecord:
        # This method applies field updates and persists the modified record.
        job = self.get_job(job_id)
        for key, value in changes.items():
            setattr(job, key, value)
        return self.save_job(job)

    def save_job_payload(self, job_id: str, file_name: str, payload: dict) -> Path:
        # This method stores structured job artifacts such as motion JSON or export payloads.
        payload_path = self.settings.jobs_path / f"{job_id}_{file_name}"
        payload_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload_path