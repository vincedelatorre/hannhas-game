"""
Pearl Cove - landscape heightmap + paint-layer masks for Unreal Engine 5.

Generates, from the same terrain function used in the Blender blockout:
  PearlCove_Heightmap_1009.png   16-bit grayscale, 1009 x 1009 (a native UE landscape size)
  PearlCove_Layer_Sand.png       8-bit weight masks for landscape paint layers
  PearlCove_Layer_WetSand.png
  PearlCove_Layer_Grass.png
  PearlCove_Layer_Rock.png
  PearlCove_Layer_JungleFloor.png

Import in UE5: Landscape Mode > Manage > New > Import from File
  Heightmap:    PearlCove_Heightmap_1009.png
  Location:     X 0, Y 0, Z 0
  Scale:        X 25.794   Y 25.794   Z 10
     (X/Y: 260 m / 1008 quads = 25.794 cm per quad;
      Z:   10 -> one 16-bit step = 10/128 cm, mid value 32768 = 0 cm)
  Then assign the layer PNGs to the matching layers of M_PearlCove_Landscape.

Coordinate convention (same as the Blender blockout):
  +X east, +Y inland (north / jungle), -Y out to sea (south), Z up, metres.
  In Unreal the importer flips Y, so in UE the sea is toward +Y. The layout
  script (ue_build_pearl_cove.py) already applies the same flip.
"""
import math
import numpy as np
from PIL import Image

SIZE_M = 260.0          # world size covered by the landscape (metres)
RES = 1009              # UE landscape resolution (8x8 components, each 2x2 sections of 63 quads)
Z_SCALE = 10.0          # matches the UE import Z scale above


def sm(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def shore(x):
    return -5.0 - 0.008 * x * x


def height(x, y):
    """Vectorised copy of the blockout terrain function (metres)."""
    d = y - shore(x)
    n = 0.35 * np.sin(x * 0.11) * np.cos(y * 0.09) + 0.25 * np.sin(x * 0.23 + 1.3) * np.sin(y * 0.19 + 0.7)
    h = np.where(d < 0, np.maximum(-7.0, d * 0.22),
         np.where(d < 32, d * 0.065,
                  32 * 0.065 + np.minimum(14.0, (d - 32) * 0.16) + n * 2.0 * sm(32, 50, d)))
    ax = np.abs(x)
    head = sm(46, 64, ax) * sm(-58, -40, y)
    h = h * (1 - head) + head * (16 + 4 * np.sin(y * 0.07 + x * 0.03) + n * 3)
    # flatten the clubhouse platform
    pd = np.hypot(x / 14.0, (y - 24) / 10.0)
    k = np.where(pd < 1.6, 1 - sm(1.0, 1.6, pd), 0.0)
    h = h * (1 - k) + 2.0 * k
    # lagoon pool basin
    ld = np.hypot(x / 7.0, (y - 11) / 4.5)
    h = h - np.where(ld < 1.3, 1.4 * (1 - sm(0.7, 1.3, ld)), 0.0)
    return h, d


def main():
    lin = np.linspace(-SIZE_M / 2, SIZE_M / 2, RES)
    X, Y = np.meshgrid(lin, lin)          # row 0 = y min (sea side)
    Hm, D = height(X, Y)

    # 16-bit: value = 32768 + h_cm * 128 / Z_SCALE
    v = 32768 + (Hm * 100.0) * 128.0 / Z_SCALE
    v = np.clip(np.round(v), 0, 65535).astype(np.uint16)
    # image row 0 is the top of the PNG = north edge, so flip vertically
    Image.fromarray(np.flipud(v)).save("PearlCove_Heightmap_1009.png")

    # slope for rock mask
    gy, gx = np.gradient(Hm, lin[1] - lin[0])
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))

    rock = sm(28, 40, slope)
    wet = (1 - sm(-0.4, 0.6, Hm)) * (1 - rock)
    sand = sm(-0.4, 0.6, Hm) * (1 - sm(1.9, 2.6, Hm)) * (1 - rock)
    grass = sm(1.9, 2.6, Hm) * (1 - sm(3.5, 6.0, Hm)) * (1 - rock)
    jungle = sm(3.5, 6.0, Hm) * (1 - rock)
    total = rock + wet + sand + grass + jungle + 1e-6
    layers = {"Rock": rock, "WetSand": wet, "Sand": sand, "Grass": grass, "JungleFloor": jungle}
    for name, w in layers.items():
        img = np.clip(np.round(w / total * 255), 0, 255).astype(np.uint8)
        Image.fromarray(np.flipud(img)).save(f"PearlCove_Layer_{name}.png")

    print("height range m:", float(Hm.min()), float(Hm.max()))
    print("16-bit range:", int(v.min()), int(v.max()))


if __name__ == "__main__":
    main()
