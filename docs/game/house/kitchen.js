// The kitchen and walk-in pantry (Option A: sage & copper, modern Mediterranean).
//
// House-local metres; x = east, z = south. Kitchen interior x 3..12.5, z -3..6, ceiling 3.8.
//   north wall  : symmetric cooking wall: 48" range, copper hood, glass uppers, two arched windows
//   west wall   : arched zellige niche: ceramic sink, coffee machine + grinder, soda fridge, dishwasher, oak shelves
//   east wall   : built-in freezer + fridge columns, serving counter, pantry door, dining window
//   south wall  : arched window and two tall dining windows
//   middle      : long soapstone island (microwave drawer, trash pull-out) with four stools
//   south-east  : round oak table with four black ladder-back chairs
//   pantry      : x 12.5..15.5, z 0.4..4.0: oak shelves with LED strips, jars, cereal, a counter
import * as THREE from 'three/webgpu';
import { texture, uv, vec2, vec3, float, mix, color, mx_noise_float, positionWorld, smoothstep, abs, sin } from 'three/tsl';
import { archWindow, C } from './kit.js';
import { cabinetRun, buildRange, buildHood, buildColumn, glassUppers, roundTable, ladderChair, counterStool, pendant, pull } from './appliances.js';
import { Interactable, Item, Slot, Seat, Hinge, Toggle, Dial } from './interact.js';
import { prop, simple, cyl, addLiquid } from './props.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const KITCHEN = { x0: 3, x1: 12.5, z0: -3, z1: 6, ceil: 3.8 };

// ------------------------------------------------------------------ walls, floors, windows
/** island size [length, cabinet depth, top depth]; ?island=small|medium|large picks a mockup size */
function islandSize() {
  const SIZES = { small: [4.2, 0.95, 1.25], medium: [4.8, 1.1, 1.55], large: [5.4, 1.2, 1.75], grand: [5.4, 1.85, 2.25] };
  let k = 'grand'; try { k = new URLSearchParams(globalThis.location?.search || '').get('island') || k; } catch (e) { /* no location */ }
  return SIZES[k] || SIZES.grand;
}

export function buildShell(H) {
  const b = H.b, M = H.M, R = H.root;
  // ---- foyer (x -3..3, z 0..6), unchanged
  b.floor(-3, 0, 3, 6, M.oakFloor);
  b.ceiling(-3, 0, 3, 6, 3.2, M.plaster);
  const W = (x0, z0, x1, z1, openings) => b.wall(x0, z0, x1, z1, { mat: M.plaster, openings });
  W(-3, 6, 3, 6, [{ at: 3, w: 1.2, h: 2.35 }, { at: 1.0, w: 0.9, h: 1.25, y0: 1.0 }, { at: 5.0, w: 0.9, h: 1.25, y0: 1.0 }]);
  W(-3, 0, -3, 6, [{ at: 3, w: 1.1, h: 2.25 }]);
  W(-3, 0, 3, 0, []);
  const wains = [[-1.825, 5.86, 2.35, 0.03], [1.825, 5.86, 2.35, 0.03], [0, 0.14, 6, 0.03], [-2.86, 1.2, 0.03, 2.4], [-2.86, 4.8, 0.03, 2.4], [2.86, 1.42, 0.03, 2.84], [2.86, 4.97, 0.03, 2.06]];
  for (const [x, z, w, d] of wains) b.box(M.wood, [x, 0.5, z], [w, 1.0, d], { collide: false, cast: false });

  // ---- kitchen: wide-plank oak floor, limewash walls, white-oak beam grid
  const K = KITCHEN;
  b.floor(K.x0, K.z0, K.x1, K.z1, M.oakFloor);
  b.box(M.limewash, [(K.x0 + K.x1) / 2, K.ceil + 0.1, (K.z0 + K.z1) / 2], [K.x1 - K.x0, 0.2, K.z1 - K.z0], { cast: true });
  for (const x of [5.375, 7.75, 10.125]) b.box(M.whiteOak, [x, K.ceil - 0.11, (K.z0 + K.z1) / 2], [0.22, 0.22, K.z1 - K.z0], { collide: false, round: 0.02 });
  for (const z of [-0.75, 1.5, 3.75]) b.box(M.whiteOak, [(K.x0 + K.x1) / 2, K.ceil - 0.08, z], [K.x1 - K.x0, 0.16, 0.16], { collide: false, round: 0.02 });
  const arch = (at, w, h, y0) => ({ at, w, h: h + w / 2, y0, frame: false, arch: { w, h, y0 } });
  const KW = (x0, z0, x1, z1, openings, inward, h = K.ceil) => {
    const g = b.wall(x0, z0, x1, z1, { mat: M.limewash, h, openings });
    const ang = Math.atan2(z1 - z0, x1 - x0), dir = V3(Math.cos(ang), 0, Math.sin(ang)), nz = V3(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(inward);
    for (const o of openings) if (o.arch) H.windows.push(addWindow(H, g, { x0, z0, dir, inward: nz, inwardSign: inward, at: o.at, ...o.arch, id: `kitchen_window_${H.windows.length}` }));
    return g;
  };
  KW(3, -3, 3, 6, [{ at: 6.4, w: 1.05, h: 2.25, frameMat: M.whiteOak }], -1);
  KW(3, -3, 12.5, -3, [arch(1.6, 0.95, 1.6, 1.05), arch(7.9, 0.95, 1.6, 1.05)], 1);
  KW(12.5, -3, 12.5, 6, [{ at: 5.1, w: 1.0, h: 2.2, frameMat: M.whiteOak }, arch(7.6, 0.95, 1.5, 0.9)], 1);
  KW(3, 6, 12.5, 6, [arch(2.35, 1.3, 1.3, 1.1), arch(6.4, 1.2, 1.9, 0.55), arch(8.1, 1.2, 1.9, 0.55)], -1);

  // ---- pantry room (x 12.5..15.5, z 0.4..4.0, ceiling 3.0)
  b.floor(12.5, 0.4, 15.5, 4.0, M.oakFloor);
  b.box(M.limewash, [14, 3.1, 2.2], [3.0, 0.2, 3.6], { cast: true });
  const PW = (x0, z0, x1, z1) => b.wall(x0, z0, x1, z1, { mat: M.limewash, h: 3.0, openings: [] });
  PW(12.5, 0.4, 15.5, 0.4); PW(15.5, 0.4, 15.5, 4.0); PW(12.5, 4.0, 15.5, 4.0);

  // foyer windows still look out on the beach
  for (const x of [-2, 2]) backdrop(H, V3(x, 1.6, 7.6), 0 + Math.PI, 2.2, 1.8);
}

/** a painted beach view just outside a window; ry turns its face toward the room */
function backdrop(H, p, ry, w, h) {
  if (!H.viewMat) {
    const view = H.A.textures.T_Window_View;
    const vmat = H.viewMat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, fog: false });
    if (view) { view.wrapS = view.wrapT = THREE.ClampToEdgeWrapping; vmat.colorNode = texture(view, uv()).rgb.mul(1.05); } else vmat.color.set(0x7fc8e6);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), H.viewMat); m.position.copy(p); m.rotation.y = ry; H.root.add(m);
  return m;
}

/** arched black-steel window with two casement sashes that open into the room */
function addWindow(H, wallGroup, { x0, z0, dir, inward, inwardSign, at, w, h, y0, id }) {
  const { b, M, sys } = H;
  const win = archWindow(b, M, wallGroup, { at: V3(at, 0, 0), w, h, y0, inward: inwardSign });
  // the view outside
  const c = V3(x0, 0, z0).addScaledVector(dir, at), total = h + w / 2;
  const p = c.clone().addScaledVector(inward, -0.9); p.y = y0 + total / 2;
  backdrop(H, p, Math.atan2(inward.x, inward.z), w * 2.6, total * 1.5);
  const [L, Rr] = win.sashes;
  const angle = L.sign * 80 * inwardSign;
  const hinge = sys.add(new Hinge({ id, name: 'window', object: win.root, anchor: [0, y0 + h * 0.5, 0.18 * inwardSign], pivot: L.pivot, axis: 'y', angle, duration: 0.7, sound: 'window', radius: 2.3 }));
  const u = hinge.update.bind(hinge); hinge.update = dt => { u(dt); Rr.pivot.rotation.y = -L.pivot.rotation.y; };
  return { win, hinge };
}

/** sage shaker passage door with bronze levers; collider only while shut */
function modernDoor(H, { id, name, at, rotY, w = 1.0, h = 2.2, swing }) {
  const { b, M, sys } = H;
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; H.root.add(root);
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0); root.add(hinge);
  b.box(M.sage, [w / 2, h / 2, 0], [w - 0.02, h - 0.02, 0.045], { parent: hinge, collide: false, round: 0.01 });
  for (const s of [-1, 1]) for (const [yc, hh] of [[h * 0.7, h * 0.42], [h * 0.26, h * 0.34]]) b.box(M.sageDark, [w / 2, yc, s * 0.024], [w - 0.26, hh, 0.008], { parent: hinge, collide: false, cast: false });
  for (const s of [-1, 1]) {
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), M.bronze); rose.rotation.x = Math.PI / 2; rose.position.set(w - 0.09, 1.0, s * 0.028); hinge.add(rose);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), M.bronze); lever.rotation.z = Math.PI / 2; lever.position.set(w - 0.15, 1.0, s * 0.06); hinge.add(lever);
  }
  const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08)); col.position.set(0, h / 2, 0); col.visible = false; root.add(col);
  const collider = b.solid(col, w, h, 0.08);
  const hg = sys.add(new Hinge({ id, name, object: root, anchor: [0, 1.1, 0], pivot: hinge, axis: 'y', angle: swing, duration: 0.7, sound: 'door', collider, radius: 2.0 }));
  return { root, hinge: hg };
}

