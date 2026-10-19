// Reusable interaction system for the house (and later the whole island).
//
// Behaviours: Hinge (doors, fridge, oven), Slide (drawers), Toggle (taps, knobs, lamps),
// Item (anything you can pick up), Slot (places to put things), plus free-form
// interactables (activities). One button does the right thing: E (or the Use button)
// runs the best action for whatever is in front of Wren; Q puts down what she holds.
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ------------------------------------------------------------------ base
export class Interactable {
  constructor({ id, name, object, anchor = [0, 0, 0], radius = 1.8, save = true }) {
    this.id = id; this.name = name; this.object = object; this.radius = radius; this.saveable = save;
    this.anchorLocal = new THREE.Vector3(...anchor);
  }
  anchor(out = new THREE.Vector3()) { this.object.updateWorldMatrix(true, false); return out.copy(this.anchorLocal).applyMatrix4(this.object.matrixWorld); }
  /** the action offered right now, or null: { label, run(sys) } */
  verb(sys) { return null; }
  update(dt) {}
  save() { return undefined; }
  load(s) {}
}

// ------------------------------------------------------------------ hinged (doors, lids)
export class Hinge extends Interactable {
  /**
   * pivot: Object3D whose origin is ON the hinge line; it is rotated about `axis`
   * angle: opening angle in degrees (sign = direction)
   */
  constructor(opts) {
    super(opts);
    this.pivot = opts.pivot; this.axis = opts.axis || 'y'; this.angle = THREE.MathUtils.degToRad(opts.angle ?? 100);
    this.duration = opts.duration ?? 0.6; this.state = 'closed'; this.t = 0;
    this.collider = opts.collider || null;            // blocks the way only while closed
    this.onChange = opts.onChange || (() => {});
    this.verbOpen = opts.verbOpen || 'Open'; this.verbClose = opts.verbClose || 'Close';
    this.sound = opts.sound || 'door';
    this.requires = opts.requires || null;           // () => string | null (why it can't move)
  }
  get isOpen() { return this.state === 'open' || this.state === 'opening'; }
  get openAmount() { return ease(this.t); }
  set(open, sys) {
    const want = open ? 'opening' : 'closing';
    if ((open && this.isOpen) || (!open && !this.isOpen)) return;
    this.state = want; this.onChange(open); sys?.sfx(this.sound, open);
  }
  verb(sys) {
    const why = this.requires?.();
    if (why) return { label: why, run: () => sys.toast(why), disabled: true };
    return { label: `${this.isOpen ? this.verbClose : this.verbOpen} ${this.name}`, clip: 'OpenDoor', run: () => this.set(!this.isOpen, sys) };
  }
  update(dt) {
    const target = this.isOpen ? 1 : 0;
    if (this.t !== target) {
      this.t = THREE.MathUtils.clamp(this.t + Math.sign(target - this.t) * dt / this.duration, 0, 1);
      if (this.t === target) this.state = target ? 'open' : 'closed';
    }
    this.pivot.rotation[this.axis] = this.angle * ease(this.t);
    if (this.collider) this.collider.setEnabled(this.t < 0.15);
  }
  save() { return this.isOpen ? 'open' : 'closed'; }
  load(s) { this.state = s === 'open' ? 'open' : 'closed'; this.t = s === 'open' ? 1 : 0; this.update(0); this.onChange(this.isOpen); }
}

// ------------------------------------------------------------------ sliding (drawers)
export class Slide extends Interactable {
  constructor(opts) {
    super(opts);
    this.part = opts.part; this.dir = new THREE.Vector3(...(opts.dir || [0, 0, 1])); this.distance = opts.distance ?? 0.4;
    this.duration = opts.duration ?? 0.45; this.state = 'closed'; this.t = 0;
    this.base = this.part.position.clone(); this.sound = opts.sound || 'drawer';
  }
  get isOpen() { return this.state === 'open' || this.state === 'opening'; }
  verb(sys) { return { label: `${this.isOpen ? 'Close' : 'Open'} ${this.name}`, clip: 'PickUp', run: () => { this.state = this.isOpen ? 'closing' : 'opening'; sys.sfx(this.sound, this.isOpen); } }; }
  update(dt) {
    const target = this.isOpen ? 1 : 0;
    if (this.t !== target) { this.t = THREE.MathUtils.clamp(this.t + Math.sign(target - this.t) * dt / this.duration, 0, 1); if (this.t === target) this.state = target ? 'open' : 'closed'; }
    this.part.position.copy(this.base).addScaledVector(this.dir, this.distance * ease(this.t));
  }
  save() { return this.isOpen ? 'open' : 'closed'; }
  load(s) { this.state = s === 'open' ? 'open' : 'closed'; this.t = s === 'open' ? 1 : 0; this.update(0); }
}

