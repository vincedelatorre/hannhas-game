// Hannah's Game: entry point. Loads Pearl Cove, builds the world and runs the game loop.
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import zone from '../zones/pearl_cove.js';
import { pickQuality, saveQuality, TIERS } from './quality.js';
import { createRenderer, SkyAndSun, createPipeline } from './render.js';
import { Assets } from './assets.js';
import { buildTerrain, heightTexture } from './terrain.js';
import { createWaterSystem, seaState } from './water.js';
import { dressWorld, wind } from './dressing.js';
import { Physics } from './physics.js';
import { Character, Player, Companion } from './characters.js';
import { Particles, TEX } from './fx.js';
import { Powers, Creatures, Quests } from './gameplay.js';
import { Input, Hud, Audio } from './ui.js';
import { Decals } from './decals.js';
import { buildGrass, buildBeachDetail } from './grass.js';
import { H, G, V } from './world.js';
import { Underwater, causticStrength } from './underwater.js';
window.__H = H;

const $ = id => document.getElementById(id);
const Q = pickQuality();
const game = window.__game = { zone, Q, started: false, sliding: -1, view: 'third' };

async function boot() {
  const canvas = $('scene');
  const renderer = await createRenderer(canvas, Q);
  game.renderer = renderer;
  $('backend').textContent = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  // the WebGL 2 fallback cannot copy the half-float frame for refraction: use the depth-map water there
  if (!renderer.backend.isWebGPUBackend) Q.waterRefraction = false;
  $('quality').value = Q.name;

  const scene = game.scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb9d6e4, 0.0015);
  const camera = game.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.08, 6000);
  camera.position.set(30, 18, 40);

  const sky = game.sky = new SkyAndSun(renderer, scene, Q, zone.sun);
  const hud = game.hud = new Hud();
  const audio = game.audio = new Audio();

  // ---- load everything with progress ----
  const A = game.assets = new Assets('assets/');
  A.onProgress = (k, name) => { $('load-fill').style.width = `${Math.round(k * 100)}%`; $('load-label').textContent = `Loading the cove… ${Math.round(k * 100)}%`; };
  const models = ['SM_PearlCove_Clubhouse', 'SM_PalmTree', 'SM_PalmTree_LOD', 'SM_Hibiscus', 'SM_Boulder_Mossy', 'SM_Shells_Cluster', 'SM_PalmSwing', 'SM_TikiTorch', 'SM_Driftwood', 'SM_TreasureChest', 'SM_Clam_Pearl', 'Wren', 'Boy'];
  const optional = ['SM_Coral_Cluster', 'SM_SeaGrass_Rock', 'SM_SeaTurtle'];   // reef models (procedural stand-ins if missing)
  const textures = ['T_Sand_Dry', 'T_Sand_Wet', 'T_JungleFloor', 'T_Rock_Coastal', 'T_Bamboo_Woven', 'T_Thatch'];
  const wrenClips = ['Walk', 'Skip', 'Run', 'Sprint', 'Jump', 'Backflip', 'WaterCast', 'LoveHeart', 'SwimIdle', 'Swim', 'Sit'];
  const boyClips = ['Walk', 'Run', 'Jump', 'Backflip', 'Wave', 'SwimIdle', 'Swim', 'Sit'];
  await Promise.all([
    ...models.map(m => A.model(m)),
    ...optional.map(m => A.model(m).catch(() => null)),
    ...textures.map(t => A.texture(t)),
    ...wrenClips.map(c => A.clip('Wren', c)),
    ...boyClips.map(c => A.clip('Boy', c)),
  ]);
  if (A.failed.length) console.warn('missing assets:', A.failed);
  $('load-label').textContent = 'Building the island…';
  await new Promise(r => setTimeout(r, 0));

  // ---- world ----
  scene.add(buildTerrain(zone, A.textures, Q));
  const hTex = heightTexture(zone);
  game.water = createWaterSystem(scene, zone, hTex, Q);
  const D = game.dressing = dressWorld(scene, zone, A, Q);
  // keep grass off the clubhouse base, the slide tower and the lagoon
  game.grass = buildGrass(scene, zone, Q, [[zone.clubhouse.pos[0], zone.clubhouse.pos[1], 13], [zone.slide.tower[0], zone.slide.tower[1], 3], [zone.lagoon.center[0], zone.lagoon.center[1], 8]]);
  buildBeachDetail(scene, zone, A, Q);

  // ---- physics + characters ----
  const physics = game.physics = await Physics.create(zone, D.colliders);
  const [sx, sy] = zone.spawn.pos;
  const wrenBody = physics.character({ x: sx, y: H(sx, sy) + 0.05, z: -sy, radius: 0.27, height: 1.55 });
  const groups = (0x0002 << 16) | 0xFFFF; wrenBody.collider.setCollisionGroups(groups);
  const input = game.input = new Input(canvas);

  if (A.models.Wren) {
    game.wren = new Character(scene, A.models.Wren, A.clips.Wren || {}, { name: 'Wren' });
    if (D.clamGltf) game.clam = game.wren.attach('RightHand', D.clamGltf, { size: 0.17, offset: [0, 0.09, 0.04], rotation: [0.3, 0, 0] });
  } else game.wren = standIn(scene, 0xf2c25a);
  const player = game.player = new Player(game.wren, wrenBody, input, { level: zone.seaLevel });
  player.lagoon = zone.lagoon; player.face = Math.PI;   // looking inland at the clubhouse

  if (A.models.Boy) {
    const [bx, by] = zone.companion.start;
    const boyBody = physics.character({ x: bx, y: H(bx, by) + 0.05, z: -by, radius: 0.27, height: 1.6 });
    boyBody.collider.setCollisionGroups(groups);
    const boy = new Character(scene, A.models.Boy, A.clips.Boy || {}, { name: 'Boy' });
    game.friend = new Companion(boy, boyBody, player);
    game.friend.face = 0;
  }

  // ---- effects + gameplay ----
  const ground = (x, z) => G(x, z);
  const waterTop = (x, z) => player.waterLevelAt(new THREE.Vector3(x, 0, z));
  game.fxWater = new Particles(scene, TEX.drop(), { max: 900, ground, water: waterTop });
  game.fxGlow = new Particles(scene, TEX.glow(), { max: 700, additive: true });
  game.fxHeart = new Particles(scene, TEX.heart(), { max: 260 });
  game.fxFoam = new Particles(scene, TEX.foam(), { max: 300 });
  game.decals = new Decals(scene);
  game.under = new Underwater(scene, zone, A, Q, game.fxGlow);
  game.creatures = new Creatures(scene, zone);
  game.quests = new Quests(game, zone);
  game.powers = new Powers(game);
  game.toast = t => hud.toast(t);
  const swingProp = zone.props.find(p => p.model === 'SM_PalmSwing');
  if (swingProp) game.swingSeat = V(swingProp.pos[0], swingProp.pos[1]);
  game.onWin = pos => win(pos);
  input.onWater = () => game.started && game.powers.water();
  input.onLove = () => game.started && game.powers.love();
  input.onToggleView = () => { game.view = game.view === 'third' ? 'first' : 'third'; };
  input.onStats = () => { hud.fps.visible = !hud.fps.visible; };
  hud.quests(game.quests.S, false);

  // ---- render pipeline ----
  sky.follow(new THREE.Vector3(0, 0, 0));
  await sky.updateEnvironment();
  renderer.render(scene, camera);           // creates the shadow map that god rays read
  const { pipeline } = createPipeline(renderer, scene, camera, sky.sun, Q);
  game.pipeline = pipeline;
  resize(); addEventListener('resize', resize);

  $('load-label').textContent = 'Warming up shaders…';
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); }
  $('loading').hidden = true; $('play').disabled = false; $('play').textContent = 'Play';
  game.ready = true;

  $('play').addEventListener('click', start);
  $('again').addEventListener('click', () => { $('win').hidden = true; });
  $('mute').addEventListener('click', () => { $('mute').textContent = audio.toggle() ? 'Muted' : 'Sound'; });
  $('quality').addEventListener('change', e => { saveQuality(e.target.value); location.reload(); });
  // world settings: time of day maps to sun elevation (noon high, dawn and dusk low)
  const applySun = () => {
    const h = +$('s-time').value, el = Math.sin(((h - 6) / 12) * Math.PI) * 62;
    sky.setSun(el, +$('s-az').value);
    clearTimeout(game._envT); game._envT = setTimeout(() => sky.updateEnvironment(), 250);
  };
  $('s-time').addEventListener('input', applySun); $('s-az').addEventListener('input', applySun);
  $('s-sea').addEventListener('input', e => { seaState.amplitude.value = +e.target.value; });
  $('s-wind').addEventListener('input', e => { wind.strength.value = +e.target.value; });
  $('gear').addEventListener('click', () => { const p = $('settings'); p.hidden = !p.hidden; $('gear').setAttribute('aria-expanded', String(!p.hidden)); });

  renderer.setAnimationLoop(loop);
}

