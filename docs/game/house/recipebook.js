// The interactive recipe book: cards with photos, an ingredient checklist with pictures of the
// real in-game objects and where they are right now, "Show me where" guidance, a live cooking
// checklist that ticks itself from the world state, and a celebration when a meal is done.
//
// Opens with X, the cookbook on the island, or the book button on the HUD.
import * as THREE from 'three/webgpu';
import { RECIPES, CATS, DIFF, SHEETS } from './recipes.js';
import { ITEM_DEFS } from './items.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const ICON = { fruit: '🍓', veg: '🥕', herb: '🌿', dairy: '🥛', protein: '🍗', sauce: '🍅', drink: '🧃', frozen: '🧊', pasta: '🍝', grain: '🌾', baking: '🧁', oil: '🫒', canned: '🥫', spice: '🧂', snack: '🍪', cutlery: '🍴', utensil: '🥄', equipment: '🥣', linen: '🧺', dish: '🍽️', glass: '🥛', cookware: '🍲' };
const TAG_ICON = { water: '💧', egg: '🥚', mug: '☕', beans: '🫘', board: '🪵', knife: '🔪', bowl: '🥣', stockpot: '🍲', milk: '🥛', flour: '🌾', butter: '🧈', sugar: '🍬', spaghetti: '🍝', marinara: '🍅', parmesan: '🧀', basil: '🌿', syrup: '🍁' };

