# Hannah's Game — Pearl Cove starting zone kit

Everything needed to stand up the game's first zone (the beach cove and clubhouse) in
Unreal Engine 5.8. The full plan is in the "Pearl Cove — Starting Zone Build Bible" doc.

## What's here

| Path | What it is |
| --- | --- |
| `Tools/asset_manifest.json` | Every generated 3D file (clubhouse, 9 props, Wren + 7 clips, Boy + 4 clips) with download links |
| `Tools/fetch_assets.py` | Downloads them all into `Assets/` (run on your machine) |
| `Blender/cleanup_props.py` | Real-world size, bottom-centre origin, LOD1/LOD2 for every prop |
| `Blender/merge_character_animations.py` | Combines one character's clip GLBs into a single rig + FBX for Unreal |
| `Unreal/Landscape/PearlCove_Heightmap_1009.png` | 16-bit landscape heightmap (260 m x 260 m cove) |
| `Unreal/Landscape/PearlCove_Layer_*.png` | Paint-layer masks: Sand, WetSand, Grass, Rock, JungleFloor |
| `Unreal/Landscape/PearlCove_TopDown_Preview.png` | Quick look at the terrain from above (north = up) |
| `Unreal/Landscape/make_heightmap.py` | Regenerates the heightmap/masks if you change the terrain |
| `Unreal/Python/pearl_cove_layout.json` | Where everything goes (metres, blockout frame) |
| `Unreal/Python/ue_build_pearl_cove.py` | Editor script: imports props, builds sky/sun/fog/water, places the level |

The editable Blender blockout of the cove lives in the Higgsfield 3D project
"Pearl Cove - Starting Zone Blockout": https://higgsfield.ai/3d-jutsu/9ceaad35-da2f-467e-809a-1cea3dc1505a

## Quick start

```bash
python Tools/fetch_assets.py
blender -b -P Blender/cleanup_props.py -- --dir Assets --out Assets/Clean
blender -b -P Blender/merge_character_animations.py -- --name Wren --dir Assets/Wren --out Export
blender -b -P Blender/merge_character_animations.py -- --name Boy  --dir Assets/Boy  --out Export
```

Then in Unreal 5.8 (Third Person template, C++):

1. Enable plugins: Water, Water Extras, PCG Framework, Niagara, Gameplay Abilities,
   Enhanced Input, Python Editor Script Plugin. Restart.
2. Landscape mode > New > Import from File > `PearlCove_Heightmap_1009.png`,
   location 0,0,0, scale 25.794 / 25.794 / 10. Assign the five layer masks.
3. Tools > Execute Python Script > `Unreal/Python/ue_build_pearl_cove.py`.
4. Import `Export/Wren_SK.fbx` and `Export/Boy_SK.fbx` as skeletal meshes with animations.
   Attach `SM_Clam_Pearl` to Wren's right-hand socket.

## Coordinates

Blockout frame: metres, +X east, +Y inland (jungle), -Y out to sea, Z up.
Unreal: centimetres, and Y is flipped (`UE = (x*100, -y*100, z*100)`); the build script does this for you.
