// Water for the ocean, the lagoon pool and the tide pools.
//  - Gerstner wave cascade (vertex), damped by depth so swells calm down in the shallows
//  - swash: water runs up and back down the beach in a travelling band
//  - true thickness from the scene depth behind the surface -> Beer's law absorption,
//    turquoise in-scattering, refraction of the sand and reef below
//  - foam where the water gets thin (shoreline, around rocks, around legs) and on wave crests
//  - two scrolling detail normal layers so the surface never looks tiled
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, positionLocal, positionWorld, positionView, positionGeometry, vec2, vec3, vec4, float, sin, cos, normalize,
  texture, time, mix, smoothstep, exp, viewportSharedTexture, viewportDepthTexture, perspectiveDepthToViewZ,
  cameraNear, cameraFar, screenUV, transformNormalToView, max, min, clamp, mx_noise_float, varying, abs, pow, select, length
} from 'three/tsl';
import { swashLevel } from './terrain.js';

const TAU = Math.PI * 2;

/** periodic noise normal map (tiles perfectly) used for fine ripples */
function rippleNormalMap(size = 256, seed = 3) {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const waves = Array.from({ length: 28 }, () => {
    const a = r() * TAU, f = 1 + Math.floor(r() * 14);
    return { kx: Math.round(Math.cos(a) * f), ky: Math.round(Math.sin(a) * f), ph: r() * TAU, amp: 1 / (f ** 1.1) };
  }).filter(w => w.kx || w.ky);
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let h = 0; for (const w of waves) h += w.amp * Math.sin(TAU * (w.kx * x + w.ky * y) / size + w.ph);
    hgt[y * size + x] = h;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2, dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1);
    const k = (y * size + x) * 4;
    data[k] = (-dx / l * 0.5 + 0.5) * 255; data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; data[k + 2] = (1 / l * 0.5 + 0.5) * 255; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export const seaState = {
  amplitude: uniform(1.0),      // 0 = glassy, 1 = playful, 2 = choppy
  wind: uniform(new THREE.Vector2(0.35, 1).normalize()),
};

// Gerstner set: direction offset (radians from wind), wavelength (m), amplitude (m), steepness
const WAVES = [
  [0.00, 34, 0.30, 0.55], [0.45, 21, 0.18, 0.6], [-0.6, 13, 0.11, 0.65], [0.9, 8.5, 0.06, 0.7],
  [-1.2, 5.2, 0.035, 0.7], [0.25, 3.1, 0.02, 0.75],
];

