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
      // honey-wood frame around the opening
      const fm = this.mats.wood, ft = 0.1, fd = t + 0.06;
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
