// Powers, quests and creatures for Pearl Cove.
import * as THREE from 'three/webgpu';
import { color, mix, float, positionWorld, mx_noise_float, vec3, time, sin } from 'three/tsl';
import { H, G, V, rng } from './world.js';

// ------------------------------------------------------------------ powers
export class Powers {
  constructor(game) { this.g = game; this.waterCd = 0; this.loveCd = 0; this.casting = 0; }

  clamPos() {
    const c = this.g.wren;
    if (this.g.clam) return this.g.clam.getWorldPosition(new THREE.Vector3());
    return c.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
  }

  water(dt = 0) {
    const g = this.g, P = g.player;
    if (this.waterCd > 0 || g.sliding >= 0) return;
    this.waterCd = 0.07;
    const fwd = new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face));
    const o = this.clamPos().addScaledVector(fwd, 0.15);
    const standing = Math.hypot(P.vel.x, P.vel.z) < 0.5;
    if (standing && !g.wren.busy) { g.wren.play('WaterCast', { from: 1.55, to: 2.35, timeScale: 1.3, fadeIn: 0.1 }); }
    for (let i = 0; i < 5; i++) {
      const v = fwd.clone().multiplyScalar(8 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 3.2 + Math.random() * 1.4, (Math.random() - 0.5) * 1.1));
      v.x += P.vel.x * 0.6; v.z += P.vel.z * 0.6;
      g.fxWater.emit(o, v, { life: 1.6, size: 0.12 + Math.random() * 0.08, color: [0.8, 0.95, 1], gravity: 14, onHit: (p, wet) => this.splash(p, wet) });
    }
    if (Math.random() < 0.5) g.fxGlow.emit(o, fwd.clone().multiplyScalar(2).add(new THREE.Vector3(0, 0.6, 0)), { life: 0.35, size: 0.35, color: [0.6, 0.95, 1], alpha: 0.5 });
    g.audio?.water();
    g.quests.onWater(o, fwd);
  }

  splash(p, onWater) {
    const g = this.g;
    for (let i = 0; i < 3; i++) g.fxWater.emit(p.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2), { life: 0.45, size: 0.07, color: [0.9, 0.98, 1], gravity: 12 });
    if (onWater) g.decals?.splashRing(p, 0.35 + Math.random() * 0.2);
    if (Math.random() < 0.08) g.audio?.splash(false);
    else g.fxFoam.emit(p.clone().add(new THREE.Vector3(0, 0.04, 0)), new THREE.Vector3(), { life: 0.6, size: 0.3, grow: 0.8, color: [0.75, 0.68, 0.55], alpha: 0.3 });
  }

  love() {
    const g = this.g;
    if (this.loveCd > 0) return;
    this.loveCd = 1.1;
    const origin = g.wren.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    if (!g.wren.busy && Math.hypot(g.player.vel.x, g.player.vel.z) < 0.6) g.wren.play('LoveHeart', { from: 3.6, to: 5.2, timeScale: 1.25, fadeIn: 0.15 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      g.fxHeart.emit(origin, new THREE.Vector3(Math.cos(a) * 2.6, 1.6 + Math.random() * 1.8, Math.sin(a) * 2.6), { life: 1.6, size: 0.28 + Math.random() * 0.14, drag: 1.4, gravity: -0.6 });
    }
    for (let i = 0; i < 16; i++) g.fxGlow.emit(origin, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4), { life: 1.1, size: 0.25, color: [1, 0.6, 0.78], alpha: 0.7, drag: 2 });
    g.fxGlow.emit(origin, new THREE.Vector3(), { life: 0.7, size: 3.5, grow: 1.4, color: [1, 0.55, 0.75], alpha: 0.35 });
    g.audio?.love();
    // flowers spring up around her (not in the water)
    g.blooms?.spawn(g.player.pos, { now: g.time, waterLevelAt: (x, z) => g.player.waterLevelAt(new THREE.Vector3(x, 0, z)) });
    g.quests.onLove(origin);
    g.friend?.cheer?.();
  }

  speedTrail() {
    const g = this.g, p = g.wren.root.position;
    g.fxGlow.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 1.1, (Math.random() - 0.5) * 0.4)), new THREE.Vector3(0, 0.25, 0), { life: 0.5, size: 0.3, color: [0.55, 1, 0.85], alpha: 0.6 });
    if (Math.random() < 0.4) g.fxFoam.emit(p.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5)), { life: 0.6, size: 0.35, grow: 1.2, color: [0.86, 0.78, 0.62], alpha: 0.35 });
  }

  update(dt) { this.waterCd -= dt; this.loveCd -= dt; }
}

