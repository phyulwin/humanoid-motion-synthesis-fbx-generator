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
  environmentPreset: string;
  lightingPreset: string;
  avatarVariant: string;
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

type EnvironmentStyle = {
  backgroundClassName: string;
  floorColor: string;
  floorOpacity: number;
  sparkleColor: string;
  sparkleCount: number;
};

type LightingStyle = {
  ambientIntensity: number;
  keyLightColor: string;
  keyLightIntensity: number;
  fillLightColor: string;
  fillLightIntensity: number;
  pointLightColor: string;
  pointLightIntensity: number;
};

type AvatarStyle = {
  scale: number;
  positionY: number;
  skinColor: string;
  emissiveColor: string;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
};

const ENVIRONMENT_STYLES: Record<string, EnvironmentStyle> = {
  "Neon Stage": {
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top,rgba(99,190,255,0.2),transparent_42%),linear-gradient(180deg,rgba(5,10,26,0.95),rgba(9,16,36,0.96))]",
    floorColor: "#7df9ff",
    floorOpacity: 0.32,
    sparkleColor: "#7df9ff",
    sparkleCount: 34,
  },
  "Midnight Hall": {
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top,rgba(160,174,255,0.12),transparent_40%),linear-gradient(180deg,rgba(8,9,19,0.94),rgba(14,16,30,0.98))]",
    floorColor: "#a4b0ff",
    floorOpacity: 0.24,
    sparkleColor: "#c2c8ff",
    sparkleCount: 16,
  },
  "Warm Desert": {
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top,rgba(255,184,107,0.18),transparent_42%),linear-gradient(180deg,rgba(28,14,8,0.92),rgba(42,21,10,0.98))]",
    floorColor: "#ffb86b",
    floorOpacity: 0.3,
    sparkleColor: "#ffd39b",
    sparkleCount: 20,
  },
  "Studio Black": {
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_36%),linear-gradient(180deg,rgba(7,8,12,0.96),rgba(8,8,10,1))]",
    floorColor: "#d8ff28",
    floorOpacity: 0.22,
    sparkleColor: "#ff9463",
    sparkleCount: 10,
  },
};

const LIGHTING_STYLES: Record<string, LightingStyle> = {
  Halo: {
    ambientIntensity: 0.95,
    keyLightColor: "#fff3bf",
    keyLightIntensity: 1.9,
    fillLightColor: "#6ef2ff",
    fillLightIntensity: 1.1,
    pointLightColor: "#ff9463",
    pointLightIntensity: 8,
  },
  Cinema: {
    ambientIntensity: 0.45,
    keyLightColor: "#ffe0b3",
    keyLightIntensity: 2.35,
    fillLightColor: "#6b87ff",
    fillLightIntensity: 0.7,
    pointLightColor: "#ff7a45",
    pointLightIntensity: 5.4,
  },
  Aurora: {
    ambientIntensity: 0.72,
    keyLightColor: "#8ef7ff",
    keyLightIntensity: 1.7,
    fillLightColor: "#9d7dff",
    fillLightIntensity: 1.3,
    pointLightColor: "#67ffb3",
    pointLightIntensity: 6.2,
  },
  Sunset: {
    ambientIntensity: 0.68,
    keyLightColor: "#ffcf8f",
    keyLightIntensity: 2.05,
    fillLightColor: "#ff7d6b",
    fillLightIntensity: 0.85,
    pointLightColor: "#ffb14a",
    pointLightIntensity: 7,
  },
};

const AVATAR_STYLES: Record<string, AvatarStyle> = {
  "Studio Dancer": {
    scale: 0.0235,
    positionY: -2.0,
    skinColor: "#f0b08d",
    emissiveColor: "#5a2d1f",
    emissiveIntensity: 0.04,
    metalness: 0.08,
    roughness: 0.9,
  },
  "Chrome Echo": {
    scale: 0.023,
    positionY: -2.02,
    skinColor: "#cfd6e6",
    emissiveColor: "#6ef2ff",
    emissiveIntensity: 0.12,
    metalness: 0.58,
    roughness: 0.34,
  },
  "Amber Guard": {
    scale: 0.024,
    positionY: -1.98,
    skinColor: "#d49762",
    emissiveColor: "#ff9463",
    emissiveIntensity: 0.1,
    metalness: 0.2,
    roughness: 0.72,
  },
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

function applyAvatarStyle(root: THREE.Object3D, avatarVariant: string) {
  // This helper applies a working material preset so avatar selection changes the rendered character.
  const avatarStyle = AVATAR_STYLES[avatarVariant] ?? AVATAR_STYLES["Studio Dancer"];

  root.scale.setScalar(avatarStyle.scale);
  root.position.set(0, avatarStyle.positionY, 0);
  root.rotation.set(0, Math.PI, 0);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const currentMaterial = child.material;
    if (Array.isArray(currentMaterial)) {
      return;
    }

    const nextMaterial =
      currentMaterial instanceof THREE.MeshStandardMaterial
        ? currentMaterial.clone()
        : new THREE.MeshStandardMaterial();

    nextMaterial.color = new THREE.Color(avatarStyle.skinColor);
    nextMaterial.emissive = new THREE.Color(avatarStyle.emissiveColor);
    nextMaterial.emissiveIntensity = avatarStyle.emissiveIntensity;
    nextMaterial.metalness = avatarStyle.metalness;
    nextMaterial.roughness = avatarStyle.roughness;
    child.material = nextMaterial;
  });
}

function AnimatedAvatar({
  frames,
  loopAnimation,
  showSkin,
  showSkeleton,
  avatarVariant,
}: {
  frames: PreviewFrame[];
  loopAnimation: boolean;
  showSkin: boolean;
  showSkeleton: boolean;
  avatarVariant: string;
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
    applyAvatarStyle(clonedScene, avatarVariant);
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
  }, [avatarVariant, clonedScene, showSkin, showSkeleton]);

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
  environmentPreset,
  lightingPreset,
  avatarVariant,
}: AvatarPreviewProps) {
  // This component assembles the canvas, preview controls, and animated timeline.
  const [showSkin, setShowSkin] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const environmentStyle = ENVIRONMENT_STYLES[environmentPreset] ?? ENVIRONMENT_STYLES["Neon Stage"];
  const lightingStyle = LIGHTING_STYLES[lightingPreset] ?? LIGHTING_STYLES.Halo;

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
    <div className={`flex h-full flex-col rounded-[28px] border border-white/10 ${environmentStyle.backgroundClassName}`}>
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
          <ambientLight intensity={lightingStyle.ambientIntensity} />
          <directionalLight position={[4, 8, 5]} intensity={lightingStyle.keyLightIntensity} color={lightingStyle.keyLightColor} />
          <directionalLight position={[-6, 2, -4]} intensity={lightingStyle.fillLightIntensity} color={lightingStyle.fillLightColor} />
          <pointLight position={[0, 3.5, 2]} intensity={lightingStyle.pointLightIntensity} color={lightingStyle.pointLightColor} />

          <mesh position={[0, -1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.12, 1.42, 48]} />
            <meshBasicMaterial color={environmentStyle.floorColor} transparent opacity={environmentStyle.floorOpacity} />
          </mesh>

          <AnimatedAvatar
            frames={safeFrames}
            loopAnimation={loopAnimation}
            showSkin={showSkin}
            showSkeleton={showSkeleton}
            avatarVariant={avatarVariant}
          />

          <Sparkles
            count={environmentStyle.sparkleCount}
            scale={5.2}
            size={2.6}
            speed={0.35}
            color={environmentStyle.sparkleColor}
          />
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
