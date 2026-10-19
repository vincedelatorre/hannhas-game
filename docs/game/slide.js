// The inside of the water slide: a long first-person ride through a tube that is much
// bigger on the inside than it looks from the beach. Sections (in order):
//   neon rings -> windy spiral -> clear glass with the sun pouring in -> BIG DROP ->
//   rainbow bumps -> wiggly S-bends -> glass again -> tight corkscrew -> final drop -> splash.
// Physics: speed comes from gravity along the track (minus drag and friction), and the
// rider slides up the wall in turns according to the real centripetal force, so fast
// corners throw you high up the side. The camera sits at Wren's eyes looking down her
// legs; her knees are straightened so you see her feet out in front like a real slide.
import * as THREE from 'three/webgpu';
import {
  attribute, uv, vec3, vec4, float, time, sin, cos, abs, fract, floor, smoothstep, mix, mx_hsvtorgb, mx_noise_float,
  uniform, positionWorld, cameraPosition, normalize, dot, pow, max, clamp, normalWorld,
} from 'three/tsl';

const KIND = { RINGS: 0, SWIRL: 1, GLASS: 2, DROP: 3 };

// ------------------------------------------------------------------ track layout
class PathBuilder {
  constructor(start, yawDeg) { this.p = start.clone(); this.yaw = THREE.MathUtils.degToRad(yawDeg); this.pts = [start.clone()]; this.kinds = [KIND.RINGS]; this.marks = []; }
  dir() { return new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
  push(kind) { this.pts.push(this.p.clone()); this.kinds.push(kind); }
  mark(name) { this.marks.push({ name, i: this.pts.length - 1 }); return this; }
  straight(len, drop, kind) {
    const n = Math.ceil(len / 0.5);
    for (let i = 1; i <= n; i++) { this.p.addScaledVector(this.dir(), len / n); this.p.y -= drop / n; this.push(kind); }
    return this;
  }
  /** turn by `deg` (positive = left) on a circle of radius r, dropping `drop` metres */
  arc(deg, r, drop, kind) {
    const a = THREE.MathUtils.degToRad(deg), len = Math.abs(a) * r, n = Math.ceil(len / 0.5);
    for (let i = 1; i <= n; i++) { this.yaw -= a / n; this.p.addScaledVector(this.dir(), len / n); this.p.y -= drop / n; this.push(kind); }
    return this;
  }
  /** a smooth plunge: gentle at the lip, steepest in the middle, gentle at the bottom */
  plunge(len, height, kind) {
    const n = Math.ceil(len / 0.4); let prev = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, y = height * (t - Math.sin(2 * Math.PI * t) / (2 * Math.PI));
      this.p.addScaledVector(this.dir(), len / n); this.p.y -= y - prev; prev = y; this.push(kind);
    }
    return this;
  }
  /** rolling hills that make your tummy drop over each crest */
  bumps(len, count, amp, drop, kind) {
    const n = Math.ceil(len / 0.4); let prevY = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, y = -drop * t + amp * (1 - Math.cos(2 * Math.PI * count * t)) / 2;
      this.p.addScaledVector(this.dir(), len / n); this.p.y += y - prevY; prevY = y; this.push(kind);
    }
    return this;
  }
}

function layout(start) {
  const B = new PathBuilder(start, 0);
  B.mark('launch').straight(14, 2.2, KIND.RINGS)
    .arc(110, 9, 4, KIND.RINGS)
    .mark('windy').arc(-900, 5.5, 22, KIND.SWIRL)          // two and a half windy turns down
    .mark('glass').straight(10, 1.2, KIND.GLASS)
    .arc(200, 13, 6, KIND.GLASS)
    .straight(6, 0.6, KIND.DROP)
    .mark('bigdrop').plunge(26, 30, KIND.DROP)                  // the big one
    .straight(6, 0.5, KIND.SWIRL)
    .mark('bumps').bumps(46, 3, 2.6, 4, KIND.SWIRL)
    .mark('wiggle').arc(95, 7.5, 3, KIND.RINGS).arc(-150, 7.5, 4, KIND.RINGS).arc(110, 7.5, 3, KIND.RINGS)
    .mark('glass2').straight(14, 1.4, KIND.GLASS)
    .mark('corkscrew').arc(-540, 4.5, 12, KIND.SWIRL)
    .straight(5, 0.3, KIND.DROP)
    .mark('final').plunge(20, 18, KIND.DROP)
    .straight(16, 0.8, KIND.RINGS);
  return B;
}

