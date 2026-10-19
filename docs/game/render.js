// Renderer, sky, sun, environment lighting and the post-processing chain
// (ambient occlusion, god rays, bloom, ACES filmic tone mapping, vignette, anti-aliasing).
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, directionToColor, colorToDirection, vec4, vec3, float, renderOutput, uv, smoothstep, length, uniform } from 'three/tsl';
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
  renderer.toneMappingExposure = 0.55;
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
    this.sky.turbidity.value = 2.4;
    this.sky.rayleigh.value = 1.6;
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

    this.fill = new THREE.HemisphereLight(0xcfe9ff, 0xd9c29a, 0.35);
    scene.add(this.fill);

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
    this.fill.intensity = 0.1 + 0.25 * k;
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
    this.scene.environmentIntensity = 1.0;
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
    aoPass.resolutionScale = 0.5;
    aoPass.radius.value = 0.6;
    aoPass.thickness.value = 0.8;
    aoPass.distanceExponent.value = 1.6;
    const aoTex = aoPass.getTextureNode();
    col = vec4(col.rgb.mul(aoTex.r.mul(0.85).add(0.15)), col.a);
    fx.ao = aoPass;
  }

  if (Q.bloom) {
    const b = bloom(col, 0.22, 0.45, 0.82);
    col = col.add(b);
    fx.bloom = b;
  }

  // gentle vignette
  const vig = smoothstep(float(0.45), float(0.95), length(uv().sub(0.5)).mul(1.25));
  col = vec4(col.rgb.mul(float(1).sub(vig.mul(0.28))), col.a);

  pipeline.outputColorTransform = false;
  const displayed = renderOutput(col);
  pipeline.outputNode = Q.aa === 'smaa' ? smaa(displayed) : fxaa(displayed);
  return { pipeline, fx };
}
