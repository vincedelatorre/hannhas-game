// Architecture kit for the Enchanted Island House: floors, walls with door and window
// openings, ceilings, beams and trims, all built from boxes in room-local metres and
// textured with the generated house materials. Every solid piece also registers a
// Rapier cuboid so you can't walk through walls or counters.
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, float, positionWorld, mix, color, mx_noise_float, normalWorld, abs, select } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const C = {        // art-bible palette (sRGB hex; color() converts to linear)
  honey: 0xC9893B, teak: 0x7A4A22, turquoise: 0x0F8C8C, coral: 0xE8574A, sun: 0xF2B521,
  pink: 0xE0457B, cream: 0xF3E6CC, brass: 0xC79A3C, glass: 0x7FD3D0, ink: 0x1B1410,
};

/** world-space tiled texture, so boxes of any size share the same texel density */
function worldTiled(T, scale, tint = 1) {
  // pick the projection by the dominant normal axis (cheap triplanar)
  const n = abs(normalWorld);
  const uvX = positionWorld.zy.mul(scale), uvY = positionWorld.xz.mul(scale), uvZ = positionWorld.xy.mul(scale);
  const tx = texture(T, uvX).rgb, ty = texture(T, uvY).rgb, tz = texture(T, uvZ).rgb;
  const w = n.div(n.x.add(n.y).add(n.z));
  return tx.mul(w.x).add(ty.mul(w.y)).add(tz.mul(w.z)).mul(tint);
}

export function makeMaterials(T) {
  const M = {};
  const std = (opts, colorNode) => { const m = new THREE.MeshStandardNodeMaterial(opts); if (colorNode) m.colorNode = colorNode; return m; };
  M.floor = std({ roughness: 0.32 }, T.T_Kitchen_Floor ? worldTiled(T.T_Kitchen_Floor, 0.55) : color(C.coral));
  M.wood = std({ roughness: 0.45 }, T.T_Honey_Wood ? worldTiled(T.T_Honey_Wood, 0.6, 0.95) : color(C.honey));
  // the generated stencil is bold: smaller repeat, blended toward cream so it reads as a subtle pattern
  M.plaster = std({ roughness: 0.85 }, T.T_Wall_Plaster ? mix(worldTiled(T.T_Wall_Plaster, 0.95), color(C.cream), float(0.55)) : color(C.cream));
  M.cabinet = std({ roughness: 0.5 }, T.T_Cabinet_Turquoise ? worldTiled(T.T_Cabinet_Turquoise, 1.1) : color(C.turquoise));
  M.marble = std({ roughness: 0.18 }, T.T_Countertop_Marble ? worldTiled(T.T_Countertop_Marble, 0.7) : color(C.cream));
  M.backsplash = std({ roughness: 0.25 }, T.T_Backsplash ? worldTiled(T.T_Backsplash, 1.4) : color(C.sun));
  M.teak = std({ roughness: 0.5, color: C.teak });
  M.brass = std({ roughness: 0.3, metalness: 1, color: C.brass });
  M.enamel = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15, color: C.turquoise });
  M.enamelCream = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.25, clearcoat: 0.6, color: C.cream });
  M.coral = std({ roughness: 0.35, color: C.coral });
  M.interior = std({ roughness: 0.6, color: 0xEFF6F2 });
  M.dark = std({ roughness: 0.6, color: 0x2A2420 });
  M.steel = std({ roughness: 0.25, metalness: 0.9, color: 0xC9CED2 });
  M.glass = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.05, transparent: true, opacity: 0.35, color: C.glass, depthWrite: false });
  M.ovenGlass = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.08, transparent: true, opacity: 0.5, color: 0x332218, depthWrite: false });
  M.lamp = std({ roughness: 0.4, color: 0xFFE2A8 }); M.lamp.emissiveNode = color(0xFFC46A).mul(2.2);

  // ---- Mediterranean kitchen (Option A: sage & copper) ----
  // downstairs floor: matte wide-plank natural oak (the family's pick)
  M.oakFloor = std({ roughness: 0.88 }, T.T_Natural_Oak_Floor ? worldTiled(T.T_Natural_Oak_Floor, 0.75) : T.T_Oak_Floor ? worldTiled(T.T_Oak_Floor, 0.32) : color(0xB08A60));
  // English-country olive sage (#777B6B): the painted-wood texture keeps its grain but its colour is
  // pulled to a warm grey-green base, satin rather than gloss
  const SAGE = 0x777B6B;
  const sageNode = k => T.T_Sage_Cabinet ? mix(worldTiled(T.T_Sage_Cabinet, 0.9).mul(vec3(0.72, 0.66, 0.7)), color(SAGE), float(0.5)).mul(k) : color(SAGE).mul(k);
  M.sage = std({ roughness: 0.46 }, sageNode(1));
  M.sageDark = std({ roughness: 0.46 }, sageNode(0.84));
  M.limestone = std({ roughness: 0.6 }, T.T_Limestone_Tile ? worldTiled(T.T_Limestone_Tile, 0.75) : color(0xD8CBB4));
  M.soapstone = std({ roughness: 0.62 }, T.T_Soapstone ? worldTiled(T.T_Soapstone, 0.6) : color(0x3B3C3D));
  M.limewash = std({ roughness: 0.9 }, T.T_Limewash ? worldTiled(T.T_Limewash, 0.35) : color(0xEFE8DC));
  M.copper = std({ roughness: 0.34, metalness: 1 }, T.T_Aged_Copper ? worldTiled(T.T_Aged_Copper, 0.8, 1.05) : color(0xB8733E));
  M.whiteOak = std({ roughness: 0.55 }, T.T_White_Oak ? worldTiled(T.T_White_Oak, 0.7) : color(0xC9A47A));
  M.stainless = std({ roughness: 0.38, metalness: 1, color: 0xA4A9AE });
  M.castIron = std({ roughness: 0.75, metalness: 0.4, color: 0x1E1E1F });
  M.fireclay = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.18, clearcoat: 0.8, color: 0xF7F4EE });
  M.blackSteel = std({ roughness: 0.45, metalness: 0.6, color: 0x1C1C1E });
  M.bronze = std({ roughness: 0.35, metalness: 1, color: 0x4A3626 });
  M.redKnob = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.3, clearcoat: 0.8, color: 0xA3141B });
  M.blackWood = std({ roughness: 0.55, color: 0x161412 });
  M.rattan = std({ roughness: 0.85, color: 0x9A7448 });
  M.white = std({ roughness: 0.4, color: 0xF4F1EA });
  M.ledStrip = std({ roughness: 0.5, color: 0xFFE9C2 }); M.ledStrip.emissiveNode = color(0xFFD9A0).mul(3.0);
  M.clearGlass = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.04, transparent: true, opacity: 0.22, color: 0xEAF6F6, depthWrite: false });
  // ---- arched sink niche (white zellige, cream cabinets, white stone, brass)
  M.zellige = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  M.zellige.colorNode = T.T_Zellige_Tile ? worldTiled(T.T_Zellige_Tile, 1.1) : color(0xEDE9E1);
  M.cream = std({ roughness: 0.5 }, T.T_Sage_Cabinet ? mix(worldTiled(T.T_Sage_Cabinet, 0.9), color(0xF1EBDD), float(0.82)) : color(0xEFE8DA));
  M.quartz = std({ roughness: 0.22 }, T.T_Countertop_Marble ? mix(worldTiled(T.T_Countertop_Marble, 0.5), color(0xF6F3EE), float(0.35)) : color(0xF4F1EB));
  return M;
}

