// Under the sea: animated caustics on the sea floor, the reef (coral, sea grass, rocks),
// schools of fish that steer like boids, a sea turtle, bubbles, and the underwater view
// (surface seen from below, dense blue fog, colour grade) when the camera dives.
import * as THREE from 'three/webgpu';
import {
  positionWorld, positionLocal, positionGeometry, vec2, vec3, float, time, mx_worley_noise_float, mx_noise_float, smoothstep, exp, pow, clamp,
  uniform, length, mix, sin, cos, max, instancedBufferAttribute, uv, abs, texture, varying,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { H, G, rng } from './world.js';
import { toNodeMaterial } from './dressing.js';

/** colours below are written as on-screen (sRGB) values; shaders need linear light */
const L = (r, g, b) => vec3(r ** 2.2, g ** 2.2, b ** 2.2);
const Lc = c => c.map(v => v ** 2.2);

export const causticStrength = uniform(1);     // follows the sun (0 at night)
export const underwater = uniform(0);          // 0 above water, 1 with the camera under it

/**
 * Light focused by the moving surface: two layers of animated cell noise make the
 * bright web, fading with depth and switched off above the water line.
 */
export function causticsNode(zone) {
  const L = zone.lagoon, pw = positionWorld;
  const e = length(vec2(pw.x.sub(L.center[0]).div(L.radius[0] + 0.4), pw.z.add(L.center[1]).div(L.radius[1] + 0.4)));
  const level = mix(float(L.level), float(zone.seaLevel), smoothstep(0.95, 1.05, e));
  const depth = level.sub(pw.y);
  const t = time.mul(0.42);
  const p = pw.xz.mul(0.55);
  const a = mx_worley_noise_float(vec3(p, t));
  const b = mx_worley_noise_float(vec3(p.mul(1.37).add(vec2(5.2, 1.3)), t.mul(1.25).add(3.0)));
  const web = pow(clamp(a.mul(1.25), 0, 1), float(3.5)).add(pow(clamp(b.mul(1.2), 0, 1), float(3.5))).mul(0.85);
  const fade = smoothstep(0.03, 0.4, depth).mul(exp(depth.mul(-0.16)));
  return web.mul(fade).mul(causticStrength);
}

/** sunlight reaching something under water has lost red first, then green (downwelling Beer's law) */
export function submerged(col, zone) {
  const depth = max(float(zone.seaLevel).sub(positionWorld.y), float(0));
  return col.mul(exp(vec3(0.32, 0.075, 0.05).mul(depth).negate()));
}

// ------------------------------------------------------------------ reef layout
// The reef sits in the 3-7 m deep water between the sea stacks, in front of the beach.
const REEF = { x: [-26, 26], y: [-40, -16] };
const inReef = (x, y) => x > REEF.x[0] && x < REEF.x[1] && y > REEF.y[0] && y < REEF.y[1];

function seaGrass(scene, zone, Q) {
  const n = Math.round(1400 * (Q.grass || 0.5));
  if (!n) return null;
  const g = new THREE.PlaneGeometry(0.09, 1, 1, 6); g.translate(0, 0.5, 0);
  const data = new Float32Array(n * 4);
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
  const dAttr = new THREE.InstancedBufferAttribute(data, 4);
  const d = instancedBufferAttribute(dAttr);
  const h = positionLocal.y;
  const sway = sin(time.mul(0.9).add(d.x).add(h.mul(1.7))).mul(pow(h, 1.4)).mul(0.28);
  const sway2 = cos(time.mul(0.63).add(d.x.mul(1.3))).mul(pow(h, 1.6)).mul(0.16);
  mat.positionNode = positionLocal.add(vec3(sway, 0, sway2));
  const base = mix(L(0.3, 0.52, 0.2), L(0.62, 0.52, 0.22), d.z);
  // per-instance values must be passed to the fragment stage explicitly
  const hue = varying(d.z), seed = varying(d.x), hv = uv().y;   // (positionLocal is not the raw vertex in the fragment stage)
  const base2 = mix(L(0.3, 0.52, 0.2), L(0.62, 0.52, 0.22), hue);
  mat.colorNode = submerged(base2.mul(mix(float(0.7), float(1.25), hv)).mul(float(0.85).add(mx_noise_float(vec3(uv().mul(vec2(2, 14)), seed)).mul(0.15))), zone);
  // thin blades let light through: a little of their colour glows when lit from behind
  mat.emissiveNode = mat.colorNode.mul(0.35).mul(causticStrength);
  const mesh = new THREE.InstancedMesh(g, mat, n);
  const r = rng(91), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  for (let tries = 0; k < n && tries < n * 20; tries++) {
    // clumps: pick a clump centre then scatter blades around it
    const cx = REEF.x[0] - 8 + r() * (REEF.x[1] - REEF.x[0] + 16), cy = REEF.y[0] + r() * (REEF.y[1] - REEF.y[0] + 8);
    const h0 = H(cx, cy);
    if (h0 > -1.0 || h0 < -7.2) continue;
    const blades = 8 + Math.floor(r() * 18);
    for (let b = 0; b < blades && k < n; b++) {
      const x = cx + (r() - 0.5) * 1.6, y = cy + (r() - 0.5) * 1.6;
      const hh = H(x, y);
      const tall = Math.min(-hh - 0.4, 0.5 + r() * 1.8);
      p.set(x, hh - 0.05, -y); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI); s.set(0.7 + r() * 0.8, tall, 1);
      mesh.setMatrixAt(k, m.compose(p, q, s));
      data.set([r() * 6.28, tall, r() < 0.3 ? 0.6 + r() * 0.4 : r() * 0.3, 0], k * 4);
      k++;
    }
  }
  mesh.count = k; mesh.receiveShadow = true; mesh.name = 'seagrass'; mesh.userData.dattr = dAttr;
  scene.add(mesh);
  return mesh;
}

