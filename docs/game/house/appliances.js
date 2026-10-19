// Luxury Mediterranean kitchen assemblies (Option A, sage & copper). Every moving
// part is its own piece on a real pivot or rail:
//   cabinetRun()  sage shaker cabinets with doors, drawers, a farmhouse sink, a dishwasher,
//                 a microwave drawer and a trash pull-out, under one soapstone top
//   buildRange()  48" pro range: 2 burners | griddle | 2 burners, red knobs, two ovens
//                 with bottom-hinged doors and sliding racks
//   buildHood()   monumental copper hood with a light and a 3-speed fan
//   buildColumn() built-in panel-ready fridge or freezer column
//   glassUppers(), roundTable(), ladderChair(), counterStool(), pendant()
import * as THREE from 'three/webgpu';
import { uv, vec3, float, time, mx_noise_float, smoothstep, mix, uniform, sin, color } from 'three/tsl';
import { Hinge, Slide, Toggle, Dial, Slot, Seat, Interactable } from './interact.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** a straight bar pull (cabinet hardware) */
export function pull(M, parent, [x, y, z], len = 0.16, vertical = false, mat = M.bronze) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, len, 8), mat); if (!vertical) bar.rotation.z = Math.PI / 2; bar.position.z = 0.028; g.add(bar);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.028, 6), mat); p.rotation.x = Math.PI / 2; p.position.set(vertical ? 0 : s * len * 0.42, vertical ? s * len * 0.42 : 0, 0.014); g.add(p); }
  return g;
}

/** a shaker-style door or drawer front: slab + raised frame */
function shaker(b, M, parent, [cx, cy, cz], w, h, mat = M.sage, rail = 0.065) {
  b.box(mat, [cx, cy, cz], [w, h, 0.022], { parent, collide: false, round: 0.004 });
  const f = 0.012;
  b.box(mat, [cx, cy + h / 2 - rail / 2, cz + f], [w, rail, 0.008], { parent, collide: false, cast: false });
  b.box(mat, [cx, cy - h / 2 + rail / 2, cz + f], [w, rail, 0.008], { parent, collide: false, cast: false });
  b.box(mat, [cx - w / 2 + rail / 2, cy, cz + f], [rail, h, 0.008], { parent, collide: false, cast: false });
  b.box(mat, [cx + w / 2 - rail / 2, cy, cz + f], [rail, h, 0.008], { parent, collide: false, cast: false });
}

// ------------------------------------------------------------------ cabinet runs
/**
 * modules: [{ kind: 'door'|'doors2'|'drawers'|'farmsink'|'dishwasher'|'microwave'|'trash'|'panel', w }]
 * Front faces local +z, back at -d/2. Returns { root, info[], slots[], W, top }.
 */
export function cabinetRun(b, M, sys, { id, at, rotY = 0, modules, d = 0.64, h = 0.92, noTop = false, topOverhang = 0.03, game, finish }) {
  // finish: { sage: cabinet material, soapstone: top material, bronze: pull material }
  if (finish) M = Object.assign(Object.create(M), finish);
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const W = modules.reduce((n, m) => n + m.w, 0), ct = 0.04, fz = d / 2;
  b.box(M.blackWood, [W / 2, 0.05, 0.0], [W, 0.1, d - 0.08], { parent: root, collide: false, cast: false });   // toe kick
  const col = new THREE.Mesh(new THREE.BoxGeometry(W, h, d)); col.position.set(W / 2, h / 2, 0); col.visible = false; root.add(col); b.solid(col, W, h, d);
  const info = [], slots = [];
  let x0 = 0;
  for (const [i, mod] of modules.entries()) {
    const w = mod.w, xc = x0 + w / 2, m = { ...mod, x0, xc };
    const carcass = () => {
      b.box(M.sage, [x0 + 0.009, 0.1 + (h - 0.16) / 2, 0], [0.018, h - 0.16, d - 0.03], { parent: root, collide: false, cast: false });
      b.box(M.white, [xc, 0.115, 0], [w - 0.03, 0.018, d - 0.05], { parent: root, collide: false, cast: false });
      b.box(M.white, [xc, h / 2 + 0.05, -d / 2 + 0.015], [w - 0.03, h - 0.12, 0.018], { parent: root, collide: false, cast: false });
    };
    if (mod.kind === 'door' || mod.kind === 'doors2') {
      carcass();
      b.box(M.white, [xc, 0.47, -0.01], [w - 0.04, 0.016, d - 0.08], { parent: root, collide: false, cast: false });   // shelf
      const n = mod.kind === 'doors2' ? 2 : 1, dw = w / n;
      m.doors = [];
      for (let k = 0; k < n; k++) {
        const left = n === 1 ? !mod.hingeRight : k === 0;
        const hinge = new THREE.Group(); hinge.position.set(left ? x0 + k * dw + 0.003 : x0 + (k + 1) * dw - 0.003, 0, fz); root.add(hinge);
        const sgn = left ? 1 : -1;
        shaker(b, M, hinge, [sgn * (dw / 2 - 0.003), 0.12 + (h - 0.2) / 2, 0.011], dw - 0.008, h - 0.21);
        pull(M, hinge, [sgn * (dw - 0.06), h - 0.22, 0.022], 0.12, true);
        m.doors.push(sys.add(new Hinge({ id: `${id}_${i}_d${k}`, name: 'cupboard', object: hinge, anchor: [sgn * dw * 0.6, 0.5, 0.1], pivot: hinge, axis: 'y', angle: sgn * -100, duration: 0.45, sound: 'cupboard' })));
      }
      const open = () => m.doors.some(dd => dd.openAmount > 0.6);
      m.slots = [0.13, 0.485].map((y, k) => sys.addSlot(new Slot({ id: `${id}_${i}_in${k}`, name: 'in the cupboard', parent: root, pos: [xc, y, 0], enabled: open })));
    } else if (mod.kind === 'drawers' || mod.kind === 'trash') {
      carcass();
      const fronts = mod.kind === 'trash' ? [h - 0.2] : [0.2, 0.25, 0.27];
      let y = h - 0.03;
      fronts.forEach((fh, k) => {
        const yc = y - fh / 2; y -= fh + 0.005;
        const part = new THREE.Group(); part.position.set(xc, yc, fz); root.add(part);
        shaker(b, M, part, [0, 0, 0.011], w - 0.008, fh - 0.006, M.sage, 0.045);
        pull(M, part, [0, fh * 0.25, 0.022], Math.min(0.2, w * 0.4));
        if (k === 0 || mod.kind === 'trash') {
          const depth = d - 0.08, bh = Math.min(fh - 0.04, 0.18);
          b.box(M.whiteOak, [0, -fh / 2 + 0.02, -depth / 2], [w - 0.06, 0.012, depth], { parent: part, collide: false, cast: false });
          for (const s of [-1, 1]) b.box(M.whiteOak, [s * (w / 2 - 0.035), -fh / 2 + 0.02 + bh / 2, -depth / 2], [0.012, bh, depth], { parent: part, collide: false, cast: false });
          b.box(M.whiteOak, [0, -fh / 2 + 0.02 + bh / 2, -depth + 0.006], [w - 0.06, bh, 0.012], { parent: part, collide: false, cast: false });
          if (mod.kind === 'trash') {
            for (const s of [-1, 1]) {   // two bins: trash and recycling
              const bin = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.06, 0.42, depth - 0.1), s < 0 ? M.blackSteel : new THREE.MeshStandardNodeMaterial({ color: 0x3E7CB1, roughness: 0.6 }));
              bin.position.set(s * (w / 4 - 0.01), -fh / 2 + 0.25, -depth / 2); part.add(bin);
            }
          }
          const sl = sys.add(new Slide({ id: `${id}_${i}_dr${k}`, name: mod.kind === 'trash' ? 'trash and recycling' : 'drawer', object: part, anchor: [0, 0, 0.08], part, dir: [0, 0, 1], distance: mod.kind === 'trash' ? 0.38 : 0.42, sound: 'drawer' }));
          m.drawer = sl;
          if (mod.kind !== 'trash') m.slots = [sys.addSlot(new Slot({ id: `${id}_${i}_drawer`, name: 'in the drawer', parent: part, pos: [0, -fh / 2 + 0.03, -0.22], enabled: () => sl.t > 0.7 }))];
          else {
            // putting something in the bin throws it away (it goes back where it came from)
            m.slots = [sys.addSlot(new Slot({ id: `${id}_${i}_bin`, name: 'in the trash', parent: part, pos: [-w / 4, -fh / 2 + 0.45, -depth / 2], enabled: () => sl.t > 0.7, accepts: it => !it.tags.has('keep'),
              onPut: (it, s) => setTimeout(() => { if (it.slot?.id !== `${id}_${i}_bin`) return; s.toast('Into the bin!'); if (it.home && !it.home.item) s.place(it, it.home); s.changed(); }, 500) }))];
          }
        }
      });
    } else if (mod.kind === 'farmsink') {
      m.sink = farmSink(b, M, sys, { id: `${id}_sink`, root, xc, fz, w, d, h, game });
    } else if (mod.kind === 'dishwasher') {
      m.dw = dishwasher(b, M, sys, { id: `${id}_dw`, root, xc, fz, w, d, h, game });
    } else if (mod.kind === 'microwave') {
      carcass();
      m.mw = microwaveDrawer(b, M, sys, { id: `${id}_mw`, root, xc, fz, w, d, h, game });
    } else if (mod.kind === 'bevfridge') {
      m.bev = bevFridge(b, M, sys, { id: `${id}_bev`, root, xc, x0, fz, w, d, h, game });
    } else if (mod.kind === 'panel') {
      carcass(); shaker(b, M, root, [xc, 0.12 + (h - 0.2) / 2, fz + 0.011], w - 0.008, h - 0.21);
    }
    info.push(m);
    if (!noTop && mod.kind !== 'farmsink') slots.push(sys.addSlot(new Slot({ id: `${id}_top_${i}`, name: 'on the counter', parent: root, pos: [xc, h, 0.04] })));
    x0 += w;
  }
  // soapstone top (with a cut-out over a farmhouse sink)
  if (!noTop) {
    const sinkM = info.find(q => q.kind === 'farmsink');
    const piece = (a, c, z0 = -d / 2, z1 = d / 2 + topOverhang) => b.box(M.soapstone, [(a + c) / 2, h - ct / 2, (z0 + z1) / 2], [c - a, ct, z1 - z0], { parent: root, collide: false, round: 0.008 });
    if (!sinkM) piece(0, W);
    else { piece(0, sinkM.x0 + 0.02); piece(sinkM.x0 + sinkM.w - 0.02, W); piece(sinkM.x0, sinkM.x0 + sinkM.w, -d / 2, -d / 2 + 0.07); }
  }
  return { root, info, slots, W, top: h };
}