/** a scene group in room space plus a list of colliders in world space */
export class Builder {
  constructor(root, physics) { this.root = root; this.physics = physics; this.colliders = []; }

  /** solid box (centre, size) with optional rounded edges; collide = add a cuboid */
  box(mat, [cx, cy, cz], [sx, sy, sz], { round = 0, collide = true, parent = this.root, rotY = 0, cast = true } = {}) {
    const g = round > 0 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(round, sx / 2, sy / 2, sz / 2)) : new THREE.BoxGeometry(sx, sy, sz);
    const m = new THREE.Mesh(g, mat); m.position.set(cx, cy, cz); m.rotation.y = rotY;
    m.castShadow = cast; m.receiveShadow = true;
    parent.add(m);
    if (collide) this.solid(m, sx, sy, sz);
    return m;
  }

  /** register a cuboid collider for a mesh (uses its world transform) */
  solid(mesh, sx, sy, sz) {
    mesh.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    mesh.matrixWorld.decompose(p, q, s);
    const c = this.physics.addCuboid(p, q, sx / 2 * s.x, sy / 2 * s.y, sz / 2 * s.z);
    this.colliders.push(c);
    return c;
  }

  /**
   * a straight wall from (x0,z0) to (x1,z1) with rectangular openings
   * openings: [{ at: metres along the wall (centre), w, h, y0 (sill) }]
   */
  wall(x0, z0, x1, z1, { h = 3.2, t = 0.24, mat, openings = [], skirting = true } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const g = new THREE.Group(); g.position.set(x0, 0, z0); g.rotation.y = -ang; this.root.add(g);
    const piece = (a, b, y0, y1) => {
      if (b - a < 0.01 || y1 - y0 < 0.01) return;
      this.box(mat, [(a + b) / 2, (y0 + y1) / 2, 0], [b - a, y1 - y0, t], { parent: g });
    };
    const ops = [...openings].sort((p, q) => p.at - q.at);
    let cur = 0;
    for (const o of ops) {
      const a = o.at - o.w / 2, b = o.at + o.w / 2, y0 = o.y0 || 0, y1 = y0 + o.h;
      piece(cur, a, 0, h);
      piece(a, b, 0, y0);          // below a window
      piece(a, b, y1, h);          // lintel
      if (o.frame === false) { cur = b; continue; }
      // honey-wood frame around the opening
      const fm = o.frameMat || this.mats.wood, ft = 0.1, fd = t + 0.06;
      this.box(fm, [a - ft / 2, (y0 + y1) / 2, 0], [ft, y1 - y0 + ft, fd], { parent: g, collide: false });
      this.box(fm, [b + ft / 2, (y0 + y1) / 2, 0], [ft, y1 - y0 + ft, fd], { parent: g, collide: false });
      this.box(fm, [(a + b) / 2, y1 + ft / 2, 0], [b - a + ft * 2, ft, fd], { parent: g, collide: false });
      if (y0 > 0) this.box(fm, [(a + b) / 2, y0 - 0.03, 0], [b - a + 0.2, 0.06, fd + 0.08], { parent: g, collide: false });
      cur = b;
    }
    piece(cur, len, 0, h);
    if (skirting) {
      this.box(this.mats.teak, [len / 2, 0.06, t / 2 + 0.01], [len, 0.12, 0.02], { parent: g, collide: false, cast: false });
      this.box(this.mats.teak, [len / 2, 0.06, -t / 2 - 0.01], [len, 0.12, 0.02], { parent: g, collide: false, cast: false });
    }
    return g;
  }

  floor(x0, z0, x1, z1, mat, y = 0) {
    this.box(mat, [(x0 + x1) / 2, y - 0.1, (z0 + z1) / 2], [x1 - x0, 0.2, z1 - z0], { cast: false });
  }
  ceiling(x0, z0, x1, z1, y, mat) {
    this.box(mat, [(x0 + x1) / 2, y + 0.1, (z0 + z1) / 2], [x1 - x0, 0.2, z1 - z0], { cast: true });
    // curved honey beams across the ceiling every 1.6 m
    for (let x = x0 + 0.8; x < x1; x += 1.6) this.box(this.mats.wood, [x, y - 0.09, (z0 + z1) / 2], [0.18, 0.18, z1 - z0], { collide: false, round: 0.04 });
  }
}

