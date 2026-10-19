// Wren's extra moves, her shell inventory, and the things they touch.
//
//   H  equip / store the pearl shell (persistent inventory; W and L fetch it automatically)
//   R  run (toggle)         F  dance (loops)        G  wave (friend waves back)
//   B  sit / stand          N  nap / wake           T  talk to your friend (dialogue + quest)
//   Y  celebrate            K  kick a ball          U  magic flashlight     Z  crouch / sneak
//
// Moves that have a generated animation clip use it; the rest are posed on Wren's own skeleton
// (world-space bone rotations on top of the blended animation, so they mix with walking),
// and switch to a real clip automatically when one is added (Dance, Wave, Kick, Talk, Nap,
// CrouchIdle, CrouchWalk).
import * as THREE from 'three/webgpu';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _ax = new THREE.Vector3();
const SAVE = 'hg.save.player';

export class Actions {
  constructor(game) {
    this.g = game;
    const w = game.wren;
    this.inv = { shell: { owned: true, equipped: true, type: 'pearlShell', abilities: ['water', 'love'] }, toy: null };
    this.s = { run: false, dance: false, crouch: false, nap: null, flashlight: false, talk: null };
    this.k = { dance: 0, wave: 0, crouch: 0, kick: 0, talk: 0, nap: 0, store: 0 };   // pose blend weights
    this.t = { wave: 0, kick: 0, store: 0, dance: 0, cheer: 0 };
    this.load();
    // pose on top of the animation every frame
    const prev = w.afterPose;
    w.afterPose = () => { prev?.(); this.pose(); };
    this.baseY = w.model?.position.y || 0;
    // her friend can dance too
    const fc = game.friend?.c;
    if (fc) { const fp = fc.afterPose; fc.afterPose = () => { fp?.(); this.friendPose(); }; this.friendBaseY = fc.model.position.y; }
    this.buildFlashlight();
    this.buildBalls();
    this.napSpots = [];
    this.applyShell(true);
    this.ui = { shellBtn: document.getElementById('b-shell') };
    this.ui.shellBtn?.addEventListener('click', () => this.toggleShell());
    this.dialogue = new Dialogue(this);
    this.syncShellButton();
  }

  // ------------------------------------------------------------------ helpers
  get wren() { return this.g.wren; }
  get frozen() { return !!(this.s.nap || this.s.talk); }
  get busyBody() { const g = this.g; return !!(g.seated || g.ride?.riding || g.sliding >= 0 || g.onSwing || g.photo || this.s.nap || this.s.talk || g.house?.focus?.active); }
  get swimming() { const P = this.g.player; return !!(P.c?.swimming || P.underwater || P.diving); }
  say(t) { this.g.toast?.(t); }
  /** rotate a bone by `angle` about an axis given in Wren's own space (x = her left, y = up, z = forward) */
  rot(name, axis, angle, ch = this.wren) {
    const b = ch.bones[name]; if (!b || !angle) return;
    ch.root.getWorldQuaternion(_q3);
    _ax.set(...axis).applyQuaternion(_q3).normalize();
    b.getWorldQuaternion(_q1); b.parent.getWorldQuaternion(_q2);
    const d = new THREE.Quaternion().setFromAxisAngle(_ax, angle);
    b.quaternion.copy(_q2.invert().multiply(d.multiply(_q1)));
  }
  clip(name) { return !!this.wren.actions[name]; }

  // ------------------------------------------------------------------ the key handlers
  key(a) {
    const g = this.g;
    if (!g.started || g.photo) return;
    if (this.s.talk && a !== 'talk') return;
    switch (a) {
      case 'shell': return this.toggleShell();
      case 'run': if (this.s.crouch) this.s.crouch = false; this.s.run = !this.s.run; this.say(this.s.run ? 'Running!' : 'Back to a stroll.'); break;
      case 'dance': return this.toggleDance();
      case 'wave': return this.wave();
      case 'sit': return this.sit();
      case 'nap': return this.nap();
      case 'talk': return this.talk();
      case 'cheer': return this.cheer();
      case 'kick': return this.kick();
      case 'light': return this.toggleLight();
      case 'crouch': if (this.swimming) return this.say('No crouching while swimming!'); this.s.crouch = !this.s.crouch; if (this.s.crouch) this.s.run = false; this.say(this.s.crouch ? 'Sneaky mode…' : 'Standing tall.'); break;
    }
    this.save();
  }
  /** how fast she moves this frame (the player controller reads it) */
  speedScale(base) { if (this.s.crouch) return Math.min(base, 1.5); if (this.s.run && base > 3 && base < 10) return 7.0; return base; }
  /** anything that should stop when she starts moving */
  moved() {
    if (this.s.dance) this.toggleDance(false);
    if (this.s.nap) this.wake();
  }

