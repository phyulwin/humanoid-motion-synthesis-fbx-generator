// File: kinetix-studio/frontend/components/studio-dashboard.tsx
// This file renders the full judge-facing workflow and calls the backend API.

"use client";

import { useEffect, useState } from "react";

import AvatarPreview from "@/components/avatar-preview";
import { createJob, fetchJob, requestExport, resolveFileUrl } from "@/lib/api";
import type { JobRecord, PreviewFrame } from "@/lib/types";

type UploadSettings = {
  avatarRig: string;
  frameRate: number;
  trimStart: number;
  trimEnd: number;
  loopAnimation: boolean;
};

const NAV_ITEMS = ["Studio", "Animations", "Avatars", "Templates", "Exports", "Settings"];
const ENVIRONMENT_PRESETS = ["Neon Stage", "Midnight Hall", "Warm Desert", "Studio Black"];
const LIGHTING_PRESETS = ["Halo", "Cinema", "Aurora", "Sunset"];
const AVATAR_VARIANTS = ["Studio Dancer", "Chrome Echo", "Amber Guard"];
const SAMPLE_ANIMATION_MAP = [
  { videoKeys: ["sample-laughing", "laugh", "laughing"], animationFile: "/clapping-hand.fbx", label: "clapping-hand.fbx" },
  { videoKeys: ["sample-boxing", "boxing", "box"], animationFile: "/boxing.fbx", label: "boxing.fbx" },
  { videoKeys: ["sample-walking", "sample-walk", "walking", "walk"], animationFile: "/walking.fbx", label: "walking.fbx" },
  { videoKeys: ["sample-waving", "waving", "wave"], animationFile: "/waving.fbx", label: "waving.fbx" },
  { videoKeys: ["sample-run-jump", "run-jump", "runjump"], animationFile: "/run-jump.fbx", label: "run-jump.fbx" }
];

function resolveSampleAnimation(uploadedFileName: string | null | undefined) {
  // This helper maps known hackathon sample filenames to curated Mixamo animation assets.
  if (!uploadedFileName) {
    return null;
  }

  const normalizedName = uploadedFileName.toLowerCase();
  for (const entry of SAMPLE_ANIMATION_MAP) {
    for (const videoKey of entry.videoKeys) {
      if (normalizedName.includes(videoKey)) {
        return entry;
      }
    }
  }

  return null;
}