// ------------------------------------------------------------------ farmhouse sink
function farmSink(b, M, sys, { id, root, xc, fz, w, d, h, game }) {
  const bw = w - 0.04, bd = d - 0.1, depth = 0.25, by = h - depth, wall = 0.03;
  // white fireclay: apron front, sides, floor, back (a real hollow basin)
  b.box(M.fireclay, [xc, h - depth / 2 - 0.01, fz - 0.005], [bw + 0.02, depth + 0.02, 0.05], { parent: root, collide: false, round: 0.01 });   // apron
  b.box(M.fireclay, [xc, by, 0], [bw, wall, bd], { parent: root, collide: false, cast: false });
  for (const s of [-1, 1]) b.box(M.fireclay, [xc + s * (bw / 2 - wall / 2), by + depth / 2, 0], [wall, depth, bd], { parent: root, collide: false, cast: false });
  b.box(M.fireclay, [xc, by + depth / 2, -bd / 2 + wall / 2], [bw, depth, wall], { parent: root, collide: false, cast: false });
  b.box(M.sage, [xc, (by - 0.02) / 2 + 0.06, fz - 0.02], [w, by - 0.12, 0.02], { parent: root, collide: false });   // panel under the apron
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 18), M.stainless); drain.position.set(xc, by + wall / 2 + 0.002, 0.02); root.add(drain);
  // drain stopper: lifts up when open, drops in when closed
  const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.02, 18), M.stainless); stopper.position.set(xc, by + wall / 2 + 0.012, 0.02); root.add(stopper);
  // water in the basin (rises with the stopper in, drains with it out)
  const pool = new THREE.Mesh(new THREE.BoxGeometry(bw - 2 * wall - 0.004, 0.004, bd - wall - 0.004), new THREE.MeshPhysicalNodeMaterial({ color: 0xa8dfe8, transparent: true, opacity: 0.55, roughness: 0.04 }));
  pool.position.set(xc, by + wall / 2, 0.015); pool.visible = false; root.add(pool);
  // brushed-brass bridge faucet with hot (left) and cold (right) cross handles
  const fzb = -bd / 2 - 0.06;
  const brass = M.brass;
  const riserL = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.18, 12), brass); riserL.position.set(xc - 0.12, h + 0.09, fzb); root.add(riserL);
  const riserR = riserL.clone(); riserR.position.x = xc + 0.12; root.add(riserR);
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.24, 12), brass); bridge.rotation.z = Math.PI / 2; bridge.position.set(xc, h + 0.17, fzb); root.add(bridge);
  const curve = new THREE.CatmullRomCurve3([V3(xc, h + 0.17, fzb), V3(xc, h + 0.36, fzb + 0.02), V3(xc, h + 0.42, fzb + 0.14), V3(xc, h + 0.32, fzb + 0.24)]);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.015, 10), brass); spout.castShadow = true; root.add(spout);
  const mouth = curve.getPoint(1);
  const handle = (x, dot) => {
    const g = new THREE.Group(); g.position.set(x, h + 0.19, fzb); root.add(g);
    const cross = new THREE.Group(); cross.position.y = 0.02; g.add(cross);
    for (const a of [0, Math.PI / 2]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8), brass); arm.rotation.z = Math.PI / 2; arm.rotation.y = a; cross.add(arm); }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 12), new THREE.MeshStandardNodeMaterial({ color: dot, roughness: 0.3 })); cap.position.y = 0.012; cross.add(cap);
    return { g, cross };
  };
  const hot = handle(xc - 0.12, 0xC0282A), cold = handle(xc + 0.12, 0x2A62C0);
  // the stream
  const len = mouth.y - (by + 0.02);
  const sg = new THREE.CylinderGeometry(0.011, 0.017, len, 12, 8, true); sg.translate(0, -len / 2, 0);
  const temp = uniform(0);      // 0 cold .. 1 hot
  const sm = new THREE.MeshPhysicalNodeMaterial({ transparent: true, roughness: 0.05, depthWrite: false });
  const streak = mx_noise_float(vec3(uv().x.mul(9), uv().y.mul(5).add(time.mul(7)), 0)).mul(0.5).add(0.5);
  sm.colorNode = mix(mix(vec3(0.62, 0.86, 0.95), vec3(0.85, 0.9, 0.92), temp), vec3(1, 1, 1), smoothstep(0.55, 0.9, streak));
  sm.opacityNode = mix(float(0.5), float(0.9), streak); sm.emissiveNode = vec3(0.05, 0.1, 0.12);
  const stream = new THREE.Mesh(sg, sm); stream.position.copy(mouth); stream.visible = false; root.add(stream);
  const slot = sys.addSlot(new Slot({ id: `${id}_basin`, name: 'in the sink', parent: root, pos: [xc, by + wall / 2, 0.03], accepts: it => it.tags.has('fillable') || it.tags.has('washable') || it.tags.has('food') || it.tags.has('plate') }));
  const S = { level: 0 };
  const sync = () => { stream.visible = hotT.on || coldT.on; temp.value = hotT.on && coldT.on ? 0.5 : hotT.on ? 1 : 0; };
  const hotT = sys.add(new Toggle({ id: `${id}.hot`, name: 'hot water', object: hot.g, anchor: [0, 0.03, 0.05], part: hot.cross, partAxis: 'y', partAngle: 90, persist: false, sound: 'tap', radius: 1.5, onSet: sync }));
  const coldT = sys.add(new Toggle({ id: `${id}.cold`, name: 'cold water', object: cold.g, anchor: [0, 0.03, 0.05], part: cold.cross, partAxis: 'y', partAngle: -90, persist: false, sound: 'tap', radius: 1.5, onSet: sync }));
  const plug = sys.add(new Toggle({ id: `${id}.stopper`, name: 'drain stopper', object: root, anchor: [xc, by + 0.05, 0.02], persist: false, verbOn: 'Put in the', verbOff: 'Pull out the', sound: 'click', radius: 1.3 }));
  return { hot: hotT, cold: coldT, plug, stream, pool, slot, mouth, basinY: by + wall / 2, root, S, stopper, maxLevel: depth - 0.05,
    get running() { return hotT.on || coldT.on; }, get isHot() { return hotT.on; } };
}

