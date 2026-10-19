// Bigger wildlife: a pod of dolphins that cruises past the cove and leaps, and scarlet
// macaws that circle over the jungle. Both use the generated models when they are
// available (with the body flexed in the vertex shader) and simple stand-ins otherwise.
import * as THREE from 'three/webgpu';
import { positionLocal, vec3, float, sin, time, abs, max, smoothstep, uniform, texture, uv, sign } from 'three/tsl';
import { toNodeMaterial } from './dressing.js';
import { G } from './world.js';

/**
 * Normalise a generated model: centred, nose along +z, longest axis 1 m.
 * `wingsX`: for birds the widest horizontal axis is the wingspan and goes on x.
 */
function normalise(gltf, { wingsX = false, flipZ = false } = {}) {
  gltf.scene.updateMatrixWorld(true);
  let src = null; gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  if (!src) return null;
  const g = src.geometry.clone().applyMatrix4(src.matrixWorld);
  g.computeBoundingBox();
  const bb = g.boundingBox, c = new THREE.Vector3(), sz = new THREE.Vector3(); bb.getCenter(c); bb.getSize(sz);
  g.translate(-c.x, -c.y, -c.z);
  // body length along z (fish-like) or wingspan along x (birds)
  if (wingsX ? sz.z > sz.x : sz.x > sz.z) g.rotateY(Math.PI / 2);
  if (flipZ) g.rotateY(Math.PI);
  g.computeBoundingBox(); g.boundingBox.getSize(sz);
  const s = 1 / Math.max(sz.x, sz.y, sz.z); g.scale(s, s, s);
  g.computeVertexNormals();
  return { geometry: g, material: src.material };
}

// ------------------------------------------------------------------ dolphins
export class Dolphins {
  constructor(scene, A, fx, { count = 3, level = 0 } = {}) {
    this.fx = fx; this.level = level;
    const n = A.models.SM_Dolphin && normalise(A.models.SM_Dolphin, { flipZ: A.flip?.dolphin });
    const geo = n ? n.geometry : (() => { const g = new THREE.SphereGeometry(0.5, 20, 12); g.scale(0.22, 0.24, 1); return g; })();
    const mat = n ? toNodeMaterial(n.material) : new THREE.MeshStandardNodeMaterial({ color: 0x6f7f8c, roughness: 0.35 });
    if (n?.material.map) mat.colorNode = texture(n.material.map, uv()).rgb.mul(0.85);
    mat.roughnessNode = float(0.28);
    // swimming: the tail beats up and down, more toward the back
    this.beat = uniform(0);
    const z = positionLocal.z, tail = max(float(0), float(0.1).sub(z));
    mat.positionNode = positionLocal.add(vec3(0, sin(time.mul(5.5).sub(z.mul(5))).mul(tail.mul(tail)).mul(0.35).mul(this.beat.add(0.4)), 0));
    this.pod = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.scale.setScalar(2.3 + Math.random() * 0.5); m.rotation.order = 'YXZ';
      scene.add(m);
      this.pod.push({ m, off: new THREE.Vector3((i - 1) * 3.2, 0, (i % 2) * 2.5), phase: i * 1.7, jumpT: -1, wasUp: false });
    }
    this.t = 20;
  }

  update(dt) {
    this.t += dt;
    // the pod swims a long lap past the cove, out beyond the sea stacks
    const lap = 140, sp = 6.5, s = (this.t * sp) % (lap * 2);
    const dir = s < lap ? 1 : -1, x = -lap / 2 + (s < lap ? s : lap * 2 - s);
    const lane = 62 + Math.sin(this.t * 0.07) * 6;          // metres offshore (three.js +z)
    for (const d of this.pod) {
      const base = new THREE.Vector3(x + d.off.x * dir, 0, lane + d.off.z);
      // leaps: every few seconds each dolphin arcs out of the water
      const cycle = (this.t + d.phase * 2.3) % 7.5;
      let y = this.level - 0.9 + Math.sin(this.t * 1.3 + d.phase) * 0.25, pitch = 0;
      if (cycle < 1.25) {
        const u = cycle / 1.25;                               // 0..1 through the leap
        y = this.level - 0.6 + Math.sin(u * Math.PI) * 2.6;
        pitch = -Math.cos(u * Math.PI) * 0.75;                // nose up going out, down coming in
      }
      const up = y > this.level;
      if (up !== d.wasUp) {   // splash when breaking the surface either way
        const p = new THREE.Vector3(base.x, this.level + 0.05, base.z);
        for (let i = 0; i < 26; i++) this.fx.emit(p, new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 3), { life: 1.1, size: 0.18 + Math.random() * 0.12, gravity: 9 });
      }
      d.wasUp = up;
      d.m.position.set(base.x, y, base.z);
      d.m.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      d.m.rotation.x = -pitch;
      d.m.visible = true;
    }
    this.beat.value = 1;
  }
}

// ------------------------------------------------------------------ parrots
export class Parrots {
  constructor(scene, A, zone, { count = 3 } = {}) {
    const n = A.models.SM_Macaw && normalise(A.models.SM_Macaw, { wingsX: true, flipZ: A.flip?.macaw });
    const geo = n ? n.geometry : (() => { const g = new THREE.ConeGeometry(0.12, 0.8, 8); g.rotateX(Math.PI / 2); return g; })();
    const mat = n ? toNodeMaterial(n.material) : new THREE.MeshStandardNodeMaterial({ color: 0xd8262b, roughness: 0.6 });
    if (n?.material.map) mat.colorNode = texture(n.material.map, uv()).rgb;
    mat.side = THREE.DoubleSide;
    // wing beats: the farther from the body, the more the vertex moves up and down
    const x = positionLocal.x, reach = smoothstep(0.06, 0.5, abs(x));
    const flap = sin(time.mul(9).add(positionLocal.y.mul(0))).mul(reach).mul(abs(x)).mul(0.9);
    mat.positionNode = positionLocal.add(vec3(0, flap, 0));
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.scale.setScalar(0.85 + Math.random() * 0.2); m.rotation.order = 'YXZ';
      scene.add(m);
      this.birds.push({ m, r: 14 + i * 5, h: 20 + i * 3, speed: 0.22 + i * 0.03, a: i * 2.1, cx: -10 + i * 12, cz: -62 - i * 4 });
    }
  }
  update(dt, t) {
    for (const b of this.birds) {
      b.a += dt * b.speed;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r * 0.7;
      const ground = G(x, z), y = Math.max(ground + 13, b.h) + Math.sin(t * 0.6 + b.a * 3) * 1.2;
      const vx = -Math.sin(b.a) * b.r, vz = Math.cos(b.a) * b.r * 0.7;
      b.m.position.set(x, y, z);
      b.m.rotation.y = Math.atan2(vx, vz);
      b.m.rotation.z = -0.35;                     // bank into the turn
    }
  }
}
