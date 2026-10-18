"""
Pearl Cove - Unreal Engine 5 level builder (Editor Python).

What it does, in one run inside the editor:
  1. Imports every .glb/.fbx in SOURCE_DIR into /Game/PearlCove/Meshes (Interchange).
  2. Builds the outdoor lighting stack (sun, sky atmosphere, sky light, clouds, fog,
     post process) tuned for a warm "whimsical tropical afternoon".
  3. Spawns the Water plugin ocean (and a lake body for the lagoon pool) if the
     Water plugin is enabled.
  4. Places the clubhouse, props, hero palms and gameplay markers from
     pearl_cove_layout.json, snapping each to the landscape with a line trace
     and auto-scaling each mesh to its real-world height.
  5. Drops a PlayerStart on the beach facing the clubhouse.

Before running:
  - UE 5.7 or 5.8 project (Third Person template is a good base).
  - Plugins enabled: Python Editor Script Plugin, Water, Interchange (default),
    Procedural Content Generation Framework, Niagara.
  - Landscape already imported from PearlCove_Heightmap_1009.png
    (see Unreal/Landscape/make_heightmap.py for the exact import settings).
  - Asset files downloaded into SOURCE_DIR with the names in ASSET_FILES
    (run Tools/fetch_assets.py on your machine first).

Run: Tools > Execute Python Script... > ue_build_pearl_cove.py
     (or in the Output Log's Python console:
      p = r"<path>/ue_build_pearl_cove.py"; exec(open(p).read(), {"__file__": p, "__name__": "__main__"}))
Re-running is safe: actors are tagged "PearlCove" and are deleted before rebuild.
"""
import json
import math
import os
import random

import unreal

# ------------------------------------------------------------------ config
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else ""
SOURCE_DIR = os.path.join(HERE, "..", "..", "Assets")          # where fetch_assets.py saved files
LAYOUT_JSON = os.path.join(HERE, "pearl_cove_layout.json")
DEST = "/Game/PearlCove/Meshes"
TAG = "PearlCove"
RANDOM_SEED = 7

# layout id -> source file name in SOURCE_DIR
ASSET_FILES = {
    "SM_PearlCove_Clubhouse": "SM_PearlCove_Clubhouse.glb",
    "SM_PalmTree": "SM_PalmTree.glb",
    "SM_PalmSwing": "SM_PalmSwing.glb",
    "SM_Shells_Cluster": "SM_Shells_Cluster.glb",
    "SM_Boulder_Mossy": "SM_Boulder_Mossy.glb",
    "SM_Hibiscus": "SM_Hibiscus.glb",
    "SM_TikiTorch": "SM_TikiTorch.glb",
    "SM_Driftwood": "SM_Driftwood.glb",
    "SM_TreasureChest_Tutorial": "SM_TreasureChest.glb",
}
# SM_Clam_Pearl.glb is a character prop: import it by hand and attach it to Wren's hand_r socket.

# AI-generated meshes face the camera they were made from; tweak if one faces the wrong way.
# Values are added to the layout yaw (degrees).
ASSET_YAW_OFFSET = {
    "SM_PearlCove_Clubhouse": 90.0,
}

# Sun: late-afternoon, from behind the camera's right shoulder when facing the clubhouse.
SUN_PITCH = -38.0
SUN_YAW = 115.0

# ------------------------------------------------------------------ helpers
actor_sys = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
eal = unreal.EditorAssetLibrary


def world():
    return unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()


def to_ue(x_m, y_m, z_m=0.0):
    """Blockout metres (Y = inland) -> Unreal centimetres (UE's Y axis is flipped)."""
    return unreal.Vector(x_m * 100.0, -y_m * 100.0, z_m * 100.0)


def yaw_to_ue(yaw_deg):
    # layout yaw 0 = facing the sea (blockout -Y) = UE +Y = UE yaw 90
    return 90.0 - yaw_deg


def tag(actor, folder):
    tags = list(actor.tags)
    tags.append(unreal.Name(TAG))
    actor.tags = tags
    actor.set_folder_path(unreal.Name(f"PearlCove/{folder}"))
    return actor