/** a small wall plate with a rocker switch */
function wallSwitch(H, { id, name, at, ry, onSet, initial = false, sound = 'switch' }) {
  const { b, M, sys } = H;
  const g = new THREE.Group(); g.position.copy(at); g.rotation.y = ry; H.root.add(g);
  b.box(M.white, [0, 0, 0.004], [0.08, 0.12, 0.008], { parent: g, collide: false, cast: false });
  const rocker = new THREE.Group(); rocker.position.z = 0.01; g.add(rocker);
  b.box(M.white, [0, 0, 0.004], [0.026, 0.05, 0.01], { parent: rocker, collide: false, cast: false });
  const t = sys.add(new Toggle({ id, name, object: g, anchor: [0, 0, 0.05], part: rocker, partAxis: 'x', partAngle: -24, onSet, sound, radius: 1.8 }));
  if (initial) t.set(true, null);
  return t;
}

// ------------------------------------------------------------------ kitchen
export function buildKitchen(H) {
  const b = H.b, M = H.M, sys = H.sys, A = H.A, R = H.root, game = H.game;
  const L = (x, y, z) => V3(x, y, z);
  const S = id => sys.slots.get(id);
  const placeProp = (name, h, x, y, z, ry = 0, fb, parent = R) => { const m = prop(A, name, h, fb || simple(new THREE.BoxGeometry(0.3, h, 0.3).translate(0, h / 2, 0), 0x888888)); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };

  // ---- north: the symmetric cooking wall
  const zN = -2.88 + 0.32;
  H.runNL = cabinetRun(b, M, sys, { id: 'kitchen_runNL', at: L(3.9, 0, zN), modules: [{ kind: 'drawers', w: 0.6 }, { kind: 'doors2', w: 0.9 }, { kind: 'drawers', w: 0.9 }, { kind: 'door', w: 0.84, hingeRight: true }], game });
  H.runNR = cabinetRun(b, M, sys, { id: 'kitchen_runNR', at: L(8.36, 0, zN), modules: [{ kind: 'door', w: 0.84 }, { kind: 'drawers', w: 0.9 }, { kind: 'doors2', w: 0.9 }, { kind: 'drawers', w: 0.6 }], game });
  H.range = buildRange(b, M, sys, { id: 'range', at: L(7.75, 0, -2.88 + 0.35), game });
  H.oven = H.range.big;
  H.hood = buildHood(b, M, sys, { id: 'hood', at: L(7.75, 0, -2.88 + 0.31), ceiling: KITCHEN.ceil });
  H.glassL = glassUppers(b, M, sys, { id: 'kitchen_glassL', at: L(5.3, 1.5, -2.88 + 0.18), w: 1.65 });
  H.glassR = glassUppers(b, M, sys, { id: 'kitchen_glassR', at: L(8.55, 1.5, -2.88 + 0.18), w: 1.65 });
  // limestone backsplash between the windows
  b.box(M.limestone, [7.75, 1.27, -2.874], [5.18, 0.7, 0.012], { collide: false, cast: false });
  b.box(M.limestone, [7.75, 2.1, -2.874], [1.6, 1.0, 0.012], { collide: false, cast: false });
  // brass pot filler that swings out over the range
  {
    const base = new THREE.Group(); base.position.set(7.75, 1.48, -2.86); R.add(base);
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 14), M.brass); mount.rotation.x = Math.PI / 2; mount.position.z = 0.025; base.add(mount);
    const arm = new THREE.Group(); arm.position.z = 0.05; base.add(arm);
    const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), M.brass); a1.rotation.z = Math.PI / 2; a1.position.x = 0.16; arm.add(a1);
    const elbow = new THREE.Group(); elbow.position.x = 0.32; arm.add(elbow);
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), M.brass); elbow.add(knuckle);
    const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), M.brass); a2.rotation.z = Math.PI / 2; a2.position.x = 0.16; elbow.add(a2);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.08, 10), M.brass); spout.position.set(0.32, -0.04, 0); elbow.add(spout);
    elbow.rotation.y = Math.PI * 0.95; arm.rotation.y = 0;
    const h = sys.add(new Hinge({ id: 'pot_filler', name: 'pot filler', object: base, anchor: [0.1, 0, 0.1], pivot: arm, axis: 'y', angle: -70, duration: 0.6, sound: 'tap', radius: 1.9, verbOpen: 'Swing out the', verbClose: 'Fold away the' }));
    // folded: the elbow tucks back along the wall. Swung out: a two-joint reach that aims the
    // spout over whichever burner has a pot (H.potFiller.target), else a resting pose
    const PF = H.potFiller = { hinge: h, spout, base, arm, elbow, target: null, a1: 0, a2: Math.PI * 0.95 };
    const u = h.update.bind(h);
    h.update = dt => {
      u(dt);
      const k = h.openAmount;
      let w1 = -70 * Math.PI / 180, w2 = Math.PI * 0.25;
      if (PF.target) {
        base.updateWorldMatrix(true, false);
        const t = base.worldToLocal(PF.target.clone()); t.z -= 0.05;      // arm pivot sits 5 cm off the wall
        const L1 = 0.32, L2 = 0.32, dx = t.x, dz = t.z, d = Math.min(L1 + L2 - 1e-3, Math.hypot(dx, dz));
        const al = Math.atan2(-dz, dx), be = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
        const pick = th => -L1 * Math.sin(th);            // elbow's distance out from the wall
        const th1 = pick(al + be) > pick(al - be) ? al + be : al - be;
        const ex = L1 * Math.cos(th1), ez = -L1 * Math.sin(th1);
        w1 = th1; w2 = Math.atan2(-(dz - ez), dx - ex) - th1;
      }
      PF.a1 += ((k > 0.05 ? w1 : 0) - PF.a1) * Math.min(1, dt * 6);
      PF.a2 += ((k > 0.05 ? w2 : Math.PI * 0.95) - PF.a2) * Math.min(1, dt * 6);
      arm.rotation.y = PF.a1 * Math.min(1, k * 1.5); elbow.rotation.y = k > 0.05 ? PF.a2 : Math.PI * 0.95;
    };
  }
  // under-cabinet light switch (left of the range) and the hood (light + fan) are on the wall
  H.underLights = [];
  for (const g of [H.glassL, H.glassR]) { const l = new THREE.PointLight(0xffd9a8, 0, 2.6, 1.6); l.position.set(g.root.position.x + 0.82, 1.42, -2.7); R.add(l); H.underLights.push(l); }
  H.underSwitch = wallSwitch(H, { id: 'kitchen_under_lights', name: 'under-cabinet lights', at: L(6.95, 1.15, -2.866), ry: 0, initial: true,
    onSet: on => { for (const g of [H.glassL, H.glassR]) g.strip.visible = on; for (const st of H.nicheStrips || []) st.visible = on; } });

  // ---- east: built-in freezer + fridge columns, coffee station
  // the columns sit 1 m clear of the north corner so the freezer door (hinged on its north
  // side) can swing to 100 degrees without hitting the range-wall counter; the corner they
  // freed holds the Bird of Paradise
  const zF = -1.4, zR = -0.5;                    // freezer z -1.85..-0.95, fridge z -0.95..-0.05
  H.freezer = buildColumn(b, M, sys, { id: 'kitchen_freezer', name: 'freezer', at: L(12.02, 0, zF), rotY: -Math.PI / 2, freezer: true, hingeRight: false, openAngle: 100, game });
  H.fridge = buildColumn(b, M, sys, { id: 'kitchen_fridge', name: 'fridge', at: L(12.02, 0, zR), rotY: -Math.PI / 2, hingeRight: true, game });
  b.box(M.sage, [12.02, 2.975, (zF + zR) / 2], [0.72, 1.65, 1.8], { collide: false });            // panel above
  for (const z of [-1.875, -0.025]) b.box(M.sage, [12.02, 1.9, z], [0.74, 3.8, 0.05], { collide: false });   // end panels
  b.box(M.sage, [12.25, 0.46, 0.05], [0.26, 0.92, 0.1], { collide: true });                     // filler to the counter
  if (A.textures.T_Art_Turtle) {   // a child's drawing on the freezer door
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.29), new THREE.MeshStandardNodeMaterial({ roughness: 0.9 }));
    art.material.colorNode = texture(A.textures.T_Art_Turtle, uv()).rgb; art.position.set(0.45, 1.5, 0.052);
    H.freezer.door.pivot.add(art);
    const magnet = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), M.coral); magnet.position.set(0.45, 1.64, 0.058); H.freezer.door.pivot.add(magnet);
  }
  // a short serving counter between the fridge and the pantry door, open oak shelves above
  H.runE = cabinetRun(b, M, sys, { id: 'kitchen_runE', at: L(12.38 - 0.32, 0, 0.1), rotY: -Math.PI / 2, modules: [{ kind: 'drawers', w: 0.6 }, { kind: 'doors2', w: 0.75 }], game });
  const ER = H.runE.root, EW = 1.35;
  b.box(M.limestone, [EW / 2, 1.2, -0.314], [EW, 0.56, 0.012], { parent: ER, collide: false, cast: false });
  for (const y of [1.55, 1.95]) {
    b.box(M.whiteOak, [EW / 2, y, -0.18], [EW - 0.05, 0.04, 0.28], { parent: ER, collide: false, round: 0.006 });
    for (const x of [0.15, EW - 0.15]) b.box(M.blackSteel, [x, y - 0.05, -0.27], [0.02, 0.08, 0.08], { parent: ER, collide: false, cast: false });
  }
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.07, 14), M.white); c.position.set(0.4 + i * 0.12, 1.605, -0.2); ER.add(c); }
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 16), i === 1 ? M.sageDark : M.white); c.position.set(0.3 + i * 0.37, 2.02, -0.2); ER.add(c); }
  {   // a bowl of lemons on the counter
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.09, 0.08, 24, 1, true), M.white); bowl.position.set(0.95, 0.96, -0.05); ER.add(bowl);
    const lem = new THREE.MeshStandardNodeMaterial({ color: 0xF2D23C, roughness: 0.5 });
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), lem); l.scale.set(1, 0.85, 1.25); const a = i * 1.05; l.position.set(0.95 + Math.cos(a) * 0.07 * (i < 5), 0.98 + (i === 5) * 0.05, -0.05 + Math.sin(a) * 0.07 * (i < 5)); ER.add(l); }
  }
  // Bird of Paradise in the corner the fridge freed (beyond the freezer door's swing)
  // (the freezer door sweeps x < 11.66 for z > -2.05 when open, so the leaves stay north/east of it)
  H.birdOfParadise = birdOfParadise(H, L(12.04, 0, -2.47), { seed: 7, bounds: { x0: 10.9, x1: 12.38, z0: -2.88, z1: -2.05 } });

  // ---- island: soapstone top, drawers / trash / cupboards / microwave drawer on the range side.
  // Its range-side face stays at z = -0.6 (1.6 m from the range); it grows in length and toward
  // the dining side. ISLAND sizes: [length, cabinet depth, top depth]
  const IS = H.islandSize = islandSize();
  const [IL, ID, IT] = IS, IX = 7.75, zI = IT > 2 ? -0.75 : -0.6, zTop1 = zI + IT, x0 = IX - IL / 2, RD = Math.min(ID, 0.8);
  H.island = cabinetRun(b, M, sys, { id: 'island', at: L(IX + IL / 2, 0, zI + RD / 2), rotY: Math.PI, d: RD, noTop: true, game,
    modules: [{ kind: 'drawers', w: 0.9 }, { kind: 'trash', w: 0.6 }, { kind: 'doors2', w: 0.9 }, { kind: 'microwave', w: 0.7 }, { kind: 'drawers', w: IL - 3.1 }] });
  H.microwave = H.island.info[3].mw;
  b.box(M.soapstone, [IX, 0.895, (zI - 0.03 + zTop1) / 2], [IL + 0.1, 0.05, IT + 0.03], { round: 0.01 });
  if (ID > RD) b.box(M.sage, [IX, 0.46, zI + RD + (ID - RD) / 2], [IL - 0.01, 0.84, ID - RD], {});      // solid core behind the drawers
  b.box(M.sage, [IX, 0.5, zI + ID + 0.012], [IL, 0.82, 0.02], { collide: false });
  const np = Math.max(3, Math.round(IL / 1.05)), pw = IL / np;
  for (let i = 0; i < np; i++) b.box(M.sageDark, [x0 + pw * (i + 0.5), 0.5, zI + ID + 0.026], [pw - 0.15, 0.62, 0.01], { collide: false, cast: false });
  b.box(M.blackWood, [IX, 0.05, zI + ID - 0.05], [IL, 0.1, 0.08], { collide: false, cast: false });
  const ns = Math.max(5, Math.round(IL / 0.7));
  H.islandSlots = Array.from({ length: ns }, (_, i) => sys.addSlot(new Slot({ id: `island_top_${i}`, name: 'on the island', parent: R, pos: [x0 + 0.3 + i * (IL - 0.6) / (ns - 1), 0.92, zI + 0.35] })));
  // counter stools on the overhang side
  const nStools = IL >= 5 ? 5 : IL > 4.6 ? 3 : 4, sp = IL / (nStools + 0.25);
  H.stools = Array.from({ length: nStools }, (_, i) => {
    const x = IX + (i - (nStools - 1) / 2) * sp;
    const st = counterStool(b, M, { at: L(x, 0, zTop1 + 0.33), rotY: Math.PI });
    sys.add(new Seat({ id: `island_stool_${i}`, name: 'stool', object: st, anchor: [0, 0.7, 0], seatY: 0.64, facing: Math.PI, back: -0.72, radius: 1.5 }));
    return st;
  });
  // cookbook on a little stand: each use turns to the next recipe
  {
    const g = new THREE.Group(); g.position.set(IX + IL / 2 - 0.35, 0.92, zTop1 - 0.28); g.rotation.y = Math.PI; R.add(g);
    b.box(M.whiteOak, [0, 0.015, 0], [0.28, 0.03, 0.18], { parent: g, collide: false });
    const book = new THREE.Group(); book.position.set(0, 0.03, 0.02); book.rotation.x = -1.15; g.add(book);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.025), M.white); pages.position.y = 0.13; book.add(pages);
    const coverMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, color: 0xffffff });
    if (A.textures.T_Cookbook) coverMat.colorNode = texture(A.textures.T_Cookbook, uv()).rgb; else coverMat.color.set(0x8a3a2a);
    const coverPivot = new THREE.Group(); coverPivot.position.set(-0.1, 0, 0.014); book.add(coverPivot);
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.265), coverMat); cover.position.set(0.1025, 0.13, 0.001); coverPivot.add(cover);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.205, 0.265), M.white); back.rotation.y = Math.PI; back.position.copy(cover.position); coverPivot.add(back);
    const RECIPES = [null,
      'Cupcakes: flour (pantry) + milk (fridge) in the mixing bowl, stir with the wooden spoon, bake in the big oven.',
      'Hot cocoa: fill a mug with water at the sink, put it in the microwave drawer, close it and press start.',
      'Coffee for the grown-ups: beans in the grinder, grind into the handle, click it into the machine, cup under, brew!',
      'Sparkly dishes: put the plates in the dishwasher, close the door and press start.',
      'Sizzle time: put the skillet on a burner, then turn its red knob.'];
    sys.add(new Dial({ id: 'cookbook', name: 'cookbook', object: g, anchor: [0, 0.15, 0.05], levels: ['closed', 'p1', 'p2', 'p3', 'p4', 'p5'], radius: 1.6, sound: 'cupboard',
      verbs: next => next === 0 ? 'Close the cookbook' : next === 1 ? 'Read the cookbook' : 'Turn the page',
      onSet: (v, lvl, s) => { coverPivot.rotation.y = lvl ? -Math.PI * 0.95 : 0; if (lvl && s) s.toast(RECIPES[lvl]); } }));
  }
  // two black cage pendants over the island, switched by the door
  H.pendants = (IL > 4.6 ? [IX - IL / 3, IX, IX + IL / 3] : [6.75, 8.75]).map(x => pendant(b, M, { at: L(x, 0, zI + IT / 2), drop: 1.75, ceiling: KITCHEN.ceil }));
  H.pendantSwitch = wallSwitch(H, { id: 'kitchen_lights', name: 'kitchen lights', at: L(3.122, 1.2, 2.65), ry: Math.PI / 2, initial: true,
    onSet: on => { for (const p of H.pendants) p.bulb.visible = on; } });

  // ---- west: the arched sink niche (also the coffee station)
  buildSinkNiche(H);

  // ---- dining nook: round oak table, four black ladder-back chairs
  const TX = 10.3, TZ = H.islandSize[2] > 2 ? 4.5 : 4.2;     // the deep island pushes the table a little south
  roundTable(b, M, { at: L(TX, 0, TZ) });
  H.chairs = [[0, -0.78, 0], [0, 0.78, Math.PI], [-0.78, 0, Math.PI / 2], [0.78, 0, -Math.PI / 2]].map(([dx, dz, ry], i) => {
    const ch = ladderChair(b, M, { at: L(TX + dx, 0, TZ + dz), rotY: ry });
    sys.add(new Seat({ id: `kitchen_chair_${i + 1}`, name: 'chair', object: ch, anchor: [0, 0.5, 0], seatY: 0.44, facing: ry, back: -0.72, radius: 1.6 }));
    return ch;
  });
  const TG = new THREE.Group(); TG.position.set(TX, 0.75, TZ); R.add(TG);
  H.tableSlots = [[0, 0], [0.3, 0.14], [-0.3, 0.12], [0.06, -0.32], [-0.14, 0.34]].map(([x, z], i) => sys.addSlot(new Slot({ id: `kitchen_table_${i}`, name: 'on the table', parent: TG, pos: [x, 0, z] })));

  // ---- plants and copper
  H.birdOfParadise2 = birdOfParadise(H, L(3.5, 0, -2.45), { seed: 31, bounds: { x0: 3.12, x1: 4.6, z0: -2.88, z1: -1.98 } });
  placeProp('SM_House_Monstera', 1.5, 12.0, 0, 5.5, 2.2, cyl(0.3, 1.3, 0x2f7d32));
  { const c = new THREE.Mesh(); c.visible = false; c.position.set(12.0, 0.6, 5.5); R.add(c); b.solid(c, 0.5, 1.2, 0.5); }
  placeProp('SM_Kitchen_CopperPots', 0.3, 9.75, 0.92, -2.62, 0, cyl(0.15, 0.25, 0xb87333));

  // ---- the walk-in pantry
  buildPantry(H);

  // ---- passage doors
  H.kitchenDoor = modernDoor(H, { id: 'kitchen_door_01', name: 'kitchen door', at: L(3, 0, 3.4), rotY: Math.PI / 2, w: 1.0, h: 2.2, swing: 95 });

  // ---- items
  const items = H.items = {};
  const mk = (id, model, name, h, tags, home, fb, extra = {}) => {
    const obj = prop(A, model, h, fb);
    const it = new Item({ id, name, object: obj, tags, home: S(home), ...extra });
    if (!it.home) console.warn('house: no home slot', home);
    it.baseScale = obj.baseScale; it.yaw = extra.yaw || 0;
    sys.add(it); sys.place(it, it.home);
    items[id] = it; return it;
  };
  mk('milk', 'SM_Kitchen_MilkBottle', 'milk', 0.24, ['drink', 'food', 'ingredient', 'milk'], 'kitchen_fridge_bin0', cyl(0.045, 0.24, 0xffffff));
  mk('juice', 'SM_Kitchen_JuiceJug', 'orange juice', 0.23, ['drink', 'food'], 'kitchen_fridge_bin1', cyl(0.05, 0.23, 0xff9a1f));
  mk('cheese', 'SM_Kitchen_Cheese', 'cheese', 0.07, ['food'], 'kitchen_fridge_s1_l', simple(new THREE.BoxGeometry(0.12, 0.07, 0.08).translate(0, 0.035, 0), 0xf6c945));
  mk('strawberries', 'SM_Kitchen_Strawberries', 'strawberries', 0.11, ['food', 'washable'], 'kitchen_fridge_s2_r', cyl(0.07, 0.1, 0xd9302f));
  mk('apple', 'SM_Kitchen_Apple', 'apple', 0.08, ['food', 'edible', 'washable'], 'kitchen_fridge_s0_r', () => { const g = new THREE.SphereGeometry(0.04, 16, 12); g.translate(0, 0.04, 0); return simple(g, 0xd42a2a)(); },
    { use: (s, it) => ({ label: 'Eat the apple', clip: 'PickUp', run: () => H.eat(it) }) });
  // ice cream in the freezer (procedural tub)
  {
    const g = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 20), new THREE.MeshStandardNodeMaterial({ color: 0xf7b6c8, roughness: 0.6 })); tub.position.y = 0.05; g.add(tub);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.012, 20), M.white); lid.position.y = 0.105; g.add(lid);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const it = new Item({ id: 'icecream', name: 'strawberry ice cream', object: g, tags: ['food', 'edible'], home: S('kitchen_freezer_s1_l'),
      use: (s, it) => ({ label: 'Eat a scoop of ice cream', clip: 'PickUp', run: () => H.eat(it) }) });
    it.baseScale = 1; sys.add(it); sys.place(it, it.home); items.icecream = it;
  }
  const mug = mk('mug', 'SM_Kitchen_Mug', 'mug', 0.11, ['fillable', 'washable'], 'kitchen_glassL_slot0', cyl(0.045, 0.11, C.turquoise),
    { state: { fill: 0 }, use: (s, it) => it.state.fill > 0.15 ? { label: it.state.cocoa ? 'Drink the hot cocoa' : 'Drink the water', clip: 'PickUp', run: () => { const c = it.state.cocoa; it.state.fill = 0; it.state.cocoa = false; it.onState(); s.toast(c ? 'Mmm, chocolatey!' : 'Ahh, refreshing!'); s.sfx('drink'); s.changed(); } } : null });
  addLiquid(mug, { r: 0.036, y0: 0.012, depth: 0.085 });
  const bowl = mk('bowl', 'SM_Kitchen_MixingBowl', 'mixing bowl', 0.13, ['washable', 'bowl'], 'island_top_1', cyl(0.13, 0.12, C.coral));
  mk('teapot', 'SM_Kitchen_Teapot', 'teapot', 0.19, ['washable'], 'kitchen_glassR_slot1', cyl(0.08, 0.18, C.turquoise));
  mk('fruit', 'SM_Kitchen_FruitBowl', 'fruit bowl', 0.2, ['food'], 'kitchen_table_0', cyl(0.15, 0.15, C.honey));
  mk('skillet', 'SM_Kitchen_Skillet', 'cast-iron skillet', 0.07, ['cookware', 'washable'], 'range_burner_1', cyl(0.13, 0.05, 0x26231f), { grip: [0, -0.02, 0.1] });
  mk('dutch_oven', 'SM_Kitchen_DutchOven', 'dutch oven', 0.18, ['cookware', 'washable'], 'range_burner_2', cyl(0.13, 0.16, 0xC0392B));
  // dirty plates on the table (wash them in the sink or the dishwasher)
  for (const k of [1, 2]) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.016, 28), M.white); p.position.y = 0.008; g.add(p);
    const smudge = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshStandardNodeMaterial({ color: 0x8a5a2e, roughness: 0.9 })); smudge.rotation.x = -Math.PI / 2; smudge.position.set(0.02, 0.0172, -0.01); g.add(smudge);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const it = new Item({ id: `plate_${k}`, name: 'plate', object: g, tags: ['plate', 'washable'], home: S(`kitchen_table_${k}`), state: { clean: false } });
    it.baseScale = 1; it.onState = () => { smudge.visible = !it.state.clean; it.name = it.state.clean ? 'clean plate' : 'dirty plate'; };
    it.onState(); sys.add(it); sys.place(it, it.home); items[`plate_${k}`] = it;
  }
  // wooden spoon in the top island drawer
  const spoonObj = (() => {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.26, 8), M.whiteOak); h.position.y = 0.17; g.add(h);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.whiteOak); s.scale.set(1, 0.4, 1.4); s.position.y = 0.035; g.add(s);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  })();
  const spoon = new Item({ id: 'spoon', name: 'wooden spoon', object: spoonObj, tags: ['spoon', 'washable'], home: S('island_4_drawer'), grip: [0, -0.12, 0.04] });
  spoon.baseScale = 1; sys.add(spoon); sys.place(spoon, spoon.home); items.spoon = spoon;
  // coffee things
  H.coffee.makeItems(mk);
  H.nicheMakeItems();
  // pantry things
  H.pantry.makeItems(mk);
  return bowl;
}

