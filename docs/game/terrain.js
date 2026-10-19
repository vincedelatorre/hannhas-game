// Terrain: the cove heightfield with a TSL splat material (dry sand, wet sand, jungle floor,
// coastal rock) using the generated tileable textures, anti-tiling, macro variation,
// height-based blending and dynamic beach wetness from the swash line.
import * as THREE from 'three/webgpu';
import { texture, attribute, positionWorld, vec2, vec3, vec4, float, mix, smoothstep, uniform, mx_noise_float, rotate, max, pow, dot, clamp } from 'three/tsl';
import { H, smooth, slope } from './world.js';

export const swashLevel = uniform(0.05);    // how far up the beach the water reaches right now

export function buildTerrain(zone, T, Q) {
  const size = zone.size, seg = Q.name === 'low' ? 160 : 256;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const splat = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = -p.getZ(i), h = H(x, y);
    p.setY(i, h);
    const s = slope(x, y);
    const rock = smooth(0.42, 0.75, s);
    const wet = (1 - smooth(-0.3, 0.45, h)) * (1 - rock);
    const sand = smooth(-0.3, 0.45, h) * (1 - smooth(2.2, 3.4, h)) * (1 - rock);
    const green = smooth(2.2, 3.4, h) * (1 - rock);
    const tot = rock + wet + sand + green + 1e-5;
    splat.set([sand / tot, wet / tot, green / tot, rock / tot], i * 4);
  }
  g.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  g.computeVertexNormals();

  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const w = attribute('splat', 'vec4');
  const pw = positionWorld.xz;

  if (T.T_Sand_Dry && T.T_Sand_Wet && T.T_JungleFloor && T.T_Rock_Coastal) {
    // two samples at unrelated scales and rotations hide the repeat
    const sample = (tex, scale) => {
      const a = texture(tex, pw.mul(scale));
      const b = texture(tex, rotate(pw, float(0.73)).mul(scale * 0.41).add(vec2(0.37, 0.11)));
      return mix(a.rgb, b.rgb, 0.4);
    };
    // the generated textures are bright; bring them to real-world albedo (sand ~0.45, rock ~0.25)
    const sand = sample(T.T_Sand_Dry, 0.28).mul(vec3(0.98, 0.9, 0.74));
    const wet = sample(T.T_Sand_Wet, 0.22).mul(vec3(0.9, 0.82, 0.7));
    const jungle = sample(T.T_JungleFloor, 0.18).mul(vec3(0.85, 0.95, 0.7));
    const rock = sample(T.T_Rock_Coastal, 0.12).mul(vec3(0.55, 0.52, 0.47));

    // height-aware blend: grains of the stronger material poke through the softer one
    const lum = c => dot(c, vec3(0.3, 0.59, 0.11));
    const sharpen = (wt, c) => pow(wt.mul(lum(c).add(0.35)), float(3.0));
    const ws = sharpen(w.x, sand), ww = sharpen(w.y, wet), wj = sharpen(w.z, jungle), wr = sharpen(w.w, rock);
    const sum = max(ws.add(ww).add(wj).add(wr), float(1e-4));

    // greener, brighter jungle floor on the lower grassy band
    const greenTint = mix(vec3(0.62, 0.95, 0.42), vec3(0.8, 0.92, 0.62), smoothstep(4.0, 9.0, positionWorld.y));
    let col = sand.mul(ws).add(wet.mul(ww)).add(jungle.mul(greenTint).mul(wj)).add(rock.mul(wr)).div(sum);

    // large-scale variation so the beach is never one flat colour
    const macro = mx_noise_float(vec3(pw.mul(0.035), 0)).mul(0.5).add(0.5);
    col = col.mul(mix(float(0.86), float(1.1), macro));

    // dynamic wetness: water that just washed up darkens the sand and makes it glossy
    const wetLine = smoothstep(float(0.55), float(0.0), positionWorld.y.sub(swashLevel));
    const wetness = clamp(max(ww.div(sum), wetLine), 0, 1);
    col = col.mul(mix(float(1), float(0.62), wetLine.mul(w.x.add(w.y))));
    mat.colorNode = col;
    mat.roughnessNode = mix(float(0.93), float(0.32), wetness).mul(mix(float(1), float(0.85), w.w));
  } else {
    // fallback colours if textures are missing
    const c = vec3(0.96, 0.9, 0.77).mul(w.x).add(vec3(0.82, 0.74, 0.58).mul(w.y)).add(vec3(0.36, 0.55, 0.25).mul(w.z)).add(vec3(0.6, 0.57, 0.53).mul(w.w));
    mat.colorNode = c;
  }

  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** terrain heights as a small texture so water shaders know the depth under every point */
export function heightTexture(zone, res = 256) {
  const data = new Uint8Array(res * res * 4);
  const half = zone.size / 2;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = -half + (i / (res - 1)) * zone.size;
    const z = -half + (j / (res - 1)) * zone.size;      // three.js z
    const h = H(x, -z);
    const v = Math.max(0, Math.min(255, Math.round((h + 8) / 16 * 255)));   // -8..8 m
    const k = (j * res + i) * 4; data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
