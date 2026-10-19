// Parametric appliance and furniture assemblies with real moving parts. Every moving
// piece sits under its own pivot (hinge line or slide rail), so it moves exactly like
// the real thing and never swings around its centre. Surfaces use the generated house
// materials; all static props come from generated 3D models (see house.js).
import * as THREE from 'three/webgpu';
import { uv, vec3, float, time, mx_noise_float, smoothstep, mix, abs, sin, uniform } from 'three/tsl';
import { Hinge, Slide, Toggle, Slot } from './interact.js';

/** knob or bar handle */
function handle(b, M, parent, [x, y, z], len = 0.22, vertical = true) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 10), M.brass);
  if (!vertical) bar.rotation.z = Math.PI / 2;
  bar.position.z = 0.035; g.add(bar);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 8), M.brass);
    post.rotation.x = Math.PI / 2; post.position.set(vertical ? 0 : s * len * 0.4, vertical ? s * len * 0.4 : 0, 0.018); g.add(post);
  }
  return g;
}

// ------------------------------------------------------------------ fridge
/**
 * A two-door fantasy fridge (freezer on top). Front faces local +z. Origin: floor, centre.
 * Returns interactables (two hinged doors) and slots (6 shelf spots + 2 door spots).
 */
export function buildFridge(b, M, sys, { id = 'kitchen_fridge_01', w = 0.85, d = 0.72, h = 1.95, at, rotY = 0 }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const t = 0.05, split = 1.35;           // wall thickness, freezer starts at this height
  // cabinet shell (open front) so the inside is real space
  b.box(M.enamel, [0, h / 2, -d / 2 + t / 2], [w, h, t], { parent: root, collide: false });                  // back
  b.box(M.enamel, [-w / 2 + t / 2, h / 2, 0], [t, h, d], { parent: root, collide: false, round: 0.02 });    // sides
  b.box(M.enamel, [w / 2 - t / 2, h / 2, 0], [t, h, d], { parent: root, collide: false, round: 0.02 });
  b.box(M.enamel, [0, h - t / 2, 0], [w, t, d], { parent: root, collide: false, round: 0.03 });             // top
  b.box(M.enamelCream, [0, 0.06, 0], [w, 0.12, d], { parent: root, collide: false });                       // plinth
  b.box(M.enamel, [0, split, 0], [w - 2 * t, 0.05, d - t], { parent: root, collide: false });                // divider
  // inside: pale liner, glass shelves, crisper drawer front
  b.box(M.interior, [0, h / 2, -d / 2 + t + 0.005], [w - 2 * t, h - 0.1, 0.01], { parent: root, collide: false, cast: false });
  const shelfY = [0.42, 0.78, 1.08];
  for (const y of shelfY) b.box(M.glass, [0, y, -0.02], [w - 2 * t - 0.01, 0.012, d - t - 0.08], { parent: root, collide: false, cast: false });
  b.box(M.glass, [0, 0.24, 0.0], [w - 2 * t - 0.04, 0.2, d - t - 0.12], { parent: root, collide: false, cast: false });
  // solid collider for the whole cabinet
  const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, d)); col.position.set(0, h / 2, 0); col.visible = false; root.add(col); b.solid(col, w, h, d);
  // interior light: warm panel + point light, on while a door is open
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.06), M.lamp); lamp.position.set(0, split - 0.06, -0.05); root.add(lamp);
  const light = new THREE.PointLight(0xfff0d0, 0, 1.6, 2); light.position.set(0, split - 0.15, 0.05); root.add(light);
  lamp.visible = false;

  const door = (y0, y1, name, idSuffix) => {
    const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, d / 2); root.add(hinge);   // left hinge line
    const dh = y1 - y0, dw = w;
    b.box(M.enamel, [dw / 2, y0 + dh / 2, 0.035], [dw - 0.01, dh - 0.01, 0.07], { parent: hinge, collide: false, round: 0.03 });
    b.box(M.enamelCream, [dw / 2, y0 + dh / 2, 0.072], [dw - 0.12, dh - 0.12, 0.006], { parent: hinge, collide: false, cast: false });  // inset panel
    handle(b, M, hinge, [dw - 0.08, y0 + dh * (idSuffix === 'main' ? 0.78 : 0.3), 0.07], Math.min(0.3, dh * 0.5));
    // door shelf (inside face) for bottles
    const inner = new THREE.Group(); inner.position.set(0, 0, -0.01); hinge.add(inner);
    if (idSuffix === 'main') {
      b.box(M.glass, [dw / 2, y0 + 0.45, -0.07], [dw - 0.16, 0.012, 0.11], { parent: inner, collide: false, cast: false });
      b.box(M.glass, [dw / 2, y0 + 0.5, -0.125], [dw - 0.16, 0.1, 0.008], { parent: inner, collide: false, cast: false });
    }
    const hg = sys.add(new Hinge({ id: `${id}.${idSuffix}`, name, object: hinge, anchor: [dw * 0.85, y0 + dh * 0.55, 0.1], pivot: hinge, axis: 'y', angle: -105, duration: 0.6,
      sound: 'fridge', onChange: () => {} }));
    return { hinge, inner, hg, y0 };
  };
  const main = door(0.12, split - 0.01, 'fridge', 'main');
  const freezer = door(split + 0.01, h - 0.02, 'freezer', 'freezer');
  const lightOn = () => { const on = main.hg.isOpen || freezer.hg.isOpen; lamp.visible = on; light.intensity = on ? 1.6 : 0; };
  main.hg.onChange = lightOn; freezer.hg.onChange = lightOn;

  // slots: two spots on each shelf, two in the door shelf, two in the freezer
  const slots = [];
  const inFridge = () => main.hg.openAmount > 0.6;
  const shelfSlot = (y, x, k) => slots.push(sys.addSlot(new Slot({ id: `${id}_shelf_${k}`, name: 'in the fridge', parent: root, pos: [x, y + 0.008, -0.03], enabled: inFridge, accepts: it => it.tags.has('food') || it.tags.has('drink') })));
  [[0.42, 'a'], [0.78, 'b'], [1.08, 'c']].forEach(([y, s]) => { shelfSlot(y, -0.18, s + '1'); shelfSlot(y, 0.18, s + '2'); });
  for (const [x, k] of [[0.25, 'd1'], [0.6, 'd2']]) slots.push(sys.addSlot(new Slot({ id: `${id}_door_${k}`, name: 'in the fridge door', parent: main.inner, pos: [x, main.y0 + 0.456, -0.07], enabled: inFridge, accepts: it => it.tags.has('drink') })));
  const inFreezer = () => freezer.hg.openAmount > 0.6;
  for (const [x, k] of [[-0.18, 'f1'], [0.18, 'f2']]) slots.push(sys.addSlot(new Slot({ id: `${id}_freezer_${k}`, name: 'in the freezer', parent: root, pos: [x, split + 0.03, -0.03], enabled: inFreezer, accepts: it => it.tags.has('food') })));
  return { root, main: main.hg, freezer: freezer.hg, slots };
}