def clear_previous():
    removed = 0
    for a in actor_sys.get_all_level_actors():
        if unreal.Name(TAG) in a.tags:
            actor_sys.destroy_actor(a)
            removed += 1
    unreal.log(f"[PearlCove] removed {removed} previous actors")


IMPORTED = {}   # layout id -> StaticMesh


def source_path(fname):
    # prefer the Blender-cleaned file (Assets/Clean), fall back to the raw download
    for d in (os.path.join(SOURCE_DIR, "Clean"), SOURCE_DIR):
        p = os.path.normpath(os.path.join(d, fname))
        if os.path.exists(p):
            return p
    return None


def first_static_mesh(paths):
    for p in paths:
        a = eal.load_asset(str(p))
        if isinstance(a, unreal.StaticMesh):
            return a
    return None


def import_assets():
    jobs = []
    for asset_id, fname in ASSET_FILES.items():
        path = source_path(fname)
        if not path:
            unreal.log_warning(f"[PearlCove] missing source file: {fname}")
            continue
        t = unreal.AssetImportTask()
        t.filename = path
        t.destination_path = f"{DEST}/{os.path.splitext(fname)[0]}"   # one folder per file
        t.automated = True
        t.replace_existing = True
        t.save = True
        jobs.append((asset_id, t))
    if jobs:
        asset_tools.import_asset_tasks([t for _, t in jobs])
    for asset_id, t in jobs:
        mesh = first_static_mesh(t.get_editor_property("imported_object_paths") or [])
        if mesh is None:   # some importers report only the package; search its folder
            mesh = first_static_mesh(eal.list_assets(t.destination_path, recursive=True, include_folder=False))
        if mesh is not None:
            IMPORTED[asset_id] = mesh
            try:   # Nanite for everything heavier than a few thousand triangles
                ns = mesh.get_editor_property("nanite_settings")
                ns.set_editor_property("enabled", True)
                mesh.set_editor_property("nanite_settings", ns)
                eal.save_loaded_asset(mesh)
            except Exception as e:  # noqa: BLE001
                unreal.log_warning(f"[PearlCove] Nanite not set on {asset_id}: {e}")
    unreal.log(f"[PearlCove] imported {len(IMPORTED)}/{len(ASSET_FILES)} meshes")


def find_mesh(asset_id):
    mesh = IMPORTED.get(asset_id)
    if mesh is None:
        folder = f"{DEST}/{os.path.splitext(ASSET_FILES[asset_id])[0]}"
        if eal.does_directory_exist(folder):
            mesh = first_static_mesh(eal.list_assets(folder, recursive=True, include_folder=False))
            IMPORTED[asset_id] = mesh
    if mesh is None:
        unreal.log_warning(f"[PearlCove] no StaticMesh found for {asset_id}")
    return mesh


def our_actors():
    return [a for a in actor_sys.get_all_level_actors() if unreal.Name(TAG) in a.tags]


def ground_z(x_cm, y_cm, fallback_cm=0.0):
    """Height of the landscape under (x, y). Ignores everything this script spawned,
    so props never stack on top of each other or on the water surface."""
    start = unreal.Vector(x_cm, y_cm, 20000.0)
    end = unreal.Vector(x_cm, y_cm, -5000.0)
    hit = unreal.SystemLibrary.line_trace_single(
        world(), start, end, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1, False, our_actors(),
        unreal.DrawDebugTrace.NONE, True)
    if hit is None:
        return fallback_cm
    # HitResult fields are protected in Python; to_tuple() follows Break Hit Result order:
    # (blocking, initial_overlap, time, distance, location, impact_point, ...)
    try:
        tup = hit.to_tuple()
        return tup[5].z if len(tup) > 5 else fallback_cm
    except Exception:  # noqa: BLE001
        return fallback_cm


def fit_scale(mesh, fit_height_m):
    if not fit_height_m:
        return 1.0
    b = mesh.get_bounds()
    h = max(1.0, b.box_extent.z * 2.0)
    return (fit_height_m * 100.0) / h