/** fallback coral made from simple shapes when the coral model is not available */
function proceduralCoral(zone) {
  const parts = [];
  const branch = (x, z, h, r, lean) => { const c = new THREE.CylinderGeometry(r * 0.6, r, h, 7, 3); c.translate(0, h / 2, 0); c.rotateZ(lean); c.rotateY(Math.random() * 6); c.translate(x, 0, z); return c; };
  for (let i = 0; i < 9; i++) parts.push(branch((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, 0.05, (Math.random() - 0.5) * 1.1));
  const brain = new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); brain.translate(0.45, 0, 0.1); parts.push(brain);
  const g = mergeGeometries(parts.map(p => p.toNonIndexed()));
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 });
  mat.colorNode = submerged(mix(L(0.85, 0.45, 0.42), L(0.85, 0.62, 0.42), mx_noise_float(positionGeometry.mul(6)).mul(0.5).add(0.5)), zone);
  return { geometry: g, material: mat, size: 1.2 };
}

function corals(scene, zone, A, Q) {
  const out = [];
  const kinds = [];
  for (const name of ['SM_Coral_Cluster', 'SM_SeaGrass_Rock']) {
    const gltf = A.models[name];
    if (!gltf) continue;
    gltf.scene.updateMatrixWorld(true);
    let mesh = null; gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) continue;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox(); const bb = geo.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz);
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    const mat = toNodeMaterial(mesh.material);
    if (mesh.material.map) mat.colorNode = submerged(texture(mesh.material.map, uv()).rgb.mul(0.8), zone);
    kinds.push({ geometry: geo, material: mat, size: Math.max(sz.x, sz.z), count: name === 'SM_Coral_Cluster' ? 46 : 26, scale: name === 'SM_Coral_Cluster' ? [1.2, 2.6] : [0.9, 1.8] });
  }
  if (!kinds.length) { const c = proceduralCoral(zone); kinds.push({ ...c, count: 40, scale: [0.8, 1.8] }); }
  const r = rng(57), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const k of kinds) {
    const mesh = new THREE.InstancedMesh(k.geometry, k.material, k.count);
    let i = 0;
    for (let tries = 0; i < k.count && tries < 4000; tries++) {
      const x = REEF.x[0] + r() * (REEF.x[1] - REEF.x[0]), y = REEF.y[0] + r() * (REEF.y[1] - REEF.y[0]);
      const h = H(x, y);
      if (h > -2.2) continue;               // keep the reef out of the wading zone
      const sc = (k.scale[0] + r() * (k.scale[1] - k.scale[0])) / k.size;
      p.set(x, h - 0.12, -y); q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.2, r() * 6.28, (r() - 0.5) * 0.2)); s.setScalar(sc);
      mesh.setMatrixAt(i++, m.compose(p, q, s));
    }
    mesh.count = i; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'reef';
    scene.add(mesh); out.push(mesh);
  }
  return out;
}

