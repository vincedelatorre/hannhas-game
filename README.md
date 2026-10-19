# Hannah's Game — Pearl Cove starting zone kit

## [▶ Play Hannah's Game](https://vincedelatorre.github.io/hannhas-game/)

A browser prototype of Pearl Cove: explore the beach and clubhouse, collect glowing
shells, ride the water slide, refill the tide pools with water power, cheer up the
seagull with love power, and open the treasure chest. Works with keyboard and mouse or touch.

Everything else here stands up the same zone in Unreal Engine 5.8 (the real game).
The full plan is in the "Pearl Cove — Starting Zone Build Bible" doc (see `Design/`).

## What's here

| Path | What it is |
| --- | --- |
| `docs/index.html` | The playable browser prototype (served by GitHub Pages) |
| `Design/WORLD_PROMPTS.md` | Step-by-step prompt playbook for building the full three.js world |
| `Tools/web/` | Builds browser-ready models, animations and textures into `docs/assets` (runs automatically on GitHub) |
| `Tools/asset_manifest.json` | Every generated 3D file and texture with download links: the original set, plus the high-detail set (`hires`, `characters_hires`, `materials`) |
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
blender -b -P Blender/cleanup_props.py -- --dir Assets/HiRes --out Assets/HiRes/Clean
blender -b -P Blender/merge_character_animations.py -- --name Wren --dir Assets/HiRes/Wren --out Export
blender -b -P Blender/merge_character_animations.py -- --name Boy  --dir Assets/HiRes/Boy  --out Export
```

The high-detail set (`Assets/HiRes`) is what the game should use: every prop and both characters
rebuilt from 2K turnaround views with detailed geometry and PBR materials. The Unreal script picks
them up automatically and falls back to the original models for anything missing. Seven tileable
4K-class textures land in `Assets/Textures` for the landscape and building materials.
The prompts that made all of it are in `Design/PROMPTS.md`. The new clubhouse may face a different
way than the old one; if it does, change `ASSET_YAW_OFFSET` in the Unreal script.

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
