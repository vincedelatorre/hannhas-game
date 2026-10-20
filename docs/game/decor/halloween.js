// Inflatable Halloween jack-o'-lantern with a ghost (purple witch hat, BOO! sign) that pops up and
// sinks back in, like a motorised front-yard inflatable. A reusable prefab: create as many as you like
// with their own size, facing and timing.
//
//   HalloweenPumpkin
//   ├── body      stitched 10-panel orange nylon shell with an opening on top, painted face, inner glow
//   ├── collar    dark inner rim at the opening (hides the cavity)
//   └── ghost     body + face, two arms, witch hat (band + buckle), BOO! sign → rises / sinks as one
//
// States: OFF → IDLE_HIDDEN → RISING → EXTENDED → RETRACTING → IDLE_HIDDEN … (delta-time driven,
// randomised waits, one cycle at a time). Click: turn on / pop the ghost up. Right-click: a small menu
// (turn off, pop up, speed slow / normal / fast, sound on / off). Settings persist per decoration.
import * as THREE from 'three/webgpu';
import { uniform, positionLocal, normalLocal, sin, float, time, texture, uv, vec3, mix, color } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Interactable } from '../house/interact.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const SAVE = 'hg.decor.halloween';
const OPEN = 0.66;   // wide top opening like the real inflatables (the ghost is big)
const GS = 1.55;    // ghost scale relative to its modelled size
const OPEN_UNUSED = 0.47;   // the opening on top (radians from the pole): wide enough for the hat brim
const SPEEDS = { slow: 0.65, normal: 1, fast: 1.6 };
const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ shared textures and geometry
let shared = null;
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function makeShared() {
  // pumpkin skin: 10 panels with darker seams and stitch dashes, the jack-o'-lantern face on the front
  const skin = canvasTex(2048, 1024, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#E8600A'); g.addColorStop(0.5, '#F7700F'); g.addColorStop(1, '#C24E06');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) {
      const cx = (i + 0.5) / 10 * W;     // panel middle: a soft highlight
      const r = x.createLinearGradient(cx - W / 20, 0, cx + W / 20, 0); r.addColorStop(0, 'rgba(120,40,0,0.35)'); r.addColorStop(0.5, 'rgba(255,200,120,0.18)'); r.addColorStop(1, 'rgba(120,40,0,0.35)');
      x.fillStyle = r; x.fillRect(cx - W / 20, 0, W / 10, H);
      const sx = i / 10 * W; x.strokeStyle = 'rgba(110,38,0,0.9)'; x.lineWidth = 6; x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx, H); x.stroke();
      x.strokeStyle = 'rgba(255,220,170,0.55)'; x.lineWidth = 3; x.setLineDash([10, 12]);
      for (const o of [-9, 9]) { x.beginPath(); x.moveTo(sx + o, 0); x.lineTo(sx + o, H); x.stroke(); }
      x.setLineDash([]);
    }
    // gentle fabric wrinkles
    x.globalAlpha = 0.12; x.strokeStyle = '#7a2c00'; x.lineWidth = 2;
    for (let k = 0; k < 140; k++) { const px = Math.random() * W, py = Math.random() * H; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 20, py + 6, px + 40 + Math.random() * 30, py + Math.random() * 10 - 5); x.stroke(); }
    x.globalAlpha = 1;
    // face centred on u = 0.25 (three.js sphere front, +Z)
    const fx = 0.25 * W, fy = 0.52 * H, s = W / 2048;
    x.fillStyle = '#1B1410';
    const eye = (ex, flip) => { x.beginPath(); x.moveTo(ex - 78 * s * flip, fy - 10 * s); x.quadraticCurveTo(ex - 40 * s * flip, fy - 150 * s, ex + 10 * s * flip, fy - 165 * s); x.quadraticCurveTo(ex + 70 * s * flip, fy - 120 * s, ex + 88 * s * flip, fy - 20 * s); x.quadraticCurveTo(ex + 10 * s * flip, fy + 15 * s, ex - 78 * s * flip, fy - 10 * s); x.closePath(); x.fill(); };
    eye(fx - 120 * s, 1); eye(fx + 120 * s, -1);
    x.beginPath(); x.moveTo(fx, fy - 20 * s); x.lineTo(fx - 32 * s, fy + 30 * s); x.lineTo(fx + 32 * s, fy + 30 * s); x.closePath(); x.fill();
    x.beginPath(); const mw = 260 * s, my = fy + 90 * s; x.moveTo(fx - mw, my);
    x.quadraticCurveTo(fx, my + 70 * s, fx + mw, my);
    x.quadraticCurveTo(fx + mw * 0.9, my + 120 * s, fx, my + 150 * s);
    x.quadraticCurveTo(fx - mw * 0.9, my + 120 * s, fx - mw, my); x.closePath(); x.fill();
    x.fillStyle = '#FF8A1C';   // zig-zag teeth cut into the mouth
    for (const tx of [-130, 0, 130]) { x.beginPath(); x.moveTo(fx + (tx - 34) * s, my + 38 * s); x.lineTo(fx + tx * s, my + 88 * s); x.lineTo(fx + (tx + 34) * s, my + 38 * s); x.closePath(); x.fill(); }
    for (const tx of [-65, 65]) { x.beginPath(); x.moveTo(fx + (tx - 30) * s, my + 150 * s); x.lineTo(fx + tx * s, my + 106 * s); x.lineTo(fx + (tx + 30) * s, my + 150 * s); x.closePath(); x.fill(); }
  });
  const ghostFace = canvasTex(1024, 512, (x, W, H) => {
    x.fillStyle = '#FBFBFF'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(150,160,190,0.35)'; x.lineWidth = 3; x.setLineDash([8, 10]);
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(i / 6 * W, 0); x.lineTo(i / 6 * W, H); x.stroke(); }
    x.setLineDash([]);
    const fx = 0.25 * W, fy = 0.36 * H;
    x.fillStyle = '#16121A';
    for (const ex of [-46, 46]) { x.beginPath(); x.ellipse(fx + ex, fy, 18, 30, 0, 0, 7); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(fx + ex + 5, fy - 10, 6, 8, 0, 0, 7); x.fill(); x.fillStyle = '#16121A'; }
    x.beginPath(); x.ellipse(fx, fy + 52, 16, 19, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,140,170,0.7)'; for (const cx of [-86, 86]) { x.beginPath(); x.ellipse(fx + cx, fy + 34, 24, 13, 0, 0, 7); x.fill(); }
  });
  const boo = canvasTex(512, 256, (x, W, H) => {
    x.fillStyle = '#FF8A1C'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(120,40,0,0.6)'; x.lineWidth = 5; x.setLineDash([12, 10]); x.strokeRect(16, 16, W - 32, H - 32); x.setLineDash([]);
    x.fillStyle = '#1B1410'; x.font = '900 150px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BOO!', W / 2, H / 2 + 8);
  });
  // geometry: a ribbed, slightly squat pumpkin shell with a hole on top (theta from 0.34 rad)
  const body = new THREE.SphereGeometry(1, 80, 48, 0, Math.PI * 2, OPEN, Math.PI - OPEN);
  const p = body.attributes.position, v = V3(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), lat = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
    const rib = 1 - 0.045 * Math.pow(Math.abs(Math.cos(a * 5)), 6) + 0.012 * Math.cos(a * 10);   // 10 puffy panels
    const squash = 0.92, bulge = 1 + 0.06 * Math.sin(lat);
    p.setXYZ(i, v.x * rib * bulge, v.y * squash, v.z * rib * bulge);
  }
  body.computeVertexNormals();
  const ghostBody = new THREE.LatheGeometry([
    [0.0, -0.62], [0.1, -0.62], [0.17, -0.45], [0.23, -0.2], [0.25, 0.0], [0.25, 0.22], [0.255, 0.36], [0.245, 0.46], [0.2, 0.55], [0.12, 0.6], [0, 0.62],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 40);
  return { skin, ghostFace, boo, body, ghostBody };
}

