// World dressing: the clubhouse, props, instanced vegetation with wind, torches with real
// flickering light, the gameplay slide tower and the jetty. Each placement comes from the
// zone file; each model falls back to a simple stand-in if it failed to load.
import * as THREE from 'three/webgpu';
import { positionLocal, vec2, vec3, float, sin, time, instanceIndex, uniform, mx_noise_float, smoothstep, pow, texture, uv, mix, positionWorld, color } from 'three/tsl';
import { H, V, rng, slope } from './world.js';
import { extractMesh } from './assets.js';

export const wind = { strength: uniform(1.0) };

/** copy a loaded glTF material into a node material so we can add wind and effects */
export function toNodeMaterial(src, Kind = THREE.MeshStandardNodeMaterial) {
  const m = new Kind();
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) if (src[k]) m[k] = src[k];
  for (const k of ['roughness', 'metalness', 'transparent', 'opacity', 'alphaTest', 'side', 'emissiveIntensity', 'aoMapIntensity', 'envMapIntensity']) if (src[k] !== undefined) m[k] = src[k];
  if (src.color) m.color.copy(src.color);
  if (src.emissive) m.emissive.copy(src.emissive);
  if (src.normalScale) m.normalScale.copy(src.normalScale);
  return m;
}

/** wind sway that grows with height: whole plant bends, tips flutter */
function addWind(mat, height, { bend = 0.035, flutter = 0.006, speed = 1.0 } = {}) {
  const h = positionLocal.y.div(height).clamp(0, 1);
  const phase = instanceIndex.toFloat().mul(1.731);
  const gust = sin(time.mul(0.35 * speed).add(phase.mul(0.3))).mul(0.5).add(0.75);
  const sway = sin(time.mul(1.1 * speed).add(phase)).mul(bend).mul(pow(h, 2.2)).mul(gust).mul(wind.strength);
  const sway2 = sin(time.mul(0.83 * speed).add(phase.mul(1.7))).mul(bend * 0.6).mul(pow(h, 2.2)).mul(wind.strength);
  const leaf = mx_noise_float(positionLocal.mul(9).add(vec3(time.mul(2.3), 0, time.mul(1.7)))).mul(flutter).mul(smoothstep(0.45, 1.0, h)).mul(wind.strength);
  mat.positionNode = positionLocal.add(vec3(sway.add(leaf), leaf.mul(0.5), sway2.add(leaf)));
}

