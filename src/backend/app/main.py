# File: kinetix-studio/backend/app/main.py
# This file assembles the FastAPI application, middleware, routes, and static file serving.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers.jobs import router as jobs_router
from app.services.export_service import ExportService
from app.services.job_store import JsonJobStore
from app.services.pipeline import MotionPipeline


def create_app() -> FastAPI:
    # This function creates the full FastAPI application with shared singletons.
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    store = JsonJobStore(settings)
    pipeline = MotionPipeline(settings, store)
    export_service = ExportService(settings, store)

    app.state.settings = settings
    app.state.store = store
    app.state.pipeline = pipeline
    app.state.export_service = export_service

    app.mount("/files", StaticFiles(directory=settings.storage_path), name="files")
    app.include_router(jobs_router, prefix="/api/jobs", tags=["jobs"])

    @app.get("/api/health")
    def health_check():
        # This endpoint gives the frontend and deployment platform a simple readiness probe.
        return {"status": "ok", "service": settings.app_name}

    return app


app = create_app()