function standIn(scene, color) {
  const g = new THREE.Group(); scene.add(g);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.0, 6, 12), new THREE.MeshStandardNodeMaterial({ color })); m.position.y = 0.8; m.castShadow = true; g.add(m);
  return { root: g, update() {}, play() { return false; }, busy: false, bones: {}, worldPos: (n, o = new THREE.Vector3()) => g.getWorldPosition(o) };
}

function start() {
  $('start').hidden = true; game.started = true; game.input.enabled = true;
  game.audio.start();
  game.cam.yaw = 0; game.cam.pitch = 0.28;
  game.toast('Welcome to Pearl Cove!');
  setTimeout(() => game.toast('Your friend is waiting by the lagoon. Collect the glowing shells!'), 3000);
}

function win(pos) {
  game.audio.treasure();
  $('win').hidden = false;
  for (let i = 0; i < 70; i++) (i % 2 ? game.fxHeart : game.fxGlow).emit(pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 6), { life: 2.2, size: 0.3 + Math.random() * 0.2, gravity: 3, color: [1, 0.9, 0.7] });
  game.friend?.cheer();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  game.renderer.setSize(w, h, false);
  game.camera.aspect = w / h; game.camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ camera
game.cam = { yaw: 0.6, pitch: 0.3, dist: 6.5, target: new THREE.Vector3(), pos: new THREE.Vector3() };
const _ray = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 } };