// ------------------------------------------------------------------ base cabinets, drawers, counter
/**
 * a run of base cabinets along local +x, fronts facing +z, back against a wall.
 * modules: list of 'door' | 'drawers' | 'sink' | 'oven' | 'gap' (each `mw` wide)
 * Returns { root, top: y of the counter, slotsParent, modulesInfo[] }
 */
export function buildCounterRun(b, M, sys, { id, at, rotY = 0, modules, mw = 0.62, d = 0.62, h = 0.92, contents = {} }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const W = modules.length * mw, ct = 0.04;
  const info = [];
  // plinth and carcass back
  b.box(M.teak, [W / 2, 0.05, 0.02], [W, 0.1, d - 0.08], { parent: root, collide: false });
  // countertop with a cut-out for the sink
  const sinkIdx = modules.indexOf('sink');
  const top = h;
  const counterPiece = (x0, x1, z0 = -d / 2, z1 = d / 2 + 0.03) => b.box(M.marble, [(x0 + x1) / 2, top - ct / 2, (z0 + z1) / 2], [x1 - x0, ct, z1 - z0], { parent: root, collide: false, round: 0.01 });
  if (sinkIdx < 0) counterPiece(0, W);
  else {
    const sx0 = sinkIdx * mw + 0.07, sx1 = (sinkIdx + 1) * mw - 0.07;
    counterPiece(0, sx0); counterPiece(sx1, W);
    counterPiece(sx0, sx1, -d / 2, -d / 2 + 0.1); counterPiece(sx0, sx1, d / 2 - 0.1, d / 2 + 0.03);
  }
  // one collider for the whole run (counter height)
  const col = new THREE.Mesh(new THREE.BoxGeometry(W, h, d)); col.position.set(W / 2, h / 2, 0); col.visible = false; root.add(col); b.solid(col, W, h, d);

  modules.forEach((kind, i) => {
    const x0 = i * mw, xc = x0 + mw / 2, fz = d / 2;
    // carcass sides + inside floor so open doors reveal a real cupboard
    b.box(M.cabinet, [x0 + 0.01, h / 2 + 0.05, 0], [0.02, h - 0.14, d - 0.04], { parent: root, collide: false, cast: false });
    b.box(M.interior, [xc, 0.12, 0], [mw - 0.04, 0.02, d - 0.06], { parent: root, collide: false, cast: false });
    b.box(M.interior, [xc, h / 2 + 0.05, -d / 2 + 0.02], [mw - 0.04, h - 0.14, 0.02], { parent: root, collide: false, cast: false });
    const m = { kind, x0, xc };
    if (kind === 'door') {
      const hinge = new THREE.Group(); hinge.position.set(x0 + 0.01, 0, fz); root.add(hinge);
      b.box(M.cabinet, [mw / 2 - 0.01, 0.12 + (h - 0.2) / 2, 0.012], [mw - 0.03, h - 0.2, 0.024], { parent: hinge, collide: false, round: 0.01 });
      b.box(M.wood, [mw / 2 - 0.01, 0.12 + (h - 0.2) / 2, 0.026], [mw - 0.14, h - 0.34, 0.006], { parent: hinge, collide: false, cast: false });
      handle(b, M, hinge, [mw - 0.08, h - 0.25, 0.02], 0.14);
      m.hinge = sys.add(new Hinge({ id: `${id}_door_${i}`, name: 'cupboard', object: hinge, anchor: [mw * 0.7, 0.55, 0.1], pivot: hinge, axis: 'y', angle: -100, duration: 0.45, sound: 'cupboard' }));
      // a shelf inside with one slot
      b.box(M.interior, [xc, 0.48, -0.02], [mw - 0.05, 0.02, d - 0.1], { parent: root, collide: false, cast: false });
      m.slots = [sys.addSlot(new Slot({ id: `${id}_cup_${i}`, name: 'in the cupboard', parent: root, pos: [xc, 0.49, -0.02], enabled: () => m.hinge.openAmount > 0.6 }))];
    } else if (kind === 'drawers') {
      // three drawers; the top one is interactive with a slot inside, the others are decorative fronts
      const dh = (h - 0.2) / 3;
      for (let k = 0; k < 3; k++) {
        const y = 0.12 + dh * (2 - k) + dh / 2;
        const part = new THREE.Group(); part.position.set(xc, y, fz); root.add(part);
        b.box(M.cabinet, [0, 0, 0.012], [mw - 0.03, dh - 0.02, 0.024], { parent: part, collide: false, round: 0.01 });
        handle(b, M, part, [0, 0.0, 0.02], 0.18, false);
        if (k === 0) {
          // the drawer box behind the front
          b.box(M.wood, [0, -dh / 2 + 0.03, -0.24], [mw - 0.08, 0.012, 0.46], { parent: part, collide: false, cast: false });
          for (const s of [-1, 1]) b.box(M.wood, [s * (mw / 2 - 0.045), -dh / 2 + 0.07, -0.24], [0.012, 0.09, 0.46], { parent: part, collide: false, cast: false });
          b.box(M.wood, [0, -dh / 2 + 0.07, -0.47], [mw - 0.08, 0.09, 0.012], { parent: part, collide: false, cast: false });
          m.slide = sys.add(new Slide({ id: `${id}_drawer_${i}`, name: 'drawer', object: part, anchor: [0, 0, 0.08], part, dir: [0, 0, 1], distance: 0.4, sound: 'drawer' }));
          m.slots = [sys.addSlot(new Slot({ id: `${id}_drawer_${i}_in`, name: 'in the drawer', parent: part, pos: [0, -dh / 2 + 0.04, -0.2], enabled: () => m.slide.t > 0.7 }))];
        }
      }
    } else if (kind === 'oven') {
      m.oven = buildOven(b, M, sys, { id: `${id}_oven`, root, xc, fz, mw, h });
    } else if (kind === 'sink') {
      m.sink = buildSink(b, M, sys, { id: `${id}_sink`, root, xc, fz, mw, d, h });
      // cupboard door under the sink (decorative pair)
      for (const s of [-1, 1]) b.box(M.cabinet, [xc + s * mw / 4, 0.12 + (h - 0.4) / 2, fz + 0.012], [mw / 2 - 0.02, h - 0.4, 0.024], { parent: root, collide: false, round: 0.01 });
    }
    info.push(m);
  });
  // counter-top slots: one per module that isn't a sink
  const slots = [];
  modules.forEach((kind, i) => {
    if (kind === 'sink') return;
    for (const dz of [0.05]) slots.push(sys.addSlot(new Slot({ id: `${id}_top_${i}`, name: 'on the counter', parent: root, pos: [i * mw + mw / 2, top, dz] })));
  });
  return { root, top, info, slots, W };
}

