# Wren's moves, shell inventory and HUD

Code: `docs/game/actions.js` (moves, shell, balls, flashlight, nap spots, friend dialogue),
`docs/game/hud.js` (Objectives / Controls panels, inventory, map, context prompts, touch wheel),
`KEYMAP` and `CONTROLS` in `docs/game/ui.js` (one table for every key; the Controls panel is generated from it).

| Key | Move | How it plays now | Higgsfield clip to swap in (3d_rigging on Wren, action id) |
|---|---|---|---|
| H | Take out / put away shell | PickUp reach + sparkle; persisted; W / L fetch it automatically | ShellStore: Female_Crouch_Pick_Up_Place_Side (274) |
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
