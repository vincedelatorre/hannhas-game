// Ground detail: instanced grass blades with wind on the grassy band and jungle edge,
// plus scattered pebbles, shell bits and fallen coconuts on the beach.
import * as THREE from 'three/webgpu';
import { positionLocal, positionWorld, vec3, float, sin, time, instanceIndex, mix, smoothstep, mx_noise_float, uv, color, attribute } from 'three/tsl';
import { H, slope, rng } from './world.js';
import { wind } from './dressing.js';

function bladeGeometry() {
  // a tapered, slightly curved blade: 5 segments, double sided
  const segs = 5, w = 0.045, h = 1;
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ww = w * (1 - t * 0.92), bend = t * t * 0.18;
    pos.push(-ww, t * h, bend, ww, t * h, bend); uvs.push(0, t, 1, t);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildGrass(scene, zone, Q, avoid = []) {
  if (!Q.grass) return null;
  const R = rng(5);
  const count = Math.round(70000 * Q.grass);
  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.75 });
  const t = uv().y;
  // wind: whole field rolls in gusts, each blade flutters a little
  // per-blade world position (stored per instance) drives a rolling gust pattern across the field
  const idata = attribute('idata', 'vec3');
  const gust = mx_noise_float(vec3(idata.x.mul(0.06).add(time.mul(0.35)), idata.y.mul(0.06), 0)).mul(0.5).add(0.5);
  const phase = instanceIndex.toFloat().mul(0.618);
  const bendAmt = gust.mul(0.35).add(sin(time.mul(2.1).add(phase)).mul(0.06)).mul(t.mul(t)).mul(wind.strength);
  mat.positionNode = positionLocal.add(vec3(bendAmt, bendAmt.mul(-0.25), bendAmt.mul(0.4)));
  const tint = idata.z;
  const base = mix(color(0x2f5a1c), color(0x4f7d24), tint);
  const tip = mix(color(0x9cc157), color(0xd6d27a), tint);
  mat.colorNode = mix(base, tip, smoothstep(0.0, 1.0, t)).mul(mix(float(0.75), float(1.12), gust));
  // fake translucency: sunlit tips glow a little
  mat.emissiveNode = tip.mul(0.06).mul(t);

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const idataArr = new Float32Array(count * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let n = 0, tries = 0;
  while (n < count && tries < count * 6) {
    tries++;
    const x = -75 + R() * 150, y = 8 + R() * 70;
    const h = H(x, y);
    if (h < 2.0 || h > 14 || slope(x, y) > 0.55) continue;
    if (avoid.some(([ax, ay, r]) => Math.hypot(x - ax, y - ay) < r)) continue;
    // fade density in over the sand-to-grass transition
    if (R() > Math.min(1, (h - 2.0) / 1.2)) continue;
    const sc = 0.35 + R() * 0.5;
    e.set((R() - 0.5) * 0.25, R() * Math.PI * 2, (R() - 0.5) * 0.25); q.setFromEuler(e);
    s.set(sc * (0.8 + R() * 0.5), sc, sc);
    p.set(x, h - 0.02, -y);
    m.compose(p, q, s); mesh.setMatrixAt(n, m); idataArr.set([x, y, R()], n * 3); n++;
  }
  mesh.count = n;
  geo.setAttribute('idata', new THREE.InstancedBufferAttribute(idataArr, 3));
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function buildBeachDetail(scene, zone, A, Q) {
  const R = rng(9);
  const out = [];
  // pebbles and shell bits on the sand
  const pebGeo = new THREE.IcosahedronGeometry(1, 1);
  const pp = pebGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 0.85 + (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 0.3; pp.setXYZ(i, pp.getX(i) * k, pp.getY(i) * 0.55 * k, pp.getZ(i) * k); }
  pebGeo.computeVertexNormals();
  const pebMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const pv = attribute('tint', 'float');
  pebMat.colorNode = mix(mix(color(0x8a8378), color(0xd8cdbb), pv), color(0xf3d3d6), smoothstep(0.85, 0.95, pv));
  const N = Q.name === 'low' ? 500 : 1400;
  const peb = new THREE.InstancedMesh(pebGeo, pebMat, N);
  const tints = new Float32Array(N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  for (let k = 0; k < N * 5 && n < N; k++) {
    const x = -60 + R() * 120, y = -14 + R() * 30, h = H(x, y);
    if (h < -0.15 || h > 2.2) continue;
    const sc = 0.025 + Math.pow(R(), 3) * 0.09;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28); s.setScalar(sc);
    p.set(x, h + sc * 0.2, -y); m.compose(p, q, s); peb.setMatrixAt(n, m); tints[n] = R(); n++;
  }
  peb.count = n; pebGeo.setAttribute('tint', new THREE.InstancedBufferAttribute(tints, 1));
  peb.receiveShadow = true; peb.castShadow = Q.name !== 'low';
  scene.add(peb); out.push(peb);

  // fallen coconuts under the hero palms
  const coGeo = new THREE.SphereGeometry(0.13, 14, 10); coGeo.scale(1, 0.9, 1.15);
  const coMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const fib = mx_noise_float(positionLocal.mul(vec3(30, 30, 6)));
  coMat.colorNode = mix(color(0x4a3220), color(0x7a5532), fib.mul(0.5).add(0.5));
  const palms = zone.palms.hero;
  const co = new THREE.InstancedMesh(coGeo, coMat, palms.length * 2);
  let c = 0;
  for (const [px, py] of palms) for (let j = 0; j < 2; j++) {
    if (R() < 0.35) continue;
    const a = R() * 6.28, r = 0.6 + R() * 1.2, x = px + Math.cos(a) * r, y = py + Math.sin(a) * r;
    q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)); s.setScalar(1);
    p.set(x, H(x, y) + 0.1, -y); m.compose(p, q, s); co.setMatrixAt(c++, m);
  }
  co.count = c; co.castShadow = true; co.receiveShadow = true;
  scene.add(co); out.push(co);
  return out;
}
