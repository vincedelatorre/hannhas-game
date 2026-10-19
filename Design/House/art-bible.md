# Art Bible: The Enchanted Island House

The house is the clubhouse at Pearl Cove, seen from the inside. The outside is the
generated clubhouse model on the beach. Step through its front door and you are in
the house: a roomy three-storey tropical treehouse mansion that is bigger inside
than out.

Every room, prop and character follows these rules, so nothing looks as if it came
from a different game.

## 1. Look in one sentence

**Polished, stylised 3D with clear, rounded forms, warm honey wood and bold jewel
colours. It is whimsical but high-contrast, never washed-out pastel.**

The family asked for more contrast and less "shiny pastel" on 19 Oct 2026. That
overrides the pastel wording in the original blueprint. Fabrics and accents use
saturated colour (deep turquoise, coral, sunflower). Cream and mint are only for
small highlights.

## 2. Palette

The sRGB hex values are the on-screen colour. Shaders must convert them to linear
light; use `color(0x...)`, or `L()` in underwater.js.

| Role | Colour | Hex | Notes |
| --- | --- | --- | --- |
| Primary wood | Golden honey | `#C9893B` | Floors, beams, furniture frames |
| Dark wood | Toasted teak | `#7A4A22` | Trims, table legs, shadows in carving |
| Signature accent | Deep turquoise | `#0F8C8C` | Cabinets, appliance enamel, cushions |
| Accent 2 | Coral red | `#E8574A` | Pots, bowls, rugs, flowers |
| Accent 3 | Sunflower | `#F2B521` | Brass replacement, lamp light, tiles |
| Accent 4 | Hibiscus pink | `#E0457B` | Small details only |
| Neutral light | Warm cream | `#F3E6CC` | Plaster walls, porcelain, grout |
| Metal | Polished brass | `#C79A3C` | Handles, hinges, faucets (metalness 1, roughness 0.3) |
| Glass | Sea-glass | `#7FD3D0` | Fridge shelves, jars (transmission or alpha 0.35) |

Avoid flat grey, pure black (use `#1B1410`) and pure white (use `#F7F1E6`).

## 3. Materials

| Material | Roughness | Metalness | Notes |
| --- | --- | --- | --- |
| Honey wood (polished) | 0.45 | 0 | Grain from the `T_Honey_Wood` texture, tiled at about 1 repeat per 1.2 m |
| Painted cabinet wood | 0.55 | 0 | `T_Cabinet_Turquoise`; edges are 6 % lighter |
| Enamel (fridge, oven) | 0.25 | 0 | Clearcoat 0.6 |
| Brass | 0.3 | 1 | Never fully mirror |
| Marble countertop | 0.2 | 0 | `T_Countertop_Marble` |
| Ceramic tile | 0.3 | 0 | `T_Kitchen_Floor`, `T_Backsplash` |
| Plaster | 0.85 | 0 | `T_Wall_Plaster` |
| Fabric | 0.9 | 0 | Sheen 0.3 where supported |
| Food | 0.4 to 0.7 | 0 | Generated models; keep their textures, scale albedo ×0.85 if they bloom |

- Do not bake lighting into textures. Texture prompts always say "even lighting, no
  lighting gradient".
- Characters use their own texture with the emissive channel removed. This is already
  done in characters.js.

## 4. Shape language

- Rounded edges everywhere a hand goes: a 2 to 4 cm bevel on furniture and 1 cm on
  cabinet doors.
- Organic architecture: arched doorways, curved beams and leaf-shaped carvings. Rooms
  are rectangles with rounded corners, so floors stay easy to walk on.
- Oversized decorative details are fine on walls and ceilings, but never in walking
  paths.

## 5. Scale (metres, player = Wren 1.60 m)

| Thing | Size |
| --- | --- |
| Door opening | 1.1 × 2.3 |
| Ceiling height | 3.2 (ground floor) |
| Counter height | 0.92, depth 0.62 |
| Upper cabinets | Bottom at 1.45, height 0.75 |
| Fridge | 0.85 × 0.75 × 1.95 |
| Kitchen table | Ø 1.2, height 0.75 |
| Chair seat | 0.46 |
| Mug | 0.11 tall |
| Cupcake | 0.09 tall |
| Interaction reach | 1.6 to 2.2 m from Wren's feet to the object's anchor |

## 6. Lighting

- **Interiors:** soft warm fill (hemisphere `#FFE7C4` over `#6B4A2A`) plus a sun shaft
  through windows. Each lamp uses one point light; at most four dynamic point lights
  per room. Only the window sun casts shadows indoors.
- **Day and night:** interior lamps glow (emissive) and their light grows when the sun
  sets.
- **Tone:** use the existing global grade (S-curve contrast and saturation 1.28). Do
  not add per-room colour filters.

## 7. Camera and reference conventions for generation

- **Object reference images:** a single object centred, three-quarter view from
  slightly above, plain light grey background, soft even studio light, no shadows, no
  text, no people. Prompts start with "Stylized premium 3D game asset:".
- **Tileable textures:** "Seamless tileable texture, flat orthographic view, no
  perspective, no lighting gradient… edges tile perfectly. No text."
- **Moving parts are not taken from AI meshes.** Fridge doors, cabinet fronts,
  drawers, faucet handles and oven doors are built as separate parametric pieces with
  correct pivots and textured with the generated materials. AI meshes come out as one
  fused piece and cannot be hinged.

## 8. Naming

| Kind | Pattern | Example |
| --- | --- | --- |
| Static or prop model | `SM_<Room>_<Thing>` | `SM_Kitchen_Cupcake` |
| Texture | `T_<Surface>` | `T_Cabinet_Turquoise` |
| Interactive object id | `<room>_<thing>_<nn>` | `kitchen_fridge_01` |
| Mesh parts inside an assembly | `<thing>_<part>` | `fridge_door_main` |
| Character clip | Word, title case | `PickUp`, `OpenDoor`, `Cheer` |

## 9. Polygon and texture budgets

| Asset class | Triangles | Texture |
| --- | --- | --- |
| Tiny prop (food, cup) | up to 3 k | 512 |
| Small household object | 3 to 8 k | 512 to 1024 |
| Furniture | 6 to 20 k | 1024 |
| Hero prop | up to 30 k | 1024 to 2048 |
| Characters | 60 k | 2048 (existing) |

The asset build (`Tools/web/build_web_assets.mjs`) simplifies every model to these
budgets and converts textures to WebP.

## 10. Do not

- Mix photoreal objects with simple low-poly objects in the same room.
- Use noisy, high-frequency textures on large surfaces.
- Use sharp edges where hands go.
- Put clutter in walkways.
- Use pastel-on-pastel with no contrast.
- Use logos, text, real brands, or characters from films or shows.
- Make a different-looking Wren for each animation.
