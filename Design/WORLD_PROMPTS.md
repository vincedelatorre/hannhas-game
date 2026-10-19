# Hannah's Game — world-building prompt playbook

Feed these to Claude **one at a time, in order**. Each bullet is a separate prompt. Wait for each
one to land, look at the result, then send the next (or add your own feedback prompt in between,
which is how the best results happen: "the foam looks fake", "she slides when she stops", etc.).

The world is built in the browser with three.js (WebGPU + TSL), using the high-detail Higgsfield
models already in this repo. It is built to keep growing: Pearl Cove is zone 1, and every system
below is written so new islands, characters, powers and quests plug in without rewrites.

Ground rules that apply to every prompt (paste this block first, once):

```
we're building Hannah's Game in three.js: a kids' open world (ages 6-12) with AAA, Unreal-level
graphics that are hyper-realistic but whimsical. Pearl Cove is zone 1: beach cove, 4-level bamboo
clubhouse, lagoon pool, tide pools, jungle, jetty. hero is Wren (clam shell with water power, super
speed, love power), with a boy companion. use the models, clips and textures in Tools/asset_manifest.json
and docs/assets. use WebGPU and TSL with a WebGL2 fallback. target 60fps on a mid laptop and 30fps
on an iPad. kid-safe always: no violence, nothing scary, modest outfits. keep it modular so new
zones, characters, powers and quests can be added later. after every change, capture screenshots
from several angles and fix what looks wrong before telling me it's done.
```

---

## Progress (updated as prompts are completed)