// ------------------------------------------------------------------ under-counter beverage fridge
function bevFridge(b, M, sys, { id, root, xc, x0, fz, w, d, h, game }) {
  const ih = h - 0.16, y0 = 0.1, t = 0.025, inner = d - 0.06;
  const liner = new THREE.MeshStandardNodeMaterial({ color: 0x23272b, roughness: 0.5 });
  b.box(liner, [xc, y0 + ih / 2, -d / 2 + 0.03], [w - 0.02, ih, 0.02], { parent: root, collide: false, cast: false });
  for (const s of [-1, 1]) b.box(liner, [xc + s * (w / 2 - 0.02), y0 + ih / 2, 0], [0.02, ih, inner], { parent: root, collide: false, cast: false });
  b.box(liner, [xc, y0 + 0.01, 0], [w - 0.02, 0.02, inner], { parent: root, collide: false, cast: false });
  b.box(liner, [xc, y0 + ih - 0.01, 0], [w - 0.02, 0.02, inner], { parent: root, collide: false, cast: false });
  // cool white LED along the top and two wire shelves
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.008, 0.02), M.lamp); lamp.position.set(xc, y0 + ih - 0.03, 0.1); root.add(lamp); lamp.visible = false;
  const light = new THREE.PointLight(0xdff2ff, 0, 1.2, 2); light.position.set(xc, y0 + ih - 0.1, 0.05); root.add(light);
  const shelfY = [y0 + 0.27, y0 + 0.52];
  for (const y of shelfY) for (let i = 0; i <= 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, inner - 0.04), M.stainless); r.position.set(xc - w / 2 + 0.05 + i * (w - 0.1) / 6, y, 0); root.add(r); }
  // rows of soda cans in bright colours (decor at the back)
  const cols = [0xD62828, 0x2A9D8F, 0xF4A261, 0x6A4C93, 0x1D70B8, 0xE9C46A];
  [y0 + 0.022, shelfY[0] + 0.003, shelfY[1] + 0.003].forEach((y, row) => { for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 14), new THREE.MeshStandardNodeMaterial({ color: cols[(i + row * 2) % 6], roughness: 0.3, metalness: 0.5 })); c.position.set(xc - 0.18 + i * 0.12, y + 0.06, -0.17); root.add(c); } });
  // glass door with a stainless frame, hinged on the left (x0) side
  const hinge = new THREE.Group(); hinge.position.set(x0 + 0.004, y0, fz); root.add(hinge);
  const dw = w - 0.008, fw = 0.045;
  const fr = (x, y, ww, hh) => b.box(M.stainless, [x, y, 0.015], [ww, hh, 0.03], { parent: hinge, collide: false });
  fr(dw / 2, fw / 2, dw, fw); fr(dw / 2, ih - fw / 2, dw, fw); fr(fw / 2, ih / 2, fw, ih); fr(dw - fw / 2, ih / 2, fw, ih);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(dw - 2 * fw, ih - 2 * fw), new THREE.MeshPhysicalNodeMaterial({ roughness: 0.05, transparent: true, opacity: 0.25, color: 0x9ab6c4, depthWrite: false }));
  glass.position.set(dw / 2, ih / 2, 0.02); hinge.add(glass);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ih * 0.6, 10), M.stainless); bar.position.set(dw - 0.03, ih / 2, 0.05); hinge.add(bar);
  const door = sys.add(new Hinge({ id: `${id}.door`, name: 'soda fridge', object: hinge, anchor: [dw * 0.7, ih * 0.6, 0.1], pivot: hinge, axis: 'y', angle: -100, duration: 0.5, sound: 'fridge', radius: 1.6,
    onChange: open => { lamp.visible = open; light.intensity = open ? 0.9 : 0; } }));
  const slots = [];
  shelfY.forEach((y, k) => { for (const dx of [-0.13, 0.0, 0.13]) slots.push(sys.addSlot(new Slot({ id: `${id}_s${k}_${slots.length}`, name: 'in the soda fridge', parent: root, pos: [xc + dx, y + 0.003, 0.05], enabled: () => door.openAmount > 0.6, accepts: it => it.tags.has('drink'), radius: 1.6 }))); });
  // a soft glow through the glass even when shut, so it reads as a drinks fridge
  const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.006, 0.01), M.ledStrip); glowStrip.position.set(xc, y0 + ih - 0.05, -d / 2 + 0.05); root.add(glowStrip);
  return { door, slots };
}

