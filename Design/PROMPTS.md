# Hannah's Game — hyper-real prompt library

The target look is the clubhouse and character references in `Design/`: real light, real
materials, storybook shapes and colors. Every asset goes through the same three steps, and each
step has its own prompt.

| Step | Purpose | Lighting in the prompt | Feeds |
| --- | --- | --- | --- |
| 1. Hero render | Locks the look, mood, and detail level | Golden-hour sun, real shadows, atmosphere | Art direction, marketing, approval |
| 2. Turnaround views | Clean geometry and color for 3D conversion | Flat, even, shadowless studio light | Multiview 3D (Tripo H3.1 or Hunyuan3D v3) |
| 3. Material prompts | Tileable PBR textures for Unreal | Flat, top-down, no light | Landscape layers and master materials |

**Why the lighting changes:** shadows and highlights painted into a source image get baked into
the 3D model's color texture, and then Unreal lights it a second time. Turnaround views therefore
use flat, shadowless light, and Unreal (Lumen, MegaLights, Sky Atmosphere) supplies the real lighting.

**Image settings matter as much as the words.** The model defaults to low quality at 1K resolution.

| Use | Model | quality | resolution |
| --- | --- | --- | --- |
| Hero render | `gpt_image_2_5` | `max` | `4k` |
| Turnaround views | `gpt_image_2_5` | `high` | `2k` (same aspect ratio for every view) |
| Tileable materials | `gpt_image_2_5` | `high` | `4k`, 1:1 |

---

## Shared blocks (paste into every prompt)

**STYLE** (hero renders)
```
hyper-realistic AAA game cinematic, Unreal Engine 5.8 quality, path-traced global illumination,
physically based materials, micro-surface detail, subsurface scattering in leaves and petals,
storybook-realistic proportions, warm tropical golden-hour sunlight, soft sky fill, crisp focus,
rich but natural saturation, 8K detail
```

**SOURCE VIEW** (turnarounds for 3D)
```
single subject isolated on a pure white background, entire subject in frame with margin,
orthographic camera, eye-level, neutral overcast studio lighting, no cast shadows,
no strong specular highlights, flat even albedo colors, sharp detail, same design in every view
```

**AVOID** (add as the last line or negative prompt)
```
no text, no watermark, no people unless asked, no cartoon outlines, no cel shading, no plastic toy look,
no blur, no extra limbs, no cropped edges, no busy background, no lens flare on source views
```

**Palette:** sand cream, lagoon turquoise, mint, shell pink, warm bamboo gold, hibiscus coral.

---

## 1. Clubhouse

**Hero render**
```
[STYLE] A four-level tropical treehouse clubhouse on a white-sand beach cove, built from woven
bamboo, carved driftwood beams and golden thatched-palm roofs. Mint-green shutters, arched windows
with pink curtains and warm lantern glow, a pink scallop-shell door, a glass-domed stargazing
observatory on top, a thatched gazebo lookout tower joined by a rope bridge, rope-and-plank
staircases, flowering vines and bougainvillea climbing every wall, a two-turn mint water slide
spiraling down into a turquoise rock-rimmed lagoon pool with starfish on the stones. Coconut palms,
hibiscus, turquoise sea and green headlands behind. Wide three-quarter view. [AVOID]
```

**Turnaround views** (generate front, left side, back, right side; reference the hero render)
```
[SOURCE VIEW] The exact same clubhouse as the reference image, {FRONT | LEFT SIDE | BACK | RIGHT SIDE}
elevation view, building only on a small flat sand base, no sea, no palms, no pool water, every
window, roof, railing, slide and tower in the same place as the reference. [AVOID]
```

**3D:** `tripo_h3_1_multiview_to_3d`, geometry_quality and texture_quality `detailed`, pbr on,
face_limit 800,000 (Nanite). Fallback: `hunyuan3d_v3_image_to_3d` with all four views, face_count 1,000,000, PBR on.
For the shipped game, rebuild it as a modular kit in Blender, using this mesh as the reference.

## 2. Coconut palm (hero tree)

**Hero render**
```
[STYLE] A tall gracefully curved coconut palm on a beach, ringed grey-brown trunk with real bark
fibers and old frond scars, a full crown of glossy translucent green fronds with sunlight glowing
through them, a cluster of green and brown coconuts, light breeze. [AVOID]
```

**Turnaround views** (front and side)
```
[SOURCE VIEW] The same coconut palm, {FRONT | SIDE} view, whole tree from roots to crown,
trunk curve identical in both views, fronds fully visible. [AVOID]
```

**3D:** trunk and coconuts from `tripo_h3_1_multiview_to_3d` (detailed). Fronds work best as
alpha-card or Nanite Foliage assets. Use **Procedural Vegetation Editor + Nanite Foliage** in
UE 5.7+, or a Quixel Megaplants palm, and keep the AI trunk for the hero palms near the clubhouse.

## 3. Hibiscus bush, rocks, shells, props