/** many copies of one model: instanced, with per-instance yaw/scale and optional wind */
export function scatter(scene, gltf, items, { windOpts = null, castShadow = true, receiveShadow = true, sink = 0 } = {}) {
  const src = extractMesh(gltf);
  if (!src || !items.length) return null;
  const mat = toNodeMaterial(src.material);
  const height = src.box.max.y - src.box.min.y;
  if (windOpts) addWind(mat, height, windOpts);
  const mesh = new THREE.InstancedMesh(src.geometry, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  items.forEach((it, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw);
    s.setScalar(it.scale); if (it.scaleY) s.y = it.scaleY;
    p.set(it.x, it.h - sink * it.scale, it.z);
    m.compose(p, q, s); mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return { mesh, height, width: src.box.max.x - src.box.min.x, depth: src.box.max.z - src.box.min.z };
}

/** one static model placed and scaled by a target height, width or length */
export function place(scene, gltf, { x, y, yaw = 0, height, width, length, sink = 0 }) {
  const src = extractMesh(gltf);
  if (!src) return null;
  const mat = toNodeMaterial(src.material);
  const mesh = new THREE.Mesh(src.geometry, mat);
  const b = src.box, sz = new THREE.Vector3().subVectors(b.max, b.min);
  const k = height ? height / sz.y : width ? width / Math.max(sz.x, sz.z) : length ? length / Math.max(sz.x, sz.z) : 1;
  mesh.scale.setScalar(k);
  mesh.rotation.y = THREE.MathUtils.degToRad(yaw);
  mesh.position.copy(V(x, y, H(x, y) - sink * k));
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  mesh.userData.size = sz.multiplyScalar(k);
  return mesh;
}

// ---------------------------------------------------------------------------------------

export function dressWorld(scene, zone, A, Q) {
  const out = { colliders: [], torchLights: [], flames: [], animated: [] };
  const R = rng(zone.palms.jungle.seed);
  const M = A.models;

  // ---- clubhouse ----
  const C = zone.clubhouse;
  const club = place(scene, M[C.model], { x: C.pos[0], y: C.pos[1], yaw: C.yaw, width: C.footprint, sink: 0.004 });
  if (club) { club.name = 'clubhouse'; out.clubhouse = club; out.colliders.push({ type: 'mesh', mesh: club }); }

  // ---- palms: hero palms near the beach, light LOD palms in the jungle band ----
  const heroPalms = zone.palms.hero.map(([x, y]) => ({ x, z: -y, h: H(x, y), yaw: R() * Math.PI * 2, scale: (zone.palms.heights[0] + R() * (zone.palms.heights[1] - zone.palms.heights[0])) / 0.98 }));
  const J = zone.palms.jungle, jungle = [];
  for (let i = 0; i < J.count * Q.jungleDensity; i++) {
    const x = J.x[0] + R() * (J.x[1] - J.x[0]), y = J.y[0] + R() * (J.y[1] - J.y[0]);
    if (Math.abs(x) < 16 && y < 44) continue;
    if (slope(x, y) > 0.7) continue;
    jungle.push({ x, z: -y, h: H(x, y), yaw: R() * Math.PI * 2, scale: (11 + R() * 5) / 0.98 });
  }
  const palmWind = { bend: 0.03, flutter: 0.005, speed: 1.0 };
  const heroModel = Q.palmsHero === 'hero' ? M.SM_PalmTree : (M.SM_PalmTree_LOD || M.SM_PalmTree);
  const palmsA = scatter(scene, heroModel, heroPalms, { windOpts: palmWind });
  const palmsB = scatter(scene, M.SM_PalmTree_LOD || M.SM_PalmTree, jungle, { windOpts: palmWind, castShadow: Q.name !== 'low' });
  for (const p of [...heroPalms, ...jungle]) out.colliders.push({ type: 'cylinder', x: p.x, z: p.z, h: p.h, r: 0.32, height: 4 });
  out.palms = [palmsA, palmsB];

  // ---- hibiscus bushes ----
  const bushes = zone.hibiscus.map(([x, y]) => ({ x, z: -y, h: H(x, y), yaw: R() * 6.28, scale: (1.5 + R() * 0.7) / 0.98 }));
  scatter(scene, M.SM_Hibiscus, bushes, { windOpts: { bend: 0.025, flutter: 0.012, speed: 1.6 } });

  // ---- boulders (tide pool rocks, cliffs, sea stacks) ----
  // sink rocks deeper on slopes so no side floats
  const rocks = zone.boulders.map(([x, y, s]) => { const sc = s * 1.7 / 0.98, sl = Math.min(1.2, slope(x, y)); const deep = H(x, y) < -1.5; return { x, z: -y, h: H(x, y) - sl * sc * 0.32, yaw: R() * 6.28, scale: sc, scaleY: sc * (0.75 + R() * 0.35) * (deep ? 2.1 : 1) }; });
  const rockSet = scatter(scene, M.SM_Boulder_Mossy, rocks, { sink: 0.12 });
  for (const r of rocks) out.colliders.push({ type: 'ball', x: r.x, z: r.z, h: r.h + r.scale * 0.2, r: r.scale * 0.46 });
  out.rockSet = rockSet;

  // ---- props ----
  for (const p of zone.props) {
    let yaw = p.yaw ?? 0;
    if (p.faceToward) yaw = THREE.MathUtils.radToDeg(Math.atan2(-(-p.faceToward[1] - -p.pos[1]), p.faceToward[0] - p.pos[0]));
    const mesh = place(scene, M[p.model], { x: p.pos[0], y: p.pos[1], yaw, height: p.height, width: p.width, length: p.length });
    if (!mesh) continue;
    if (p.id) out[p.id] = mesh;
    if (p.collider === 'box') out.colliders.push({ type: 'box', mesh });
  }

  // ---- torches with flames; the nearest few cast real light ----
  const flameTex = radialTexture(['rgba(255,250,220,1)', 'rgba(255,190,90,0.85)', 'rgba(255,110,30,0.35)', 'rgba(255,80,20,0)']);
  for (const [x, y] of zone.torches) {
    const t = place(scene, M.SM_TikiTorch, { x, y, yaw: R() * 360, height: 1.9, sink: 0.02 });
    const top = V(x, y, H(x, y) + 1.88);
    const fm = new THREE.SpriteNodeMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const flame = new THREE.Sprite(fm); flame.position.copy(top).add(new THREE.Vector3(0, 0.16, 0)); flame.scale.set(0.38, 0.6, 1);
    scene.add(flame); out.flames.push({ s: flame, base: flame.position.clone(), ph: R() * 10 });
    out.colliders.push({ type: 'cylinder', x, z: -y, h: H(x, y), r: 0.09, height: 1.9 });
  }
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xff9a45, 0, 9, 2); scene.add(l); out.torchLights.push(l);
  }

  // ---- gameplay slide: bamboo tower + glossy tube spiralling into the lagoon ----
  buildSlide(scene, zone, A, out);

  // ---- jetty ----
  buildJetty(scene, zone, A, out);

  // ---- clam shell for Wren's hand ----
  out.clamGltf = M.SM_Clam_Pearl;
  return out;
}

export function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach((s, i) => grd.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function bambooMaterial(A, repeat = [1, 3]) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.62 });
  const T = A.textures.T_Bamboo_Woven;
  if (T) m.colorNode = texture(T, uv().mul(vec2(repeat[0], repeat[1]))).rgb.mul(0.95);
  else m.color.set(0xc99a5a);
  return m;
}
function thatchMaterial(A) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const T = A.textures.T_Thatch;
  if (T) m.colorNode = texture(T, uv().mul(vec2(3, 2))).rgb; else m.color.set(0xc9a15f);
  return m;
}