  // ------------------------------------------------------------------ shell (H)
  applyShell(quiet) { const c = this.g.clam; if (c) c.visible = this.inv.shell.equipped && !this.g.interact?.held; }
  toggleShell(force) {
    const S = this.inv.shell, want = force ?? !S.equipped, g = this.g, sys = g.interact;
    if (want === S.equipped) return;
    if (want && sys?.held) { this.say(`Put down the ${sys.held.name} first (Q), then take out your shell.`); return; }
    S.equipped = want; this.t.store = 0.7; this.storing = want ? 'out' : 'in';
    if (!this.clip('ShellStore')) this.wren.play('PickUp', { from: 0.3, to: 1.0, timeScale: 1.5, fadeIn: 0.1 }); else this.wren.play('ShellStore', {});
    g.audio?.house?.('pickup');
    this.sparkle(0.35);
    // the shell appears / disappears half way through the reach, not instantly
    setTimeout(() => { this.applyShell(); this.sparkle(0.6); this.syncShellButton(); }, 380);
    this.say(want ? 'Shell out! Water and love powers ready.' : 'Shell tucked safely away.');
    this.save();
  }
  /** W and L: fetch the shell first if it's stored */
  ensureShell() {
    if (this.inv.shell.equipped) return true;
    const sys = this.g.interact;
    if (sys?.held) { sys.drop(); }
    this.toggleShell(true);
    return false;
  }
  syncShellButton() { const b = this.ui?.shellBtn; if (!b) return; b.classList.toggle('equipped', this.inv.shell.equipped); b.setAttribute('aria-pressed', this.inv.shell.equipped); }
  sparkle(k = 0.5) { const g = this.g, p = this.g.wren.worldPos?.('RightHand') || g.player.pos.clone().add(V3(0, 1, 0)); for (let i = 0; i < 14 * k; i++) g.fxGlow?.emit(p, V3((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2), { life: 0.6, size: 0.08, color: [0.7, 1, 0.95], alpha: 0.9 }); }

  // ------------------------------------------------------------------ dance, wave, cheer, kick
  toggleDance(on = !this.s.dance) {
    if (on && (this.busyBody || this.swimming)) return this.say(this.swimming ? 'Dance on dry land!' : 'Not now!');
    this.s.dance = on; this.t.dance = 0;
    if (on) { this.say('Dance party!'); if (this.clip('Dance')) this.wren.actions.Dance.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play(); this.friendJoin('dance'); this.g.audio?.chime?.(784); }
    else { this.wren.actions.Dance?.fadeOut(0.3); this.friendJoin(null); }
  }
  wave() {
    if (this.busyBody && !this.g.seated) return;
    this.t.wave = 2.2;
    if (this.clip('Wave')) this.wren.play('Wave', { fadeIn: 0.15 });
    const f = this.g.friend;
    if (f && f.pos.distanceTo(this.g.player.pos) < 12) {
      const P = this.g.player, d = f.pos.clone().sub(P.pos); P.face = Math.atan2(d.x, d.z);
      setTimeout(() => { f.c.play?.('Wave', { fadeIn: 0.15 }); this.g.audio?.chime?.(660); this.g.speech?.show('Hi Hannah! 👋', 2.2); }, 500);
    }
  }
  cheer() {
    if (this.busyBody) return;
    this.wren.play('Cheer', { from: 0, to: 2.0, timeScale: 1.1, fadeIn: 0.15 });
    this.t.cheer = 1.6;
    const g = this.g, p = g.player.pos.clone().add(V3(0, 1.4, 0));
    for (let i = 0; i < 40; i++) (i % 3 ? g.fxGlow : g.fxHeart)?.emit(p, V3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3), { life: 1.4, size: 0.16, gravity: 4, color: [1, 0.9, 0.5] });
    g.audio?.chime?.(988); setTimeout(() => g.audio?.chime?.(1318), 160);
    if (g.friend && g.friend.pos.distanceTo(g.player.pos) < 10) g.friend.cheer?.();
  }
  kick() {
    if (this.busyBody || this.swimming) return;
    const P = this.g.player, best = this.nearestBall(1.6);
    this.t.kick = 0.55;
    if (this.clip('Kick')) this.wren.play('Kick', { fadeIn: 0.1 });
    if (!best) { this.say('Find a ball to kick!'); return; }
    const d = best.pos.clone().sub(P.pos); d.y = 0; P.face = Math.atan2(d.x, d.z);
    this.pendingKick = { t: 0.22, run: () => {
      const dir = V3(Math.sin(P.face), 0, Math.cos(P.face));
      const power = best.inside ? 2.6 : 4.6;
      best.vel.copy(dir.multiplyScalar(power)).add(V3(0, best.inside ? 1.6 : 3.2, 0));
      this.g.audio?.house?.('drawer'); this.g.audio?.sfx?.(220, 0.08, 'sine', 0.12);
    } };
  }

