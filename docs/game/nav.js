// Grid pathfinding for characters walking on their own (whistle → come over, follow).
//
// A walkability grid is sampled from the real physics world (Rapier colliders: walls, counters,
// islands, rocks, palm trunks, the clubhouse) plus the terrain height (too steep = blocked,
// deep water = costly). A* with 8 neighbours, then the path is smoothed with line-of-sight so
// characters walk natural straight lines instead of zig-zags. Indoors the grid is fixed to the
// house floor; outdoors it is built around the start and goal on demand. Grids are cached for a
// few seconds so a moving player doesn't cause a rebuild every frame.
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';

const STATIC = (0x0001 << 16) | 0x0001;      // query only scenery, never the two characters

export class Nav {
  constructor(game) {
    this.g = game; this.cache = new Map();
    this.ball = new RAPIER.Ball(0.27); this.rot = { x: 0, y: 0, z: 0, w: 1 };
  }
  /** is a character-sized capsule free at (x, floor, z)? */
  free(x, y, z) {
    const W = this.g.physics.world;
    for (const h of [0.42, 0.95]) if (W.intersectionWithShape({ x, y: y + h, z }, this.rot, this.ball, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, STATIC)) return false;
    return true;
  }
  /** build (or reuse) a grid covering a box: { x0, z0, nx, nz, cell, floor(x,z), inside } */
  grid(key, x0, z0, x1, z1, cell, floorFn, extra) {
    const c = this.cache.get(key), now = performance.now();
    if (c && now - c.t < 6000 && c.x0 <= x0 && c.z0 <= z0 && c.x1 >= x1 && c.z1 >= z1) return c;
    const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
    const cost = new Float32Array(nx * nz), hgt = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell, z = z0 + j * cell, y = floorFn(x, z), k = j * nx + i;
      hgt[k] = y;
      cost[k] = Number.isFinite(y) && this.free(x, y, z) ? (extra ? extra(x, z, y) : 1) : 0;
    }
    // too steep between neighbours = a cliff or a ledge
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!cost[k]) continue;
      if (i + 1 < nx && Math.abs(hgt[k + 1] - hgt[k]) > cell * 0.9) { cost[k] = 0; }
      if (j + 1 < nz && Math.abs(hgt[k + nx] - hgt[k]) > cell * 0.9) { cost[k] = 0; }
    }
    const G = { key, x0, z0, x1: x0 + (nx - 1) * cell, z1: z0 + (nz - 1) * cell, nx, nz, cell, cost, hgt, t: now };
    this.cache.set(key, G);
    return G;
  }
  invalidate() { this.cache.clear(); }

  /** find a path between two points in the same space. Returns [Vector3…] or null. */
  path(from, to, inside) {
    const g = this.g;
    let G;
    if (inside) {
      const O = g.house.root.position, fy = g.house.floorY;
      G = this.grid('house', O.x - 4.5, O.z - 4.2, O.x + 16.2, O.z + 7.2, 0.25, () => fy);
    } else {
      const m = 14, cell = 0.5;
      let x0 = Math.min(from.x, to.x) - m, x1 = Math.max(from.x, to.x) + m, z0 = Math.min(from.z, to.z) - m, z1 = Math.max(from.z, to.z) + m;
      // snap to a coarse lattice so nearby requests share a grid
      x0 = Math.floor(x0 / 8) * 8; z0 = Math.floor(z0 / 8) * 8; x1 = Math.ceil(x1 / 8) * 8; z1 = Math.ceil(z1 / 8) * 8;
      if ((x1 - x0) * (z1 - z0) > 160 * 160) return null;          // too far: caller walks straight
      const P = g.player, ground = g.groundFn;
      G = this.grid(`out:${x0},${z0},${x1},${z1}`, x0, z0, x1, z1, cell, ground, (x, z, y) => {
        const depth = P.waterLevelAt(new THREE.Vector3(x, y, z)) - y;
        return depth > 1.2 ? 6 : depth > 0.5 ? 2 : 1;               // swimming is allowed, just slower
      });
    }
    return this.astar(G, from, to);
  }

  astar(G, from, to) {
    const { nx, nz, cell, cost, x0, z0 } = G;
    const idx = (p) => { const i = Math.round((p.x - x0) / cell), j = Math.round((p.z - z0) / cell); return (i < 0 || j < 0 || i >= nx || j >= nz) ? -1 : j * nx + i; };
    const nearestFree = (k) => {
      if (k < 0) return -1; if (cost[k]) return k;
      const i0 = k % nx, j0 = (k / nx) | 0;
      for (let r = 1; r < 10; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        if (cost[j * nx + i]) return j * nx + i;
      }
      return -1;
    };
    const s = nearestFree(idx(from)), e = nearestFree(idx(to));
    if (s < 0 || e < 0) return null;
    const N = nx * nz, gS = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const ei = e % nx, ej = (e / nx) | 0;
    const h = k => { const dx = Math.abs(k % nx - ei), dz = Math.abs(((k / nx) | 0) - ej); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)); };
    const heap = new Heap(); gS[s] = 0; heap.push(s, h(s));
    let it = 0;
    while (heap.size) {
      const k = heap.pop(); if (k === e) break; if (closed[k]) continue; closed[k] = 1;
      if (++it > 60000) return null;
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = jj * nx + ii; if (!cost[n] || closed[n]) continue;
        if (di && dj && (!cost[j * nx + ii] || !cost[jj * nx + i])) continue;   // no squeezing past corners
        const step = (di && dj ? 1.4142 : 1) * (cost[n] + cost[k]) * 0.5;
        const ng = gS[k] + step;
        if (ng < gS[n]) { gS[n] = ng; came[n] = k; heap.push(n, ng + h(n)); }
      }
    }
    if (came[e] < 0 && e !== s) return null;
    const cells = []; for (let k = e; k >= 0; k = k === s ? -1 : came[k]) cells.push(k);
    cells.reverse();
    const pt = k => new THREE.Vector3(x0 + (k % nx) * cell, G.hgt[k], z0 + ((k / nx) | 0) * cell);
    // line-of-sight smoothing on the grid
    const out = [pt(cells[0])]; let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.clear(G, cells[a], cells[b])) b--;
      out.push(pt(cells[b])); a = b;
    }
    return out;
  }
  clear(G, ka, kb) {
    const { nx, cost } = G;
    let i0 = ka % nx, j0 = (ka / nx) | 0; const i1 = kb % nx, j1 = (kb / nx) | 0;
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)) * 2;
    for (let t = 1; t < n; t++) {
      const i = Math.round(i0 + (i1 - i0) * t / n), j = Math.round(j0 + (j1 - j0) * t / n), k = j * nx + i;
      if (!cost[k] || cost[k] > 1.5) return false;
    }
    return true;
  }
}

class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(k, p) { const K = this.k, P = this.p; K.push(k); P.push(p); let i = K.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (P[q] <= P[i]) break; [K[q], K[i]] = [K[i], K[q]]; [P[q], P[i]] = [P[i], P[q]]; i = q; } }
  pop() {
    const K = this.k, P = this.p, top = K[0], lk = K.pop(), lp = P.pop();
    if (K.length) { K[0] = lk; P[0] = lp; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < K.length && P[l] < P[m]) m = l; if (r < K.length && P[r] < P[m]) m = r; if (m === i) break; [K[m], K[i]] = [K[i], K[m]]; [P[m], P[i]] = [P[i], P[m]]; i = m; } }
    return top;
  }
}
