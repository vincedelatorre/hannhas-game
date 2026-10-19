// Download the full-quality models, animation clips and textures listed in
// Tools/asset_manifest.json into <dir>/hires, <dir>/chars/<Name>/<Clip>.glb and <dir>/tex,
// the layout build_web_assets.mjs reads.
//
//   node Tools/web/download_sources.mjs build/src
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(here, '..', 'asset_manifest.json'), 'utf8'));
const out = process.argv[2] || 'build/src';

const jobs = [];
for (const p of manifest.hires || []) jobs.push([path.join(out, 'hires', p.name), p.url]);
for (const [who, c] of Object.entries(manifest.characters_hires || {}))
  for (const [clip, url] of Object.entries(c.clips)) jobs.push([path.join(out, 'chars', who, `${clip}.glb`), url]);
for (const t of manifest.materials || []) jobs.push([path.join(out, 'tex', t.name), t.url]);
for (const a of manifest.audio || []) jobs.push([path.join(out, 'audio', a.name + path.extname(new URL(a.url).pathname)), a.url]);

async function get([dest, url], tries = 3) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      console.log('got', dest, (fs.statSync(dest).size / 1e6).toFixed(1), 'MB');
      return;
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

// four at a time
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await get(queue.shift()); }));
console.log(`${jobs.length} files ready in ${out}`);