export class RecipeBook {
  constructor(H) {
    this.H = H; this.sys = H.sys; this.game = H.game;
    this.active = null; this.mode = 'guided'; this.progress = {}; this.done = {}; this.favs = new Set(); this.recent = [];
    this.collected = new Set();        // ingredient tags picked up while a recipe is active
    this.el = document.getElementById('recipebook'); this.tracker = document.getElementById('recipe-tracker');
    this.cat = 'All'; this.query = '';
    this.buildUI();
    // world hooks: picking things up counts as collecting them
    const sys = this.sys, pick0 = sys.pickUp.bind(sys);
    sys.pickUp = item => { pick0(item); for (const t of item.tags) this.collected.add(t); if (item.def) this.collected.add(item.def); this.refreshSoon(); };
    H.cooking.on((type, d) => { if (type === 'flag') this.refreshSoon(); if (['served', 'garnish', 'mixed', 'flag', 'chopped'].includes(type)) { this.refreshSoon(); this.checkComplete(); } });
    // waypoint arrow ("Show me where")
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 16), new THREE.MeshBasicNodeMaterial({ color: 0xFFC83D, depthTest: false, transparent: true, opacity: 0.95 }));
    arrow.rotation.x = Math.PI; arrow.renderOrder = 30; arrow.visible = false; this.game.scene.add(arrow); this.arrow = arrow;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 32), new THREE.MeshBasicNodeMaterial({ color: 0xFFE08A, depthTest: false, transparent: true, opacity: 0.85 }));
    ring.rotation.x = Math.PI / 2; ring.renderOrder = 30; ring.visible = false; this.game.scene.add(ring); this.ring = ring;
    this.edge = document.getElementById('waypoint-edge');
    this.guide = null; this._t = 0;
  }

  // ------------------------------------------------------------------ world queries
  /** items that count as an ingredient tag right now (not used up, not empty) */
  findAll(tag) {
    const out = [];
    for (const it of this.sys.items.values()) {
      if (it.state.gone || !(it.tags.has(tag) || it.def === tag)) continue;
      if (it.state.qty !== undefined && it.state.qty <= 0) continue;
      if (it.tags.has('cupcake') && !it.live) continue;
      out.push(it);
    }
    return out;
  }
  nearest(tag) { const p = this.game.player.pos; let best = null, bd = 1e9; for (const it of this.findAll(tag)) { const d = it.object.getWorldPosition(V3(0, 0, 0)).distanceTo(p); if (d < bd) { bd = d; best = it; } } return best; }
  get W() {
    const sys = this.sys, ck = this.H.cooking, book = this;
    const items = [...sys.items.values()];
    return {
      got: tag => book.collected.has(tag) || items.some(i => (i.tags.has(tag) || i.def === tag) && (i.held || (i.slot && i.home && i.slot !== i.home))),
      gotFruit: () => new Set(items.filter(i => i.tags.has('fruit') && (i.held || (i.slot && i.home && i.slot !== i.home) || i.state.gone)).map(i => i.def || i.id)).size,
      washed: () => items.filter(i => i.tags.has('fruit') && i.state.clean).length,
      chopped: () => items.filter(i => i.state.chopped).length + items.reduce((n, i) => n + Object.keys(i.state.c?.fruit || {}).length, 0),
      added: () => items.reduce((n, i) => n + Object.keys(i.state.c?.add || {}).length, 0),
      mixed: m => items.some(i => i.state.c?.mix === m) || !!ck.flags['mixed_' + m],
      flag: k => !!ck.flags[k],
      dish: (d, g = []) => items.some(i => i.state.c?.dish === d && g.every(x => (i.state.c.garnish || []).includes(x))),
      griddleHot: () => ck.griddle.temp >= 170,
    };
  }

  // ------------------------------------------------------------------ UI
  buildUI() {
    const el = this.el;
    el.innerHTML = `
      <div class="rb-panel" role="dialog" aria-label="Recipe book">
        <header><h2>📖 Recipe Book</h2><input id="rb-search" type="search" placeholder="Search recipes…" aria-label="Search recipes"><button class="rb-x" aria-label="Close">✕</button></header>
        <nav class="rb-cats"></nav>
        <div class="rb-body"><div class="rb-grid"></div><article class="rb-detail" hidden></article></div>
      </div>`;
    el.querySelector('.rb-x').onclick = () => this.close();
    el.addEventListener('click', e => { if (e.target === el) this.close(); });
    el.querySelector('#rb-search').oninput = e => { this.query = e.target.value.toLowerCase(); this.renderGrid(); };
    el.querySelector('#rb-search').onkeydown = e => e.stopPropagation();
    const cats = el.querySelector('.rb-cats');
    for (const c of ['All', '★ Favourites', 'Recent', ...CATS]) { const b = document.createElement('button'); b.textContent = c; b.onclick = () => { this.cat = c; this.renderGrid(); }; cats.appendChild(b); }
    this.tracker.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'toggle') this.tracker.classList.toggle('collapsed');
      if (a.dataset.act === 'book') this.open(this.active?.id);
      if (a.dataset.act === 'stop') this.stop();
      if (a.dataset.act === 'find') this.showWhere(a.dataset.tag);
    });
  }
  image(r) {
    const [s, c] = r.image || [0, 0];
    return `background-image:url('assets/textures/${SHEETS[s]}.webp');background-size:300% 300%;background-position:${(c % 3) * 50}% ${Math.floor(c / 3) * 50}%`;
  }
  thumb(tag) {
    const it = this.nearest(tag) || [...this.sys.items.values()].find(i => i.tags.has(tag) || i.def === tag);
    const def = it?.def || (ITEM_DEFS[tag] ? tag : null);
    const ic = TAG_ICON[tag] || ICON[def ? ITEM_DEFS[def]?.cat : ''] || '🍽️';
    return def ? `<span class="thumb" style="background-image:url('assets/ui/items/${def}.webp')">${ic}</span>` : `<span class="thumb">${ic}</span>`;
  }
  open(id) {
    this.el.hidden = false; document.body.classList.add('book');
    this.game.input.enabled = false;
    this.sys.sfx('cupboard', true);
    if (id) this.renderDetail(RECIPES.find(r => r.id === id)); else this.renderGrid();
    setTimeout(() => this.el.querySelector('#rb-search')?.focus({ preventScroll: true }), 50);
  }
  close() { this.el.hidden = true; document.body.classList.remove('book'); this.game.input.enabled = true; this.sys.sfx('cupboard', false); }
  get isOpen() { return !this.el.hidden; }
  renderGrid() {
    const grid = this.el.querySelector('.rb-grid'), det = this.el.querySelector('.rb-detail');
    det.hidden = true; grid.hidden = false;
    this.el.querySelectorAll('.rb-cats button').forEach(b => b.classList.toggle('on', b.textContent === this.cat));
    let list = RECIPES;
    if (this.cat === '★ Favourites') list = list.filter(r => this.favs.has(r.id));
    else if (this.cat === 'Recent') list = this.recent.map(id => RECIPES.find(r => r.id === id)).filter(Boolean);
    else if (this.cat !== 'All') list = list.filter(r => r.cat === this.cat);
    if (this.query) list = list.filter(r => (r.name + ' ' + r.desc + ' ' + r.ingredients.map(i => i.label).join(' ')).toLowerCase().includes(this.query));
    grid.innerHTML = list.map(r => {
      const missing = r.ingredients.filter(i => !i.optional && !i.auto && !this.findAll(i.tag).length).length;
      return `<button class="rb-card${r.playable ? '' : ' soon'}" data-id="${r.id}">
        <span class="img" style="${this.image(r)}"></span>
        ${this.done[r.id] ? `<span class="badge done">${'★'.repeat(this.done[r.id])}</span>` : ''}${r.playable ? '' : '<span class="badge">Coming soon</span>'}
        <b>${r.name}</b><small>${DIFF[r.diff]} · ${r.time} · ${r.ingredients.length} ingredients</small>
        <small class="${missing ? 'miss' : 'ok'}">${missing ? `${missing} missing at home` : 'All ingredients at home'}</small></button>`;
    }).join('') || '<p class="empty">No recipes match.</p>';
    grid.querySelectorAll('.rb-card').forEach(b => b.onclick = () => this.renderDetail(RECIPES.find(r => r.id === b.dataset.id)));
  }
  renderDetail(r) {
    if (!r) return this.renderGrid();
    const grid = this.el.querySelector('.rb-grid'), det = this.el.querySelector('.rb-detail');
    grid.hidden = true; det.hidden = false;
    const ing = r.ingredients.map(i => {
      if (i.auto) return `<li>${this.thumb(i.tag)}<span><b>${i.label}</b> <em>${i.qty}</em><small>From the brass pot filler over the range</small></span><span class="chip ok">Ready</span></li>`;
      const it = this.nearest(i.tag), have = !!it;
      const got = this.W.got(i.tag);
      const where = have ? this.H.whereIs(it) : 'Not in the house right now';
      const st = got ? ['ok', 'Collected'] : have ? ['', 'At home'] : [i.optional ? '' : 'miss', i.optional ? 'Optional' : 'Missing'];
      return `<li>${this.thumb(i.tag)}<span><b>${i.label}</b> <em>${i.qty}${i.optional ? ' · optional' : ''}</em><small>${where}</small></span>
        <span class="chip ${st[0]}">${st[1]}</span>${have && !got ? `<button data-find="${i.tag}">Show me where</button>` : ''}</li>`;
    }).join('');
    const steps = r.steps ? r.steps.map((s, k) => `<li class="${s.done(this.W) ? 'done' : ''}">${s.t}</li>`).join('') : '';
    const stages = r.stages ? `<div class="stages">${[0, 1, 2, 3, 4, 5].map(c => `<span style="background-image:url('assets/textures/${r.stages}.webp');background-size:300% 200%;background-position:${(c % 3) * 50}% ${Math.floor(c / 3) * 100}%"></span>`).join('')}</div>` : '';
    det.innerHTML = `
      <button class="rb-back">← All recipes</button>
      <div class="hero" style="${this.image(r)}"></div>
      <h3>${r.name} <button class="fav ${this.favs.has(r.id) ? 'on' : ''}" aria-label="Favourite">★</button></h3>
      <p class="meta"><span>${DIFF[r.diff]}</span><span>⏱ ${r.time} game time</span><span>${r.cat}</span></p>
      <p>${r.desc}</p>
      ${stages}
      <h4>Ingredients</h4><ul class="ing">${ing}</ul>
      <h4>Equipment</h4><p class="equip">${r.equipment.map(e => `<span>${e}</span>`).join('')}</p>
      ${steps ? `<h4>Steps</h4><ol class="steps">${steps}</ol>` : ''}
      <div class="go">${r.playable ? `
        <label>Help: <select id="rb-mode"><option value="guided">Guided (arrows)</option><option value="discovery">Discovery (clues only)</option><option value="free">Free play</option></select></label>
        <button class="cook" id="rb-cook">${this.active?.id === r.id ? 'Keep cooking!' : "Let's cook!"}</button>` : '<p class="soonmsg">This recipe is coming soon: you can already find all its ingredients in the house.</p>'}</div>`;
    det.querySelector('.rb-back').onclick = () => this.renderGrid();
    det.querySelector('.fav').onclick = e => { this.favs.has(r.id) ? this.favs.delete(r.id) : this.favs.add(r.id); e.target.classList.toggle('on'); this.sys.changed(); };
    det.querySelectorAll('[data-find]').forEach(b => b.onclick = () => { this.close(); this.showWhere(b.dataset.find); });
    const mode = det.querySelector('#rb-mode'); if (mode) { mode.value = this.mode; mode.onchange = () => { this.mode = mode.value; this.sys.changed(); }; }
    const cook = det.querySelector('#rb-cook'); if (cook) cook.onclick = () => { this.start(r); this.close(); };
  }

  // ------------------------------------------------------------------ cooking a recipe
  start(r) {
    if (this.active?.id !== r.id) { this.collected = new Set(); }
    this.active = r; this.recent = [r.id, ...this.recent.filter(x => x !== r.id)].slice(0, 6);
    this.sys.toast(`Let's make ${r.name}!`); this.game.audio?.chime?.(880);
    this.renderTracker(); this.sys.changed();
  }
  stop() { this.active = null; this.guide = null; this.renderTracker(); this.sys.changed(); }
  refreshSoon() { clearTimeout(this._rt); this._rt = setTimeout(() => { this.renderTracker(); if (this.isOpen && !this.el.querySelector('.rb-detail').hidden) { const id = this.el.querySelector('#rb-cook') ? this.active?.id : null; } }, 120); }
  renderTracker() {
    const r = this.active, t = this.tracker;
    if (!r) { t.hidden = true; return; }
    t.hidden = false;
    const W = this.W, steps = r.steps || [];
    const done = steps.filter(s => s.done(W)).length;
    const next = steps.find(s => !s.done(W));
    const need = r.ingredients.filter(i => !i.auto && !i.optional && !W.got(i.tag)).slice(0, 4);
    t.innerHTML = `
      <header data-act="toggle"><b>🍳 ${r.name}</b><span>${done}/${steps.length}</span><i>▾</i></header>
      <div class="bar"><span style="width:${steps.length ? done / steps.length * 100 : 0}%"></span></div>
      <ol>${steps.map(s => `<li class="${s.done(W) ? 'done' : s === next ? 'next' : ''}">${s.t}</li>`).join('')}</ol>
      ${need.length && this.mode !== 'free' ? `<p class="need">${need.map(i => `<button data-act="find" data-tag="${i.tag}">${this.mode === 'guided' ? '📍' : '🔎'} ${i.label}</button>`).join('')}</p>` : ''}
      <footer><button data-act="book">📖 Recipe</button><button data-act="stop">Stop</button></footer>`;
  }
  checkComplete() {
    const r = this.active; if (!r || !r.final) return;
    const W = this.W, f = r.final;
    const ok = f.dish ? W.dish(f.dish, f.garnish || []) : f.flag ? W.flag(f.flag) : false;
    if (!ok) return;
    const soggy = [...this.sys.items.values()].some(i => i.state.c?.food?.some(x => x.st === 'soggy'));
    const stars = 3 - (soggy ? 1 : 0);
    this.done[r.id] = Math.max(this.done[r.id] || 0, stars);
    this.celebrate(r, stars);
    this.active = null; this.guide = null; this.renderTracker(); this.sys.changed();
  }
  celebrate(r, stars) {
    const c = document.getElementById('cook-done');
    c.innerHTML = `<div><span class="img" style="${this.image(r)}"></span><h3>You made ${r.name}!</h3><p class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p><p>${r.steps?.length || 0} steps done. Your meal is ready on the counter: carry it, share it, or eat it!</p><button>Yay!</button></div>`;
    c.hidden = false; c.querySelector('button').onclick = () => { c.hidden = true; };
    setTimeout(() => { c.hidden = true; }, 7000);
    const g = this.game; g.wren?.play?.('Cheer', { from: 0, to: 2, timeScale: 1.1, fadeIn: 0.15 }); g.friend?.cheer?.(); g.audio?.chime?.(988); setTimeout(() => g.audio?.chime?.(1318), 180);
    const p = g.player.pos.clone().add(V3(0, 1.6, 0));
    for (let i = 0; i < 60; i++) (i % 2 ? g.fxHeart : g.fxGlow)?.emit(p, V3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4), { life: 1.8, size: 0.18, gravity: 4, color: [1, 0.9, 0.6] });
  }

  // ------------------------------------------------------------------ "Show me where"
  showWhere(tag) {
    const it = this.nearest(tag);
    if (!it) { this.sys.toast('There isn\'t any in the house right now.'); return; }
    const where = this.H.whereIs(it);
    if (this.mode === 'discovery') { this.sys.toast(`Clue: look in ${where.replace(/→/g, ', ')}.`); return; }
    this.guide = { tag, item: it, t: 0 };
    this.sys.toast(`${it.name[0].toUpperCase() + it.name.slice(1)}: ${where}. Follow the yellow arrow!`);
  }
  update(dt) {
    this._t += dt;
    if (this._t > 1) { this._t = 0; if (this.active) this.renderTracker(); }
    const gd = this.guide, cam = this.game.camera;
    if (!gd || !this.H.indoors) { this.arrow.visible = this.ring.visible = false; if (this.edge) this.edge.hidden = true; return; }
    const it = gd.item;
    if (it.held || it.state.gone || this.W.got(gd.tag)) { this.guide = null; this.sys.toast('Found it!'); this.game.audio?.chime?.(1175); return; }
    const p = it.object.getWorldPosition(V3(0, 0, 0));
    const bob = Math.sin(performance.now() * 0.006) * 0.04;
    this.arrow.visible = true; this.arrow.position.copy(p).add(V3(0, 0.32 + bob, 0));
    this.ring.visible = true; this.ring.position.copy(p).add(V3(0, 0.03, 0)); this.ring.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.15);
    // off-screen: an arrow at the screen edge pointing the way
    const s = p.clone().project(cam), off = s.z > 1 || Math.abs(s.x) > 0.95 || Math.abs(s.y) > 0.92;
    if (this.edge) {
      this.edge.hidden = !off;
      if (off) {
        let x = s.x, y = s.y; if (s.z > 1) { x = -x; y = -y; }
        const a = Math.atan2(y, x), k = 0.86 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
        this.edge.style.left = `${(Math.cos(a) * k * 0.5 + 0.5) * 100}%`; this.edge.style.top = `${(-Math.sin(a) * k * 0.5 + 0.5) * 100}%`;
        this.edge.style.transform = `translate(-50%,-50%) rotate(${-a}rad)`;
      }
    }
  }

  save() { return { active: this.active?.id || null, mode: this.mode, done: this.done, favs: [...this.favs], recent: this.recent, collected: [...this.collected] }; }
  load(d) {
    if (!d) return;
    this.mode = d.mode || 'guided'; this.done = d.done || {}; this.favs = new Set(d.favs || []); this.recent = d.recent || []; this.collected = new Set(d.collected || []);
    this.active = d.active ? RECIPES.find(r => r.id === d.active) : null; this.renderTracker();
  }
}
