// Characters: skinned model + animation blending, a physics-driven player controller for
// Wren, and a companion that follows her around.
import * as THREE from 'three/webgpu';
import { toNodeMaterial } from './dressing.js';
import { extractMesh } from './assets.js';

const LOCO = ['Idle', 'Walk', 'Run', 'Sprint'];
const NOMINAL = { Idle: 0, Walk: 1.5, Run: 4.4, Sprint: 12 };   // m/s each clip was authored for

/** keep the hips from rising in jump clips: the physics owns vertical motion */
function flattenHips(clip) {
  const c = clip.clone();
  const t = c.tracks.find(t => t.name.endsWith('Hips.position'));
  if (t) { const y0 = t.values[1]; for (let i = 1; i < t.values.length; i += 3) t.values[i] = Math.min(t.values[i], y0); }
  return c;
}

export class Character {
  constructor(scene, gltf, clips, { name, height = 1.6 } = {}) {
    this.name = name;
    this.root = new THREE.Group(); scene.add(this.root);
    this.model = gltf.scene;
    this.root.add(this.model);
    this.model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = toNodeMaterial(o.material);
        // Meshy exports a full-strength emissive map that makes characters glow; they are lit by the scene instead
        o.material.emissiveMap = null; o.material.emissive.setRGB(0, 0, 0);
        o.material.roughness = 0.82; o.material.metalness = 0;
      }
    });
    this.bones = {};
    this.model.traverse(o => { if (o.isBone) this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    const all = { Idle: gltf.animations[0], ...clips };
    for (const [n, clip] of Object.entries(all)) {
      if (!clip) continue;
      const c = (n === 'Jump' || n === 'Backflip') ? flattenHips(clip) : clip;
      c.name = n;
      const a = this.mixer.clipAction(c);
      if (LOCO.includes(n) || n === 'Skip') { a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); }
      this.actions[n] = a;
    }
    this.loco = { Idle: 1, Walk: 0, Run: 0, Sprint: 0 };
    this.oneShot = null;
    this.speed = 0;
    this.skipping = false;
  }

  /** play a one-off move (jump, backflip, cast, love, wave) over the locomotion blend */
  play(name, { from = 0, to = null, timeScale = 1, fadeIn = 0.12, fadeOut = 0.25, onDone } = {}) {
    const a = this.actions[name]; if (!a) { onDone?.(); return false; }
    if (this.oneShot && this.oneShot.action !== a) this.oneShot.action.fadeOut(0.1);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    a.time = from; a.timeScale = timeScale; a.setEffectiveWeight(1); a.fadeIn(fadeIn); a.play();
    this.oneShot = { action: a, end: to ?? a.getClip().duration, fadeOut, onDone };
    return true;
  }

  get busy() { return !!this.oneShot; }

  update(dt, speed, grounded = true) {
    this.speed = speed;
    // blend tree: weights from speed between neighbouring clips
    const w = { Idle: 0, Walk: 0, Run: 0, Sprint: 0 };
    if (speed < 0.15) w.Idle = 1;
    else if (speed < NOMINAL.Walk) { const k = speed / NOMINAL.Walk; w.Idle = 1 - k; w.Walk = k; }
    else if (speed < NOMINAL.Run) { const k = (speed - NOMINAL.Walk) / (NOMINAL.Run - NOMINAL.Walk); w.Walk = 1 - k; w.Run = k; }
    else if (speed < 7.5) w.Run = 1;
    else { const k = Math.min(1, (speed - 7.5) / 3); w.Run = 1 - k; w.Sprint = k; }
    if (!this.actions.Sprint) { w.Run += w.Sprint; w.Sprint = 0; }
    const useSkip = this.skipping && this.actions.Skip && w.Walk > 0;
    const os = this.oneShot ? Math.max(0, Math.min(1, this.oneShot.action.getEffectiveWeight())) : 0;
    for (const n of LOCO) {
      this.loco[n] += (w[n] - this.loco[n]) * Math.min(1, dt * 10);
      const a = this.actions[n]; if (!a) continue;
      a.setEffectiveWeight(this.loco[n] * (1 - os) * (n === 'Walk' && useSkip ? 0 : 1));
      if (NOMINAL[n] > 0) a.timeScale = THREE.MathUtils.clamp(speed / NOMINAL[n], 0.6, 1.6);
    }
    if (this.actions.Skip) { this.actions.Skip.setEffectiveWeight(useSkip ? this.loco.Walk * (1 - os) : 0); this.actions.Skip.timeScale = THREE.MathUtils.clamp(speed / 2.2, 0.7, 1.4); }
    // finish one-shots at their end time
    if (this.oneShot) {
      const o = this.oneShot, a = o.action;
      if (a.time >= o.end - 0.001 || !a.isRunning()) {
        if (!o.fading) { a.fadeOut(o.fadeOut); o.fading = true; o.doneAt = o.fadeOut; o.onDone?.(); }
      }
      if (o.fading) { o.doneAt -= dt; if (o.doneAt <= 0) { a.stop(); this.oneShot = null; } }
    }
    this.mixer.update(dt);
  }

  /** attach a static model (the clam) to a bone, sized in metres */
  attach(boneName, gltf, { size = 0.16, offset = [0, 0, 0], rotation = [0, 0, 0] } = {}) {
    const bone = this.bones[boneName]; const src = extractMesh(gltf);
    if (!bone || !src) return null;
    const mesh = new THREE.Mesh(src.geometry, toNodeMaterial(src.material));
    mesh.castShadow = true;
    const box = src.box, s = new THREE.Vector3(); box.getSize(s);
    this.model.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); bone.getWorldScale(ws);
    mesh.scale.setScalar(size / Math.max(s.x, s.y, s.z) / ws.x);
    mesh.position.set(...offset).divideScalar(ws.x);
    mesh.rotation.set(...rotation);
    bone.add(mesh);
    return mesh;
  }

  worldPos(boneName, out = new THREE.Vector3()) { const b = this.bones[boneName]; return b ? b.getWorldPosition(out) : this.root.getWorldPosition(out); }
}

