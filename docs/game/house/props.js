// Generated-model props and tiny fallbacks (used while a model is missing).
import * as THREE from 'three/webgpu';
import { extractMesh } from '../assets.js';
import { toNodeMaterial } from '../dressing.js';

/** a generated model as a mesh with its origin at the bottom centre, scaled to `height` */
export function prop(A, name, height, fallback) {
  const src = extractMesh(A.models[name]);
  let mesh;
  if (src) {
    const g = src.geometry.clone(); g.computeBoundingBox();
    const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    const mat = toNodeMaterial(src.material); mat.side = THREE.FrontSide;
    mesh = new THREE.Mesh(g, mat);
    mesh.baseScale = height / Math.max(1e-3, bb.max.y - bb.min.y);
  } else {
    mesh = fallback();
    mesh.baseScale = 1; mesh.userData.fallback = true;
  }
  mesh.scale.setScalar(mesh.baseScale); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}
export const simple = (geo, col, rough = 0.5) => () => new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ color: col, roughness: rough }));
export const cyl = (r, h, col) => { const g = new THREE.CylinderGeometry(r, r, h, 20); g.translate(0, h / 2, 0); return simple(g, col); };

/** a liquid surface inside a cup/mug/pot item; colour follows state (water, cocoa, coffee) */
export function addLiquid(it, { r, y0, depth }) {
  const mat = new THREE.MeshPhysicalNodeMaterial({ color: 0x8fd8e8, roughness: 0.08, transparent: true, opacity: 0.85 });
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.004, 20), mat); disk.visible = false; it.object.add(disk);
  const prev = it.onState;
  it.onState = () => {
    const k = it.state.fill || 0; disk.visible = k > 0.02;
    const inv = 1 / (it.baseScale || 1);
    disk.scale.setScalar(inv); disk.position.y = (y0 + depth * k) * inv;
    const rich = it.state.coffee || it.state.cocoa;
    mat.color.set(it.state.coffee ? 0x3b2314 : it.state.cocoa ? 0x8a5a3a : 0x8fd8e8); mat.opacity = rich ? 0.98 : 0.8;
    prev?.();
  };
  it.onState();
}