// ------------------------------------------------------------------ arched sink niche (west wall)
function buildSinkNiche(H) {
  const { b, M, sys, A, game } = H, R = H.root;
  const W = 3.3, d = 0.64, zs = W / 2;     // run centred on z = 0, from z +1.65 (south, left) to -1.65 (north, right)
  // cream shaker cabinets, white stone top, brass pulls; left to right: drawers, soda fridge, sink, dishwasher, drawers
  H.runW = cabinetRun(b, M, sys, { id: 'kitchen_runW', at: V3(3.12 + d / 2, 0, zs), rotY: Math.PI / 2, game, finish: { sage: M.cream, soapstone: M.quartz, bronze: M.brass, cupPulls: false },
    modules: [{ kind: 'drawers', w: 0.6 }, { kind: 'bevfridge', w: 0.6 }, { kind: 'farmsink', w: 0.9 }, { kind: 'dishwasher', w: 0.6 }, { kind: 'drawers', w: 0.6 }] });
  const NR = H.runW.root;            // local: x along the run (north), z out into the room, back wall at z = -d/2
  H.sink = H.runW.info[2].sink;
  H.dishwasher = H.runW.info[3].dw;
  H.bevFridge = H.runW.info[1].bev;
  const spring = 2.05, r = W / 2, pier = 0.3, back = -d / 2, depth = d + 0.02;
  // plaster surround: two piers and the arch above, as deep as the counter
  for (const x of [-pier / 2, W + pier / 2]) b.box(M.limewash, [x, KITCHEN.ceil / 2, back + depth / 2], [pier, KITCHEN.ceil, depth], { parent: NR });
  const sh = new THREE.Shape(); const R0 = r + pier, top = KITCHEN.ceil - spring;
  sh.moveTo(-R0, 0); sh.lineTo(-R0, top); sh.lineTo(R0, top); sh.lineTo(R0, 0); sh.lineTo(r, 0); sh.absarc(0, 0, r, 0, Math.PI, false); sh.lineTo(-R0, 0);
  const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 48 }), M.limewash);
  arch.position.set(r, spring, back); arch.castShadow = arch.receiveShadow = true; NR.add(arch);
  // glossy white zellige inside the niche, from the counter up into the arch
  const tileH = spring - 0.92;
  const t1 = new THREE.Mesh(new THREE.PlaneGeometry(W, tileH), M.zellige); t1.position.set(r, 0.92 + tileH / 2, back + 0.004); NR.add(t1);
  const t2 = new THREE.Mesh(new THREE.CircleGeometry(r, 48, 0, Math.PI), M.zellige); t2.position.set(r, spring, back + 0.004); NR.add(t2);
  t1.receiveShadow = t2.receiveShadow = true;
  // two floating white-oak shelves with warm LED strips underneath
  H.nicheStrips = [];
  const shelfY = [1.5, 1.95];
  for (const y of shelfY) {
    b.box(M.whiteOak, [r, y, back + 0.15], [W - 0.01, 0.045, 0.3], { parent: NR, collide: false, round: 0.006 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.008, 0.012), M.ledStrip); strip.position.set(r, y - 0.026, back + 0.27); NR.add(strip); H.nicheStrips.push(strip);
  }
  const nl = new THREE.PointLight(0xffd9a8, 0, 3.0, 1.6); nl.position.set(3.7, 1.42, 0); R.add(nl); H.underLights.push(nl);
  const s1 = shelfY[0] + 0.0225, s2 = shelfY[1] + 0.0225, sz = back + 0.15;
  // ---- coffee station on the left (south) end: machine and grinder face out
  H.coffee = new CoffeeStation(H, NR, { mach: 0.8, grind: 0.24, shelf: [0.26, s1, sz], cupHome: [0.56, s1, sz] });
  // ---- shelf dressing: spices, canisters, cookbooks, a cake stand, plates, art, herbs
  const spiceCols = [0xB5361B, 0xD98E04, 0x6B8E23, 0x8B4513, 0xC0392B, 0xE1B12C, 0x5D4037, 0x2E7D32, 0xF4D03F, 0x795548];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group(); g.position.set(1.22 + i * 0.062, s1, sz + (i % 2 ? 0.03 : -0.02)); NR.add(g);
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.085, 12, 1, true), M.clearGlass); gl.position.y = 0.0425; g.add(gl);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.06, 10), new THREE.MeshStandardNodeMaterial({ color: spiceCols[i], roughness: 0.9 })); f.position.y = 0.032; g.add(f);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.018, 12), i % 3 ? M.blackSteel : M.brass); cap.position.y = 0.094; g.add(cap);
  }
  // a stack of plates and a pair of glasses
  for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.012, 24), M.white); p.position.set(2.05, s1 + 0.008 + i * 0.013, sz); NR.add(p); }
  for (const x of [2.4, 2.52]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.11, 14, 1, true), M.clearGlass); c.position.set(x, s1 + 0.055, sz); NR.add(c); }
  // framed art leaning at the back of the lower shelf
  if (A.textures.T_Art_Fruit) {
    const fr = new THREE.Group(); fr.position.set(1.0, s1, back + 0.04); fr.rotation.x = -0.12; NR.add(fr);
    b.box(M.brass, [0, 0.13, 0], [0.22, 0.26, 0.015], { parent: fr, collide: false });
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.22), new THREE.MeshStandardNodeMaterial({ roughness: 0.7 })); art.material.colorNode = texture(A.textures.T_Art_Fruit, uv()).rgb; art.position.set(0, 0.13, 0.009); fr.add(art);
  }
  // upper shelf: cookbooks, a glass-domed cake stand, herbs, brass candlesticks, little bowls
  const bookCols = [0xE8A0B4, 0xF4EAD5, 0xC0392B, 0x7FB3A6, 0xF2C14E, 0x34495E];
  let bx = 0.12;
  for (const [i, c] of bookCols.entries()) { const t = 0.03 + (i % 3) * 0.008, hgt = 0.2 + (i % 2) * 0.03; const bk = new THREE.Mesh(new THREE.BoxGeometry(t, hgt, 0.17), new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.7 })); bk.position.set(bx + t / 2, s2 + hgt / 2, sz); NR.add(bk); bx += t + 0.004; }
  { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.17), new THREE.MeshStandardNodeMaterial({ color: 0xD9C9A3, roughness: 0.7 })); bk.position.set(0.5, s2 + 0.015, sz); NR.add(bk); }
  {
    const st = new THREE.Group(); st.position.set(0.95, s2, sz); NR.add(st);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.08, 16), M.white); foot.position.y = 0.04; st.add(foot);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.015, 28), M.white); plate.position.y = 0.088; st.add(plate);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.clearGlass); dome.scale.y = 1.15; dome.position.y = 0.095; st.add(dome);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), M.clearGlass); knob.position.y = 0.24; st.add(knob);
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 24), new THREE.MeshStandardNodeMaterial({ color: 0xF6D7E0, roughness: 0.8 })); cake.position.y = 0.13; st.add(cake);
  }
  for (const [x, hh] of [[1.9, 0.2], [2.0, 0.15]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, hh, 12), M.brass); c.position.set(x, s2 + hh / 2, sz); NR.add(c); }
  for (const x of [2.35, 2.55]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.05, 16), M.white); c.position.set(x, s2 + 0.025, sz); NR.add(c); }
  for (const [x, h] of [[1.45, 0.24], [3.0, 0.22]]) { const m = prop(A, 'SM_Kitchen_Herbs', h, cyl(0.08, 0.2, 0x3c8a3a)); m.position.set(x, s2, sz); NR.add(m); }
  // on the counter: a crock of wooden utensils by the sink, a brass soap pump
  {
    const crock = new THREE.Group(); crock.position.set(3.0, 0.92, -0.12); NR.add(crock);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.15, 18), M.white); pot.position.y = 0.075; crock.add(pot);
    for (let i = 0; i < 4; i++) { const u = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.3, 8), M.whiteOak); u.position.set(Math.cos(i * 1.6) * 0.02, 0.2, Math.sin(i * 1.6) * 0.02); u.rotation.z = (i - 1.5) * 0.1; crock.add(u); }
    const pump = new THREE.Group(); pump.position.set(2.2, 0.92, -0.2); NR.add(pump);
    const btl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 14), M.white); btl.position.y = 0.065; pump.add(btl);
    const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), M.brass); hd.position.y = 0.16; pump.add(hd);
  }
  // shelf slots: spare spots that take anything, plus three canisters you can pick up
  H.nicheSlots = [[2.75, s1], [2.95, s1], [3.15, s1], [2.85, s2], [1.2, s2]].map(([x, y], i) => sys.addSlot(new Slot({ id: `niche_shelf_${i}`, name: 'on the shelf', parent: NR, pos: [x, y, sz], radius: 2.1 })));
  H.nicheMakeItems = () => {
    for (const [i, [name, col]] of [['sugar', 0xFFFFFF], ['oats', 0xD9B98A], ['cocoa', 0x4A2511]].entries()) {
      const it = new Item({ id: `niche_jar_${i}`, name: `jar of ${name}`, object: jarObject(M, col, 0.19, 0.055), tags: ['food', 'jar'], home: H.nicheSlots[i] });
      it.baseScale = 1; sys.add(it); sys.place(it, it.home); H.items[`niche_jar_${i}`] = it;
    }
    // sodas in the soda fridge
    const cols = [[0xD62828, 'cherry soda'], [0x2A9D8F, 'lime soda'], [0xF4A261, 'orange soda'], [0x6A4C93, 'grape soda']];
    cols.forEach(([c, name], i) => {
      const g = new THREE.Group();
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.3, metalness: 0.5 })); can.position.y = 0.06; g.add(can);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.008, 16), M.stainless); lid.position.y = 0.124; g.add(lid);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const it = new Item({ id: `soda_${i}`, name, object: g, tags: ['drink', 'food'], home: H.bevFridge.slots[i],
        use: (s, it) => ({ label: `Drink the ${it.name}`, clip: 'PickUp', run: () => { s.sfx('drink'); s.toast('Fizzy! Ahh.'); s.held = null; it.held = false; s.place(it, it.home); s.changed(); } }) });
      it.baseScale = 1; sys.add(it); sys.place(it, it.home); H.items[`soda_${i}`] = it;
    });
  };
}