  // ------------------------------------------------------------------ sit (B), nap (N)
  sit() {
    const g = this.g, sys = g.interact;
    if (g.seated) { sys.stand(); return; }
    if (this.busyBody || this.swimming) return;
    const best = this.nearestSeat(2.0);
    if (!best) { if (g.swingSeat && Math.hypot(g.player.pos.x - g.swingSeat.x, g.player.pos.z - g.swingSeat.z) < 2) { g.onSwing = { t: 0 }; return; } this.say('No seat nearby. Try a chair or a stool!'); return; }
    sys.sit(best);
  }
  nearestSeat(max) {
    const g = this.g, sys = g.interact, Seat = g.houseKit?.Seat; if (!Seat) return null;
    let best = null, bd = max;
    for (const s of sys.list) { if (!(s instanceof Seat)) continue; const p = s.seatPose(); const d = Math.hypot(p.x - g.player.pos.x, p.z - g.player.pos.z) + Math.abs(p.y - g.player.pos.y) * 0.3; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  nearestNap(max = 2.2) { const g = this.g; let best = null, bd = max; for (const s of this.napSpots) { if (!!s.inside !== !!g.indoors) continue; const d = Math.hypot(s.center.x - g.player.pos.x, s.center.z - g.player.pos.z); if (d < bd) { bd = d; best = s; } } return best; }
  nearestBall(max = 1.6) { const g = this.g; let best = null, bd = max; for (const b of this.balls) { if (b.inside !== !!g.indoors) continue; const d = Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z); if (d < bd) { bd = d; best = b; } } return best; }
  /** spot: { name, center: world Vector3 of the surface middle, face: yaw her body lies along, inside } */
  addNapSpot(spot) { this.napSpots.push(spot); }
  nap() {
    const g = this.g;
    if (this.s.nap) return this.wake();
    if (this.busyBody || this.swimming) return;
    const best = this.nearestNap();
    if (!best) { this.say('Find somewhere comfy to nap: a beach towel, the hammock, or the foyer bench.'); return; }
    this.s.nap = { spot: best, t: 0 }; g.player.vel.set(0, 0, 0);
    if (this.clip('Nap')) this.wren.actions.Nap.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.5).play();
    this.say(`A cosy nap on the ${best.name}… (N or move to wake up)`);
  }
  wake() {
    const n = this.s.nap; if (!n) return;
    this.s.nap = null; this.wren.actions.Nap?.fadeOut(0.4);
    const w = this.wren; w.root.rotation.x = 0; w.root.rotation.z = 0;
    const c = n.spot.center, sd = V3(Math.cos(n.spot.face), 0, -Math.sin(n.spot.face));
    this.g.player.body.teleport(c.x + sd.x * 0.75, c.y + 0.15, c.z + sd.z * 0.75);
    this.say('Good morning!');
  }

  // ------------------------------------------------------------------ talk (T)
  talk() {
    if (this.s.talk) { this.dialogue.close(); return; }
    const g = this.g, f = g.friend;
    if (!f || f.pos.distanceTo(g.player.pos) > 4) { this.say('Walk up to your friend to talk.'); return; }
    if (this.busyBody) return;
    this.dialogue.open();
  }

