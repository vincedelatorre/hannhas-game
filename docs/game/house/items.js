// The grocery and kitchenware library: every pickable thing in the kitchen, built as real
// little 3D objects (origin at the base, sizes in metres) with metadata the cooking and recipe
// systems read: id, name, category, tags, quantity + unit, and where it is normally stored.
//
//   ITEM_DEFS[id] = { name, cat, tags[], qty, unit, build(K) -> Object3D, label? }
//   makeItemObject(id, M)  builds a fresh mesh for that item (used in the world and for
//                          recipe-book thumbnails, so the pictures match the real objects)
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ shared materials
const MATS = new Map();
export function mat(col, opts = {}) {
  const key = col + JSON.stringify(opts);
  if (!MATS.has(key)) {
    const m = opts.phys ? new THREE.MeshPhysicalNodeMaterial({ color: col, roughness: 0.4, ...opts.phys }) : new THREE.MeshStandardNodeMaterial({ color: col, roughness: opts.r ?? 0.55, metalness: opts.m ?? 0 });
    if (opts.glass) { m.transparent = true; m.opacity = opts.glass; m.depthWrite = false; }
    if (opts.side) m.side = opts.side;
    MATS.set(key, m);
  }
  return MATS.get(key);
}
const GLASS = () => mat(0xEAF4F4, { phys: { roughness: 0.05, transmission: 0 }, glass: 0.28 });
const GEOS = new Map();
const geo = (key, make) => { if (!GEOS.has(key)) GEOS.set(key, make()); return GEOS.get(key); };

// ------------------------------------------------------------------ printed labels (invented, no brands)
const LABELS = new Map();
/** a printed package front: colour band, a simple drawing, the item's name */
export function labelTex(text, bg = '#F4EFE6', fg = '#2B2B2B', accent = '#C0392B', icon = null, w = 256, h = 320) {
  const key = [text, bg, fg, accent, icon, w, h].join('|');
  if (LABELS.has(key)) return LABELS.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, h * 0.68, w, h * 0.32);
  g.fillStyle = accent; g.beginPath(); g.arc(w / 2, h * 0.36, Math.min(w, h) * 0.2, 0, Math.PI * 2); g.fill();
  if (icon) { g.font = `${Math.round(Math.min(w, h) * 0.26)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, w / 2, h * 0.37); }
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(h * 0.085)}px "Nunito", "Trebuchet MS", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = text.toUpperCase().split(' '); const lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > w * 0.9 && cur) { lines.push(cur); cur = wd; } else cur = t; }
  lines.push(cur);
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, w / 2, h * (lines.length > 1 ? 0.78 + i * 0.1 : 0.84)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardNodeMaterial({ map: t, roughness: 0.6 });
  LABELS.set(key, m); return m;
}

// ------------------------------------------------------------------ primitive builders
const G = () => new THREE.Group();
const add = (g, m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
const sph = (r, col, sy = 1, opts) => { const m = new THREE.Mesh(geo('s' + r, () => new THREE.SphereGeometry(r, 18, 12)), mat(col, opts)); m.scale.y = sy; return m; };
const cylM = (r, h, col, opts, seg = 18, r2 = r) => new THREE.Mesh(geo(`c${r},${r2},${h},${seg}`, () => new THREE.CylinderGeometry(r2, r, h, seg)), mat(col, opts));
const boxM = (w, h, d, m) => new THREE.Mesh(geo(`b${w},${h},${d}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.12)), m);

/** box package with a printed front (+z) */
function pack(w, h, d, text, bg, accent, icon, side = 0xF4EFE6) {
  const g = G(); const s = mat(side);
  const m = new THREE.Mesh(geo(`pk${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), [s, s, s, s, labelTex(text, bg, '#222', accent, icon), s]);
  add(g, m, 0, h / 2, 0); return g;
}
/** round fruit with a stem (and optional leaf) */
function fruit(r, col, { sy = 0.95, stem = true, leaf = false, dimple = true } = {}) {
  const g = G(); add(g, sph(r, col, sy, { r: 0.35 }), 0, r * sy, 0);
  if (stem) add(g, cylM(0.0025, 0.018, 0x5A3A1A), 0, r * sy * 2 + 0.004, 0);
  if (leaf) { const l = new THREE.Mesh(geo('leaf', () => new THREE.SphereGeometry(0.012, 8, 6)), mat(0x3E8E2F)); l.scale.set(1.6, 0.3, 0.8); add(g, l, 0.012, r * sy * 2 + 0.006, 0); }
  return g;
}
/** clear punnet of berries */
function punnet(col, br = 0.009, n = 18, w = 0.13, d = 0.1) {
  const g = G(); const h = 0.055;
  add(g, new THREE.Mesh(geo(`pun${w}`, () => new THREE.BoxGeometry(w, h, d)), GLASS()), 0, h / 2, 0);
  for (let i = 0; i < n; i++) add(g, sph(br, col, 1, { r: 0.4 }), (Math.random() - 0.5) * (w - 0.025), h - 0.006 + Math.random() * 0.01, (Math.random() - 0.5) * (d - 0.025));
  return g;
}
function bottle(r, h, col, cap = 0xffffff, label = null, opts = {}) {
  const g = G();
  const prof = [[0, 0], [r, 0], [r, h * 0.62], [r * 0.45, h * 0.82], [r * 0.32, h * 0.92], [r * 0.32, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(geo(`bt${r},${h}`, () => new THREE.LatheGeometry(prof, 20)), mat(col, opts)); add(g, body);
  add(g, cylM(r * 0.36, 0.022, cap), 0, h + 0.008, 0);
  if (label) add(g, new THREE.Mesh(geo(`btl${r},${h}`, () => new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.32, 20, 1, true, -Math.PI * 0.6, Math.PI * 1.2)), label), 0, h * 0.33, 0);
  return g;
}
function jar(r, h, fill, lid = 0xC9A47A, label = null) {
  const g = G();
  add(g, new THREE.Mesh(geo(`jg${r},${h}`, () => new THREE.CylinderGeometry(r, r, h, 20, 1, true)), GLASS()), 0, h / 2, 0);
  const f = add(g, cylM(r * 0.93, h * 0.8, fill, { r: 0.85 }), 0, h * 0.4 + 0.003, 0); f.name = 'fill';
  add(g, cylM(r * 1.04, 0.022, lid), 0, h + 0.01, 0);
  if (label) add(g, new THREE.Mesh(geo(`jl${r},${h}`, () => new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.42, 20, 1, true, -Math.PI * 0.55, Math.PI * 1.1)), label), 0, h * 0.42, 0);
  return g;
}
function can(r, h, col, label) {
  const g = G(); add(g, cylM(r, h, 0xC9CED2, { r: 0.3, m: 0.8 }), 0, h / 2, 0);
  add(g, new THREE.Mesh(geo(`cl${r},${h}`, () => new THREE.CylinderGeometry(r * 1.005, r * 1.005, h * 0.8, 20, 1, true)), label || mat(col)), 0, h / 2, 0);
  return g;
}
function tub(r, h, col, lid = 0xffffff, label = null) {
  const g = G(); add(g, cylM(r, h, col, { r: 0.5 }, 20, r * 0.88), 0, h / 2, 0); add(g, cylM(r * 1.03, 0.012, lid), 0, h + 0.004, 0);
  if (label) add(g, new THREE.Mesh(geo(`tl${r},${h}`, () => new THREE.CylinderGeometry(r * 0.96, r * 0.92, h * 0.6, 20, 1, true, -Math.PI * 0.5, Math.PI)), label), 0, h * 0.5, 0);
  return g;
}
/** a tray of meat/fish under clear film */
function tray(w, d, col, pieces = 2, shape = 'slab') {
  const g = G(); const h = 0.03;
  add(g, new THREE.Mesh(geo(`tr${w},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(0xF7F7F2)), 0, h / 2, 0);
  for (let i = 0; i < pieces; i++) {
    const m = shape === 'round' ? sph(0.03, col, 0.5, { r: 0.6 }) : new THREE.Mesh(geo(`sl${w}${pieces}`, () => new RoundedBoxGeometry(w / pieces * 0.85, 0.022, d * 0.75, 2, 0.008)), mat(col, { r: 0.6 }));
    add(g, m, -w / 2 + (i + 0.5) * w / pieces, h + 0.008, 0);
  }
  add(g, new THREE.Mesh(geo(`film${w},${d}`, () => new THREE.BoxGeometry(w + 0.004, 0.04, d + 0.004)), GLASS()), 0, 0.03, 0);
  return g;
}
/** soft bag (frozen veg, chips, rice) */
function pouch(w, h, d, text, bg, accent, icon) {
  const g = G();
  const geoP = geo(`po${w},${h},${d}`, () => { const b = new RoundedBoxGeometry(w, h, d, 3, Math.min(d * 0.45, 0.02)); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / (h / 2); p.setZ(i, p.getZ(i) * (1 - 0.35 * y * y)); } b.computeVertexNormals(); return b; });
  const s = mat(new THREE.Color(bg).getHex());
  add(g, new THREE.Mesh(geoP, s), 0, h / 2, 0);
  add(g, new THREE.Mesh(geo(`pof${w},${h}`, () => new THREE.PlaneGeometry(w * 0.86, h * 0.72)), labelTex(text, bg, '#222', accent, icon)), 0, h / 2, d / 2 * 0.72);
  return g;
}

