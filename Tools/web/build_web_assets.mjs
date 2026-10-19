// Build browser-ready versions of every Pearl Cove model and texture.
//
//   node Tools/web/build_web_assets.mjs <source-dir> <out-dir>
//
// <source-dir> holds the full-quality downloads (fetch_assets.py layout or the
// hires/, chars/<Name>/<Clip>.glb, tex/ layout used by CI). <out-dir> becomes
// docs/assets: small meshopt-compressed GLBs with WebP textures, plus
// animation-only clip files that reuse the character's skeleton.
//
// Requires: npm i @gltf-transform/core@4 @gltf-transform/extensions@4
//           @gltf-transform/functions@4 meshoptimizer sharp
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, reorder, quantize, center, resample, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('usage: build_web_assets.mjs <source-dir> <out-dir>'); process.exit(1); }

await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});

// target triangle counts and texture sizes for the browser
const PROPS = {
  SM_PearlCove_Clubhouse: { tris: 220000, tex: 2048 },
  SM_PalmTree:            { tris: 32000,  tex: 1024, lod: { name: 'SM_PalmTree_LOD', tris: 6000, tex: 512, error: 0.02 } },
  SM_Hibiscus:            { tris: 26000,  tex: 1024, error: 0.01 },
  SM_Boulder_Mossy:       { tris: 22000,  tex: 1024 },
  SM_Shells_Cluster:      { tris: 16000,  tex: 1024 },
  SM_PalmSwing:           { tris: 34000,  tex: 1024 },
  SM_TikiTorch:           { tris: 9000,   tex: 1024 },
  SM_Driftwood:           { tris: 16000,  tex: 1024 },
  SM_TreasureChest:       { tris: 30000,  tex: 1024 },
  SM_Clam_Pearl:          { tris: 14000,  tex: 1024 },
  SM_Coral_Cluster:       { tris: 24000,  tex: 1024 },
  SM_SeaGrass_Rock:       { tris: 16000,  tex: 1024 },
  SM_SeaTurtle:           { tris: 14000,  tex: 1024 },
  SM_ReefFish:            { tris: 1500,   tex: 512 },
  SM_Dolphin:             { tris: 8000,   tex: 1024 },
  SM_Macaw:               { tris: 8000,   tex: 1024 },
};
const CHAR_TRIS = 60000, CHAR_TEX = 2048;
const TEXTURES = ['T_Sand_Dry', 'T_Sand_Wet', 'T_JungleFloor', 'T_Rock_Coastal', 'T_TidePool_Floor', 'T_Bamboo_Woven', 'T_Thatch'];