// ---------------------------------------------------------------------------------------

export class Player {
  constructor(char, body, input, { level }) {
    this.c = char; this.body = body; this.input = input; this.waterLevel = level;
    this.vel = new THREE.Vector3(); this.face = 0; this.vy = 0;
    this.coyote = 0; this.jumpBuffer = 0; this.canFlip = true; this.airTime = 0;
    this.energy = 1; this.mode = 'walk'; this.sprinting = false;
  }

  get pos() { return this.body.feet; }

  update(dt, camYaw) {
    const I = this.input;
    // camera-relative wish direction
    const f = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw)), r = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = f.multiplyScalar(I.y).add(r.multiplyScalar(I.x));
    const mag = Math.min(1, wish.length());
    if (mag > 0.01) wish.normalize();

    const feet = this.pos;
    const depth = this.waterDepth(feet);
    this.sprinting = I.sprint && this.energy > 0.03 && mag > 0.2;
    let max = this.sprinting ? 13 : (mag < 0.55 ? 1.6 : 4.4);
    if (depth > 0.45) max *= this.sprinting ? 0.75 : 0.6;
    this.energy = THREE.MathUtils.clamp(this.energy + (this.sprinting ? -0.3 : 0.15) * dt, 0, 1);

    // accelerate toward the wish velocity (snappy but not instant)
    const target = wish.clone().multiplyScalar(max * mag);
    const accel = this.body.grounded ? 26 : 9;
    const dv = target.clone().sub(new THREE.Vector3(this.vel.x, 0, this.vel.z));
    const step = Math.min(dv.length(), accel * dt);
    if (dv.lengthSq() > 1e-6) dv.setLength(step);
    this.vel.x += dv.x; this.vel.z += dv.z;

    // jumping: coyote time + buffer, backflip as a double jump
    this.coyote = this.body.grounded ? 0.12 : this.coyote - dt;
    if (I.jumpPressed) { this.jumpBuffer = 0.14; I.jumpPressed = false; }
    else this.jumpBuffer -= dt;
    let jumped = null;
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.mode === 'walk') {
      this.vy = 7.2; this.coyote = 0; this.jumpBuffer = 0; this.canFlip = true; jumped = 'jump';
      this.c.play('Jump', { from: 0.5, to: 1.3, timeScale: 1.05, fadeIn: 0.06 });
    } else if (this.jumpBuffer > 0 && !this.body.grounded && this.canFlip && this.airTime > 0.12) {
      this.vy = 7.8; this.canFlip = false; this.jumpBuffer = 0; jumped = 'flip';
      this.c.play('Backflip', { from: 0.58, to: 1.55, timeScale: 1.05, fadeIn: 0.05 });
    }

    // gravity, with lighter fall in water
    if (this.body.grounded && this.vy <= 0) this.vy = -2;
    else this.vy -= (depth > 0.9 ? 6 : 22) * dt;
    if (depth > 1.15) this.vy = Math.max(this.vy, (this.waterLevelAt(feet) - 1.12 - feet.y) * 4);   // float
    this.airTime = this.body.grounded ? 0 : this.airTime + dt;

    const moved = this.body.move(new THREE.Vector3(this.vel.x * dt, this.vy * dt, this.vel.z * dt));
    if (this.body.grounded && this.vy < 0) this.vy = -2;
    // walked into a wall: drop only the part of the velocity that pushes into it
    for (const n of this.body.walls || []) { const d = this.vel.x * n.x + this.vel.z * n.z; if (d < 0) { this.vel.x -= n.x * d; this.vel.z -= n.z * d; } }
    // face the direction of travel
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.face; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.face += d * Math.min(1, dt * 12);
    }
    this.c.skipping = mag > 0.1 && mag < 0.55 && !this.sprinting;
    this.c.update(dt, this.body.grounded || depth > 0.9 ? hs : hs * 0.4);
    const p = this.pos;
    this.c.root.position.copy(p);
    this.c.root.rotation.y = this.face;
    // lean into turns and fast runs
    this.c.root.rotation.z = THREE.MathUtils.lerp(this.c.root.rotation.z, 0, Math.min(1, dt * 6));
    return { jumped, depth, speed: hs };
  }

  waterLevelAt(p) {
    const L = this.lagoon;
    if (L && Math.hypot((p.x - L.center[0]) / (L.radius[0] + 0.4), (-p.z - L.center[1]) / (L.radius[1] + 0.4)) < 1) return L.level;
    return this.waterLevel;
  }
  waterDepth(p) { return Math.max(0, this.waterLevelAt(p) - p.y); }
}

