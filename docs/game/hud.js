// The tidy HUD: collapsible Objectives (top left) and Controls (bottom left) panels, objective
// notifications and pinning, the inventory, the big map, a quick hide-everything toggle,
// contextual key prompts that only show up when they matter, and the touch action wheel.
import { CONTROLS } from './ui.js';

const $ = id => document.getElementById(id);
const PREF = 'hg.hud';
const store = { get() { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) { return {}; } }, set(v) { try { localStorage.setItem(PREF, JSON.stringify(v)); } catch (e) { /* storage blocked */ } } };

export class HudExtra {
  constructor(game) {
    this.g = game;
    this.pref = { objOpen: true, ctlOpen: false, pinned: null, ...store.get() };
    this.quests = $('quests'); this.list = this.quests.querySelector('ul');
    // ---- objectives: the title row becomes a button that folds the list away
    const head = this.objBtn = document.createElement('button');
    head.type = 'button'; head.id = 'obj-btn'; head.setAttribute('aria-controls', 'obj-body');
    head.innerHTML = '<span class="ico">📋</span><span class="lbl">Objectives</span><span class="count" id="obj-count">0/6</span><span class="chev">▾</span>';
    const body = document.createElement('div'); body.id = 'obj-body';
    const title = this.quests.querySelector('h1'), zone = this.quests.querySelector('.zone');
    body.append(zone, this.list); title.remove();
    this.quests.prepend(head); this.quests.append(body);
    this.pinEl = document.createElement('div'); this.pinEl.id = 'obj-pin'; this.quests.append(this.pinEl);
    head.addEventListener('click', () => this.toggleObjectives());
    // a pin button on each objective
    this.list.querySelectorAll('li').forEach(li => this.addPin(li));
    // ---- controls panel, built from the key map so it always matches the real controls
    const help = $('help');
    help.innerHTML = '';
    const cb = this.ctlBtn = document.createElement('button'); cb.type = 'button'; cb.id = 'ctl-btn';
    cb.innerHTML = '<span class="ico">🎮</span><span class="lbl">Controls</span><kbd>F1</kbd>';
    const panel = this.ctlPanel = document.createElement('div'); panel.id = 'ctl-panel';
    panel.innerHTML = CONTROLS.map(([sec, rows]) => `<section><h3>${sec}</h3>${rows.map(([k, what]) => `<div class="row"><span class="keys">${k.split(' / ').map(x => `<kbd>${x}</kbd>`).join(' ')}</span><span>${what}</span></div>`).join('')}</section>`).join('');
    // the Characters section gets real buttons that call the same commands as Tab / H / J
    const charSec = [...panel.querySelectorAll('section')].find(x => x.querySelector('h3')?.textContent === 'Characters');
    if (charSec) {
      const row = document.createElement('div'); row.className = 'char-btns';
      for (const [lbl, fn] of [['🔁 Switch', () => game.party?.switchTo()], ['🎵 Whistle', () => game.party?.whistle()], ['✋ Stay here', () => game.party?.dismiss()]]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = lbl; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); row.append(b); }
      charSec.append(row);
    }
    help.append(panel, cb);
    cb.addEventListener('click', () => this.toggleControls());
    // ---- objective notification
    this.note = document.createElement('div'); this.note.id = 'obj-note'; this.note.className = 'hud'; this.note.setAttribute('role', 'status'); document.body.append(this.note);
    // ---- inventory
    this.inv = document.createElement('div'); this.inv.id = 'inventory'; this.inv.className = 'chip'; this.inv.hidden = true; document.body.append(this.inv);
    // ---- context prompts (B Sit, K Kick, T Talk…)
    this.ctx = document.createElement('div'); this.ctx.id = 'ctx'; this.ctx.className = 'hud'; document.body.append(this.ctx);
    // ---- touch action wheel
    this.buildWheel();
    this.applyPrefs();
    this.done = new Set(); this.lastDone = null; this.first = true;
  }

  applyPrefs() {
    this.quests.classList.toggle('collapsed', !this.pref.objOpen); this.objBtn.setAttribute('aria-expanded', String(this.pref.objOpen));
    $('help').classList.toggle('open', !!this.pref.ctlOpen); document.body.classList.toggle('ctl-open', !!this.pref.ctlOpen); this.ctlBtn.setAttribute('aria-expanded', String(!!this.pref.ctlOpen));
    this.list.querySelectorAll('li').forEach(li => li.classList.toggle('pinned', li.id === this.pref.pinned));
    this.renderPin();
  }
  save() { store.set(this.pref); }
  toggleObjectives(on = !this.pref.objOpen) { this.pref.objOpen = on; this.quests.classList.remove('pulse'); this.applyPrefs(); this.save(); }
  toggleControls(on = !this.pref.ctlOpen) { this.pref.ctlOpen = on; this.applyPrefs(); this.save(); }
  addPin(li) {
    if (li.querySelector('.pin')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pin'; b.title = 'Pin this objective'; b.setAttribute('aria-label', 'Pin this objective'); b.textContent = '📌';
    b.addEventListener('click', e => { e.stopPropagation(); this.pref.pinned = this.pref.pinned === li.id ? null : li.id; this.applyPrefs(); this.save(); });
    li.append(b);
  }
  renderPin() {
    const li = this.pref.pinned && document.getElementById(this.pref.pinned);
    if (!li || li.classList.contains('done')) { this.pinEl.hidden = true; return; }
    this.pinEl.hidden = false;
    this.pinEl.innerHTML = `<span>📌</span><span>${li.children[1].textContent}</span><span class="n">${li.querySelector('.n')?.textContent || ''}</span>`;
  }
  /** called whenever quest state changes: counts, completion notices */
  refresh() {
    const lis = [...this.list.querySelectorAll('li')].filter(li => !li.classList.contains('bonus') || li.classList.contains('done'));
    const all = [...this.list.querySelectorAll('li')];
    const done = all.filter(li => li.classList.contains('done'));
    $('obj-count').textContent = `${done.length}/${Math.max(lis.length, done.length)}`;
    for (const li of done) if (!this.done.has(li.id)) { this.done.add(li.id); if (!this.first) this.notify(`✓ ${li.children[1].textContent}`, true); }
    this.first = false;
    this.renderPin();
  }
  notify(text, good) {
    const n = this.note; n.textContent = text; n.classList.toggle('good', !!good);
    n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
    clearTimeout(this._nt); this._nt = setTimeout(() => n.classList.remove('show'), 3200);
    if (good) this.g.audio?.chime?.(880);
  }
  /** a new objective appears (quests from friends, the kitchen…) */
  newObjective(text, id = 'q-' + text.toLowerCase().replace(/[^a-z]+/g, '-').slice(0, 30)) {
    if (document.getElementById(id)) return id;
    const li = document.createElement('li'); li.id = id; li.className = 'new';
    li.innerHTML = `<span class="box"></span><span>${text}</span><span class="n"></span>`;
    this.list.append(li); this.addPin(li);
    this.quests.classList.remove('pulse'); void this.quests.offsetWidth; this.quests.classList.add('pulse');
    this.notify(`New objective: ${text}`);
    this.refresh();
    return id;
  }
  completeObjective(text) {
    const li = [...this.list.querySelectorAll('li')].find(l => l.children[1]?.textContent === text); if (!li) return;
    li.classList.add('done'); li.querySelector('.box').textContent = '✓'; this.refresh();
  }

  // ------------------------------------------------------------------ panels
  toggleInventory(on = this.inv.hidden) {
    this.inv.hidden = !on; if (!on) return;
    const A = this.g.actions, sys = this.g.interact, held = sys?.held, S = A.inv.shell;
    const slot = (ico, name, state, cls = '') => `<div class="slot ${cls}"><span class="ico">${ico}</span><b>${name}</b><small>${state}</small></div>`;
    this.inv.innerHTML = `<h3>Inventory <kbd>I</kbd></h3><div class="slots">
      ${slot('🐚', 'Pearl shell', S.equipped ? 'In your hand · H to put away' : 'Tucked away · H to take out', S.equipped ? 'on' : '')}
      ${slot('🔦', 'Magic flashlight', A.s.flashlight ? 'On · U to switch off' : 'U to switch on', A.s.flashlight ? 'on' : '')}
      ${held ? slot('✋', held.name, 'Holding · Q to put down', 'on') : slot('✋', 'Empty hand', 'E to pick something up')}
      ${A.dialogue.quest.state === 'done' ? slot('⛵', 'Toy boat', 'Returned to your friend!') : ''}
    </div><small class="hint">I or Esc to close</small>`;
  }
  toggleBigMap() { document.body.classList.toggle('bigmap'); }
  toggleQuick() { document.body.classList.toggle('hud-hidden'); this.g.toast?.(document.body.classList.contains('hud-hidden') ? 'Buttons hidden (Tab to show)' : ''); }
  /** close the top-most panel; true if something closed */
  closeTop() {
    if (!this.inv.hidden) { this.inv.hidden = true; return true; }
    if (document.body.classList.contains('bigmap')) { this.toggleBigMap(); return true; }
    if (this.pref.ctlOpen) { this.toggleControls(false); return true; }
    if (!$('settings').hidden) { $('settings').hidden = true; return true; }
    if (this.wheel.classList.contains('open')) { this.wheel.classList.remove('open'); return true; }
    return false;
  }

  // ------------------------------------------------------------------ touch action wheel
  buildWheel() {
    const acts = [['shell', '🐚', 'Shell'], ['run', '🏃', 'Run'], ['dance', '💃', 'Dance'], ['wave', '👋', 'Wave'], ['sit', '🪑', 'Sit'], ['nap', '😴', 'Nap'], ['talk', '💬', 'Talk'], ['cheer', '🎉', 'Yay!'], ['kick', '⚽', 'Kick'], ['light', '🔦', 'Light'], ['crouch', '🤫', 'Sneak']];
    const w = this.wheel = document.createElement('div'); w.id = 'wheel';
    const R = 112;
    w.innerHTML = acts.map(([a, ico, lbl], i) => { const ang = -Math.PI / 2 + (i / acts.length) * Math.PI * 2; return `<button type="button" data-a="${a}" style="--x:${Math.cos(ang) * R}px;--y:${Math.sin(ang) * R}px" aria-label="${lbl}"><span>${ico}</span><small>${lbl}</small></button>`; }).join('') + '<button type="button" class="mid" aria-label="Close">✕</button>';
    document.body.append(w);
    w.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a) this.g.actions?.key(b.dataset.a); w.classList.remove('open'); });
    const open = document.createElement('button'); open.type = 'button'; open.id = 'b-wheel'; open.setAttribute('aria-label', 'More moves'); open.textContent = '✨';
    $('buttons').append(open);
    open.addEventListener('click', () => w.classList.toggle('open'));
  }

  // ------------------------------------------------------------------ per frame: the context prompt
  update(dt) {
    this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 0.2;
    const g = this.g, A = g.actions; if (!A || !g.started) { this.ctx.innerHTML = ''; return; }
    const tips = A.contextTips();
    const html = tips.map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join('');
    if (html !== this._last) { this.ctx.innerHTML = html; this._last = html; }
  }
}
