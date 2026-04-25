# File: kinetix-studio/backend/app/services/pipeline.py
# This file runs the upload-to-preview motion pipeline in background threads.

import math
import shutil
import subprocess
import threading
from pathlib import Path

import numpy as np

from app.config import Settings
from app.models import JobRecord, JobStage, JobStatus, JointPoint, PreviewFrame
from app.services.job_store import JsonJobStore


class MotionPipeline:
    # This class handles video normalization, pose extraction, preview generation, and review asset preparation.
    def __init__(self, settings: Settings, store: JsonJobStore) -> None:
        # This constructor keeps shared settings and the persistent job store.
        self.settings = settings
        self.store = store
        self._threads: dict[str, threading.Thread] = {}

    def start_processing(self, job_id: str) -> None:
        # This method launches the background worker for a queued job.
        if job_id in self._threads and self._threads[job_id].is_alive():
            return
        worker = threading.Thread(target=self._process_job, args=(job_id,), daemon=True)
        self._threads[job_id] = worker
        worker.start()

    def _process_job(self, job_id: str) -> None:
        # This method executes the full processing flow and updates job status along the way.
        try:
            job = self.store.update_job(
                job_id,
                stage=JobStage.process,
                status=JobStatus.processing,
                progress=10,
                message="Normalizing uploaded video.",
                error=None,
            )
            upload_path = self._resolve_upload_path(job)
            normalized_path = self._normalize_video(job.id, upload_path, job.settings.frame_rate)

            self.store.update_job(
                job_id,
                progress=30,
                message="Extracting pose landmarks from motion clip.",
            )
            thumbnail_url = self._extract_thumbnail(job.id, normalized_path)
            preview_frames = self._extract_pose_preview(job, normalized_path)

            self.store.update_job(
                job_id,
                progress=65,
                message="Building review-ready motion preview.",
            )
            waveform = self._build_waveform(preview_frames)
            motion_payload = {
                "frame_rate": job.settings.frame_rate,
                "loop_animation": job.settings.loop_animation,
                "preview_frames": [frame.model_dump(mode="json") for frame in preview_frames],
            }
            self.store.save_job_payload(job.id, "motion.json", motion_payload)

            self.store.update_job(
                job_id,
                stage=JobStage.review,
                status=JobStatus.ready,
                progress=100,
                message="Preview is ready. Export can now be requested.",
                thumbnail_url=thumbnail_url,
                preview_frames=preview_frames,
                waveform=waveform,
            )
        except Exception as exc:
            self.store.update_job(
                job_id,
                status=JobStatus.failed,
                progress=100,
                message="The motion pipeline failed.",
                error=str(exc),
            )

    def _resolve_upload_path(self, job: JobRecord) -> Path:
        # This helper maps the public upload URL back to the storage path on disk.
        if not job.upload_url:
            raise FileNotFoundError("Job does not contain an uploaded video path.")
        relative_path = job.upload_url.replace("/files/", "", 1)
        return self.settings.storage_path / relative_path

    def _normalize_video(self, job_id: str, upload_path: Path, frame_rate: int) -> Path:
        # This helper tries to normalize the video with FFmpeg and falls back to the original file if unavailable.
        ffmpeg_path = self._resolve_executable(self.settings.ffmpeg_executable)
        if not ffmpeg_path:
            return upload_path

        output_path = self.settings.uploads_path / f"{job_id}_normalized.mp4"
        command = [
            ffmpeg_path,
            "-y",
            "-i",
            str(upload_path),
            "-vf",
            f"fps={frame_rate},scale=960:-2",
            "-an",
            str(output_path),
        ]

        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            return output_path
        except Exception:
            return upload_path

    def _extract_thumbnail(self, job_id: str, video_path: Path) -> str | None:
        # This helper stores the first video frame as a thumbnail when OpenCV is available.
        try:
            import cv2

            capture = cv2.VideoCapture(str(video_path))
            success, frame = capture.read()
            capture.release()
            if not success:
                return None

            thumbnail_path = self.settings.jobs_path / f"{job_id}_thumbnail.jpg"
            cv2.imwrite(str(thumbnail_path), frame)
            return self.store.public_url(thumbnail_path)
        except Exception:
            return None

    def _extract_pose_preview(self, job: JobRecord, video_path: Path) -> list[PreviewFrame]:
        # This helper builds preview frames from MediaPipe when possible and falls back to synthetic motion otherwise.
        try:
            import cv2
            import mediapipe as mp

            capture = cv2.VideoCapture(str(video_path))
            fps = capture.get(cv2.CAP_PROP_FPS) or float(job.settings.frame_rate)
            total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            max_frames = 48
            stride = max(1, total_frames // max_frames) if total_frames else 2
            pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                enable_segmentation=False,
            )
            extracted_frames: list[PreviewFrame] = []
            frame_index = 0

            while capture.isOpened():
                success, frame = capture.read()
                if not success:
                    break
                if frame_index % stride != 0:
                    frame_index += 1
                    continue

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = pose.process(rgb_frame)
                if result.pose_landmarks:
                    normalized = self._normalize_landmarks(result.pose_landmarks.landmark)
                    extracted_frames.append(
                        PreviewFrame(
                            t=round(frame_index / max(fps, 1.0), 4),
                            joints=normalized,
                        )
                    )
                frame_index += 1
                if len(extracted_frames) >= max_frames:
                    break

            capture.release()
            pose.close()

            if extracted_frames:
                return extracted_frames
        except Exception:
            pass

        return self._generate_fallback_motion(job.settings.frame_rate)

    def _normalize_landmarks(self, landmarks) -> dict[str, JointPoint]:
        # This helper converts MediaPipe landmarks into a smaller normalized humanoid joint set.
        def point(index: int) -> np.ndarray:
            selected = landmarks[index]
            return np.array([selected.x, selected.y, selected.z], dtype=float)

        left_hip = point(23)
        right_hip = point(24)
        hips = (left_hip + right_hip) / 2.0
        left_shoulder = point(11)
        right_shoulder = point(12)
        neck = (left_shoulder + right_shoulder) / 2.0
        scale = np.linalg.norm(left_shoulder - right_shoulder)
        if scale <= 0.0001:
            scale = 0.25

        joint_lookup = {
            "head": point(0),
            "neck": neck,
            "left_shoulder": left_shoulder,
            "right_shoulder": right_shoulder,
            "left_elbow": point(13),
            "right_elbow": point(14),
            "left_hand": point(15),
            "right_hand": point(16),
            "hips": hips,
            "left_knee": point(25),
            "right_knee": point(26),
            "left_foot": point(27),
            "right_foot": point(28),
        }

        normalized: dict[str, JointPoint] = {}
        for name, coordinates in joint_lookup.items():
            centered = (coordinates - hips) / scale
            normalized[name] = JointPoint(
                x=round(float(centered[0] * 2.4), 4),
                y=round(float(-centered[1] * 2.4), 4),
                z=round(float(centered[2] * 2.4), 4),
            )
        return normalized

    def _generate_fallback_motion(self, frame_rate: int) -> list[PreviewFrame]:
        # This helper generates a synthetic dance loop so the UI remains demoable without CV dependencies.
        preview_frames: list[PreviewFrame] = []
        total_frames = 48
        for index in range(total_frames):
            progress = index / max(total_frames - 1, 1)
            sway = math.sin(progress * math.pi * 4.0)
            lift = math.cos(progress * math.pi * 2.0)
            preview_frames.append(
                PreviewFrame(
                    t=round(index / max(frame_rate, 1), 4),
                    joints={
                        "head": JointPoint(x=0.0, y=2.4 + (lift * 0.08), z=0.05 * sway),
                        "neck": JointPoint(x=0.0, y=1.85, z=0.0),
                        "left_shoulder": JointPoint(x=-0.65, y=1.75, z=0.0),
                        "right_shoulder": JointPoint(x=0.65, y=1.75, z=0.0),
                        "left_elbow": JointPoint(x=-1.05, y=1.2 + (0.2 * lift), z=0.08),
                        "right_elbow": JointPoint(x=1.05, y=1.2 - (0.2 * lift), z=-0.08),
                        "left_hand": JointPoint(x=-1.35, y=0.8 + (0.6 * sway), z=0.18),
                        "right_hand": JointPoint(x=1.35, y=0.8 - (0.6 * sway), z=-0.18),
                        "hips": JointPoint(x=0.18 * sway, y=0.7, z=0.0),
                        "left_knee": JointPoint(x=-0.4, y=-0.4 + (0.18 * sway), z=0.0),
                        "right_knee": JointPoint(x=0.4, y=-0.4 - (0.18 * sway), z=0.0),
                        "left_foot": JointPoint(x=-0.55, y=-1.5, z=0.18 * sway),
                        "right_foot": JointPoint(x=0.55, y=-1.5, z=-0.18 * sway),
                    },
                )
            )
        return preview_frames

    def _build_waveform(self, preview_frames: list[PreviewFrame]) -> list[float]:
        # This helper derives a simple motion-energy waveform for the timeline display.
        if len(preview_frames) < 2:
            return [0.0]

        waveform: list[float] = []
        previous_frame = preview_frames[0]
        for current_frame in preview_frames[1:]:
            energy = 0.0
            for joint_name, joint in current_frame.joints.items():
                previous_joint = previous_frame.joints[joint_name]
                energy += abs(joint.x - previous_joint.x)
                energy += abs(joint.y - previous_joint.y)
                energy += abs(joint.z - previous_joint.z)
            waveform.append(round(energy, 4))
            previous_frame = current_frame

        max_energy = max(waveform) if waveform else 1.0
        if max_energy <= 0:
            max_energy = 1.0
        return [round(value / max_energy, 4) for value in waveform]

    def _resolve_executable(self, executable_name: str) -> str | None:
        # This helper resolves an executable from either an absolute path or the current PATH.
        if executable_name and Path(executable_name).exists():
            return executable_name
        return shutil.which(executable_name) if executable_name else None