function buildSlide(scene, zone, A, out) {
  const S = zone.slide, [tx, ty] = S.tower, base = H(tx, ty);
  const g = new THREE.Group(); scene.add(g);
  const bam = bambooMaterial(A, [1, 4]);
  // four bamboo legs and a deck with a thatched roof
  for (const [dx, dy] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, S.top + 3.2, 10), bam);
    leg.position.copy(V(tx + dx, ty + dy, base + (S.top + 3.2) / 2)); leg.castShadow = true; g.add(leg);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 3.4), bambooMaterial(A, [3, 3]));
  deck.position.copy(V(tx, ty, base + S.top - 0.3)); deck.castShadow = deck.receiveShadow = true; g.add(deck);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.8, 12), thatchMaterial(A));
  roof.position.copy(V(tx, ty, base + S.top + 3.5)); roof.castShadow = true; g.add(roof);
  // rope ladder rungs
  for (let k = 0; k < Math.floor(S.top / 0.45); k++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), bam);
    r.rotation.z = Math.PI / 2; r.position.copy(V(tx, ty - 1.55, base + 0.4 + k * 0.45)); g.add(r);
  }
  // helix tube from the deck down to the lagoon
  const pts = [];
  const top = base + S.top - 0.2, N = 80;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = Math.PI / 2 + t * S.turns * 2 * Math.PI;
    pts.push(V(tx + S.radius * Math.cos(a) * 1.0 + 1.6, ty + S.radius * Math.sin(a) - 1.0, top - t * (S.top - 3.2)));
  }
  const e = pts.at(-1), ex = new THREE.Vector3(S.exit[0], zone.lagoon.level + 0.35, -S.exit[1]);
  for (let i = 1; i <= 14; i++) pts.push(e.clone().lerp(ex, i / 14).setY(THREE.MathUtils.lerp(e.y, ex.y, Math.pow(i / 14, 0.8))));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubeMat = new THREE.MeshPhysicalNodeMaterial({ color: 0x7fe6c9, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  // open half-pipe: keep the lower half of the tube
  const geo = new THREE.TubeGeometry(curve, 420, 0.62, 18, false);
  const idx = []; const ring = 19;
  for (let i = 0; i < 420; i++) for (let j = 0; j < 18; j++) {
    const ang = j / 18 * Math.PI * 2; if (ang < Math.PI * 0.15 || ang > Math.PI * 1.85) continue;
    const a = i * ring + j, b = (i + 1) * ring + j, c = (i + 1) * ring + j + 1, d = i * ring + j + 1;
    idx.push(a, b, d, b, c, d);
  }
  geo.setIndex(idx);
  const tube = new THREE.Mesh(geo, tubeMat); tube.castShadow = true; tube.receiveShadow = true; g.add(tube);
  // supports
  for (let i = 8; i < pts.length - 6; i += 10) {
    const p = pts[i], hgt = p.y - H(p.x, -p.z);
    if (hgt < 0.8) continue;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, hgt, 8), bam);
    post.position.set(p.x, p.y - hgt / 2 - 0.5, p.z); post.castShadow = true; g.add(post);
  }
  out.slideCurve = curve;
  out.colliders.push({ type: 'cylinder', x: tx, z: -ty, h: base, r: 1.9, height: S.top });
}

function buildJetty(scene, zone, A, out) {
  const J = zone.jetty;
  const a = new THREE.Vector3(J.from[0], 0, -J.from[1]), b = new THREE.Vector3(J.to[0], 0, -J.to[1]);
  const len = a.distanceTo(b), dir = b.clone().sub(a).normalize(), yaw = Math.atan2(dir.x, dir.z);
  const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.82 });
  // weathered silver-brown planks with grain
  const grain = mx_noise_float(positionWorld.mul(vec3(0.8, 4, 22))).mul(0.5).add(0.5);
  wood.colorNode = mix(color(0x6d5a47), color(0xa79074), grain);
  const g = new THREE.Group(); scene.add(g);
  const n = Math.floor(len / 0.32);
  for (let i = 0; i < n; i++) {
    const p = a.clone().addScaledVector(dir, i * 0.32 + 0.16);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(J.width, 0.07, 0.28), wood);
    plank.position.set(p.x, Math.max(1.05, H(p.x, -p.z) + 0.6), p.z); plank.rotation.y = yaw + (Math.random() - 0.5) * 0.02;
    plank.castShadow = plank.receiveShadow = true; g.add(plank);
  }
  for (let i = 0; i <= len; i += 3) {
    const p = a.clone().addScaledVector(dir, i);
    for (const s of [-1, 1]) {
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(s * (J.width / 2 - 0.1));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.2, 10), wood);
      post.position.set(p.x + side.x, -0.9, p.z + side.z); post.castShadow = true; g.add(post);
    }
  }
  out.jetty = { a, b, dir, len, width: J.width, top: 1.12 };
}