// ------------------------------------------------------------------ fish
function fishGeometry() {
  // body: a squashed sphere pointing along +z; tail and dorsal fins as thin shapes
  const body = new THREE.SphereGeometry(0.5, 14, 10); body.scale(0.26, 0.62, 1);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.42, 0, 0.32, -0.8, 0, -0.32, -0.8, 0, 0, -0.42, 0, -0.32, -0.8, 0, 0.32, -0.8], 3));
  tail.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
  tail.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 1, 1, 1, 0, 0, 0.5, 1, 0, 1, 1], 2));
  const fin = new THREE.BufferGeometry();
  fin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.26, 0.2, 0, 0.5, -0.12, 0, 0.24, -0.3, 0, 0.26, 0.2, 0, 0.24, -0.3, 0, 0.5, -0.12], 3));
  fin.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
  fin.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1], 2));
  return mergeGeometries([body.toNonIndexed(), tail, fin]);
}

const SPECIES = [
  // name, count, length (m), body colour, stripe colour, stripe frequency, depth band
  { name: 'tang', n: 22, len: 0.24, a: [1.0, 0.82, 0.08], b: [1.0, 0.95, 0.5], stripes: 0 },
  { name: 'blue', n: 26, len: 0.2, a: [0.08, 0.32, 0.85], b: [0.95, 0.85, 0.2], stripes: 1 },
  { name: 'orange', n: 14, len: 0.13, a: [1.0, 0.42, 0.05], b: [1.0, 1.0, 1.0], stripes: 3 },
  { name: 'silver', n: 40, len: 0.16, a: [0.7, 0.78, 0.85], b: [0.35, 0.45, 0.6], stripes: 2 },
];

