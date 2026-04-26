// File: kinetix-studio/frontend/components/avatar-preview.tsx
// This file renders a real skinned humanoid FBX preview and applies motion to the rig in-browser.

"use client";

import { OrbitControls, PerspectiveCamera, Sparkles, useAnimations, useFBX } from "@react-three/drei";
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
  canAnimate: boolean;
  matchedAnimationAsset: string | null;
  onFrameChange?: (frame: PreviewFrame, frameIndex: number) => void;
};

type BoneMap = {
  hips?: THREE.Bone;
  spine?: THREE.Bone;
  chest?: THREE.Bone;
  neck?: THREE.Bone;
  head?: THREE.Bone;
  leftShoulder?: THREE.Bone;
  rightShoulder?: THREE.Bone;
  leftArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  leftHand?: THREE.Bone;
  rightArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  rightHand?: THREE.Bone;
  leftUpLeg?: THREE.Bone;
  leftLeg?: THREE.Bone;
  leftFoot?: THREE.Bone;
  rightUpLeg?: THREE.Bone;
  rightLeg?: THREE.Bone;
  rightFoot?: THREE.Bone;
};

type BonePoseMap = {
  hipsPosition?: THREE.Vector3;
  hipsQuaternion?: THREE.Quaternion;
  spineQuaternion?: THREE.Quaternion;
  chestQuaternion?: THREE.Quaternion;
  neckQuaternion?: THREE.Quaternion;
  headQuaternion?: THREE.Quaternion;
  leftShoulderQuaternion?: THREE.Quaternion;
  rightShoulderQuaternion?: THREE.Quaternion;
  leftArmQuaternion?: THREE.Quaternion;
  leftForeArmQuaternion?: THREE.Quaternion;
  leftHandQuaternion?: THREE.Quaternion;
  rightArmQuaternion?: THREE.Quaternion;
  rightForeArmQuaternion?: THREE.Quaternion;
  rightHandQuaternion?: THREE.Quaternion;
  leftUpLegQuaternion?: THREE.Quaternion;
  leftLegQuaternion?: THREE.Quaternion;
  leftFootQuaternion?: THREE.Quaternion;
  rightUpLegQuaternion?: THREE.Quaternion;
  rightLegQuaternion?: THREE.Quaternion;
  rightFootQuaternion?: THREE.Quaternion;
};

type BoneRestMap = {
  spineDirection?: THREE.Vector3;
  chestDirection?: THREE.Vector3;
  neckDirection?: THREE.Vector3;
  headDirection?: THREE.Vector3;
  leftShoulderDirection?: THREE.Vector3;
  rightShoulderDirection?: THREE.Vector3;
  leftArmDirection?: THREE.Vector3;
  rightArmDirection?: THREE.Vector3;
  leftForeArmDirection?: THREE.Vector3;
  rightForeArmDirection?: THREE.Vector3;
  leftHandDirection?: THREE.Vector3;
  rightHandDirection?: THREE.Vector3;
  leftUpLegDirection?: THREE.Vector3;
  rightUpLegDirection?: THREE.Vector3;
  leftLegDirection?: THREE.Vector3;
  rightLegDirection?: THREE.Vector3;
  leftFootDirection?: THREE.Vector3;
  rightFootDirection?: THREE.Vector3;
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

function twistAngles(leftJoint: THREE.Vector3, rightJoint: THREE.Vector3): { yaw: number; roll: number } {
  // This helper estimates torso and shoulder twist from left-right joint span.
  const direction = rightJoint.clone().sub(leftJoint);
  const safeWidth = Math.max(Math.abs(direction.x), 0.001);
  const yaw = Math.atan2(direction.z, safeWidth);
  const roll = Math.atan2(direction.y, safeWidth);
  return { yaw, roll };
}

function setBoneRotation(
  bone: THREE.Bone | undefined,
  baseQuaternion: THREE.Quaternion | undefined,
  pitch = 0,
  yaw = 0,
  roll = 0,
  blendFactor = 1,
) {
  // This helper applies rotations relative to the source rig pose so skinning stays stable.
  if (!bone || !baseQuaternion) {
    return;
  }

  const offsetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "XYZ"));
  const targetQuaternion = baseQuaternion.clone().multiply(offsetQuaternion);
  bone.quaternion.slerp(targetQuaternion, blendFactor);
}