export function createWaterSystem(scene, zone, heightTex, Q) {
  const ripple = rippleNormalMap();
  const half = zone.size / 2;
  const terrainAt = (xz, lod) => {
    const u = xz.add(half).div(zone.size);
    const s = lod ? texture(heightTex, vec2(u.x, u.y)).level(0) : texture(heightTex, vec2(u.x, u.y));
    return s.r.mul(16).sub(8);
  };

  function makeMaterial({ level, waves, swash, foamAmount = 1, tint = 0 }) {
    const lvl = uniform(level);
    const waveAmp = uniform(waves ? 1 : 0);
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: true, roughness: 0.04, metalness: 0 });

    // ---- vertex: Gerstner sum, damped by depth ----
    const displaced = Fn(() => {
      const p = positionLocal.toVar();
      const wp = positionGeometry.xz;
      const ground = terrainAt(wp, true);
      const depth = lvl.sub(ground);
      const damp = smoothstep(0.2, 7.0, depth).mul(waveAmp).mul(seaState.amplitude);
      const nrm = vec3(0, 1, 0).toVar();
      const crest = float(0).toVar();
      for (const [off, L, A, Qs] of WAVES) {
        const k = TAU / L, c = Math.sqrt(9.8 / k);
        const dir = vec2(cos(float(off)).mul(seaState.wind.x).sub(sin(float(off)).mul(seaState.wind.y)), sin(float(off)).mul(seaState.wind.x).add(cos(float(off)).mul(seaState.wind.y)));
        const f = dir.dot(wp).mul(k).sub(time.mul(c * k));
        const a = damp.mul(A);
        const q = Qs / (k * A * WAVES.length);
        p.x.addAssign(a.mul(q).mul(dir.x).mul(cos(f)));
        p.z.addAssign(a.mul(q).mul(dir.y).mul(cos(f)));
        p.y.addAssign(a.mul(sin(f)));
        nrm.x.subAssign(dir.x.mul(k).mul(a).mul(cos(f)));
        nrm.z.subAssign(dir.y.mul(k).mul(a).mul(cos(f)));
        nrm.y.subAssign(a.mul(q * k).mul(sin(f)));
        crest.addAssign(a.mul(sin(f)).div(A * 2));
      }
      if (swash) {
        // a gentle run-up band: water climbs the sand, then slides back
        const shore = float(1).sub(smoothstep(0.0, 2.5, depth));
        const run = sin(time.mul(0.55).sub(depth.mul(1.6))).mul(0.1).add(0.03);
        p.y.addAssign(run.mul(shore).mul(seaState.amplitude.mul(0.6).add(0.4)));
      }
      waveNormal.assign(normalize(nrm));
      waveCrest.assign(crest);
      return p;
    });
    const waveNormal = varying(vec3(0, 1, 0), 'vWaveNormal');
    const waveCrest = varying(float(0), 'vWaveCrest');
    mat.positionNode = displaced();

    // ---- fragment ----
    const pw = positionWorld.xz;
    const n1 = texture(ripple, pw.mul(0.055).add(time.mul(vec2(0.013, 0.009)))).xyz.mul(2).sub(1);
    const n2 = texture(ripple, pw.mul(0.13).sub(time.mul(vec2(0.008, -0.017)))).xyz.mul(2).sub(1);
    const n3 = texture(ripple, pw.mul(0.37).add(time.mul(vec2(-0.02, 0.012)))).xyz.mul(2).sub(1);
    const detail = n1.xy.mul(0.55).add(n2.xy.mul(0.35)).add(n3.xy.mul(0.18)).mul(waves ? 1.0 : 0.35);
    const nWorld = normalize(vec3(waveNormal.x.add(detail.x), waveNormal.y, waveNormal.z.add(detail.y)));
    mat.normalNode = transformNormalToView(nWorld);

    // how much water the eye looks through
    let thickness;
    if (Q.waterRefraction) {
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
      thickness = max(positionView.z.sub(sceneZ), float(0));
    } else {
      thickness = max(positionWorld.y.sub(terrainAt(pw, false)), float(0)).mul(1.25);
    }
    const thick = thickness;

    // Beer's law: red goes first, then green; what is left is lagoon turquoise
    const sigma = vec3(0.42, 0.075, 0.06).mul(tint ? 1.3 : 1);
    const trans = exp(sigma.negate().mul(thick));
    const shallowScatter = vec3(0.06, 0.5, 0.5);
    const deepScatter = vec3(0.004, 0.075, 0.15);
    const scatter = mix(shallowScatter, deepScatter, float(1).sub(exp(thick.mul(-0.09))));

    // foam: thin water at the shore and around rocks, plus breaking crests
    const foamNoise = mx_noise_float(vec3(pw.mul(1.7), time.mul(0.35))).mul(0.5).add(0.5);
    const foamNoise2 = mx_noise_float(vec3(pw.mul(6.0), time.mul(0.6))).mul(0.5).add(0.5);
    const shoreFoam = float(1).sub(smoothstep(0.0, 0.22, thick)).mul(smoothstep(0.25, 0.75, foamNoise.mul(0.6).add(foamNoise2.mul(0.5))));
    const crestFoam = smoothstep(0.55, 0.95, waveCrest).mul(smoothstep(0.45, 0.8, foamNoise2)).mul(0.8);
    const foam = clamp(shoreFoam.add(crestFoam).mul(foamAmount), 0, 1);

    if (Q.waterRefraction) {
      const offset = detail.mul(0.035).mul(clamp(thick.mul(0.5), 0, 1));
      const uvR = screenUV.add(offset);
      const sceneZR = perspectiveDepthToViewZ(viewportDepthTexture(uvR), cameraNear, cameraFar);
      const ok = positionView.z.sub(sceneZR).greaterThan(0);
      const behind = viewportSharedTexture(select(ok, uvR, screenUV)).rgb;
      const body = behind.mul(trans).add(scatter.mul(float(1).sub(trans)));
      mat.backdropNode = body;
      mat.backdropAlphaNode = float(1).sub(foam);
      mat.colorNode = vec3(0.96, 0.98, 1.0);
      mat.opacityNode = float(1);
    } else {
      mat.colorNode = mix(scatter, vec3(0.96, 0.98, 1.0), foam);
      mat.opacityNode = clamp(float(1).sub(trans.g.mul(trans.b)).add(foam.mul(0.8)), 0.12, 0.97);
    }
    mat.roughnessNode = mix(float(0.035), float(0.55), foam);
    mat.userData.level = lvl;
    mat.userData.waveAmp = waveAmp;
    return mat;
  }

  // ocean: a dense grid near the island, coarse far away
  const oceanGeo = new THREE.PlaneGeometry(1600, 1600, Q.name === 'low' ? 200 : 360, Q.name === 'low' ? 200 : 360);
  oceanGeo.rotateX(-Math.PI / 2);
  // pull vertices toward the island so detail is where the camera is
  const pa = oceanGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i), r = Math.hypot(x, z) / 800;
    const k = Math.pow(Math.min(r, 1), 1.8) / Math.max(r, 1e-6);
    pa.setX(i, x * k); pa.setZ(i, z * k);
  }
  const oceanMat = makeMaterial({ level: zone.seaLevel, waves: true, swash: true });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = zone.seaLevel; ocean.receiveShadow = true; ocean.name = 'ocean';
  ocean.frustumCulled = false;
  scene.add(ocean);

  // lagoon pool
  const L = zone.lagoon;
  const lagoonGeo = new THREE.CircleGeometry(1, 96); lagoonGeo.rotateX(-Math.PI / 2);
  lagoonGeo.scale(L.radius[0] + 0.6, 1, L.radius[1] + 0.6);
  lagoonGeo.translate(L.center[0], 0, -L.center[1]);
  const lagoonMat = makeMaterial({ level: L.level, waves: false, swash: false, foamAmount: 0.6 });
  const lagoon = new THREE.Mesh(lagoonGeo, lagoonMat);
  lagoon.position.y = L.level; lagoon.name = 'lagoon'; lagoon.receiveShadow = true;
  // geometry is in world xz already; shader uses positionGeometry.xz as world coordinates
  scene.add(lagoon);

  // tide pools start nearly empty and fill up with water power
  const tideMat = makeMaterial({ level: 0, waves: false, swash: false, foamAmount: 0.4 });
  const pools = zone.tidePools.map(([x, y]) => {
    const g = new THREE.CircleGeometry(1.9, 48); g.rotateX(-Math.PI / 2); g.translate(x, 0, -y);
    const m = new THREE.Mesh(g, tideMat.clone());
    m.material.userData = tideMat.userData;
    m.name = 'tidepool'; scene.add(m);
    return { mesh: m, x, y, fill: 0 };
  });

  return {
    ocean, lagoon, pools,
    update(dt, t) {
      // keep the wetness line on the sand in step with the swash band
      swashLevel.value = 0.06 + 0.1 * Math.max(0, Math.sin(t * 0.55)) * (0.4 + 0.6 * seaState.amplitude.value);
    },
  };
}
