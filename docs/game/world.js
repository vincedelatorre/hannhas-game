// Shared world math: the terrain height function (identical to the Unreal heightmap
// generator) and conversions between the blockout frame and three.js.
//   blockout: x east, y inland, metres      three.js: X = x, Y = up, Z = -y
import * as THREE from 'three/webgpu';

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function H(x, y) {
  const d = y - (-5 - 0.008 * x * x);
  const n = 0.35 * Math.sin(x * 0.11) * Math.cos(y * 0.09) + 0.25 * Math.sin(x * 0.23 + 1.3) * Math.sin(y * 0.19 + 0.7);
  let h;
  if (d < 0) h = Math.max(-7, d * 0.22);
  else if (d < 32) h = d * 0.065;
  else h = 32 * 0.065 + Math.min(14, (d - 32) * 0.16) + n * 2 * smooth(32, 50, d);
  const head = smooth(46, 64, Math.abs(x)) * smooth(-58, -40, y);
  h = h * (1 - head) + head * (16 + 4 * Math.sin(y * 0.07 + x * 0.03) + n * 3);
  // clubhouse pad
  const pd = Math.hypot(x / 15, (y - 28) / 12);
  if (pd < 1.6) { const k = 1 - smooth(1, 1.6, pd); h = h * (1 - k) + 2 * k; }
  // lagoon pool
  const ld = Math.hypot(x / 7, (y - 11) / 4.5);
  if (ld < 1.3) h -= 1.4 * (1 - smooth(0.7, 1.3, ld));
  // tide pool hollows
  for (const [px, py] of [[24, -4], [28, -6]]) { const r = Math.hypot(x - px, y - py); if (r < 2.2) h -= 0.35 * (1 - smooth(0.8, 2.2, r)); }
  return h;
}

/** height at a three.js (x, z) position */
export const G = (x, z) => H(x, -z);
/** blockout (x, y, height) -> three.js vector */
export const V = (x, y, h = H(x, y)) => new THREE.Vector3(x, h, -y);

/** deterministic random numbers so the world looks the same every visit */
export function rng(seed = 7) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** terrain slope (0 flat, 1 = 45 degrees) */
export function slope(x, y) {
  const e = 0.5;
  return Math.hypot(H(x + e, y) - H(x - e, y), H(x, y + e) - H(x, y - e)) / (2 * e);
}
