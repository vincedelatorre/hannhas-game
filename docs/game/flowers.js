// Love power blooms: flowers spring up from the ground around Wren, with a little bounce,
// sway in the wind, and slowly fade after a while so the island stays tidy.
import * as THREE from 'three/webgpu';
import { positionLocal, vec3, float, sin, time, uniform, attribute, instancedBufferAttribute, smoothstep, mix, clamp, exp, cos, step } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from './world.js';

export const clock = uniform(0);    // game time in seconds, set every tick

function flowerGeometry() {
  const parts = [];
  const tag = (g, k) => { g = g.toNonIndexed(); g.setAttribute('part', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1)); return g; };
  // five petals tilted up around the centre
  for (let i = 0; i < 5; i++) {
    const p = new THREE.CircleGeometry(0.5, 10); p.scale(0.055, 0.1, 1);
    p.translate(0, 0.085, 0); p.rotateX(-Math.PI / 2 + 0.55); p.rotateY((i / 5) * Math.PI * 2);
    p.translate(0, 0.16, 0);
    parts.push(tag(p, 0));
  }
  const c = new THREE.SphereGeometry(0.028, 8, 6); c.translate(0, 0.17, 0); parts.push(tag(c, 1));
  const stem = new THREE.CylinderGeometry(0.006, 0.008, 0.17, 4); stem.translate(0, 0.085, 0); parts.push(tag(stem, 2));
  for (const a of [0.4, 3.3]) {
    const l = new THREE.CircleGeometry(0.5, 8); l.scale(0.04, 0.11, 1); l.translate(0, 0.06, 0); l.rotateX(-Math.PI / 2 + 0.9); l.rotateY(a); l.translate(0, 0.03, 0);
    parts.push(tag(l, 2));
  }
  return mergeGeometries(parts);
}

const PALETTE = [[1, 0.42, 0.62], [1, 0.82, 0.25], [0.98, 0.95, 0.92], [0.78, 0.48, 1], [1, 0.55, 0.3]];

export class Blooms {
  constructor(scene, max = 220) {
    this.max = max; this.next = 0;
    const g = flowerGeometry();
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(max * 2).fill(-1e4), 2);   // born time, life
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    const b = instancedBufferAttribute(this.born), col = instancedBufferAttribute(this.col);
    const part = attribute('part', 'float');
    const age = clock.sub(b.x);
    // grow with an overshoot bounce, then shrink away at the end of life
    const grow = clamp(age.div(0.7), 0, 1);
    const bounce = float(1).add(sin(grow.mul(Math.PI * 1.5)).mul(exp(grow.mul(-3))).mul(0.6));
    const fade = float(1).sub(smoothstep(b.y.sub(1.5), b.y, age));
    const s = grow.mul(bounce).mul(fade);
    const sway = sin(time.mul(1.8).add(b.x.mul(13.7))).mul(positionLocal.y).mul(0.35);
    const sway2 = cos(time.mul(1.3).add(b.x.mul(7.1))).mul(positionLocal.y).mul(0.25);
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.55 });
    mat.positionNode = positionLocal.add(vec3(sway, 0, sway2)).mul(s);
    const petal = col.mul(mix(float(0.75), float(1.05), clamp(positionLocal.y.mul(5), 0, 1)));
    const isCentre = step(0.5, part).mul(float(1).sub(step(1.5, part))), isGreen = step(1.5, part);
    mat.colorNode = mix(mix(petal, vec3(1, 0.78, 0.12), isCentre), vec3(0.18, 0.5, 0.14), isGreen);
    mat.emissiveNode = col.mul(0.12).mul(float(1).sub(step(0.5, part)));
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.name = 'blooms';
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, m);
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3();
  }

  /** a ring of flowers around a point; skips water and steep ground */
  spawn(center, { count = 18, radius = 2.4, now, life = 40, waterLevelAt }) {
    let placed = 0;
    for (let k = 0; k < count * 3 && placed < count; k++) {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.sqrt(Math.random()) * radius;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r, y = G(x, z);
      if (waterLevelAt && waterLevelAt(x, z) > y - 0.05) continue;
      if (Math.abs(G(x + 0.3, z) - y) > 0.25 || Math.abs(G(x, z + 0.3) - y) > 0.25) continue;
      const i = this.next; this.next = (this.next + 1) % this.max;
      this.p.set(x, y - 0.01, z); this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28); this.s.setScalar(0.8 + Math.random() * 0.7);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      this.born.setXY(i, now + r * 0.12 + Math.random() * 0.1, life + Math.random() * 10);   // ripple outward
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.col.setXYZ(i, ...c);
      placed++;
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.born.needsUpdate = true; this.col.needsUpdate = true;
    return placed;
  }
}
