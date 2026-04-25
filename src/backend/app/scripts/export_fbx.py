# File: kinetix-studio/backend/app/scripts/export_fbx.py
# This file runs inside Blender to map preview joints onto a Mixamo-style armature and export FBX.

import json
import math
import sys

import bpy


def parse_args() -> tuple[str, str, int, str]:
    # This function parses custom command-line arguments passed after Blender's double-dash separator.
    if "--" not in sys.argv:
        raise ValueError("Expected Blender export arguments after '--'.")
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    if len(arguments) < 4:
        raise ValueError("Expected motion JSON path, output FBX path, frame rate, and bone prefix.")
    return arguments[0], arguments[1], int(arguments[2]), arguments[3]


def find_armature():
    # This function returns the first armature object from the current Blender scene.
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    raise ValueError("No armature object found in Blender template.")


def joint(frame: dict, name: str) -> dict:
    # This function returns a joint dictionary and raises a clean error if the joint is missing.
    joints = frame.get("joints", {})
    if name not in joints:
        raise KeyError(f"Missing joint '{name}' in preview frame.")
    return joints[name]


def limb_angles(start_joint: dict, end_joint: dict) -> tuple[float, float]:
    # This function converts a start and end point into simple pitch and roll values for a limb.
    dx = end_joint["x"] - start_joint["x"]
    dy = end_joint["y"] - start_joint["y"]
    dz = end_joint["z"] - start_joint["z"]
    roll = math.atan2(dx, max(abs(dy), 0.001))
    pitch = math.atan2(dz, max(abs(dy), 0.001))
    return pitch, roll


def set_rotation(pose_bone, pitch: float = 0.0, yaw: float = 0.0, roll: float = 0.0) -> None:
    # This function sets the Euler rotation mode and applies the requested transform values.
    if pose_bone is None:
        return
    pose_bone.rotation_mode = "XYZ"
    pose_bone.rotation_euler = (pitch, yaw, roll)


def get_bone(armature, prefix: str, name: str):
    # This function resolves a Mixamo-style pose bone by name and returns None when absent.
    return armature.pose.bones.get(f"{prefix}{name}") or armature.pose.bones.get(name)


def main() -> None:
    # This function orchestrates the Blender-side import, keyframe creation, and FBX export.
    motion_path, output_path, frame_rate, bone_prefix = parse_args()
    payload = json.loads(open(motion_path, "r", encoding="utf-8").read())
    preview_frames = payload.get("preview_frames", [])
    if not preview_frames:
        raise ValueError("Preview frames are empty. Export cannot continue.")

    bpy.context.scene.render.fps = frame_rate
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = len(preview_frames)

    armature = find_armature()
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="POSE")

    hips_bone = get_bone(armature, bone_prefix, "Hips")
    spine_bone = get_bone(armature, bone_prefix, "Spine")
    head_bone = get_bone(armature, bone_prefix, "Head")
    left_arm_bone = get_bone(armature, bone_prefix, "LeftArm")
    left_forearm_bone = get_bone(armature, bone_prefix, "LeftForeArm")
    right_arm_bone = get_bone(armature, bone_prefix, "RightArm")
    right_forearm_bone = get_bone(armature, bone_prefix, "RightForeArm")
    left_leg_bone = get_bone(armature, bone_prefix, "LeftUpLeg")
    left_shin_bone = get_bone(armature, bone_prefix, "LeftLeg")
    right_leg_bone = get_bone(armature, bone_prefix, "RightUpLeg")
    right_shin_bone = get_bone(armature, bone_prefix, "RightLeg")

    for frame_number, frame_payload in enumerate(preview_frames, start=1):
        bpy.context.scene.frame_set(frame_number)

        hips = joint(frame_payload, "hips")
        neck = joint(frame_payload, "neck")
        head = joint(frame_payload, "head")
        left_shoulder = joint(frame_payload, "left_shoulder")
        left_elbow = joint(frame_payload, "left_elbow")
        left_hand = joint(frame_payload, "left_hand")
        right_shoulder = joint(frame_payload, "right_shoulder")
        right_elbow = joint(frame_payload, "right_elbow")
        right_hand = joint(frame_payload, "right_hand")
        left_knee = joint(frame_payload, "left_knee")
        left_foot = joint(frame_payload, "left_foot")
        right_knee = joint(frame_payload, "right_knee")
        right_foot = joint(frame_payload, "right_foot")

        torso_pitch, torso_roll = limb_angles(hips, neck)
        head_pitch, head_roll = limb_angles(neck, head)
        left_arm_pitch, left_arm_roll = limb_angles(left_shoulder, left_elbow)
        left_forearm_pitch, left_forearm_roll = limb_angles(left_elbow, left_hand)
        right_arm_pitch, right_arm_roll = limb_angles(right_shoulder, right_elbow)
        right_forearm_pitch, right_forearm_roll = limb_angles(right_elbow, right_hand)
        left_leg_pitch, left_leg_roll = limb_angles(hips, left_knee)
        left_shin_pitch, left_shin_roll = limb_angles(left_knee, left_foot)
        right_leg_pitch, right_leg_roll = limb_angles(hips, right_knee)
        right_shin_pitch, right_shin_roll = limb_angles(right_knee, right_foot)

        if hips_bone is not None:
            hips_bone.location.x = hips["x"] * 0.02
            hips_bone.location.z = hips["y"] * 0.02
            hips_bone.keyframe_insert(data_path="location", frame=frame_number)

        set_rotation(spine_bone, pitch=torso_pitch * 0.7, roll=-torso_roll * 0.5)
        set_rotation(head_bone, pitch=head_pitch * 0.6, roll=-head_roll * 0.4)
        set_rotation(left_arm_bone, pitch=left_arm_pitch, roll=-left_arm_roll)
        set_rotation(left_forearm_bone, pitch=left_forearm_pitch, roll=-left_forearm_roll)
        set_rotation(right_arm_bone, pitch=right_arm_pitch, roll=-right_arm_roll)
        set_rotation(right_forearm_bone, pitch=right_forearm_pitch, roll=-right_forearm_roll)
        set_rotation(left_leg_bone, pitch=left_leg_pitch, roll=-left_leg_roll * 0.4)
        set_rotation(left_shin_bone, pitch=left_shin_pitch, roll=-left_shin_roll * 0.25)
        set_rotation(right_leg_bone, pitch=right_leg_pitch, roll=-right_leg_roll * 0.4)
        set_rotation(right_shin_bone, pitch=right_shin_pitch, roll=-right_shin_roll * 0.25)

        for pose_bone in [
            spine_bone,
            head_bone,
            left_arm_bone,
            left_forearm_bone,
            right_arm_bone,
            right_forearm_bone,
            left_leg_bone,
            left_shin_bone,
            right_leg_bone,
            right_shin_bone,
        ]:
            if pose_bone is not None:
                pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame_number)

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.fbx(
        filepath=output_path,
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_bones=True,
        bake_space_transform=True,
    )


if __name__ == "__main__":
    # This block runs the Blender export flow when the script is executed headlessly.
    main()