/** the generated fish model, normalised: centred, nose along +z, 1 m long */
function fishModel(A) {
  const gltf = A.models.SM_ReefFish; if (!gltf) return null;
  gltf.scene.updateMatrixWorld(true);
  let mesh = null; gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  g.computeBoundingBox(); const bb = g.boundingBox, c = new THREE.Vector3(), sz = new THREE.Vector3(); bb.getCenter(c); bb.getSize(sz);
  // the generated fish stands on a little display block: drop the triangles of that block
  {
    const pos = g.attributes.position, cut = bb.min.y + sz.y * 0.44;
    const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const ymin = Math.min(pos.getY(idx[t]), pos.getY(idx[t + 1]), pos.getY(idx[t + 2]));
      if (ymin > cut) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    g.setIndex(keep);
    // bounds of the kept triangles only
    const kb = new THREE.Box3(), v = new THREE.Vector3(); for (const i of keep) kb.expandByPoint(v.fromBufferAttribute(pos, i));
    kb.getCenter(c); kb.getSize(sz);
  }
  g.translate(-c.x, -c.y, -c.z);
  if (sz.x > sz.z) g.rotateY(Math.PI / 2 * (A.fishNose || 1));     // side-view source: body lies along x
  g.scale(1 / Math.max(sz.x, sz.z), 1 / Math.max(sz.x, sz.z), 1 / Math.max(sz.x, sz.z));
  return { geometry: g, map: mesh.material.map };
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class Fish {
  constructor(scene, zone, Q, A) {
    this.zone = zone;
    const total = SPECIES.reduce((n, s) => n + Math.round(s.n * (Q.name === 'low' ? 0.5 : 1)), 0);
    this.n = total;
    const g = fishGeometry();
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);   // phase, beat speed, stripe freq, species
    this.ca = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    this.cb = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    const d = instancedBufferAttribute(this.attr), ca = instancedBufferAttribute(this.ca), cb = instancedBufferAttribute(this.cb);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide });
    // swimming wave: grows toward the tail, faster when the fish speeds up
    const z = positionLocal.z;
    const bend = sin(time.mul(d.y).add(d.x).sub(z.mul(4.5))).mul(pow(max(float(0), float(0.35).sub(z)), float(1.6))).mul(0.22);
    mat.positionNode = positionLocal.add(vec3(bend, 0, 0));
    const sf = varying(d.z), zv = positionGeometry.z, cav = varying(ca), cbv = varying(cb);
    const stripe = smoothstep(0.55, 0.75, abs(sin(zv.mul(sf.mul(3.1)).add(0.6)))).mul(smoothstep(0.5, 1.5, sf));
    const belly = smoothstep(0.1, -0.25, positionGeometry.y);
    mat.colorNode = submerged(mix(mix(cav, cbv, stripe), L(0.85, 0.85, 0.8), belly.mul(0.45)), zone);
    this.mesh = new THREE.InstancedMesh(g, mat, total);
    this.mesh.frustumCulled = false; this.mesh.name = 'fish';
    scene.add(this.mesh);
    // the yellow tangs use the generated, textured fish model when it is available
    const fm = A && fishModel(A);
    const modelSpecies = 'tang';
    if (fm) {
      const n = Math.round(SPECIES.find(s => s.name === modelSpecies).n * (Q.name === 'low' ? 0.5 : 1));
      const ph = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); this.mph = ph;
      const pd = instancedBufferAttribute(ph);
      const mm = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide });
      const mz = positionLocal.z;
      mm.positionNode = positionLocal.add(vec3(sin(time.mul(pd.y).add(pd.x).sub(mz.mul(4.5))).mul(pow(max(float(0), float(0.25).sub(mz)), float(1.6))).mul(0.22), 0, 0));
      mm.colorNode = submerged((fm.map ? texture(fm.map, uv()).rgb.mul(0.8) : L(0.95, 0.8, 0.1)), zone);
      this.modelMesh = new THREE.InstancedMesh(fm.geometry, mm, n);
      this.modelMesh.frustumCulled = false; this.modelMesh.name = 'fish-model';
      scene.add(this.modelMesh);
    }
    const r = rng(23);
    this.f = [];
    this.schools = [];
    let i = 0;
    for (const [si, S] of SPECIES.entries()) {
      const count = Math.round(S.n * (Q.name === 'low' ? 0.5 : 1));
      const home = new THREE.Vector3(REEF.x[0] + 8 + r() * (REEF.x[1] - REEF.x[0] - 16), -3, -(REEF.y[0] + 6 + r() * (REEF.y[1] - REEF.y[0] - 12)));
      const school = { goal: home.clone(), t: 0, len: S.len };
      this.schools.push(school);
      for (let k = 0; k < count; k++, i++) {
        const p = home.clone().add(new THREE.Vector3((r() - 0.5) * 3, (r() - 0.5) * 1.2, (r() - 0.5) * 3));
        p.y = Math.min(-0.6, Math.max(G(p.x, p.z) + 0.6, p.y));
        const mi = this.modelMesh && S.name === modelSpecies ? k : -1;
        this.f.push({ p, v: new THREE.Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.6), school, len: S.len * (0.8 + r() * 0.4) * (mi >= 0 ? 1.3 : 1), mi });
        if (mi >= 0) this.mph.setXY(mi, r() * 6.28, 10);
        this.attr.setXYZW(i, r() * 6.28, 9 + r() * 4, S.stripes, si);
        const j = 0.9 + r() * 0.2;
        const a = Lc(S.a), b = Lc(S.b); this.ca.setXYZ(i, a[0] * j, a[1] * j, a[2] * j); this.cb.setXYZ(i, ...b);
      }
    }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }

  update(dt, threats) {
    const sea = this.zone.seaLevel, r = Math.random;
    for (const S of this.schools) {
      S.t -= dt;
      if (S.t <= 0) {   // wander to a new spot on the reef
        S.t = 6 + r() * 8;
        const x = REEF.x[0] + 4 + r() * (REEF.x[1] - REEF.x[0] - 8), y = REEF.y[0] + 3 + r() * (REEF.y[1] - REEF.y[0] - 6);
        const floor = H(x, y);
        S.goal.set(x, Math.min(sea - 0.8, floor + 0.7 + r() * Math.max(0.2, -floor - 1.8)), -y);
      }
    }
    const f = this.f, n = f.length, acc = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = f[i];
      acc.set(0, 0, 0);
      // cohesion toward the school goal, separation and alignment with neighbours
      acc.add(tmp.copy(a.school.goal).sub(a.p).multiplyScalar(0.25));
      let near = 0; const align = new THREE.Vector3();
      for (let j = Math.max(0, i - 6); j < Math.min(n, i + 7); j++) {
        if (j === i || f[j].school !== a.school) continue;
        const b = f[j]; tmp.copy(a.p).sub(b.p); const d2 = tmp.lengthSq();
        if (d2 < 0.25) acc.addScaledVector(tmp, 1.6 / Math.max(0.02, d2));
        align.add(b.v); near++;
      }
      if (near) acc.addScaledVector(align.divideScalar(near).sub(a.v), 0.8);
      // scatter from swimmers
      for (const t of threats) { tmp.copy(a.p).sub(t); const d = tmp.length(); if (d < 2.6) acc.addScaledVector(tmp.normalize(), (2.6 - d) * 7); }
      // stay between the sea floor and the surface
      const floor = G(a.p.x, a.p.z);
      if (a.p.y < floor + 0.45) acc.y += (floor + 0.45 - a.p.y) * 12;
      if (a.p.y > sea - 0.5) acc.y -= (a.p.y - sea + 0.5) * 12;
      a.v.addScaledVector(acc, dt);
      const sp = a.v.length(), maxS = 2.8;
      if (sp > maxS) a.v.multiplyScalar(maxS / sp);
      if (sp < 0.35) a.v.multiplyScalar(0.35 / Math.max(sp, 1e-3));
      a.v.y *= 0.96;
      a.p.addScaledVector(a.v, dt);
      tmp.copy(a.v).normalize();
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmp);
      this.s.setScalar(a.len);
      this.m.compose(a.p, this.q, this.s);
      if (a.mi >= 0) { this.modelMesh.setMatrixAt(a.mi, this.m); this.mph.setY(a.mi, 8 + sp * 6); this.mesh.setMatrixAt(i, ZERO); }
      else this.mesh.setMatrixAt(i, this.m);
      this.attr.setY(i, 8 + sp * 6);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.modelMesh) { this.modelMesh.instanceMatrix.needsUpdate = true; this.mph.needsUpdate = true; }
    this.attr.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ sea turtle