// ------------------------------------------------------------------ Bird of Paradise (Strelitzia reginae, flowering)
/**
 * Fanned bird of paradise in a tall ivory planter: paddle leaves on long stems spreading out
 * from the pot, with orange-and-blue "bird" flowers held above. Leaves gently sway.
 * bounds: house-local box { x0, x1, z0, z1 } the leaf tips must stay inside (walls, door swings).
 * Only the pot collides.
 */
function birdOfParadise(H, at, { height = 1.85, seed = 7, bounds = null, flowers = 3 } = {}) {
  const { b } = H, R = H.root;
  const root = new THREE.Group(); root.position.copy(at); R.add(root);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // ---- planter: tall, softly tapered ivory ceramic with a rolled rim (matte, speckled)
  const potMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.94 });
  potMat.colorNode = mix(color(0xF1ECE2), color(0xDCD4C4), mx_noise_float(positionWorld.mul(42)).mul(0.5).add(0.5).mul(0.5));
  const potH = 0.46;
  const prof = [[0, 0.01], [0.19, 0.0], [0.205, 0.02], [0.225, potH * 0.5], [0.245, potH - 0.015], [0.24, potH], [0.222, potH], [0.218, potH - 0.03]].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), potMat); pot.castShadow = pot.receiveShadow = true; root.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.218, 32), new THREE.MeshStandardNodeMaterial({ color: 0x35271c, roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = potH - 0.03; root.add(soil);
  const c = new THREE.Mesh(); c.visible = false; c.position.set(0, potH / 2, 0); root.add(c); b.solid(c, 0.5, potH, 0.5);
  // ---- materials
  const leafMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, side: THREE.DoubleSide });
  const u = uv().x, v = uv().y, rib = smoothstep(0.05, 0.0, abs(u.sub(0.5)));
  const veins = sin(u.sub(0.5).abs().mul(70).sub(v.mul(10))).mul(0.5).add(0.5).mul(0.1);
  const varN = mx_noise_float(vec3(u.mul(3), v.mul(5), 0)).mul(0.06);
  const edge = smoothstep(0.42, 0.5, abs(u.sub(0.5)));
  leafMat.colorNode = mix(mix(vec3(0.03, 0.15, 0.055).mul(float(1).sub(veins).add(varN)), vec3(0.26, 0.42, 0.16), rib.mul(0.75)), vec3(0.18, 0.32, 0.1), edge.mul(0.4));
  const stemMat = new THREE.MeshStandardNodeMaterial({ color: 0x55803F, roughness: 0.6 });
  const orange = new THREE.MeshStandardNodeMaterial({ color: 0xF2721C, roughness: 0.45 }); orange.emissiveNode = vec3(0.35, 0.09, 0.0);
  const blue = new THREE.MeshStandardNodeMaterial({ color: 0x2B3FD6, roughness: 0.4 }); blue.emissiveNode = vec3(0.02, 0.03, 0.18);
  const spatheMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
  spatheMat.colorNode = mix(vec3(0.12, 0.3, 0.12), vec3(0.45, 0.12, 0.18), smoothstep(0.2, 0.9, uv().y));
  // ---- a paddle leaf: elliptic blade folded along the rib, tip curling, slight wave on the edge
  const leafGeo = (L, W) => {
    const g = new THREE.PlaneGeometry(1, 1, 8, 18); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + 0.5;
      const width = W * Math.pow(Math.sin(Math.PI * Math.min(1, y * 0.96 + 0.02)), 0.62);
      const xx = x * width, wave = Math.sin(y * 18 + x * 3) * 0.006 * Math.abs(x) * 2;
      p.setXYZ(i, xx, y * L, Math.abs(xx) * 0.32 - Math.pow(y, 2) * L * 0.16 + wave);
    }
    g.computeVertexNormals(); return g;
  };
  // ---- leaves fan out all around; each lean is shrunk until its tip stays inside `bounds`
  const local = (ang, lean, len) => new THREE.Vector3(Math.cos(ang) * Math.sin(lean) * len, Math.cos(lean) * len, Math.sin(ang) * Math.sin(lean) * len);
  const fits = (ang, lean, stemH, tilt, L) => {
    if (!bounds) return true;
    const tip = local(ang, lean, stemH).add(local(ang, lean + tilt, L)).add(at).add(new THREE.Vector3(0, 0, 0));
    const pad = 0.08;
    return tip.x > bounds.x0 + pad && tip.x < bounds.x1 - pad && tip.z > bounds.z0 + pad && tip.z < bounds.z1 - pad;
  };
  root.leaves = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + rnd() * 0.4;
    const stemH = height * (0.32 + rnd() * 0.3), L = 0.42 + rnd() * 0.2, W = 0.15 + rnd() * 0.05;
    let lean = 0.22 + rnd() * 0.32, tilt = 0.25 + rnd() * 0.35;
    for (let k = 0; k < 12 && !fits(ang, lean, stemH, tilt, L); k++) { lean *= 0.8; tilt *= 0.85; }
    const g = new THREE.Group(); g.position.set(Math.cos(ang) * 0.03, potH - 0.03, Math.sin(ang) * 0.03); g.rotation.y = -ang + Math.PI / 2; root.add(g);
    const sway = new THREE.Group(); sway.rotation.x = lean; g.add(sway);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.013, stemH, 6), stemMat); stem.position.y = stemH / 2; sway.add(stem);
    const leaf = new THREE.Mesh(leafGeo(L, W), leafMat); leaf.position.y = stemH - 0.015; leaf.rotation.x = tilt; leaf.rotation.y = (rnd() - 0.5) * 0.7; leaf.castShadow = true; sway.add(leaf);
    root.leaves.push({ tilt: sway, base: lean, ph: rnd() * 6.28, sp: 0.5 + rnd() * 0.5 });
  }
  // ---- flowers: a horizontal beak (spathe), orange sepals fanned up, a blue arrow tongue
  const flower = (ang, lean, stemH) => {
    const g = new THREE.Group(); g.position.set(0, potH - 0.03, 0); g.rotation.y = -ang + Math.PI / 2; root.add(g);
    const sway = new THREE.Group(); sway.rotation.x = lean; g.add(sway);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, stemH, 6), stemMat); stem.position.y = stemH / 2; sway.add(stem);
    const head = new THREE.Group(); head.position.y = stemH; head.rotation.x = -lean; sway.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.2, 10), spatheMat); beak.rotation.z = Math.PI / 2 + 0.25; beak.position.set(0.08, 0.0, 0); head.add(beak);
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), spatheMat); base.scale.set(1.4, 1, 1); head.add(base);
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.14, 6), orange); p.scale.z = 0.4;
      p.position.set(-0.01 + k * 0.012, 0.07, (k - 1.5) * 0.012); p.rotation.z = 0.15 - k * 0.22; p.rotation.x = (k - 1.5) * 0.18; head.add(p);
    }
    for (const k of [0, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.12, 6), blue); t.position.set(0.04, 0.05 + k * 0.01, (k - 0.5) * 0.012); t.rotation.z = -0.9 - k * 0.15; head.add(t); }
    head.traverse(o => { if (o.isMesh) o.castShadow = true; });
    root.leaves.push({ tilt: sway, base: lean, ph: rnd() * 6.28, sp: 0.6 });
  };
  for (let k = 0; k < flowers; k++) {
    const ang = rnd() * Math.PI * 2; let lean = 0.15 + rnd() * 0.15; const sh = height * (0.62 + rnd() * 0.12);
    for (let j = 0; j < 10 && !fits(ang, lean, sh, 0, 0.15); j++) lean *= 0.75;
    flower(ang, lean, sh);
  }
  root.update = t => { for (const l of root.leaves) l.tilt.rotation.x = l.base + Math.sin(t * l.sp + l.ph) * 0.015; };
  return root;
}