const find = (...cands) => cands.map(c => path.join(SRC, c)).find(p => fs.existsSync(p));
const triCount = doc => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const kb = f => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`;
fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'textures'), { recursive: true });
const report = { models: {}, characters: {}, textures: {} };

async function finish(doc, tex, file) {
  // colour keeps full size; normal / roughness / occlusion / emissive go one size down
  const other = Math.max(256, tex / 2);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82, slots: /^baseColorTexture$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [other, other], quality: 80, slots: /^(?!baseColorTexture$).*/ }),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    prune(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(file, doc);
}

async function buildProp(name, cfg, srcFile) {
  const doc = await io.read(srcFile);
  const before = triCount(doc);
  await doc.transform(dedup(), weld());
  const ratio = Math.min(1, cfg.tris / triCount(doc));
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: cfg.error ?? 0.002, lockBorder: false }));
  await doc.transform(center({ pivot: 'below' }));   // origin at bottom centre, real size is applied in the game
  const b = getBounds(doc.getRoot().getDefaultScene());
  const after = triCount(doc);
  const file = path.join(OUT, 'models', `${name}.glb`);
  await finish(doc, cfg.tex, file);
  report.models[name] = { tris_before: Math.round(before), tris: Math.round(after), size: b.max.map((v, i) => +(v - b.min[i]).toFixed(3)), bytes: fs.statSync(file).size };
  console.log(`${name}: ${Math.round(before)} -> ${Math.round(after)} tris, ${kb(file)}`);
}

for (const [name, cfg] of Object.entries(PROPS)) {
  const src = find(`hires/${name}.glb`, `HiRes/${name}.glb`, `${name}.glb`);
  if (!src) { console.warn('missing', name); continue; }
  await buildProp(name, cfg, src);
  if (cfg.lod) await buildProp(cfg.lod.name, cfg.lod, src);
}

// characters: one textured, simplified, skinned model (with its Idle clip) +
// animation-only files for every other clip (meshes, skins and textures removed)
for (const who of ['Wren', 'Boy']) {
  const dir = find(`chars/${who}`, `HiRes/${who}`);
  if (!dir) { console.warn('missing character', who); continue; }
  const base = await io.read(path.join(dir, 'Idle.glb'));
  const before = triCount(base);
  await base.transform(dedup(), weld());
  await base.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, CHAR_TRIS / triCount(base)), error: 0.001, lockBorder: false }));
  await base.transform(resample());
  base.getRoot().listAnimations().forEach(a => a.setName('Idle'));
  const after = triCount(base);
  const file = path.join(OUT, 'models', `${who}.glb`);
  await finish(base, CHAR_TEX, file);
  report.characters[who] = { tris_before: Math.round(before), tris: Math.round(after), bytes: fs.statSync(file).size, clips: ['Idle'] };
  console.log(`${who}: ${Math.round(before)} -> ${Math.round(after)} tris, ${kb(file)}`);
  const rigA = restPose(await io.read(path.join(dir, 'Idle.glb')));
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb') && f !== 'Idle.glb' && !f.startsWith('_')).sort()) {
    const clip = path.basename(f, '.glb');
    const doc = await io.read(path.join(dir, f));
    retarget(doc, rigA);      // every clip was auto-rigged separately: move it onto the base skeleton
    const root = doc.getRoot();
    for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
    for (const m of root.listMeshes()) m.dispose();
    for (const s of root.listSkins()) s.dispose();
    root.listAnimations().forEach(a => a.setName(clip));
    await doc.transform(prune({ keepLeaves: true }));
    for (const t of root.listTextures()) t.dispose();
    for (const m of root.listMaterials()) m.dispose();
    const out = path.join(OUT, 'models', `${who}_${clip}.glb`);
    await io.write(out, doc);
    report.characters[who].clips.push(clip);
    console.log(`  ${who}_${clip}: ${kb(out)} (retargeted)`);
  }
}

// ---------- retargeting ----------
// Each clip GLB carries its own auto-generated skeleton whose rest pose differs from the
// base model's (arms up to ~25 degrees, head up to ~60). Playing those tracks on the base
// skeleton would twist the body, so every frame is converted by world-space rotation deltas:
//   G_target(t) = G_src(t) * inverse(G_src_rest) * G_target_rest
// then turned back into local rotations with the target hierarchy. Only the hips keep a
// translation track (scaled by hip height); every other bone keeps the base rig's lengths.
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qinv(q) { return [-q[0], -q[1], -q[2], q[3]]; }
function qnorm(q) { const l = Math.hypot(...q) || 1; return q.map(v => v / l); }

function restPose(doc) {
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const names = joints.map(j => j.getName());
  const parent = {}, R = {}, T = {};
  for (const j of joints) {
    const p = j.getParentNode();
    parent[j.getName()] = p && names.includes(p.getName()) ? p.getName() : null;
    R[j.getName()] = j.getRotation(); T[j.getName()] = j.getTranslation();
  }
  const order = [];                 // parents before children
  const visit = n => { if (order.includes(n)) return; if (parent[n]) visit(parent[n]); order.push(n); };
  names.forEach(visit);
  const world = loc => { const G = {}; for (const n of order) G[n] = parent[n] ? qnorm(qmul(G[parent[n]], loc[n])) : loc[n]; return G; };
  return { names, parent, order, R, T, GR: world(R), world };
}

function retarget(doc, A) {
  const B = restPose(doc);
  const anim = doc.getRoot().listAnimations()[0];
  const chans = anim.listChannels();
  // channels can have different key counts (end bones often hold just 2 keys), so use the
  // longest channel's timeline and sample every channel by time
  const timeCh = chans.reduce((a, c) => c.getSampler().getInput().getCount() > a.getSampler().getInput().getCount() ? c : a);
  const timeAcc = timeCh.getSampler().getInput();
  const times = timeAcc.getArray();
  const N = times.length;
  const track = (name, pathName) => chans.find(c => c.getTargetNode().getName() === name && c.getTargetPath() === pathName);
  const sampleAt = (c, t, size) => {
    const tin = c.getSampler().getInput().getArray(), out = c.getSampler().getOutput().getArray();
    const n = Math.min(tin.length, Math.floor(out.length / size));
    if (n === 0) return null;
    let i = 0; while (i < n - 1 && tin[i + 1] <= t) i++;
    const j = Math.min(i + 1, n - 1);
    const u = j === i || tin[j] === tin[i] ? 0 : Math.min(1, Math.max(0, (t - tin[i]) / (tin[j] - tin[i])));
    const a = Array.from(out.slice(i * size, i * size + size)), b = Array.from(out.slice(j * size, j * size + size));
    if (size === 4) { let d = 0; for (let x = 0; x < 4; x++) d += a[x] * b[x]; if (d < 0) b.forEach((v, x) => b[x] = -v); }
    const r = a.map((v, x) => v + (b[x] - v) * u);
    return r.every(Number.isFinite) ? (size === 4 ? qnorm(r) : r) : null;
  };
  const sampleLocal = (k) => {
    const L = {};
    for (const n of B.names) { const c = track(n, 'rotation'); L[n] = (c && sampleAt(c, times[k], 4)) || B.R[n]; }
    return L;
  };
  const outR = Object.fromEntries(A.names.map(n => [n, new Float32Array(N * 4)]));
  const hipsT = new Float32Array(N * 3);
  const hipsB = track('Hips', 'translation');
  const k = A.T.Hips[1] / B.T.Hips[1];
  for (let f = 0; f < N; f++) {
    const GB = B.world(sampleLocal(f));
    const GA = {};
    for (const n of A.order) GA[n] = B.GR[n] ? qnorm(qmul(qmul(GB[n], qinv(B.GR[n])), A.GR[n])) : A.GR[n];
    for (const n of A.order) { const p = A.parent[n]; let L = p ? qnorm(qmul(qinv(GA[p]), GA[n])) : GA[n]; if (!L.every(Number.isFinite)) L = A.R[n]; outR[n].set(L, f * 4); }
    const tb = (hipsB && sampleAt(hipsB, times[f], 3)) || B.T.Hips;
    for (let i = 0; i < 3; i++) hipsT[f * 3 + i] = A.T.Hips[i] + (tb[i] - B.T.Hips[i]) * k;
  }
  // the game moves the character itself: remove forward/sideways drift (root motion) from the
  // hips, keeping only the bob and sway around the starting point
  if (N > 1) for (const i of [0, 2]) {
    const d0 = hipsT[i], d1 = hipsT[(N - 1) * 3 + i];
    for (let f = 0; f < N; f++) hipsT[f * 3 + i] -= (d1 - d0) * (f / (N - 1));
  }
  // make neighbouring quaternions take the short way round
  for (const n of A.names) { const a = outR[n]; for (let f = 1; f < N; f++) { let d = 0; for (let i = 0; i < 4; i++) d += a[f * 4 + i] * a[(f - 1) * 4 + i]; if (d < 0) for (let i = 0; i < 4; i++) a[f * 4 + i] *= -1; } }
  for (const c of chans) {
    const n = c.getTargetNode().getName(), p = c.getTargetPath();
    if (p === 'rotation' && outR[n]) { c.getSampler().setInput(timeAcc); c.getSampler().getOutput().setArray(outR[n]); }
    else if (p === 'translation' && n === 'Hips') { c.getSampler().setInput(timeAcc); c.getSampler().getOutput().setArray(hipsT); }
    else { const s = c.getSampler(); c.dispose(); s.dispose(); }
  }
  // give the clip's bones the base rig's rest pose so the file is self-consistent
  for (const j of doc.getRoot().listSkins()[0].listJoints()) { const n = j.getName(); if (A.R[n]) { j.setRotation(A.R[n]); j.setTranslation(A.T[n]); } }
}

// tileable ground / building textures
for (const t of TEXTURES) {
  const src = find(`tex/${t}_BaseColor.png`, `Textures/${t}_BaseColor.png`);
  if (!src) { console.warn('missing texture', t); continue; }
  const out = path.join(OUT, 'textures', `${t}.webp`);
  await sharp(src).resize(1024, 1024).webp({ quality: 80 }).toFile(out);
  report.textures[t] = fs.statSync(out).size;
  console.log(`${t}: ${kb(out)}`);
}

// sound: loudness-normalised mono/stereo mp3 via ffmpeg (ambience and music stay stereo)
import { execFileSync } from 'node:child_process';
let FFMPEG = 'ffmpeg';
try { FFMPEG = (await import('ffmpeg-static')).default || FFMPEG; } catch (e) { /* use system ffmpeg */ }
const audioDir = path.join(SRC, 'audio');
if (fs.existsSync(audioDir)) {
  fs.mkdirSync(path.join(OUT, 'audio'), { recursive: true });
  report.audio = {};
  for (const f of fs.readdirSync(audioDir)) {
    const name = path.parse(f).name, out = path.join(OUT, 'audio', `${name}.mp3`);
    const stereo = /^(amb_|music_)/.test(name);
    try {
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(audioDir, f), '-af', 'loudnorm=I=-18:TP=-2', '-ac', stereo ? '2' : '1', '-ar', '44100', '-b:a', stereo ? '128k' : '96k', out]);
      report.audio[name] = fs.statSync(out).size; console.log(`${name}: ${kb(out)}`);
    } catch (e) { console.warn('audio failed', name, e.message); }
  }
}

fs.writeFileSync(path.join(OUT, 'assets.json'), JSON.stringify(report, null, 2));
const total = [...fs.readdirSync(path.join(OUT, 'models')).map(f => path.join(OUT, 'models', f)), ...fs.readdirSync(path.join(OUT, 'textures')).map(f => path.join(OUT, 'textures', f)), ...(fs.existsSync(path.join(OUT, 'audio')) ? fs.readdirSync(path.join(OUT, 'audio')).map(f => path.join(OUT, 'audio', f)) : [])].reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`total ${(total / 1e6).toFixed(1)} MB`);