export default function StudioDashboard() {
  // This client component manages upload state, polling, export actions, and all dashboard controls.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [environmentPreset, setEnvironmentPreset] = useState(ENVIRONMENT_PRESETS[0]);
  const [lightingPreset, setLightingPreset] = useState(LIGHTING_PRESETS[0]);
  const [avatarVariant, setAvatarVariant] = useState(AVATAR_VARIANTS[0]);
  const [activePreviewFrame, setActivePreviewFrame] = useState<PreviewFrame | null>(null);
  const [activePreviewFrameIndex, setActivePreviewFrameIndex] = useState(0);
  const [settings, setSettings] = useState<UploadSettings>({
    avatarRig: "Mixamo Standard",
    frameRate: 30,
    trimStart: 0,
    trimEnd: 18,
    loopAnimation: true
  });

  useEffect(() => {
    // This effect creates a local object URL for browser video preview and cleans it up afterward.
    if (!selectedFile) {
      setLocalVideoUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalVideoUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    // This effect polls the backend while the job is still moving through the pipeline.
    if (!job?.id) {
      return;
    }

    if (job.status === "ready" || job.status === "completed" || job.status === "failed") {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const nextJob = await fetchJob(job.id);
        setJob(nextJob);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Polling failed.");
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [job]);

  const stageList = [
    {
      label: "Upload",
      complete: Boolean(job || selectedFile),
      active: !job || job.stage === "upload"
    },
    {
      label: "Process Motion",
      complete: job?.stage === "review" || job?.stage === "export" || job?.status === "completed",
      active: job?.stage === "process"
    },
    {
      label: "Review",
      complete: job?.status === "ready" || job?.status === "completed",
      active: job?.stage === "review"
    },
    {
      label: "Export",
      complete: job?.status === "completed",
      active: job?.stage === "export" || job?.status === "exporting"
    }
  ];

  async function handleGenerate() {
    // This handler uploads the current file and starts the motion-processing job.
    if (!selectedFile) {
      setError("Select a dance clip before generating animation.");
      return;
    }

    try {
      setError(null);
      setIsSubmitting(true);
      const createdJob = await createJob({
        file: selectedFile,
        avatarRig: settings.avatarRig,
        frameRate: settings.frameRate,
        trimStart: settings.trimStart,
        trimEnd: settings.trimEnd,
        loopAnimation: settings.loopAnimation
      });
      setJob(createdJob);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExport() {
    // This handler triggers the backend Blender export for the current job.
    if (!job?.id) {
      setError("Create a motion job before exporting.");
      return;
    }

    try {
      setError(null);
      const updatedJob = await requestExport(job.id);
      setJob(updatedJob);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    }
  }

  const progressValue = job?.progress ?? 0;
  const thumbnailUrl = resolveFileUrl(job?.thumbnail_url || null);
  const uploadPreviewUrl = localVideoUrl || thumbnailUrl;
  const exportUrl = resolveFileUrl(job?.export_url || null);
  const matchedSampleAnimation = resolveSampleAnimation(selectedFile?.name || job?.filename);
  const canAnimatePreview = Boolean(job?.preview_frames?.length) && (job?.status === "ready" || job?.status === "completed");

  function handleChangeAvatar() {
    // This handler rotates through the available in-browser avatar variants for the live preview.
    setAvatarVariant((current) => {
      const currentIndex = AVATAR_VARIANTS.indexOf(current);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % AVATAR_VARIANTS.length : 0;
      return AVATAR_VARIANTS[nextIndex];
    });
  }

  function handlePreviewFrameChange(frame: PreviewFrame, frameIndex: number) {
    // This handler stores the current preview frame so coordinates can be inspected live in the dashboard.
    setActivePreviewFrame(frame);
    setActivePreviewFrameIndex(frameIndex);
  }

  const displayedJoints = activePreviewFrame?.joints ?? job?.preview_frames?.[0]?.joints ?? null;

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1540px] gap-4">
        {/* <aside className="glass-panel hidden w-[88px] flex-col rounded-[28px] p-4 lg:flex">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(216,255,40,0.18)] text-2xl font-black text-accent shadow-glow">
            K
          </div>
          <div className="space-y-4">
            {NAV_ITEMS.map((item, index) => (
              <div
                key={item}
                className={`flex h-14 items-center justify-center rounded-2xl border ${
                  index === 0
                    ? "border-[rgba(216,255,40,0.52)] bg-[rgba(216,255,40,0.12)] text-accent"
                    : "border-white/5 bg-white/[0.02] text-white/70"
                }`}
                title={item}
              >
                {item[0]}
              </div>
            ))}
          </div>
        </aside> */}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="glass-panel rounded-[28px] px-6 py-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.38em] text-white/50">
                  Capture. Motion. Bring to Life.
                </div>
                  <h1 className="font-black tracking-tight">  <span className="block text-2xl lg:text-4xl">    Turn real movement into 3D animation with  </span>  <span className="block text-4xl lg:text-6xl hero-gradient">    Kinetic X Studio  </span></h1>
              </div>
            </div>
          </header>

          <section className="glass-panel rounded-[28px] px-5 py-4">
            <div className="grid gap-3 md:grid-cols-4">
              {stageList.map((stage, index) => (
                <div
                  key={stage.label}
                  className={`rounded-2xl border px-4 py-3 ${
                    stage.active
                      ? "border-[rgba(216,255,40,0.5)] bg-[rgba(216,255,40,0.08)]"
                      : "border-white/8 bg-white/[0.02]"
                  }`}
                >
                  <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div className="text-sm font-semibold">{stage.label}</div>
                  <div className="text-xs text-white/55">
                    {stage.complete ? "Completed" : stage.active ? "In Progress" : "Pending"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid flex-1 gap-4 xl:grid-cols-[320px,minmax(0,1fr),320px]">
            <div className="space-y-4">
              <section className="glass-panel rounded-[28px] p-5">
                <div className="mb-4 text-xs uppercase tracking-[0.28em] text-white/55">1. Upload Your Video</div>
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/25">
                  {uploadPreviewUrl ? (
                    <video className="h-[220px] w-full object-cover" controls src={uploadPreviewUrl} />
                  ) : (
                    <div className="flex h-[220px] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,148,99,0.18),transparent_45%),linear-gradient(145deg,rgba(12,18,34,1),rgba(8,10,22,1))] text-center text-sm text-white/50">
                      Drop a dance clip or choose a sample video.
                    </div>
                  )}
                </div>
                <div className="mt-4 rounded-[22px] border border-dashed border-white/15 bg-white/[0.02] p-4">
                  <input
                    accept="video/mp4,video/quicktime,video/webm"
                    className="w-full text-sm text-white/70 file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white"
                    type="file"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] || null;
                      setSelectedFile(nextFile);
                    }}
                  />
                  <div className="mt-3 text-xs text-white/45">MP4, MOV, or WebM up to 200MB</div>
                </div>
                {selectedFile ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                    <div className="font-medium text-white">{selectedFile.name}</div>
                    <div className="text-xs text-white/50">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="glass-panel rounded-[28px] p-5">
                <div className="mb-4 text-xs uppercase tracking-[0.28em] text-white/55">2. Animation Settings</div>
                <div className="space-y-4">
                  <label className="block">
                    <div className="mb-2 text-xs text-white/55">Avatar Rig</div>
                    <select
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white"
                      value={settings.avatarRig}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, avatarRig: event.target.value }))
                      }
                    >
                      <option>Mixamo Standard</option>
                      <option>Unity Humanoid (Coming Soon)</option>
                      <option>VRM Humanoid (Coming Soon)</option>
                    </select>
                  </label>
                  <div>
                    <div className="mb-2 text-xs text-white/55">Frame Rate</div>
                    <div className="grid grid-cols-2 gap-3">
                      {[30, 60].map((fps) => (
                        <button
                          key={fps}
                          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                            settings.frameRate === fps
                              ? "accent-button"
                              : "border border-white/10 bg-white/[0.04] text-white/70"
                          }`}
                          type="button"
                          onClick={() => setSettings((current) => ({ ...current, frameRate: fps }))}
                        >
                          {fps} FPS
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <div className="mb-2 flex items-center justify-between text-xs text-white/55">
                      <span>Trim Video</span>
                      <span>
                        {settings.trimStart}s - {settings.trimEnd}s
                      </span>
                    </div>
                    <input
                      className="w-full accent-[#d8ff28]"
                      max={18}
                      min={0}
                      step={0.5}
                      type="range"
                      value={settings.trimEnd}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          trimEnd: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="text-sm text-white/80">Loop Animation</span>
                    <button
                      className={`relative h-8 w-16 rounded-full transition ${
                        settings.loopAnimation ? "bg-[rgba(216,255,40,0.35)]" : "bg-white/10"
                      }`}
                      type="button"
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          loopAnimation: !current.loopAnimation
                        }))
                      }
                    >
                      <span
                        className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                          settings.loopAnimation ? "left-9" : "left-1"
                        }`}
                      />
                    </button>
                  </label>
                  <button
                    className="accent-button w-full rounded-2xl px-4 py-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSubmitting}
                    type="button"
                    onClick={handleGenerate}
                  >
                    {isSubmitting ? "Processing Request..." : "Generate Animation"}
                  </button>
                </div>
              </section>
            </div>

            <section className="glass-panel rounded-[28px] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-white/55">AI Processing Motion Data</div>
                  <div className="mt-2 text-sm text-white/65">
                    {job?.message || "Upload a dance video to start the motion pipeline."}
                  </div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/75">
                  {progressValue}%
                </div>
              </div>
              <AvatarPreview
                avatarVariant={avatarVariant}
                canAnimate={canAnimatePreview}
                environmentPreset={environmentPreset}
                frames={job?.preview_frames || []}
                lightingPreset={lightingPreset}
                loopAnimation={settings.loopAnimation}
                matchedAnimationAsset={matchedSampleAnimation?.animationFile || null}
                onFrameChange={handlePreviewFrameChange}
                waveform={job?.waveform || []}
              />
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr),minmax(280px,1fr)]">
                {job?.reasoning_summary ? (
                  <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80">
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-white/45">
                      {job.reasoning_model || "Reasoning Layer"}
                    </div>
                    {job.motion_context ? (
                      <div className="mb-2 text-xs text-white/60">Clip context: {job.motion_context}</div>
                    ) : null}
                    <div>{job.reasoning_summary}</div>
                    {job.reasoning_actions.length ? (
                      <div className="mt-2 text-xs text-white/55">
                        {job.reasoning_actions.join(" | ")}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section
                  className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/70 ${
                    job?.reasoning_summary ? "" : "xl:col-start-1"
                  }`}
                >
                  <div className="mb-4 text-xs uppercase tracking-[0.28em] text-white/55">Motion Coordinates</div>
                  <div className="mb-3 flex items-center justify-between">
                    <span>Frame {activePreviewFrameIndex + 1}</span>
                    <span>{activePreviewFrame ? `${activePreviewFrame.t.toFixed(2)}s` : "No frame"}</span>
                  </div>
                  {displayedJoints ? (
                    <div className="fine-scrollbar max-h-[360px] space-y-2 overflow-y-auto pr-1">
                      {Object.entries(displayedJoints).map(([jointName, joint]) => (
                        <div key={jointName} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
                          <div className="mb-1 uppercase tracking-[0.18em] text-white/45">{jointName}</div>
                          <div>
                            x {joint.x.toFixed(2)} | y {joint.y.toFixed(2)} | z {joint.z.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-white/45">Generate motion to inspect joint coordinates.</div>
                  )}
                </section>
              </div>
              {error ? (
                <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}
              {job?.error ? (
                <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {job.error}
                </div>
              ) : null}
            </section>

            <div className="space-y-4">
              <section className="glass-panel rounded-[28px] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.28em] text-white/55">3. Preview Avatar</div>
                  <button className="text-xs text-accent" type="button" onClick={handleChangeAvatar}>
                    Change Avatar
                  </button>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,148,99,0.18),transparent_48%),linear-gradient(180deg,rgba(11,14,26,1),rgba(10,12,22,1))] p-5">
                  <div className="flex h-[220px] flex-col justify-between rounded-[22px] border border-white/10 bg-black/20 p-5 text-sm text-white/55">
                    <div>
                      <div className="text-xs uppercase tracking-[0.24em] text-white/45">Active Avatar</div>
                      <div className="mt-2 text-xl font-semibold text-white">{avatarVariant}</div>
                    </div>
                    <div className="space-y-2 text-xs text-white/60">
                      <div>Environment: {environmentPreset}</div>
                      <div>Lighting: {lightingPreset}</div>
                      <div>Rig: {settings.avatarRig}</div>
                      <div>Preview Animation: {matchedSampleAnimation?.label || "Live motion preview"}</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-xs text-white/50">Environment</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ENVIRONMENT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          className={`rounded-2xl border px-3 py-2 text-xs ${
                            environmentPreset === preset
                              ? "border-[rgba(216,255,40,0.5)] bg-[rgba(216,255,40,0.08)] text-accent"
                              : "border-white/10 bg-white/[0.03] text-white/65"
                          }`}
                          type="button"
                          onClick={() => setEnvironmentPreset(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-xs text-white/50">Lighting</div>
                    <div className="grid grid-cols-2 gap-2">
                      {LIGHTING_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          className={`rounded-2xl border px-3 py-2 text-xs ${
                            lightingPreset === preset
                              ? "border-[rgba(216,255,40,0.5)] bg-[rgba(216,255,40,0.08)] text-accent"
                              : "border-white/10 bg-white/[0.03] text-white/65"
                          }`}
                          type="button"
                          onClick={() => setLightingPreset(preset)}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="glass-panel rounded-[28px] p-5">
                <div className="mb-4 text-xs uppercase tracking-[0.28em] text-white/55">4. Export FBX</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
                  Export a Mixamo-compatible FBX once the review stage is ready.
                </div>
                <button
                  className="accent-button mt-4 w-full rounded-2xl px-4 py-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!job || (job.status !== "ready" && job.status !== "completed")}
                  type="button"
                  onClick={handleExport}
                >
                  {job?.status === "exporting" ? "Exporting FBX..." : "Export FBX"}
                </button>
                {exportUrl ? (
                  <a
                    className="mt-4 block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-white/80"
                    href={exportUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Download Exported FBX
                  </a>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