// ------------------------------------------------------------------ creatures
export class Creatures {
  constructor(scene, zone) {
    this.scene = scene; this.R = rng(21);
    this.gull = this.makeGull(zone.quests.gull);
    this.crabs = zone.tidePools.map(([x, y]) => this.makeCrab(x, y));
    this.butterflies = this.makeButterflies(zone);
  }
  makeGull([x, y]) {
    const g = new THREE.Group(); g.position.copy(V(x, y)); this.scene.add(g);
    const white = new THREE.MeshStandardNodeMaterial({ color: 0xf7f7f5, roughness: 0.7 }), grey = new THREE.MeshStandardNodeMaterial({ color: 0x8e9aa2, roughness: 0.7 }), orange = new THREE.MeshStandardNodeMaterial({ color: 0xf2a33a, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), white); body.scale.set(1, 0.8, 1.45); body.position.y = 0.4; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), white); head.position.set(0, 0.66, 0.3); g.add(head);
    const eye = new THREE.MeshStandardNodeMaterial({ color: 0x111111, roughness: 0.2 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eye); e.position.set(s * 0.09, 0.69, 0.4); g.add(e); }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 10), orange); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.63, 0.5); g.add(beak);
    const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.3), grey); w.geometry.translate(s * 0.3, 0, 0); w.position.set(s * 0.12, 0.47, -0.02); g.add(w); return w; });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.22), grey); tail.position.set(0, 0.45, -0.42); g.add(tail);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), orange); l.position.set(s * 0.07, 0.11, 0); g.add(l); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { g, head, wings, base: g.position.clone(), happy: false, t: 0 };
  }
  makeCrab(x, y) {
    const c = new THREE.Group(); c.position.copy(V(x, y, H(x, y) + 0.05)); c.visible = false; this.scene.add(c);
    const m = new THREE.MeshPhysicalNodeMaterial({ color: 0xff6a3d, roughness: 0.35, clearcoat: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), m); body.scale.set(1.25, 0.5, 1); body.position.y = 0.13; c.add(body);
    const eye = new THREE.MeshStandardNodeMaterial({ color: 0x101010, roughness: 0.2 });
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), m); claw.scale.set(1, 0.7, 1.3); claw.position.set(s * 0.32, 0.16, 0.18); c.add(claw);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), m); stalk.position.set(s * 0.07, 0.25, 0.14); c.add(stalk);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), eye); e.position.set(s * 0.07, 0.31, 0.14); c.add(e);
      for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), m); leg.position.set(s * 0.26, 0.07, -0.08 + k * 0.08); leg.rotation.z = s * 1.0; c.add(leg); }
    }
    c.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { c, x, y };
  }
  makeButterflies(zone) {
    const list = [], R = this.R;
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6, emissive: 0x331122 });
    for (let i = 0; i < 14; i++) {
      const [x, y] = zone.hibiscus[i % zone.hibiscus.length];
      const g = new THREE.Group(); this.scene.add(g);
      const cols = [0xff8fb8, 0x8fd8ff, 0xffd166, 0xc49bff];
      const m = mat.clone(); m.color.set(cols[i % 4]);
      const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), m); w.geometry.translate(s * 0.06, 0, 0); g.add(w); return w; });
      list.push({ g, wings, cx: x, cy: y, ph: R() * 10, r: 0.6 + R() * 1.2 });
    }
    return list;
  }
  update(dt, t, playerPos) {
    const G_ = this.gull;
    if (G_.happy) {
      G_.t += dt; const a = G_.t * 0.7;
      G_.g.position.set(-30 + Math.cos(a) * 7, H(-30, 2) + 7 + Math.sin(G_.t * 1.7) * 0.8, -2 + Math.sin(a) * 7);
      G_.g.rotation.y = -a; G_.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * Math.sin(t * 9) * 0.7);
    } else {
      G_.head.rotation.x = 0.35 + Math.sin(t * 0.7) * 0.05;
      G_.g.rotation.y = Math.sin(t * 0.2) * 0.4;
    }
    for (const c of this.crabs) if (c.c.visible) { c.c.rotation.y = Math.sin(t * 3.5 + c.x) * 0.7; c.c.position.y = H(c.x, c.y) + 0.05 + Math.abs(Math.sin(t * 6 + c.x)) * 0.1; }
    for (const b of this.butterflies) {
      const k = t * 0.6 + b.ph;
      b.g.position.set(b.cx + Math.cos(k) * b.r + Math.sin(k * 2.3) * 0.3, H(b.cx, b.cy) + 1.2 + Math.sin(k * 3.1) * 0.4, -(b.cy + Math.sin(k * 1.3) * b.r));
      b.g.rotation.y = -k;
      const f = Math.sin(t * 22 + b.ph) * 1.1; b.wings[0].rotation.y = f; b.wings[1].rotation.y = -f;
    }
  }
}