// ------------------------------------------------------------------ oven (inside a counter run)
function buildOven(b, M, sys, { id, root, xc, fz, mw, h }) {
  const oh = 0.62, oy = 0.14;
  // cavity
  b.box(M.dark, [xc, oy + oh / 2, -0.04], [mw - 0.06, oh, 0.5], { parent: root, collide: false, cast: false });
  const glow = new THREE.PointLight(0xff8a3c, 0, 1.4, 2); glow.position.set(xc, oy + oh / 2, 0.0); root.add(glow);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 32), new THREE.MeshStandardNodeMaterial({ color: 0x3a2a22 }));
  coil.rotation.x = Math.PI / 2; coil.position.set(xc, oy + 0.06, -0.05); root.add(coil);
  const tray = new THREE.Group(); tray.position.set(xc, oy + 0.2, -0.04); root.add(tray);
  b.box(M.steel, [0, 0, 0], [mw - 0.12, 0.01, 0.4], { parent: tray, collide: false, cast: false });
  // door hinged along the bottom edge, opens downward
  const hinge = new THREE.Group(); hinge.position.set(xc, oy, fz); root.add(hinge);
  b.box(M.enamel, [0, oh / 2, 0.015], [mw - 0.03, oh, 0.03], { parent: hinge, collide: false, round: 0.01 });
  b.box(M.ovenGlass, [0, oh / 2 + 0.03, 0.032], [mw - 0.18, oh * 0.45, 0.006], { parent: hinge, collide: false, cast: false });
  handle(b, M, hinge, [0, oh - 0.06, 0.03], mw - 0.2, false);
  const door = sys.add(new Hinge({ id: `${id}.door`, name: 'oven', object: hinge, anchor: [0, oh * 0.7, 0.12], pivot: hinge, axis: 'x', angle: 85, duration: 0.55, sound: 'oven' }));
  // knob on the control strip
  const knobRoot = new THREE.Group(); knobRoot.position.set(xc, oy + oh + 0.06, fz + 0.02); root.add(knobRoot);
  b.box(M.enamelCream, [0, 0, -0.01], [mw - 0.03, 0.09, 0.02], { parent: knobRoot, collide: false });
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 16), M.brass); knob.rotation.x = Math.PI / 2; knob.position.z = 0.02;
  const kp = new THREE.Group(); kp.add(knob); knobRoot.add(kp);
  const ind = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.006), M.dark); ind.position.set(0, 0.015, 0.036); kp.add(ind);
  const slot = sys.addSlot(new Slot({ id: `${id}_tray`, name: 'in the oven', parent: tray, pos: [0, 0.006, 0], enabled: () => door.openAmount > 0.7, accepts: it => it.tags.has('bakeable') }));
  const state = { baking: 0, total: 6 };
  const knobT = sys.add(new Toggle({ id: `${id}.knob`, name: 'oven', object: knobRoot, anchor: [0, 0, 0.05], part: kp, partAxis: 'z', partAngle: -120, persist: false,
    verbOn: 'Bake in the', verbOff: 'Turn off the', sound: 'knob',
    requires: () => door.isOpen ? 'Close the oven door first' : (!slot.item ? 'Put something in the oven to bake' : null),
    onSet: (on, s) => { state.baking = on ? 0.0001 : 0; if (on) s?.toast('Baking… wait for the ding!'); } }));
  return { door, knob: knobT, slot, glow, coil, state };
}