// ------------------------------------------------------------------ dishwasher (panel-ready)
function dishwasher(b, M, sys, { id, root, xc, fz, w, d, h, game }) {
  const tubD = d - 0.08;
  b.box(M.stainless, [xc, h / 2 + 0.05, -0.02], [w - 0.02, h - 0.14, 0.01], { parent: root, collide: false, cast: false });   // back of the tub
  for (const s of [-1, 1]) b.box(M.stainless, [xc + s * (w / 2 - 0.015), h / 2 + 0.05, -0.02], [0.01, h - 0.14, tubD], { parent: root, collide: false, cast: false });
  b.box(M.stainless, [xc, 0.12, -0.02], [w - 0.02, 0.01, tubD], { parent: root, collide: false, cast: false });
  // door hinged at the bottom, panelled in sage like the cabinets
  const hinge = new THREE.Group(); hinge.position.set(xc, 0.11, fz); root.add(hinge);
  const dh = h - 0.14;
  shaker(b, M, hinge, [0, dh / 2, 0.011], w - 0.008, dh);
  b.box(M.stainless, [0, dh / 2, -0.01], [w - 0.04, dh - 0.04, 0.008], { parent: hinge, collide: false, cast: false });
  pull(M, hinge, [0, dh - 0.07, 0.022], 0.3);
  // control strip on the top edge of the door, with a status light
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.01), new THREE.MeshStandardNodeMaterial({ color: 0x222222 })); lamp.position.set(w * 0.3, dh + 0.003, -0.01); hinge.add(lamp);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 12), M.stainless); btn.position.set(w * 0.2, dh + 0.004, -0.01); hinge.add(btn);
  const door = sys.add(new Hinge({ id: `${id}.door`, name: 'dishwasher', object: hinge, anchor: [0, dh * 0.8, 0.12], pivot: hinge, axis: 'x', angle: 85, duration: 0.6, sound: 'oven' }));
  // racks slide out once the door is down
  const rack = (y, name, k) => {
    const part = new THREE.Group(); part.position.set(xc, y, -0.02); root.add(part);
    const wire = M.stainless;
    for (let i = 0; i <= 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, tubD - 0.06), wire); r.position.set(-w / 2 + 0.05 + i * (w - 0.1) / 6, 0, 0); part.add(r); }
    for (let i = 0; i <= 5; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.006, 0.006), wire); r.position.set(0, 0, -tubD / 2 + 0.03 + i * (tubD - 0.06) / 5); part.add(r); }
    for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.08, tubD - 0.06), wire); side.position.set(s * (w / 2 - 0.04), 0.04, 0); part.add(side); }
    const sl = sys.add(new Slide({ id: `${id}.${name}`, name: `${name} rack`, object: part, anchor: [0, 0.05, tubD / 2], part, dir: [0, 0, 1], distance: 0.42, sound: 'drawer' }));
    const v = sl.verb.bind(sl); sl.verb = s => door.openAmount > 0.8 ? v(s) : null;
    return { part, sl };
  };
  const lower = rack(0.2, 'bottom', 0), upper = rack(0.55, 'top', 1);
  // silverware basket (decor) on the lower rack
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.18), new THREE.MeshStandardNodeMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.5, wireframe: false })); basket.position.set(w / 2 - 0.12, 0.07, 0.1); lower.part.add(basket);
  const open = () => door.openAmount > 0.8 && lower.sl.t > 0.8;
  const slots = [-0.15, -0.05, 0.05, 0.15].map((x, k) => sys.addSlot(new Slot({ id: `${id}_plate_${k}`, name: 'in the dishwasher', parent: lower.part, pos: [x * (w / 0.6) * 0.8, 0.01, -0.05], enabled: open, accepts: it => it.tags.has('plate') || it.tags.has('fillable') || it.tags.has('washable') })));
  const S = { running: 0, done: false };
  const start = sys.add(new Toggle({ id: `${id}.start`, name: 'dishwasher', object: hinge, anchor: [w * 0.2, dh, 0.05], persist: false, verbOn: 'Start the', verbOff: 'Stop the', sound: 'click', radius: 1.5,
    requires: () => door.isOpen ? 'Close the dishwasher first' : null,
    onSet: (on, s) => { S.running = on ? 0.0001 : 0; S.done = false; lamp.material.color.set(on ? 0x2a7fff : 0x222222); if (on) s?.toast('Swish swish… washing the dishes.'); } }));
  const update = dt => {
    if (S.running > 0) {
      S.running += dt; game.audio?.houseLoop?.('dishwasher', true);
      if (S.running > 9) {
        S.running = 0; start.set(false, sys); S.done = true; lamp.material.color.set(0x2fd36a);
        for (const sl of slots) if (sl.item) { sl.item.state.clean = true; sl.item.state.fill = 0; sl.item.onState?.(); }
        sys.sfx('ding'); sys.toast('Ding! The dishes are sparkling clean.'); game.audio?.houseLoop?.('dishwasher', false);
      }
    }
  };
  return { door, lower, upper, slots, start, S, update };
}

// ------------------------------------------------------------------ microwave drawer
function microwaveDrawer(b, M, sys, { id, root, xc, fz, w, d, h, game }) {
  const mh = 0.38, yc = h - 0.06 - mh / 2;
  // fixed control panel above the drawer
  const panel = new THREE.Group(); panel.position.set(xc, h - 0.04, fz + 0.012); root.add(panel);
  b.box(M.stainless, [0, 0, 0], [w - 0.01, 0.05, 0.02], { parent: panel, collide: false });
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.022), new THREE.MeshStandardNodeMaterial({ color: 0x0b0f12 })); disp.position.set(-w * 0.25, 0, 0.011); panel.add(disp);
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.01), M.blackSteel); btn.position.set(w * 0.25, 0, 0.012); panel.add(btn);
  // the drawer itself: stainless front with a dark window, steel box inside
  const part = new THREE.Group(); part.position.set(xc, yc - 0.04, fz); root.add(part);
  b.box(M.stainless, [0, 0, 0.01], [w - 0.01, mh - 0.04, 0.02], { parent: part, collide: false, round: 0.004 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, mh * 0.45), new THREE.MeshStandardNodeMaterial({ color: 0x111417, roughness: 0.1 })); win.position.set(0, 0.02, 0.021); part.add(win);
  pull(M, part, [0, mh / 2 - 0.06, 0.02], w * 0.6, false, M.stainless);
  const depth = d - 0.1;
  b.box(M.stainless, [0, -mh / 2 + 0.05, -depth / 2], [w - 0.06, 0.01, depth], { parent: part, collide: false, cast: false });
  for (const s of [-1, 1]) b.box(M.stainless, [s * (w / 2 - 0.035), -mh / 2 + 0.12, -depth / 2], [0.01, 0.15, depth], { parent: part, collide: false, cast: false });
  b.box(M.stainless, [0, -mh / 2 + 0.12, -depth], [w - 0.06, 0.15, 0.01], { parent: part, collide: false, cast: false });
  const glow = new THREE.PointLight(0xfff1c8, 0, 0.8, 2); glow.position.set(0, -mh / 2 + 0.25, -depth / 2); part.add(glow);
  const drawer = sys.add(new Slide({ id: `${id}.drawer`, name: 'microwave drawer', object: part, anchor: [0, 0, 0.08], part, dir: [0, 0, 1], distance: 0.36, sound: 'drawer' }));
  const slot = sys.addSlot(new Slot({ id: `${id}_in`, name: 'in the microwave', parent: part, pos: [0, -mh / 2 + 0.056, -0.2], enabled: () => drawer.t > 0.8, accepts: it => it.tags.has('fillable') || it.tags.has('food') }));
  const S = { running: 0 };
  const start = sys.add(new Toggle({ id: `${id}.start`, name: 'microwave', object: panel, anchor: [w * 0.25, 0, 0.06], persist: false, verbOn: 'Start the', verbOff: 'Stop the', sound: 'click', radius: 1.4,
    requires: () => drawer.isOpen ? 'Close the microwave drawer first' : null,
    onSet: on => { S.running = on ? 0.0001 : 0; glow.intensity = on ? 0.6 : 0; disp.material.color.set(on ? 0x2a6b3a : 0x0b0f12); } }));
  const update = dt => {
    if (S.running > 0) {
      S.running += dt; game.audio?.houseLoop?.('microwave', true);
      if (S.running > 4) {
        S.running = 0; start.set(false, sys); game.audio?.houseLoop?.('microwave', false); sys.sfx('ding');
        const it = slot.item;
        if (it?.tags.has('fillable') && (it.state.fill || 0) > 0.1) { it.state.cocoa = true; it.onState?.(); sys.toast('Mmm, hot cocoa!'); }
        else if (it) { it.state.warm = true; sys.toast(`Warm ${it.name}!`); }
        else sys.toast('The microwave hummed, but nothing was inside.');
        sys.changed();
      }
    }
  };
  return { drawer, slot, start, S, update };
}

