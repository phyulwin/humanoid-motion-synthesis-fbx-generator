// File: kinetix-studio/frontend/lib/api.ts
// This file contains the browser-side API helpers used by the dashboard.

import type { JobRecord } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function createJob(payload: {
  file: File;
  avatarRig: string;
  frameRate: number;
  trimStart: number;
  trimEnd: number;
  loopAnimation: boolean;
}): Promise<JobRecord> {
  // This function uploads a new video and creates a processing job on the backend.
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("avatar_rig", payload.avatarRig);
  formData.append("frame_rate", String(payload.frameRate));
  formData.append("trim_start", String(payload.trimStart));
  formData.append("trim_end", String(payload.trimEnd));
  formData.append("loop_animation", String(payload.loopAnimation));

  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Upload failed.");
  }

  return (await response.json()) as JobRecord;
}

export async function fetchJob(jobId: string): Promise<JobRecord> {
  // This function retrieves the latest state of an existing job.
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Polling failed.");
  }

  return (await response.json()) as JobRecord;
}

export async function requestExport(jobId: string): Promise<JobRecord> {
  // This function asks the backend to start the Blender export for the current job.
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/export`, {
    method: "POST"
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || "Export request failed.");
  }

  return (await response.json()) as JobRecord;
}

export function resolveFileUrl(url: string | null): string | null {
  // This function converts backend-relative file URLs into browser-usable absolute URLs.
  if (!url) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}