// ------------------------------------------------------------------ toggles (taps, knobs, lamps)
export class Toggle extends Interactable {
  constructor(opts) {
    super(opts);
    this.on = false; this.part = opts.part || null; this.partAxis = opts.partAxis || 'y'; this.partAngle = THREE.MathUtils.degToRad(opts.partAngle ?? 90);
    this.onSet = opts.onSet || (() => {}); this.verbOn = opts.verbOn || 'Turn on'; this.verbOff = opts.verbOff || 'Turn off';
    this.requires = opts.requires || null; this.sound = opts.sound || 'click'; this.t = 0; this.persist = opts.persist ?? true;
  }
  set(on, sys) { if (this.on === on) return; this.on = on; this.onSet(on, sys); sys?.sfx(this.sound, on); }
  verb(sys) {
    const why = !this.on && this.requires?.();
    if (why) return { label: why, run: () => sys.toast(why), disabled: true };
    return { label: `${this.on ? this.verbOff : this.verbOn} ${this.name}`, clip: 'PickUp', run: () => this.set(!this.on, sys) };
  }
  update(dt) {
    this.t += ((this.on ? 1 : 0) - this.t) * Math.min(1, dt * 10);
    if (this.part) this.part.rotation[this.partAxis] = this.partAngle * this.t;
  }
  save() { return this.persist ? (this.on ? 'on' : 'off') : undefined; }
  load(s) { if (s === 'on') this.set(true, null); }
}

// ------------------------------------------------------------------ seats (chairs, stools, sofa)
export class Seat extends Interactable {
  /** object: the chair; seatY: seat height; facing: yaw (radians) a seated person faces */
  constructor(opts) { super({ ...opts, save: false }); this.seatY = opts.seatY ?? 0.46; this.facing = opts.facing ?? 0; this.back = opts.back ?? 0.05; }
  verb(sys) { return sys.game.seated ? null : { label: `Sit on the ${this.name}`, run: () => sys.sit(this) }; }
  seatPose() { this.object.updateWorldMatrix(true, false); const p = new THREE.Vector3().setFromMatrixPosition(this.object.matrixWorld); p.y += this.seatY - 0.42; p.x -= Math.sin(this.facing) * this.back; p.z -= Math.cos(this.facing) * this.back; return p; }
}

// ------------------------------------------------------------------ slots (where things go)
export class Slot {
  /** parent: Object3D the item sits on (moves with drawers/doors); pos: local position */
  constructor({ id, name, parent, pos = [0, 0, 0], accepts = () => true, enabled = () => true, radius = 1.7, onPut, onTake }) {
    this.id = id; this.name = name; this.parent = parent; this.pos = new THREE.Vector3(...pos);
    this.accepts = accepts; this.enabled = enabled; this.radius = radius; this.item = null;
    this.onPut = onPut || (() => {}); this.onTake = onTake || (() => {});
  }
  world(out = new THREE.Vector3()) { this.parent.updateWorldMatrix(true, false); return out.copy(this.pos).applyMatrix4(this.parent.matrixWorld); }
}

// ------------------------------------------------------------------ items (pick up / put down)
export class Item extends Interactable {
  /** object: Object3D origin at its base; size: height in metres (already applied) */
  constructor(opts) {
    super({ ...opts, radius: opts.radius ?? 1.7 });
    this.tags = new Set(opts.tags || []); this.slot = null; this.home = opts.home || null; this.held = false;
    this.gripOffset = new THREE.Vector3(...(opts.grip || [0, -0.04, 0.06]));
    this.useVerb = opts.use || null;      // (sys, item) => { label, run } when held with nothing targeted
    this.state = opts.state || {};          // e.g. { fill: 0 }
    this.flying = null;
  }
  verb(sys) {
    if (this.held || sys.held) return null;
    if (this.slot && !this.slot.enabled()) return null;
    return { label: `Take ${this.name}`, clip: 'PickUp', run: () => sys.pickUp(this) };
  }
  anchor(out = new THREE.Vector3()) { this.object.updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.object.matrixWorld).add(new THREE.Vector3(0, 0.06, 0)); }
  update(dt) {
    if (!this.flying) return;
    const f = this.flying; f.t = Math.min(1, f.t + dt / f.dur);
    const k = ease(f.t);
    // fly in world space, then reparent at the end
    this.object.position.lerpVectors(f.from, f.to(), k);
    if (f.t >= 1) { this.flying = null; f.done(); }
  }
  save() { return { slot: this.held ? 'held' : this.slot?.id || null, state: this.state }; }
}

