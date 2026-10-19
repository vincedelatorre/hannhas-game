# Discovery and Architecture: The Enchanted Island House

This document covers Part A of the production blueprint. It records how the game
works today and how the house fits into it.

## 1. Existing architecture

| Area | What exists | Where |
| --- | --- | --- |
| Rendering | three.js r184 `WebGPURenderer` with automatic WebGL 2 fallback, TSL node materials, post chain (AO, bloom, S-curve grade, SMAA/FXAA), quality tiers | `docs/game/render.js`, `quality.js` |
| Engine choice | Plain ES modules with an import map, no bundler, served by GitHub Pages from `/docs`. React Three Fiber is **not** used. Rewriting into R3F would mean redoing every system, so the blueprint's "unless the project already uses a different engine" applies. | `docs/index.html` |
| Physics | Rapier 0.19 (WASM): terrain heightfield, trimesh, convex hull, cuboid and cylinder colliders, kinematic character controller with auto-step and slopes | `physics.js` |
| Characters | Wren and her friend: skinned GLB, base skeleton plus retargeted clips (walk, skip, run, sprint, jump, backflip, water cast, love, swim idle, swim, sit). Blend tree, one-shot clips, head look-at, an `afterPose` hook and rest-pose table. | `characters.js` |
| Camera | Third person orbit with ray collision; first-person view (V); photo mode (P); first-person slide ride | `main.js`, `slide.js` |
| Input | Arrow keys move; W water, L love, D dive, S surface, Space jump, Shift speed, C walk; touch buttons and joystick; gamepad | `ui.js` |
| Interactions today | Proximity triggers coded per feature (shells, tide pools, swing, slide ring, chest). There is no shared interaction system yet. | `gameplay.js`, `main.js` |
| Save / load | `localStorage` key `hg.save.pearl_cove` holding quest flags, shells and pools | `gameplay.js` (`Quests.save/load`) |
| Audio | Web Audio buses; generated samples (surf, music, steps, splashes, powers) plus synth fallbacks | `ui.js` (`Audio`) |
| Coordinates | Metres. three.js +Y up. The island blockout frame is x east, y inland; three.js Z = −y. The sea is toward +Z. | `world.js` |
| Asset pipeline | `Tools/asset_manifest.json` lists source GLB/texture/audio URLs. A GitHub Action downloads them, simplifies with meshopt, converts textures to WebP, retargets clips and commits `docs/assets`. | `Tools/web/*.mjs`, `.github/workflows/web-assets.yml` |
| Tests | Headless Chrome with SwiftShader through Playwright, plus a deterministic `game.sim(seconds, keys)` stepping API. Visual checks use frame capture. | outside the repo, in the session bench |

## 2. Existing asset inventory (relevant to the house)

| Asset | Status |
| --- | --- |
| `SM_PearlCove_Clubhouse` | 220 k-tri exterior (4 levels, generated). It is one fused mesh with no interior. Kept as the house exterior and its front door becomes the entrance. |
| Wren and Boy | Rigged and in the game, with 11 and 8 clips |
| Textures | Sand, rock, jungle floor, bamboo, thatch, tide pool |

## 3. Higgsfield capabilities (checked in this session)

| Capability | Tool / model | Cost seen | Use |
| --- | --- | --- | --- |
| Concept and reference images | `gpt_image_2_5` | 0.25 credits | Object references, tileable textures |
| Image to textured 3D (cheap) | `sam_3_3d` | 1 credit | Small props: food, cups, jars |
| Image to textured PBR 3D | `tripo_h3_1_image_to_3d` | 9 credits | Furniture and decor |
| Image to 3D (Meshy) | `image_to_3d` | 30 credits | Hero props when needed |
| Rig and animate an existing model | `3d_rigging` + `animation_action_id` | 8 credits | New Wren clips (pick up, open door, cheer) |
| Text to 3D | Meshy 6, Tripo, Hunyuan | 9 to 40 | Not needed yet |
| 3D scene builder (3D Jutsu) | `scene_builder_3d_*` | — | Not used. The house is assembled in code so that it is interactive. |

**Limitation:** generated meshes come back as one fused piece with no separate doors or
drawers and no pivots. So every moving part is a separate parametric piece built in
code (`docs/game/house/parts.js`) and textured with generated materials. Generated
models are used for all static and pick-up objects.

## 4. How the house plugs in

```
Beach (outdoor zone) --front door trigger--> House interior (separate group, far below the island)
                     <--front door / exit---
```

- The interior is built once at load and parked out of sight 1 km below the island,
  so no streaming is needed for one floor. When Wren steps into the clubhouse
  doorway, the screen fades, the player and camera teleport inside, the outdoor
  world is hidden and the interior lights turn on. Leaving reverses it.
- The interior uses the same Rapier world, character controller, camera, input and
  save system. Only a new **interaction system** is added (section 5).
- Each floor is a module (`house/floor1.js`, …). Rooms are built from a small kit:
  floor slab, walls with door and window cut-outs, arches, beams, trims. Furniture
  and appliances are placed from a room layout table.

## 5. Interaction architecture

See `interaction-spec.md`. In summary:

- `Interactable`: id, display name, anchor, radius, actions, state, save flag.
- Behaviours: `Hinged`, `Sliding`, `Toggle`, `Pickup`, `Placement` (slots), `Water`
  (faucet, fill), `Appliance` (oven), `Activity` (cupcake recipe), `Seat`.
- `InteractionSystem`:
  - finds the best target in front of Wren and shows a prompt ("E: Open fridge"; see
    the key note in interaction-spec);
  - runs the action and plays the matching Wren clip;
  - stores state in the house save (`hg.save.house`).

## 6. Milestones

1. Done: discovery, art bible, manifest, interaction spec.
2. **Kitchen vertical slice** (blueprint checklist of 9 items).
3. Living room, then bathroom, then playroom, then bedrooms, then theatre, then
   clubhouse top (telescope).

Each milestone ends with a production report in `production-status.md`.
