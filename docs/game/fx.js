// Particle systems: one instanced sprite draw per kind (water, hearts, sparkles), CPU
// simulated with gravity, drag, ground and water collision, size and fade curves.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, texture, uv, vec4, float } from 'three/tsl';

function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const TEX = {
  drop: () => canvasTex((g, s) => {   // a bright droplet with a highlight
    const r = g.createRadialGradient(s * 0.42, s * 0.38, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(210,248,255,0.95)'); r.addColorStop(0.7, 'rgba(120,215,240,0.55)'); r.addColorStop(1, 'rgba(120,215,240,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  glow: () => canvasTex((g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }),
  heart: () => canvasTex((g, s) => {
    g.shadowColor = 'rgba(255,120,170,0.9)'; g.shadowBlur = s * 0.12;
    const grd = g.createLinearGradient(0, s * 0.15, 0, s * 0.9); grd.addColorStop(0, '#ffc2d6'); grd.addColorStop(1, '#ff5d8f');
    g.fillStyle = grd; g.beginPath(); const m = s / 2;
    g.moveTo(m, s * 0.84); g.bezierCurveTo(s * 0.08, s * 0.52, s * 0.14, s * 0.12, m, s * 0.3); g.bezierCurveTo(s * 0.86, s * 0.12, s * 0.92, s * 0.52, m, s * 0.84); g.fill();
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(s * 0.34, s * 0.34, s * 0.07, s * 0.045, -0.6, 0, 7); g.fill();
  }),
  foam: () => canvasTex((g, s) => {
    for (let i = 0; i < 26; i++) { const x = s / 2 + (Math.random() - 0.5) * s * 0.5, y = s / 2 + (Math.random() - 0.5) * s * 0.5, r = s * (0.06 + Math.random() * 0.14);
      const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, s, s); }
  }),
};

export class Particles {
  constructor(scene, map, { max = 600, additive = false, ground = null, water = null } = {}) {
    this.max = max; this.ground = ground; this.water = water;
    this.off = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const c = instancedBufferAttribute(this.col);
    const tex = texture(map, uv());
    mat.positionNode = instancedBufferAttribute(this.off);
    mat.scaleNode = instancedBufferAttribute(this.size);
    mat.colorNode = vec4(tex.rgb.mul(c.rgb), tex.a.mul(c.a));
    mat.opacityNode = tex.a.mul(c.a);
    this.sprite = new THREE.Sprite(mat);
    this.sprite.count = max; this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 5;
    scene.add(this.sprite);
    this.p = []; this.free = [...Array(max).keys()].reverse();
  }

  emit(pos, vel, { life = 1, size = 0.2, grow = 0, color = [1, 1, 1], alpha = 1, gravity = 0, drag = 0, fadeIn = 0, onHit = null, bounce = 0 } = {}) {
    const i = this.free.pop(); if (i === undefined) return;
    this.p.push({ i, pos: pos.clone(), vel: vel.clone(), life, max: life, size, grow, color, alpha, gravity, drag, fadeIn, onHit, bounce });
  }

  update(dt) {
    const off = this.off.array, sz = this.size.array, col = this.col.array;
    for (let k = this.p.length - 1; k >= 0; k--) {
      const q = this.p[k];
      q.life -= dt;
      q.vel.y -= q.gravity * dt;
      if (q.drag) q.vel.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      q.pos.addScaledVector(q.vel, dt);
      let dead = q.life <= 0;
      if (!dead && q.onHit && q.vel.y < 0) {
        const g = this.ground ? this.ground(q.pos.x, q.pos.z) : -Infinity;
        const w = this.water ? this.water(q.pos.x, q.pos.z) : -Infinity;
        const top = Math.max(g, w);
        if (q.pos.y <= top) { q.onHit(q.pos.clone().setY(top), w >= g); dead = true; }
      }
      const t = 1 - q.life / q.max;
      const fade = Math.min(1, q.fadeIn > 0 ? t / q.fadeIn : 1) * Math.min(1, q.life / Math.min(0.35, q.max * 0.5));
      off.set([q.pos.x, q.pos.y, q.pos.z], q.i * 3);
      sz[q.i] = dead ? 0 : q.size * (1 + q.grow * t);
      col.set([q.color[0], q.color[1], q.color[2], q.alpha * fade], q.i * 4);
      if (dead) { sz[q.i] = 0; this.free.push(q.i); this.p.splice(k, 1); }
    }
    this.off.needsUpdate = this.size.needsUpdate = this.col.needsUpdate = true;
  }
}