// ------------------------------------------------------------------ coffee station
class CoffeeStation {
  /**
   * CR: parent group (a counter run root; local +z faces the room, top at y 0.92)
   * at: { mach: x, grind: x, shelf: [x, y, z], cupHome: [x, z] } in CR's local space
   */
  constructor(H, CR, at) {
    this.H = H; const { b, M, sys, A } = H;
    this.root = CR; this.at = at;
    const top = 0.92;
    // the generated espresso machine and grinder: the models' fronts face their +x, so turn
    // them a quarter turn to face out into the room; slots sit at their real fronts
    const front = m => { m.geometry.computeBoundingBox?.(); const bb = m.geometry.boundingBox; return bb && !m.userData.fallback ? bb.max.x * m.baseScale : 0.18; };
    const mach = prop(A, 'SM_Kitchen_EspressoMachine', 0.42, simple(new THREE.BoxGeometry(0.36, 0.42, 0.36).translate(0, 0.21, 0), 0xb8bcc0));
    const mz = -0.06; mach.position.set(at.mach, top, mz); mach.rotation.y = -Math.PI / 2; CR.add(mach);
    const grinder = prop(A, 'SM_Kitchen_Grinder', 0.4, simple(new THREE.BoxGeometry(0.2, 0.4, 0.16).translate(0, 0.2, 0), 0x2b2b2b));
    const gz = -0.08; grinder.position.set(at.grind, top, gz); grinder.rotation.y = -Math.PI / 2; CR.add(grinder);
    const mf = mz + front(mach), gf = gz + front(grinder);
    // brew stream (thin brown thread) from the group head to the cup
    const sm = new THREE.MeshStandardNodeMaterial({ color: 0x4a2a14, roughness: 0.3, transparent: true, opacity: 0.9 });
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), sm); this.stream.position.set(at.mach, top + 0.13, mf - 0.05); this.stream.visible = false; CR.add(this.stream);
    this.s = { beans: false, grinding: 0, brewing: 0 };
    this.hopper = sys.addSlot(new Slot({ id: 'coffee_hopper', name: 'into the grinder', parent: CR, pos: [at.grind, top + 0.41, gz], radius: 1.6,
      accepts: it => it.tags.has('beans') && !this.s.beans,
      onPut: (it, s) => { this.s.beans = true; this.H.cooking?.flag('beans_in'); s.toast('Beans in! Put the coffee handle under the grinder and grind.'); s.sfx('pour');
        setTimeout(() => { if (it.slot !== this.hopper) return; this.hopper.item = null; s.flyTo(it, () => it.home.world(), () => { s.place(it, it.home); s.changed(); }); }, 700); } }));
    this.fork = sys.addSlot(new Slot({ id: 'coffee_fork', name: 'under the grinder', parent: CR, pos: [at.grind, top + 0.12, gf + 0.02], radius: 1.6, accepts: it => it.tags.has('portafilter') }));
    this.group = sys.addSlot(new Slot({ id: 'coffee_group', name: 'into the espresso machine', parent: CR, pos: [at.mach, top + 0.21, mf - 0.03], radius: 1.6, accepts: it => it.tags.has('portafilter') }));
    this.cupSlot = sys.addSlot(new Slot({ id: 'coffee_cup', name: 'under the spout', parent: CR, pos: [at.mach, top + 0.02, mf - 0.05], radius: 1.6, accepts: it => it.tags.has('cup') }));
    this.shelf = sys.addSlot(new Slot({ id: 'coffee_shelf', name: 'on the shelf', parent: CR, pos: at.shelf, radius: 2.0 }));
    this.counter = this.fork;    // the coffee handle lives in the grinder fork
    this.anchors = { grind: [at.grind, top + 0.25, gf], brew: [at.mach, top + 0.32, mf] };
    // grinder button and brew lever
    const grind = new Interactable({ id: 'coffee_grind', name: 'grinder', object: CR, anchor: this.anchors.grind, radius: 1.6, save: false });
    grind.verb = s => {
      if (this.s.grinding > 0) return null;
      if (!this.fork.item) return this.s.beans ? { label: 'Put the coffee handle under the grinder', disabled: true, run: () => s.toast('The coffee handle is resting under the grinder.') } : null;
      if (this.fork.item.state.ground) return null;
      if (!this.s.beans) return { label: 'Pour coffee beans into the grinder first', disabled: true, run: () => s.toast('The coffee bean jar is on the shelf above.') };
      return { label: 'Grind the coffee beans', clip: 'PickUp', run: () => { this.s.grinding = 1.6; s.sfx('grind'); } };
    };
    sys.add(grind);
    const brew = new Interactable({ id: 'coffee_brew', name: 'espresso machine', object: CR, anchor: this.anchors.brew, radius: 1.6, save: false });
    brew.verb = s => {
      if (this.s.brewing > 0) return null;
      const p = this.group.item;
      if (!p) return null;
      if (!p.state.ground) return { label: 'Grind some coffee into the handle first', disabled: true, run: () => s.toast('Take the handle to the grinder.') };
      const cup = this.cupSlot.item;
      if (!cup) return { label: 'Put a cup under the spout', disabled: true, run: () => s.toast('The little coffee cup is on the shelf above.') };
      if ((cup.state.fill || 0) > 0.1) return { label: 'The cup is already full', disabled: true, run: () => {} };
      return { label: 'Brew a coffee', clip: 'PickUp', run: () => { this.s.brewing = 3.2; s.sfx('brew'); } };
    };
    sys.add(brew);
    this.update = this.update.bind(this);
  }
  makeItems(mk) {
    const { M, sys } = this.H;
    // coffee bean jar
    const jar = jarObject(M, 0x3b2314, 0.15);
    const beans = new Item({ id: 'coffee_beans', name: 'coffee beans', object: jar, tags: ['beans', 'keep'], home: this.shelf });
    beans.baseScale = 1; sys.add(beans); sys.place(beans, beans.home); this.H.items.beans = beans;
    // portafilter (the coffee handle)
    const g = new THREE.Group();
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.03, 18), M.stainless); basket.position.y = 0.015; g.add(basket);
    const grounds = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 18), new THREE.MeshStandardNodeMaterial({ color: 0x2a1a10, roughness: 0.95 })); grounds.position.y = 0.029; g.add(grounds);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.13, 10), M.blackWood); handle.rotation.x = Math.PI / 2; handle.position.set(0, 0.018, 0.1); g.add(handle);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const pf = new Item({ id: 'portafilter', name: 'coffee handle', object: g, tags: ['portafilter', 'keep'], home: this.counter, state: { ground: false } });
    pf.baseScale = 1; pf.onState = () => { grounds.visible = !!pf.state.ground; }; pf.onState();
    sys.add(pf); sys.place(pf, pf.home); this.H.items.portafilter = pf;
    // a little white espresso cup
    const cg = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.06, 18, 1, true), M.white); cup.material = M.white; cup.position.y = 0.03; cg.add(cup);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.005, 18), M.white); bottom.position.y = 0.0025; cg.add(bottom);
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), M.white); ear.position.set(0.038, 0.032, 0); cg.add(ear);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.008, 20), M.white); saucer.position.y = -0.002; cg.add(saucer);
    cg.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ec = new Item({ id: 'espresso_cup', name: 'coffee cup', object: cg, tags: ['cup', 'fillable', 'washable'], home: this.cupSlotHome(), state: { fill: 0 },
      use: (s, it) => (it.state.fill || 0) > 0.15 ? { label: it.state.coffee ? 'Serve the coffee to the grown-ups' : 'Drink it', clip: 'PickUp', run: () => {
        const c = it.state.coffee; it.state.fill = 0; it.state.coffee = false; it.state.cocoa = false; it.onState();
        s.toast(c ? 'Coffee served! The grown-ups say thank you!' : 'Ahh!'); if (c) this.H.game.friend?.cheer?.(); s.sfx(c ? 'place' : 'drink'); s.changed(); } } : null });
    ec.baseScale = 1; addLiquid(ec, { r: 0.03, y0: 0.008, depth: 0.045 });
    sys.add(ec); sys.place(ec, ec.home); this.H.items.espresso_cup = ec;
  }
  cupSlotHome() { return this.H.sys.addSlot(new Slot({ id: 'coffee_cup_home', name: 'on the shelf', parent: this.root, pos: this.at.cupHome, radius: 2.0 })); }
  update(dt) {
    const sys = this.H.sys, g = this.H.game;
    if (this.s.grinding > 0) {
      this.s.grinding -= dt;
      if (Math.random() < 0.5 && g.fxGlow) { this.root.updateWorldMatrix(true, false); const p = this.fork.world(); p.y += 0.06; g.fxGlow.emit(p, V3(0, -0.4, 0), { life: 0.3, size: 0.02, gravity: 3, color: [0.35, 0.2, 0.1] }); }
      if (this.s.grinding <= 0) {
        this.s.grinding = 0; this.s.beans = false;
        const p = this.fork.item; if (p) { p.state.ground = true; p.onState(); } this.H.cooking?.flag('ground');
        sys.toast('Fresh grounds! Now click the handle into the espresso machine.'); sys.changed();
      }
    }
    if (this.s.brewing > 0) {
      this.s.brewing -= dt;
      this.stream.visible = true;
      const cup = this.cupSlot.item;
      if (cup) { cup.state.fill = Math.min(1, (cup.state.fill || 0) + dt / 3); cup.state.coffee = true; cup.onState(); }
      if (Math.random() < 0.3 && g.fxFoam) { this.root.updateWorldMatrix(true, false); const p = this.cupSlot.world(); p.y += 0.08; g.fxFoam.emit(p, V3(0, 0.35, 0), { life: 1.2, size: 0.06, grow: 1.5, alpha: 0.18 }); }
      if (this.s.brewing <= 0) {
        this.s.brewing = 0; this.stream.visible = false;
        const p = this.group.item; if (p) { p.state.ground = false; p.onState(); }
        sys.sfx('ding'); sys.toast('A perfect little coffee! Take it to a grown-up.'); this.H.cooking?.flag('coffee'); sys.changed();
      }
    }
  }
}