// ------------------------------------------------------------------ quests
export class Quests {
  constructor(game, zone) {
    this.g = game; this.zone = zone;
    this.S = { shells: 0, slid: false, pools: 0, gull: false, chest: false, turtle: false };
    this.say = (e, force = false) => game.speech?.say(e, { force });
    this.wasReady = false;
    const mat = new THREE.MeshPhysicalNodeMaterial({ color: 0xffc9d8, roughness: 0.25, clearcoat: 1, emissive: 0xff7aa0, emissiveIntensity: 0.55 });
    this.shells = zone.quests.shells.map(([x, y]) => {
      const g = new THREE.Group(); g.position.copy(V(x, y, H(x, y) + 0.35)); game.scene.add(g);
      let m;
      const src = game.assets.models.SM_Shells_Cluster;
      if (src) { m = src.scene.clone(true); m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xff86b0); o.material.emissiveIntensity = 0.35; o.castShadow = true; } }); const b = new THREE.Box3().setFromObject(m); const s = 0.42 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z); m.scale.setScalar(s); m.position.y = -0.12; }
      else { m = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 12), mat); m.rotation.z = Math.PI / 2.4; }
      g.add(m);
      return { g, x, y, got: false };
    });
    this.pools = game.water.pools;
    this.ringPos = V(zone.slide.ring[0], zone.slide.ring[1]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 10, 48), new THREE.MeshStandardNodeMaterial({ color: 0x8fe0c8, emissive: 0x5fe0c0, emissiveIntensity: 1.2 }));
    ring.rotation.x = Math.PI / 2; ring.position.copy(this.ringPos).add(new THREE.Vector3(0, 0.12, 0)); game.scene.add(ring); this.ring = ring;
    const cpos = zone.quests.chest; this.chestPos = V(cpos[0], cpos[1]);
    this.load();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 24, 1, true), new THREE.MeshBasicNodeMaterial({ color: 0xfff3b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.copy(this.chestPos).add(new THREE.Vector3(0, 20, 0)); game.scene.add(beam); this.beam = beam;
  }

  get ready() { const S = this.S; return S.shells >= 8 && S.slid && S.pools >= 2 && S.gull; }

  onWater(origin, fwd) {
    for (const p of this.pools) {
      if (p.done) continue;
      const d = Math.hypot(origin.x - p.x, -origin.z - p.y);
      if (d < 7.5) {
        p.fill = Math.min(1, p.fill + 0.03);
        if (p.fill >= 1) { p.done = true; this.S.pools++; this.g.creatures.crabs[this.pools.indexOf(p)].c.visible = true; this.g.toast(this.S.pools === 2 ? 'Both tide pools are full. The crabs are dancing!' : 'A crab popped out to say thanks!'); this.g.audio?.chime(); this.g.friend?.cheer(); this.say('pool', true); this.changed(); }
      }
    }
  }
  onLove(origin) {
    const gl = this.g.creatures.gull;
    if (!this.S.gull && origin.distanceTo(gl.g.position) < 9) { this.S.gull = true; gl.happy = true; this.g.toast('The seagull is happy again!'); this.g.audio?.chime(880); this.say('gull', true); this.changed(); }
    else if (!this._flowersSaid && !this.g.player.c.swimming) { this._flowersSaid = true; setTimeout(() => this.say('flowers'), 900); }
    // love works under water too: the turtle loves it
    const tu = this.g.under?.turtle;
    if (tu && origin.distanceTo(tu.root.position) < 5) this.meetTurtle();
  }

  update(dt, t) {
    const g = this.g, P = g.player.pos;
    for (const s of this.shells) {
      if (s.got) continue;
      s.g.rotation.y += dt * 1.4; s.g.position.y = H(s.x, s.y) + 0.35 + Math.sin(t * 2 + s.x) * 0.07;
      if (Math.hypot(P.x - s.x, -P.z - s.y) < 1.3 && Math.abs(P.y - s.g.position.y) < 1.8) {
        s.got = true; s.g.visible = false; this.S.shells++;
        for (let i = 0; i < 18; i++) g.fxGlow.emit(s.g.position, new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), { life: 0.9, size: 0.2, color: [1, 0.8, 0.9], gravity: 3 });
        g.audio?.pickup();
        g.toast(this.S.shells === 8 ? 'All 8 shells! The museum is full.' : `Shell ${this.S.shells} of 8`);
        if (this.S.shells === 8) this.say('shells_done', true); else if (Math.random() < 0.45) this.say('shell');
        this.changed();
      }
    }
    for (const p of this.pools) {
      const lvl = H(p.x, p.y) - 0.3 + p.fill * 0.42;
      p.mesh.position.y = lvl; p.mesh.scale.setScalar(0.45 + p.fill * 0.55);
      p.mesh.visible = p.fill > 0.02;
      // scale around the pool centre
      p.mesh.position.x = p.x * (1 - p.mesh.scale.x); p.mesh.position.z = -p.y * (1 - p.mesh.scale.z);
    }
    // bonus: swim down to the sea turtle
    const tu = g.under?.turtle;
    if (tu && !this.S.turtle && g.player.underwater && P.distanceTo(tu.root.position) < 3.5) this.meetTurtle();
    if (g.player.underwater && !this._diveSaid) this._diveSaid = this.say('dive');
    // nothing has happened for a while: a gentle hint about something still to do
    if (g.speech && g.speech.quiet > 40) {
      const S = this.S, open = [S.shells < 8 && 'hint_shells', !S.slid && 'hint_slide', S.pools < 2 && 'hint_pools', !S.gull && 'hint_gull', !S.turtle && 'hint_turtle'].filter(Boolean);
      if (open.length) this.say(open[Math.floor(Math.random() * open.length)]); else g.speech.quiet = 0;
    }
    this.ring.visible = true;   // the slide can be ridden again and again this.ring.rotation.z += dt; this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    this.beam.material.opacity = this.ready && !this.S.chest ? 0.16 + Math.sin(t * 2) * 0.04 : 0;
    const dc = Math.hypot(P.x - this.chestPos.x, P.z - this.chestPos.z);
    if (!this.S.chest && dc < 2.4) {
      if (this.ready) { this.S.chest = true; this.changed(); g.onWin(this.chestPos); }
      else if (!this._lockedMsg || t - this._lockedMsg > 4) { this._lockedMsg = t; g.toast('Locked. Finish the other quests first.'); }
    }
  }

  meetTurtle() {
    if (this.S.turtle) return;
    const g = this.g, tu = g.under.turtle;
    this.S.turtle = true; tu.happy = 2.5;
    g.toast('The sea turtle says hello!'); g.audio?.chime(660);
    for (let i = 0; i < 14; i++) g.fxHeart.emit(tu.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), { life: 1.4, size: 0.22, drag: 1.2, gravity: -0.4 });
    this.say('turtle', true);
    this.changed();
  }

  // ---- save game: progress is kept in this browser between visits
  get saveKey() { return `hg.save.${this.zone.id || 'pearl_cove'}`; }
  save() {
    try { localStorage.setItem(this.saveKey, JSON.stringify({ v: 1, S: this.S, shells: this.shells.map(s => s.got), pools: this.pools.map(p => p.fill) })); } catch (e) { /* storage may be blocked */ }
  }
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.saveKey) || 'null'); } catch (e) { d = null; }
    if (!d || d.v !== 1) return;
    Object.assign(this.S, d.S);
    d.shells?.forEach((got, i) => { if (got && this.shells[i]) { this.shells[i].got = true; this.shells[i].g.visible = false; } });
    d.pools?.forEach((f, i) => { const p = this.pools[i]; if (!p) return; p.fill = f; if (f >= 1) { p.done = true; const c = this.g.creatures.crabs[i]; if (c) c.c.visible = true; } });
    if (this.S.gull && this.g.creatures.gull) this.g.creatures.gull.happy = true;
    this.wasReady = this.ready;
    this.restored = true;
  }
  static reset(zoneId = 'pearl_cove') { try { localStorage.removeItem(`hg.save.${zoneId}`); } catch (e) { /* ignore */ } }

  changed() {
    this.save();
    this.g.hud.quests(this.S, this.ready);
    if (this.ready && !this.wasReady && !this.S.chest) { this.wasReady = true; setTimeout(() => this.say('ready', true), 3200); }
  }
}