  // ------------------------------------------------------------------ flashlight (U)
  buildFlashlight() {
    const g = this.g;
    const L = this.light = new THREE.SpotLight(0xfff0d0, 0, 14, 0.42, 0.55, 1.4); L.castShadow = false;
    g.scene.add(L, L.target); L.userData.keep = L.target.userData.keep = true;
    const prop = this.torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.13, 12), new THREE.MeshStandardNodeMaterial({ color: 0x2BB5B0, roughness: 0.35, metalness: 0.3 }));
    body.rotation.x = Math.PI / 2; prop.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.025, 14), new THREE.MeshStandardNodeMaterial({ color: 0xFFF6D8, emissive: 0xFFE9A8, emissiveIntensity: 2 }));
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.07; prop.add(lens);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardNodeMaterial({ color: 0xFFE3F0, roughness: 0.2 })); pearl.position.set(0, 0.02, -0.03); prop.add(pearl);
    prop.visible = false;
    const hand = g.wren.bones?.LeftHand;
    if (hand) { hand.add(prop); const ws = new THREE.Vector3(); hand.getWorldScale(ws); prop.scale.setScalar(1 / ws.x); prop.position.set(0, 0.06 / ws.x, 0.03 / ws.x); }
  }
  toggleLight() {
    if (this.swimming && !this.s.flashlight) return this.say('Not underwater: it might get wet!');
    this.s.flashlight = !this.s.flashlight;
    this.torch.visible = this.s.flashlight; this.g.audio?.house?.('switch');
    this.say(this.s.flashlight ? 'Magic flashlight on ✨' : 'Flashlight off.');
    if (this.s.flashlight) this.sparkle(0.5);
  }

  // ------------------------------------------------------------------ kickable balls
  buildBalls() {
    const g = this.g; this.balls = [];
    const ballTex = (cols) => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 256 / cols.length, 0, 256 / cols.length + 1, 128); }); x.fillStyle = '#fff'; x.beginPath(); x.arc(128, 6, 10, 0, 7); x.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const mk = (r, cols, pos, inside) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardNodeMaterial({ map: ballTex(cols), roughness: 0.4 }));
      m.castShadow = true; m.userData.keep = true; g.scene.add(m);
      const b = { root: m, r, pos: pos.clone(), vel: V3(0, 0, 0), inside, spin: new THREE.Quaternion() };
      m.position.copy(b.pos); this.balls.push(b); return b;
    };
    this.ballMaker = mk;
  }
  /** called by main once the world and house exist */
  placeBalls(beach, house) {
    if (beach) this.ballMaker(0.2, ['#E8574A', '#FFFFFF', '#F2B521', '#FFFFFF', '#1F9FA6', '#FFFFFF'], beach, false);
    if (house) this.ballMaker(0.11, ['#7FB3A6', '#F4EFE6', '#E8A0B4', '#F4EFE6'], house, true);
  }
  updateBalls(dt) {
    const g = this.g, P = g.player;
    for (const b of this.balls) {
      b.root.visible = b.inside === !!g.indoors;
      if (!b.root.visible) continue;
      // a gentle nudge when Wren walks into it
      const d = b.pos.clone().sub(P.pos); d.y = 0; const dl = d.length();
      if (dl < b.r + 0.3 && dl > 1e-3) { const push = d.normalize().multiplyScalar(Math.hypot(P.vel.x, P.vel.z) * 0.7 + 0.4); b.vel.x = push.x; b.vel.z = push.z; }
      b.vel.y -= 9.8 * dt;
      const step = b.vel.clone().multiplyScalar(dt);
      // bounce off walls, furniture and rocks (physics colliders)
      const hz = step.clone().setY(0); const len = hz.length();
      if (len > 1e-4 && g.rayHit) { const h = g.rayHit(b.pos, hz.clone().normalize(), len + b.r); if (h) { const n = h.normal; const vn = b.vel.dot(n); if (vn < 0) b.vel.addScaledVector(n, -1.7 * vn); step.set(0, step.y, 0); } }
      b.pos.add(step);
      const floor = g.floorAt ? g.floorAt(b.pos, b.inside) : 0;
      if (b.pos.y - b.r < floor) { b.pos.y = floor + b.r; if (b.vel.y < 0) b.vel.y = -b.vel.y * 0.55; if (Math.abs(b.vel.y) < 0.4) b.vel.y = 0; }
      if (b.pos.y - b.r < floor + 0.06) { const fr = 1 - Math.min(1, dt * (b.inside ? 1.4 : 1.9)); b.vel.x *= fr; b.vel.z *= fr; }
      b.root.position.copy(b.pos);
      const sp = Math.hypot(b.vel.x, b.vel.z); if (sp > 0.01) { const ax = V3(b.vel.z, 0, -b.vel.x).normalize(); b.root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, sp * dt / b.r)); }
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g, w = this.wren, P = g.player;
    for (const k of Object.keys(this.t)) this.t[k] = Math.max(0, this.t[k] - dt);
    this.t.dance += this.s.dance ? dt * 2 : 0;
    // blend weights toward the wanted poses
    const want = { dance: this.s.dance && !this.clip('Dance') ? 1 : 0, wave: this.t.wave > 0 && !this.clip('Wave') ? 1 : 0, crouch: this.s.crouch ? 1 : 0, kick: this.t.kick > 0 && !this.clip('Kick') ? 1 : 0, talk: this.s.talk ? 1 : 0, nap: this.s.nap ? 1 : 0, store: this.t.store > 0 ? 1 : 0 };
    for (const k of Object.keys(this.k)) this.k[k] += (want[k] - this.k[k]) * Math.min(1, dt * (k === 'kick' ? 18 : 7));
    if (this.s.crouch && this.swimming) this.s.crouch = false;
    g.crouch = this.k.crouch > 0.5;
    // napping: lie on the spot, breathe, little z's
    if (this.s.nap) {
      const n = this.s.nap, sp = n.spot; n.t += dt;
      // feet at one end, lying on her back along the spot
      const fwd = V3(Math.sin(sp.face), 0, Math.cos(sp.face)), lie = Math.min(1, n.t * 1.6);
      const p = sp.center.clone().addScaledVector(fwd, 0.72 * lie); p.y = sp.center.y + 0.11 * lie;
      w.root.position.copy(p); w.root.rotation.set(-Math.PI / 2 * lie, sp.face, 0); P.vel.set(0, 0, 0); P.face = sp.face;
      if (Math.random() < dt * 1.2) g.fxGlow?.emit(sp.center.clone().addScaledVector(fwd, -0.6).add(V3(0, 0.45, 0)), V3(0.15, 0.4, 0), { life: 1.6, size: 0.12, color: [0.8, 0.85, 1], alpha: 0.7 });
    }
    // flashlight follows her hand and aims where she (or the camera in first person) looks
    if (this.s.flashlight) {
      const L = this.light, hp = w.worldPos?.('LeftHand') || P.pos.clone().add(V3(0, 1.2, 0));
      L.intensity = g.indoors ? 22 : 40; L.position.copy(hp);
      const fwd = g.view === 'first' || g.focus ? g.camera.getWorldDirection(V3(0, 0, 0)) : V3(Math.sin(P.face), -0.15, Math.cos(P.face));
      L.target.position.copy(hp).addScaledVector(fwd, 5);
      if (Math.random() < dt * 6) g.fxGlow?.emit(hp.clone().addScaledVector(fwd, 0.15), fwd.clone().multiplyScalar(0.4), { life: 0.5, size: 0.04, color: [1, 0.95, 0.7], alpha: 0.8 });
    } else this.light.intensity = 0;
    // the shell hides while she carries something (one hand each), comes back when hands are free
    const c = g.clam; if (c) { const want2 = this.inv.shell.equipped && !g.interact?.held && !(this.t.store > 0.35 && this.storing === 'out'); if (c.visible !== want2 && !(this.t.store > 0)) c.visible = want2; }
    // a running dance can pause for her friend's moves
    if (this.pendingKick && (this.pendingKick.t -= dt) <= 0) { const k = this.pendingKick; this.pendingKick = null; k.run(); }
    this.updateBalls(dt);
    this.dialogue.update(dt);
  }

  /** procedural poses for moves without a clip (runs after the animation mixer) */
  pose() {
    const k = this.k, t = performance.now() / 1000, w = this.wren;
    if (!w?.bones) return;
    // crouch: knees bend, hips drop, lean forward
    if (k.crouch > 0.01) {
      const c = k.crouch;
      w.model.position.y = this.baseY - 0.36 * c;
      for (const side of ['Left', 'Right']) { this.rot(`${side}UpLeg`, [1, 0, 0], -1.25 * c); this.rot(`${side}Leg`, [1, 0, 0], 2.1 * c); this.rot(`${side}Foot`, [1, 0, 0], -0.8 * c); }
      this.rot('Spine', [1, 0, 0], 0.45 * c);
    } else if (!k.dance) w.model.position.y = this.baseY;
    // dance: arms up in turn, hips sway, head bobs, a little bounce
    if (k.dance > 0.01) {
      const d = k.dance, ph = t * 4.2, up = Math.max(0, Math.sin(ph)), up2 = Math.max(0, Math.sin(ph + Math.PI));
      this.rot('Hips', [0, 1, 0], 0.32 * Math.sin(ph) * d); this.rot('Hips', [0, 0, 1], 0.12 * Math.sin(ph * 2) * d);
      this.rot('Spine01', [0, 1, 0], -0.2 * Math.sin(ph) * d);
      this.rot('RightArm', [0, 0, 1], (-1.0 - 1.4 * up) * d); this.rot('RightForeArm', [0, 0, 1], -0.6 * up * d);
      this.rot('LeftArm', [0, 0, 1], (1.0 + 1.4 * up2) * d); this.rot('LeftForeArm', [0, 0, 1], 0.6 * up2 * d);
      this.rot('Head', [1, 0, 0], 0.18 * Math.sin(ph * 2) * d);
      for (const [side, s] of [['Left', 1], ['Right', -1]]) { const b = Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI))); this.rot(`${side}UpLeg`, [1, 0, 0], -0.5 * b * d); this.rot(`${side}Leg`, [1, 0, 0], 0.9 * b * d); }
      w.model.position.y = (k.crouch > 0.01 ? w.model.position.y : this.baseY) + Math.abs(Math.sin(ph)) * 0.05 * d;
    }
    // wave: right arm up over the head, hand swings
    if (k.wave > 0.01) { this.rot('RightArm', [0, 0, 1], -2.5 * k.wave); this.rot('RightForeArm', [0, 0, 1], (-0.3 + 0.45 * Math.sin(t * 11)) * k.wave); this.rot('Head', [0, 0, 1], 0.12 * k.wave); }
    // kick: right leg swings forward and back
    if (k.kick > 0.01) { const u = Math.sin(Math.PI * (1 - this.t.kick / 0.55)); this.rot('RightUpLeg', [1, 0, 0], -1.35 * u * k.kick); this.rot('RightLeg', [1, 0, 0], 0.25 * (1 - u) * k.kick); this.rot('LeftArm', [1, 0, 0], -0.6 * u * k.kick); this.rot('RightArm', [1, 0, 0], 0.5 * u * k.kick); }
    // talking: little hand gestures and nods
    if (k.talk > 0.01) { this.rot('RightForeArm', [1, 0, 0], (-0.5 + 0.25 * Math.sin(t * 3)) * k.talk); this.rot('Head', [1, 0, 0], 0.08 * Math.sin(t * 2.2) * k.talk); }
    // tucking the shell into the pouch at her hip / pulling it out
    if (k.store > 0.01) { this.rot('RightArm', [1, 0, 0], 0.5 * k.store); this.rot('RightForeArm', [1, 0, 0], -0.9 * k.store); }
    // napping: breathe
    if (k.nap > 0.01) { this.rot('Spine01', [1, 0, 0], 0.03 * Math.sin(t * 1.6) * k.nap); this.rot('Head', [0, 1, 0], 0.4 * k.nap); }
  }

  /** her friend joins in or stops */
  friendJoin(what) { const f = this.g.friend; if (!f) return; f.dancing = what === 'dance' && f.pos.distanceTo(this.g.player.pos) < 14; if (f.dancing) this.g.speech?.show('Dance party! 🎶', 2.5); }
  friendPose() {
    const f = this.g.friend; if (!f) return;
    f.danceK = (f.danceK || 0) + ((f.dancing ? 1 : 0) - (f.danceK || 0)) * 0.08;
    const d = f.danceK, c = f.c; if (d < 0.01) { if (c.model.position.y !== this.friendBaseY) c.model.position.y = this.friendBaseY; return; }
    const ph = performance.now() / 1000 * 4.2 + 0.8, up = Math.max(0, Math.sin(ph)), up2 = Math.max(0, Math.sin(ph + Math.PI));
    this.rot('Hips', [0, 1, 0], -0.3 * Math.sin(ph) * d, c);
    this.rot('RightArm', [1, 0, 0], (-1.2 - 1.0 * up) * d, c); this.rot('LeftArm', [1, 0, 0], (-1.2 - 1.0 * up2) * d, c);
    this.rot('RightForeArm', [1, 0, 0], -0.5 * d, c); this.rot('LeftForeArm', [1, 0, 0], -0.5 * d, c);
    this.rot('Head', [0, 0, 1], 0.2 * Math.sin(ph) * d, c);
    c.model.position.y = this.friendBaseY + Math.abs(Math.sin(ph)) * 0.06 * d;
  }
  /** the little key prompts at the bottom of the screen: only what you can do right here */
  contextTips() {
    const g = this.g, P = g.player, tips = [];
    if (this.s.nap) return [['N', 'Wake up']];
    if (this.s.talk) return [];
    if (g.seated) return [['B', 'Stand up']];
    if (g.house?.focus?.active || g.photo || g.ride?.riding) return tips;
    const f = g.friend, fd = f ? f.pos.distanceTo(P.pos) : 99;
    if (fd < 4) tips.push(['T', this.dialogue.quest.state === 'active' && g.interact?.held?.id === 'toy_boat' ? 'Give the boat back!' : 'Talk']);
    if (this.nearestSeat(1.6)) tips.push(['B', 'Sit']);
    if (this.nearestNap(1.8)) tips.push(['N', 'Nap']);
    if (this.nearestBall(1.4)) tips.push(['K', 'Kick']);
    if (!this.inv.shell.equipped && !g.interact?.held) tips.push(['H', 'Take out shell']);
    if (this.s.dance) tips.push(['F', 'Stop dancing']);
    if (this.s.crouch) tips.push(['Z', 'Stand up']);
    const dark = g.indoors ? false : (g.sky?.elevation ?? 30) < 4;
    if (dark && !this.s.flashlight) tips.push(['U', 'Flashlight']);
    return tips.slice(0, 3);
  }

  // ------------------------------------------------------------------ persistence
  save() { try { localStorage.setItem(SAVE, JSON.stringify({ inv: this.inv, light: this.s.flashlight, run: this.s.run, quest: this.dialogue?.quest })); } catch (e) { /* storage blocked */ } }
  load() { let d = null; try { d = JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { d = null; } if (d?.inv?.shell) this.inv.shell = { ...this.inv.shell, ...d.inv.shell }; if (d) { this.s.run = !!d.run; this._quest = d.quest; } }
}