// ------------------------------------------------------------------ the prefab
export class HalloweenPumpkin {
  /** opts: { id, at: Vector3 (ground point), face: yaw, scale: 1 = 1.5 m tall, seed } */
  constructor(game, opts) {
    shared ||= makeShared();
    this.g = game; this.id = opts.id; this.size = opts.scale ?? 1;
    this.rand = mulberry(opts.seed ?? Math.floor(Math.random() * 1e6));
    const root = this.root = new THREE.Group(); root.name = 'HalloweenPumpkinInflatable';
    root.position.copy(opts.at); root.rotation.y = opts.face ?? 0; root.scale.setScalar(this.size);
    game.scene.add(root);
    this.glow = uniform(0); this.breath = uniform(0); this.squeeze = uniform(0); this.night = uniform(0);

    // ---- pumpkin body: nylon with stitched seams, inner light showing through the fabric
    const R = 0.78;
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0 });
    const tex = texture(shared.skin, uv());
    mat.colorNode = tex.rgb;
    const dark = tex.r.lessThan(0.2);   // the painted face stays dark; the panels glow warm from inside
    mat.emissiveNode = mix(tex.rgb.mul(vec3(1.0, 0.55, 0.18)).mul(this.glow).mul(this.night.mul(0.5).add(0.08)), vec3(0.08, 0.02, 0.0).mul(this.glow), dark.select(float(1), float(0)));
    // blower breathing + soft surface ripples + a little squash when the ghost drops back in
    const wob = sin(positionLocal.y.mul(9).add(time.mul(2.3))).mul(0.006).add(sin(positionLocal.x.mul(7).sub(time.mul(1.7))).mul(0.005));
    mat.positionNode = positionLocal.mul(vec3(this.squeeze.mul(0.03).add(1), this.squeeze.mul(-0.035).add(1).add(this.breath.mul(0.008)), this.squeeze.mul(0.03).add(1))).add(normalLocal.mul(wob.mul(this.glow.mul(0.6).add(0.4))));
    const body = this.body = new THREE.Mesh(shared.body, mat);
    body.scale.set(R, R, R); body.position.y = R * 0.92; body.castShadow = true; body.receiveShadow = true; body.name = 'PumpkinBody';
    root.add(body);
    // inner dark cavity + rim collar so you never see the ghost through the opening's sides
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.97, 32, 20, 0, Math.PI * 2, OPEN, Math.PI - OPEN), new THREE.MeshBasicNodeMaterial({ color: 0x1a0d04, side: THREE.BackSide }));
    inner.scale.copy(body.scale).multiplyScalar(1); inner.position.copy(body.position); inner.scale.y *= 0.92; root.add(inner);
    const collarR = Math.sin(OPEN) * R * 1.06;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(collarR, 0.035, 10, 40), new THREE.MeshStandardNodeMaterial({ color: 0x2C6B1F, roughness: 0.6 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = body.position.y + Math.cos(OPEN) * R * 0.92; root.add(collar);
    this.topY = collar.position.y;
    // a small green fabric stem tab stitched to the rim
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 10), collar.material); stem.position.set(collarR * 0.9, this.topY + 0.05, -0.05); stem.rotation.z = -0.4; root.add(stem);
    // blower box and a ground stake rope, like the real thing
    const blower = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.14, 0.16, 3, 0.03), new THREE.MeshStandardNodeMaterial({ color: 0x222222, roughness: 0.5 }));
    blower.position.set(-0.55, 0.07, -0.55); root.add(blower);

    // ---- ghost assembly (moves as one)
    const ghost = this.ghost = new THREE.Group(); ghost.name = 'GhostAssembly';
    const gmat = new THREE.MeshStandardNodeMaterial({ roughness: 0.38 });
    gmat.colorNode = texture(shared.ghostFace, uv()).rgb;
    gmat.emissiveNode = vec3(0.25, 0.25, 0.3).mul(this.glow).mul(this.night.mul(0.3).add(0.02));
    const gb = new THREE.Mesh(shared.ghostBody, gmat); gb.rotation.y = -Math.PI / 2; gb.castShadow = true; ghost.add(gb);   // lathe u=0.25 → faces +Z after the turn
    this.ghostBody = gb;
    const armM = new THREE.MeshStandardNodeMaterial({ color: 0xF8F8FF, roughness: 0.4 });
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0.24 * s, 0.22, 0.04); ghost.add(pivot);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 6, 12), armM); arm.position.set(0.06 * s, -0.06, 0.08); arm.rotation.z = 0.9 * s; arm.rotation.x = -0.7; pivot.add(arm);
      arm.castShadow = true; this.arms.push(pivot);
    }
    // witch hat: brim, cone with a slight bend, orange band, gold buckle
    const hat = this.hat = new THREE.Group(); hat.position.set(0, 0.56, 0); hat.rotation.z = 0.12; ghost.add(hat);
    const purple = new THREE.MeshStandardNodeMaterial({ color: 0x6B2FA8, roughness: 0.45 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 40), purple); brim.castShadow = true; hat.add(brim);
    const brimRoll = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.02, 8, 40), purple); brimRoll.rotation.x = Math.PI / 2; hat.add(brimRoll);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.5, 32, 6), purple); cone.position.y = 0.26; cone.castShadow = true; hat.add(cone);
    { const cp = cone.geometry.attributes.position; for (let i = 0; i < cp.count; i++) { const y = cp.getY(i) + 0.25; cp.setX(i, cp.getX(i) + y * y * 0.35); } cone.geometry.computeVertexNormals(); }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.19, 0.06, 32, 1, true), new THREE.MeshStandardNodeMaterial({ color: 0xFF8A1C, roughness: 0.5, side: THREE.DoubleSide })); band.position.y = 0.05; hat.add(band);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), new THREE.MeshStandardNodeMaterial({ color: 0xE8B923, metalness: 0.6, roughness: 0.3 })); buckle.position.set(0, 0.05, 0.188); hat.add(buckle);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.022), new THREE.MeshBasicNodeMaterial({ color: 0x6B2FA8 })); hole.position.set(0, 0.05, 0.19); hat.add(hole);
    this.hatCone = cone;
    // BOO! sign held in front of the chest
    const sign = this.sign = new THREE.Group(); sign.position.set(0, 0.08, 0.3); sign.rotation.x = -0.12; ghost.add(sign);
    const sb = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.21, 0.06, 4, 0.03), new THREE.MeshStandardNodeMaterial({ color: 0xFF8A1C, roughness: 0.45 })); sb.castShadow = true; sign.add(sb);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.18), new THREE.MeshStandardNodeMaterial({ map: shared.boo, roughness: 0.5 })); face.position.z = 0.031; sign.add(face);
    ghost.scale.setScalar(GS); root.add(ghost);
    this.hiddenY = this.topY - 1.08 * GS * 0.55 - 0.03;    // squashed (deflated) ghost: hat tip below the rim
    this.upY = this.topY + 0.04 * GS + 0.05;               // the BOO! sign clears the opening
    this.y = this.hiddenY; ghost.position.y = this.y; ghost.visible = false;

    // ---- collision: a solid cylinder you can't walk into (or get stuck inside)
    const wp = root.position;
    game.physics.addCollider({ type: 'cylinder', x: wp.x, z: wp.z, h: wp.y + 0.2, height: 1.45 * this.size, r: 0.74 * this.size });

    // ---- interaction (aim at it: "Halloween pumpkin · Turn on"; right-click for more)
    const it = this.it = new Interactable({ id: `halloween_pumpkin_${this.id}`, name: 'Halloween pumpkin', object: root, anchor: [0, 0.9, 0], radius: 2.6 * this.size, save: false });
    it.rayPick = true; it.reachBonus = 0.8 * this.size;
    it.verb = () => this.on ? { label: 'Make the ghost pop up!', run: () => this.popNow() } : { label: 'Turn on', run: () => this.setOn(true) };
    it.menu = () => this.openMenu();
    game.interact?.add(it);

    // ---- state
    this.state = 'OFF'; this.t = 0; this.wait = 1.5; this.speed = 'normal'; this.sound = true; this.forced = false;
    this.wob = { hat: 0, hatV: 0, prevY: this.y, vel: 0 };
    this.load();
    if (this.on) this.enter('IDLE_HIDDEN');
  }

  get on() { return this.state !== 'OFF'; }
  setOn(v) {
    if (v === this.on) return;
    if (v) { this.enter('IDLE_HIDDEN'); this.wait = 0.6; this.sfx('click'); }
    else { this.offPending = true; if (this.state === 'IDLE_HIDDEN') this.enter('OFF'); else if (this.state !== 'RETRACTING') this.enter('RETRACTING'); this.sfx('click'); }
    this.save();
  }
  popNow() { if (this.state === 'IDLE_HIDDEN') { this.forced = true; this.wait = 0; } else if (this.state === 'OFF') { this.setOn(true); this.forced = true; this.wait = 0.4; } }
  enter(s) {
    this.state = s; this.t = 0;
    const r = this.rand;
    if (s === 'IDLE_HIDDEN') this.wait = this.forced ? 0 : 2 + r() * 3;
    if (s === 'RISING') { this.dur = 0.8 + r() * 0.4; this.sfx('inflate'); }
    if (s === 'EXTENDED') { this.dur = 2 + r() * 1; this.sfx('boo'); }
    if (s === 'RETRACTING') { this.dur = 1.2 + r() * 0.6; this.sfx('deflate'); }
    if (s === 'OFF') { this.offPending = false; }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, camPos) {
    const near = camPos ? camPos.distanceTo(this.root.position) : 0;
    if (near > 90) return;                                   // too far to notice: skip animating
    const k = SPEEDS[this.speed] || 1, d = dt * k;
    const on = this.on;
    // inner light fades in and out; the blower makes it breathe a little
    this.glow.value += ((on ? 1 + Math.sin(performance.now() * 0.0021 + this.id) * 0.04 : 0) - this.glow.value) * Math.min(1, dt * 3);
    this.breath.value = on ? Math.sin(performance.now() * 0.004 + this.id * 2) : 0;
    this.t += d;
    const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    switch (this.state) {
      case 'IDLE_HIDDEN': if (this.t >= this.wait) { this.enter('RISING'); this.forced = false; } this.y = this.hiddenY; break;
      case 'RISING': {
        const x = Math.min(1, this.t / this.dur);
        // quick start, slowing at the top, a tiny overshoot
        const e = 1 - Math.pow(1 - x, 3); this.y = this.hiddenY + (this.upY - this.hiddenY) * (e + Math.sin(x * Math.PI) * 0.04);
        if (x >= 1) this.enter('EXTENDED');
        break;
      }
      case 'EXTENDED': {
        this.y = this.upY + Math.sin(this.t * 6) * 0.015 * Math.max(0, 1 - this.t);   // little bounce on arrival
        if (this.t >= this.dur) this.enter('RETRACTING');
        break;
      }
      case 'RETRACTING': {
        const x = Math.min(1, this.t / this.dur); this.y = this.upY + (this.hiddenY - this.upY) * ease(x);
        if (x >= 1) { if (this.offPending) this.enter('OFF'); else this.enter('IDLE_HIDDEN'); }
        break;
      }
      case 'OFF': this.y += (this.hiddenY - this.y) * Math.min(1, dt * 4); break;
    }
    const g = this.ghost, tt = performance.now() / 1000 + this.id * 1.7;
    g.position.y = this.y;
    // the ghost deflates as it sinks (that's how it fits inside) and puffs back up as it rises
    { const u = THREE.MathUtils.clamp((this.y - this.hiddenY) / (this.upY - this.hiddenY), 0, 1), e = u * u * (3 - 2 * u); g.scale.set(GS * (0.86 + 0.14 * e), GS * (0.55 + 0.45 * e), GS * (0.86 + 0.14 * e)); }
    g.visible = this.y > this.hiddenY + 0.01;
    // secondary motion: side wobble, hat lag on acceleration, arms flap, inflatable squash
    const vel = (this.y - this.wob.prevY) / Math.max(dt, 1e-4); const acc = (vel - this.wob.vel) / Math.max(dt, 1e-4);
    this.wob.prevY = this.y; this.wob.vel = vel;
    const W = this.wob; W.hatV += (-W.hat * 60 - W.hatV * 7 - acc * 0.004) * dt; W.hat += W.hatV * dt; W.hat = THREE.MathUtils.clamp(W.hat, -0.35, 0.35);
    const up = THREE.MathUtils.clamp((this.y - this.hiddenY) / (this.upY - this.hiddenY), 0, 1);
    g.rotation.z = Math.sin(tt * 2.1) * 0.06 * up + Math.sin(tt * 5.3) * 0.015 * up;
    g.rotation.x = Math.sin(tt * 1.6) * 0.025 * up;
    this.hat.rotation.z = 0.12 + W.hat; this.hat.rotation.x = W.hat * 0.4;
    this.hatCone.rotation.z = Math.sin(tt * 3.1) * 0.05 * up;
    this.arms[0].rotation.z = Math.sin(tt * 4) * 0.25 * up; this.arms[1].rotation.z = -Math.sin(tt * 4 + 1) * 0.25 * up;
    const stretch = THREE.MathUtils.clamp(vel * 0.05, -0.08, 0.1);
    this.ghostBody.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    this.squeeze.value += ((this.state === 'RETRACTING' ? Math.sin(Math.min(1, this.t / this.dur) * Math.PI) : 0) - this.squeeze.value) * Math.min(1, dt * 6);
  }

  // ------------------------------------------------------------------ sound (soft, friendly, distance-scaled)
  sfx(kind) {
    const A = this.g.audio, AC = A?.AC; if (!AC || A.muted || !this.sound) return;
    const cam = this.g.camera?.position, d = cam ? cam.distanceTo(this.root.position) : 5;
    const vol = Math.max(0, 1 - d / 22); if (vol <= 0.01) return;
    const out = AC.createGain(); out.gain.value = vol; out.connect(A.sfxBus);
    if (A.AC.createStereoPanner && cam) {   // pan toward where it is
      const p = AC.createStereoPanner(); const r = this.root.position.clone().sub(cam).normalize(); const right = new THREE.Vector3().crossVectors(this.g.camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 1, 0)).normalize();
      p.pan.value = THREE.MathUtils.clamp(r.dot(right), -0.8, 0.8); out.disconnect(); out.connect(p).connect(A.sfxBus);
    }
    const noise = (dur, f0, f1, g0) => { const n = AC.createBufferSource(), len = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, len, AC.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1; n.buffer = b; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; const t = AC.currentTime; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(g0, t + 0.08); g.gain.linearRampToValueAtTime(0, t + dur); n.connect(f).connect(g).connect(out); n.start(); };
    if (kind === 'inflate') { noise(0.9, 300, 1400, 0.16); }
    if (kind === 'deflate') { noise(1.3, 1100, 220, 0.12); }
    if (kind === 'click') { A.sfx?.(1500, 0.03, 'square', 0.04); }
    if (kind === 'boo') {
      // a soft cartoon "boo-oo": a gliding, wobbly hum through a vowel-ish filter, plus a little pop
      const t = AC.currentTime, o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(), lfo = AC.createOscillator(), lg = AC.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.8);
      lfo.frequency.value = 7; lg.gain.value = 9; lfo.connect(lg).connect(o.frequency);
      f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(420, t + 0.8); f.Q.value = 6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.06); g.gain.setValueAtTime(0.09, t + 0.55); g.gain.linearRampToValueAtTime(0, t + 0.9);
      o.connect(f).connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + 0.95); lfo.stop(t + 0.95);
      A.sfx?.(880, 0.06, 'sine', 0.05 * vol);
    }
  }

  // ------------------------------------------------------------------ right-click menu
  openMenu() {
    let m = $('deco-menu');
    if (!m) { m = document.createElement('div'); m.id = 'deco-menu'; m.className = 'chip'; m.hidden = true; document.body.append(m); addEventListener('keydown', e => { if (e.code === 'Escape' && !m.hidden) m.hidden = true; }); }
    const b = (lbl, fn, on) => `<button type="button" data-a="${fn}" class="${on ? 'on' : ''}">${lbl}</button>`;
    m.innerHTML = `<h4>🎃 Halloween pumpkin</h4>
      <div class="row">${b(this.on ? 'Turn off' : 'Turn on', 'power')} ${b('Make the ghost pop up', 'pop')}</div>
      <div class="row"><span>Speed</span>${b('Slow', 'slow', this.speed === 'slow')}${b('Normal', 'normal', this.speed === 'normal')}${b('Fast', 'fast', this.speed === 'fast')}</div>
      <div class="row"><span>Sound</span>${b(this.sound ? 'On' : 'Off', 'sound', this.sound)}</div>
      <button type="button" data-a="close" class="close">Done</button>`;
    m.hidden = false;
    m.onclick = e => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'power') this.setOn(!this.on);
      if (a === 'pop') this.popNow();
      if (SPEEDS[a]) this.speed = a;
      if (a === 'sound') this.sound = !this.sound;
      this.save();
      if (a === 'close' || a === 'pop' || a === 'power') { m.hidden = true; return; }
      this.openMenu();
    };
  }

  // ------------------------------------------------------------------ persistence
  save() { try { const all = JSON.parse(localStorage.getItem(SAVE) || '{}'); all[this.id] = { on: this.on && !this.offPending, speed: this.speed, sound: this.sound }; localStorage.setItem(SAVE, JSON.stringify(all)); } catch (e) { /* storage blocked */ } }
  load() { let s = null; try { s = JSON.parse(localStorage.getItem(SAVE) || '{}')[this.id]; } catch (e) { s = null; } const d = s ?? { on: true, speed: 'normal', sound: true }; this.speed = d.speed || 'normal'; this.sound = d.sound !== false; if (d.on) this.state = 'IDLE_HIDDEN'; }
}

