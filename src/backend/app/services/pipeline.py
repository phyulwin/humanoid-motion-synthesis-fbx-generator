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
from app.services.k2_client import K2ReasoningClient, MotionReasoningResult


class MotionPipeline:
    # This class handles video normalization, pose extraction, preview generation, and review asset preparation.
    def __init__(self, settings: Settings, store: JsonJobStore) -> None:
        # This constructor keeps shared settings and the persistent job store.
        self.settings = settings
        self.store = store
        self._threads: dict[str, threading.Thread] = {}
        self.k2_client = K2ReasoningClient(settings)

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
            normalized_path = self._normalize_video(job, upload_path, job.settings.frame_rate)

            self.store.update_job(
                job_id,
                progress=30,
                message="Extracting pose landmarks from motion clip.",
            )
            thumbnail_url = self._extract_thumbnail(job.id, normalized_path)
            preview_frames, extraction_status, occlusion_masks = self._extract_pose_preview(job, normalized_path)

            self.store.update_job(
                job_id,
                progress=65,
                message="Running K2 reasoning and building review-ready motion preview.",
            )
            reasoning_result, reasoning_status = self._run_reasoning(preview_frames, job.settings.frame_rate, occlusion_masks)
            preview_frames = self._repair_occluded_joints(preview_frames, occlusion_masks, reasoning_result)
            preview_frames = self._apply_reasoning_cleanup(preview_frames, reasoning_result)
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
                reasoning_summary=reasoning_result.summary if reasoning_result else reasoning_status,
                reasoning_actions=(reasoning_result.actions if reasoning_result else []) + [extraction_status],
                reasoning_model=self.settings.k2_model_name if reasoning_result else None,
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

    def _resolve_trim_window(self, job: JobRecord) -> tuple[float, float]:
        # This helper converts UI trim values into a safe FFmpeg start time and duration.
        trim_start = max(0.0, float(job.settings.trim_start or 0.0))
        trim_end = max(trim_start, float(job.settings.trim_end or trim_start))
        trim_duration = max(0.1, trim_end - trim_start)
        return trim_start, trim_duration

    def _normalize_video(self, job: JobRecord, upload_path: Path, frame_rate: int) -> Path:
        # This helper tries to normalize the video with FFmpeg and falls back to the original file if unavailable.
        ffmpeg_path = self._resolve_executable(self.settings.ffmpeg_executable)
        if not ffmpeg_path:
            return upload_path

        trim_start, trim_duration = self._resolve_trim_window(job)
        output_path = self.settings.uploads_path / f"{job.id}_normalized.mp4"
        command = [
            ffmpeg_path,
            "-y",
            "-ss",
            f"{trim_start:.3f}",
            "-t",
            f"{trim_duration:.3f}",
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

    def _extract_pose_preview(self, job: JobRecord, video_path: Path) -> tuple[list[PreviewFrame], str, list[dict[str, bool]]]:
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
                model_complexity=2,
                smooth_landmarks=True,
                enable_segmentation=False,
            )
            extracted_frames: list[PreviewFrame] = []
            occlusion_masks: list[dict[str, bool]] = []
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
                if result.pose_world_landmarks:
                    normalized = self._normalize_landmarks(result.pose_world_landmarks.landmark, use_world_space=True)
                    extracted_frames.append(
                        PreviewFrame(
                            t=round(frame_index / max(fps, 1.0), 4),
                            joints=normalized,
                        )
                    )
                    occlusion_masks.append(
                        self._build_occlusion_mask(result.pose_landmarks.landmark if result.pose_landmarks else result.pose_world_landmarks.landmark)
                    )
                elif result.pose_landmarks:
                    normalized = self._normalize_landmarks(result.pose_landmarks.landmark, use_world_space=False)
                    extracted_frames.append(
                        PreviewFrame(
                            t=round(frame_index / max(fps, 1.0), 4),
                            joints=normalized,
                        )
                    )
                    occlusion_masks.append(self._build_occlusion_mask(result.pose_landmarks.landmark))
                frame_index += 1
                if len(extracted_frames) >= max_frames:
                    break

            capture.release()
            pose.close()

            if extracted_frames:
                return extracted_frames, "Pose source: MediaPipe extraction.", occlusion_masks
        except Exception:
            pass

        return (
            self._generate_fallback_motion(job.settings.frame_rate, job.settings.trim_start, job.settings.trim_end),
            "Pose source: synthetic fallback motion.",
            [],
        )

    def _build_occlusion_mask(self, landmarks) -> dict[str, bool]:
        # This helper flags joints with weak visibility so they can be repaired from context.
        def visibility(index: int) -> float:
            selected = landmarks[index]
            return float(getattr(selected, "visibility", 1.0))

        visibility_threshold = 0.55
        joint_visibility = {
            "head": visibility(0),
            "neck": (visibility(11) + visibility(12)) / 2.0,
            "chest": (visibility(11) + visibility(12) + visibility(23) + visibility(24)) / 4.0,
            "spine": (visibility(11) + visibility(12) + visibility(23) + visibility(24)) / 4.0,
            "left_shoulder": visibility(11),
            "right_shoulder": visibility(12),
            "left_elbow": visibility(13),
            "right_elbow": visibility(14),
            "left_hand": visibility(15),
            "right_hand": visibility(16),
            "hips": (visibility(23) + visibility(24)) / 2.0,
            "left_knee": visibility(25),
            "right_knee": visibility(26),
            "left_foot": visibility(27),
            "right_foot": visibility(28),
            "left_heel": visibility(29),
            "right_heel": visibility(30),
            "left_toe": visibility(31),
            "right_toe": visibility(32),
        }
        return {joint_name: visibility_value < visibility_threshold for joint_name, visibility_value in joint_visibility.items()}

    def _normalize_landmarks(self, landmarks, use_world_space: bool) -> dict[str, JointPoint]:
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
        spine = (hips + neck) / 2.0
        chest = (spine + neck) / 2.0
        scale = np.linalg.norm(left_shoulder - right_shoulder)
        if scale <= 0.0001:
            scale = 0.25

        joint_lookup = {
            "head": point(0),
            "neck": neck,
            "chest": chest,
            "spine": spine,
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
            "left_heel": point(29),
            "right_heel": point(30),
            "left_toe": point(31),
            "right_toe": point(32),
        }

        normalized: dict[str, JointPoint] = {}
        for name, coordinates in joint_lookup.items():
            centered = (coordinates - hips) / scale
            y_value = float(centered[1] * 2.4)
            if not use_world_space:
                y_value = -y_value
            normalized[name] = JointPoint(
                x=round(float(centered[0] * 2.4), 4),
                y=round(y_value, 4),
                z=round(float(centered[2] * 2.4), 4),
            )
        return normalized

    def _generate_fallback_motion(self, frame_rate: int, trim_start: float, trim_end: float) -> list[PreviewFrame]:
        # This helper generates a synthetic dance loop so the UI remains demoable without CV dependencies.
        preview_frames: list[PreviewFrame] = []
        safe_start = max(0.0, float(trim_start or 0.0))
        safe_end = max(safe_start, float(trim_end or safe_start))
        clip_duration = max(0.1, safe_end - safe_start)
        total_frames = max(2, min(48, int(round(clip_duration * max(frame_rate, 1)))))
        for index in range(total_frames):
            progress = index / max(total_frames - 1, 1)
            sway = math.sin(progress * math.pi * 4.0)
            lift = math.cos(progress * math.pi * 2.0)
            travel = math.sin(progress * math.pi * 2.0)
            preview_frames.append(
                PreviewFrame(
                    t=round(safe_start + (index / max(frame_rate, 1)), 4),
                    joints={
                        "head": JointPoint(x=0.0, y=2.4 + (lift * 0.08), z=0.05 * sway),
                        "neck": JointPoint(x=0.0, y=1.85, z=0.0),
                        "chest": JointPoint(x=0.0, y=1.45 + (0.08 * lift), z=0.05 * sway),
                        "spine": JointPoint(x=0.0, y=1.1 + (0.06 * lift), z=0.04 * sway),
                        "left_shoulder": JointPoint(x=-0.65, y=1.75, z=0.0),
                        "right_shoulder": JointPoint(x=0.65, y=1.75, z=0.0),
                        "left_elbow": JointPoint(x=-1.05, y=1.2 + (0.2 * lift), z=0.08),
                        "right_elbow": JointPoint(x=1.05, y=1.2 - (0.2 * lift), z=-0.08),
                        "left_hand": JointPoint(x=-1.35, y=0.8 + (0.6 * sway), z=0.18),
                        "right_hand": JointPoint(x=1.35, y=0.8 - (0.6 * sway), z=-0.18),
                        "hips": JointPoint(x=0.32 * sway, y=0.7 + (0.12 * lift), z=0.16 * travel),
                        "left_knee": JointPoint(x=-0.42, y=-0.4 + (0.24 * sway), z=0.06 * travel),
                        "right_knee": JointPoint(x=0.42, y=-0.4 - (0.24 * sway), z=-0.06 * travel),
                        "left_foot": JointPoint(x=-0.58, y=-1.5 + (0.05 * lift), z=0.26 * sway),
                        "right_foot": JointPoint(x=0.58, y=-1.5 - (0.05 * lift), z=-0.26 * sway),
                        "left_heel": JointPoint(x=-0.5, y=-1.56 + (0.04 * lift), z=0.16 * sway),
                        "right_heel": JointPoint(x=0.5, y=-1.56 - (0.04 * lift), z=-0.16 * sway),
                        "left_toe": JointPoint(x=-0.68, y=-1.48 + (0.05 * lift), z=0.38 * sway),
                        "right_toe": JointPoint(x=0.68, y=-1.48 - (0.05 * lift), z=-0.38 * sway),
                    },
                )
            )
        return preview_frames

    def _run_reasoning(
        self,
        preview_frames: list[PreviewFrame],
        frame_rate: int,
        occlusion_masks: list[dict[str, bool]],
    ) -> tuple[MotionReasoningResult | None, str]:
        # This helper asks K2 for cleanup policy and falls back quietly if the API is unavailable.
        if not self.k2_client.is_enabled():
            return None, "K2 Think V2 skipped: missing API key or disabled configuration."

        try:
            reasoning_result = self.k2_client.analyze_motion(preview_frames, frame_rate, occlusion_masks)
            if reasoning_result is None:
                return None, "K2 Think V2 skipped: no reasoning result returned."
            return reasoning_result, "K2 Think V2 completed."
        except Exception as exc:
            return None, f"K2 Think V2 failed: {exc}"

    def _repair_occluded_joints(
        self,
        preview_frames: list[PreviewFrame],
        occlusion_masks: list[dict[str, bool]],
        reasoning_result: MotionReasoningResult | None,
    ) -> list[PreviewFrame]:
        # This helper replaces low-visibility joints using K2 fills first, then temporal or mirrored fallback.
        if not preview_frames or not occlusion_masks:
            return preview_frames

        repaired_frames: list[PreviewFrame] = []
        mirror_joint_map = {
            "left_shoulder": "right_shoulder",
            "right_shoulder": "left_shoulder",
            "left_elbow": "right_elbow",
            "right_elbow": "left_elbow",
            "left_hand": "right_hand",
            "right_hand": "left_hand",
            "left_knee": "right_knee",
            "right_knee": "left_knee",
            "left_foot": "right_foot",
            "right_foot": "left_foot",
            "left_heel": "right_heel",
            "right_heel": "left_heel",
            "left_toe": "right_toe",
            "right_toe": "left_toe",
        }

        for frame_index, frame in enumerate(preview_frames):
            updated_joints = dict(frame.joints)
            occlusion_mask = occlusion_masks[frame_index] if frame_index < len(occlusion_masks) else {}
            for joint_name, is_occluded in occlusion_mask.items():
                if not is_occluded:
                    continue

                replacement_joint = self._resolve_joint_fill(
                    preview_frames,
                    frame_index,
                    joint_name,
                    mirror_joint_map,
                    reasoning_result,
                )
                if replacement_joint is not None:
                    updated_joints[joint_name] = replacement_joint

            repaired_frames.append(PreviewFrame(t=frame.t, joints=updated_joints))

        return repaired_frames

    def _resolve_joint_fill(
        self,
        preview_frames: list[PreviewFrame],
        frame_index: int,
        joint_name: str,
        mirror_joint_map: dict[str, str],
        reasoning_result: MotionReasoningResult | None,
    ) -> JointPoint | None:
        # This helper fills an occluded joint from K2 output, temporal neighbors, or mirrored body context.
        if reasoning_result and frame_index in reasoning_result.occluded_joint_fills:
            frame_fills = reasoning_result.occluded_joint_fills[frame_index]
            if joint_name in frame_fills:
                joint_fill = frame_fills[joint_name]
                return JointPoint(x=round(joint_fill["x"], 4), y=round(joint_fill["y"], 4), z=round(joint_fill["z"], 4))

        previous_joint = None
        next_joint = None

        for candidate_index in range(frame_index - 1, -1, -1):
            candidate_joint = preview_frames[candidate_index].joints.get(joint_name)
            if candidate_joint is not None:
                previous_joint = candidate_joint
                break

        for candidate_index in range(frame_index + 1, len(preview_frames)):
            candidate_joint = preview_frames[candidate_index].joints.get(joint_name)
            if candidate_joint is not None:
                next_joint = candidate_joint
                break

        if previous_joint and next_joint:
            return JointPoint(
                x=round((previous_joint.x + next_joint.x) / 2.0, 4),
                y=round((previous_joint.y + next_joint.y) / 2.0, 4),
                z=round((previous_joint.z + next_joint.z) / 2.0, 4),
            )

        if previous_joint:
            return previous_joint

        if next_joint:
            return next_joint

        mirrored_joint_name = mirror_joint_map.get(joint_name)
        if mirrored_joint_name:
            mirrored_joint = preview_frames[frame_index].joints.get(mirrored_joint_name)
            if mirrored_joint is not None:
                return JointPoint(
                    x=round(-mirrored_joint.x, 4),
                    y=round(mirrored_joint.y, 4),
                    z=round(mirrored_joint.z, 4),
                )

        return None

    def _apply_reasoning_cleanup(
        self,
        preview_frames: list[PreviewFrame],
        reasoning_result: MotionReasoningResult | None,
    ) -> list[PreviewFrame]:
        # This helper applies deterministic cleanup chosen by K2 so the reasoning model materially affects output.
        if not preview_frames:
            return preview_frames

        arm_boost = reasoning_result.arm_boost if reasoning_result else 1.18
        leg_boost = reasoning_result.leg_boost if reasoning_result else 1.08
        hip_sway_boost = reasoning_result.hip_sway_boost if reasoning_result else 1.1
        shoulder_sway_boost = reasoning_result.shoulder_sway_boost if reasoning_result else 1.08
        head_bounce_boost = reasoning_result.head_bounce_boost if reasoning_result else 1.04
        smoothing_window = reasoning_result.smoothing_window if reasoning_result else 3

        enhanced_frames: list[PreviewFrame] = []
        for frame in preview_frames:
            updated_joints: dict[str, JointPoint] = {}
            for joint_name, joint in frame.joints.items():
                x_value = joint.x
                y_value = joint.y
                z_value = joint.z

                if joint_name in {"left_hand", "right_hand", "left_elbow", "right_elbow"}:
                    x_value *= arm_boost
                    z_value *= arm_boost

                if joint_name in {"left_shoulder", "right_shoulder"}:
                    x_value *= shoulder_sway_boost
                    z_value *= shoulder_sway_boost

                if joint_name in {"left_foot", "right_foot", "left_knee", "right_knee"}:
                    x_value *= leg_boost
                    z_value *= leg_boost

                if joint_name == "hips":
                    x_value *= hip_sway_boost
                    y_value = ((y_value - 0.7) * max(1.0, hip_sway_boost * 0.9)) + 0.7
                    z_value *= max(1.0, hip_sway_boost * 0.85)

                if joint_name == "head":
                    y_value *= head_bounce_boost
                    z_value *= head_bounce_boost

                updated_joints[joint_name] = JointPoint(
                    x=round(x_value, 4),
                    y=round(y_value, 4),
                    z=round(z_value, 4),
                )

            enhanced_frames.append(PreviewFrame(t=frame.t, joints=updated_joints))

        return self._smooth_frames(enhanced_frames, smoothing_window)

    def _smooth_frames(self, preview_frames: list[PreviewFrame], window_size: int) -> list[PreviewFrame]:
        # This helper applies moving-average smoothing to reduce jitter after amplitude corrections.
        if window_size <= 1 or len(preview_frames) < 3:
            return preview_frames

        smoothed_frames: list[PreviewFrame] = []
        total_frames = len(preview_frames)
        for index, frame in enumerate(preview_frames):
            start_index = max(0, index - (window_size // 2))
            end_index = min(total_frames, index + (window_size // 2) + 1)
            window = preview_frames[start_index:end_index]
            smoothed_joints: dict[str, JointPoint] = {}

            for joint_name in frame.joints:
                x_total = 0.0
                y_total = 0.0
                z_total = 0.0
                for item in window:
                    joint = item.joints[joint_name]
                    x_total += joint.x
                    y_total += joint.y
                    z_total += joint.z
                divisor = float(len(window))
                smoothed_joints[joint_name] = JointPoint(
                    x=round(x_total / divisor, 4),
                    y=round(y_total / divisor, 4),
                    z=round(z_total / divisor, 4),
                )

            smoothed_frames.append(PreviewFrame(t=frame.t, joints=smoothed_joints))
        return smoothed_frames

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