// ------------------------------------------------------------------ specific shapes
function banana() {
  const g = G(); const m = mat(0xF2D23C, { r: 0.5 });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.08, 0.04, 0), new THREE.Vector3(-0.03, 0.012, 0), new THREE.Vector3(0.03, 0.012, 0), new THREE.Vector3(0.085, 0.045, 0)]);
    const t = new THREE.Mesh(geo('ban', () => new THREE.TubeGeometry(c, 16, 0.017, 8)), m); t.position.z = (i - 1) * 0.03; t.rotation.x = (i - 1) * 0.12; add(g, t, 0, 0.005 + i * 0.006, (i - 1) * 0.03);
  }
  add(g, cylM(0.008, 0.03, 0x5B4A1E), 0.095, 0.05, 0).rotation.z = 0.6;
  return g;
}
function grapes(col = 0x7DB343) {
  const g = G();
  for (let i = 0; i < 26; i++) { const t = i / 26, r = 0.04 * (1 - t * 0.7); add(g, sph(0.011, col, 1, { r: 0.25 }), Math.cos(i * 2.4) * r, 0.012 + t * 0.12 - Math.abs(Math.sin(i)) * 0.01, Math.sin(i * 2.4) * r); }
  add(g, cylM(0.003, 0.03, 0x6B5A2A), 0, 0.14, 0); return g;
}
function pineapple() {
  const g = G(); add(g, sph(0.065, 0xC88A2A, 1.7, { r: 0.8 }), 0, 0.11, 0);
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(geo('pinl', () => new THREE.ConeGeometry(0.012, 0.12, 4)), mat(0x3E7D2C)); l.rotation.z = Math.cos(i * 0.7) * 0.5; l.rotation.x = Math.sin(i * 0.7) * 0.5; add(g, l, 0, 0.27, 0); }
  return g;
}
function melon(r, col, stripe) { const g = G(); add(g, sph(r, col, 0.85, { r: 0.4 }), 0, r * 0.85, 0); if (stripe) add(g, sph(r * 1.005, stripe, 0.85, { r: 0.4, glass: 0.0 }), 0, r * 0.85, 0).visible = false; return g; }
function carrots() { const g = G(); for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(geo('car', () => new THREE.ConeGeometry(0.014, 0.17, 10)), mat(0xF07A12)); c.rotation.z = Math.PI / 2; add(g, c, 0, 0.015, (i - 1.5) * 0.026); const top = new THREE.Mesh(geo('cart', () => new THREE.ConeGeometry(0.01, 0.08, 5)), mat(0x4C9A2A)); top.rotation.z = -Math.PI / 2; add(g, top, -0.12, 0.015, (i - 1.5) * 0.026); } return g; }
function broccoli(col = 0x2F7D32) { const g = G(); add(g, cylM(0.015, 0.06, 0x8DBF5A), 0, 0.03, 0); for (let i = 0; i < 7; i++) add(g, sph(0.028, col, 0.8, { r: 0.9 }), Math.cos(i) * 0.025 * (i > 0), 0.075 + (i === 0) * 0.01, Math.sin(i) * 0.025 * (i > 0)); return g; }
function lettuce(col = 0x7CB342) { const g = G(); for (let i = 0; i < 5; i++) { const s = sph(0.06 - i * 0.008, i % 2 ? col : 0x9CCC65, 0.75, { r: 0.7 }); s.rotation.y = i; add(g, s, 0, 0.045, 0); } return g; }
function pepper(col) { const g = G(); add(g, sph(0.035, col, 1.1, { r: 0.25 }), 0, 0.038, 0); add(g, cylM(0.005, 0.02, 0x3E7D2C), 0, 0.085, 0); return g; }
function cucumber(col = 0x2E5E23, len = 0.2, r = 0.022) { const g = G(); const c = new THREE.Mesh(geo(`cu${len}${r}`, () => new THREE.CapsuleGeometry(r, len, 6, 12)), mat(col, { r: 0.45 })); c.rotation.z = Math.PI / 2; add(g, c, 0, r, 0); return g; }
function onion(col, r = 0.035) { const g = G(); add(g, sph(r, col, 0.95, { r: 0.45 }), 0, r * 0.95, 0); const t = new THREE.Mesh(geo('oti', () => new THREE.ConeGeometry(0.008, 0.03, 6)), mat(col)); add(g, t, 0, r * 1.9 + 0.01, 0); return g; }
function garlic() { const g = G(); for (let i = 0; i < 6; i++) add(g, sph(0.014, 0xF2EEE2, 1.3, { r: 0.6 }), Math.cos(i) * 0.012, 0.02, Math.sin(i) * 0.012); return g; }
function potato(col = 0xB88A54) { const g = G(); const s = sph(0.035, col, 0.7, { r: 0.9 }); s.scale.set(1.35, 0.7, 1); add(g, s, 0, 0.025, 0); return g; }
function herbBunch(col) { const g = G(); for (let i = 0; i < 9; i++) { const s = cylM(0.002, 0.12, 0x4E7D33); s.rotation.z = (i - 4) * 0.06; add(g, s, (i - 4) * 0.004, 0.06, 0); const l = sph(0.016, col, 0.5, { r: 0.6 }); add(g, l, (i - 4) * 0.008, 0.12 + (i % 3) * 0.01, (i % 2 - 0.5) * 0.02); } add(g, cylM(0.006, 0.01, 0xC0392B), 0, 0.03, 0); return g; }
function eggCarton() {
  const g = G(); add(g, new THREE.Mesh(geo('ecb', () => new THREE.BoxGeometry(0.3, 0.04, 0.11)), mat(0xC9B79C, { r: 0.9 })), 0, 0.02, 0);
  for (let i = 0; i < 12; i++) { const e = sph(0.021, 0xF3E6D2, 1.25, { r: 0.6 }); e.name = 'egg' + i; add(g, e, -0.125 + (i % 6) * 0.05, 0.045, (Math.floor(i / 6) - 0.5) * 0.05); }
  return g;
}
function milkCarton(text, accent, w = 0.075) { const g = pack(w, 0.2, w, text, '#FFFFFF', accent, '🥛'); const roof = new THREE.Mesh(geo(`roof${w}`, () => new THREE.CylinderGeometry(0, w * 0.71, 0.05, 4, 1)), mat(0xF4F4F4)); roof.rotation.y = Math.PI / 4; add(g, roof, 0, 0.225, 0); return g; }
function butter() { const g = G(); add(g, boxM(0.12, 0.035, 0.065, mat(0xF6E7A1, { r: 0.4 })), 0, 0.0175, 0); add(g, new THREE.Mesh(geo('bw', () => new THREE.BoxGeometry(0.07, 0.036, 0.066)), mat(0xFDFBF2)), 0.026, 0.018, 0); return g; }
function cheese(col, shape = 'block') {
  const g = G();
  if (shape === 'wedge') { const w = new THREE.Mesh(geo('wedge', () => new THREE.CylinderGeometry(0.08, 0.08, 0.05, 3, 1, false, 0, Math.PI / 3)), mat(col, { r: 0.6 })); add(g, w, 0, 0.025, 0); }
  else if (shape === 'ball') add(g, sph(0.035, col, 0.9, { r: 0.3 }), 0, 0.032, 0);
  else add(g, boxM(0.1, 0.045, 0.06, mat(col, { r: 0.6 })), 0, 0.0225, 0);
  return g;
}
function pastaBox(text, accent, shape = 'long') {
  const long = shape === 'long', w = long ? 0.07 : 0.11, h = long ? 0.27 : 0.17, d = 0.045;
  const g = pack(w, h, d, text, '#1F4E9A', accent, long ? '🍝' : '🍽️');
  return g;
}
function cutleryPiece(kind) {
  const g = G(); const steel = mat(0xD4D7DA, { r: 0.25, m: 1 });
  add(g, new THREE.Mesh(geo('ch', () => new THREE.BoxGeometry(0.012, 0.004, 0.11)), steel), 0, 0.003, -0.02);
  if (kind === 'fork') for (let i = 0; i < 4; i++) add(g, new THREE.Mesh(geo('ft', () => new THREE.BoxGeometry(0.002, 0.003, 0.05)), steel), -0.006 + i * 0.004, 0.003, 0.06);
  if (kind === 'spoon') { const s = sph(0.016, 0xD4D7DA, 0.25, { r: 0.25, m: 1 }); s.scale.set(1, 0.25, 1.5); add(g, s, 0, 0.004, 0.06); }
  if (kind === 'knife') add(g, new THREE.Mesh(geo('kb', () => new THREE.BoxGeometry(0.016, 0.002, 0.09)), steel), 0, 0.003, 0.07);
  if (kind === 'chopsticks') { g.clear(); for (const x of [-0.006, 0.006]) add(g, cylM(0.003, 0.22, 0x8B5A2B), x, 0.003, 0).rotation.x = Math.PI / 2; }
  return g;
}
function utensil(kind) {
  const g = G(); const steel = mat(0xD4D7DA, { r: 0.25, m: 1 }), black = mat(0x222222, { r: 0.5 }), wood = mat(0xC9A47A);
  const handle = add(g, cylM(0.008, 0.18, kind === 'whisk' ? 0x222222 : 0xC9A47A), 0, 0.008, -0.06); handle.rotation.x = Math.PI / 2;
  if (kind === 'spatula') add(g, new THREE.Mesh(geo('spb', () => new THREE.BoxGeometry(0.075, 0.004, 0.09)), black), 0, 0.006, 0.07);
  if (kind === 'whisk') for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(geo('wh', () => new THREE.TorusGeometry(0.03, 0.0015, 4, 16, Math.PI)), steel); w.rotation.set(0, i * Math.PI / 6, Math.PI / 2); w.scale.set(1, 2.2, 1); add(g, w, 0, 0.03, 0.06).rotation.x = Math.PI / 2; }
  if (kind === 'ladle') { const b = sph(0.03, 0xD4D7DA, 0.6, { r: 0.25, m: 1 }); add(g, b, 0, 0.02, 0.06); }
  if (kind === 'tongs') { for (const x of [-0.012, 0.012]) add(g, new THREE.Mesh(geo('tg', () => new THREE.BoxGeometry(0.01, 0.006, 0.24)), steel), x, 0.006, 0.02); }
  if (kind === 'masher') add(g, new THREE.Mesh(geo('ms', () => new THREE.TorusGeometry(0.03, 0.003, 4, 12)), steel), 0, 0.006, 0.06).rotation.x = Math.PI / 2;
  if (kind === 'peeler') add(g, new THREE.Mesh(geo('pl', () => new THREE.BoxGeometry(0.03, 0.004, 0.04)), steel), 0, 0.006, 0.05);
  if (kind === 'server') { const b = sph(0.028, 0x222222, 0.3); b.scale.set(1, 0.3, 1.3); add(g, b, 0, 0.006, 0.07); }
  if (kind === 'rollingpin') { g.clear(); const r = add(g, cylM(0.025, 0.28, 0xD9B98A), 0, 0.025, 0); r.rotation.z = Math.PI / 2; for (const x of [-0.17, 0.17]) add(g, cylM(0.012, 0.06, 0xC9A47A), x, 0.025, 0).rotation.z = Math.PI / 2; }
  if (kind === 'measuringcup') { g.clear(); add(g, cylM(0.04, 0.07, 0xEAF4F4, { glass: 0.35 }), 0, 0.035, 0); }
  if (kind === 'grater') { g.clear(); const b = new THREE.Mesh(geo('gr', () => new THREE.CylinderGeometry(0.03, 0.05, 0.2, 4, 1, true)), steel); b.material.side = THREE.DoubleSide; add(g, b, 0, 0.1, 0).rotation.y = Math.PI / 4; }
  return g;
}
function plate(r = 0.13, col = 0xF6F3EC) { const g = G(); add(g, cylM(r, 0.016, col, { r: 0.25 }, 32, r * 0.72), 0, 0.008, 0); return g; }
function bowlM(r, h, col = 0xF6F3EC) { const g = G(); const p = [[0, 0.002], [r * 0.5, 0], [r * 0.85, h * 0.35], [r, h], [r * 0.94, h], [r * 0.8, h * 0.4], [r * 0.45, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y)); add(g, new THREE.Mesh(geo(`bo${r},${h}`, () => new THREE.LatheGeometry(p, 28)), mat(col, { r: 0.25 })), 0, 0, 0); return g; }
function glass(r, h) { const g = G(); add(g, new THREE.Mesh(geo(`gl${r},${h}`, () => new THREE.CylinderGeometry(r, r * 0.85, h, 18, 1, true)), GLASS()), 0, h / 2, 0); add(g, cylM(r * 0.85, 0.006, 0xEAF4F4, { glass: 0.4 }), 0, 0.003, 0); return g; }
function pot(r, h, col = 0xB9BEC4, handles = 'loop') {
  const g = G(); const steel = mat(col, { r: 0.3, m: 1 });
  const body = new THREE.Mesh(geo(`pt${r},${h}`, () => new THREE.CylinderGeometry(r, r * 0.97, h, 28, 1, true)), steel); body.material.side = THREE.DoubleSide; add(g, body, 0, h / 2, 0);
  add(g, cylM(r * 0.97, 0.008, col, { r: 0.3, m: 1 }), 0, 0.004, 0);
  if (handles === 'loop') for (const s of [-1, 1]) { const hd = new THREE.Mesh(geo(`ph${r}`, () => new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI)), steel); hd.rotation.z = s * Math.PI / 2; add(g, hd, s * (r + 0.005), h * 0.8, 0); }
  else { const hd = cylM(0.01, 0.2, 0x222222); hd.rotation.z = Math.PI / 2; add(g, hd, r + 0.1, h * 0.8, 0); }
  return g;
}
function colander() { const g = G(); const m = mat(0xD4D7DA, { r: 0.3, m: 1, side: THREE.DoubleSide }); const p = [[0.04, 0], [0.11, 0.07], [0.12, 0.09]].map(([x, y]) => new THREE.Vector2(x, y)); add(g, new THREE.Mesh(geo('col', () => new THREE.LatheGeometry(p, 28)), m)); for (const s of [-1, 1]) { const hd = new THREE.Mesh(geo('colh', () => new THREE.TorusGeometry(0.02, 0.005, 6, 10, Math.PI)), m); hd.rotation.z = s * Math.PI / 2; add(g, hd, s * 0.125, 0.08, 0); } for (let i = 0; i < 24; i++) { const d = sph(0.004, 0x333333); const a = i * 0.79, y = 0.02 + (i % 4) * 0.015; add(g, d, Math.cos(a) * (0.06 + y * 0.7), y, Math.sin(a) * (0.06 + y * 0.7)); } return g; }
function bakingTray(w = 0.38, d = 0.28) { const g = G(); const m = mat(0x9AA0A6, { r: 0.4, m: 0.8 }); add(g, new THREE.Mesh(geo(`bt${w}`, () => new THREE.BoxGeometry(w, 0.006, d)), m), 0, 0.003, 0); for (const [x, z, ww, dd] of [[0, d / 2, w, 0.006], [0, -d / 2, w, 0.006], [w / 2, 0, 0.006, d], [-w / 2, 0, 0.006, d]]) add(g, new THREE.Mesh(geo(`btr${ww},${dd}`, () => new THREE.BoxGeometry(ww, 0.02, dd)), m), x, 0.01, z); return g; }
function cuttingBoard() { const g = G(); add(g, boxM(0.38, 0.025, 0.26, mat(0xC9A47A, { r: 0.6 })), 0, 0.0125, 0); return g; }
function towel(col) { const g = G(); add(g, boxM(0.18, 0.03, 0.12, mat(col, { r: 0.95 })), 0, 0.015, 0); return g; }
function mitt(col = 0xC0392B) { const g = G(); const s = sph(0.05, col, 0.35, { r: 0.9 }); s.scale.set(1, 0.35, 1.6); add(g, s, 0, 0.018, 0); const t = sph(0.02, col, 0.35, { r: 0.9 }); add(g, t, 0.05, 0.018, 0.02); return g; }

