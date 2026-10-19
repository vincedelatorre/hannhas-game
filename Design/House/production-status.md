# Production status: The Enchanted Island House

## Batch 1 (19 Oct 2026): discovery, standards, interaction system, kitchen vertical slice

### Kitchen prototype checklist (from the blueprint)

| # | Acceptance item | Status | How it was tested |
| --- | --- | --- | --- |
| 1 | Character can walk into the kitchen | **Done** | From the beach, "E: Go inside the house" at the clubhouse door, then open the kitchen door and walk through (scripted sim run) |
| 2 | Refrigerator opens and closes | **Done** | Main door swings about its left hinge to 105° in 0.6 s, interior light on; freezer door works the same way |
| 3 | Food can be removed and placed | **Done** | Milk taken from the fridge door shelf and put on the counter; the fridge is closed with it out |
| 4 | Sink produces animated water | **Done** | Tap lever turns 90°; streaked water stream, splashes, basin water, running-water sound |
| 5 | Cup fills when placed under the faucet | **Done** | Mug in the sink fills to 0.97 in 3.5 s, keeps its level when the tap is off, and can be drunk |
| 6 | Cabinet and drawer open correctly | **Done** | Hinged cupboard reaches fully open; drawer slides 0.4 m with its contents (wooden spoon inside) |
| 7 | Character performs an interaction animation | **Done** | New Wren clips (generated with Higgsfield, fitted onto her skeleton): `PickUp`, `OpenDoor`, `Cheer`; she also sits on the kitchen chairs |
| 8 | A simple cupcake-making activity works | **Done** | Flour + milk into the bowl, then stir with the spoon, then bowl into the oven, close the door, turn the knob, bake 6 s with a glow, ding: 3 cupcakes appear. You can eat them. |
| 9 | Interactions persist after save/load | **Done** | After reload: item positions, mug fill, open drawer, closed fridge, cupcakes and recipe progress are all restored |

All nine were tested in headless Chrome with the WebGL fallback renderer. They have
**not** been played by hand on a real GPU and WebGPU yet, so the next step is a
hand-play check on the live site.

### What was created this batch

- **Assets created (Higgsfield):**
  - 19 3D models: 12 food and kitchenware items (Tripo H3.1) and 7 furniture/decor items (Tripo H3.1)
  - 10 images: 6 seamless textures, a window view, two artworks and a rug
  - 3 rigged Wren animation clips
  - 22 reference images
- **Assets imported:** all 40 manifest entries build and validate (see the table below).
- **Animations added:** `PickUp`, `OpenDoor`, `Cheer` (Wren); sitting on chairs uses the
  existing `Sit` clip.
- **Interactive behaviours implemented (reusable):**
  - `Hinge`: doors, fridge, oven, cupboards
  - `Slide`: drawers
  - `Toggle`: tap, oven knob
  - `Item`: pick up, put down, use (eat, drink)
  - `Slot`: placement points that move with their drawer or door
  - `Seat`
  - `CupcakeRecipe` activity
  - an `InteractionSystem` that does targeting, the prompt bubble and touch "Use" button,
    E to use, Q to put down, and saving
- **Procedural assemblies:** fridge, two counter runs (cupboards, drawers, sink, oven),
  upper cupboards, interior doors, floor 1 shell (foyer and kitchen) with window views.

### Known defects and limits

- **SAM 3 (1 credit per model) failed for all 12 small props.** They were regenerated with
  Tripo H3.1 (9 credits each). Recorded in the manifest `history`.
- **Generated meshes come out as one piece.** Every moving part is therefore built in code
  and textured with the generated materials. This is by design, not a placeholder.
- **Not built yet:**
  - The foyer staircase is blocked: floor 2 is the next milestone.
  - The living-room door is locked: next milestone.
- **Pickups are not hand-perfect:** they snap to Wren's right hand bone with a fixed grip
  offset (no IK). Large items (fruit bowl, cookie jar) look big in her hand.