/** the yard: a shared warm light that sits in whichever lit pumpkin is nearest (cheaper than one each) */
export class HalloweenYard {
  constructor(game, list) {
    this.g = game; this.list = list;
    this.light = new THREE.PointLight(0xFF9A3C, 0, 6, 1.6); this.light.castShadow = false; game.scene.add(this.light);
    // the blower hum: one quiet looped fan noise, loudness from the nearest running pumpkin
    this.hum = null;
  }
  update(dt) {
    const g = this.g, cam = g.camera.position;
    if (g.indoors) { this.light.intensity = 0; this.setHum(0); return; }
    let best = null, bd = 1e9;
    for (const p of this.list) { p.update(dt, cam); const d = cam.distanceTo(p.root.position); if (p.on && d < bd) { bd = d; best = p; } }
    if (best) { this.light.position.copy(best.root.position).add(V3(0, 0.9 * best.size, 0)); const night = 1 - THREE.MathUtils.smoothstep(g.sky?.elevation ?? 30, -2, 25); this.light.intensity = best.glow.value * (2.5 + night * 9); }
    else this.light.intensity = 0;
    { const night = 1 - THREE.MathUtils.smoothstep(g.sky?.elevation ?? 30, -2, 25); for (const p of this.list) p.night.value = night; }
    this.setHum(best && best.sound ? Math.max(0, 1 - bd / 14) * 0.035 * best.glow.value : 0);
  }
  setHum(v) {
    const A = this.g.audio, AC = A?.AC; if (!AC) return;
    if (!this.hum && v > 0.001) {
      const len = AC.sampleRate * 2, b = AC.createBuffer(1, len, AC.sampleRate), ch = b.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; ch[i] = last * 3 + Math.sin(i / AC.sampleRate * Math.PI * 2 * 120) * 0.08; }
      const s = AC.createBufferSource(); s.buffer = b; s.loop = true; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const gn = AC.createGain(); gn.gain.value = 0;
      s.connect(f).connect(gn).connect(A.sfxBus); s.start(); this.hum = gn;
    }
    if (this.hum) this.hum.gain.setTargetAtTime(A.muted ? 0 : v, AC.currentTime, 0.2);
  }
}

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