// ---------------------------------------------------------------------------------------

export class Companion {
  constructor(char, body, leader) {
    this.c = char; this.body = body; this.leader = leader;
    this.vel = new THREE.Vector3(); this.face = 0; this.vy = 0; this.idle = 0; this.mood = 0;
    this.side = 1;
  }
  get pos() { return this.body.feet; }

  update(dt) {
    const me = this.pos, lp = this.leader.pos;
    const lf = this.leader.face;
    // stay a little behind and beside Wren
    const back = new THREE.Vector3(Math.sin(lf), 0, Math.cos(lf)).multiplyScalar(-1.8);
    const side = new THREE.Vector3(Math.cos(lf), 0, -Math.sin(lf)).multiplyScalar(1.4 * this.side);
    const goal = lp.clone().add(back).add(side);
    const to = goal.sub(me); to.y = 0;
    const d = to.length();
    if (d > 30) { this.body.teleport(lp.x - 2, lp.y + 0.5, lp.z + 2); return; }
    const leaderSpeed = Math.hypot(this.leader.vel.x, this.leader.vel.z);
    let want = 0;
    if (d > 0.6) want = Math.min(d > 6 ? 12 : d > 2.5 ? 4.4 : 1.6, Math.max(1.4, leaderSpeed * 1.05));
    const target = d > 0.01 ? to.normalize().multiplyScalar(want) : new THREE.Vector3();
    const dv = target.sub(new THREE.Vector3(this.vel.x, 0, this.vel.z));
    const k = Math.min(1, dt * 7); this.vel.x += dv.x * k; this.vel.z += dv.z * k;
    if (this.body.grounded && this.vy <= 0) this.vy = -2; else this.vy -= 22 * dt;
    // hop when blocked and Wren is above
    if (this.body.grounded && want > 1 && lp.y - me.y > 0.6 && d < 4) this.vy = 8;
    this.body.move(new THREE.Vector3(this.vel.x * dt, this.vy * dt, this.vel.z * dt));
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.25) { const w = Math.atan2(this.vel.x, this.vel.z); let a = w - this.face; a = Math.atan2(Math.sin(a), Math.cos(a)); this.face += a * Math.min(1, dt * 8); }
    else { // when idle, turn to look at Wren
      const w = Math.atan2(lp.x - me.x, lp.z - me.z); let a = w - this.face; a = Math.atan2(Math.sin(a), Math.cos(a)); this.face += a * Math.min(1, dt * 3);
    }
    this.idle = hs < 0.2 ? this.idle + dt : 0;
    if (this.idle > 6 && !this.c.busy) { this.idle = -4; this.c.play('Wave', { timeScale: 1 }); }
    this.c.update(dt, hs);
    this.c.root.position.copy(this.pos);
    this.c.root.rotation.y = this.face;
  }

  cheer() {
    if (this.c.busy || !this.body.grounded || this.leader.waterDepth(this.pos) > 0.15) return;
    const flip = Math.random() < 0.5;
    this.vy = flip ? 7.8 : 7.2;
    this.c.play(flip ? 'Backflip' : 'Jump', flip ? { from: 0.58, to: 1.55, timeScale: 1.05 } : { from: 0.5, to: 1.3, timeScale: 1.05 });
  }
}