- **Sitting is only on the kitchen chairs.** The bar stool is decorative: the sit animation
  is chair height.
- **The outdoor test script still walks with W.** W is now the water power, so the outdoor
  regression script needs updating to the arrow keys. The game itself is fine.

### Performance

- **Interior:** about 150 draw calls, 4 point lights (pendant, kitchen, foyer, fridge,
  plus the oven glow while baking). The outdoor world is hidden while you are inside, so
  the house is cheaper to render than the beach.
- **Model sizes:** the 19 new models total about 3.0 MB (meshopt + WebP).

### Recommended next batch

1. Living room: sofa (seat), lamp toggle, TV playing a short Higgsfield-made cartoon,
   bookshelf, window shutters.
2. Floor 2 staircase, bathroom (toilet lid and flush, bath fill and drain, bubbles), and
   bedrooms (bed, sleep, wardrobe).
3. Rooftop clubhouse with the telescope (camera mode, zoom, landmarks) and the slide entry
   from the top floor.

<!-- validation:start -->
Automated check (2026-10-19): 40/40 valid.

| Asset | Kind | Valid | Notes |
| --- | --- | --- | --- |
| SM_Kitchen_Cupcake | model | yes | 3758 tris, 123 KB |
| SM_Kitchen_MilkBottle | model | yes | 2728 tris, 62 KB |
| SM_Kitchen_JuiceJug | model | yes | 2880 tris, 67 KB |
| SM_Kitchen_Apple | model | yes | 1852 tris, 36 KB |
| SM_Kitchen_Cheese | model | yes | 1863 tris, 37 KB |
| SM_Kitchen_Strawberries | model | yes | 3832 tris, 108 KB |
| SM_Kitchen_Mug | model | yes | 2923 tris, 61 KB |
| SM_Kitchen_MixingBowl | model | yes | 2870 tris, 49 KB |
| SM_Kitchen_CookieJar | model | yes | 3792 tris, 92 KB |
| SM_Kitchen_Teapot | model | yes | 3726 tris, 96 KB |
| SM_Kitchen_FruitBowl | model | yes | 5690 tris, 119 KB |
| SM_Kitchen_FlourSack | model | yes | 2838 tris, 64 KB |
| SM_House_Table | model | yes | 11908 tris, 204 KB |
| SM_House_Chair | model | yes | 9714 tris, 224 KB |
| SM_House_Monstera | model | yes | 15997 tris, 258 KB |
| SM_House_PendantLamp | model | yes | 7354 tris, 237 KB |
| SM_Kitchen_CopperPots | model | yes | 10000 tris, 203 KB |
| SM_House_BarStool | model | yes | 7723 tris, 211 KB |
| SM_Kitchen_Pantry | model | yes | 13390 tris, 294 KB |
| T_Kitchen_Floor | texture | yes | 123 KB |
| T_Wall_Plaster | texture | yes | 133 KB |
| T_Cabinet_Turquoise | texture | yes | 149 KB |
| T_Countertop_Marble | texture | yes | 99 KB |
| T_Honey_Wood | texture | yes | 150 KB |
| T_Backsplash | texture | yes | 83 KB |
| T_Window_View | texture | yes | 400 KB |
| T_Art_Fruit | texture | yes | 169 KB |
| T_Art_Turtle | texture | yes | 86 KB |
| T_Rug_Tropical | texture | yes | 263 KB |
| Wren_PickUp | clip | yes | 23 channels, 181 keys |
| Wren_OpenDoor | clip | yes | 23 channels, 157 keys |
| Wren_Cheer | clip | yes | 23 channels, 57 keys |
| Fridge | assembly | yes | built in code |
| North counter run | assembly | yes | built in code |
| East counter run | assembly | yes | built in code |
| Sink + faucet | assembly | yes | built in code |
| Upper cupboards | assembly | yes | built in code |
| Kitchen door | assembly | yes | built in code |
| Floor 1 shell | assembly | yes | built in code |
| Wooden spoon | assembly | yes | built in code |
<!-- validation:end -->