// ------------------------------------------------------------------ 48" professional range
export function buildRange(b, M, sys, { id, at, rotY = 0, game }) {
  const W = 1.22, D = 0.7, H = 0.92;
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const col = new THREE.Mesh(new THREE.BoxGeometry(W, H, D)); col.position.set(0, H / 2, 0); col.visible = false; root.add(col); b.solid(col, W, H, D);
  // body: sides, back, base, top deck, control panel and a divider between the ovens
  for (const s of [-1, 1]) b.box(M.stainless, [s * (W / 2 - 0.01), H / 2, 0], [0.02, H, D], { parent: root, collide: false });
  b.box(M.stainless, [0, H / 2, -D / 2 + 0.01], [W, H, 0.02], { parent: root, collide: false });
  b.box(M.stainless, [0, 0.05, D / 2 - 0.02], [W, 0.1, 0.04], { parent: root, collide: false });     // kick plate
  b.box(M.stainless, [0, H - 0.015, 0], [W, 0.03, D], { parent: root, collide: false });
  b.box(M.stainless, [0, H - 0.08, D / 2 - 0.01], [W, 0.12, 0.05], { parent: root, collide: false, round: 0.01 });   // control panel
  b.box(M.stainless, [0, H + 0.11, -D / 2 + 0.03], [W, 0.22, 0.05], { parent: root, collide: false, round: 0.006 });  // backguard
  const ovenSplit = -W / 2 + 0.49;
  b.box(M.stainless, [ovenSplit, 0.45, 0], [0.02, 0.66, D - 0.04], { parent: root, collide: false });
  // ---- cooktop: two burners on the left, the griddle in the middle, two burners on the right
  const burners = [];
  const flameMat = (k) => { const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); m.colorNode = mix(vec3(0.2, 0.45, 1.6), vec3(1.4, 0.6, 0.15), smoothstep(0.5, 1.0, uv().y)).mul(sin(time.mul(23).add(k * 3.1)).mul(0.15).add(0.9)); return m; };
  const bpos = [[-0.42, -0.14, 'back-left'], [-0.42, 0.14, 'front-left'], [0.42, -0.14, 'back-right'], [0.42, 0.14, 'front-right']];
  for (const [k, [x, z, name]] of bpos.entries()) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.025, 20), M.castIron); base.position.set(x, H + 0.012, z); root.add(base);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 18), M.castIron); cap.position.set(x, H + 0.03, z); root.add(cap);
    // ring of flame tongues
    const fl = new THREE.Group(); fl.position.set(x, H + 0.03, z); fl.visible = false; root.add(fl);
    const mat = flameMat(k);
    for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 5, 1, true), mat); const a = (i / 14) * Math.PI * 2; c.position.set(Math.cos(a) * 0.055, 0.015, Math.sin(a) * 0.055); c.rotation.z = -Math.cos(a) * 0.5; c.rotation.x = Math.sin(a) * 0.5; fl.add(c); }
    burners.push({ x, z, name, fl, flame: 0 });
  }
  // heavy cast-iron grates over each pair of burners
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.42, H + 0.055, 0); root.add(g);
    for (const xx of [-0.17, 0, 0.17]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.6), M.castIron); bar.position.x = xx; g.add(bar); }
    for (const zz of [-0.28, -0.14, 0, 0.14, 0.28]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.018), M.castIron); bar.position.z = zz; g.add(bar); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  // griddle: dark seasoned steel plate with a grease trough
  const griddleMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.7, color: 0x3a3836 });
  const griddleHeat = uniform(0);
  griddleMat.emissiveNode = vec3(0.9, 0.25, 0.05).mul(griddleHeat).mul(0.25);
  const griddle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.52), griddleMat); griddle.position.set(0, H + 0.01, -0.02); root.add(griddle); griddle.receiveShadow = true;
  b.box(M.stainless, [0, H + 0.015, 0.26], [0.42, 0.03, 0.03], { parent: root, collide: false });
  // ---- knobs on the front panel (red, like the reference)
  const knobs = [];
  const knobX = [-0.5, -0.36, -0.2, 0, 0.2, 0.36, 0.5];
  for (const x of knobX) {
    const g = new THREE.Group(); g.position.set(x, H - 0.08, D / 2 + 0.018); root.add(g);
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 20), M.stainless); bezel.rotation.x = Math.PI / 2; g.add(bezel);
    const k = new THREE.Group(); k.position.z = 0.018; g.add(k);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.03, 18), M.redKnob); body.rotation.x = Math.PI / 2; k.add(body);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.004), M.white); tick.position.set(0, 0.012, 0.016); k.add(tick);
    knobs.push(k);
  }
  // knob order: left burners (0,1), small oven (2), griddle (3), big oven (4), right burners (5,6)
  const knobFor = [0, 1, 5, 6];
  const out = { root, burners, slots: [], ovens: [] };
  for (const [k, br] of burners.entries()) {
    const dial = sys.add(new Dial({ id: `${id}.burner_${k}`, name: `${br.name} burner`, object: root, anchor: [br.x, H + 0.08, br.z], levels: ['off', 'low', 'medium', 'high'], part: knobs[knobFor[k]], partAxis: 'z', stepAngle: -70, radius: 1.5, sound: 'knob',
      verbs: (next, d) => next === 0 ? `Turn off the ${d.name}` : `${d.name[0].toUpperCase() + d.name.slice(1)}: ${d.levels[next]} flame`,
      onSet: (v, lvl, s) => { br.fl.visible = lvl > 0; br.fl.scale.set(1, 0.5 + lvl * 0.35, 1); if (lvl === 1) s?.sfx('ignite'); } }));
    br.dial = dial;
    out.slots.push(br.slot = sys.addSlot(new Slot({ id: `${id}_burner_${k}`, name: `on the ${br.name} burner`, parent: root, pos: [br.x, H + 0.066, br.z], accepts: it => it.tags.has('cookware'), radius: 1.6 })));
  }
  const gdial = sys.add(new Dial({ id: `${id}.griddle`, name: 'griddle', object: root, anchor: [0, H + 0.05, -0.02], levels: ['off', 'on'], part: knobs[3], partAxis: 'z', stepAngle: -90, radius: 1.5,
    verbs: next => next ? 'Heat up the griddle' : 'Turn off the griddle', onSet: (v, lvl) => { griddleHeat.value = lvl; } }));
  out.griddle = gdial; out.griddleHeat = griddleHeat;
  out.slots.push(out.griddleSlot = sys.addSlot(new Slot({ id: `${id}_griddle`, name: 'on the griddle', parent: root, pos: [0, H + 0.021, -0.02], accepts: it => it.tags.has('food') || it.tags.has('cookware'), radius: 1.6 })));
  // ---- ovens: small on the left, large on the right; doors hinge at the bottom
  const oven = (x0, x1, name, knob, key) => {
    const w = x1 - x0, xc = (x0 + x1) / 2, oh = 0.62, oy = 0.11;
    b.box(M.dark, [xc, oy + oh / 2, -0.03], [w - 0.03, oh - 0.02, D - 0.1], { parent: root, collide: false, cast: false });
    const glow = new THREE.PointLight(0xff9a50, 0, 1.4, 2); glow.position.set(xc, oy + oh / 2, 0); root.add(glow);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(Math.min(0.16, w * 0.3), 0.007, 6, 32), new THREE.MeshStandardNodeMaterial({ color: 0x3a2a22 }));
    coil.rotation.x = Math.PI / 2; coil.position.set(xc, oy + oh - 0.05, -0.05); root.add(coil);
    // rack on rails (slides out when the door is down)
    const rk = new THREE.Group(); rk.position.set(xc, oy + 0.24, -0.04); root.add(rk);
    for (let i = 0; i <= 8; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, D - 0.16), M.stainless); r.position.x = -w / 2 + 0.04 + i * (w - 0.08) / 8; rk.add(r); }
    for (const zz of [-(D - 0.16) / 2, (D - 0.16) / 2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.008, 0.008), M.stainless); r.position.z = zz; rk.add(r); }
    const hinge = new THREE.Group(); hinge.position.set(xc, oy, D / 2); root.add(hinge);
    b.box(M.stainless, [0, oh / 2, 0.015], [w - 0.012, oh, 0.03], { parent: hinge, collide: false, round: 0.008 });
    b.box(M.ovenGlass, [0, oh / 2 - 0.02, 0.031], [w - 0.16, oh * 0.5, 0.004], { parent: hinge, collide: false, cast: false });
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, w - 0.12, 12), M.stainless); hb.rotation.z = Math.PI / 2; hb.position.set(0, oh - 0.07, 0.075); hinge.add(hb);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.05), M.stainless); p.position.set(s * (w / 2 - 0.08), oh - 0.07, 0.05); hinge.add(p); }
    const door = sys.add(new Hinge({ id: `${id}.${key}_door`, name, object: hinge, anchor: [0, oh * 0.55, 0.14], pivot: hinge, axis: 'x', angle: 85, duration: 0.55, sound: 'oven' }));
    const rack = sys.add(new Slide({ id: `${id}.${key}_rack`, name: `${name} rack`, object: rk, anchor: [0, 0.02, (D - 0.16) / 2], part: rk, dir: [0, 0, 1], distance: 0.3, sound: 'drawer', radius: 1.4 }));
    const rv = rack.verb.bind(rack); rack.verb = s => door.openAmount > 0.8 ? rv(s) : null;
    const slot = sys.addSlot(new Slot({ id: `${id}_${key}_rack`, name: `in the ${name}`, parent: rk, pos: [0, 0.006, 0], enabled: () => door.openAmount > 0.7, accepts: it => it.tags.has('bakeable') || it.tags.has('cookware') }));
    const state = { baking: 0, total: 6 };
    const kn = sys.add(new Toggle({ id: `${id}.${key}_knob`, name, object: root, anchor: [knobX[knob], H - 0.08, D / 2 + 0.06], part: knobs[knob], partAxis: 'z', partAngle: -120, persist: false, radius: 1.4,
      verbOn: 'Bake in the', verbOff: 'Turn off the', sound: 'knob',
      requires: () => door.isOpen ? `Close the ${name} door first` : (!slot.item ? `Put something in the ${name} to bake` : null),
      onSet: (on, s) => { state.baking = on ? 0.0001 : 0; if (on) s?.toast('Baking… wait for the ding!'); } }));
    const o = { door, knob: kn, slot, glow, coil, state, rack };
    out.ovens.push(o); return o;
  };
  out.small = oven(-W / 2 + 0.03, ovenSplit - 0.01, 'small oven', 2, 'small');
  out.big = oven(ovenSplit + 0.01, W / 2 - 0.03, 'big oven', 4, 'big');
  out.D = D; out.H = H;
  return out;
}