def place(asset_id, x, y, z, yaw, scale_mult, fit_h, folder, label):
    mesh = find_mesh(asset_id)
    if mesh is None:
        return None
    loc = to_ue(x, y)
    loc.z = (z * 100.0) if z is not None else ground_z(loc.x, loc.y)
    rot = unreal.Rotator(0.0, 0.0, yaw_to_ue(yaw) + ASSET_YAW_OFFSET.get(asset_id, 0.0))
    actor = actor_sys.spawn_actor_from_object(mesh, loc, rot)
    s = fit_scale(mesh, fit_h) * scale_mult
    actor.set_actor_scale3d(unreal.Vector(s, s, s))
    # put the mesh's bottom on the ground (AI meshes are often centred on their origin)
    b = mesh.get_bounds()
    bottom_offset = (b.origin.z - b.box_extent.z) * s
    actor.set_actor_location(unreal.Vector(loc.x, loc.y, loc.z - bottom_offset), False, False)
    actor.set_actor_label(label)
    return tag(actor, folder)


# ------------------------------------------------------------------ lighting
def build_lighting():
    sun = actor_sys.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 3000))
    sun.set_actor_rotation(unreal.Rotator(0.0, SUN_PITCH, SUN_YAW), False)
    lc = sun.get_component_by_class(unreal.DirectionalLightComponent)
    lc.set_editor_property("intensity", 10.0)          # lux; auto exposure + PPV bias do the rest
    lc.set_editor_property("light_color", unreal.Color(r=255, g=238, b=214, a=255))  # warm; positional order is b,g,r,a
    lc.set_editor_property("atmosphere_sun_light", True)
    sun.set_actor_label("PC_Sun")
    tag(sun, "Lighting")

    for cls, label in [(unreal.SkyAtmosphere, "PC_SkyAtmosphere"),
                       (unreal.VolumetricCloud, "PC_VolumetricCloud"),
                       (unreal.ExponentialHeightFog, "PC_HeightFog")]:
        a = actor_sys.spawn_actor_from_class(cls, unreal.Vector(0, 0, 0))
        a.set_actor_label(label)
        tag(a, "Lighting")

    sky = actor_sys.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 2000))
    sc = sky.get_component_by_class(unreal.SkyLightComponent)
    sc.set_editor_property("real_time_capture", True)
    sky.set_actor_label("PC_SkyLight")
    tag(sky, "Lighting")

    fog = [a for a in actor_sys.get_all_level_actors() if a.get_actor_label() == "PC_HeightFog"][0]
    fc = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    fc.set_editor_property("fog_density", 0.006)
    fc.set_editor_property("fog_inscattering_luminance", unreal.LinearColor(0.55, 0.75, 1.0, 1.0))

    ppv = actor_sys.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    ppv.set_editor_property("unbound", True)
    s = ppv.get_editor_property("settings")
    s.set_editor_property("override_auto_exposure_bias", True)
    s.set_editor_property("auto_exposure_bias", 0.6)
    s.set_editor_property("override_color_saturation", True)
    s.set_editor_property("color_saturation", unreal.Vector4(1.12, 1.12, 1.12, 1.0))
    s.set_editor_property("override_bloom_intensity", True)
    s.set_editor_property("bloom_intensity", 0.9)
    s.set_editor_property("override_vignette_intensity", True)
    s.set_editor_property("vignette_intensity", 0.25)
    ppv.set_editor_property("settings", s)
    ppv.set_actor_label("PC_PostProcess_Whimsy")
    tag(ppv, "Lighting")


