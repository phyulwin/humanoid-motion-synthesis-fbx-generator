# File: kinetix-studio/backend/app/config.py
# This file centralizes backend configuration and filesystem paths.

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    # This class loads environment variables and exposes normalized paths for the application.
    model_config = SettingsConfigDict(env_file=BACKEND_ROOT / ".env", env_file_encoding="utf-8")

    app_name: str = "Kinetix Studio API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    storage_root: str = "storage"
    ffmpeg_executable: str = "ffmpeg"
    blender_executable: str = ""
    blender_template_blend: str = "assets/mixamo_template.blend"
    blender_bone_prefix: str = "mixamorig:"
    default_export_fps: int = 30
    k2_enabled: bool = True
    k2_api_key: str = ""
    k2_base_url: str = "https://api.k2think.ai/v1/chat/completions"
    k2_model_name: str = "MBZUAI-IFM/K2-Think-v2"
    k2_timeout_seconds: int = 45

    @property
    def storage_path(self) -> Path:
        # This property resolves the storage directory and creates it if needed.
        target_path = BACKEND_ROOT / self.storage_root
        target_path.mkdir(parents=True, exist_ok=True)
        return target_path

    @property
    def uploads_path(self) -> Path:
        # This property returns the upload directory for incoming user videos.
        target_path = self.storage_path / "uploads"
        target_path.mkdir(parents=True, exist_ok=True)
        return target_path

    @property
    def jobs_path(self) -> Path:
        # This property returns the directory where per-job metadata is stored.
        target_path = self.storage_path / "jobs"
        target_path.mkdir(parents=True, exist_ok=True)
        return target_path

    @property
    def exports_path(self) -> Path:
        # This property returns the directory where finished FBX files are written.
        target_path = self.storage_path / "exports"
        target_path.mkdir(parents=True, exist_ok=True)
        return target_path

    @property
    def blender_template_path(self) -> Path:
        # This property resolves the configured Blender template scene path.
        return BACKEND_ROOT / self.blender_template_blend

    @property
    def cors_origin_list(self) -> list[str]:
        # This property converts the comma-separated CORS list into a clean array.
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # This function returns a cached settings object for the full application lifecycle.
    return Settings()