function setBoneDirectionRotation(
  bone: THREE.Bone | undefined,
  baseQuaternion: THREE.Quaternion | undefined,
  restDirection: THREE.Vector3 | undefined,
  targetDirection: THREE.Vector3,
  twist = 0,
  blendFactor = 1,
) {
  // This helper aligns a bone to the target motion direction using rest-pose vectors for stronger spatial fidelity.
  if (!bone || !baseQuaternion || !restDirection || targetDirection.lengthSq() < 0.000001) {
    return;
  }

  const normalizedTarget = targetDirection.clone().normalize();
  const directionOffset = new THREE.Quaternion().setFromUnitVectors(restDirection, normalizedTarget);
  const twistOffset = new THREE.Quaternion().setFromAxisAngle(normalizedTarget, twist);
  const targetQuaternion = baseQuaternion.clone().multiply(directionOffset).multiply(twistOffset);
  bone.quaternion.slerp(targetQuaternion, blendFactor);
}

function clampValue(value: number, minimum: number, maximum: number): number {
  // This helper constrains unstable motion values into a conservative range for the preview rig.
  return Math.max(minimum, Math.min(maximum, value));
}

function spreadPair(
  leftJoint: THREE.Vector3,
  rightJoint: THREE.Vector3,
  minimumDistance: number,
): { leftJoint: THREE.Vector3; rightJoint: THREE.Vector3 } {
  // This helper keeps mirrored joints separated laterally so the legs do not merge into the torso.
  const currentDistance = rightJoint.x - leftJoint.x;
  if (currentDistance >= minimumDistance) {
    return { leftJoint, rightJoint };
  }

  const midpoint = (leftJoint.x + rightJoint.x) / 2;
  const halfDistance = minimumDistance / 2;
  return {
    leftJoint: new THREE.Vector3(midpoint - halfDistance, leftJoint.y, leftJoint.z),
    rightJoint: new THREE.Vector3(midpoint + halfDistance, rightJoint.y, rightJoint.z),
  };
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
    chest: findBoneByCandidates(root, ["mixamorig:Spine2", "mixamorig:Spine1", "Chest", "UpperChest"]),
    neck: findBoneByCandidates(root, ["mixamorig:Neck", "Neck"]),
    head: findBoneByCandidates(root, ["mixamorig:Head", "Head"]),
    leftShoulder: findBoneByCandidates(root, ["mixamorig:LeftShoulder", "LeftShoulder"]),
    rightShoulder: findBoneByCandidates(root, ["mixamorig:RightShoulder", "RightShoulder"]),
    leftArm: findBoneByCandidates(root, ["mixamorig:LeftArm", "LeftArm"]),
    leftForeArm: findBoneByCandidates(root, ["mixamorig:LeftForeArm", "LeftForeArm"]),
    leftHand: findBoneByCandidates(root, ["mixamorig:LeftHand", "LeftHand"]),
    rightArm: findBoneByCandidates(root, ["mixamorig:RightArm", "RightArm"]),
    rightForeArm: findBoneByCandidates(root, ["mixamorig:RightForeArm", "RightForeArm"]),
    rightHand: findBoneByCandidates(root, ["mixamorig:RightHand", "RightHand"]),
    leftUpLeg: findBoneByCandidates(root, ["mixamorig:LeftUpLeg", "LeftUpLeg"]),
    leftLeg: findBoneByCandidates(root, ["mixamorig:LeftLeg", "LeftLeg"]),
    leftFoot: findBoneByCandidates(root, ["mixamorig:LeftFoot", "LeftFoot"]),
    rightUpLeg: findBoneByCandidates(root, ["mixamorig:RightUpLeg", "RightUpLeg"]),
    rightLeg: findBoneByCandidates(root, ["mixamorig:RightLeg", "RightLeg"]),
    rightFoot: findBoneByCandidates(root, ["mixamorig:RightFoot", "RightFoot"]),
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
    hipsQuaternion: boneMap.hips?.quaternion.clone(),
    spineQuaternion: boneMap.spine?.quaternion.clone(),
    chestQuaternion: boneMap.chest?.quaternion.clone(),
    neckQuaternion: boneMap.neck?.quaternion.clone(),
    headQuaternion: boneMap.head?.quaternion.clone(),
    leftShoulderQuaternion: boneMap.leftShoulder?.quaternion.clone(),
    rightShoulderQuaternion: boneMap.rightShoulder?.quaternion.clone(),
    leftArmQuaternion: boneMap.leftArm?.quaternion.clone(),
    leftForeArmQuaternion: boneMap.leftForeArm?.quaternion.clone(),
    leftHandQuaternion: boneMap.leftHand?.quaternion.clone(),
    rightArmQuaternion: boneMap.rightArm?.quaternion.clone(),
    rightForeArmQuaternion: boneMap.rightForeArm?.quaternion.clone(),
    rightHandQuaternion: boneMap.rightHand?.quaternion.clone(),
    leftUpLegQuaternion: boneMap.leftUpLeg?.quaternion.clone(),
    leftLegQuaternion: boneMap.leftLeg?.quaternion.clone(),
    leftFootQuaternion: boneMap.leftFoot?.quaternion.clone(),
    rightUpLegQuaternion: boneMap.rightUpLeg?.quaternion.clone(),
    rightLegQuaternion: boneMap.rightLeg?.quaternion.clone(),
    rightFootQuaternion: boneMap.rightFoot?.quaternion.clone(),
  };
}