// ------------------------------------------------------------------ copper hood
export function buildHood(b, M, sys, { id, at, w = 1.5, d = 0.62, bottom = 1.62, ceiling = 3.8 }) {
  const root = new THREE.Group(); root.position.copy(at); b.root.add(root);
  // lower band
  b.box(M.copper, [0, bottom + 0.07, 0], [w, 0.14, d], { parent: root, collide: false, round: 0.01 });
  // flared bell: a 4-sided frustum stretched to the hood's width and depth
  const bellH = 0.95, topW = w * 0.6, rb = 1, rt = topW / w;
  const bell = new THREE.CylinderGeometry(rt, rb, bellH, 4, 1, true); bell.rotateY(Math.PI / 4);
  bell.scale(w / Math.SQRT2 / 1, 1, d / Math.SQRT2);
  const bellMesh = new THREE.Mesh(bell, M.copper); bellMesh.position.set(0, bottom + 0.14 + bellH / 2, 0); root.add(bellMesh); bellMesh.castShadow = true;
  bellMesh.material.side = THREE.DoubleSide;
  // chimney up to the ceiling
  const chH = ceiling - (bottom + 0.14 + bellH);
  b.box(M.copper, [0, ceiling - chH / 2, -d * 0.2], [topW, chH, d * 0.6], { parent: root, collide: false });
  // rivet straps on the front
  for (const x of [-w * 0.28, w * 0.28]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, bellH * 1.01, 0.006), M.copper); strap.position.set(x * 0.8, bottom + 0.14 + bellH / 2, d / 2 - (d / 2 - d * rt / 2) * 0.5); strap.rotation.x = Math.atan2(d / 2 * (1 - rt), bellH); root.add(strap);
  }
  const rivetMat = M.bronze;
  for (let i = 0; i < 12; i++) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), rivetMat); r.position.set(-w / 2 + 0.06 + i * (w - 0.12) / 11, bottom + 0.07, d / 2 + 0.004); root.add(r); }
  // underside: steel baffle filters + a warm light
  b.box(M.stainless, [0, bottom + 0.005, 0], [w - 0.1, 0.01, d - 0.1], { parent: root, collide: false, cast: false });
  for (let i = 0; i < 3; i++) b.box(M.blackSteel, [-w / 3 + i * w / 3, bottom + 0.002, 0], [w / 3 - 0.06, 0.004, d - 0.16], { parent: root, collide: false, cast: false });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.004, 0.05), M.lamp); lamp.position.set(0, bottom - 0.002, d / 2 - 0.08); root.add(lamp); lamp.visible = false;
  const spot = new THREE.SpotLight(0xffd9a0, 0, 2.2, 1.0, 0.6, 1.5); spot.position.set(0, bottom, 0.05); spot.target.position.set(0, 0, 0.1); root.add(spot, spot.target);
  const light = sys.add(new Toggle({ id: `${id}.light`, name: 'hood light', object: root, anchor: [-w * 0.35, bottom + 0.05, d / 2 + 0.05], persist: true, radius: 1.8, sound: 'click',
    onSet: on => { lamp.visible = on; spot.intensity = on ? 3.5 : 0; } }));
  const fan = sys.add(new Dial({ id: `${id}.fan`, name: 'hood fan', object: root, anchor: [w * 0.35, bottom + 0.05, d / 2 + 0.05], levels: ['off', 'low', 'medium', 'high'], radius: 1.8, sound: 'click',
    verbs: next => next === 0 ? 'Turn off the hood fan' : `Hood fan: ${['', 'low', 'medium', 'high'][next]}` }));
  return { root, light, fan };
}