function updateCamera(dt, t) {
  const C = game.cam, cam = game.camera, I = game.input, P = game.player;
  if (game.debugCam) { cam.position.fromArray(game.debugCam.pos); cam.lookAt(...game.debugCam.look); return; }
  if (!game.started) {
    const a = t * 0.05;
    cam.position.set(Math.sin(a) * 46, 15 + Math.sin(t * 0.1) * 2, Math.cos(a) * 46 - 10);
    cam.lookAt(0, 5, -16);
    return;
  }
  C.yaw -= I.look.dx * 0.005; C.pitch = THREE.MathUtils.clamp(C.pitch + I.look.dy * 0.004, -0.35, 1.25);
  I.look.dx = I.look.dy = 0;
  C.dist = THREE.MathUtils.clamp(C.dist + I.zoom, 2.5, 16); I.zoom = 0;
  const feet = game.wren.root.position;
  if (game.view === 'first') {
    const eye = feet.clone().add(new THREE.Vector3(0, 1.42, 0)).add(new THREE.Vector3(Math.sin(P.face), 0, Math.cos(P.face)).multiplyScalar(0.12));
    cam.position.copy(eye);
    cam.lookAt(eye.clone().add(new THREE.Vector3(-Math.sin(C.yaw) * Math.cos(C.pitch), -Math.sin(C.pitch) * 0.8, -Math.cos(C.yaw) * Math.cos(C.pitch))));
    game.wren.root.visible = false;
    return;
  }
  game.wren.root.visible = true;
  C.target.lerp(feet.clone().add(new THREE.Vector3(0, 1.35, 0)), Math.min(1, dt * 10));
  const dir = new THREE.Vector3(Math.sin(C.yaw) * Math.cos(C.pitch), Math.sin(C.pitch), Math.cos(C.yaw) * Math.cos(C.pitch));
  // pull the camera in if something is in the way
  let dist = C.dist;
  const hit = game.physics.world.castRay(new RAPIER.Ray(C.target, dir), dist, true, undefined, (0x0001 << 16) | 0x0001);
  if (hit) dist = Math.max(0.6, hit.timeOfImpact - 0.25);
  const want = C.target.clone().addScaledVector(dir, dist);
  const wl = game.player.waterLevelAt(want);
  if (P.underwater) want.y = Math.min(Math.max(want.y, G(want.x, want.z) + 0.4), wl - 0.3);   // stay under with her
  else want.y = Math.max(want.y, G(want.x, want.z) + 0.4, wl + 0.25);
  cam.position.lerp(want, Math.min(1, dt * 12));
  const fovT = P.sprinting ? 64 : 52; cam.fov += (fovT - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
  cam.lookAt(C.target);
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
let mapT = 0, gameTime = 0;
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  if (!game.ready) return;
  if (!game.frozen) tick(dt);
  game.pipeline.render();
  // test hook: grab the frame right after it is drawn (works for WebGPU canvases too)
  if (game.captureRequest) { game.captureRequest = false; game.captured = game.renderer.domElement.toDataURL('image/jpeg', 0.88); }
}

/** run the game forward by exact steps without rendering (used by automated tests) */
game.sim = (seconds, keys = [], { jump = false, look = 0 } = {}) => {
  const I = game.input;
  keys.forEach(k => I.keys.add(k));
  if (jump) I.jumpPressed = true;
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) { if (look) game.cam.yaw += look / n; tick(1 / 60); }
  keys.forEach(k => I.keys.delete(k));
};