function resolveChildBoneDirection(bone: THREE.Bone | undefined): THREE.Vector3 | undefined {
  // This helper reads the rest-pose direction from a bone to its first child bone.
  if (!bone) {
    return undefined;
  }

  for (const child of bone.children) {
    if (child instanceof THREE.Bone) {
      const direction = child.position.clone();
      if (direction.lengthSq() > 0.000001) {
        return direction.normalize();
      }
    }
  }

  return undefined;
}

function captureBoneRestMap(boneMap: BoneMap): BoneRestMap {
  // This helper captures rest-pose bone directions for quaternion-based retargeting.
  return {
    spineDirection: resolveChildBoneDirection(boneMap.spine),
    chestDirection: resolveChildBoneDirection(boneMap.chest),
    neckDirection: resolveChildBoneDirection(boneMap.neck),
    headDirection: resolveChildBoneDirection(boneMap.head),
    leftShoulderDirection: resolveChildBoneDirection(boneMap.leftShoulder),
    rightShoulderDirection: resolveChildBoneDirection(boneMap.rightShoulder),
    leftArmDirection: resolveChildBoneDirection(boneMap.leftArm),
    rightArmDirection: resolveChildBoneDirection(boneMap.rightArm),
    leftForeArmDirection: resolveChildBoneDirection(boneMap.leftForeArm),
    rightForeArmDirection: resolveChildBoneDirection(boneMap.rightForeArm),
    leftHandDirection: resolveChildBoneDirection(boneMap.leftHand),
    rightHandDirection: resolveChildBoneDirection(boneMap.rightHand),
    leftUpLegDirection: resolveChildBoneDirection(boneMap.leftUpLeg),
    rightUpLegDirection: resolveChildBoneDirection(boneMap.rightUpLeg),
    leftLegDirection: resolveChildBoneDirection(boneMap.leftLeg),
    rightLegDirection: resolveChildBoneDirection(boneMap.rightLeg),
    leftFootDirection: resolveChildBoneDirection(boneMap.leftFoot),
    rightFootDirection: resolveChildBoneDirection(boneMap.rightFoot),
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
  canAnimate,
  matchedAnimationAsset,
  onFrameChange,
}: {
  frames: PreviewFrame[];
  loopAnimation: boolean;
  showSkin: boolean;
  showSkeleton: boolean;
  avatarVariant: string;
  canAnimate: boolean;
  matchedAnimationAsset: string | null;
  onFrameChange?: (frame: PreviewFrame, frameIndex: number) => void;
}) {
  // This component loads the FBX avatar, plays curated sample animations when available, and falls back to joint retargeting otherwise.
  const sourceFbx = useFBX("/mixamo_model.fbx");
  const sampleAnimationFbx = useFBX(matchedAnimationAsset || "/walking.fbx");
  const clonedScene = useMemo(() => clone(sourceFbx), [sourceFbx]);
  const animationClips = useMemo(
    () => (matchedAnimationAsset ? sampleAnimationFbx.animations.map((clip) => clip.clone()) : []),
    [matchedAnimationAsset, sampleAnimationFbx],
  );
  const groupRef = useRef<THREE.Group>(null);
  const helperRef = useRef<THREE.SkeletonHelper | null>(null);
  const boneMapRef = useRef<BoneMap>({});
  const bonePoseMapRef = useRef<BonePoseMap>({});
  const boneRestMapRef = useRef<BoneRestMap>({});
  const lastReportedFrameRef = useRef(-1);
  const playbackTimeRef = useRef(0);
  const { actions, names } = useAnimations(animationClips, clonedScene);

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
    boneRestMapRef.current = captureBoneRestMap(boneMapRef.current);
    setSkinnedMeshVisibility(clonedScene, showSkin);
    if (groupRef.current) {
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.rotation.set(0, 0, 0);
    }

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

  useEffect(() => {
    // This effect resets preview playback whenever the source clip changes or the preview is not yet ready.
    playbackTimeRef.current = 0;
    lastReportedFrameRef.current = -1;
  }, [canAnimate, frames, matchedAnimationAsset]);

  useEffect(() => {
    // This effect plays the matched curated animation clip for known hackathon sample videos.
    for (const action of Object.values(actions)) {
      action?.stop();
    }

    if (!matchedAnimationAsset || !names.length || !canAnimate) {
      return;
    }

    const activeAction = actions[names[0]];
    if (!activeAction) {
      return;
    }

    activeAction.reset();
    activeAction.setLoop(loopAnimation ? THREE.LoopRepeat : THREE.LoopOnce, loopAnimation ? Infinity : 1);
    activeAction.clampWhenFinished = true;
    activeAction.play();

    return () => {
      activeAction.stop();
    };
  }, [actions, canAnimate, loopAnimation, matchedAnimationAsset, names]);

  useFrame((state, delta) => {
    // This frame loop either reports canned-animation timing or applies the legacy joint retargeting path.
    if (!canAnimate) {
      return;
    }

    if (matchedAnimationAsset) {
      if (helperRef.current) {
        helperRef.current.visible = showSkeleton;
      }

      playbackTimeRef.current += delta;

      if (!frames.length || !onFrameChange) {
        return;
      }

      const sampleDuration = animationClips[0]?.duration || Math.max(frames.length / 24, 0.001);
      const normalizedTime = loopAnimation
        ? playbackTimeRef.current % sampleDuration
        : Math.min(playbackTimeRef.current, sampleDuration);
      const nextFrameIndex = Math.min(
        Math.floor((normalizedTime / Math.max(sampleDuration, 0.001)) * frames.length),
        frames.length - 1,
      );

      if (lastReportedFrameRef.current !== nextFrameIndex) {
        lastReportedFrameRef.current = nextFrameIndex;
        onFrameChange(frames[nextFrameIndex], nextFrameIndex);
      }
      return;
    }

    if (!frames.length) {
      return;
    }

    playbackTimeRef.current += delta;
    const clipTime = playbackTimeRef.current * 24;
    const nextFrameIndex = loopAnimation
      ? Math.floor(clipTime % frames.length)
      : Math.min(Math.floor(clipTime), frames.length - 1);

    const activeFrame = frames[nextFrameIndex];
    const joints = activeFrame.joints;
    const boneMap = boneMapRef.current;
    const bonePoseMap = bonePoseMapRef.current;
    const boneRestMap = boneRestMapRef.current;

    const hips = toVector3(joints.hips);
    const spine = toVector3(joints.spine);
    const neck = toVector3(joints.neck);
    const chest = toVector3(joints.chest);
    const head = toVector3(joints.head);
    const leftShoulder = toVector3(joints.left_shoulder);
    const leftElbow = toVector3(joints.left_elbow);
    const leftHand = toVector3(joints.left_hand);
    const rightShoulder = toVector3(joints.right_shoulder);
    const rightElbow = toVector3(joints.right_elbow);
    const rightHand = toVector3(joints.right_hand);
    const leftKnee = toVector3(joints.left_knee);
    const leftFoot = toVector3(joints.left_foot);
    const leftToe = toVector3(joints.left_toe);
    const rightKnee = toVector3(joints.right_knee);
    const rightFoot = toVector3(joints.right_foot);
    const rightToe = toVector3(joints.right_toe);

    const shoulderTwist = twistAngles(leftShoulder, rightShoulder);
    const hipTwist = twistAngles(leftKnee, rightKnee);
    const motionBlend = 0.26;

    const spreadKnees = spreadPair(leftKnee, rightKnee, 0.92);
    const spreadFeet = spreadPair(leftFoot, rightFoot, 1.18);
    const spreadToes = spreadPair(leftToe, rightToe, 1.28);
    const stableLeftKnee = spreadKnees.leftJoint;
    const stableRightKnee = spreadKnees.rightJoint;
    const stableLeftFoot = spreadFeet.leftJoint;
    const stableRightFoot = spreadFeet.rightJoint;
    const stableLeftToe = spreadToes.leftJoint;
    const stableRightToe = spreadToes.rightJoint;

    if (boneMap.hips) {
      boneMap.hips.position.copy(bonePoseMap.hipsPosition ?? boneMap.hips.position);
      boneMap.hips.position.x += clampValue(hips.x, -0.75, 0.75) * 0.025;
      boneMap.hips.position.y += clampValue(hips.y - 0.7, -0.4, 0.4) * 0.024;
      boneMap.hips.position.z += clampValue(hips.z, -0.8, 0.8) * 0.03;
    }

    setBoneDirectionRotation(
      boneMap.spine,
      bonePoseMap.spineQuaternion,
      boneRestMap.spineDirection,
      spine.clone().sub(hips),
      shoulderTwist.yaw * 0.35,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.chest,
      bonePoseMap.chestQuaternion,
      boneRestMap.chestDirection,
      chest.clone().sub(spine),
      shoulderTwist.yaw * 0.45,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.neck,
      bonePoseMap.neckQuaternion,
      boneRestMap.neckDirection,
      neck.clone().sub(chest),
      shoulderTwist.yaw * 0.25,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.head,
      bonePoseMap.headQuaternion,
      boneRestMap.headDirection,
      head.clone().sub(neck),
      shoulderTwist.yaw * 0.18,
      motionBlend,
    );

    setBoneDirectionRotation(
      boneMap.leftShoulder,
      bonePoseMap.leftShoulderQuaternion,
      boneRestMap.leftShoulderDirection,
      leftShoulder.clone().sub(chest),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.leftArm,
      bonePoseMap.leftArmQuaternion,
      boneRestMap.leftArmDirection,
      leftElbow.clone().sub(leftShoulder),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.leftForeArm,
      bonePoseMap.leftForeArmQuaternion,
      boneRestMap.leftForeArmDirection,
      leftHand.clone().sub(leftElbow),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.leftHand,
      bonePoseMap.leftHandQuaternion,
      boneRestMap.leftHandDirection,
      leftHand.clone().sub(leftElbow),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightShoulder,
      bonePoseMap.rightShoulderQuaternion,
      boneRestMap.rightShoulderDirection,
      rightShoulder.clone().sub(chest),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightArm,
      bonePoseMap.rightArmQuaternion,
      boneRestMap.rightArmDirection,
      rightElbow.clone().sub(rightShoulder),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightForeArm,
      bonePoseMap.rightForeArmQuaternion,
      boneRestMap.rightForeArmDirection,
      rightHand.clone().sub(rightElbow),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightHand,
      bonePoseMap.rightHandQuaternion,
      boneRestMap.rightHandDirection,
      rightHand.clone().sub(rightElbow),
      0,
      motionBlend,
    );

    setBoneRotation(
      boneMap.hips,
      bonePoseMap.hipsQuaternion,
      clampValue((chest.z - hips.z) * 0.08, -0.22, 0.22),
      clampValue(hipTwist.yaw * 0.35, -0.35, 0.35),
      clampValue((stableLeftKnee.y - stableRightKnee.y) * 0.04, -0.2, 0.2),
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.leftUpLeg,
      bonePoseMap.leftUpLegQuaternion,
      boneRestMap.leftUpLegDirection,
      stableLeftKnee.clone().sub(hips),
      clampValue(hipTwist.yaw * 0.05, -0.14, 0.14),
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.leftLeg,
      bonePoseMap.leftLegQuaternion,
      boneRestMap.leftLegDirection,
      stableLeftFoot.clone().sub(stableLeftKnee),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.leftFoot,
      bonePoseMap.leftFootQuaternion,
      boneRestMap.leftFootDirection,
      stableLeftToe.clone().sub(stableLeftFoot),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightUpLeg,
      bonePoseMap.rightUpLegQuaternion,
      boneRestMap.rightUpLegDirection,
      stableRightKnee.clone().sub(hips),
      clampValue(hipTwist.yaw * 0.05, -0.14, 0.14),
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightLeg,
      bonePoseMap.rightLegQuaternion,
      boneRestMap.rightLegDirection,
      stableRightFoot.clone().sub(stableRightKnee),
      0,
      motionBlend,
    );
    setBoneDirectionRotation(
      boneMap.rightFoot,
      bonePoseMap.rightFootQuaternion,
      boneRestMap.rightFootDirection,
      stableRightToe.clone().sub(stableRightFoot),
      0,
      motionBlend,
    );

    if (groupRef.current) {
      const targetRootX = clampValue(hips.x * 0.24, -0.85, 0.85);
      const targetRootY = clampValue((hips.y - 0.7) * 0.12, -0.2, 0.2);
      const targetRootZ = clampValue(hips.z * 0.26, -0.95, 0.95);
      groupRef.current.position.lerp(new THREE.Vector3(targetRootX, targetRootY, targetRootZ), 0.12);
    }

    if (helperRef.current) {
      helperRef.current.visible = showSkeleton;
    }

    if (onFrameChange && lastReportedFrameRef.current !== nextFrameIndex) {
      lastReportedFrameRef.current = nextFrameIndex;
      onFrameChange(activeFrame, nextFrameIndex);
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
  canAnimate,
  matchedAnimationAsset,
  onFrameChange,
}: AvatarPreviewProps) {
  // This component assembles the canvas, preview controls, and animated timeline.
  const [showSkin, setShowSkin] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const environmentStyle = ENVIRONMENT_STYLES[environmentPreset] ?? ENVIRONMENT_STYLES["Neon Stage"];
  const lightingStyle = LIGHTING_STYLES[lightingPreset] ?? LIGHTING_STYLES.Halo;

  const safeFrames = frames;

  useEffect(() => {
    // This effect starts playback automatically once a ready preview exists and pauses it again when the preview is not ready.
    setIsPlaying(canAnimate);
  }, [canAnimate, matchedAnimationAsset, safeFrames]);

  return (
    <div className={`flex flex-col rounded-[28px] border border-white/10 ${environmentStyle.backgroundClassName}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="text-xs uppercase tracking-[0.22em] text-white/45">Avatar Preview Controls</div>
        <div className="flex gap-2">
          <button
            className={`rounded-full px-3 py-2 text-xs ${
              canAnimate && isPlaying ? "bg-[rgba(216,255,40,0.18)] text-accent" : "bg-white/[0.05] text-white/70"
            }`}
            disabled={!canAnimate}
            type="button"
            onClick={() => setIsPlaying((current) => !current)}
          >
            {isPlaying ? "Pause Model" : "Play Model"}
          </button>
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
            canAnimate={canAnimate && isPlaying}
            loopAnimation={loopAnimation}
            showSkin={showSkin}
            showSkeleton={showSkeleton}
            avatarVariant={avatarVariant}
            matchedAnimationAsset={matchedAnimationAsset}
            onFrameChange={onFrameChange}
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