// ------------------------------------------------------------------ the system
export class InteractionSystem {
  constructor(game, scene) {
    this.game = game; this.scene = scene;
    this.list = []; this.slots = new Map(); this.items = new Map();
    this.held = null; this.best = null; this.enabled = false;
    this.prompt = document.getElementById('prompt'); this.promptText = document.getElementById('prompt-text');
    this.useBtn = document.getElementById('b-use');
    this.marker = this.makeMarker(); scene.add(this.marker);
    this.saveKey = 'hg.save.house';
    this.sounds = {};
    this.cool = 0;
  }

  makeMarker() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,230,140,0.9)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(0.16); s.visible = false; s.renderOrder = 10;
    return s;
  }

  add(x) { this.list.push(x); if (x instanceof Item) this.items.set(x.id, x); return x; }
  addSlot(s) { this.slots.set(s.id, s); return s; }

  /** put an item into a slot immediately (no animation) */
  place(item, slot) {
    if (item.slot) { item.slot.item = null; }
    item.slot = slot; slot.item = item; item.held = false;
    slot.parent.add(item.object); item.object.position.copy(slot.pos); item.object.quaternion.identity(); item.object.rotation.y = (item.yaw || 0);
    item.object.scale.setScalar(item.baseScale);
  }

  // --------------------------------------------------------------- actions
  pickUp(item) {
    const hand = this.game.wren.bones?.RightHand;
    if (item.slot) { const s = item.slot; s.item = null; item.slot = null; s.onTake(item, this); }
    this.held = item; item.held = true;
    this.flyTo(item, () => this.handPos(), () => {
      if (hand) {
        hand.add(item.object);
        const ws = new THREE.Vector3(); hand.getWorldScale(ws);
        item.object.scale.setScalar(item.baseScale / ws.x);
        item.object.position.copy(item.gripOffset).divideScalar(ws.x);
        item.object.quaternion.identity();
      }
    });
    this.sfx('pickup'); this.changed();
  }

  putIn(slot) {
    const item = this.held; if (!item) return;
    this.held = null; item.held = false;
    this.flyTo(item, () => slot.world(), () => { this.place(item, slot); slot.onPut(item, this); this.changed(); });
    this.sfx('place');
  }

  /** sit down on a seat; any move key or E stands up again */
  sit(seat) {
    const g = this.game; g.seated = { seat, t: 0 };
    g.wren.sitting = true; this.sfx('place');
  }
  stand() {
    const g = this.game, s = g.seated; if (!s) return;
    g.seated = null; g.wren.sitting = false;
    const p = s.seat.seatPose(); const f = s.seat.facing;
    g.player.body.teleport(p.x + Math.sin(f) * 0.55, p.y - (s.seat.seatY - 0.42) - 0.42 + 0.05, p.z + Math.cos(f) * 0.55);
    g.player.face = f; g.wren.root.rotation.set(0, f, 0);
  }

  /** Q: put the held item in the closest free slot that takes it */
  drop() {
    const item = this.held; if (!item) return false;
    const p = this.game.player.pos; let best = null, bd = 3.5;
    for (const s of this.slots.values()) {
      if (s.item || !s.enabled() || !s.accepts(item)) continue;
      const d = s.world(_v).distanceTo(p); if (d < bd) { bd = d; best = s; }
    }
    if (!best && item.home && !item.home.item) best = item.home;
    if (best) { this.putIn(best); return true; }
    this.toast('No space here. Try a counter or a table.');
    return false;
  }

  handPos() { return this.game.wren.worldPos('RightHand'); }

  flyTo(item, toFn, done) {
    // detach to the scene keeping the world transform, then fly
    const o = item.object; o.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    o.matrixWorld.decompose(wp, wq, ws);
    this.scene.add(o); o.position.copy(wp); o.quaternion.copy(wq); o.scale.copy(ws);
    o.scale.setScalar(item.baseScale);
    item.flying = { t: 0, dur: 0.28, from: wp.clone(), to: toFn, done };
  }

  // --------------------------------------------------------------- per frame
  update(dt) {
    for (const x of this.list) x.update(dt);
    this.cool -= dt;
    if (!this.enabled) { this.show(null); return; }
    const g = this.game, P = g.player.pos, face = g.player.face;
    const fwd = new THREE.Vector3(Math.sin(face), 0, Math.cos(face));
    const camFwd = new THREE.Vector3(); g.camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
    const chest = P.clone().add(new THREE.Vector3(0, 1.0, 0));
    let best = null, bs = Infinity;
    const consider = (anchor, radius, verbFn, bonus = 0) => {
      const d = anchor.distanceTo(chest); if (d > radius) return;
      const to = anchor.clone().sub(chest); to.y = 0; const len = to.length() || 1e-3; to.divideScalar(len);
      const ang = Math.acos(THREE.MathUtils.clamp(Math.max(to.dot(fwd), to.dot(camFwd) * 0.9), -1, 1));
      if (ang > 1.35 && len > 0.6) return;
      const score = d * 0.7 + ang * 1.6 - bonus;   // what's straight in front matters most
      if (score < bs) { const v = verbFn(); if (v) { bs = score; best = { ...v, anchor }; } }
    };
    for (const x of this.list) {
      if (x === this.held) continue;
      consider(x.anchor(new THREE.Vector3()), x.radius, () => x.verb(this), x instanceof Item ? 0.15 : 0);
    }
    if (this.held) {
      for (const s of this.slots.values()) {
        if (s.item || !s.enabled() || !s.accepts(this.held)) continue;
        consider(s.world(new THREE.Vector3()), s.radius, () => ({ label: `Put ${this.held.name} ${s.name}`, clip: 'PickUp', run: () => this.putIn(s) }), 0.5);
      }
      if (!best && this.held.useVerb) { const u = this.held.useVerb(this, this.held); if (u) best = { ...u, anchor: this.handPos() }; }
    }
    this.best = best;
    this.show(best);
  }

  show(v) {
    if (!this.prompt) return;
    if (!v) { this.prompt.classList.remove('show'); this.marker.visible = false; if (this.useBtn) this.useBtn.hidden = true; return; }
    this.promptText.textContent = v.label;
    this.prompt.classList.add('show'); this.prompt.classList.toggle('disabled', !!v.disabled);
    if (this.useBtn) { this.useBtn.hidden = false; this.useBtn.textContent = 'Use'; }
    // place the bubble above the target on screen
    const p = v.anchor.clone(); this.marker.position.copy(p); this.marker.visible = !v.disabled;
    this.marker.scale.setScalar(0.12 + Math.sin(performance.now() * 0.006) * 0.03);
    p.y += 0.25; p.project(this.game.camera);
    const r = this.game.renderer.domElement.getBoundingClientRect();
    this.prompt.style.left = `${Math.min(r.width - 120, Math.max(120, (p.x * 0.5 + 0.5) * r.width))}px`;
    this.prompt.style.top = `${Math.max(70, (-p.y * 0.5 + 0.5) * r.height)}px`;
  }

  /** E / Use button */
  use() {
    if (this.game.seated) { this.stand(); return true; }
    if (this.cool > 0 || !this.enabled) return false;
    const v = this.best; if (!v) return false;
    this.cool = 0.3;
    if (!v.disabled && v.clip && !this.game.wren.busy) this.game.wren.play(v.clip, CLIP_RANGES[v.clip] || {});
    v.run(this);
    return true;
  }

  toast(t) { this.game.toast?.(t); }
  sfx(kind, on) { this.game.audio?.house?.(kind, on); }

  // --------------------------------------------------------------- save / load
  changed() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.save(), 200); }
  snapshot() {
    const objects = {}, items = {};
    for (const x of this.list) {
      if (x instanceof Item) { items[x.id] = x.save(); continue; }
      if (!x.saveable) continue;
      const s = x.save(); if (s !== undefined) objects[x.id] = s;
    }
    return { v: 1, objects, items, extra: this.extraSave?.() || {} };
  }
  save() { try { localStorage.setItem(this.saveKey, JSON.stringify(this.snapshot())); } catch (e) { /* storage blocked */ } }
  load() {
    let d = null; try { d = JSON.parse(localStorage.getItem(this.saveKey) || 'null'); } catch (e) { d = null; }
    if (!d || d.v !== 1) return false;
    for (const x of this.list) { if (!(x instanceof Item) && d.objects?.[x.id] !== undefined) x.load(d.objects[x.id]); }
    for (const [id, s] of Object.entries(d.items || {})) {
      const it = this.items.get(id); if (!it || !s) continue;
      Object.assign(it.state, s.state || {}); it.onState?.();
      const slot = s.slot && s.slot !== 'held' ? this.slots.get(s.slot) : it.home;
      if (slot && !slot.item) this.place(it, slot);
    }
    this.extraLoad?.(d.extra || {});
    return true;
  }
}

// which part of each Wren clip reads as the gesture (seconds)
export const CLIP_RANGES = {
  PickUp: { from: 0.35, to: 1.35, timeScale: 1.4, fadeIn: 0.1 },
  OpenDoor: { from: 0.2, to: 1.3, timeScale: 1.3, fadeIn: 0.1 },
  Cheer: { from: 0, to: 2.0, timeScale: 1.1, fadeIn: 0.15 },
};
