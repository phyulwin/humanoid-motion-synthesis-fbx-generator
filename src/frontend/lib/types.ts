// File: kinetix-studio/frontend/lib/types.ts
// This file defines the frontend TypeScript models shared across components.

export type JointPoint = {
  x: number;
  y: number;
  z: number;
};

export type PreviewFrame = {
  t: number;
  joints: Record<string, JointPoint>;
};

export type JobSettings = {
  avatar_rig: string;
  frame_rate: number;
  trim_start: number;
  trim_end: number;
  loop_animation: boolean;
};

export type JobRecord = {
  id: string;
  filename: string;
  stage: "upload" | "process" | "review" | "export";
  status: "queued" | "processing" | "ready" | "exporting" | "completed" | "failed";
  progress: number;
  message: string;
  settings: JobSettings;
  created_at: string;
  updated_at: string;
  upload_url: string | null;
  thumbnail_url: string | null;
  export_url: string | null;
  preview_frames: PreviewFrame[];
  waveform: number[];
  error: string | null;
};

export type DashboardUser = {
  name: string;
  email?: string;
  picture?: string;
};