// ------------------------------------------------------------------ the catalogue
const P = (w, h, d, text, bg, accent, icon) => () => pack(w, h, d, text, bg, accent, icon);
const L = (t, bg, a, i) => labelTex(t, bg, '#222', a, i);
export const ITEM_DEFS = {
  // ---- fruit
  apple_red: { name: 'red apple', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'choppable', 'edible'], build: () => fruit(0.038, 0xC62828, { leaf: true }) },
  apple_green: { name: 'green apple', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'choppable', 'edible'], build: () => fruit(0.037, 0x8BC34A, { leaf: true }) },
  banana: { name: 'bananas', cat: 'fruit', tags: ['food', 'fruit', 'choppable', 'edible'], build: banana },
  strawberries: { name: 'strawberries', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'choppable', 'berries'], build: () => punnet(0xD32F2F, 0.012, 14) },
  blueberries: { name: 'blueberries', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'berries'], build: () => punnet(0x3949AB, 0.007, 40, 0.1, 0.08) },
  raspberries: { name: 'raspberries', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'berries'], build: () => punnet(0xE53958, 0.009, 24, 0.1, 0.08) },
  blackberries: { name: 'blackberries', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'berries'], build: () => punnet(0x2A1B3D, 0.009, 24, 0.1, 0.08) },
  grapes: { name: 'grapes', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'choppable'], build: () => grapes() },
  orange: { name: 'orange', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => fruit(0.038, 0xF57C00, { stem: false }) },
  lemon: { name: 'lemon', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => { const g = fruit(0.032, 0xF4D03F, { stem: false, sy: 0.8 }); g.children[0].scale.set(1.3, 0.8, 1); return g; } },
  lime: { name: 'lime', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => fruit(0.027, 0x6CBF3A, { stem: false }) },
  pineapple: { name: 'pineapple', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: pineapple },
  watermelon: { name: 'watermelon', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => melon(0.12, 0x2E7D32) },
  cantaloupe: { name: 'cantaloupe', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => melon(0.075, 0xD8C08A) },
  peach: { name: 'peach', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'choppable', 'edible'], build: () => fruit(0.036, 0xF4A26B) },
  pear: { name: 'pear', cat: 'fruit', tags: ['food', 'fruit', 'washable', 'choppable', 'edible'], build: () => { const g = G(); add(g, sph(0.035, 0xC5D86D, 1, { r: 0.45 }), 0, 0.035, 0); add(g, sph(0.024, 0xC5D86D, 1.1, { r: 0.45 }), 0, 0.075, 0); add(g, cylM(0.003, 0.02, 0x5A3A1A), 0, 0.108, 0); return g; } },
  kiwi: { name: 'kiwi', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => { const g = fruit(0.028, 0x7A5C3A, { stem: false }); g.children[0].scale.set(1.25, 0.95, 1); return g; } },
  mango: { name: 'mango', cat: 'fruit', tags: ['food', 'fruit', 'choppable'], build: () => { const g = fruit(0.042, 0xF2A33A, { stem: true }); g.children[0].scale.set(1.3, 0.85, 0.95); return g; } },
  // ---- vegetables and herbs
  carrots: { name: 'carrots', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: carrots },
  broccoli: { name: 'broccoli', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => broccoli() },
  cauliflower: { name: 'cauliflower', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => broccoli(0xF2EAD3) },
  spinach: { name: 'spinach', cat: 'veg', tags: ['food', 'veg', 'washable'], build: () => pouch(0.16, 0.2, 0.05, 'Spinach', '#2E7D32', '#1B5E20', '🥬') },
  kale: { name: 'kale', cat: 'veg', tags: ['food', 'veg', 'washable'], build: () => lettuce(0x33691E) },
  romaine: { name: 'romaine lettuce', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => lettuce() },
  tomato: { name: 'tomatoes', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => { const g = fruit(0.034, 0xE53935, { stem: true, sy: 0.85, leaf: true }); return g; } },
  cherry_tomatoes: { name: 'cherry tomatoes', cat: 'veg', tags: ['food', 'veg', 'washable'], build: () => punnet(0xE53935, 0.012, 16) },
  cucumber: { name: 'cucumber', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => cucumber() },
  bell_pepper_red: { name: 'red pepper', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => pepper(0xD32F2F) },
  bell_pepper_yellow: { name: 'yellow pepper', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => pepper(0xF9C80E) },
  bell_pepper_green: { name: 'green pepper', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => pepper(0x388E3C) },
  jalapeno: { name: 'jalapeños', cat: 'veg', tags: ['food', 'veg', 'washable'], build: () => cucumber(0x2E7D32, 0.05, 0.012) },
  mushrooms: { name: 'mushrooms', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => punnet(0xD7C3A6, 0.016, 8) },
  zucchini: { name: 'zucchini', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => cucumber(0x33691E, 0.18, 0.021) },
  asparagus: { name: 'asparagus', cat: 'veg', tags: ['food', 'veg', 'washable'], build: () => { const g = G(); for (let i = 0; i < 8; i++) add(g, cylM(0.005, 0.2, 0x689F38), (i % 4 - 1.5) * 0.011, 0.006, (Math.floor(i / 4) - 0.5) * 0.011).rotation.z = Math.PI / 2; return g; } },
  celery: { name: 'celery', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => { const g = G(); for (let i = 0; i < 5; i++) add(g, cylM(0.009, 0.24, 0xA5C96A), (i - 2) * 0.016, 0.009, 0).rotation.z = Math.PI / 2; return g; } },
  green_onions: { name: 'green onions', cat: 'veg', tags: ['food', 'veg', 'washable'], build: () => { const g = G(); for (let i = 0; i < 6; i++) add(g, cylM(0.004, 0.22, i % 2 ? 0x7CB342 : 0x9CCC65), (i - 2.5) * 0.009, 0.005, 0).rotation.z = Math.PI / 2; return g; } },
  onion_red: { name: 'red onion', cat: 'veg', tags: ['food', 'veg', 'choppable'], build: () => onion(0x7B1E4A) },
  onion_yellow: { name: 'yellow onion', cat: 'veg', tags: ['food', 'veg', 'choppable'], build: () => onion(0xC9952F) },
  garlic: { name: 'garlic', cat: 'veg', tags: ['food', 'veg', 'choppable', 'garlic'], build: garlic },
  potato: { name: 'potatoes', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => potato() },
  sweet_potato: { name: 'sweet potato', cat: 'veg', tags: ['food', 'veg', 'washable', 'choppable'], build: () => potato(0xA0522D) },
  basil: { name: 'fresh basil', cat: 'herb', tags: ['food', 'herb', 'basil'], build: () => herbBunch(0x2E8B3A) },
  parsley: { name: 'parsley', cat: 'herb', tags: ['food', 'herb'], build: () => herbBunch(0x3A9D3A) },
  cilantro: { name: 'cilantro', cat: 'herb', tags: ['food', 'herb'], build: () => herbBunch(0x4CAF50) },
  // ---- dairy and eggs
  milk_whole: { name: 'whole milk', cat: 'dairy', tags: ['food', 'drink', 'dairy', 'milk', 'pourable'], qty: 1000, unit: 'ml', build: () => milkCarton('Whole Milk', '#C0392B') },
  milk_2: { name: '2% milk', cat: 'dairy', tags: ['food', 'drink', 'dairy', 'milk', 'pourable'], qty: 1000, unit: 'ml', build: () => milkCarton('2% Milk', '#2E86C1') },
  milk_almond: { name: 'almond milk', cat: 'dairy', tags: ['food', 'drink', 'milk', 'pourable'], qty: 1000, unit: 'ml', build: () => milkCarton('Almond Milk', '#A0522D') },
  milk_oat: { name: 'oat milk', cat: 'dairy', tags: ['food', 'drink', 'milk', 'pourable'], qty: 1000, unit: 'ml', build: () => milkCarton('Oat Milk', '#D4A017') },
  cream: { name: 'heavy cream', cat: 'dairy', tags: ['food', 'dairy', 'cream', 'pourable'], qty: 500, unit: 'ml', build: () => milkCarton('Heavy Cream', '#8E44AD', 0.06) },
  half_half: { name: 'half-and-half', cat: 'dairy', tags: ['food', 'dairy', 'pourable'], qty: 500, unit: 'ml', build: () => milkCarton('Half & Half', '#16A085', 0.06) },
  butter: { name: 'butter', cat: 'dairy', tags: ['food', 'dairy', 'butter'], qty: 4, unit: 'sticks', build: butter },
  butter_unsalted: { name: 'unsalted butter', cat: 'dairy', tags: ['food', 'dairy', 'butter'], qty: 4, unit: 'sticks', build: butter },
  eggs: { name: 'eggs', cat: 'dairy', tags: ['food', 'egg'], qty: 12, unit: '', build: eggCarton },
  cheddar: { name: 'cheddar cheese', cat: 'dairy', tags: ['food', 'dairy', 'cheese', 'cheddar'], build: () => cheese(0xF2A73B) },
  mozzarella: { name: 'mozzarella', cat: 'dairy', tags: ['food', 'dairy', 'cheese', 'mozzarella'], build: () => cheese(0xFAF7EE, 'ball') },
  parmesan: { name: 'parmesan', cat: 'dairy', tags: ['food', 'dairy', 'cheese', 'parmesan'], build: () => cheese(0xF2E2A4, 'wedge') },
  swiss: { name: 'swiss cheese', cat: 'dairy', tags: ['food', 'dairy', 'cheese'], build: () => cheese(0xF6E8A6) },
  ricotta: { name: 'ricotta', cat: 'dairy', tags: ['food', 'dairy'], build: () => tub(0.045, 0.06, 0xFFFFFF, 0x2E86C1, L('Ricotta', '#FFFFFF', '#2E86C1', '🧀')) },
  cream_cheese: { name: 'cream cheese', cat: 'dairy', tags: ['food', 'dairy'], build: P(0.11, 0.04, 0.06, 'Cream Cheese', '#E8F1FB', '#1F4E9A', '🧀') },
  yogurt_greek: { name: 'greek yogurt', cat: 'dairy', tags: ['food', 'dairy', 'yogurt'], build: () => tub(0.05, 0.08, 0xFFFFFF, 0x1F4E9A, L('Greek Yogurt', '#FFFFFF', '#1F4E9A', '🥣')) },
  yogurt: { name: 'strawberry yogurt', cat: 'dairy', tags: ['food', 'dairy', 'yogurt'], build: () => tub(0.035, 0.07, 0xFFFFFF, 0xE91E63, L('Yogurt', '#FFFFFF', '#E91E63', '🍓')) },
  sour_cream: { name: 'sour cream', cat: 'dairy', tags: ['food', 'dairy'], build: () => tub(0.05, 0.065, 0xFFFFFF, 0x27AE60, L('Sour Cream', '#FFFFFF', '#27AE60', '🥄')) },
  // ---- meat and protein (raw stays packaged until it's cooked)
  chicken_breast: { name: 'chicken breasts', cat: 'protein', tags: ['food', 'meat', 'raw'], build: () => tray(0.2, 0.14, 0xF2C2B0, 2) },
  chicken_thighs: { name: 'chicken thighs', cat: 'protein', tags: ['food', 'meat', 'raw'], build: () => tray(0.2, 0.14, 0xE9AFA0, 4, 'round') },
  ground_beef: { name: 'ground beef', cat: 'protein', tags: ['food', 'meat', 'raw', 'beef'], build: () => tray(0.16, 0.12, 0xB5443A, 1) },
  steak: { name: 'steaks', cat: 'protein', tags: ['food', 'meat', 'raw'], build: () => tray(0.22, 0.15, 0xA3302B, 2) },
  bacon: { name: 'bacon', cat: 'protein', tags: ['food', 'meat', 'raw', 'bacon'], build: P(0.2, 0.02, 0.12, 'Bacon', '#F8E8E0', '#C0392B', '🥓') },
  sausage: { name: 'sausages', cat: 'protein', tags: ['food', 'meat', 'raw'], build: () => tray(0.2, 0.12, 0xC0705A, 5, 'round') },
  turkey: { name: 'sliced turkey', cat: 'protein', tags: ['food', 'meat', 'deli'], build: P(0.15, 0.03, 0.12, 'Sliced Turkey', '#F5EEE6', '#8E6E53', '🦃') },
  ham: { name: 'sliced ham', cat: 'protein', tags: ['food', 'meat', 'deli'], build: P(0.15, 0.03, 0.12, 'Sliced Ham', '#FCE4EC', '#C2185B', '🍖') },
  salmon: { name: 'salmon', cat: 'protein', tags: ['food', 'fish', 'raw'], build: () => tray(0.2, 0.12, 0xF08A5D, 1) },
  shrimp: { name: 'shrimp', cat: 'protein', tags: ['food', 'fish', 'raw'], build: () => tray(0.16, 0.12, 0xF7A08A, 8, 'round') },
  white_fish: { name: 'white fish', cat: 'protein', tags: ['food', 'fish', 'raw'], build: () => tray(0.2, 0.12, 0xF4EFE6, 2) },
  tofu: { name: 'tofu', cat: 'protein', tags: ['food'], build: P(0.12, 0.05, 0.09, 'Tofu', '#FFFFFF', '#27AE60', '🌱') },
  // ---- sauces and condiments
  ketchup: { name: 'ketchup', cat: 'sauce', tags: ['food', 'sauce'], build: () => bottle(0.03, 0.18, 0xC62828, 0xFFFFFF, L('Ketchup', '#FFFFFF', '#C62828', '🍅')) },
  mustard: { name: 'mustard', cat: 'sauce', tags: ['food', 'sauce'], build: () => bottle(0.028, 0.17, 0xF4C430, 0xF4C430, L('Mustard', '#FFFFFF', '#E1A500', '🌭')) },
  mayo: { name: 'mayonnaise', cat: 'sauce', tags: ['food', 'sauce', 'mayo'], build: () => jar(0.04, 0.1, 0xFFF8E7, 0x1F4E9A, L('Mayo', '#FFFFFF', '#1F4E9A', '🥚')) },
  bbq: { name: 'barbecue sauce', cat: 'sauce', tags: ['food', 'sauce'], build: () => bottle(0.03, 0.18, 0x5D2A16, 0x222222, L('BBQ Sauce', '#FFF3E0', '#6D4C41', '🔥')) },
  hot_sauce: { name: 'hot sauce', cat: 'sauce', tags: ['food', 'sauce'], build: () => bottle(0.016, 0.13, 0xB71C1C, 0x1B5E20, L('Hot Sauce', '#FFFFFF', '#B71C1C', '🌶️')) },
  soy_sauce: { name: 'soy sauce', cat: 'sauce', tags: ['food', 'sauce', 'soy'], build: () => bottle(0.025, 0.17, 0x2B1A10, 0xC0392B, L('Soy Sauce', '#FFFFFF', '#C0392B', '🥢')) },
  dressing: { name: 'salad dressing', cat: 'sauce', tags: ['food', 'sauce'], build: () => bottle(0.028, 0.18, 0xF3E5C8, 0x27AE60, L('Ranch Dressing', '#FFFFFF', '#27AE60', '🥗')) },
  marinara: { name: 'marinara sauce', cat: 'sauce', tags: ['food', 'sauce', 'marinara', 'pourable'], qty: 700, unit: 'g', build: () => jar(0.045, 0.14, 0xB22222, 0xC9A47A, L('Marinara', '#FFF8E1', '#B22222', '🍅')) },
  pesto: { name: 'pesto', cat: 'sauce', tags: ['food', 'sauce'], build: () => jar(0.035, 0.08, 0x4E7D2A, 0x2E7D32, L('Pesto', '#FFFFFF', '#2E7D32', '🌿')) },
  pickles: { name: 'pickles', cat: 'sauce', tags: ['food'], build: () => jar(0.045, 0.15, 0x7FA040, 0x2E7D32, L('Pickles', '#FFFFFF', '#2E7D32', '🥒')) },
  jam: { name: 'strawberry jam', cat: 'sauce', tags: ['food', 'jam'], build: () => jar(0.035, 0.08, 0xB71C3C, 0xE57373, L('Jam', '#FFFFFF', '#C2185B', '🍓')) },
  jelly: { name: 'grape jelly', cat: 'sauce', tags: ['food', 'jam', 'jelly'], build: () => jar(0.035, 0.08, 0x6A1B9A, 0x9575CD, L('Grape Jelly', '#FFFFFF', '#6A1B9A', '🍇')) },
  // ---- drinks
  water_bottle: { name: 'bottled water', cat: 'drink', tags: ['drink'], build: () => bottle(0.03, 0.2, 0xBFE3F2, 0x2E86C1, null, { glass: 0.55 }) },
  orange_juice: { name: 'orange juice', cat: 'drink', tags: ['drink', 'juice', 'pourable'], build: () => bottle(0.04, 0.22, 0xF39C12, 0xFFFFFF, L('Orange Juice', '#FFFFFF', '#F39C12', '🍊')) },
  apple_juice: { name: 'apple juice', cat: 'drink', tags: ['drink', 'juice', 'pourable'], build: () => bottle(0.035, 0.2, 0xE5B85C, 0xC62828, L('Apple Juice', '#FFFFFF', '#C62828', '🍎')) },
  lemonade: { name: 'lemonade', cat: 'drink', tags: ['drink', 'pourable'], build: () => bottle(0.035, 0.22, 0xF7E98E, 0xF4D03F, L('Lemonade', '#FFFFFF', '#F4D03F', '🍋'), { glass: 0.7 }) },
  sparkling: { name: 'sparkling water', cat: 'drink', tags: ['drink'], build: () => bottle(0.032, 0.22, 0x9FD8C9, 0x16A085, null, { glass: 0.55 }) },
  // ---- freezer
  frozen_veg: { name: 'frozen vegetables', cat: 'frozen', tags: ['food', 'frozen'], build: () => pouch(0.16, 0.22, 0.05, 'Mixed Veggies', '#E8F6F3', '#1ABC9C', '🥦') },
  frozen_berries: { name: 'frozen berries', cat: 'frozen', tags: ['food', 'frozen', 'berries'], build: () => pouch(0.16, 0.22, 0.05, 'Frozen Berries', '#F3E5F5', '#8E44AD', '🫐') },
  frozen_pizza: { name: 'frozen pizza', cat: 'frozen', tags: ['food', 'frozen', 'pizza'], build: P(0.3, 0.04, 0.3, 'Cheese Pizza', '#FFF3E0', '#E74C3C', '🍕') },
  frozen_chicken: { name: 'frozen chicken', cat: 'frozen', tags: ['food', 'frozen'], build: () => pouch(0.2, 0.24, 0.06, 'Chicken Strips', '#FFF8E1', '#E67E22', '🍗') },
  frozen_fish: { name: 'frozen fish', cat: 'frozen', tags: ['food', 'frozen'], build: P(0.2, 0.05, 0.14, 'Fish Fillets', '#E3F2FD', '#1F4E9A', '🐟') },
  waffles: { name: 'frozen waffles', cat: 'frozen', tags: ['food', 'frozen'], build: P(0.2, 0.06, 0.12, 'Waffles', '#FFF8E1', '#F39C12', '🧇') },
  fries: { name: 'frozen fries', cat: 'frozen', tags: ['food', 'frozen'], build: () => pouch(0.18, 0.26, 0.06, 'Crispy Fries', '#FFF59D', '#C0392B', '🍟') },
  frozen_dessert: { name: 'ice pops', cat: 'frozen', tags: ['food', 'frozen', 'edible'], build: P(0.18, 0.05, 0.12, 'Rainbow Ice Pops', '#E1F5FE', '#E91E63', '🍭') },
  ice_tray: { name: 'ice cubes', cat: 'frozen', tags: ['frozen'], build: () => { const g = G(); add(g, new THREE.Mesh(geo('it', () => new THREE.BoxGeometry(0.26, 0.03, 0.1)), mat(0x90CAF9, { glass: 0.6 })), 0, 0.015, 0); for (let i = 0; i < 12; i++) add(g, boxM(0.03, 0.025, 0.03, mat(0xE3F2FD, { glass: 0.8 })), -0.11 + (i % 6) * 0.044, 0.03, (Math.floor(i / 6) - 0.5) * 0.045); return g; } },
  // ---- pasta and grains
  spaghetti: { name: 'spaghetti', cat: 'pasta', tags: ['food', 'pasta', 'spaghetti'], qty: 500, unit: 'g', build: () => pastaBox('Spaghetti', '#F4D03F', 'long') },
  fettuccine: { name: 'fettuccine', cat: 'pasta', tags: ['food', 'pasta', 'fettuccine'], qty: 500, unit: 'g', build: () => pastaBox('Fettuccine', '#E67E22', 'long') },
  linguine: { name: 'linguine', cat: 'pasta', tags: ['food', 'pasta'], qty: 500, unit: 'g', build: () => pastaBox('Linguine', '#16A085', 'long') },
  penne: { name: 'penne', cat: 'pasta', tags: ['food', 'pasta', 'penne'], qty: 500, unit: 'g', build: () => pastaBox('Penne', '#C0392B', 'short') },
  rigatoni: { name: 'rigatoni', cat: 'pasta', tags: ['food', 'pasta'], qty: 500, unit: 'g', build: () => pastaBox('Rigatoni', '#8E44AD', 'short') },
  macaroni: { name: 'macaroni', cat: 'pasta', tags: ['food', 'pasta', 'macaroni'], qty: 500, unit: 'g', build: () => pastaBox('Macaroni', '#F39C12', 'short') },
  bowtie: { name: 'bow-tie pasta', cat: 'pasta', tags: ['food', 'pasta'], qty: 500, unit: 'g', build: () => pastaBox('Bow Ties', '#E91E63', 'short') },
  lasagna: { name: 'lasagna sheets', cat: 'pasta', tags: ['food', 'pasta'], build: P(0.12, 0.05, 0.27, 'Lasagna', '#1F4E9A', '#27AE60', '🍝') },
  rice_white: { name: 'white rice', cat: 'grain', tags: ['food', 'grain', 'rice'], qty: 1000, unit: 'g', build: () => pouch(0.14, 0.22, 0.06, 'White Rice', '#FFFFFF', '#2E86C1', '🍚') },
  rice_brown: { name: 'brown rice', cat: 'grain', tags: ['food', 'grain', 'rice'], qty: 1000, unit: 'g', build: () => pouch(0.14, 0.22, 0.06, 'Brown Rice', '#F5E6D3', '#8D6E63', '🍚') },
  rice_jasmine: { name: 'jasmine rice', cat: 'grain', tags: ['food', 'grain', 'rice'], qty: 1000, unit: 'g', build: () => pouch(0.14, 0.22, 0.06, 'Jasmine Rice', '#FFFFFF', '#27AE60', '🍚') },
  quinoa: { name: 'quinoa', cat: 'grain', tags: ['food', 'grain'], build: () => jar(0.05, 0.16, 0xE8D3A0, 0xC9A47A, L('Quinoa', '#FFFFFF', '#8D6E63', '🌾')) },
  couscous: { name: 'couscous', cat: 'grain', tags: ['food', 'grain'], build: () => jar(0.05, 0.16, 0xF2D98A, 0xC9A47A, L('Couscous', '#FFFFFF', '#E67E22', '🌾')) },
  oats: { name: 'oats', cat: 'grain', tags: ['food', 'grain', 'oats'], qty: 800, unit: 'g', build: () => tub(0.055, 0.2, 0xD9B98A, 0xC0392B, L('Rolled Oats', '#FFF8E1', '#C0392B', '🌾')) },
  // ---- baking
  flour_ap: { name: 'flour', cat: 'baking', tags: ['food', 'ingredient', 'flour', 'baking'], qty: 1000, unit: 'g', build: () => jar(0.065, 0.24, 0xFBF8F1, 0xC9A47A, L('Flour', '#FFFFFF', '#8D6E63', '🌾')) },
  flour_bread: { name: 'bread flour', cat: 'baking', tags: ['food', 'ingredient', 'flour', 'baking'], qty: 1000, unit: 'g', build: () => jar(0.06, 0.22, 0xF6F0E2, 0xC9A47A, L('Bread Flour', '#FFFFFF', '#6D4C41', '🍞')) },
  sugar: { name: 'sugar', cat: 'baking', tags: ['food', 'ingredient', 'sugar', 'baking'], qty: 1000, unit: 'g', build: () => jar(0.055, 0.2, 0xFFFFFF, 0xC9A47A, L('Sugar', '#FFFFFF', '#2E86C1', '🍬')) },
  brown_sugar: { name: 'brown sugar', cat: 'baking', tags: ['food', 'ingredient', 'brown_sugar', 'baking'], qty: 800, unit: 'g', build: () => jar(0.055, 0.2, 0x9C6B30, 0xC9A47A, L('Brown Sugar', '#FFFFFF', '#8D6E63', '🍯')) },
  powdered_sugar: { name: 'powdered sugar', cat: 'baking', tags: ['food', 'ingredient', 'baking'], build: () => jar(0.05, 0.18, 0xFFFFFF, 0xF8BBD0, L('Powdered Sugar', '#FFFFFF', '#E91E63', '❄️')) },
  baking_powder: { name: 'baking powder', cat: 'baking', tags: ['food', 'ingredient', 'baking_powder', 'baking'], build: () => can(0.035, 0.1, 0xC0392B, L('Baking Powder', '#FFFFFF', '#C0392B', '🧁')) },
  baking_soda: { name: 'baking soda', cat: 'baking', tags: ['food', 'ingredient', 'baking_soda', 'baking'], build: P(0.07, 0.11, 0.04, 'Baking Soda', '#FFF59D', '#F39C12', '🧪') },
  vanilla: { name: 'vanilla extract', cat: 'baking', tags: ['food', 'ingredient', 'vanilla', 'baking'], build: () => bottle(0.016, 0.11, 0x3E2111, 0x222222, L('Vanilla', '#FFF8E1', '#6D4C41', '🌼')) },
  cocoa: { name: 'cocoa powder', cat: 'baking', tags: ['food', 'ingredient', 'cocoa', 'baking'], build: () => can(0.04, 0.12, 0x4E2A14, L('Cocoa', '#EFEBE9', '#4E2A14', '🍫')) },
  choc_chips: { name: 'chocolate chips', cat: 'baking', tags: ['food', 'ingredient', 'chocolate_chips', 'baking'], qty: 340, unit: 'g', build: () => pouch(0.14, 0.2, 0.05, 'Chocolate Chips', '#4E2A14', '#795548', '🍫') },
  honey: { name: 'honey', cat: 'baking', tags: ['food', 'ingredient', 'honey'], build: () => jar(0.04, 0.11, 0xE0A526, 0xC9A47A, L('Honey', '#FFF8E1', '#E0A526', '🍯')) },
  maple_syrup: { name: 'maple syrup', cat: 'baking', tags: ['food', 'ingredient', 'syrup', 'pourable'], qty: 350, unit: 'ml', build: () => bottle(0.03, 0.2, 0x8B4513, 0xC0392B, L('Maple Syrup', '#FFF8E1', '#A0522D', '🍁'), { glass: 0.9 }) },
  yeast: { name: 'yeast', cat: 'baking', tags: ['food', 'ingredient'], build: P(0.07, 0.1, 0.012, 'Yeast', '#FFFDE7', '#F9A825', '🍞') },
  cornstarch: { name: 'cornstarch', cat: 'baking', tags: ['food', 'ingredient'], build: P(0.08, 0.13, 0.05, 'Cornstarch', '#FFFDE7', '#F4D03F', '🌽') },
  // ---- oils, vinegars, canned
  olive_oil: { name: 'olive oil', cat: 'oil', tags: ['food', 'ingredient', 'oil', 'olive_oil', 'pourable'], qty: 500, unit: 'ml', build: () => bottle(0.028, 0.27, 0x6B7F1A, 0xC9A47A, L('Olive Oil', '#F9FBE7', '#558B2F', '🫒'), { glass: 0.85 }) },
  avocado_oil: { name: 'avocado oil', cat: 'oil', tags: ['food', 'ingredient', 'oil'], build: () => bottle(0.026, 0.24, 0x7E9A2B, 0x222222, L('Avocado Oil', '#F1F8E9', '#33691E', '🥑'), { glass: 0.85 }) },
  veg_oil: { name: 'vegetable oil', cat: 'oil', tags: ['food', 'ingredient', 'oil'], build: () => bottle(0.035, 0.26, 0xF2D35A, 0xF39C12, L('Vegetable Oil', '#FFFDE7', '#F39C12', '🌻'), { glass: 0.8 }) },
  sesame_oil: { name: 'sesame oil', cat: 'oil', tags: ['food', 'ingredient', 'oil'], build: () => bottle(0.02, 0.16, 0x9C5B1A, 0xC0392B, L('Sesame Oil', '#FFF8E1', '#C0392B', '🌰'), { glass: 0.85 }) },
  balsamic: { name: 'balsamic vinegar', cat: 'oil', tags: ['food', 'ingredient'], build: () => bottle(0.025, 0.24, 0x2B1210, 0x222222, L('Balsamic', '#F3E5F5', '#4A148C', '🍇'), { glass: 0.9 }) },
  vinegar_red: { name: 'red wine vinegar', cat: 'oil', tags: ['food', 'ingredient'], build: () => bottle(0.025, 0.22, 0x8B1A2B, 0x222222, L('Red Vinegar', '#FCE4EC', '#880E4F', '🍷'), { glass: 0.85 }) },
  vinegar_white: { name: 'white wine vinegar', cat: 'oil', tags: ['food', 'ingredient'], build: () => bottle(0.025, 0.22, 0xEDE3B5, 0x222222, L('White Vinegar', '#FFFDE7', '#9E9D24', '🥂'), { glass: 0.6 }) },
  tomato_paste: { name: 'tomato paste', cat: 'canned', tags: ['food', 'ingredient'], build: () => can(0.028, 0.06, 0xC0392B, L('Tomato Paste', '#FFFFFF', '#C0392B', '🍅')) },
  crushed_tomatoes: { name: 'crushed tomatoes', cat: 'canned', tags: ['food', 'ingredient'], build: () => can(0.04, 0.11, 0xC0392B, L('Crushed Tomatoes', '#FFF8E1', '#C0392B', '🍅')) },
  alfredo: { name: 'alfredo sauce', cat: 'canned', tags: ['food', 'sauce', 'alfredo', 'pourable'], qty: 450, unit: 'g', build: () => jar(0.045, 0.13, 0xF4EBD0, 0xC9A47A, L('Alfredo', '#FFFFFF', '#2E7D32', '🧀')) },
  // ---- spices
  salt: { name: 'salt', cat: 'spice', tags: ['food', 'spice', 'salt'], build: () => can(0.03, 0.12, 0x1F4E9A, L('Salt', '#FFFFFF', '#1F4E9A', '🧂')) },
  pepper: { name: 'black pepper', cat: 'spice', tags: ['food', 'spice', 'pepper'], build: () => jar(0.022, 0.1, 0x2B2B2B, 0x222222) },
  ...Object.fromEntries([['garlic_powder', 'garlic powder', 0xE9DCC0], ['onion_powder', 'onion powder', 0xE4D2A8], ['paprika', 'paprika', 0xC0392B], ['smoked_paprika', 'smoked paprika', 0x8B2E1A], ['cinnamon', 'cinnamon', 0x9A5B2E], ['oregano', 'oregano', 0x5A6B2A], ['dried_basil', 'dried basil', 0x4C6B2A], ['thyme', 'thyme', 0x6B7A3A], ['rosemary', 'rosemary', 0x5D7A4A], ['chili_powder', 'chili powder', 0xA93226], ['cumin', 'cumin', 0x9C6B30], ['italian', 'italian seasoning', 0x6B8E23], ['red_pepper', 'crushed red pepper', 0xB03A2E], ['bay_leaves', 'bay leaves', 0x7D9A4A]]
    .map(([id, name, c]) => [id, { name, cat: 'spice', tags: ['food', 'spice', id], build: () => jar(0.022, 0.09, c, 0x222222) }])),
  // ---- snacks and breakfast
  cereal_0: { name: 'fruity loops cereal', cat: 'snack', tags: ['food', 'cereal'], build: null },
  granola: { name: 'granola', cat: 'snack', tags: ['food', 'granola'], build: () => pouch(0.14, 0.2, 0.06, 'Honey Granola', '#FFF3E0', '#E67E22', '🥣') },
  crackers: { name: 'crackers', cat: 'snack', tags: ['food', 'crackers'], build: P(0.16, 0.2, 0.05, 'Crackers', '#FFF8E1', '#C0392B', '🍘') },
  pretzels: { name: 'pretzels', cat: 'snack', tags: ['food', 'pretzels'], build: () => pouch(0.16, 0.22, 0.06, 'Pretzels', '#1F4E9A', '#F4D03F', '🥨') },
  popcorn: { name: 'popcorn', cat: 'snack', tags: ['food'], build: P(0.12, 0.16, 0.06, 'Popcorn', '#FFFDE7', '#C0392B', '🍿') },
  chips: { name: 'potato chips', cat: 'snack', tags: ['food'], build: () => pouch(0.18, 0.26, 0.07, 'Potato Chips', '#F4D03F', '#C0392B', '🥔') },
  cookies_pack: { name: 'cookies', cat: 'snack', tags: ['food', 'edible'], build: P(0.18, 0.06, 0.12, 'Cookies', '#E3F2FD', '#1F4E9A', '🍪') },
  graham: { name: 'graham crackers', cat: 'snack', tags: ['food'], build: P(0.12, 0.2, 0.05, 'Graham Crackers', '#FFF3E0', '#8D6E63', '🍪') },
  peanut_butter: { name: 'peanut butter', cat: 'snack', tags: ['food', 'peanut_butter'], build: () => jar(0.045, 0.11, 0xB07A3A, 0xC0392B, L('Peanut Butter', '#FFF8E1', '#C0392B', '🥜')) },
  almond_butter: { name: 'almond butter', cat: 'snack', tags: ['food'], build: () => jar(0.04, 0.1, 0xA9744A, 0x6D4C41, L('Almond Butter', '#FFF8E1', '#6D4C41', '🌰')) },
  nuts: { name: 'mixed nuts', cat: 'snack', tags: ['food', 'nuts'], build: () => jar(0.045, 0.12, 0xB5835A, 0xC9A47A, L('Mixed Nuts', '#FFFFFF', '#6D4C41', '🥜')) },
  trail_mix: { name: 'trail mix', cat: 'snack', tags: ['food', 'trail_mix'], build: () => pouch(0.14, 0.2, 0.05, 'Trail Mix', '#E8F5E9', '#2E7D32', '🥾') },
  dried_fruit: { name: 'dried fruit', cat: 'snack', tags: ['food', 'dried_fruit'], build: () => pouch(0.12, 0.17, 0.04, 'Dried Fruit', '#FFF3E0', '#E67E22', '🍑') },
  bread: { name: 'bread', cat: 'snack', tags: ['food', 'bread'], build: () => { const g = G(); add(g, boxM(0.24, 0.11, 0.12, mat(0xD9A55B, { r: 0.8 })), 0, 0.055, 0); add(g, new THREE.Mesh(geo('bb', () => new THREE.BoxGeometry(0.25, 0.12, 0.125)), mat(0xFFFFFF, { glass: 0.25 })), 0, 0.06, 0); return g; } },
  tortillas: { name: 'tortillas', cat: 'snack', tags: ['food', 'tortilla'], build: () => { const g = G(); add(g, cylM(0.1, 0.03, 0xEFD9A8, { r: 0.8 }, 28), 0, 0.015, 0); return g; } },
  // ---- cutlery (drawer)
  fork: { name: 'fork', cat: 'cutlery', tags: ['cutlery', 'washable'], build: () => cutleryPiece('fork') },
  spoon_table: { name: 'spoon', cat: 'cutlery', tags: ['cutlery', 'washable', 'spoon'], build: () => cutleryPiece('spoon') },
  butter_knife: { name: 'butter knife', cat: 'cutlery', tags: ['cutlery', 'washable', 'spreader'], build: () => cutleryPiece('knife') },
  kid_knife: { name: 'kid-safe knife', cat: 'cutlery', tags: ['cutlery', 'washable', 'knife'], build: () => cutleryPiece('knife') },
  chopsticks: { name: 'chopsticks', cat: 'cutlery', tags: ['cutlery'], build: () => cutleryPiece('chopsticks') },
  // ---- utensils and equipment
  spatula: { name: 'spatula', cat: 'utensil', tags: ['utensil', 'washable', 'spatula'], build: () => utensil('spatula') },
  whisk: { name: 'whisk', cat: 'utensil', tags: ['utensil', 'washable', 'whisk', 'spoon'], build: () => utensil('whisk') },
  ladle: { name: 'ladle', cat: 'utensil', tags: ['utensil', 'washable'], build: () => utensil('ladle') },
  tongs: { name: 'tongs', cat: 'utensil', tags: ['utensil', 'washable', 'tongs', 'spoon'], build: () => utensil('tongs') },
  masher: { name: 'potato masher', cat: 'utensil', tags: ['utensil', 'washable'], build: () => utensil('masher') },
  peeler: { name: 'peeler', cat: 'utensil', tags: ['utensil', 'washable'], build: () => utensil('peeler') },
  pasta_server: { name: 'pasta server', cat: 'utensil', tags: ['utensil', 'washable', 'spoon'], build: () => utensil('server') },
  rolling_pin: { name: 'rolling pin', cat: 'equipment', tags: ['utensil'], build: () => utensil('rollingpin') },
  measuring_cup: { name: 'measuring cup', cat: 'equipment', tags: ['utensil', 'washable'], build: () => utensil('measuringcup') },
  grater: { name: 'cheese grater', cat: 'equipment', tags: ['utensil', 'washable'], build: () => utensil('grater') },
  cutting_board: { name: 'cutting board', cat: 'equipment', tags: ['board', 'washable'], build: cuttingBoard },
  // ---- linens
  towel_blue: { name: 'kitchen towel', cat: 'linen', tags: ['linen'], build: () => towel(0x5DADE2) },
  towel_stripe: { name: 'striped towel', cat: 'linen', tags: ['linen'], build: () => towel(0xF5CBA7) },
  oven_mitts: { name: 'oven mitts', cat: 'linen', tags: ['linen', 'mitts'], build: () => mitt() },
  napkins: { name: 'napkins', cat: 'linen', tags: ['linen'], build: () => towel(0xFFFFFF) },
  // ---- dishes and glassware
  dinner_plate: { name: 'dinner plate', cat: 'dish', tags: ['plate', 'dish', 'washable', 'servable'], state: { clean: true }, build: () => plate(0.13) },
  small_plate: { name: 'small plate', cat: 'dish', tags: ['plate', 'dish', 'washable', 'servable'], state: { clean: true }, build: () => plate(0.1) },
  pasta_bowl: { name: 'pasta bowl', cat: 'dish', tags: ['bowl_dish', 'dish', 'washable', 'servable'], state: { clean: true }, build: () => bowlM(0.12, 0.05) },
  soup_bowl: { name: 'soup bowl', cat: 'dish', tags: ['bowl_dish', 'dish', 'washable', 'servable'], state: { clean: true }, build: () => bowlM(0.08, 0.06) },
  platter: { name: 'serving platter', cat: 'dish', tags: ['plate', 'dish', 'washable', 'servable'], state: { clean: true }, build: () => { const g = plate(0.17); g.children[0].scale.set(1.3, 1, 0.8); return g; } },
  water_glass: { name: 'water glass', cat: 'glass', tags: ['glass', 'fillable', 'washable', 'cup'], state: { fill: 0 }, build: () => glass(0.035, 0.11) },
  tall_glass: { name: 'tall glass', cat: 'glass', tags: ['glass', 'fillable', 'washable', 'cup'], state: { fill: 0 }, build: () => glass(0.03, 0.15) },
  juice_glass: { name: 'juice glass', cat: 'glass', tags: ['glass', 'fillable', 'washable', 'cup'], state: { fill: 0 }, build: () => glass(0.03, 0.09) },
  pitcher: { name: 'pitcher', cat: 'glass', tags: ['glass', 'fillable', 'washable'], state: { fill: 0 }, build: () => glass(0.06, 0.22) },
  // ---- cookware (contents are tracked by the cooking engine)
  stockpot: { name: 'stockpot', cat: 'cookware', tags: ['cookware', 'pot', 'stockpot', 'washable', 'container'], cap: 4.0, build: () => pot(0.13, 0.2) },
  saucepan: { name: 'saucepan', cat: 'cookware', tags: ['cookware', 'pot', 'saucepan', 'washable', 'container'], cap: 1.5, build: () => pot(0.085, 0.09, 0xB9BEC4, 'stick') },
  frying_pan: { name: 'frying pan', cat: 'cookware', tags: ['cookware', 'pan', 'washable', 'container'], cap: 0.6, build: () => pot(0.12, 0.045, 0x3A3A3A, 'stick') },
  colander: { name: 'colander', cat: 'cookware', tags: ['colander', 'washable', 'container'], cap: 3, build: colander },
  baking_tray: { name: 'baking tray', cat: 'cookware', tags: ['tray', 'bakeware', 'washable', 'container'], build: () => bakingTray() },
  muffin_tray: { name: 'cupcake tray', cat: 'cookware', tags: ['tray', 'bakeware', 'washable', 'container', 'muffin_tray'], build: () => { const g = bakingTray(0.3, 0.2); for (let i = 0; i < 6; i++) add(g, cylM(0.028, 0.03, 0x8A9096, { m: 0.8 }), -0.09 + (i % 3) * 0.09, 0.015, (Math.floor(i / 3) - 0.5) * 0.09); return g; } },
  mixing_bowl_2: { name: 'big mixing bowl', cat: 'cookware', tags: ['bowl', 'washable', 'container', 'mixing'], cap: 3, build: () => bowlM(0.14, 0.1, 0xEDE8DF) },
};

/** build a fresh 3D object for an item id (cereal boxes come from the house's atlas builder) */
export function makeItemObject(id, extras = {}) {
  const d = ITEM_DEFS[id];
  if (!d) throw new Error('unknown item ' + id);
  const o = (d.build ? d.build() : extras.cereal?.()) || new THREE.Group();
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  o.userData.def = id;
  return o;
}
