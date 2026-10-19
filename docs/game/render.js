// Renderer, sky, sun, environment lighting and the post-processing chain
// (ambient occlusion, god rays, bloom, ACES filmic tone mapping, vignette, anti-aliasing).
import * as THREE from 'three/webgpu';
import { underwater } from './underwater.js';
export const photoFilter = uniform(0);
import { pass, mrt, output, normalView, directionToColor, colorToDirection, vec4, vec3, float, renderOutput, uv, smoothstep, length, uniform, saturation, mix, dot } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { depthAwareBlend } from 'three/addons/tsl/display/depthAwareBlend.js';

export async function createRenderer(canvas, Q) {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  await renderer.init();
  return renderer;
}

/** Physically based sky with clouds, a warm sun and image-based lighting from the same sky. */
export class SkyAndSun {
  constructor(renderer, scene, Q, { elevation = 24, azimuth = 32 } = {}) {
    this.renderer = renderer; this.scene = scene; this.Q = Q;
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(4500);
    this.sky.turbidity.value = 1.7;
    this.sky.rayleigh.value = 2.5;      // deeper blue sky
    this.sky.mieCoefficient.value = 0.004;
    this.sky.mieDirectionalG.value = 0.82;
    this.sky.cloudCoverage.value = 0.38;
    this.sky.cloudDensity.value = 0.35;
    this.sky.cloudElevation.value = 0.55;
    this.sky.cloudScale.value = 0.00022;
    this.sky.cloudSpeed.value = 0.00006;
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
    this.sun.castShadow = true;
    const s = Q.shadowMap;
    this.sun.shadow.mapSize.set(s, s);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    Object.assign(this.sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 260 });
    scene.add(this.sun, this.sun.target);

    this.fill = new THREE.HemisphereLight(0xb8dcff, 0xb08e5e, 0.2);
    scene.add(this.fill);

