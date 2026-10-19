# Interaction Spec

## Controls (child friendly: one button does the right thing)

| Input | Action |
| --- | --- |
| **E** (keyboard), the **Use** button (touch), **Y / triangle** (gamepad, while a prompt is showing; otherwise it is love power) | Do the action shown in the prompt |
| **Q** | Put down what you are holding (anywhere sensible, or in the nearest free slot) |
| Arrow keys / stick | Walk up to things; the prompt picks the object in front of Wren |

The prompt bubble shows the key and a verb, for example **E · Open fridge**,
**E · Take cupcake**, **E · Put mug here**, **E · Turn on tap**.

## Targeting

- Candidates: interactables whose anchor is within `radius` (default 1.8 m) of Wren
  and within ±70° of her facing direction, or of the camera's forward direction in
  first-person view.
- Score: distance plus angle penalty plus a bonus for things that are *inside* an open
  container. The best candidate wins, so you can reach a milk bottle inside an open
  fridge.
- An item you are holding is never a candidate. Slots become candidates only while
  you hold something.

## Behaviours

| Behaviour | States | Motion | Notes |
| --- | --- | --- | --- |
| `hinged` | `closed` ⇄ `open` (`opening` / `closing` while moving) | Rotate about the pivot axis to `angle`° over `duration` (ease in and out) | Pivot = real hinge edge. Collider follows the door. Can light an interior lamp when open. |
| `sliding` | `closed` ⇄ `open` | Translate along an axis by `distance` | Drawers. Contents ride along. |
| `toggle` | `off` ⇄ `on` | Optional part rotation (faucet handle 0 → 90°), lights, effects | Faucets, lamps, oven knob |
| `pickup` | `placed` → `held` → `placed` | Flies to Wren's right hand (0.25 s), then attaches to the `RightHand` bone | Item id, home slot, current slot saved |
| `slot` | `empty` / `filled` | — | Place targets: fridge shelves, counter spots, table spots, oven tray, sink, mixing bowl |
| `water` | Tap `off` / `on` | Water stream (animated shader cylinder plus splash particles) | A fillable container in the sink slot fills while the tap is on (`fill` 0 → 1) |
| `appliance` | Oven: `idle` → `baking` → `done` | Glow inside, door must be closed to bake, a timer ring shows | Turns `cupcake_batter` into `cupcake` |
| `activity` | Recipe steps | Checks the world state | Cupcake recipe: flour + milk into the bowl, then stir, then tray, then bake 6 s, then frosting, then a cupcake you can eat |
| `seat` | `standing` ⇄ `seated` | Sit clip, aligned to the seat anchor | Chairs and stools |

Every state change:

1. plays a sound (creak, click, clink, water);
2. plays a Wren clip when it makes sense: `PickUp` for take and place, `OpenDoor` for
   doors and fridge, `Cheer` when a recipe finishes;
3. writes to the save.

Contradictory states are impossible: each behaviour has one `state` field and
animations interpolate a separate `t` toward the target for that state.

## Interactable metadata (data-driven)

Every interactable is created from a plain object in the room layout. For example:

```js
{ id: 'kitchen_fridge_01', type: 'fridge', name: 'Fridge',
  pos: [x, z], rot: 0,
  parts: { mainDoor: { hinge: 'left', angle: 105, duration: 0.6 }, freezerDoor: { hinge: 'left', angle: 100 } },
  slots: ['fridge_shelf_1a', ...], light: true, save: true }
```

## Save (`hg.save.house`)

```json
{ "v": 1,
  "objects": { "kitchen_fridge_01.main": "closed", "kitchen_tap_01": "off", ... },
  "items": { "milk": { "slot": "fridge_shelf_2a" }, "mug": { "slot": "counter_3", "fill": 0.6 } },
  "held": null,
  "recipes": { "cupcake": { "step": 2 } },
  "inside": false }
```

Doors are saved as open or closed. Items keep their slot (or "held"). The mug keeps
its fill level. The recipe keeps its step. Water taps always start off.

## Acceptance tests (automated in the bench, `game.sim`)

1. Walk from the beach into the clubhouse door and arrive inside the kitchen.
2. E on the fridge: the door angle reaches about 105° within 0.7 s, the light turns
   on, and the milk becomes a candidate.
3. Take the milk, put it on the counter slot, close the fridge.
4. Open the cabinet and drawer; both reach their open state and close again.
5. Turn on the tap: the stream is visible and the sink sound plays. Put the mug in
   the sink and its fill rises. Turn off the tap: the stream stops and the fill
   stays.
6. Cupcake recipe start to finish: the oven glows while baking and the cupcake
   appears.
7. Reload: fridge contents, mug fill and where items are all persist.
