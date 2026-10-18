"""
Pearl Cove - merge one character's animation GLBs into a single rig and export FBX for UE5.

Each Higgsfield/Meshy animation comes back as its own GLB (mesh + skeleton + one clip).
Unreal wants ONE skeletal mesh and many animation sequences on the same skeleton.
This script:
  1. Imports the base (idle) GLB and keeps its mesh + armature.
  2. Imports every other clip GLB, steals its action, renames it, deletes the duplicate rig.
  3. Keeps every clip as a named action on the base armature (one FBX take per clip).
  4. Leaves the rig's transforms untouched (the clips keep their motion) and lets the FBX
     exporter handle unit scale. The rig height was already set to real size when generated.
  5. Exports  <Name>_SK.fbx  (mesh + skeleton + all clips) with UE-friendly axis settings.

Usage (Blender 5.x, from a terminal):
  blender -b -P merge_character_animations.py -- --name Wren --dir ./Assets/Wren --out ./Export
The clip files must be named <Clip>.glb, e.g. Idle.glb, Run.glb, Sprint.glb, Jump.glb,
Backflip.glb, WaterCast.glb, LoveHeart.glb. Idle.glb is used as the base mesh.
"""
import argparse
import os
import sys

import bpy

BASE_CLIP = "Idle"


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True)
    p.add_argument("--dir", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def main():
    a = parse()
    os.makedirs(a.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0

    clips = sorted(f[:-4] for f in os.listdir(a.dir)
                   if f.lower().endswith(".glb") and not f.startswith("_"))
    if BASE_CLIP not in clips:
        raise SystemExit(f"{BASE_CLIP}.glb not found in {a.dir}")

    base_objs = import_glb(os.path.join(a.dir, BASE_CLIP + ".glb"))
    rig = next(o for o in base_objs if o.type == 'ARMATURE')
    rig.name = f"{a.name}_Rig"
    meshes = [o for o in base_objs if o.type == 'MESH']
    for i, m in enumerate(meshes):
        m.name = f"{a.name}_Body" if i == 0 else f"{a.name}_Body_{i}"

    actions = {}
    if rig.animation_data and rig.animation_data.action:
        act = rig.animation_data.action
        act.name = f"{a.name}_{BASE_CLIP}"
        actions[BASE_CLIP] = act

    for clip in clips:
        if clip == BASE_CLIP:
            continue
        objs = import_glb(os.path.join(a.dir, clip + ".glb"))
        other = next((o for o in objs if o.type == 'ARMATURE'), None)
        if other and other.animation_data and other.animation_data.action:
            act = other.animation_data.action
            act.name = f"{a.name}_{clip}"
            act.use_fake_user = True
            actions[clip] = act
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)

    # keep every clip as its own action (fake user) - the FBX exporter writes each one
    # as a separate take ("all actions" mode), which UE imports as separate AnimSequences
    if rig.animation_data is None:
        rig.animation_data_create()
    for act in actions.values():
        act.use_fake_user = True
    rig.animation_data.action = actions.get(BASE_CLIP)

    # Transforms are NOT applied to the armature: applying scale to a rig does not rescale
    # the location keys in its actions, which would throw root/hip motion 100x off.
    # The FBX exporter's FBX_SCALE_ALL handles units instead. Only meshes get cleaned.
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig] + meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig

    out = os.path.join(a.out, f"{a.name}_SK.fbx")
    bpy.ops.export_scene.fbx(
        filepath=out,
        use_selection=True,
        object_types={'ARMATURE', 'MESH'},
        apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_ALL',
        axis_forward='-Y', axis_up='Z',
        primary_bone_axis='X', secondary_bone_axis='-Z',
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=True,
        bake_anim_use_nla_strips=False,
        bake_anim_force_startend_keying=True,
        mesh_smooth_type='FACE',
        path_mode='COPY', embed_textures=True,
    )
    print(f"[PearlCove] exported {out} with clips: {', '.join(actions)}")


main()
