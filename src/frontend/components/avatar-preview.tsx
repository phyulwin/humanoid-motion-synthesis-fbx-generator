// File: kinetix-studio/frontend/components/avatar-preview.tsx
// This file renders a procedural 3D humanoid preview using React Three Fiber.

"use client";

import { Line, OrbitControls, PerspectiveCamera, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";

import type { PreviewFrame } from "@/lib/types";

type AvatarPreviewProps = {
  frames: PreviewFrame[];
  waveform: number[];
  loopAnimation: boolean;
};

const BONE_SEGMENTS: Array<[string, string]> = [
  ["head", "neck"],
  ["neck", "left_shoulder"],
  ["neck", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_hand"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_hand"],
  ["neck", "hips"],
  ["hips", "left_knee"],
  ["left_knee", "left_foot"],
  ["hips", "right_knee"],
  ["right_knee", "right_foot"]
];

function MotionAvatar({
  frames,
  loopAnimation
}: {
  frames: PreviewFrame[];
  loopAnimation: boolean;
}) {
  // This component animates the skeleton preview inside the Three.js scene.
  const rootRef = useRef<Group>(null);
  const [frameIndex, setFrameIndex] = useState(0);

  useFrame((state) => {
    if (!frames.length) {
      return;
    }

    const currentTime = state.clock.getElapsedTime();
    const nextIndex = loopAnimation
      ? Math.floor((currentTime * 24) % frames.length)
      : Math.min(Math.floor(currentTime * 24), frames.length - 1);

    if (nextIndex !== frameIndex) {
      setFrameIndex(nextIndex);
    }

    if (rootRef.current) {
      rootRef.current.rotation.y = Math.sin(currentTime * 0.22) * 0.14;
    }
  });

  const activeFrame = frames[frameIndex] || frames[0];
  const hips = activeFrame?.joints.hips || { x: 0, y: 0.7, z: 0 };
  const head = activeFrame?.joints.head || { x: 0, y: 2.4, z: 0 };
  const torsoHeight = Math.max(head.y - hips.y - 0.35, 0.8);

  return (
    <group ref={rootRef} position={[0, -0.15, 0]}>
      <mesh position={[0, -1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.12, 1.42, 48]} />
        <meshBasicMaterial color="#d8ff28" transparent opacity={0.4} />
      </mesh>
      <mesh position={[hips.x, hips.y + torsoHeight / 2, hips.z]}>
        <capsuleGeometry args={[0.28, torsoHeight, 10, 18]} />
        <meshStandardMaterial color="#f0f1f4" metalness={0.45} roughness={0.22} />
      </mesh>
      {Object.entries(activeFrame?.joints || {}).map(([jointName, joint]) => (
        <mesh key={jointName} position={[joint.x, joint.y, joint.z]}>
          <sphereGeometry args={[jointName === "head" ? 0.17 : 0.085, 24, 24]} />
          <meshStandardMaterial
            color={jointName === "head" ? "#ff9463" : "#d8ff28"}
            emissive={jointName === "head" ? "#ff5e38" : "#d8ff28"}
            emissiveIntensity={0.25}
            roughness={0.3}
            metalness={0.15}
          />
        </mesh>
      ))}
      {BONE_SEGMENTS.map(([startJoint, endJoint]) => {
        const startPoint = activeFrame?.joints[startJoint];
        const endPoint = activeFrame?.joints[endJoint];
        if (!startPoint || !endPoint) {
          return null;
        }

        return (
          <Line
            key={`${startJoint}-${endJoint}`}
            points={[
              [startPoint.x, startPoint.y, startPoint.z],
              [endPoint.x, endPoint.y, endPoint.z]
            ]}
            color="#ffee6d"
            lineWidth={2.4}
            transparent
            opacity={0.9}
          />
        );
      })}
      <Sparkles count={28} scale={5.2} size={2.6} speed={0.35} color="#ff9463" />
    </group>
  );
}

export default function AvatarPreview({
  frames,
  waveform,
  loopAnimation
}: AvatarPreviewProps) {
  // This component assembles the canvas, lights, controls, and timeline visuals.
  const safeFrames =
    frames.length > 0
      ? frames
      : [
          {
            t: 0,
            joints: {
              head: { x: 0, y: 2.4, z: 0 },
              neck: { x: 0, y: 1.8, z: 0 },
              left_shoulder: { x: -0.6, y: 1.7, z: 0 },
              right_shoulder: { x: 0.6, y: 1.7, z: 0 },
              left_elbow: { x: -0.9, y: 1.1, z: 0 },
              right_elbow: { x: 0.9, y: 1.1, z: 0 },
              left_hand: { x: -1.1, y: 0.7, z: 0 },
              right_hand: { x: 1.1, y: 0.7, z: 0 },
              hips: { x: 0, y: 0.7, z: 0 },
              left_knee: { x: -0.35, y: -0.45, z: 0 },
              right_knee: { x: 0.35, y: -0.45, z: 0 },
              left_foot: { x: -0.45, y: -1.45, z: 0 },
              right_foot: { x: 0.45, y: -1.45, z: 0 }
            }
          }
        ];

  return (
    <div className="flex h-full flex-col rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,10,22,0.88),rgba(11,16,32,0.96))]">
      <div className="relative h-[420px] overflow-hidden rounded-[28px]">
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 1.4, 6.2]} fov={36} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[4, 8, 5]} intensity={1.8} color="#fff3bf" />
          <directionalLight position={[-6, 2, -4]} intensity={0.9} color="#6ef2ff" />
          <pointLight position={[0, 3.5, 2]} intensity={8} color="#ff9463" />
          <MotionAvatar frames={safeFrames} loopAnimation={loopAnimation} />
          <OrbitControls enablePan={false} minDistance={4.8} maxDistance={8.5} />
        </Canvas>
      </div>
      <div className="border-t border-white/10 px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-white/60">
          <span>Motion Timeline</span>
          <span>{safeFrames.length} Frames</span>
        </div>
        <div className="flex h-16 items-end gap-1">
          {(waveform.length ? waveform : new Array(28).fill(0.35)).map((value, index) => (
            <div
              key={`wave-${index}`}
              className="timeline-bar flex-1 rounded-full"
              style={{ height: `${Math.max(16, value * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}