// ------------------------------------------------------------------ sink + faucet + water
function buildSink(b, M, sys, { id, root, xc, fz, mw, d, h }) {
  const bw = mw - 0.16, bd = d - 0.22, bh = 0.2, by = h - bh;
  // basin (5 sides) in steel
  b.box(M.steel, [xc, by, 0], [bw, 0.012, bd], { parent: root, collide: false, cast: false });
  for (const s of [-1, 1]) b.box(M.steel, [xc + s * bw / 2, by + bh / 2, 0], [0.012, bh, bd], { parent: root, collide: false, cast: false });
  for (const s of [-1, 1]) b.box(M.steel, [xc, by + bh / 2, s * bd / 2], [bw, bh, 0.012], { parent: root, collide: false, cast: false });
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 16), M.dark); drain.position.set(xc, by + 0.008, 0); root.add(drain);
  // still water in the basin (rises while the tap runs, drains when it stops)
  const pool = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.02, 0.004, bd - 0.02), new THREE.MeshPhysicalNodeMaterial({ color: 0x9fe3ec, transparent: true, opacity: 0.55, roughness: 0.05 }));
  pool.position.set(xc, by + 0.01, 0); pool.visible = false; root.add(pool);
  // brass faucet: arched spout from the back
  const fx = xc, fzb = -bd / 2 - 0.04;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(fx, h, fzb), new THREE.Vector3(fx, h + 0.3, fzb), new THREE.Vector3(fx, h + 0.38, fzb + 0.12), new THREE.Vector3(fx, h + 0.28, fzb + 0.22)]);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 10), M.brass); spout.castShadow = true; root.add(spout);
  const mouth = curve.getPoint(1);
  // tap handle (lever) that turns 90 degrees
  const hroot = new THREE.Group(); hroot.position.set(fx + 0.12, h + 0.02, fzb); root.add(hroot);
  const hbase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 14), M.brass); hbase.position.y = 0.02; hroot.add(hbase);
  const lever = new THREE.Group(); lever.position.y = 0.045; hroot.add(lever);
  const lv = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 8), M.brass); lv.rotation.z = Math.PI / 2; lv.position.x = 0.055; lever.add(lv);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), M.coral); ball.position.x = 0.115; lever.add(ball);
  // the water stream: a tapering cylinder with rushing streaks
  const len = mouth.y - (by + 0.01);
  const sg = new THREE.CylinderGeometry(0.011, 0.016, len, 12, 8, true); sg.translate(0, -len / 2, 0);
  const sm = new THREE.MeshPhysicalNodeMaterial({ transparent: true, roughness: 0.05, depthWrite: false });
  const streak = mx_noise_float(vec3(uv().x.mul(9), uv().y.mul(5).add(time.mul(7)), 0)).mul(0.5).add(0.5);
  sm.colorNode = mix(vec3(0.62, 0.86, 0.95), vec3(1, 1, 1), smoothstep(0.55, 0.9, streak));
  sm.opacityNode = mix(float(0.5), float(0.9), streak);
  sm.emissiveNode = vec3(0.05, 0.1, 0.12);
  const stream = new THREE.Mesh(sg, sm); stream.position.copy(mouth); stream.visible = false; root.add(stream);
  const slot = sys.addSlot(new Slot({ id: `${id}_basin`, name: 'in the sink', parent: root, pos: [xc, by + 0.006, 0.02], accepts: it => it.tags.has('fillable') || it.tags.has('washable') }));
  const tap = sys.add(new Toggle({ id: `${id}.tap`, name: 'tap', object: hroot, anchor: [0.06, 0.05, 0.05], part: lever, partAxis: 'y', partAngle: 90, persist: false, sound: 'tap',
    onSet: on => { stream.visible = on; } }));
  return { tap, stream, slot, pool, mouth, basinY: by, root };
}

