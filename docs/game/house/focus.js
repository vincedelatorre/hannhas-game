// First-person interaction ("focus") mode.
//
// When Wren opens a storage space or steps up to a station, the camera glides from the
// third-person follow view to a first-person close-up of the real 3D contents. The mouse (or a
// finger) then hovers and clicks the actual objects:
//   hover        outline + name + what a click will do
//   left click   pick up / put down / use / combine with what you hold
//   right click  inspect: the object turns in front of you with its details (wheel to zoom)
//   Esc / Done / any move key: step back to exploring (doors stay as you left them)
// The same objects, slots and actions as third person are used, so nothing is duplicated.
import * as THREE from 'three/webgpu';
import { Item, Interactable, CLIP_RANGES } from './interact.js';
import { uniform, positionLocal, normalLocal, color, float } from 'three/tsl';

/**
 * Hover highlight that follows the object's real silhouette: a thin back-face shell pushed out along
 * the normals (a crisp gold rim) plus a wider, fainter one (the soft glow). Fades in and out in ~150 ms.
 * The shells share the object's own geometry, never take part in picking, and are removed on exit.
 */
class Glow {
  constructor() { this.cur = null; this.fading = []; }
  make(obj) {
    const set = { obj, op: uniform(0), want: 1, hulls: [] };
    obj.updateWorldMatrix(true, true);
    const ws = new THREE.Vector3();
    obj.traverse(m => {
      if (!m.isMesh || m.userData.glowHull || !m.visible || m.isSkinnedMesh || m.isInstancedMesh || !m.geometry?.attributes?.normal) return;
      m.getWorldScale(ws); const sc = Math.max(1e-4, (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3);
      for (const [t, k] of [[0.0055, 1], [0.016, 0.28]]) {
        const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide });
        mat.colorNode = color(k === 1 ? 0xFFE7A0 : 0xFFF4D6); mat.opacityNode = set.op.mul(float(k));
        mat.positionNode = positionLocal.add(normalLocal.mul(uniform(t / sc)));   // a uniform, so every hover reuses the same two shaders
        const h = new THREE.Mesh(m.geometry, mat); h.userData.glowHull = true; h.raycast = () => {}; h.renderOrder = 18; h.castShadow = h.receiveShadow = false;
        m.add(h); set.hulls.push(h);
      }
    });
    return set;
  }
  set(obj) {
    if (this.cur?.obj === obj) return;
    if (this.cur) { this.cur.want = 0; this.fading.push(this.cur); }
    this.cur = obj ? this.make(obj) : null;
  }
  update(dt) {
    const k = Math.min(1, dt * 14);
    for (const s of [this.cur, ...this.fading]) if (s) s.op.value += (s.want - s.op.value) * k;
    this.fading = this.fading.filter(s => { if (s.op.value > 0.02) return true; for (const h of s.hulls) { h.parent?.remove(h); h.material.dispose(); } return false; });
  }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const REACH = 1.6;    // 5 ft around the character, measured flat so high and low shelves both count
