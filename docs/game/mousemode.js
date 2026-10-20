// First-person mouse modes.
//
//   NAVIGATION (default in first person): the mouse is captured (pointer lock) and simply moving
//     it looks around. No button needs to be held. A tiny dot marks the centre of the view.
//   INTERACTION (Tab): the camera stops following the mouse and a small animated hand cursor
//     appears. Hover outlines what can be used; left-click uses / grabs / places, right-click
//     looks closer. Tab again recaptures the mouse and free-look resumes.
//
// Close-ups (an open cupboard, the fridge, the range…) switch to the hand automatically and hand
// back to whatever mode you were in when you step away. Picking itself is the house's Focus
// picker (a ray through the cursor, range limited, blocked by walls and counters), so every
// interactable in the house works the same way in both places.
import { Item, Hinge, Slide, Seat } from './house/interact.js';

const $ = id => document.getElementById(id);

const HAND_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="hc-skin" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#FFFBF3"/><stop offset="1" stop-color="#F0DDC2"/></linearGradient></defs>
  <g class="hc-hand">
    <rect class="f f-thumb" x="7" y="33" width="10" height="20" rx="5"/>
    <rect class="f f-index" x="17" y="3" width="10.5" height="32" rx="5.25"/>
    <rect class="f f-middle" x="27.5" y="8" width="10.5" height="28" rx="5.25"/>
    <rect class="f f-ring" x="38" y="12" width="9.5" height="25" rx="4.75"/>
    <rect class="f f-pinky" x="47.5" y="18" width="8.5" height="20" rx="4.25"/>
    <path class="f palm" d="M15 34 Q15 29 20 29 L51 30 Q57 30 57 35.5 L57 46 Q57 61 41 61 L29 61 Q15 61 15 48 Z"/>
    <path class="crease" d="M27 30 v6 M37.5 31 v5.5 M47.5 32 v5" />
  </g>
  <g class="hc-badge"><circle cx="54" cy="54" r="9"/><text x="54" y="58.5" text-anchor="middle"></text></g>
