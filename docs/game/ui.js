// Input (keyboard, mouse, touch joystick, gamepad), HUD, minimap and sound.
import { H } from './world.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.x = 0; this.y = 0; this.sprint = false; this.jumpPressed = false;
    this.look = { dx: 0, dy: 0 }; this.zoom = 0; this.onWater = () => {}; this.onLove = () => {}; this.onToggleView = () => {}; this.onStats = () => {};
    this.waterHeld = false; this.joy = { x: 0, y: 0 }; this.speedHeld = false; this.enabled = false;
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (e.repeat && e.code === 'Space') return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.onLove();
      if (e.code === 'KeyV') this.onToggleView();
      if (e.code === 'F3') { this.onStats(); e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag = null;
    canvas.addEventListener('pointerdown', e => { if (!this.enabled) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy); this.look.dx += dx; this.look.dy += dy; });
    canvas.addEventListener('pointerup', e => { if (drag && drag.moved < 6 && e.pointerType === 'mouse') this.onWater(); drag = null; });
    canvas.addEventListener('wheel', e => { this.zoom += e.deltaY * 0.01; }, { passive: true });
    // touch joystick
    const stick = document.getElementById('stick'), knob = stick.querySelector('.knob');
    const moveJoy = e => { const r = stick.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.joy = { x, y, id: e.pointerId }; knob.style.transform = `translate(${x * 35}px, ${y * 35}px)`; };
    stick.addEventListener('pointerdown', e => { stick.setPointerCapture(e.pointerId); moveJoy(e); });
    stick.addEventListener('pointermove', e => { if (this.joy.id === e.pointerId) moveJoy(e); });
    stick.addEventListener('pointerup', () => { this.joy = { x: 0, y: 0 }; knob.style.transform = ''; });
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, { capture: true });
    const bs = document.getElementById('b-speed');
    bs.addEventListener('pointerdown', () => this.speedHeld = true); bs.addEventListener('pointerup', () => this.speedHeld = false); bs.addEventListener('pointerleave', () => this.speedHeld = false);
    document.getElementById('b-jump').addEventListener('click', () => this.jumpPressed = true);
    const bw = document.getElementById('b-water');
    bw.addEventListener('pointerdown', () => this.waterHeld = true); bw.addEventListener('pointerup', () => this.waterHeld = false); bw.addEventListener('pointerleave', () => this.waterHeld = false);
    document.getElementById('b-love').addEventListener('click', () => this.onLove());
  }

  poll() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.speedHeld;
    let water = k.has('KeyF') || this.waterHeld;
    // walk modifier: hold Alt or C to walk/skip
    const walk = k.has('KeyC') || k.has('AltLeft');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = v => Math.abs(v) < 0.15 ? 0 : v;
      x += dz(p.axes[0]); y -= dz(p.axes[1]);
      this.look.dx += dz(p.axes[2]) * 10; this.look.dy += dz(p.axes[3]) * 8;
      if (p.buttons[0]?.pressed && !this._padJump) this.jumpPressed = true; this._padJump = p.buttons[0]?.pressed;
      if (p.buttons[2]?.pressed || p.buttons[7]?.pressed) water = true;
      if (p.buttons[3]?.pressed && !this._padLove) this.onLove(); this._padLove = p.buttons[3]?.pressed;
      if (p.buttons[1]?.pressed || p.buttons[10]?.pressed || p.buttons[6]?.pressed) sprint = true;
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const scale = walk ? 0.45 : 1;
    this.x = x * scale; this.y = y * scale; this.sprint = sprint; this.water = water;
  }
}