// ------------------------------------------------------------------ upper cabinets
export function buildUpperCabinets(b, M, sys, { id, at, rotY = 0, count = 2, mw = 0.62, d = 0.36, h = 0.75 }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const W = count * mw;
  b.box(M.cabinet, [W / 2, h + 0.02, 0], [W + 0.04, 0.04, d + 0.04], { parent: root, collide: false, round: 0.01 });
  b.box(M.cabinet, [W / 2, -0.02, 0], [W + 0.02, 0.04, d], { parent: root, collide: false });
  b.box(M.interior, [W / 2, h / 2, -d / 2 + 0.01], [W, h, 0.02], { parent: root, collide: false, cast: false });
  const out = { root, doors: [], slots: [] };
  for (let i = 0; i < count; i++) {
    const x0 = i * mw;
    b.box(M.cabinet, [x0 + 0.01, h / 2, 0], [0.02, h, d], { parent: root, collide: false });
    b.box(M.interior, [x0 + mw / 2, h * 0.45, 0], [mw - 0.03, 0.015, d - 0.04], { parent: root, collide: false, cast: false });
    const hinge = new THREE.Group(); hinge.position.set(i % 2 ? x0 + mw - 0.01 : x0 + 0.01, 0, d / 2); root.add(hinge);
    const sgn = i % 2 ? -1 : 1;
    b.box(M.cabinet, [sgn * (mw / 2 - 0.01), h / 2, 0.012], [mw - 0.03, h - 0.02, 0.024], { parent: hinge, collide: false, round: 0.01 });
    b.box(M.glass, [sgn * (mw / 2 - 0.01), h / 2, 0.026], [mw - 0.16, h - 0.16, 0.004], { parent: hinge, collide: false, cast: false });
    handle(b, M, hinge, [sgn * (mw - 0.08), 0.12, 0.02], 0.12);
    const hg = sys.add(new Hinge({ id: `${id}_${i}`, name: 'cupboard', object: hinge, anchor: [sgn * mw * 0.6, h * 0.4, 0.1], pivot: hinge, axis: 'y', angle: sgn * -100, duration: 0.45, sound: 'cupboard' }));
    out.doors.push(hg);
    out.slots.push(sys.addSlot(new Slot({ id: `${id}_${i}_shelf`, name: 'in the cupboard', parent: root, pos: [x0 + mw / 2, h * 0.45 + 0.008, 0], enabled: () => hg.openAmount > 0.6, radius: 2.0 })));
    out.slots.push(sys.addSlot(new Slot({ id: `${id}_${i}_low`, name: 'in the cupboard', parent: root, pos: [x0 + mw / 2, 0.0, 0], enabled: () => hg.openAmount > 0.6, radius: 2.0 })));
  }
  return out;
}