// ------------------------------------------------------------------ materials
const sKey = uniform(0);    // total length, for metres-along from uv

function tubeMaterial(totalLen) {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.BackSide, roughness: 0.22, metalness: 0.0 });
  const kind = attribute('kind', 'float');
  const s = uv().x.mul(totalLen), v = uv().y;
  // neon rings on a dark tube (like a glowing ring tunnel)
  const ringStep = mix(float(1.7), float(0.9), smoothstep(2.5, 3.5, kind));          // tighter, flashing rings on drops
  const rIdx = floor(s.div(ringStep));
  const band = smoothstep(0.16, 0.06, abs(fract(s.div(ringStep)).sub(0.5)));
  const ringHue = fract(rIdx.mul(0.137).add(time.mul(smoothstep(2.5, 3.5, kind).mul(0.6))));
  const ringCol = mx_hsvtorgb(vec3(ringHue, 0.95, 1));
  const dark = mix(vec3(0.012, 0.01, 0.04), vec3(0.03, 0.0, 0.06), v);
  // psychedelic swirl: rainbow stripes that spiral around the tube and flow past you
  const swirl = fract(s.mul(0.11).add(v.mul(3)).sub(time.mul(0.35)));
  const stripes = smoothstep(0.42, 0.5, abs(sin(s.mul(1.4).add(v.mul(6.2832 * 3)).add(time.mul(2)))));
  const swirlCol = mx_hsvtorgb(vec3(swirl, 1.0, mix(float(0.06), float(1), stripes)));   // deep dark gaps between bands
  const isSwirl = smoothstep(0.5, 1, kind).mul(smoothstep(1.5, 1, kind));
  const base = mix(mix(dark, swirlCol.mul(0.35), isSwirl), dark, 0);
  m.colorNode = mix(dark.add(ringCol.mul(band).mul(0.25)), swirlCol.mul(0.3), isSwirl);
  // the glow itself
  const ringGlow = ringCol.mul(band).mul(5.5);
  const swirlGlow = swirlCol.mul(mix(float(0.05), float(1.5), stripes));
  m.emissiveNode = mix(ringGlow, swirlGlow, isSwirl);
  // wet, glossy plastic
  m.roughnessNode = float(0.12);
  sKey.value = totalLen;
  return m;
}

function glassMaterial(totalLen) {
  // unlit, lightly tinted glass: the sky, sun and island show straight through
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const s = uv().x.mul(totalLen);
  const rib = smoothstep(0.1, 0.03, abs(fract(s.div(2.2)).sub(0.5)).sub(0.42));
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const fres = pow(float(1).sub(abs(dot(viewDir, normalWorld))), float(4));
  m.colorNode = mix(vec3(0.0, 0.22, 0.75), vec3(0.85, 0.97, 1), rib);     // see-through blue plastic
  m.opacityNode = clamp(float(0.2).add(fres.mul(0.2)).add(rib.mul(0.45)), 0, 0.75);
  return m;
}

function waterMaterial(totalLen) {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.05, side: THREE.DoubleSide });
  const s = uv().x.mul(totalLen), v = uv().y;
  // streaks rushing downhill
  const flow = mx_noise_float(vec3(s.mul(1.4).sub(time.mul(9)), v.mul(6), time.mul(0.5))).mul(0.5).add(0.5);
  const foam = smoothstep(0.62, 0.85, flow).add(smoothstep(0.35, 0.0, abs(v.sub(0.5))).mul(0.0));
  const edge = smoothstep(0.0, 0.18, v).mul(smoothstep(1.0, 0.82, v));
  m.colorNode = mix(vec3(0.02, 0.3, 0.55), vec3(0.9, 0.95, 1), foam);
  m.emissiveNode = vec3(0.0, 0.08, 0.14).add(vec3(0.6, 0.7, 0.75).mul(foam).mul(0.35));
  m.opacityNode = edge.mul(mix(float(0.35), float(0.85), foam));
  return m;
}