**Hibiscus — hero**
```
[STYLE] A lush round tropical hibiscus bush, large glossy dark-green leaves with visible veins,
dozens of big coral-pink and red hibiscus blooms with yellow stamens and dewdrops, morning sun. [AVOID]
```

**Mossy coastal boulder — source view** (Nanite rock, two views)
```
[SOURCE VIEW] A large rounded coastal granite boulder, real weathered grain and pitting, soft green
moss on top, tiny pink flowers in cracks, {FRONT | SIDE} view. [AVOID]
```

**Seashell collectible — source view**
```
[SOURCE VIEW] A single glossy pink-and-cream scallop seashell, real ridges, pearly iridescent
inner surface, {TOP | SIDE} view. [AVOID]
```

**3D:** rocks via `hunyuan3d_v3_image_to_3d` at 500,000 faces (Nanite on), small props via
`tripo_h3_1_multiview_to_3d` (detailed, face_limit 100,000).

## 4. Hero character (Wren)

**Hero render** (marketing and look approval)
```
[STYLE] A friendly 13-year-old girl with warm golden-brown skin, dark brown eyes, rosy cheeks, a
sweet dimpled smile and a high curly golden-blonde ponytail tied with a mint polka-dot bow. She wears a
mint-and-white striped sailor dress with a pink sailor collar and big pink bow, a pink seashell
pocket, and a knee-length full skirt with a white hem band of pink seashells and starfish, plus
opaque white tights, white ruffle socks and mint high-top sneakers with pink laces. She holds an open
iridescent pink clam with a glowing pearl. Real fabric weave, individual hair strands, natural skin
texture. Standing on the beach near the clubhouse. Wholesome, age-appropriate, for a children's game. [AVOID]
```

**Turnaround views** (front, side, back; reference the approved A-pose image)
```
[SOURCE VIEW] The exact same girl and outfit as the reference image, {FRONT | LEFT SIDE | BACK} view,
neutral A-pose with arms 45 degrees from the body, open empty hands, feet shoulder-width apart,
relaxed neutral face, hair and dress identical in every view. Wholesome, age-appropriate. [AVOID]
```

**3D:** `tripo_h3_1_multiview_to_3d` (detailed, quad on, face_limit 60,000), then rig with
`3d_rigging` at 1.6 m height. Ponytail and skirt need physics bones or cloth in Unreal.
For a final hero character, a 3D character artist should retopologize and hand-weight her in Blender.
The AI mesh is the blockout and likeness reference.

## 5. Boy companion (wastelander explorer)

**Turnaround views**
```
[SOURCE VIEW] The exact same boy as the reference image: 13-year-old, warm brown skin, long
fauxhawk, brass-and-leather goggles on his head, sand scarf, rust-orange canvas vest over an olive
tunic, leather shoulder guard, fingerless gloves, utility belt with pouches, canteen and rope,
patched khaki cargo pants, tall buckled boots, {FRONT | LEFT SIDE | BACK} view, neutral A-pose,
open empty hands. Wholesome, age-appropriate. [AVOID]
```

**3D:** same settings as Wren, rig at 1.65 m.

## 6. Tileable PBR materials (Unreal landscape and master materials)

Generate each at 1:1 and check that it tiles. Then derive normal and roughness maps with Substance
Sampler, Materialize, or the PBR generator in Tripo.
```
seamless tileable texture, top-down orthographic, flat even lighting, no shadows, no perspective,
photoreal 4K, {MATERIAL}
```
| Material | {MATERIAL} text |
| --- | --- |
| Dry sand | fine warm cream beach sand with tiny shell fragments and sparkling quartz grains |
| Wet sand | dark glossy wet beach sand with shallow ripples and thin foam lace |
| Jungle floor | tropical forest floor, fallen palm fronds, small leaves, dark rich soil, moss |
| Bamboo | woven split-bamboo wall panel, warm golden poles with nodes, lashed with rope |
| Thatch | dense dry palm-thatch roofing, layered golden-brown fronds |
| Coastal rock | weathered grey coastal granite with lichen and pitting |
| Tide-pool floor | shallow tide-pool bottom, pebbles, tiny shells, green algae, under clear water |

## 7. In-engine look (where the hyper-realism actually happens)

None of this shows in a browser prototype. It is the Unreal setup that makes the scene match the references.

- **Light:** Sky Atmosphere, Volumetric Clouds, directional sun at about 38° with a warm color
  (around 5,800 K), Sky Light real-time capture, Lumen GI and reflections at High or Epic, and MegaLights for lanterns and torches.
- **Water:** Water plugin ocean with 4–6 soft Gerstner layers, depth-based turquoise color, shoreline
  foam, caustics decals in the lagoon, and a wet-sand band at the waterline.
- **Foliage:** Nanite Foliage, with wind through the palms (Pivot Painter or a simple World Position Offset), and two-sided foliage shading so fronds glow when backlit.
- **Post:** a filmic tonemapper, exposure locked for gameplay, slight bloom, saturation about 1.1,
  very light vignette, and Temporal Super Resolution at Epic.
- **Capture check:** compare an in-engine screenshot from the reference camera angle against the
  hero render, and adjust light color and saturation until they match.