/**
 * arched (gothic-ish round-top) window built into an existing rectangular wall opening.
 * The opening must be w wide and (h + w/2) tall (rect + arch). Builds: the solid wall
 * corners above the arch, a black steel frame with muntins, and two casement sashes
 * hinged on the sides. Returns { root, sashes: [pivotL, pivotR] } in wall-local space
 * (x along the wall, y up, z out of the room toward the outside).
 */
export function archWindow(b, M, parent, { at, w, h, y0, t = 0.24, inward = 1 }) {
  const g = new THREE.Group(); g.position.copy(at); parent.add(g);
  const r = w / 2, top = y0 + h;
  // corner fill above the arch (a rectangle with a half-disc cut out)
  const sh = new THREE.Shape(); sh.moveTo(-r, 0); sh.lineTo(-r, r); sh.lineTo(r, r); sh.lineTo(r, 0); sh.absarc(0, 0, r, 0, Math.PI, false);
  const fill = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 24 }), M.limewash);
  fill.position.set(0, top, -t / 2); g.add(fill); fill.receiveShadow = true;
  // frame: arch tube + jambs + sill
  const fw = 0.05;
  const arc = new THREE.Mesh(new THREE.TorusGeometry(r - fw / 2, fw / 2, 8, 32, Math.PI), M.blackSteel); arc.position.set(0, top, 0); g.add(arc);
  for (const s of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(fw, h, fw * 1.2), M.blackSteel); j.position.set(s * (r - fw / 2), y0 + h / 2, 0); g.add(j); }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.05, t + 0.12), M.limestone); sill.position.set(0, y0 - 0.025, 0); g.add(sill);
  // fixed arched transom glass + muntin
  const tg = new THREE.Mesh(new THREE.CircleGeometry(r - fw, 32, 0, Math.PI), M.clearGlass); tg.position.set(0, top, 0); g.add(tg);
  const tm = new THREE.Mesh(new THREE.BoxGeometry(0.025, r, 0.03), M.blackSteel); tm.position.set(0, top + r / 2, 0); g.add(tm);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.035), M.blackSteel); tb.position.set(0, top, 0); g.add(tb);
  // two casement sashes, hinged on the outer jambs, opening into the room
  const sashes = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * (r - fw), y0, 0); g.add(pivot);
    const sw = r - fw;
    const frame = new THREE.Group(); pivot.add(frame);
    const bars = [[-s * sw / 2, h / 2, sw, 0.035], [-s * sw / 2, 0.02, sw, 0.04], [-s * sw / 2, h - 0.02, sw, 0.04], [-s * sw / 2, h / 2 + h / 4, sw, 0.025], [-s * sw / 2, h / 4, sw, 0.025]];
    for (const [x, y, ww, hh] of bars) { const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.035), M.blackSteel); m.position.set(x, y, 0); frame.add(m); }
    for (const x of [0.02 * -s, -s * (sw - 0.02), -s * sw / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(x === -s * sw / 2 ? 0.025 : 0.035, h, 0.035), M.blackSteel); m.position.set(x, h / 2, 0); frame.add(m); }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.04, h - 0.06), M.clearGlass); glass.position.set(-s * sw / 2, h / 2, 0); frame.add(glass);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.03), M.bronze); latch.position.set(-s * (sw - 0.05), h * 0.45, 0.03 * inward); frame.add(latch);
    sashes.push({ pivot, sign: s });
  }
  return { root: g, sashes, center: new THREE.Vector3(0, y0 + h * 0.5, 0) };
}