// ------------------------------------------------------------------ the ride
export class SlideRide {
  constructor(scene, { start = new THREE.Vector3(-18, 140, -34), radius = 1.15 } = {}) {
    this.R = radius;
    const B = layout(start);
    this.marks = B.marks;
    this.curve = new THREE.CatmullRomCurve3(B.pts, false, 'centripetal');
    this.curve.arcLengthDivisions = B.pts.length * 4;     // accurate metres-along for a long track
    this.len = this.curve.getLength();
    const kinds = B.kinds, np = B.pts.length;
    const kindAt = u => kinds[Math.min(np - 1, Math.round(u * (np - 1)))];
    this.kindAt = kindAt;

    const segs = Math.ceil(this.len * 2.2), radial = 28;
    const geo = new THREE.TubeGeometry(this.curve, segs, radius, radial, false);
    const kindAttr = new Float32Array(geo.attributes.position.count);
    for (let i = 0; i <= segs; i++) { const k = kindAt(i / segs); for (let j = 0; j <= radial; j++) kindAttr[i * (radial + 1) + j] = k; }
    geo.setAttribute('kind', new THREE.BufferAttribute(kindAttr, 1));
    // split into the solid tube and the clear glass sections
    const solid = [], glass = [];
    for (let i = 0; i < segs; i++) {
      const target = kindAt((i + 0.5) / segs) === KIND.GLASS ? glass : solid;
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j, c = b + 1, d = a + 1;
        target.push(a, b, d, b, c, d);
      }
    }
    const solidGeo = geo.clone(); solidGeo.setIndex(solid);
    const glassGeo = geo.clone(); glassGeo.setIndex(glass);
    this.group = new THREE.Group(); this.group.name = 'slide-ride'; this.group.visible = false;
    const tube = new THREE.Mesh(solidGeo, tubeMaterial(this.len)); tube.receiveShadow = true; tube.frustumCulled = false;
    const glassMesh = new THREE.Mesh(glassGeo, glassMaterial(this.len)); glassMesh.frustumCulled = false; glassMesh.renderOrder = 3;
    this.group.add(tube, glassMesh);
    this.group.add(this.buildWater(segs));
    // sunbeams: soft bright shafts slanting into the glass sections
    this.beams = this.buildBeams(kinds, B.pts);
    this.group.add(this.beams);
    scene.add(this.group);

