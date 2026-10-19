// Flat decals that lie on the ground or the water: footprints in the sand that slowly fill
// in, and ripple rings that spread where someone wades or something splashes.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, texture, uv, vec4, float, vec3 } from 'three/tsl';

function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); return t;
}

const FOOT = () => canvasTex((g, s) => {          // a soft shoe print: toe blob + heel blob
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, s, s);
  const blob = (x, y, rx, ry, a) => { const r = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); r.addColorStop(0, `rgba(0,0,0,${a})`); r.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = r; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 7); g.fill(); g.restore(); };
  blob(s * 0.5, s * 0.3, s * 0.2, s * 0.26, 0.85); blob(s * 0.5, s * 0.72, s * 0.15, s * 0.18, 0.75);
});
const RING = () => canvasTex((g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,0.75)'); r.addColorStop(0.8, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

class DecalSet {
  constructor(scene, map, { max = 200, color = [0, 0, 0], blending = THREE.NormalBlending, lift = 0.02 } = {}) {
    this.max = max; this.lift = lift;
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending });
    const t = texture(map, uv());
    mat.colorNode = vec3(...color);
    mat.opacityNode = t.a.mul(instancedBufferAttribute(this.alpha));
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    scene.add(this.mesh);
    this.items = []; this.next = 0; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion();
  }
  add(pos, { yaw = 0, size = 0.3, sizeY = size, life = 20, alpha = 0.5, grow = 0, normal = null }) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const it = this.items[i] = { pos: pos.clone(), yaw, size, sizeY, life, max: life, alpha, grow, normal };
    this.write(i, it, 0);
  }
  write(i, it, t) {
    const s = it.size * (1 + it.grow * t), sy = it.sizeY * (1 + it.grow * t);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw);
    if (it.normal) this.q.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), it.normal));
    this.m.compose(it.pos.clone().add(new THREE.Vector3(0, this.lift, 0)), this.q, new THREE.Vector3(s, 1, sy));
    this.mesh.setMatrixAt(i, this.m);
  }
  update(dt) {
    let any = false;
    this.items.forEach((it, i) => {
      if (!it || it.life <= 0) return;
      it.life -= dt; const t = 1 - it.life / it.max;
      this.alpha.array[i] = it.life <= 0 ? 0 : it.alpha * Math.min(1, it.life / (it.max * 0.6)) * Math.min(1, t * 8 + 0.2);
      if (it.grow) this.write(i, it, t);
      any = true;
    });
    if (any) { this.alpha.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true; }
  }
}

export class Decals {
  constructor(scene) {
    this.feet = new DecalSet(scene, FOOT(), { max: 240, color: [0.28, 0.2, 0.12] });
    this.rings = new DecalSet(scene, RING(), { max: 90, color: [1, 1, 1], lift: 0.03 });
    this.trackers = new Map();
  }

  /** call each frame per character: leaves prints on sand, ripples in water */
  track(id, pos, face, { onSand, inWater, waterLevel, speed, normal }) {
    let t = this.trackers.get(id);
    if (!t) { t = { last: pos.clone(), side: 1, ripple: 0 }; this.trackers.set(id, t); }
    const moved = Math.hypot(pos.x - t.last.x, pos.z - t.last.z);
    if (onSand && !inWater && moved > 0.62) {
      const side = new THREE.Vector3(Math.cos(face), 0, -Math.sin(face)).multiplyScalar(0.11 * t.side);
      this.feet.add(pos.clone().add(side), { yaw: face, size: 0.13, sizeY: 0.3, life: 26, alpha: 0.42, normal });
      t.side *= -1; t.last.copy(pos);
    } else if (!onSand) t.last.copy(pos);
    if (inWater) {
      t.ripple -= 1 / 60;
      if (t.ripple <= 0) {
        t.ripple = speed > 0.5 ? 0.18 : 0.7;
        this.rings.add(new THREE.Vector3(pos.x, waterLevel, pos.z), { size: 0.5, life: 1.6, alpha: 0.55, grow: 2.6 });
      }
    }
  }

  splashRing(pos, size = 0.6) { this.rings.add(pos, { size, life: 1.2, alpha: 0.6, grow: 2.2 }); }

  update(dt) { this.feet.update(dt); this.rings.update(dt); }
}