const _b = new THREE.Box3(), _v = new THREE.Vector3(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

export class Focus {
  constructor(H) {
    this.H = H; this.sys = H.sys; this.game = H.game;
    this.view = null; this.mouse = { x: -1, y: -1, inside: false }; this.hover = null; this.inspecting = null; this.zoom = 0;
    this.stations = new Set();
    // outline box for the hovered object
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicNodeMaterial({ color: 0xFFE08A, transparent: true, opacity: 0.95, depthTest: false }));
    this.outline.renderOrder = 20; this.outline.visible = false; this.game.scene.add(this.outline);
    this.glow = new Glow();
    // UI
    this.bar = document.getElementById('focus-bar'); this.barTitle = document.getElementById('focus-title'); this.barHint = document.getElementById('focus-hint');
    this.label = document.getElementById('focus-label'); this.card = document.getElementById('inspect-card');
    document.getElementById('focus-done')?.addEventListener('click', () => this.exit());
    // a little stage in front of the camera for inspecting objects
    this.stage = new THREE.Group(); this.game.camera.add(this.stage); this.stage.position.set(0, -0.02, -0.42);
    const key = new THREE.PointLight(0xffffff, 0, 2, 2); key.position.set(0.3, 0.3, 0.2); this.stage.add(key); this.stageLight = key;
  }

  // ------------------------------------------------------------------ views
  /**
   * a view looks at `at` (object-local) from `dist` metres along the object's local `n` and
   * `up` metres above it. `name` shows in the bar. radius: how far from `at` things are clickable.
   */
  static view(obj, { at = [0, 0, 0], n = [0, 0, 1], dist = 0.9, up = 0.35, name, radius = 1.0, fov = 55, lookUp = 0 }) {
    return () => {
      obj.updateWorldMatrix(true, false);
      const look = V3(...at).applyMatrix4(obj.matrixWorld);
      const dir = V3(...n).transformDirection(obj.matrixWorld); dir.y = 0; dir.normalize();
      const pos = look.clone().addScaledVector(dir, dist); pos.y += up;
      look.y += lookUp;
      return { pos, look, fov, name, radius };
    };
  }
  /** an interactable opens a focus view when used (e.g. opening the fridge) */
  attach(x, viewFn, { onOpenOnly = true } = {}) {
    x.focusView = viewFn;
    const run0 = x.verb.bind(x);
    x.verb = s => {
      const v = run0(s); if (!v || v.disabled) return v;
      const opening = onOpenOnly ? !(x.isOpen) : true;
      if (!opening) return v;
      return { ...v, run: sys => { v.run(sys); if (!this.free) this.enter(viewFn, x); } };
    };
  }
  /** a standing spot ("Cook at the range") that only opens a view */
  station(id, name, label, obj, anchor, viewFn, radius = 1.6) {
    const st = new Interactable({ id, name, object: obj, anchor, radius, save: false });
    st.verb = () => this.view ? null : { label, clip: null, run: () => this.enter(viewFn, st) };
    st.isStation = true; this.stations.add(st); this.sys.add(st); return st;
  }

  enter(viewFn, src) {
    const g = this.game;
    if (g.seated) return;
    const v = viewFn(); v.fn = viewFn; v.src = src;
    this.view = v; g.focus = { pos: v.pos.clone(), look: v.look.clone(), fov: v.fov };
    this.zoom = 0;
    // face the thing
    const P = g.player; const d = v.look.clone().sub(P.pos); P.face = Math.atan2(d.x, d.z);
    document.body.classList.add('focus');
    this.bar.hidden = false; this.barTitle.textContent = v.name || 'Take a look';
    this.barHint.textContent = matchMedia('(pointer: coarse)').matches ? 'Tap something to use it · Done to step back' : 'Click something to use it · Right-click to look closer · Esc to step back';
    this.sys.sfx('click');
  }
  exit() {
    if (!this.view) return;
    this.endInspect();
    this.view = null; this.game.focus = null; this.hover = null; this.glow.set(null);
    this.outline.visible = false; this.label.hidden = true; this.bar.hidden = true;
    document.body.classList.remove('focus');
  }
  get active() { return !!this.view; }

  // ------------------------------------------------------------------ input
  pointer(x, y, inside = true) { this.mouse = { x, y, inside }; }
  /** the free hand cursor (Tab in first person) picks with the same rules anywhere in the world */
  get picking() { return !!this.view || this.free; }
  click(button) {
    if (!this.picking) return false;
    if (this.inspecting) { this.endInspect(); return true; }
    const h = this.hover;
    if (button === 2) { if (h?.item) this.inspect(h.item); return true; }
    if (!h || !h.v) return true;
    if (h.v.disabled) { h.v.run(this.sys); return true; }
    const wr = this.game.wren;
    if (h.v.clip && !wr.busy) wr.play(h.v.clip, CLIP_RANGES[h.v.clip] || {});
    h.v.run(this.sys); this.sys.changed();
    return true;
  }
  wheel(d) {
    if (!this.view) return false;
    if (this.inspecting) { this.inspectZoom = THREE.MathUtils.clamp((this.inspectZoom || 0) + d * 0.02, -0.18, 0.15); return true; }
    this.zoom = THREE.MathUtils.clamp(this.zoom + d * 0.03, -0.35, 0.5); return true;
  }

  // ------------------------------------------------------------------ inspect
  inspect(item) {
    this.endInspect();
    const clone = item.object.clone(true);
    const strip = []; clone.traverse(o => { if (o.userData.glowHull) strip.push(o); }); strip.forEach(o => o.parent.remove(o));
    clone.position.set(0, 0, 0); clone.rotation.set(0.25, 0, 0); clone.scale.setScalar(item.baseScale || 1);
    _b.setFromObject(clone); const size = _b.getSize(_v); const k = 0.18 / Math.max(size.x, size.y, size.z, 0.02);
    clone.scale.multiplyScalar(k); _b.setFromObject(clone); const c = _b.getCenter(_v); clone.position.sub(c);
    const holder = new THREE.Group(); holder.add(clone); this.stage.add(holder);
    this.inspecting = { item, holder }; this.inspectZoom = 0; this.stageLight.intensity = 1.5;
    const s = item.state || {}, c2 = s.c || {};
    const rows = [];
    if (item.def) { const cat = { fruit: 'Fruit', veg: 'Vegetable', herb: 'Herb', dairy: 'Dairy & eggs', protein: 'Meat & fish', sauce: 'Sauce', drink: 'Drink', frozen: 'Frozen', pasta: 'Pasta', grain: 'Grain', baking: 'Baking', oil: 'Oil & vinegar', canned: 'Canned', spice: 'Spice', snack: 'Snack', cutlery: 'Cutlery', utensil: 'Utensil', equipment: 'Equipment', linen: 'Linen', dish: 'Dish', glass: 'Glassware', cookware: 'Cookware' }[item.def && (this.H.itemDefs[item.def]?.cat)]; if (cat) rows.push(['Type', cat]); }
    if (s.qty !== undefined) rows.push(['Left', `${s.qty} ${item.unit || ''}`.trim()]);
    if (s.clean === false) rows.push(['State', 'needs washing']); else if (s.clean) rows.push(['State', 'clean']);
    if (s.chopped) rows.push(['State', 'chopped']);
    if (c2.water > 0.05) rows.push(['Water', `${c2.water.toFixed(1)} L · ${c2.stage || 'cold'}`]);
    if (c2.food?.length) rows.push(['Inside', `${c2.food[0].k} (${c2.food[0].st})`]);
    if (c2.mix) rows.push(['Inside', c2.mix.replace(/_/g, ' ')]);
    if (c2.dish) rows.push(['Dish', c2.dish.replace(/_/g, ' ')]);
    rows.push(['Where', this.H.whereIs(item)]);
    this.card.innerHTML = `<h3>${item.name}</h3>${rows.map(([a, b]) => `<p><b>${a}</b> ${b}</p>`).join('')}<small>Click or right-click to put it back</small>`;
    this.card.hidden = false;
  }
  endInspect() { if (!this.inspecting) return; this.stage.remove(this.inspecting.holder); this.inspecting = null; this.card.hidden = true; this.stageLight.intensity = 0; }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.game;
    this.glow.update(dt);
    if (!this.view) { if (this.inspecting) { const h = this.inspecting.holder; h.rotation.y += dt * 0.8; h.position.z = this.inspectZoom || 0; this.label.hidden = true; this.outline.visible = false; return; } if (this.free) this.pick(); else if (this.hover) this.setHover(null); return; }
    if (this.inspecting) { const h = this.inspecting.holder; h.rotation.y += dt * 0.8; h.position.z = this.inspectZoom || 0; this.label.hidden = true; this.outline.visible = false; return; }
    // the view follows its object (a drawer sliding, a door opening) and the zoom
    const v = this.view.fn(); const dir = v.pos.clone().sub(v.look); const len = dir.length();
    g.focus.pos.copy(v.look).addScaledVector(dir.normalize(), Math.max(0.35, len * (1 - this.zoom)));
    g.focus.look.copy(v.look); this.view.radius = v.radius;
    this.pick();
  }

  /** find what's under the mouse: items, slots (while holding), knobs and doors */
  pick() {
    const g = this.game, sys = this.sys, cam = g.camera, el = g.renderer.domElement, r = el.getBoundingClientRect();
    // centre pick: while the mouse steers the camera, whatever is in the middle of the view is selectable
    if (this.centerPick) this.mouse = { x: r.left + r.width / 2, y: r.top + r.height / 2, inside: true };
    if (!this.mouse.inside) { this.setHover(null); return; }
    const mx = this.mouse.x - r.left, my = this.mouse.y - r.top;
    const free = !this.view;
    // free picking reaches 5 ft (≈1.6 m) around the character's chest; close-ups use their own framing
    const look = free ? g.player.pos.clone().add(V3(0, 0.95, 0)) : (this.view.look || g.focus.look), R = free ? REACH : (this.view.radius || 1.0) + 0.3;
    let best = null, bd = (free ? (this.centerPick ? 60 : 44) : 52) * Math.max(0.8, r.width / 1400);
    const camPos = cam.position;
    // what's really under the cursor: a ray through the pixel against the nearby objects' meshes
    _ndc.set(mx / r.width * 2 - 1, -(my / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, cam);
    let rayHit = null, rayD = Infinity;
    for (const x of sys.list) {
      if (!(x instanceof Item) || x === sys.held || x.state.gone || x.flying || !x.object.visible) continue;
      x.object.getWorldPosition(_v); if ((free ? Math.hypot(_v.x - look.x, _v.z - look.z) : _v.distanceTo(look)) > R) continue;
      const hits = _ray.intersectObject(x.object, true);
      if (hits.length && hits[0].distance < rayD) { rayD = hits[0].distance; rayHit = x; }
    }
    if (rayHit && free && g.rayHit) { const h = g.rayHit(_ray.ray.origin, _ray.ray.direction, rayD); if (h && h.toi < rayD - 0.45) rayHit = null; }
    const blocked = (p) => {
      // walls, doors and counters in the way (free mode only; close-ups frame their own contents)
      if (!free || !g.rayHit) return false;
      const dir = p.clone().sub(camPos); const len = dir.length(); if (len < 0.5) return false;
      const h = g.rayHit(camPos, dir.divideScalar(len), len);
      return !!h && h.toi < len - 0.45;
    };
    const consider = (p, make, bias = 0) => {
      if ((free ? Math.hypot(p.x - look.x, p.z - look.z) : p.distanceTo(look)) > R) return;
      const s = p.clone().project(cam); if (s.z > 1) return;
      const sx = (s.x * 0.5 + 0.5) * r.width, sy = (-s.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - mx, sy - my) - bias; if (d >= bd) return;
      if (bias < 500 && blocked(p)) return;
      const h = make(); if (!h) return;
      bd = d; best = h;
    };
    const held = sys.held;
    for (const x of sys.list) {
      if (x === held || x.isStation) continue;
      if (x instanceof Item) {
        if (x.state.gone || x.flying || !x.object.visible) continue;
        if (x.slot && !x.slot.enabled()) continue;
        _b.setFromObject(x.object); if (_b.isEmpty()) continue;
        const c = _b.getCenter(V3(0, 0, 0));
        consider(c, () => {
          const v = held ? sys.combine?.(held, x) : x.verb(sys);
          return v ? { item: x, v, box: _b.clone() } : (held ? null : null);
        }, x === rayHit ? 1000 : 8);
      } else {
        if (['house_front_outside', 'house_front_inside'].includes(x.id)) continue;
        const a = x.anchor(V3(0, 0, 0));
        consider(a, () => { const v = x.verb(sys); return v ? { x, v, p: a } : null; });
      }
    }
    if (held) for (const s of sys.slots.values()) {
      if (s.item || !s.enabled() || !s.accepts(held)) continue;
      const p = s.world(V3(0, 0, 0));
      consider(p, () => ({ slot: s, p, v: { label: `Put ${held.name} ${s.name}`, clip: 'PickUp', run: () => sys.putIn(s) } }), -6);
    }
    this.setHover(best);
  }
  setHover(h) {
    this.hover = h;
    const el = this.game.renderer.domElement;
    if (!h) { this.outline.visible = false; this.glow.set(null); this.label.hidden = true; el.style.cursor = 'default'; this.sys.marker.visible = false; return; }
    el.style.cursor = h.v.disabled ? 'not-allowed' : 'pointer';
    // glow the thing itself (an item, a door, a knob); a free spot to put something gets a small sparkle
    let target = h.item?.object || (h.x && !h.v.disabled ? h.x.object : null);
    if (target && h.x) { _b.setFromObject(target); const sz = _b.getSize(_v); if (_b.isEmpty() || sz.length() > 2.6 || target === this.H.root) target = null; }
    this.outline.visible = false;
    this.glow.set(h.v.disabled ? null : target);
    if (target) this.sys.marker.visible = false;
    else { this.sys.marker.position.copy(h.p || (h.box ? h.box.getCenter(V3(0, 0, 0)) : this.sys.marker.position)); this.sys.marker.visible = true; this.sys.marker.scale.setScalar(0.07); }
    const name = h.item ? h.item.name : h.slot ? '' : h.x?.name || '';
    this.label.hidden = false;
    this.label.innerHTML = `${name ? `<b>${name[0].toUpperCase() + name.slice(1)}</b> · ` : ''}${h.v.label}${this.centerPick ? ' <i>click or E</i>' : h.item && !this.sys.held ? ' <i>right-click to look closer</i>' : ''}`;
    this.label.classList.toggle('disabled', !!h.v.disabled);
    const r = el.getBoundingClientRect();
    this.label.style.left = `${Math.min(r.width - 140, this.mouse.x + (this.centerPick ? 14 : 16))}px`; this.label.style.top = `${this.mouse.y + (this.centerPick ? 14 : 18)}px`;
    this.label.classList.toggle('center', !!this.centerPick);
  }
}