/** a glass storage jar with contents of colour `col`, a wooden lid */
function jarObject(M, col, h = 0.2, r = 0.06) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), M.clearGlass); glass.position.y = h / 2; g.add(glass);
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, h * 0.78, 18), new THREE.MeshStandardNodeMaterial({ color: col, roughness: 0.85 })); fill.position.y = h * 0.39 + 0.004; g.add(fill);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.025, 20), M.whiteOak); lid.position.y = h + 0.012; g.add(lid);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ------------------------------------------------------------------ walk-in pantry
function buildPantry(H) {
  const { b, M, sys, A, game } = H, R = H.root;
  const P = H.pantry = { strips: [], slots: [] };
  P.door = modernDoor(H, { id: 'pantry_door', name: 'pantry door', at: V3(12.5, 0, 2.1), rotY: Math.PI / 2, w: 1.0, h: 2.2, swing: -95 });
  // light + switch just inside the door
  P.light = new THREE.PointLight(0xfff0d8, 0, 6, 1.4); P.light.position.set(14.0, 2.7, 2.2); R.add(P.light);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24), M.lamp); lamp.position.set(14.0, 2.985, 2.2); R.add(lamp); lamp.visible = false;
  P.switch = wallSwitch(H, { id: 'pantry_light', name: 'pantry light', at: V3(12.622, 1.2, 1.38), ry: Math.PI / 2,
    onSet: on => { P.light.intensity = on ? 5 : 0; lamp.visible = on; for (const s of P.strips) s.visible = on; } });
  const doorChange = P.door.hinge.onChange;
  P.door.hinge.onChange = open => { doorChange(open); if (open && !P.switch.on && H.indoors) sys.toast('It\'s dark in the pantry: flip the light switch inside the door.'); };
  // floor-to-ceiling white-oak shelving on the north and east walls, LED strip under every shelf
  const ys = [0.45, 0.85, 1.25, 1.65, 2.05, 2.45];
  const shelfRun = (cx, cz, len, along, depth) => {
    const sx = along === 'x' ? len : depth, sz = along === 'x' ? depth : len;
    for (const y of ys) {
      b.box(M.whiteOak, [cx, y, cz], [sx, 0.035, sz], { collide: false, round: 0.004 });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len - 0.06 : 0.012, 0.008, along === 'x' ? 0.012 : len - 0.06), M.ledStrip);
      const off = depth / 2 - 0.03;
      strip.position.set(cx + (along === 'x' ? 0 : -off), y - 0.022, cz + (along === 'x' ? off : 0)); strip.visible = false; R.add(strip); P.strips.push(strip);
    }
    const n = Math.max(2, Math.round(len / 0.9) + 1);
    for (let i = 0; i < n; i++) { const t = -len / 2 + i * len / (n - 1); b.box(M.whiteOak, [cx + (along === 'x' ? t : 0), 1.4, cz + (along === 'x' ? 0 : t)], [along === 'x' ? 0.03 : depth, 2.8, along === 'x' ? depth : 0.03], { collide: false, cast: false }); }
    // the shelving is solid to walk into
    const c = new THREE.Mesh(); c.visible = false; c.position.set(cx, 1.4, cz); R.add(c); b.solid(c, sx, 2.8, sz);
  };
  shelfRun(13.8, 0.71, 2.36, 'x', 0.38);       // north
  shelfRun(15.19, 2.2, 3.36, 'z', 0.38);        // east
  // counter on the south wall with open shelves above
  P.run = cabinetRun(b, M, sys, { id: 'pantry_run', at: V3(14.98, 0, 3.56), rotY: Math.PI, modules: [{ kind: 'drawers', w: 0.8 }, { kind: 'drawers', w: 0.78 }, { kind: 'drawers', w: 0.78 }], game });
  for (const y of [1.45, 1.85, 2.25, 2.65]) {
    b.box(M.whiteOak, [13.8, y, 3.73], [2.36, 0.035, 0.3], { collide: false, round: 0.004 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.008, 0.012), M.ledStrip); strip.position.set(13.8, y - 0.022, 3.6); strip.visible = false; R.add(strip); P.strips.push(strip);
  }
  sys.slots.get('pantry_run_top_1').enabled = () => false;      // the stand mixer lives there
  // stand mixer (generated) and a toaster that really pops
  { const m = prop(A, 'SM_Kitchen_StandMixer', 0.36, simple(new THREE.BoxGeometry(0.22, 0.36, 0.34).translate(0, 0.18, 0), 0xC0392B)); m.position.set(13.79, 0.92, 3.62); m.rotation.y = Math.PI; R.add(m); }
  {
    const g = new THREE.Group(); g.position.set(13.0, 0.92, 3.76); g.rotation.y = Math.PI; R.add(g);
    b.box(M.stainless, [0, 0.09, 0], [0.26, 0.18, 0.15], { parent: g, collide: false, round: 0.03 });
    for (const x of [-0.05, 0.05]) b.box(M.dark, [x, 0.181, 0], [0.03, 0.004, 0.11], { parent: g, collide: false, cast: false });
    const lever = new THREE.Group(); lever.position.set(0.135, 0.13, 0); g.add(lever);
    b.box(M.blackSteel, [0.012, 0, 0], [0.024, 0.016, 0.03], { parent: lever, collide: false, cast: false });
    const breadMat = new THREE.MeshStandardNodeMaterial({ color: 0xF2D8A8, roughness: 0.9 });
    const slices = [-0.05, 0.05].map(x => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.09), breadMat); s.position.set(x, 0.14, 0); g.add(s); return s; });
    P.toast = { t: 0, slices, lever, breadMat };
    P.toaster = sys.add(new Toggle({ id: 'pantry_toaster', name: 'toaster', object: g, anchor: [0, 0.2, 0.1], persist: false, verbOn: 'Make toast in the', verbOff: 'Pop up the', sound: 'click', radius: 1.6,
      onSet: on => { P.toast.t = on ? 0.0001 : 0; if (on) breadMat.color.set(0xF2D8A8); } }));
  }
  // woven baskets on the bottom shelves (root vegetables go in them)
  const basket = new THREE.BoxGeometry(0.36, 0.22, 0.3);
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(basket, M.rattan); m.position.set(12.95 + i * 0.46, 0.45 + 0.13, 0.72); m.castShadow = true; R.add(m); }
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(basket, M.rattan); m.rotation.y = Math.PI / 2; m.position.set(15.18, 0.45 + 0.13, 0.85 + i * 0.52); R.add(m); }
  // cereal boxes (atlas of 8 invented box fronts, side by side)
  const atlas = A.textures.T_Cereal_Boxes;
  P.boxMats = Array.from({ length: 8 }, (_, i) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    if (atlas) { atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping; m.colorNode = texture(atlas, uv().mul(vec2(1 / 8 * 0.9, 0.9)).add(vec2((i + 0.05) / 8, 0.05))).rgb; }
    else m.color.set([0xE74C3C, 0xF1C40F, 0x9B59B6, 0x6E2C00, 0xD35400, 0xEC7063, 0x2E86C1, 0x7D3C98][i]);
    return m;
  });
  const side = new THREE.MeshStandardNodeMaterial({ color: 0xF4F1EA, roughness: 0.7 });
  P.cerealBox = i => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.07), [side, side, side, side, P.boxMats[i % 8], side]);
    box.position.y = 0.14; box.castShadow = true;
    const g = new THREE.Group(); g.add(box); return g;
  };
  P.makeItems = mk => {
    // flour and cookies on the counter
    mk('flour', 'SM_Kitchen_FlourSack', 'flour', 0.2, ['ingredient', 'flour'], 'pantry_run_top_0', simple(new THREE.BoxGeometry(0.14, 0.2, 0.1).translate(0, 0.1, 0), C.cream));
    mk('cookies', 'SM_Kitchen_CookieJar', 'cookie jar', 0.22, ['food'], 'pantry_run_top_2', cyl(0.08, 0.22, 0xd9c9a3));
  };
}