| Phase | Status | What exists now (docs/game) |
| --- | --- | --- |
| 1 Foundations | Mostly done | three.js r184 WebGPU + TSL with WebGL 2 fallback, modular engine, zone data file, asset registry, quality tiers, FPS/stats (F3), automated asset build on GitHub. Not yet: Vite build, asset viewer page |
| 2 Terrain | Started | Splat material with real textures, anti-tiling, macro variation, dynamic beach wetness, footprints, instanced grass with gusts, pebbles, coconuts, all props placed and snapped. Solid props: convex-hull colliders for rocks, bushes, coral and driftwood, walkable jetty, stone steps up the east cliff. Not yet: tessellation, stream, dithered LOD fades |
| 3 Water | Mostly done | Gerstner ocean damped by depth, swash run-up, Beer's law absorption, refraction (WebGPU), shore and crest foam, lagoon and tide pools that fill, ripples, swimming, diving, animated caustics, light absorbed with depth, underwater view (fog, surface from below, grade), reef with generated coral and sea grass models. Not yet: FFT, breaking waves |
| 4 Sky and light | Started | Physical sky with clouds, image-based light from the sky, shadows that follow the player, AO (full resolution), bloom, ACES, grading, vignette, SMAA, stars, moon, torch lights, time-of-day/sun/sea/wind settings. God rays are built but switched off: they washed the whole frame out and striped it. Not yet: cascaded shadows, volumetric clouds, TAA |
| 5 Wren | Mostly done | Rapier character controller, blend tree (idle, walk, skip, run, sprint, swim), retargeted clips, coyote time, jump buffer, backflip double jump, walkable clubhouse, a 436 m first-person slide ride (neon ring tunnel, windy spiral, clear blue glass over the island, two big drops, rainbow bumps, corkscrew) with real speed from gravity and wall-riding in corners, legs visible out in front, swing. Not yet: foot IK, look-at, hair/dress physics, ladders |
| 6 Powers | Started | Water stream with splashes and ripples, love burst with hearts and flowers that bloom from the sand, super speed trail and FOV kick. Not yet: real fluid, run on water |
| 7 Companion | Started | Follows with physics, catches up, waves, cheers, swims, talks in speech bubbles (event lines and hints from the zone's dialogue data). Not yet: navmesh, commands, co-op |
| 8 Life | Started | Seagull, crabs, butterflies, four schools of reef fish (boids that scatter from swimmers, one species from a generated model), a sea turtle, a pod of leaping dolphins with splashes, scarlet macaws circling over the jungle (all generated models). Not yet: hermit crabs, jumping fish, night creatures |
| 10 UI | Started | Photo mode (P): free camera, five filters, saves a picture. Dialogue lines and quest data in the zone file, bonus sea turtle quest. Progress saves in the browser, with a "Start the island again" button. Not yet: journal |
| 9, 12, 13 | Not started | Clubhouse interior, world streaming, zone 2, polish passes |
| 11 Audio | Started | Generated recorded-style ambience, music, footsteps, splashes, powers, pickups |

## Phase 1 — Foundations

- set up the project for a world that will grow: Vite + three.js WebGPURenderer with TSL, a small engine layer (world, zones, entities, systems, asset registry, input, audio, save), and a zone file format so Pearl Cove is data, not hard-coded. keep the current docs/index.html game working until the new one replaces it. deploy the build to docs/ so the Play link uses it.
- load every model from docs/assets with GLTFLoader + meshopt, real-world scale, correct facing, origin at the base. build an asset viewer page I can open to spin any model, see its triangle count, textures and animations.
- show FPS, draw calls, triangles and GPU time in the upper-left (toggle with F3). remove the html body margin.
- build a performance budget system: quality tiers (low/medium/high/ultra) picked automatically from the device, with a manual override. every later feature must register its cost and respect the tier.

## Phase 2 — Terrain and the island

- terrain needs to be AAA. rebuild Pearl Cove's terrain from the heightmap in Unreal/Landscape with GPU tessellation or clipmaps, organic features (dunes, rock shelves, a stream down from the jungle), and real PBR materials: dry sand, wet sand, jungle floor, grass, coastal rock. use the tileable textures in docs/assets/textures, add detail normals, macro variation and no visible tiling.
- beach wetness: sand darkens and gets glossy near the waterline and where waves wash up, then dries over time.
- add footprints in the sand that fill in slowly, and little sand puffs when Wren runs.
- place the clubhouse, swing, chest, torches, boulders, driftwood and shells from Unreal/Python/pearl_cove_layout.json. snap everything to the terrain, add contact shadows so nothing floats.
- vegetation: realistic palms, hibiscus, ferns, grass and jungle trees with wind sway (trunk bend + leaf flutter), subsurface light through leaves, instancing, LODs that fade in with a bayer dither instead of popping, and a dense jungle band behind the clubhouse.
- add small details everywhere: pebbles, shell bits, seaweed lines, coconuts under palms, crabs' holes, flowers along paths, a rope fence, lanterns on the clubhouse.

## Phase 3 — Ocean and water

- build the ocean: FFT or Gerstner cascade waves with no tiling, calm-to-playful sea states, depth-based color (bright turquoise shallows to deep blue), reflection, refraction, subsurface scattering, Beer's law absorption, sun glints and persistent foam. it should look real but friendly, never stormy.
- shoreline: waves feel the shallowing bottom, gently roll and break, wash up the sand with a rounded leading edge, foam that advects and fades into wet sand. break the shoreline up into several small breakers, not one long roller.
- underwater caustics on the lagoon floor and shallows that follow the actual waves. no flicker, no noise, no visible edges.
- the lagoon pool and tide pools: still, crystal-clear water you can see the floor through, small ripples when Wren steps in, and the tide pools visibly refill when she uses water power.
- seamless air-to-water transition: when the camera dips under, render above and below the surface correctly with a clean waterline, underwater fog and light shafts. no screen warping.
- swimming: Wren wades, then swims when the water gets deep, with a smooth transition. underwater she can explore a small reef with corals, sea grass, colorful fish schools and a friendly sea turtle.
- when Wren comes out of the water, droplets on the camera roll away and her hair and dress look wet for a bit.

## Phase 4 — Sky, light and atmosphere

- dynamic physically-based sky with soft volumetric cumulus (broad, low, detailed bases) and a subtle wispy cirrus layer across the whole sky. no grain, no marshmallow towers. keep it fast.
- day/night cycle with a golden-hour default. sun azimuth and time of day controls. at night: stars, a big moon, bioluminescent shoreline sparkles, fireflies in the jungle.
- cascaded shadow maps with soft blended cascades, screen-space contact shadows, ambient occlusion that doesn't flicker or haze thin objects (ropes, nets, leaves).
- image pipeline: ACES filmic tone mapping, temporal anti-aliasing, subtle bloom, light vignette, atmospheric haze, god rays through the palms, bounce light, and very subtle floating pollen and sea mist. nothing should look blurry.
- every lantern, torch and window light casts real light at night, with flickering flames and lanterns that sway on ropes.

## Phase 5 — Wren: movement, physics and animation

- character controller with real physics (Rapier): walk, run, jump, slopes, stairs, step-up, slide on steep rock, push into water. third-person camera that never clips through the clubhouse or palms, with a first-person toggle.
- animation system: blend tree between idle, walk, skip, run and sprint driven by actual speed, with foot locking so she never slides. use the retargeted clips in docs/assets/models.
- add procedural layers on top of the clips: head and eyes look at nearby friends and points of interest, foot IK on uneven sand, lean into turns, breathing.
- hair, dress and ponytail physics with spring bones so they bounce and flow in the wind and when she runs, jumps and swims.
- jump, double-jump backflip, landing squash and dust puff. coyote time and jump buffering so it feels great for kids.
- ledge grab and climb on the clubhouse ladders and rope bridge. let her climb up and explore every level of the clubhouse.
- the clubhouse water slide: a real ride with physics along the slide, water flowing in the tube, spray, and a big splash into the lagoon.

## Phase 6 — Powers

- water power: water gathers from the clam and shoots out as a real fluid stream (particles + surface rendering) that arcs with gravity, splashes, wets surfaces and fills containers. holding it makes a water whip; tapping makes a splash burst. it should look like real water with sparkle.
- super speed: motion blur, speed lines, a sparkling mint trail, footprints that kick up sand, Wren can run across water for a short distance. the world slightly slows around her.
- love power: a warm pink glow that ripples out, floating hearts with soft light, flowers bloom where it passes, sad animals cheer up, wilted plants come back. it should feel magical, not cheesy.
- power energy: the pearl in the clam glows with charge level. powers have cooldowns and fun sound and haptic feedback on gamepad and phone.
- build the powers as a plug-in system so we can add new ones later (the boy's powers, upgrades from treasure chests).

## Phase 7 — The companion

- the boy companion follows Wren with pathfinding (navmesh around the clubhouse, rocks and water), keeps a natural distance, catches up with a run, and waits when she stops.
- give him personality: he looks around, points at secrets, waves, cheers when quests complete, does a backflip on the beach, sits on the swing when idle for a while.
- he can be told to "wait here" or "follow me", and holds hands with Wren for a co-op jump.
- leave a hook for his own powers (to be designed later) and a second-player mode where a parent or friend controls him (split keyboard or second gamepad).

## Phase 8 — Life in the world

- add creatures: crabs that scuttle away when you get close and peek out of holes, seagulls that land, walk and take off, parrots in the palms, butterflies around the hibiscus, fish in the lagoon, a sea turtle that swims by the jetty, dolphins jumping out at sea.
- make every creature react to Wren's powers: crabs dance after love power, fish follow the water stream, birds scatter at super speed then come back.
- add ambient life: leaves falling from palms, coconuts that can drop, flags and curtains in the wind, wind chimes on the clubhouse.

## Phase 9 — The clubhouse

- the clubhouse interior: every floor is explorable with rooms (shell museum, art room, reading nook with hammocks, observatory with a telescope you can look through at night). real PBR materials: woven bamboo, rattan, painted wood, glass, fabric.
- the shell museum fills up with the shells Wren collects, each one on display.
- interactive things: doors that open, a telescope, a working water pump, a slide, a swing, a rope bridge that sways when you walk on it, lights you can switch on.

## Phase 10 — Gameplay, quests and UI

- quest system driven by data files: steps, triggers, rewards, dialogue. move the current five Pearl Cove quests into it and add a short story intro.
- dialogue with friendly characters: speech bubbles, simple choices, voice blips, and portraits. kid-readable text with optional read-aloud.
- collectibles: glowing shells, hidden pearls, sea glass. a journal that shows what's been found with pictures.
- beautiful kid-friendly UI: quest tracker, minimap and full map, power wheel, settings. big buttons, icons, works with touch, mouse, keyboard and gamepad.
- save and load progress automatically, with three save slots.
- photo mode: freeze time, move the camera, add filters and stickers, save the picture.

## Phase 11 — Audio

- real recorded sounds only, no synthetic beeps: waves on sand, wind in palms, birds, footsteps that change on sand, wood and water, splashes, the water power, a soft magical shimmer for love power. pull them from free libraries with proper licenses and list the credits.
- 3D positional audio with distance falloff and occlusion, ocean louder near the shore, music that changes gently by zone and time of day.
- walking sounds subtle, never repetitive (randomized pitch and samples).

## Phase 12 — Growing the world

- set up world streaming so we can add more islands: zones load and unload around the player, with a boat trip or bridge between them and no loading screens.
- build a little rowboat at the jetty that Wren and her friend can paddle, with physics, wake and spray. it's how they reach zone 2.
- design zone 2 as data only (layout, terrain, assets list, quests) to prove the pipeline works, using placeholders where models don't exist yet. list what new models we need to generate.
- write a short guide in the repo for adding a new zone, creature, power or quest.

## Phase 13 — Polish and verification (repeat as needed)

- what special polish could you add to really push this over the edge? what do AAA games and animated films do that turns something from okay to wow? implement the best ideas without breaking the perf budget.
- capture views from the beach, the clubhouse top deck, underwater, at night, and from the jetty, and compare them to the hero renders in Design/. list what still looks off and fix it.
- performance pass: profile on low, medium and high. find the biggest costs and optimize. don't let it get away from you.
- test on a phone and an iPad layout. touch controls must feel great for a 7-year-old.
- kid-safety and accessibility pass: colorblind-friendly cues, subtitles, no flashing, adjustable difficulty, a calm mode.

---

## Feedback prompts to use between steps

Short, specific feedback is what drives quality. Examples in the right style:

- the foam looks like puffs. look up real reference and redo it.
- Wren slides when she stops running. fix foot locking.
- clouds are grainy and look like marshmallows. make them broader, flatter and smoother.
- the palm trunks look cartoony. improve the bark texture and the distant trees.
- there's flickering on the water when the camera moves.
- shadows under the clubhouse are weak and have a hard cutoff between cascades.
- performance dropped. find out why and fix it before adding anything else.
- what's the status? what's left?