// ------------------------------------------------------------------ built-in column fridge / freezer
export function buildColumn(b, M, sys, { id, name, at, rotY = 0, w = 0.9, d = 0.72, h = 2.15, hingeRight = false, freezer = false, openAngle = 110, game }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const t = 0.04;
  // case (hidden behind the sage panels) and the bright interior
  b.box(M.sage, [0, h / 2, -d / 2 + t / 2], [w, h, t], { parent: root, collide: false });
  for (const s of [-1, 1]) b.box(M.sage, [s * (w / 2 - t / 2), h / 2, 0], [t, h, d], { parent: root, collide: false });
  b.box(M.sage, [0, h - t / 2, 0], [w, t, d], { parent: root, collide: false });
  b.box(M.blackWood, [0, 0.05, 0], [w, 0.1, d - 0.06], { parent: root, collide: false });
  const liner = freezer ? 0xE6EEF3 : 0xF4F6F4;
  const lm = new THREE.MeshStandardNodeMaterial({ color: liner, roughness: 0.5 });
  b.box(lm, [0, h / 2 + 0.05, -d / 2 + t + 0.005], [w - 2 * t, h - 0.2, 0.01], { parent: root, collide: false, cast: false });
  for (const s of [-1, 1]) b.box(lm, [s * (w / 2 - t - 0.005), h / 2 + 0.05, 0], [0.01, h - 0.2, d - 0.1], { parent: root, collide: false, cast: false });
  b.box(lm, [0, 0.12, 0], [w - 2 * t, 0.02, d - 0.08], { parent: root, collide: false, cast: false });
  const col = new THREE.Mesh(new THREE.BoxGeometry(w, h, d)); col.position.set(0, h / 2, 0); col.visible = false; root.add(col); b.solid(col, w, h, d);
  const shelfY = freezer ? [0.5, 0.95, 1.4] : [0.42, 0.82, 1.22, 1.62];
  for (const y of shelfY) b.box(M.clearGlass, [0, y, -0.02], [w - 2 * t - 0.02, 0.012, d - 0.14], { parent: root, collide: false, cast: false });
  if (!freezer) b.box(M.clearGlass, [0, 0.24, 0.0], [w - 2 * t - 0.04, 0.18, d - 0.16], { parent: root, collide: false, cast: false });   // crisper
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.012, 0.04), M.lamp); lamp.position.set(0, h - 0.08, -0.05); root.add(lamp); lamp.visible = false;
  const light = new THREE.PointLight(freezer ? 0xdff0ff : 0xfff2dc, 0, 2.0, 2); light.position.set(0, h - 0.25, 0.1); root.add(light);
  // full-height sage door with a long bronze pull
  const hx = hingeRight ? w / 2 : -w / 2, sgn = hingeRight ? -1 : 1;
  const hinge = new THREE.Group(); hinge.position.set(hx, 0, d / 2); root.add(hinge);
  shaker(b, M, hinge, [sgn * w / 2, 0.1 + (h - 0.12) / 2, 0.025], w - 0.008, h - 0.12, M.sage, 0.09);
  b.box(lm, [sgn * w / 2, 0.1 + (h - 0.12) / 2, -0.008], [w - 0.06, h - 0.2, 0.02], { parent: hinge, collide: false, cast: false });
  pull(M, hinge, [sgn * (w - 0.07), h * 0.52, 0.04], 0.7, true);
  // door bins on the inside
  const binYs = freezer ? [0.6, 1.2] : [0.55, 1.0, 1.45];
  for (const y of binYs) {
    b.box(M.clearGlass, [sgn * w / 2, y, -0.075], [w - 0.18, 0.012, 0.1], { parent: hinge, collide: false, cast: false });
    b.box(M.clearGlass, [sgn * w / 2, y + 0.05, -0.125], [w - 0.18, 0.1, 0.008], { parent: hinge, collide: false, cast: false });
  }
  const door = sys.add(new Hinge({ id: `${id}.door`, name, object: hinge, anchor: [sgn * w * 0.8, 1.1, 0.12], pivot: hinge, axis: 'y', angle: sgn * -openAngle, duration: 0.65, sound: 'fridge', radius: 2.0,
    onChange: open => { lamp.visible = open; light.intensity = open ? 1.8 : 0; } }));
  const open = () => door.openAmount > 0.6;
  const slots = [];
  shelfY.forEach((y, k) => { for (const x of [-0.2, 0.2]) slots.push(sys.addSlot(new Slot({ id: `${id}_s${k}_${x > 0 ? 'r' : 'l'}`, name: `in the ${name}`, parent: root, pos: [x, y + 0.008, -0.04], enabled: open, accepts: it => it.tags.has('food') || it.tags.has('drink'), radius: 1.9 }))); });
  binYs.forEach((y, k) => slots.push(sys.addSlot(new Slot({ id: `${id}_bin${k}`, name: `in the ${name} door`, parent: hinge, pos: [sgn * w * 0.5, y + 0.007, -0.075], enabled: open, accepts: it => it.tags.has('drink') || it.tags.has('food'), radius: 1.9 }))));
  // cold mist rolls out of the freezer while it's open
  const update = dt => {
    if (freezer && door.openAmount > 0.5 && game?.fxFoam && Math.random() < 0.35) {
      root.updateWorldMatrix(true, false);
      const p = V3((Math.random() - 0.5) * w * 0.7, 0.4 + Math.random() * 1.4, d / 2).applyMatrix4(root.matrixWorld);
      const v = V3(0, -0.15, 0.25).transformDirection(root.matrixWorld).multiplyScalar(0.3);
      game.fxFoam.emit(p, v, { life: 1.6, size: 0.18, grow: 1.2, alpha: 0.18, color: [0.9, 0.96, 1] });
    }
  };
  return { root, door, slots, update };
}

