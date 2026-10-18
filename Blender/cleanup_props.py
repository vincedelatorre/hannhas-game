"""
Pearl Cove - batch clean-up of AI-generated static props before Unreal.

For every .glb in --dir:
  - imports it, joins its meshes into one object named after the file
  - applies rotation/scale, moves the origin to the bottom centre (so props sit on the ground)
  - optionally scales to a real-world height from HEIGHTS_M
  - merges duplicate vertices, recalculates normals
  - writes <name>.glb  (UE: enable Nanite on import for anything over ~5k tris)
  - writes <name>_LOD1.glb at 50% and <name>_LOD2.glb at 20% for non-Nanite fallback

Usage:
  blender -b -P cleanup_props.py -- --dir ./Assets --out ./Assets/Clean
"""
import argparse
import os
import sys

import bpy
from mathutils import Vector

HEIGHTS_M = {
    "SM_PearlCove_Clubhouse": 16.0,
    "SM_PalmTree": 10.0,
    "SM_PalmSwing": 4.8,
    "SM_Shells_Cluster": 0.25,
    "SM_Boulder_Mossy": 1.6,
    "SM_Hibiscus": 1.4,
    "SM_TikiTorch": 1.9,
    "SM_Driftwood": 0.6,
    "SM_TreasureChest": 0.7,
    "SM_Clam_Pearl": 0.18,
}


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--dir", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def clean_one(path, out_dir):
    name = os.path.splitext(os.path.basename(path))[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if not meshes:
        return
    # un-parent first while keeping each mesh's world transform (glTF parent nodes
    # often carry the rotation/scale), then join
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # real-world height
    zs = [(obj.matrix_world @ Vector(c)).z for c in obj.bound_box]
    h = max(zs) - min(zs)
    if name in HEIGHTS_M and h > 0:
        s = HEIGHTS_M[name] / h
        obj.scale = (s, s, s)
        bpy.ops.object.transform_apply(scale=True)

    # bottom-centre origin
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    cx = sum(v.x for v in bb) / 8.0
    cy = sum(v.y for v in bb) / 8.0
    cz = min(v.z for v in bb)
    bpy.context.scene.cursor.location = (cx, cy, cz)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.location = (0, 0, 0)

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, name + ".glb"), export_format='GLB',
                              use_selection=True, export_yup=True)
    for lod, ratio in (("LOD1", 0.5), ("LOD2", 0.2)):
        mod = obj.modifiers.new("Decimate", 'DECIMATE')
        mod.ratio = ratio
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, f"{name}_{lod}.glb"), export_format='GLB',
                                  use_selection=True, export_yup=True, export_apply=True)
        obj.modifiers.remove(mod)
    print(f"[PearlCove] cleaned {name}: height {HEIGHTS_M.get(name, round(h, 2))} m")


def main():
    a = parse()
    for f in sorted(os.listdir(a.dir)):
        if f.lower().endswith(".glb"):
            clean_one(os.path.join(a.dir, f), a.out)


main()