// ------------------------------------------------------------------ talking with your friend
class Dialogue {
  constructor(A) {
    this.A = A; this.g = A.g; this.el = document.getElementById('dialogue');
    this.quest = A._quest || { state: 'none' };      // none | active | done
    this.toy = null;
  }
  open() {
    const g = this.g, A = this.A, f = g.friend;
    A.s.talk = true; g.player.vel.set(0, 0, 0);
    const P = g.player, d = f.pos.clone().sub(P.pos); P.face = Math.atan2(d.x, d.z); f.face = Math.atan2(-d.x, -d.z);
    // conversation camera: over Wren's shoulder looking at her friend
    const mid = P.pos.clone().lerp(f.pos, 0.5).add(V3(0, 1.4, 0));
    const side = V3(d.z, 0, -d.x).normalize();
    const camP = P.pos.clone().addScaledVector(d.clone().normalize(), -1.3).addScaledVector(side, 0.75).add(V3(0, 1.7, 0));
    if (!g.indoors) camP.y = Math.max(camP.y, (g.floorAt?.(camP, false) ?? 0) + 0.6);
    g.camShot = { pos: camP, look: mid, fov: 48 };
    document.body.classList.add('talking'); f.talking = true;
    this.node(this.start());
  }
  close() { const A = this.A; A.s.talk = null; this.g.camShot = null; this.el.hidden = true; document.body.classList.remove('talking'); if (this.g.friend) this.g.friend.talking = false; }
  start() {
    const q = this.quest, held = this.g.interact?.held;
    if (q.state === 'active' && held?.id === 'toy_boat') return 'found';
    if (q.state === 'active') return 'ask';
    if (q.state === 'done') return 'chat';
    return 'hello';
  }
  node(id) {
    const N = {
      hello: { text: 'Hi Hannah! Want to help me find my missing toy boat?', face: '😊', choices: [['Yes! Let\'s find it!', 'accept'], ['Where did you last see it?', 'where'], ['Maybe later!', 'later']] },
      where: { text: 'I was sailing it by the tide pools… then a big wave came! It must have washed up on the sand somewhere.', face: '🤔', choices: [['I\'ll find it!', 'accept'], ['Maybe later!', 'later']] },
      accept: { text: 'Yay! Thank you! It\'s little and red with a white sail. Look near the tide pools and along the beach.', face: '🥳', run: () => this.startQuest(), choices: [['On my way!', null]] },
      later: { text: 'Okay! Come find me anytime.', face: '🙂', choices: [['Bye!', null]] },
      ask: { text: 'Any luck finding my boat? I think it\'s somewhere near the tide pools.', face: '🙂', choices: [['Still looking!', null], ['Can you give me a hint?', 'hint']] },
      hint: { text: this.hint(), face: '🤫', choices: [['Thanks!', null]] },
      found: { text: 'MY BOAT! You found it! You\'re the best, Hannah!', face: '🤩', run: () => this.finishQuest(), choices: [['You\'re welcome!', null]] },
      chat: { text: ['What should we do next?', 'The sea turtle likes it when you visit!', 'Have you tried cooking pancakes in the kitchen?'][Math.floor(Math.random() * 3)], face: '😄', choices: [['Let\'s dance!', 'dance'], ['Let\'s cook something!', 'cook'], ['See you later!', null]] },
      dance: { text: 'Woo! Dance party!', face: '💃', run: () => { this.close(); this.A.toggleDance(true); }, choices: [] },
      cook: { text: 'The recipe book is on the kitchen island. Press X to open it anytime!', face: '👩‍🍳', choices: [['Okay!', null]] },
    };
    const n = N[id]; if (!n) { this.close(); return; }
    n.run?.();
    if (!this.A.s.talk) return;
    this.el.hidden = false;
    this.el.innerHTML = `<div class="who"><span class="face">${n.face}</span><b>Your friend</b></div><p>${n.text}</p><div class="choices">${n.choices.map(([t, next], i) => `<button data-next="${next ?? ''}">${i + 1}. ${t}</button>`).join('')}</div><small>Choose with the mouse or number keys · T or Esc to leave</small>`;
    this.el.querySelectorAll('button').forEach(b => b.onclick = () => { const nx = b.dataset.next; if (nx) this.node(nx); else this.close(); });
    this.el.querySelector('button')?.focus({ preventScroll: true });
    this.g.audio?.chime?.(700 + Math.random() * 200);
  }
  choose(i) { const b = this.el.querySelectorAll('.choices button')[i]; b?.click(); }
  hint() { const t = this.toy; if (!t) return 'Look near the water!'; const p = t.object.getWorldPosition(V3(0, 0, 0)), P = this.g.player.pos; const dx = p.x - P.x, dz = p.z - P.z; const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'toward the sea' : 'toward the cliffs'); return `I think it's ${Math.round(Math.hypot(dx, dz))} steps ${dir} from here.`; }
  startQuest() { this.quest = { state: 'active' }; this.spawnToy(); this.A.save(); this.g.toast?.('New quest: find the toy boat!'); this.g.hudExtra?.newObjective('Find your friend\'s toy boat'); }
  finishQuest() {
    const sys = this.g.interact, t = this.toy;
    if (t && sys.held === t) { sys.held = null; t.held = false; t.object.visible = false; this.g.scene.add(t.object); t.state.gone = true; }
    this.quest = { state: 'done' }; this.A.save();
    this.g.friend?.cheer?.(); this.A.cheer();
    this.g.hudExtra?.completeObjective('Find your friend\'s toy boat');
  }
  /** a little red toy boat washed up on the beach (a real pickable item) */
  spawnToy() {
    if (this.toy) return;
    const g = this.g, sys = g.interact; if (!sys) return;
    const { Item, Slot } = g.houseKit;
    const grp = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.09), new THREE.MeshStandardNodeMaterial({ color: 0xD62828, roughness: 0.5 })); hull.position.y = 0.03; grp.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6), new THREE.MeshStandardNodeMaterial({ color: 0x8B5A2B })); mast.position.y = 0.15; grp.add(mast);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 3), new THREE.MeshStandardNodeMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide })); sail.scale.z = 0.1; sail.position.set(0.03, 0.15, 0); grp.add(sail);
    grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const spot = g.toySpot?.() || g.player.pos.clone().add(V3(4, 0, 4));
    const holder = new THREE.Object3D(); holder.position.copy(spot); g.scene.add(holder);
    const slot = sys.addSlot(new Slot({ id: 'toy_spot', name: 'on the sand', parent: holder, pos: [0, 0, 0] }));
    const it = new Item({ id: 'toy_boat', name: 'toy boat', object: grp, tags: ['toy', 'keep'], home: slot });
    it.baseScale = 1; sys.add(it); sys.place(it, slot); this.toy = it;
  }
  update(dt) {
    if (!this._restored && this.g.houseKit && this.g.hudExtra) {
      this._restored = true; const H = this.g.hudExtra, T = 'Find your friend\'s toy boat';
      if (this.quest.state === 'active') { this.spawnToy(); H.newObjective(T); }
      if (this.quest.state === 'done') { H.newObjective(T); H.completeObjective(T); }
    }
    // the toy boat bobs and glints so it can be spotted from afar
    const t = this.toy; if (t && t.slot?.id === 'toy_spot' && Math.random() < dt * 2) this.g.fxGlow?.emit(t.object.getWorldPosition(V3(0, 0, 0)).add(V3(0, 0.25, 0)), V3(0, 0.6, 0), { life: 0.9, size: 0.1, color: [1, 0.9, 0.6], alpha: 0.8 });
  }
}
