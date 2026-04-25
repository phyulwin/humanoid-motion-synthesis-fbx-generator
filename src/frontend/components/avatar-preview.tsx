// File: kinetix-studio/frontend/components/avatar-preview.tsx
// This file renders a real skinned humanoid FBX preview and applies motion to the rig in-browser.

"use client";

import { OrbitControls, PerspectiveCamera, Sparkles, useFBX } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { PreviewFrame } from "@/lib/types";

type AvatarPreviewProps = {
  frames: PreviewFrame[];
  waveform: number[];
  loopAnimation: boolean;
};

type BoneMap = {
  hips?: THREE.Bone;
  spine?: THREE.Bone;
  head?: THREE.Bone;
  leftArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  rightArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  leftUpLeg?: THREE.Bone;
  leftLeg?: THREE.Bone;
  rightUpLeg?: THREE.Bone;
  rightLeg?: THREE.Bone;
};

type BonePoseMap = {
  hipsPosition?: THREE.Vector3;
  spineQuaternion?: THREE.Quaternion;
  headQuaternion?: THREE.Quaternion;
  leftArmQuaternion?: THREE.Quaternion;
  leftForeArmQuaternion?: THREE.Quaternion;
  rightArmQuaternion?: THREE.Quaternion;
  rightForeArmQuaternion?: THREE.Quaternion;
  leftUpLegQuaternion?: THREE.Quaternion;
  leftLegQuaternion?: THREE.Quaternion;
  rightUpLegQuaternion?: THREE.Quaternion;
  rightLegQuaternion?: THREE.Quaternion;
};

function toVector3(joint?: { x: number; y: number; z: number }): THREE.Vector3 {
  // This helper converts joint payloads into Three.js vectors.
  return new THREE.Vector3(joint?.x ?? 0, joint?.y ?? 0, joint?.z ?? 0);
}

function limbAngles(startJoint: THREE.Vector3, endJoint: THREE.Vector3): { pitch: number; roll: number } {
  // This helper converts a pair of joints into simple limb angles for the rig.
  const dx = endJoint.x - startJoint.x;
  const dy = endJoint.y - startJoint.y;
  const dz = endJoint.z - startJoint.z;
  const safeDy = Math.max(Math.abs(dy), 0.001);
  const roll = Math.atan2(dx, safeDy);
  const pitch = Math.atan2(dz, safeDy);
  return { pitch, roll };
}

function setBoneRotation(
  bone: THREE.Bone | undefined,
  baseQuaternion: THREE.Quaternion | undefined,
  pitch = 0,
  yaw = 0,
  roll = 0,
) {
  // This helper applies rotations relative to the source rig pose so skinning stays stable.
  if (!bone || !baseQuaternion) {
    return;
  }

  const offsetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "XYZ"));
  bone.quaternion.copy(baseQuaternion).multiply(offsetQuaternion);
}

function findBoneByCandidates(root: THREE.Object3D, candidates: string[]): THREE.Bone | undefined {
  // This helper finds a bone using conservative name matching against known Mixamo-style names.
  let resolvedBone: THREE.Bone | undefined;
  root.traverse((child) => {
    if (resolvedBone || !(child instanceof THREE.Bone)) {
      return;
    }

    const childName = child.name.toLowerCase();
    for (const candidate of candidates) {
      if (childName.includes(candidate.toLowerCase())) {
        resolvedBone = child;
        return;
      }
    }
  });
  return resolvedBone;
}

function buildBoneMap(root: THREE.Object3D): BoneMap {
  // This helper resolves the rig bones that the preview system will animate.
  return {
    hips: findBoneByCandidates(root, ["mixamorig:Hips", "Hips"]),
    spine: findBoneByCandidates(root, ["mixamorig:Spine", "Spine"]),
    head: findBoneByCandidates(root, ["mixamorig:Head", "Head"]),
    leftArm: findBoneByCandidates(root, ["mixamorig:LeftArm", "LeftArm"]),
    leftForeArm: findBoneByCandidates(root, ["mixamorig:LeftForeArm", "LeftForeArm"]),
    rightArm: findBoneByCandidates(root, ["mixamorig:RightArm", "RightArm"]),
    rightForeArm: findBoneByCandidates(root, ["mixamorig:RightForeArm", "RightForeArm"]),
    leftUpLeg: findBoneByCandidates(root, ["mixamorig:LeftUpLeg", "LeftUpLeg"]),
    leftLeg: findBoneByCandidates(root, ["mixamorig:LeftLeg", "LeftLeg"]),
    rightUpLeg: findBoneByCandidates(root, ["mixamorig:RightUpLeg", "RightUpLeg"]),
    rightLeg: findBoneByCandidates(root, ["mixamorig:RightLeg", "RightLeg"]),
  };
}

function setSkinnedMeshVisibility(root: THREE.Object3D, visible: boolean) {
  // This helper toggles mesh visibility so the user can preview with or without skin.
  root.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh || child instanceof THREE.Mesh) {
      child.visible = visible;
    }
  });
}