class Turtle {
  constructor(scene, A) {
    const gltf = A.models.SM_SeaTurtle;
    this.root = new THREE.Group(); this.root.name = 'turtle';
    if (gltf) {
      const m = gltf.scene.clone(true);
      const bb = new THREE.Box3().setFromObject(m), sz = new THREE.Vector3(), c = new THREE.Vector3(); bb.getSize(sz); bb.getCenter(c);
      m.position.sub(c); const s = 1.15 / sz.z; this.root.scale.setScalar(s);
      m.traverse(o => { if (o.isMesh) { o.material = toNodeMaterial(o.material); o.castShadow = true; } });
      // the generated turtle already faces +z (flippers span x)
      this.root.add(m);
    } else {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), new THREE.MeshStandardNodeMaterial({ color: 0x5b6b3a, roughness: 0.6 }));
      shell.scale.set(0.8, 0.3, 1); this.root.add(shell);
    }
    scene.add(this.root);
    this.t = Math.random() * 10;
  }
  update(dt) {
    // a slow loop around the reef with gentle rises and dips
    this.t += dt * 0.05;
    const a = this.t, x = Math.sin(a) * 16, y = -27 + Math.cos(a * 2) * 7;
    const floor = H(x, y);
    const py = Math.max(floor + 1.2, -2.4 + Math.sin(a * 3) * 0.8);
    const p = new THREE.Vector3(x, py, -y);
    const prev = this.root.position.clone();
    this.root.position.lerp(p, Math.min(1, dt * 2));
    const v = this.root.position.clone().sub(prev);
    if (v.lengthSq() > 1e-8) this.root.rotation.y = Math.atan2(v.x, v.z);
    this.root.rotation.z = Math.sin(this.t * 40) * 0.05;
  }
}

