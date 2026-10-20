# Wren's moves, shell inventory and HUD

Code: `docs/game/actions.js` (moves, shell, balls, flashlight, nap spots, friend dialogue),
`docs/game/hud.js` (Objectives / Controls panels, inventory, map, context prompts, touch wheel),
`KEYMAP` and `CONTROLS` in `docs/game/ui.js` (one table for every key; the Controls panel is generated from it).

| Key | Move | How it plays now | Higgsfield clip to swap in (3d_rigging on Wren, action id) |
|---|---|---|---|
| A | Take out / put away shell | PickUp reach + sparkle; persisted; W / L fetch it automatically | ShellStore: Female_Crouch_Pick_Up_Place_Side (274) |
| R | Run toggle | speed 7 m/s (jog 4.4, super speed 13), Run clip | already have Run |
| F | Dance (loops) | procedural dance on her skeleton; friend joins in | Dance: Love_You_Pop_Dance (76) |
| G | Wave | procedural wave; friend plays his Wave clip back | Wave: Big_Wave_Hello (28) |
| B | Sit / stand | nearest chair or stool (Sit clip) | already have Sit |
| N | Nap / wake | lies down on the beach towel or foyer bench, z's | Nap: Sleep_Normally (267) |
| T | Talk | dialogue panel with choices; toy boat quest | Talk: Talk_with_Hands_Open (313) |
| Y | Celebrate | Cheer clip + confetti, friend flips | already have Cheer |
| K | Kick | procedural kick; beach ball (outside) and soft ball (foyer) | Kick: Simple_Kick (103) |
| U | Magic flashlight | real SpotLight from a small teal torch in her left hand | none needed |
| Z | Crouch / sneak | procedural crouch, 1.5 m/s, lower first-person eye | CrouchWalk (524), CrouchIdle (258) |

Every procedural pose switches off automatically once a clip with that name is loaded
(add it to `wrenClips` in `main.js` after generating it). About 64 credits for all clips.

Menus: O objectives, I inventory, M big map, F1 controls, F2 settings, Tab hide buttons,
F4 hide photo buttons, F5 save, F9 load (asks first), Backspace / Esc close, Enter / 1-3 dialogue choices.
Keys are ignored while typing in any text box.

## First-person mouse modes (`docs/game/mousemode.js`)

- V enters first person in **Navigation** mode: the mouse is captured (pointer lock), moving it looks
  around with no button held, and a small dot marks the centre. Esc releases the mouse; a hint offers
  "Click to look around", and one click recaptures it without spraying water.
- **Right-click** (or the **~** key) switches to **Interaction** mode: the camera stops following the mouse and an animated SVG
  hand cursor appears (relaxed / pointing / open to grab / closing / holding, plus a ↔ or ↻ badge on
  drawers and doors). Hovered things get the gold outline and a label. Left-click uses, grabs or places;
  right-click on an object looks closer, right-click on empty space (or ~) recaptures the mouse.
  From third person, ~ jumps straight into first person with the hand out.
- Picking is the house Focus picker run in "free" mode: a ray through the cursor against nearby item
  meshes, 3.2 m reach, walls and counters block it (Rapier ray). Close-ups (cupboards, fridge, range…)
  switch to the hand automatically and hand back to the previous mode on exit.
- The top-right chip shows 🖱️ Look or ✋ Hand (and toggles it on touch screens). Screen-button hiding
  is F6. (Tab was first used for the hand; it moved when Tab became "switch character".)

## Two playable characters (`docs/game/party.js`, `docs/game/nav.js`)

| Key | Command |
|---|---|
| Tab | Switch between Hannah and her friend (nobody moves; camera glides over, or fades if far / other side of the door) |
| H | Whistle: the other one turns, waves, walks over with pathfinding, then hangs out |
| J | Stay here: they stop following and stay where they are now |

Key changes this caused: the shell moved from H to **A**, the hand cursor from Tab to **right-click / ~**,
J no longer dives (D still does). The Controls panel has a Characters section with Switch / Whistle /
Stay here buttons that call the same functions.

AI states: INDEPENDENT_IDLE, SEATED, RESPONDING_TO_WHISTLE, NAVIGATING_TO_PLAYER, COMPANION_HANGOUT,
COMPANION_FOLLOW (follow starts past 4 m, settles inside 2.2 m). Switching always clears the follow.
Idle is calm: mostly still, an occasional glance, weight shift, or folded arms.
Pathfinding: A* on a walkability grid sampled from the physics colliders (house at 0.25 m, beach at 0.5 m,
steep = blocked, deep water = slower), smoothed with line of sight, replanned when you move far or when
stuck; closed room doors get opened; the front door is crossed like the player does. Gives up with a
"can't find a way" status instead of walking into walls forever.
Each character keeps their own run / crouch / flashlight state and whatever they hold. Only Hannah has
the pearl shell powers. Upstairs isn't built yet, so stairs/floors navigation waits for that milestone.

## Friend

Superseded by the two-character system above: he is independent by default; Talk's "Come with me!" /
"Wait here for me" use the same commands as H / J.