# ------------------------------------------------------------------ water
def build_water(layout):
    ocean_cls = getattr(unreal, "WaterBodyOcean", None)
    lake_cls = getattr(unreal, "WaterBodyLake", None)
    if ocean_cls is None:
        unreal.log_warning("[PearlCove] Water plugin not enabled - skipping ocean/lagoon")
        return
    ocean = actor_sys.spawn_actor_from_class(ocean_cls, to_ue(0, -60, layout["water"]["ocean_level_m"]))
    ocean.set_actor_label("PC_Ocean")
    keep_terrain(ocean)
    tag(ocean, "Water")
    if lake_cls is not None:
        lp = layout["water"]["lagoon_pool"]
        lake = actor_sys.spawn_actor_from_class(lake_cls, to_ue(lp["center"][0], lp["center"][1], lp["surface_z"]))
        lake.set_actor_label("PC_LagoonPool")
        keep_terrain(lake)
        tag(lake, "Water")
        unreal.log("[PearlCove] Lagoon lake placed: reshape its spline to the pool rim rocks.")
    # water bodies auto-spawn a WaterZone; tag it so a re-run cleans it up too
    zone_cls = getattr(unreal, "WaterZone", None)
    if zone_cls is not None:
        for z in actor_sys.get_all_level_actors():
            if isinstance(z, zone_cls) and unreal.Name(TAG) not in z.tags:
                tag(z, "Water")


def keep_terrain(water_actor):
    """The landscape already has the cove carved in; stop water bodies from re-carving it."""
    targets = [water_actor]
    comp_cls = getattr(unreal, "WaterBodyComponent", None)
    if comp_cls is not None:
        c = water_actor.get_component_by_class(comp_cls)
        if c is not None:
            targets.insert(0, c)
    for t in targets:
        try:
            t.set_editor_property("affects_landscape", False)
            return
        except Exception:  # noqa: BLE001
            continue
    unreal.log_warning("[PearlCove] could not turn off 'Affects Landscape' on "
                       f"{water_actor.get_actor_label()} - untick it in the Details panel")


# ------------------------------------------------------------------ gameplay
def build_gameplay(layout):
    ps = layout["player_start"]
    loc = to_ue(ps["pos"][0], ps["pos"][1])
    loc.z = ground_z(loc.x, loc.y) + 100.0
    start = actor_sys.spawn_actor_from_class(unreal.PlayerStart, loc, unreal.Rotator(0, 0, yaw_to_ue(ps["yaw"])))
    start.set_actor_label("PC_PlayerStart_Beach")
    tag(start, "Gameplay")

    # editor-only markers your designers replace with Blueprints (quest givers, pickups, triggers)
    for key, lm in layout["landmarks"].items():
        p = lm.get("pos") or lm.get("start")
        loc = to_ue(p[0], p[1])
        loc.z = ground_z(loc.x, loc.y) + 50.0
        n = actor_sys.spawn_actor_from_class(unreal.Note, loc)
        try:
            n.set_editor_property("text", f"{key}: {lm['note']}")
        except Exception:  # noqa: BLE001  (Note text is editor-only on some builds)
            pass
        n.set_actor_label(f"PC_Note_{key}")
        tag(n, "Gameplay/Notes")


# ------------------------------------------------------------------ main
def main():
    random.seed(RANDOM_SEED)
    with open(LAYOUT_JSON, "r", encoding="utf-8") as f:
        layout = json.load(f)
    with unreal.ScopedEditorTransaction("Build Pearl Cove"):
        clear_previous()
        import_assets()
        build_lighting()
        build_water(layout)
        for a in layout["actors"]:
            place(a["id"], a["pos"][0], a["pos"][1], a["pos"][2], a.get("yaw", 0.0),
                  a.get("scale", 1.0), a.get("fit_height_m"), "Hero", a["id"])
        for group in layout["scatter"]:
            lo, hi = group.get("scale_range", [1, 1])
            for i, (x, y) in enumerate(group["points"]):
                yaw = random.uniform(0, 360) if group.get("yaw_random") else 0.0
                place(group["id"], x, y, None, yaw, random.uniform(lo, hi), group.get("fit_height_m"),
                      "Scatter", f"{group['id']}_{i:02d}")
        build_gameplay(layout)
    try:
        unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    except Exception:  # noqa: BLE001
        unreal.EditorLevelLibrary.save_current_level()
    unreal.log("[PearlCove] build complete")


main()
