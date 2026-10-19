// Physics with Rapier: terrain heightfield, the clubhouse as a full triangle mesh (so its
// stairs and decks are walkable), simple shapes for palms, rocks and props, and a kinematic
// character controller (auto-step, slopes, snap to ground) used by Wren and her friend.
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { H } from './world.js';

export class Physics {
  static async create(zone, colliders) {
    await RAPIER.init();
    const p = new Physics();
    p.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    p.addTerrain(zone);
    for (const c of colliders) p.addCollider(c);
    p.world.step();
    return p;
  }

  addTerrain(zone, n = 256) {
    const size = zone.size, heights = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const x = -size / 2 + (j * size) / n, z = -size / 2 + (i * size) / n;
      heights[j * (n + 1) + i] = H(x, -z);
    }
    this.world.createCollider(RAPIER.ColliderDesc.heightfield(n, n, heights, { x: size, y: 1, z: size }).setFriction(0.9));
  }

  addCollider(c) {
    const W = this.world, R = RAPIER;
    if (c.type === 'mesh') {
      const m = c.mesh; m.updateMatrixWorld(true);
      const g = m.geometry, pos = g.attributes.position, v = new THREE.Vector3();
      const verts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); verts.set([v.x, v.y, v.z], i * 3); }
      const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
      W.createCollider(R.ColliderDesc.trimesh(verts, idx));
    } else if (c.type === 'box') {
      const m = c.mesh; m.updateMatrixWorld(true);
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox, s = m.scale.x;
      const half = new THREE.Vector3().subVectors(b.max, b.min).multiplyScalar(0.5 * s * 0.9);
      const centre = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5).applyMatrix4(m.matrixWorld);
      const q = m.quaternion;
      W.createCollider(R.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    } else if (c.type === 'cylinder') {
      W.createCollider(R.ColliderDesc.cylinder(c.height / 2, c.r).setTranslation(c.x, c.h + c.height / 2 - 0.2, c.z));
    } else if (c.type === 'ball') {
      W.createCollider(R.ColliderDesc.ball(c.r).setTranslation(c.x, c.h, c.z));
    }
  }

  /** a capsule character; position is the feet */
  character({ x, y, z, radius = 0.28, height = 1.56 }) {
    const R = RAPIER;
    const half = Math.max(0.05, height / 2 - radius);
    const body = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + height / 2, z));
    const collider = this.world.createCollider(R.ColliderDesc.capsule(half, radius).setFriction(0), body);
    const cc = this.world.createCharacterController(0.03);
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(52));
    cc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(40));
    cc.enableAutostep(0.42, 0.18, true);
    cc.enableSnapToGround(0.4);
    cc.setSlideEnabled(true);
    const physics = this;
    return {
      body, collider, cc, height, grounded: false,
      get feet() { const t = body.translation(); return new THREE.Vector3(t.x, t.y - height / 2, t.z); },
      /** move by a desired displacement; returns the displacement actually applied */
      move(d) {
        cc.computeColliderMovement(collider, { x: d.x, y: d.y, z: d.z });
        const m = cc.computedMovement();
        const t = body.translation();
        body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
        this.grounded = cc.computedGrounded();
        // wall normals (mostly horizontal) so callers can stop pushing into walls
        this.walls = [];
        for (let i = 0; i < cc.numComputedCollisions(); i++) {
          const c = cc.computedCollision(i); const n = c?.normal1;
          if (n && Math.abs(n.y) < 0.55) this.walls.push(new THREE.Vector3(n.x, 0, n.z).normalize());
        }
        return new THREE.Vector3(m.x, m.y, m.z);
      },
      teleport(x, y, z) { body.setTranslation({ x, y: y + height / 2, z }, true); body.setNextKinematicTranslation({ x, y: y + height / 2, z }); },
    };
  }

  step(dt) { this.world.timestep = Math.min(dt, 1 / 30); this.world.step(); }

  /** ground height under a point (terrain or anything solid), or null */
  groundAt(x, z, fromY = 60) {
    const hit = this.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), fromY + 20, true);
    return hit ? fromY - hit.timeOfImpact : null;
  }
}