// ------------------------------------------------------------------ glass-front upper cabinets with dishes
export function glassUppers(b, M, sys, { id, at, rotY = 0, w = 1.6, d = 0.36, h = 1.05 }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  b.box(M.sage, [w / 2, h + 0.03, 0.01], [w + 0.05, 0.06, d + 0.05], { parent: root, collide: false, round: 0.01 });   // crown
  b.box(M.sage, [w / 2, -0.02, 0], [w + 0.02, 0.04, d], { parent: root, collide: false });
  for (const x of [0.01, w - 0.01]) b.box(M.sage, [x, h / 2, 0], [0.02, h, d], { parent: root, collide: false });
  b.box(new THREE.MeshStandardNodeMaterial({ color: 0x8E9C80, roughness: 0.7 }), [w / 2, h / 2, -d / 2 + 0.01], [w, h, 0.02], { parent: root, collide: false, cast: false });
  const shelfY = [h * 0.36, h * 0.69];
  for (const y of shelfY) b.box(M.sage, [w / 2, y, 0], [w - 0.03, 0.02, d - 0.04], { parent: root, collide: false, cast: false });
  // warm under-cabinet light strip (switched with the under-cabinet lights)
  const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.01, 0.03), M.ledStrip); strip.position.set(w / 2, -0.045, d / 2 - 0.06); root.add(strip);
  // dishes on display: stacks of plates and bowls (decor)
  const plateMat = M.white;
  const plates = (x, y, n) => { for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.012, 24), plateMat); p.position.set(x, y + 0.012 + i * 0.014, -0.02); root.add(p); } };
  const bowls = (x, y, n) => { for (let i = 0; i < n; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.06, 20, 1, true), plateMat); p.material.side = THREE.DoubleSide; p.position.set(x, y + 0.04 + i * 0.03, -0.02); root.add(p); } };
  plates(w * 0.25, 0, 6); bowls(w * 0.72, 0, 4); plates(w * 0.7, shelfY[0], 4); bowls(w * 0.3, shelfY[1], 3);
  const n = 2, dw = w / n, doors = [];
  for (let k = 0; k < n; k++) {
    const left = k === 0;
    const hinge = new THREE.Group(); hinge.position.set(left ? 0.01 : w - 0.01, 0, d / 2); root.add(hinge);
    const sgn = left ? 1 : -1, fw = 0.05;
    const frame = (x, y, ww, hh) => b.box(M.sage, [x, y, 0.012], [ww, hh, 0.024], { parent: hinge, collide: false });
    frame(sgn * dw / 2, fw / 2, dw - 0.01, fw); frame(sgn * dw / 2, h - fw / 2, dw - 0.01, fw);
    frame(sgn * fw / 2, h / 2, fw, h); frame(sgn * (dw - 0.01 - fw / 2), h / 2, fw, h);
    b.box(M.clearGlass, [sgn * dw / 2, h / 2, 0.012], [dw - 2 * fw, h - 2 * fw, 0.004], { parent: hinge, collide: false, cast: false });
    pull(M, hinge, [sgn * (dw - 0.06), 0.14, 0.02], 0.1, true);
    doors.push(sys.add(new Hinge({ id: `${id}_${k}`, name: 'glass cupboard', object: hinge, anchor: [sgn * dw * 0.6, h * 0.35, 0.1], pivot: hinge, axis: 'y', angle: sgn * -100, duration: 0.5, sound: 'cupboard', radius: 2.1 })));
  }
  const open = () => doors.some(dd => dd.openAmount > 0.6);
  const slots = [0, 1].map(k => sys.addSlot(new Slot({ id: `${id}_slot${k}`, name: 'in the glass cupboard', parent: root, pos: [w * (k ? 0.75 : 0.25), shelfY[k] + 0.012, 0.02], enabled: open, radius: 2.1 })));
  return { root, doors, slots, strip };
}

// ------------------------------------------------------------------ furniture
/** round natural-oak table on four tapered splayed legs (like the family's table) */
export function roundTable(b, M, { at, r = 0.58, h = 0.75 }) {
  const root = new THREE.Group(); root.position.copy(at); b.root.add(root);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 0.01, 0.04, 48), M.whiteOak); top.position.y = h - 0.02; top.castShadow = top.receiveShadow = true; root.add(top);
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.07, 32, 1, true), M.whiteOak); apron.position.y = h - 0.075; root.add(apron);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.018, h - 0.04, 12), M.whiteOak);
    leg.position.set(Math.cos(a) * r * 0.42, (h - 0.04) / 2, Math.sin(a) * r * 0.42);
    leg.rotation.z = Math.cos(a) * -0.1; leg.rotation.x = Math.sin(a) * 0.1; leg.castShadow = true; root.add(leg);
  }
  const c = new THREE.Mesh(); c.visible = false; c.position.set(0, h / 2, 0); root.add(c); b.solid(c, r * 1.5, h, r * 1.5);
  return root;
}

/** black wooden ladder-back chair; front faces +z */
export function ladderChair(b, M, { at, rotY = 0 }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const mat = M.blackWood, sw = 0.44, sd = 0.42, sh = 0.46;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.035, sd), mat); seat.position.y = sh; root.add(seat);
  for (const [x, z] of [[-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, sh, 8), mat); l.position.set(x * (sw / 2 - 0.03), sh / 2, z * (sd / 2 - 0.03)); l.rotation.x = z * 0.05; root.add(l); }
  for (const x of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.95, 8), mat); p.position.set(x * (sw / 2 - 0.03), 0.475, -sd / 2 + 0.03); p.rotation.x = -0.08; root.add(p); }
  for (const y of [0.68, 0.8, 0.9]) { const s = new THREE.Mesh(new THREE.BoxGeometry(sw - 0.04, 0.05, 0.02), mat); s.position.set(0, y, -sd / 2 + 0.01 - (y - 0.46) * 0.08); root.add(s); }
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const c = new THREE.Mesh(); c.visible = false; c.position.set(0, 0.45, 0); root.add(c); b.solid(c, sw, 0.9, sd);
  return root;
}

/** counter-height stool: black steel frame, woven seat */
export function counterStool(b, M, { at, rotY = 0 }) {
  const root = new THREE.Group(); root.position.copy(at); root.rotation.y = rotY; b.root.add(root);
  const sh = 0.66;
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.06, 24), M.rattan); seat.position.y = sh; root.add(seat);
  // low hoop backrest at the back edge (local -z)
  const back = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 8, 24, Math.PI), M.blackSteel); back.position.set(0, sh + 0.02, -0.16); back.rotation.x = -0.15; root.add(back);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), M.rattan); pad.position.set(0, sh + 0.12, -0.17); pad.rotation.x = -0.15; root.add(pad);
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, sh, 8), M.blackSteel); l.position.set(Math.cos(a) * 0.16, sh / 2, Math.sin(a) * 0.16); l.rotation.z = -Math.cos(a) * 0.06; l.rotation.x = Math.sin(a) * 0.06; root.add(l); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.009, 6, 24), M.blackSteel); ring.rotation.x = Math.PI / 2; ring.position.y = 0.24; root.add(ring);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const c = new THREE.Mesh(); c.visible = false; c.position.set(0, sh / 2, 0); root.add(c); b.solid(c, 0.36, sh, 0.36);
  return root;
}

/** black metal cylinder pendant with a warm glowing filament */
export function pendant(b, M, { at, drop = 1.3, ceiling }) {
  const root = new THREE.Group(); root.position.copy(at); b.root.add(root);
  const y = ceiling - drop;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, drop, 6), M.blackSteel); cord.position.y = ceiling - drop / 2; root.add(cord);
  const cage = new THREE.Group(); cage.position.y = y - 0.2; root.add(cage);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.42, 0.008), M.blackSteel); bar.position.set(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075); cage.add(bar); }
  for (const yy of [-0.2, -0.07, 0.07, 0.2]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.005, 6, 24), M.blackSteel); r.rotation.x = Math.PI / 2; r.position.y = yy; cage.add(r); }
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 12), M.lamp); cage.add(bulb);
  const light = new THREE.PointLight(0xffc27a, 0, 6, 1.6); light.position.y = y - 0.25; root.add(light);
  return { root, light, bulb };
}