function tick(dt) {
  gameTime += dt; const t = gameTime;
  const P = game.player, I = game.input;
  I.poll();

  if (game.started) {
    if (game.sliding >= 0) slideStep(dt);
    else if (game.onSwing) swingStep(dt, t);
    else {
      const r = P.update(dt, game.cam.yaw);
      if (r.jumped) game.audio.jump();
      if (P.sprinting && Math.random() < 0.7) game.powers.speedTrail();
      // sit on the swing when stopping on it
      const sw = game.swingSeat;
      if (sw && r.speed < 0.4 && P.body.grounded && Math.hypot(P.pos.x - sw.x, P.pos.z - sw.z) < 0.9) { game.onSwing = { t: 0 }; game.toast('Wheee! Jump to hop off.'); }
      // slide ring
      if (!game.quests.S.slid && P.pos.distanceTo(game.quests.ringPos) < 1.4) { game.sliding = 0; game.toast('Up to the deck. Here we go!'); game.audio.sfx(440, 0.4, 'triangle', 0.07); }
    }
    if (I.water) game.powers.water(dt);
    // Wren glances at her friend or the nearest glowing shell
    const near = game.quests.shells.filter(s => !s.got).map(s => s.g.position).sort((a, b) => a.distanceToSquared(P.pos) - b.distanceToSquared(P.pos))[0];
    game.wren.lookTarget = near && near.distanceTo(P.pos) < 6 ? near : (game.friend && game.friend.pos.distanceTo(P.pos) < 6 ? game.friend.pos : null);
    game.friend?.update(dt);
    game.powers.update(dt);
    game.quests.update(dt, t);
    game.hud.energy(P.energy);
    game.audio.setShore(Math.abs(-P.pos.z - (-5)));
  } else {
    game.wren.update?.(dt, 0);
    game.friend?.c.update(dt, 0);
    const [sx, sy] = zone.spawn.pos;
    game.wren.root.position.copy(game.player.pos); game.wren.root.rotation.y = game.player.face;
    if (game.friend) { game.friend.c.root.position.copy(game.friend.pos); game.friend.c.root.rotation.y = game.friend.face; }
  }

  // footprints in the sand, ripples where anyone wades
  for (const [id, who] of [['wren', game.player], ['friend', game.friend]]) {
    if (!who || game.sliding >= 0 && id === 'wren') continue;
    const p = who.pos, gy = G(p.x, p.z), wl = game.player.waterLevelAt(p);
    const onGround = Math.abs(p.y - gy) < 0.25;
    game.decals.track(id, p, who.face, { onSand: onGround && gy > -0.1 && gy < 2.4, inWater: wl - p.y > 0.05, waterLevel: wl, speed: Math.hypot(who.vel.x, who.vel.z) });
    if (id === 'wren' && game.started && who.body.grounded && wl - p.y < 1.0) {
      game._stepDist = (game._stepDist || 0) + Math.hypot(who.vel.x, who.vel.z) * dt;
      if (game._stepDist > (who.sprinting ? 1.6 : 0.66)) { game._stepDist = 0; game.audio.step(wl - p.y > 0.05); }
    }
  }
  game.decals.update(dt);
  game.physics.step(dt);
  game.creatures.update(dt, t, P.pos);
  game.water.update(dt, t);
  causticStrength.value = THREE.MathUtils.smoothstep(game.sky.elevation, -4, 20);
  for (const fx of [game.fxWater, game.fxGlow, game.fxHeart, game.fxFoam]) fx.update(dt);

  // flames flicker; the three torches nearest the player get real lights
  const D = game.dressing, pp = game.wren.root.position;
  for (const f of D.flames) { const k = 1 + Math.sin(t * 13 + f.ph) * 0.12 + Math.sin(t * 7.3 + f.ph * 2) * 0.08; f.s.scale.set(0.38 * k, 0.6 * k * (1 + Math.sin(t * 9 + f.ph) * 0.05), 1); }
  const near = [...D.flames].sort((a, b) => a.base.distanceToSquared(pp) - b.base.distanceToSquared(pp)).slice(0, D.torchLights.length);
  const night = 1 - THREE.MathUtils.smoothstep(game.sky.elevation, -2, 18);
  D.torchLights.forEach((l, i) => { const f = near[i]; if (!f) return; l.position.copy(f.base); l.intensity = (6 + night * 30) * (1 + Math.sin(t * 11 + f.ph) * 0.12); });

  updateCamera(dt, t);
  game.under.update(dt, game.camera, P, game.friend);
  const diveBtn = $('b-dive'); const canDive = game.started && (P.c.swimming || P.underwater); if (diveBtn.hidden === canDive) diveBtn.hidden = !canDive;
  game.sky.follow(game.started ? pp : new THREE.Vector3(0, 0, -6));
  mapT -= dt; if (mapT <= 0) { game.hud.map(game.quests.S, game.quests, P, game.friend); mapT = 0.1; }
  game.hud.tick(dt, () => `${game.renderer.info.render.drawCalls ?? '?'} draws · ${(game.renderer.info.render.triangles / 1e6).toFixed(2)}M tris · ${Q.name} · ${game.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'}`);
}