// ------------------------------------------------------------------ interior door
export function buildDoor(b, M, sys, { id, name = 'door', at, rotY = 0, w = 1.0, h = 2.2, swing = -95 }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0); root.add(hinge);
  b.box(M.wood, [w / 2, h / 2, 0], [w - 0.02, h - 0.02, 0.05], { parent: hinge, collide: false, round: 0.015 });
  // carved arch-top panels in turquoise
  b.box(M.cabinet, [w / 2, h * 0.68, 0.028], [w - 0.26, h * 0.42, 0.008], { parent: hinge, collide: false, cast: false });
  b.box(M.cabinet, [w / 2, h * 0.25, 0.028], [w - 0.26, h * 0.3, 0.008], { parent: hinge, collide: false, cast: false });
  b.box(M.cabinet, [w / 2, h * 0.68, -0.028], [w - 0.26, h * 0.42, 0.008], { parent: hinge, collide: false, cast: false });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), M.brass); knob.position.set(w - 0.1, 1.0, 0.05); hinge.add(knob);
  const knob2 = knob.clone(); knob2.position.z = -0.05; hinge.add(knob2);
  // collider that only exists while the door is shut
  const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08)); col.position.set(0, h / 2, 0); col.visible = false; root.add(col);
  const collider = b.solid(col, w, h, 0.08);
  const hg = sys.add(new Hinge({ id, name, object: root, anchor: [0, 1.1, 0], pivot: hinge, axis: 'y', angle: swing, duration: 0.7, sound: 'door', collider, radius: 2.0 }));
  return { root, hinge: hg };
}