export class Hud {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.toastT = 0;
    this.mm = this.$('minimap').getContext('2d');
    this.mmBg = this.bakeMap();
    this.fps = { frames: 0, t: 0, value: 0, el: this.$('stats'), visible: false };
  }
  toast(t) { const el = this.$('toast'); el.textContent = t; el.classList.add('show'); this.toastT = 2.8; }
  quests(S, ready) {
    const $ = this.$;
    $('n-shells').textContent = `${S.shells}/8`; $('q-shells').classList.toggle('done', S.shells >= 8);
    $('q-slide').classList.toggle('done', S.slid);
    $('n-pools').textContent = `${S.pools}/2`; $('q-pools').classList.toggle('done', S.pools >= 2);
    $('q-gull').classList.toggle('done', S.gull);
    $('q-chest').classList.toggle('locked', !ready); $('q-chest').classList.toggle('done', S.chest);
    document.querySelectorAll('#quests li .box').forEach(b => b.textContent = b.closest('li').classList.contains('done') ? '✓' : '');
  }
  energy(v) { this.$('energy-fill').style.width = `${v * 100}%`; }
  bakeMap() {
    const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d'); const img = g.createImageData(300, 300);
    for (let j = 0; j < 300; j++) for (let i = 0; i < 300; i++) {
      const x = -70 + i / 300 * 140, y = 50 - j / 300 * 112, h = H(x, y);
      const col = h < 0 ? [52, 170, 190] : h < 0.4 ? [222, 205, 168] : h < 2.4 ? [246, 232, 200] : h < 5 ? [150, 196, 98] : [72, 140, 64];
      const k = (j * 300 + i) * 4; img.data.set([...col, 255], k);
    }
    g.putImageData(img, 0, 0); return c;
  }
  map(S, quests, player, friend) {
    const g = this.mm; g.drawImage(this.mmBg, 0, 0);
    const xy = (x, y) => [(x + 70) / 140 * 300, (50 - y) / 112 * 300];
    const dot = (x, y, c, r = 6) => { const [u, v] = xy(x, y); g.fillStyle = c; g.beginPath(); g.arc(u, v, r, 0, 7); g.fill(); };
    { const [u, v] = xy(-11.5, 39.5); g.fillStyle = '#b98a4c'; g.fillRect(u, v, 23 / 140 * 300, 23 / 112 * 300); }
    for (const s of quests.shells) if (!s.got) dot(s.x, s.y, '#ff6f91', 5);
    for (const p of quests.pools) dot(p.x, p.y, p.done ? '#1f9fa6' : '#ffffff', 6);
    if (!S.gull) dot(-27.6, 0.6, '#ffffff', 6);
    if (!S.slid) dot(quests.zone.slide.ring[0], quests.zone.slide.ring[1], '#8fe0c8', 6);
    dot(53, 6, S.chest ? '#8fe0c8' : '#ffd166', 6);
    if (friend) dot(friend.pos.x, -friend.pos.z, '#d8794a', 5);
    const [u, v] = xy(player.pos.x, -player.pos.z);
    g.save(); g.translate(u, v); g.rotate(-player.face + Math.PI); g.fillStyle = '#1d3a40'; g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(-8, 9); g.closePath(); g.fill(); g.restore();
  }
  tick(dt, info) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.$('toast').classList.remove('show'); }
    const f = this.fps; f.frames++; f.t += dt;
    if (f.t >= 0.5) { f.value = f.frames / f.t; f.frames = 0; f.t = 0; if (f.visible) f.el.textContent = `${f.value.toFixed(0)} fps · ${info()}`; else f.el.textContent = `${f.value.toFixed(0)} fps`; }
  }
}

export class Audio {
  constructor() { this.AC = null; this.muted = false; }
  start() {
    try {
      const AC = this.AC = new (window.AudioContext || window.webkitAudioContext)();
      this.master = AC.createGain(); this.master.gain.value = 0.6; this.master.connect(AC.destination);
      // surf: filtered brown noise with a slow swell
      const len = AC.sampleRate * 3, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      this.surf = AC.createGain(); this.surf.gain.value = 0.3;
      const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.088; lg.gain.value = 0.16; lfo.connect(lg).connect(this.surf.gain); lfo.start();
      src.connect(lp).connect(this.surf).connect(this.master); src.start();
    } catch (e) { this.AC = null; }
  }
  sfx(f, dur = 0.15, type = 'sine', vol = 0.1) {
    const AC = this.AC; if (!AC || this.muted) return;
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g).connect(this.master); o.start(); o.stop(AC.currentTime + dur + 0.02);
  }
  chime(base = 784) { [0, 0.09, 0.18].forEach((t, i) => setTimeout(() => this.sfx(base * [1, 1.25, 1.5][i], 0.35, 'sine', 0.08), t * 1000)); }
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.6; return this.muted; }
  setShore(dist) { if (this.surf) this.surf.gain.value = Math.max(0.08, 0.38 - dist * 0.006); }
}