// ------------------------------------------------------------------ per frame
const _p = new THREE.Vector3();
export function updateKitchen(H, dt) {
  const g = H.game, sys = H.sys, indoors = H.indoors;
  // ---- sink: hot/cold streams, stopper, the basin filling and draining, filling cups, washing
  const sk = H.sink;
  sk.root.updateWorldMatrix(true, false);
  if (sk.running && indoors) {
    _p.set(sk.mouth.x, sk.basinY + 0.03 + sk.S.level, sk.mouth.z).applyMatrix4(sk.root.matrixWorld);
    if (Math.random() < 0.6) g.fxWater?.emit(_p.clone(), V3((Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5), { life: 0.3, size: 0.025, gravity: 6 });
    if (sk.isHot && Math.random() < 0.25) g.fxFoam?.emit(_p.clone().add(V3(0, 0.1, 0)), V3(0, 0.3, 0), { life: 1.4, size: 0.1, grow: 1.6, alpha: 0.12 });
    const it = sk.slot.item;
    if (it?.tags.has('fillable')) {
      it.state.fill = Math.min(1, (it.state.fill || 0) + dt * 0.22); it.state.coffee = false; it.state.cocoa = false; it.onState?.();
      if (it.state.fill >= 1 && !it._fullSaid) { it._fullSaid = true; g.toast(`The ${it.name} is full!`); H.cooking?.flag('mug_filled'); sys.changed(); }
    } else if (it && it._fullSaid) it._fullSaid = false;
    if (it?.tags.has('washable') && !it.tags.has('fillable')) {
      it._wash = (it._wash || 0) + dt;
      if (it._wash > 1.5 && !it.state.clean) { it.state.clean = true; it.onState?.(); g.toast(`Squeaky clean ${it.name.replace('dirty ', '')}!`); sys.changed(); }
    }
  }
  const lvl = sk.S;
  if (sk.running && sk.plug.on) lvl.level = Math.min(sk.maxLevel, lvl.level + dt * 0.035);
  else if (!sk.plug.on) lvl.level = Math.max(0, lvl.level - dt * 0.06);
  sk.pool.visible = lvl.level > 0.004 || sk.running;
  const depth = Math.max(0.004, lvl.level);
  sk.pool.scale.y = depth / 0.004; sk.pool.position.y = sk.basinY + depth / 2;
  sk.stopper.position.y = sk.basinY + (sk.plug.on ? 0.008 : 0.03);
  g.audio?.houseTap?.(sk.running && indoors);

  // ---- range: burners with cookware steam and sizzle; ovens bake
  const rg = H.range; let sizzle = 0;
  rg.root.updateWorldMatrix(true, false);
  const fan = H.hood.fan.level;
  for (const br of rg.burners) {
    const lv = br.dial.level;
    if (!lv || !indoors) continue;
    const pot = br.slot.item;
    if (pot) sizzle += 0.4 + lv * 0.15;
    if (pot && Math.random() < 0.12 * lv) {
      _p.set(br.x, rg.H + 0.25, br.z).applyMatrix4(rg.root.matrixWorld);
      g.fxFoam?.emit(_p.clone(), V3((Math.random() - 0.5) * 0.1, 0.35 + fan * 0.35, (Math.random() - 0.5) * 0.1 - fan * 0.05), { life: fan ? 1.0 : 2.2, size: 0.12, grow: 1.8, alpha: 0.16 });
    }
  }
  if (rg.griddle.level && rg.griddleSlot.item) sizzle += 0.6;
  g.audio?.houseLoop?.('sizzle', indoors ? Math.min(1, sizzle) : 0);
  g.audio?.houseLoop?.('fan', indoors ? fan / 3 : 0);
  for (const ov of rg.ovens) {
    const st = ov.state;
    if (ov.knob.on && st.baking > 0) {
      st.baking += dt;
      ov.glow.intensity = 1.5 + Math.sin(performance.now() * 0.01) * 0.2;
      ov.coil.material.color.setRGB(0.9, 0.25 + 0.1 * Math.sin(performance.now() * 0.008), 0.05);
      if (st.baking >= st.total) {
        st.baking = 0; ov.knob.set(false, sys);
        if (st.onDone) st.onDone();
        else { sys.sfx('ding'); const it = ov.slot.item; sys.toast(it ? `Ding! The ${it.name} is nice and warm.` : 'Ding!'); if (it) it.state.warm = true; }
      }
    } else { ov.glow.intensity = 0; ov.coil.material.color.set(0x3a2a22); }
  }
  // ---- appliances
  const tt = performance.now() / 1000; H.birdOfParadise?.update(tt); H.birdOfParadise2?.update(tt);
  H.dishwasher.update(dt); H.microwave.update(dt); H.freezer.update(dt); H.fridge.update(dt); H.coffee.update(dt);
  // ---- toaster
  const T = H.pantry.toast;
  T.lever.position.y = 0.13 - (H.pantry.toaster.on ? 0.07 : 0);
  for (const s of T.slices) s.position.y = H.pantry.toaster.on ? 0.1 : 0.15;
  if (T.t > 0) {
    T.t += dt; T.breadMat.color.lerp(new THREE.Color(0xB5762E), dt * 0.25);
    if (T.t > 4) { T.t = 0; H.pantry.toaster.set(false, sys); sys.sfx('ding'); sys.toast('Pop! Golden toast.'); }
  }
}
