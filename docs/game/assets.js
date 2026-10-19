// Asset registry: loads the browser-ready models, clips and textures from docs/assets
// (built by Tools/web on GitHub) with progress, and never throws: a missing file resolves
// to null so the game can fall back to simpler stand-ins.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class Assets {
  constructor(base = 'assets/') {
    this.base = base;
    this.gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.tex = new THREE.TextureLoader();
    this.models = {}; this.clips = {}; this.textures = {};
    this.total = 0; this.done = 0; this.failed = [];
    this.onProgress = () => {};
  }

  _tick(name, ok) {
    this.done++; if (!ok) this.failed.push(name);
    this.onProgress(this.done / Math.max(1, this.total), name);
  }

  model(name) {
    this.total++;
    return new Promise(res => this.gltf.load(`${this.base}models/${name}.glb`,
      g => { this.models[name] = g; this._tick(name, true); res(g); },
      undefined,
      () => { this.models[name] = null; this._tick(name, false); res(null); }));
  }

  /** animation-only GLB -> AnimationClip named after the file */
  clip(character, name) {
    this.total++;
    return new Promise(res => this.gltf.load(`${this.base}models/${character}_${name}.glb`,
      g => { const c = g.animations[0] || null; if (c) c.name = name; (this.clips[character] ||= {})[name] = c; this._tick(name, !!c); res(c); },
      undefined,
      () => { this._tick(`${character}_${name}`, false); res(null); }));
  }

  texture(name, { repeat = true, srgb = true } = {}) {
    this.total++;
    return new Promise(res => this.tex.load(`${this.base}textures/${name}.webp`,
      t => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        this.textures[name] = t; this._tick(name, true); res(t);
      },
      undefined,
      () => { this.textures[name] = null; this._tick(name, false); res(null); }));
  }
}

/** meshopt files store positions/normals/uvs as small integers; expand to floats so the
 *  geometry can be transformed and read safely */
export function dequantize(src) {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) { g.setAttribute(name, a.clone()); continue; }
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent ? a.getComponent(i, k) : [a.getX, a.getY, a.getZ, a.getW][k].call(a, i);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  return g;
}

/** first mesh's geometry + material from a static GLB, with the node transform baked in */
export function extractMesh(gltf) {
  if (!gltf) return null;
  let found = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { if (!found && o.isMesh) found = o; });
  if (!found) return null;
  const geometry = dequantize(found.geometry);
  geometry.applyMatrix4(found.matrixWorld);
  geometry.computeBoundingBox();
  return { geometry, material: found.material, box: geometry.boundingBox };
}