// ------------------------------------------------------------------ underwater view
export class Underwater {
  constructor(scene, zone, A, Q, fx) {
    this.scene = scene; this.zone = zone; this.fx = fx;
    this.grass = seaGrass(scene, zone, Q);
    this.coral = corals(scene, zone, A, Q);
    this.fish = new Fish(scene, zone, Q, A);
    this.turtle = new Turtle(scene, A);
    // the water surface seen from below: bright, rippling, with the sun's disc smeared through
    const g = new THREE.PlaneGeometry(900, 900, 1, 1); g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: true });
    const pw = positionWorld.xz;
    const rip = mx_noise_float(vec3(pw.mul(0.6), time.mul(0.5))).mul(0.5).add(0.5);
    mat.colorNode = mix(L(0.2, 0.62, 0.68), L(0.8, 0.96, 0.96), pow(rip, float(3)));
    mat.opacityNode = float(0.94);
    this.surface = new THREE.Mesh(g, mat); this.surface.position.y = zone.seaLevel - 0.03; this.surface.name = 'surface-under';
    this.surface.visible = false; this.surface.renderOrder = 2;
    scene.add(this.surface);
    this.fogAbove = scene.fog;
    this.fogUnder = new THREE.FogExp2(0x2a8a96, 0.075);
    this.bubbleT = 0;
  }

  update(dt, camera, player, friend) {
    const threats = [player.pos.clone().add(new THREE.Vector3(0, 0.8, 0))];
    if (friend) threats.push(friend.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
    this.fish.update(dt, threats);
    this.turtle.update(dt);
    // is the camera under the surface?
    const lvl = player.waterLevelAt(camera.position);
    const under = camera.position.y < lvl - 0.05;
    underwater.value += ((under ? 1 : 0) - underwater.value) * Math.min(1, dt * 10);
    this.scene.fog = under ? this.fogUnder : this.fogAbove;
    this.surface.visible = under;
    this.surface.position.set(camera.position.x, lvl - 0.03, camera.position.z);
    // bubbles from Wren while she is under water
    const head = player.c.worldPos?.('Head') || player.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    if (head.y < lvl - 0.2) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.08 + Math.random() * 0.25;
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.fx.emit(head.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.05, (Math.random() - 0.5) * 0.1)),
          new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3),
          { life: Math.min(2.5, (lvl - head.y) / 1.2), size: 0.03 + Math.random() * 0.05, gravity: -1.2, drag: 0.6, color: [0.85, 0.97, 1], alpha: 0.8 });
      }
    }
  }
}