    this.state = null;
    this._down = new THREE.Vector3(0, -1, 0);
  }

  /** a ribbon of rushing water along the bottom of the tube (bottom = straight down) */
  buildWater(segs) {
    const across = 10, pos = [], uvs = [], idx = [];
    const R = this.R - 0.03;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      const down = new THREE.Vector3(0, -1, 0).addScaledVector(t, t.y).normalize();
      const side = new THREE.Vector3().crossVectors(t, down).normalize();
      for (let j = 0; j <= across; j++) {
        const a = (j / across - 0.5) * 1.1;   // about 63 degrees of the tube floor
        const d = down.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        pos.push(p.x + d.x * R, p.y + d.y * R, p.z + d.z * R); uvs.push(u, j / across);
      }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j, b = a + across + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, waterMaterial(this.len)); m.frustumCulled = false; m.renderOrder = 2;
    return m;
  }

  buildBeams(kinds, pts) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const t = uv();
    mat.colorNode = vec3(1, 0.93, 0.75);
    mat.opacityNode = smoothstep(0, 0.35, t.y).mul(smoothstep(1, 0.6, t.y)).mul(smoothstep(0, 0.3, t.x)).mul(smoothstep(1, 0.7, t.x)).mul(0.1);
    for (let i = 0; i < pts.length; i += 9) {
      if (kinds[i] !== KIND.GLASS) continue;
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), mat);
      beam.position.copy(pts[i]).add(new THREE.Vector3(0, 0.25, 0));
      beam.rotation.set(0.0, Math.random() * Math.PI, 0.45);
      g.add(beam);
    }
    return g;
  }

  get riding() { return !!this.state; }

  start(char) {
    this.group.visible = true;
    this.state = { s: 0, v: 7, t: 0, char, down: new THREE.Vector3(0, -1, 0), shake: 0, section: null };
    char.sitting = true;
    char.afterPose = () => this.legsOut(char);
  }

  /** knees straight, feet forward: the way you sit on a real slide */
  legsOut(char) {
    for (const n of ['LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) {
      const b = char.bones[n], r = char.rest?.[n];
      if (b && r) b.quaternion.slerp(r, 0.85);
    }
    // arms up for the drops
    const st = this.state;
    if (st && st.v > 15) for (const n of ['LeftArm', 'RightArm']) {
      const b = char.bones[n]; if (!b) continue;
      b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (n === 'LeftArm' ? -1 : 1) * Math.min(1, (st.v - 15) / 8) * 0.9));
    }
  }

  /** advance the ride; returns 'done' at the bottom */
  update(dt, camera) {
    const st = this.state; if (!st) return null;
    const L = this.len, u = Math.min(1, st.s / L);
    const T = this.curve.getTangentAt(u);
    // speed: gravity along the track, air drag, and a little friction from the water film
    const a = -9.81 * T.y - 0.011 * st.v * st.v - 0.35;
    st.v = THREE.MathUtils.clamp(st.v + a * dt, 5.5, 34);
    st.s += st.v * dt; st.t += dt;
    if (st.s >= L) return 'done';
    const u2 = st.s / L;
    const P = this.curve.getPointAt(u2), T2 = this.curve.getTangentAt(u2);
    // curvature from neighbouring tangents -> centripetal acceleration
    const du = 1.0 / L;
    const Ta = this.curve.getTangentAt(Math.max(0, u2 - du)), Tb = this.curve.getTangentAt(Math.min(1, u2 + du));
    const kN = Tb.sub(Ta).divideScalar(2.0);                     // ~ dT/ds (1/m)
    // what the rider feels: gravity minus the acceleration needed to follow the curve
    const gEff = new THREE.Vector3(0, -9.81, 0).addScaledVector(kN, -st.v * st.v);
    gEff.addScaledVector(T2, -gEff.dot(T2));
    if (gEff.lengthSq() > 0.5) st.down.lerp(gEff.normalize(), Math.min(1, dt * 7));
    st.down.addScaledVector(T2, -st.down.dot(T2)).normalize();
    const down = st.down, up = down.clone().negate();
    const seat = P.clone().addScaledVector(down, this.R - 0.08);

    // place Wren: forward along the track, leaning back a little
    const ch = st.char;
    const fwd = T2.clone(), right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, fwd);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.72));   // lying back
    ch.root.position.copy(seat);
    ch.root.quaternion.copy(q);
    ch.update(dt, 0);
    ch.root.updateMatrixWorld(true);

    // first-person eyes: just in front of her face, looking down the slide past her feet
    const head = ch.worldPos('Head');
    const eye = head.addScaledVector(fwd, 0.22).addScaledVector(up, 0.24);
    st.shake = st.v > 14 ? (st.v - 14) * 0.0016 : 0;
    eye.x += (Math.random() - 0.5) * st.shake; eye.y += (Math.random() - 0.5) * st.shake;
    camera.position.copy(eye);
    camera.up.copy(up);
    const look = eye.clone().addScaledVector(fwd, 4).addScaledVector(down, 0.95);
    camera.lookAt(look);
    const fov = THREE.MathUtils.clamp(68 + st.v * 0.9, 68, 98);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();

    // which section are we in (for sounds and toasts)
    let sec = null; const idx = u2 * (this.curve.points.length - 1);
    for (const m of this.marks) if (idx >= m.i) sec = m.name;
    const changed = sec !== st.section; st.section = sec;
    return changed ? sec : null;
  }

  stop(char, camera) {
    this.state = null; this.group.visible = false;
    char.afterPose = null; char.sitting = false;
    char.root.quaternion.identity();
    camera.up.set(0, 1, 0);
  }
}