    // night sky: stars and a moon that fade in after sunset
    this.night = uniform(0);
    const N = 2600, pos = new Float32Array(N * 3), R = () => Math.random();
    for (let i = 0; i < N; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(a) * 3800, Math.abs(u) * 3800, r * Math.sin(a) * 3800], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sm = new THREE.PointsNodeMaterial({ size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
    sm.colorNode = vec3(1, 0.97, 0.9); sm.opacityNode = this.night;
    this.stars = new THREE.Points(sg, sm); this.stars.frustumCulled = false; this.stars.renderOrder = -1;
    scene.add(this.stars);
    const mc = document.createElement('canvas'); mc.width = mc.height = 128; const g = mc.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,252,235,1)'); gr.addColorStop(0.42, 'rgba(255,250,228,1)'); gr.addColorStop(0.5, 'rgba(255,245,215,0.35)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    const mm = new THREE.SpriteNodeMaterial({ map: mt, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    mm.opacityNode = this.night;
    this.moon = new THREE.Sprite(mm); this.moon.scale.setScalar(260); scene.add(this.moon);
    this.moonLight = new THREE.DirectionalLight(0xaecbff, 0); scene.add(this.moonLight);

    this.dir = new THREE.Vector3();
    this.setSun(elevation, azimuth);
  }

  /** elevation and azimuth in degrees; azimuth 0 = over the sea (three.js +Z), 90 = east (+X) */
  setSun(elevation, azimuth) {
    this.elevation = elevation; this.azimuth = azimuth;
    const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
    this.dir.setFromSphericalCoords(1, phi, theta);
    this.sky.sunPosition.value.copy(this.dir);
    // warmer, dimmer light when the sun is low
    const k = THREE.MathUtils.smoothstep(elevation, -4, 35);
    this.sun.color.setRGB(1.0, 0.72 + 0.24 * k, 0.5 + 0.4 * k);
    this.sun.intensity = 0.3 + 5.2 * k;
    this.fill.intensity = 0.06 + 0.12 * k;   // less flat fill: shadows keep their depth
    const night = 1 - THREE.MathUtils.smoothstep(elevation, -6, 4);
    this.night.value = night;
    if (this.moon) {
      const md = this.dir.clone().multiplyScalar(-1); md.y = Math.max(0.35, md.y);  md.normalize();
      this.moon.position.copy(md.multiplyScalar(3500));
      this.moonLight.position.copy(this.moon.position).normalize().multiplyScalar(100);
      this.moonLight.intensity = night * 0.6;
      this.fill.intensity += night * 0.12;
    }
    this.envDirty = true;
  }

  /** keep the shadow box centred on the player so close-up shadows stay sharp */
  follow(target) {
    this.sun.position.copy(target).addScaledVector(this.dir, 120);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }

  /** bake the sky into an environment map for reflections and ambient light */
  async updateEnvironment() {
    if (!this.envDirty) return;
    this.envDirty = false;
    const envScene = new THREE.Scene();
    const skyCopy = new SkyMesh();
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage', 'cloudDensity', 'cloudElevation', 'cloudScale', 'cloudSpeed']) skyCopy[k].value = this.sky[k].value;
    skyCopy.sunPosition.value.copy(this.dir);
    skyCopy.showSunDisc.value = 0;
    skyCopy.scale.setScalar(1000);
    envScene.add(skyCopy);
    this.pmrem ||= new THREE.PMREMGenerator(this.renderer);
    const rt = await this.pmrem.fromSceneAsync(envScene, 0, 1, 2000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.55;
  }
}

/** Post-processing chain, scaled by quality tier. */
export function createPipeline(renderer, scene, camera, sun, Q) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  if (Q.ao) {
    scenePass.setMRT(mrt({ output, normal: normalView }));
  }
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  let col = color;
  const fx = {};

  if (Q.godrays && sun.shadow?.map?.depthTexture) {
    const gr = godrays(depth, camera, sun);
    gr.density.value = 0.45; gr.maxDensity.value = 0.35; gr.distanceAttenuation.value = 3;
    const blurred = bilateralBlur(gr.getTextureNode());
    col = depthAwareBlend(color, blurred.getTextureNode ? blurred.getTextureNode() : blurred, depth, camera, { blendColor: new THREE.Color(0xffd9a8) });
    fx.godrays = gr;
  }

  if (Q.ao) {
    const aoPass = ao(depth, scenePass.getTextureNode('normal'), camera);
    aoPass.resolutionScale = 1;      // half resolution leaves stripe artefacts on some GPUs
    aoPass.radius.value = 0.6;
    aoPass.thickness.value = 0.8;
    aoPass.distanceExponent.value = 1.6;
    const aoTex = aoPass.getTextureNode();
    col = vec4(col.rgb.mul(aoTex.r.mul(0.85).add(0.15)), col.a);
    fx.ao = aoPass;
  }

  if (Q.bloom) {
    const b = bloom(col, 0.07, 0.3, 0.97);   // only real highlights glow
    col = col.add(b);
    fx.bloom = b;
  }

  // colour grade: a touch more saturation for the tropical palette
  col = vec4(saturation(col.rgb, float(1.28)), col.a);

  // under water: light loses red first, everything turns blue-green and darker toward the edges
  const uw = underwater;
  const tinted = col.rgb.mul(vec3(0.42, 0.86, 0.95)).add(vec3(0.0, 0.035, 0.05));
  col = vec4(mix(col.rgb, tinted, uw), col.a);
  // photo mode filters: 0 natural, 1 golden, 2 dreamy, 3 black and white, 4 ocean
  const f = photoFilter;
  const lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
  const golden = saturation(col.rgb.mul(vec3(1.12, 1.0, 0.82)), float(1.15));
  const dreamy = saturation(col.rgb.mul(0.92).add(vec3(0.06, 0.04, 0.07)), float(1.3));
  const mono = vec3(lum.mul(1.05));
  const ocean = saturation(col.rgb.mul(vec3(0.86, 1.02, 1.1)), float(1.2));
  const pick = (k, c) => smoothstep(float(k - 0.5), float(k), f).mul(float(1).sub(smoothstep(float(k), float(k + 0.5), f))).mul(c);
  const graded = col.rgb.mul(float(1).sub(smoothstep(0.0, 0.5, f))).add(pick(1, golden)).add(pick(2, dreamy)).add(pick(3, mono)).add(pick(4, ocean));
  col = vec4(graded, col.a);
  // gentle vignette
  const vig = smoothstep(float(0.45), float(0.95), length(uv().sub(0.5)).mul(1.25));
  col = vec4(col.rgb.mul(float(1).sub(vig.mul(mix(float(0.28), float(0.55), uw)))), col.a);

  pipeline.outputColorTransform = false;
  // contrast: an S-curve on the final picture (deeper darks, crisper brights)
  const out = renderOutput(col);
  const c = out.rgb.clamp(0, 1);
  const displayed = vec4(mix(c, c.mul(c).mul(float(3).sub(c.mul(2))), float(0.55)), out.a);
  pipeline.outputNode = Q.aa === 'smaa' ? smaa(displayed) : fxaa(displayed);
  return { pipeline, fx };
}