function swingStep(dt, t) {
  const P = game.player, sw = game.swingSeat, S = game.onSwing;
  S.t += dt;
  const swing = Math.sin(S.t * 1.7) * 0.32;
  game.wren.sitting = true;
  game.wren.update(dt, 0);
  game.wren.root.position.set(sw.x, sw.y + 0.27 + Math.abs(swing) * 0.12, sw.z + swing);
  P.face = 0; game.wren.root.rotation.set(-swing * 0.5, 0, 0);
  if (game.input.jumpPressed && S.t > 0.4) {
    game.input.jumpPressed = false; game.onSwing = null; game.wren.sitting = false; game.wren.root.rotation.set(0, 0, 0);
    P.body.teleport(sw.x, sw.y, sw.z + 1.2); P.vy = 5;
  }
}

function slideStep(dt) {
  const curve = game.dressing.slideCurve, P = game.player;
  game.sliding += dt / 6.5;
  const u = Math.min(1, game.sliding);
  const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
  game.wren.root.position.copy(p).add(new THREE.Vector3(0, 0.05, 0));
  P.face = Math.atan2(tan.x, tan.z); game.wren.root.rotation.y = P.face;
  game.cam.yaw = P.face + Math.PI;
  game.wren.sitting = true;
  game.wren.update(dt, 0);
  if (Math.random() < 0.8) game.fxWater.emit(p.clone().add(new THREE.Vector3(0, 0.25, 0)), new THREE.Vector3((Math.random() - 0.5), 1.2, (Math.random() - 0.5)), { life: 0.5, size: 0.1, gravity: 9 });
  if (u >= 1) {
    game.sliding = -1; game.wren.sitting = false;
    P.body.teleport(p.x, p.y - 0.3, p.z); P.vy = 2;
    for (let i = 0; i < 50; i++) game.fxWater.emit(p.clone(), new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6), { life: 1.2, size: 0.14, gravity: 12 });
    game.fxFoam.emit(p.clone().setY(zone.lagoon.level + 0.03), new THREE.Vector3(), { life: 1.4, size: 2.2, grow: 1.5, alpha: 0.7 });
    game.audio.splash(true);
    if (!game.quests.S.slid) { game.quests.S.slid = true; game.toast('Splash! What a ride!'); game.audio.chime(); game.quests.changed(); game.friend?.cheer(); }
  }
}

boot().catch(err => {
  console.error(err);
  $('load-label').textContent = 'Sorry, this browser could not start the game: ' + (err.message || err);
});
