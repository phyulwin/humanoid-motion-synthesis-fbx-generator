# File: kinetix-studio/backend/app/services/export_service.py
# This file manages asynchronous FBX export jobs through Blender headless mode.

import shutil
import subprocess
import threading
from pathlib import Path

from app.config import Settings
from app.models import JobStage, JobStatus
from app.services.job_store import JsonJobStore


class ExportService:
    # This class launches Blender export jobs and writes final FBX paths back into the job store.
    def __init__(self, settings: Settings, store: JsonJobStore) -> None:
        # This constructor stores shared dependencies for background export operations.
        self.settings = settings
        self.store = store
        self._threads: dict[str, threading.Thread] = {}

    def start_export(self, job_id: str) -> None:
        # This method starts a background export worker if one is not already active.
        if job_id in self._threads and self._threads[job_id].is_alive():
            return
        worker = threading.Thread(target=self._export_job, args=(job_id,), daemon=True)
        self._threads[job_id] = worker
        worker.start()

    def _export_job(self, job_id: str) -> None:
        # This method validates the Blender environment and executes the FBX export script.
        try:
            job = self.store.get_job(job_id)
            if not job.preview_frames:
                raise ValueError("Preview frames are missing. Run processing before export.")

            blender_path = self._resolve_blender()
            template_path = self.settings.blender_template_path
            script_path = Path(__file__).resolve().parents[1] / "scripts" / "export_fbx.py"
            if not template_path.exists():
                raise FileNotFoundError(
                    f"Blender template not found at {template_path}. Create backend/assets/mixamo_template.blend first."
                )

            self.store.update_job(
                job_id,
                stage=JobStage.export,
                status=JobStatus.exporting,
                progress=92,
                message="Exporting FBX through Blender headless mode.",
                error=None,
            )

            payload_path = self.store.save_job_payload(
                job_id,
                "export_motion.json",
                {
                    "frame_rate": job.settings.frame_rate or self.settings.default_export_fps,
                    "preview_frames": [frame.model_dump(mode="json") for frame in job.preview_frames],
                },
            )
            output_path = self.settings.exports_path / f"{job_id}.fbx"

            command = [
                blender_path,
                "-b",
                str(template_path),
                "-P",
                str(script_path),
                "--",
                str(payload_path),
                str(output_path),
                str(job.settings.frame_rate or self.settings.default_export_fps),
                self.settings.blender_bone_prefix,
            ]
            subprocess.run(command, check=True, capture_output=True)

            self.store.update_job(
                job_id,
                status=JobStatus.completed,
                progress=100,
                message="FBX export complete.",
                export_url=self.store.public_url(output_path),
            )
        except Exception as exc:
            self.store.update_job(
                job_id,
                status=JobStatus.failed,
                progress=100,
                message="FBX export failed.",
                error=str(exc),
            )

    def _resolve_blender(self) -> str:
        # This helper resolves the Blender executable from config or the system PATH.
        if self.settings.blender_executable and Path(self.settings.blender_executable).exists():
            return self.settings.blender_executable

        detected = shutil.which("blender")
        if detected:
            return detected
        raise FileNotFoundError(
            "Blender executable not found. Set BLENDER_EXECUTABLE in backend/.env or add Blender to PATH."
        )
