# File: kinetix-studio/backend/app/services/k2_client.py
# This file calls K2 Think V2 and converts its reasoning output into motion cleanup directives.

import json
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.models import PreviewFrame


@dataclass
class MotionReasoningResult:
    # This class stores the normalized reasoning response used by the motion pipeline.
    summary: str
    actions: list[str]
    arm_boost: float
    leg_boost: float
    hip_sway_boost: float
    shoulder_sway_boost: float
    head_bounce_boost: float
    smoothing_window: int
    confidence: str
    raw_response: str


class K2ReasoningClient:
    # This class sends compact motion summaries to K2 Think V2 and parses the returned directives.
    def __init__(self, settings: Settings) -> None:
        # This constructor stores shared settings for later API calls.
        self.settings = settings

    def is_enabled(self) -> bool:
        # This method returns True only when the K2 integration is configured for execution.
        return self.settings.k2_enabled and bool(self.settings.k2_api_key.strip())

    def analyze_motion(self, preview_frames: list[PreviewFrame], frame_rate: int) -> MotionReasoningResult | None:
        # This method submits a compact motion sample to K2 Think V2 and returns parsed cleanup directives.
        if not self.is_enabled() or not preview_frames:
            return None

        payload = self._build_payload(preview_frames, frame_rate)
        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {self.settings.k2_api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=self.settings.k2_timeout_seconds) as client:
            response = client.post(self.settings.k2_base_url, headers=headers, json=payload)
            response.raise_for_status()
            response_json = response.json()

        content = self._extract_message_content(response_json)
        return self._parse_reasoning(content)

    def _build_payload(self, preview_frames: list[PreviewFrame], frame_rate: int) -> dict:
        # This method builds a small JSON prompt that keeps K2 focused on correction policy rather than raw inference.
        sampled_frames = self._sample_frames(preview_frames)
        compact_frames = []
        for frame in sampled_frames:
            compact_frames.append(
                {
                    "t": frame.t,
                    "joints": {
                        name: {
                            "x": round(joint.x, 3),
                            "y": round(joint.y, 3),
                            "z": round(joint.z, 3),
                        }
                        for name, joint in frame.joints.items()
                    },
                }
            )

        instructions = (
            "You are reviewing dance motion data for humanoid FBX export. "
            "Return strict JSON only. "
            "Decide how to improve readability of arms, legs, torso sway, shoulder sway, head bounce, and temporal smoothness. "
            "Do not invent new joints. "
            "JSON schema: "
            "{\"summary\": string, "
            "\"actions\": string[], "
            "\"arm_boost\": number between 0.8 and 1.8, "
            "\"leg_boost\": number between 0.8 and 1.6, "
            "\"hip_sway_boost\": number between 0.8 and 1.8, "
            "\"shoulder_sway_boost\": number between 0.8 and 1.8, "
            "\"head_bounce_boost\": number between 0.8 and 1.6, "
            "\"smoothing_window\": integer between 1 and 7, "
            "\"confidence\": \"low\"|\"medium\"|\"high\"}."
        )

        return {
            "model": self.settings.k2_model_name,
            "stream": False,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": instructions,
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "frame_rate": frame_rate,
                            "frame_count": len(preview_frames),
                            "sampled_frames": compact_frames,
                        }
                    ),
                },
            ],
        }

    def _sample_frames(self, preview_frames: list[PreviewFrame]) -> list[PreviewFrame]:
        # This method reduces the motion sequence to a manageable sample for reasoning.
        if len(preview_frames) <= 8:
            return preview_frames
        step = max(1, len(preview_frames) // 8)
        sampled = [preview_frames[index] for index in range(0, len(preview_frames), step)]
        return sampled[:8]

    def _extract_message_content(self, response_json: dict) -> str:
        # This method reads the assistant content from a chat completions response.
        choices = response_json.get("choices", [])
        if not choices:
            raise ValueError("K2 response did not contain any choices.")
        selected_choice = choices[0]
        message = selected_choice.get("message", {})
        content = message.get("content", "")
        if not content and isinstance(selected_choice.get("text"), str):
            content = selected_choice.get("text", "")
        if isinstance(content, list):
            combined_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    combined_parts.append(item.get("text", ""))
            content = "".join(combined_parts)
        if not isinstance(content, str) or not content.strip():
            raise ValueError("K2 response content was empty.")
        return content.strip()

    def _parse_reasoning(self, content: str) -> MotionReasoningResult:
        # This method parses the K2 JSON response and normalizes values for downstream cleanup.
        normalized_content = content.strip()
        if normalized_content.startswith("```"):
            lines = normalized_content.splitlines()
            normalized_content = "\n".join(line for line in lines if not line.startswith("```")).strip()

        try:
            response_payload = json.loads(normalized_content)
        except json.JSONDecodeError:
            json_start = normalized_content.find("{")
            json_end = normalized_content.rfind("}")
            if json_start < 0 or json_end < json_start:
                raise ValueError(f"K2 response was not valid JSON: {normalized_content[:240]}")
            response_payload = json.loads(normalized_content[json_start : json_end + 1])

        summary = str(response_payload.get("summary", "K2 reasoning completed."))
        actions = [str(item) for item in response_payload.get("actions", [])]
        arm_boost = self._clamp_float(response_payload.get("arm_boost", 1.15), 0.8, 1.8)
        leg_boost = self._clamp_float(response_payload.get("leg_boost", 1.08), 0.8, 1.6)
        hip_sway_boost = self._clamp_float(response_payload.get("hip_sway_boost", 1.12), 0.8, 1.8)
        shoulder_sway_boost = self._clamp_float(response_payload.get("shoulder_sway_boost", 1.08), 0.8, 1.8)
        head_bounce_boost = self._clamp_float(response_payload.get("head_bounce_boost", 1.04), 0.8, 1.6)
        smoothing_window = self._clamp_int(response_payload.get("smoothing_window", 3), 1, 7)
        confidence = str(response_payload.get("confidence", "medium"))

        return MotionReasoningResult(
            summary=summary,
            actions=actions,
            arm_boost=arm_boost,
            leg_boost=leg_boost,
            hip_sway_boost=hip_sway_boost,
            shoulder_sway_boost=shoulder_sway_boost,
            head_bounce_boost=head_bounce_boost,
            smoothing_window=smoothing_window,
            confidence=confidence,
            raw_response=content,
        )

    def _clamp_float(self, value, minimum: float, maximum: float) -> float:
        # This method normalizes numeric floats within a safe range.
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            numeric_value = minimum
        return max(minimum, min(maximum, numeric_value))

    def _clamp_int(self, value, minimum: int, maximum: int) -> int:
        # This method normalizes integer values within a safe range.
        try:
            numeric_value = int(value)
        except (TypeError, ValueError):
            numeric_value = minimum
        return max(minimum, min(maximum, numeric_value))
