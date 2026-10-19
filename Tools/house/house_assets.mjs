// Enchanted Island House asset pipeline helper.
//
//   node Tools/house/house_assets.mjs todo       list assets with no generated source yet (+ their prompts)
//   node Tools/house/house_assets.mjs validate   check every built file in docs/assets against the manifest
//   node Tools/house/house_assets.mjs report     validate, then write the table in Design/House/production-status.md
//
// Generation itself runs through the Higgsfield MCP tools (Claude orchestrates it): image
// references with gpt_image_2_5, models with tripo_h3_1_image_to_3d, clips with 3d_rigging.
// Run from the repo root after `npm install` in Tools/web (uses its gltf-transform).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('Tools/web/package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');

const MAN = 'Design/House/asset-manifest.json', STATUS = 'Design/House/production-status.md', OUT = 'docs/assets';
const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const cmd = process.argv[2] || 'validate';

if (cmd === 'todo') {
  const todo = man.assets.filter(a => (a.kind === 'model' || a.kind === 'texture' || a.kind === 'clip') && !a.source?.url);
  for (const a of todo) console.log(`${a.id} (${a.kind}) -> ${a.name}\n  reference: ${a.reference?.url || 'none'}\n  prompt: ${a.prompt || ''}\n`);
  console.log(`${todo.length} asset(s) still need generating`);
  process.exit(0);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const tris = doc => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

const rows = [];
for (const a of man.assets) {
  const r = { id: a.id, name: a.name, kind: a.kind, ok: true, notes: [] };
  const fail = m => { r.ok = false; r.notes.push(m); };
  try {
    if (a.kind === 'model') {
      const f = path.join(OUT, 'models', `${a.name}.glb`);
      if (!a.source?.url) fail('not generated yet');
      else if (!fs.existsSync(f)) fail('not built yet (CI)');
      else {
        const doc = await io.read(f);
        const t = tris(doc), mats = doc.getRoot().listMaterials();
        if (t === 0) fail('empty mesh');
        if (a.budget?.tris && t > a.budget.tris * 1.15) fail(`over budget: ${Math.round(t)} tris`);
        if (!mats.some(m => m.getBaseColorTexture())) r.notes.push('no colour texture');
        r.notes.push(`${Math.round(t)} tris, ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
      }
    } else if (a.kind === 'texture') {
      const f = path.join(OUT, 'textures', `${a.name}.webp`);
      if (!fs.existsSync(f)) fail('not built yet (CI)'); else r.notes.push(`${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
    } else if (a.kind === 'clip') {
      const f = path.join(OUT, 'models', `${a.character}_${a.clip}.glb`);
      if (!fs.existsSync(f)) fail('not built yet (CI)');
      else {
        const doc = await io.read(f); const an = doc.getRoot().listAnimations()[0];
        if (!an) fail('no animation');
        else {
          let bad = 0, keys = 0;
          for (const c of an.listChannels()) { const o = c.getSampler().getOutput().getArray(); keys = Math.max(keys, c.getSampler().getInput().getCount()); for (const v of o) if (!Number.isFinite(v)) bad++; }
          if (bad) fail(`${bad} NaN values`);
          r.notes.push(`${an.listChannels().length} channels, ${keys} keys`);
        }
      }
    } else if (a.kind === 'assembly') {
      const f = a.source?.file; if (f && !fs.existsSync(f)) fail(`missing ${f}`); else r.notes.push('built in code');
    }
  } catch (e) { fail(e.message); }
  rows.push(r);
}
const okN = rows.filter(r => r.ok).length;
for (const r of rows) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.kind.padEnd(8)} ${r.name.padEnd(26)} ${r.notes.join('; ')}`);
console.log(`\n${okN}/${rows.length} assets valid`);

if (cmd === 'report') {
  const table = ['| Asset | Kind | Valid | Notes |', '| --- | --- | --- | --- |', ...rows.map(r => `| ${r.name} | ${r.kind} | ${r.ok ? 'yes' : '**no**'} | ${r.notes.join('; ')} |`)].join('\n');
  let md = fs.existsSync(STATUS) ? fs.readFileSync(STATUS, 'utf8') : '# Production status\n\n<!-- validation:start -->\n<!-- validation:end -->\n';
  md = md.replace(/<!-- validation:start -->[\s\S]*<!-- validation:end -->/, `<!-- validation:start -->\nAutomated check (${new Date().toISOString().slice(0, 10)}): ${okN}/${rows.length} valid.\n\n${table}\n<!-- validation:end -->`);
  fs.writeFileSync(STATUS, md);
  console.log(`wrote ${STATUS}`);
}
process.exit(okN === rows.length ? 0 : 1);