</svg>`;

export class MouseMode {
  constructor(game) {
    this.g = game; this.mode = 'NAVIGATION'; this.canvas = game.renderer.domElement;
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, inside: false };
    // ---- DOM: hand cursor, centre dot, mode chip, one-second notice, click-to-resume hint
    const hc = this.handEl = document.createElement('div'); hc.id = 'hand-cursor'; hc.className = 'relaxed'; hc.innerHTML = HAND_SVG; document.body.append(hc);
    this.dot = document.createElement('div'); this.dot.id = 'look-dot'; document.body.append(this.dot);
    const chip = this.chip = document.createElement('button'); chip.type = 'button'; chip.id = 'mode-chip';
    chip.addEventListener('click', () => this.toggle()); document.body.append(chip);
    this.note = document.createElement('div'); this.note.id = 'mode-note'; this.note.setAttribute('role', 'status'); document.body.append(this.note);
    this.resume = document.createElement('div'); this.resume.id = 'look-resume'; this.resume.innerHTML = '<span>🖱️</span> Click to look around · <kbd>Tab</kbd> for the hand'; document.body.append(this.resume);
    // ---- listeners (one set, never duplicated)
    document.addEventListener('pointerlockchange', () => this.lockChanged());
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    addEventListener('mousemove', e => {
      if (this.locked) {
        if (this.mode !== 'NAVIGATION' || this.g.house?.focus?.active) return;
        const k = 0.55, mx = e.movementX, my = e.movementY;
        if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;   // the occasional browser spike
        this.g.input.look.dx += mx * k; this.g.input.look.dy += my * k;
        return;
      }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.place();
    });
    this.canvas.addEventListener('pointerenter', () => { this.mouse.inside = true; });
    this.canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; });
    addEventListener('pointerdown', e => { if (this.handShown && e.button === 0) { this.grabT = 0.22; } }, true);
    addEventListener('blur', () => { this.lockFailed = true; });
    this.wasFirst = false; this.wasWant = false;
  }

  get locked() { return document.pointerLockElement === this.canvas; }
  get firstPerson() { return this.g.view === 'first'; }
  get focusOn() { return !!this.g.house?.focus?.active; }
  /** something on screen needs the normal mouse (menus, dialogue, recipe book, photo mode) */
  get menuOpen() {
    const g = this.g;
    return !!(g.photo || g.house?.recipeBook?.isOpen || g.actions?.s.talk || !$('inventory')?.hidden || !$('settings')?.hidden || document.body.classList.contains('bigmap') || document.body.classList.contains('ctl-open') || !$('win')?.hidden || g.ride?.riding);
  }
  // one mode only: the cursor is always free, hovering always shows what you can use, drag to look
  get wantLock() { return false; }
  get handShown() { return this.focusOn || (this.g.started && !this.menuOpen && !this.g.photo); }

  // ------------------------------------------------------------------ switching
  /** Tab: in first person flip between looking and the hand; from third person go to first person with the hand ready */
  toggle() {
    return;   // no separate interaction mode any more
    const g = this.g; if (!g.started || g.photo) return;
    if (this.focusOn) { g.house.focus.exit(); this.set('NAVIGATION'); return; }
    if (!this.firstPerson) { g.view = 'first'; this.wasFirst = true; this.set('INTERACTION'); return; }
    this.set(this.mode === 'NAVIGATION' ? 'INTERACTION' : 'NAVIGATION');
  }
  set(m) {
    this.mode = m;
    this.notify(m === 'NAVIGATION' ? 'Gameplay Mode' : 'Interaction Mode');
    if (m === 'NAVIGATION') this.lock(); else this.unlock();
    this.g.audio?.house?.('click');
  }
  /** V switched views: first person always starts in Navigation mode */
  viewChanged() {
    if (this.firstPerson && !this.wasFirst) this.notify(this.touch ? 'First person · drag to look' : 'First person · drag to look · point at things to use them');
    if (!this.firstPerson && this.wasFirst) { this.unlock(); this.mode = 'NAVIGATION'; }
    this.wasFirst = this.firstPerson;
  }
  lock() {
    if (!this.wantLock || this.locked) return;
    this.lockFailed = false;
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (r?.catch) r.catch(() => { try { const r2 = this.canvas.requestPointerLock(); r2?.catch?.(() => { this.lockFailed = true; }); } catch (e) { this.lockFailed = true; } });
    } catch (e) { this.lockFailed = true; }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }
  lockChanged() { if (!this.locked && this.wantLock) this.lockFailed = true; this.g.input.look.dx = this.g.input.look.dy = 0; }
  /** a click on the game while the mouse should be captured just recaptures it (no water spray) */
  claimClick() { if (this.wantLock && !this.locked) { this.lock(); return true; } return false; }
  /** Esc: release the mouse; the hint offers to take it back */
  release() { if (this.locked) { this.unlock(); this.lockFailed = true; return true; } return false; }

  notify(t) { const n = this.note; n.textContent = t; n.classList.remove('show'); void n.offsetWidth; n.classList.add('show'); clearTimeout(this._nt); this._nt = setTimeout(() => n.classList.remove('show'), 1300); }
  place() { this.handEl.style.transform = `translate(${this.mouse.x}px, ${this.mouse.y}px)`; }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g, F = g.house?.focus, sys = g.interact;
    if (this.firstPerson !== this.wasFirst) this.viewChanged();
    const want = this.wantLock;
    if (!want && this.locked) this.unlock();
    if (want && !this.wasWant && !this.locked) this.lock();            // back from a menu or a close-up
    this.wasWant = want;
    const showResume = want && !this.locked && this.lockFailed;
    if (this.resume.classList.contains('show') !== showResume) this.resume.classList.toggle('show', showResume);
    // the free hand picks with the house picker; drag-to-look is off while the hand is out
    const hand = this.handShown;
    const center = want && this.locked && !this.focusOn;
    if (F) { F.free = (hand && !this.focusOn) || center; F.centerPick = center && !hand; }
    g.input.lookBlocked = false;   // dragging always turns the camera; a click without dragging selects
    // hand cursor art follows what's under it
    const show = hand && !this.touch && this.mouse.inside && !F?.inspecting;
    this.handEl.classList.toggle('show', show);
    document.body.classList.toggle('hand-mode', hand && !this.touch);
    if (show) {
      this.grabT = Math.max(0, (this.grabT || 0) - dt);
      const h = F?.hover, x = h?.x;
      let st = 'relaxed', badge = '';
      if (this.grabT > 0 && h?.item) st = 'grab';
      else if (h?.v?.disabled) st = 'relaxed';
      else if (h?.item && !sys.held) st = 'open';
      else if (h && (x instanceof Hinge || x instanceof Slide)) { st = 'point'; badge = x instanceof Slide ? '↔' : '↻'; }
      else if (h && x instanceof Seat) { st = 'point'; badge = '🪑'; }
      else if (h) st = 'point';
      else if (sys.held) st = 'hold';
      if (sys.held && st !== 'point') st = h ? 'point' : 'hold';
      if (this.handEl.dataset.s !== st) { this.handEl.className = `show ${st}`; this.handEl.dataset.s = st; }
      const b = this.handEl.querySelector('.hc-badge text'); if (b.textContent !== badge) { b.textContent = badge; this.handEl.classList.toggle('badge', !!badge); }
      this.handEl.classList.toggle('hot', !!h && !h.v?.disabled);
    }
    // centre dot while looking; mode chip only in first person / close-ups
    const dot = want && this.locked;
    if (this.dot.classList.contains('show') !== dot) this.dot.classList.toggle('show', dot);
    const hot = dot && !!F?.hover && !F.hover.v?.disabled;
    if (this.dot.classList.contains('hot') !== hot) this.dot.classList.toggle('hot', hot);
    const chipOn = false;
    this.chip.hidden = !chipOn;
    if (chipOn) {
      const ico = hand ? '✋' : '🖱️', lbl = hand ? 'Hand' : 'Look';
      if (this.chip.dataset.m !== lbl) { this.chip.dataset.m = lbl; this.chip.innerHTML = `<span>${ico}</span><b>${lbl}</b>${this.touch ? '' : '<kbd>Tab</kbd>'}`; this.chip.setAttribute('aria-label', hand ? 'Interaction mode (Tab to go back to gameplay)' : 'Gameplay mode (Tab for the hand cursor)'); }
    }
  }
}