function captureBonePoseMap(boneMap: BoneMap): BonePoseMap {
  // This helper snapshots the model bind pose so animation can be applied as conservative offsets.
  return {
    hipsPosition: boneMap.hips?.position.clone(),
    spineQuaternion: boneMap.spine?.quaternion.clone(),
    headQuaternion: boneMap.head?.quaternion.clone(),
    leftArmQuaternion: boneMap.leftArm?.quaternion.clone(),
    leftForeArmQuaternion: boneMap.leftForeArm?.quaternion.clone(),
    rightArmQuaternion: boneMap.rightArm?.quaternion.clone(),
    rightForeArmQuaternion: boneMap.rightForeArm?.quaternion.clone(),
    leftUpLegQuaternion: boneMap.leftUpLeg?.quaternion.clone(),
    leftLegQuaternion: boneMap.leftLeg?.quaternion.clone(),
    rightUpLegQuaternion: boneMap.rightUpLeg?.quaternion.clone(),
    rightLegQuaternion: boneMap.rightLeg?.quaternion.clone(),
  };
}

function AnimatedAvatar({
  frames,
  loopAnimation,
  showSkin,
  showSkeleton,
}: {
  frames: PreviewFrame[];
  loopAnimation: boolean;
  showSkin: boolean;
  showSkeleton: boolean;
}) {
  // This component loads the FBX avatar, binds motion data to bones, and renders the rig.
  const sourceFbx = useFBX("/maximo_model.fbx");
  const clonedScene = useMemo(() => clone(sourceFbx), [sourceFbx]);
  const groupRef = useRef<THREE.Group>(null);
  const helperRef = useRef<THREE.SkeletonHelper | null>(null);
  const boneMapRef = useRef<BoneMap>({});
  const bonePoseMapRef = useRef<BonePoseMap>({});
  const frameIndexRef = useRef(0);

  useEffect(() => {
    // This effect prepares the avatar transform and caches resolved rig bones.
    clonedScene.scale.setScalar(0.0235);
    clonedScene.position.set(0, -2.0, 0);
    clonedScene.rotation.set(0, Math.PI, 0);
    clonedScene.updateMatrixWorld(true);
    clonedScene.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh) {
        child.pose();
      }
    });
    boneMapRef.current = buildBoneMap(clonedScene);
    bonePoseMapRef.current = captureBonePoseMap(boneMapRef.current);
    setSkinnedMeshVisibility(clonedScene, showSkin);

    if (helperRef.current) {
      helperRef.current.visible = showSkeleton;
      helperRef.current.scale.setScalar(0.0085);
    }
  }, [clonedScene, showSkin, showSkeleton]);

  useEffect(() => {
    // This effect creates and cleans up the skeleton helper overlay.
    const helper = new THREE.SkeletonHelper(clonedScene);
    helper.material = new THREE.LineBasicMaterial({ color: "#d8ff28" });
    helper.visible = showSkeleton;
    helperRef.current = helper;

    if (groupRef.current) {
      groupRef.current.add(helper);
    }

    return () => {
      if (groupRef.current && helperRef.current) {
        groupRef.current.remove(helperRef.current);
      }
      helperRef.current = null;
    };
  }, [clonedScene, showSkeleton]);

  useEffect(() => {
    // This effect keeps mesh visibility synchronized with the UI toggle.
    setSkinnedMeshVisibility(clonedScene, showSkin);
    if (helperRef.current) {
      helperRef.current.visible = showSkeleton;
    }
  }, [clonedScene, showSkin, showSkeleton]);

  useFrame((state) => {
    // This frame loop advances the motion clip and applies joint-driven rotations to the loaded rig.
    if (!frames.length) {
      return;
    }

    const clipTime = state.clock.getElapsedTime() * 24;
    const nextFrameIndex = loopAnimation
      ? Math.floor(clipTime % frames.length)
      : Math.min(Math.floor(clipTime), frames.length - 1);

    frameIndexRef.current = nextFrameIndex;
    const activeFrame = frames[nextFrameIndex];
    const joints = activeFrame.joints;
    const boneMap = boneMapRef.current;
    const bonePoseMap = bonePoseMapRef.current;

    const hips = toVector3(joints.hips);
    const neck = toVector3(joints.neck);
    const head = toVector3(joints.head);
    const leftShoulder = toVector3(joints.left_shoulder);
    const leftElbow = toVector3(joints.left_elbow);
    const leftHand = toVector3(joints.left_hand);
    const rightShoulder = toVector3(joints.right_shoulder);
    const rightElbow = toVector3(joints.right_elbow);
    const rightHand = toVector3(joints.right_hand);
    const leftKnee = toVector3(joints.left_knee);
    const leftFoot = toVector3(joints.left_foot);
    const rightKnee = toVector3(joints.right_knee);
    const rightFoot = toVector3(joints.right_foot);

    const torsoAngles = limbAngles(hips, neck);
    const headAngles = limbAngles(neck, head);
    const leftArmAngles = limbAngles(leftShoulder, leftElbow);
    const leftForeArmAngles = limbAngles(leftElbow, leftHand);
    const rightArmAngles = limbAngles(rightShoulder, rightElbow);
    const rightForeArmAngles = limbAngles(rightElbow, rightHand);
    const leftLegAngles = limbAngles(hips, leftKnee);
    const leftShinAngles = limbAngles(leftKnee, leftFoot);
    const rightLegAngles = limbAngles(hips, rightKnee);
    const rightShinAngles = limbAngles(rightKnee, rightFoot);

    if (boneMap.hips) {
      boneMap.hips.position.copy(bonePoseMap.hipsPosition ?? boneMap.hips.position);
      boneMap.hips.position.x += hips.x * 0.01;
    }

    setBoneRotation(boneMap.spine, bonePoseMap.spineQuaternion, torsoAngles.pitch * 0.7, 0, -torsoAngles.roll * 0.5);
    setBoneRotation(boneMap.head, bonePoseMap.headQuaternion, headAngles.pitch * 0.6, 0, -headAngles.roll * 0.4);

    setBoneRotation(boneMap.leftArm, bonePoseMap.leftArmQuaternion, leftArmAngles.pitch, 0, -leftArmAngles.roll);
    setBoneRotation(
      boneMap.leftForeArm,
      bonePoseMap.leftForeArmQuaternion,
      leftForeArmAngles.pitch,
      0,
      -leftForeArmAngles.roll,
    );
    setBoneRotation(boneMap.rightArm, bonePoseMap.rightArmQuaternion, rightArmAngles.pitch, 0, -rightArmAngles.roll);
    setBoneRotation(
      boneMap.rightForeArm,
      bonePoseMap.rightForeArmQuaternion,
      rightForeArmAngles.pitch,
      0,
      -rightForeArmAngles.roll,
    );

    setBoneRotation(boneMap.leftLeg, bonePoseMap.leftLegQuaternion, leftShinAngles.pitch, 0, -leftShinAngles.roll * 0.25);
    setBoneRotation(
      boneMap.rightLeg,
      bonePoseMap.rightLegQuaternion,
      rightShinAngles.pitch,
      0,
      -rightShinAngles.roll * 0.25,
    );
    setBoneRotation(
      boneMap.leftUpLeg,
      bonePoseMap.leftUpLegQuaternion,
      leftLegAngles.pitch * 0.35,
      0,
      -leftLegAngles.roll * 0.15,
    );
    setBoneRotation(
      boneMap.rightUpLeg,
      bonePoseMap.rightUpLegQuaternion,
      rightLegAngles.pitch * 0.35,
      0,
      -rightLegAngles.roll * 0.15,
    );

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.18) * 0.08;
    }

    if (helperRef.current) {
      helperRef.current.visible = showSkeleton;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

export default function AvatarPreview({
  frames,
  waveform,
  loopAnimation,
}: AvatarPreviewProps) {
  // This component assembles the canvas, preview controls, and animated timeline.
  const [showSkin, setShowSkin] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);

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
              right_foot: { x: 0.45, y: -1.45, z: 0 },
            },
          },
        ];

  return (
    <div className="flex h-full flex-col rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,10,22,0.88),rgba(11,16,32,0.96))]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">Avatar Preview Controls</div>
        <div className="flex gap-2">
          <button
            className={`rounded-full px-3 py-2 text-xs ${
              showSkin ? "bg-[rgba(216,255,40,0.18)] text-accent" : "bg-white/[0.05] text-white/70"
            }`}
            type="button"
            onClick={() => setShowSkin((current) => !current)}
          >
            {showSkin ? "Hide Skin" : "Show Skin"}
          </button>
          <button
            className={`rounded-full px-3 py-2 text-xs ${
              showSkeleton ? "bg-[rgba(216,255,40,0.18)] text-accent" : "bg-white/[0.05] text-white/70"
            }`}
            type="button"
            onClick={() => setShowSkeleton((current) => !current)}
          >
            {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
          </button>
        </div>
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-[28px]">
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 1.4, 6.5]} fov={34} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[4, 8, 5]} intensity={1.8} color="#fff3bf" />
          <directionalLight position={[-6, 2, -4]} intensity={1.0} color="#6ef2ff" />
          <pointLight position={[0, 3.5, 2]} intensity={8} color="#ff9463" />

          <mesh position={[0, -1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.12, 1.42, 48]} />
            <meshBasicMaterial color="#d8ff28" transparent opacity={0.35} />
          </mesh>

          <AnimatedAvatar
            frames={safeFrames}
            loopAnimation={loopAnimation}
            showSkin={showSkin}
            showSkeleton={showSkeleton}
          />

          <Sparkles count={28} scale={5.2} size={2.6} speed={0.35} color="#ff9463" />
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
