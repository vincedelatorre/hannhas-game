// Input (keyboard, mouse, touch joystick, gamepad), HUD, minimap and sound.
import { H } from './world.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.x = 0; this.y = 0; this.sprint = false; this.jumpPressed = false;
    this.look = { dx: 0, dy: 0 }; this.zoom = 0; this.onWater = () => {}; this.onLove = () => {}; this.onToggleView = () => {}; this.onStats = () => {}; this.onPhoto = () => {};
    this.diveTaps = 0; this.surfaceTaps = 0;   // D dives (again = deeper), S swims back up
    this.waterHeld = false; this.joy = { x: 0, y: 0 }; this.speedHeld = false; this.enabled = false;
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (e.repeat && e.code === 'Space') return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      if (e.code === 'KeyL' && !e.repeat) this.onLove();
      if (e.code === 'KeyD' && !e.repeat) this.diveTaps++;
      if (e.code === 'KeyS' && !e.repeat) this.surfaceTaps++;
      if (e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'KeyV') this.onToggleView();
      if (e.code === 'KeyP') this.onPhoto();
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
    const bj = document.getElementById('b-jump');
    bj.addEventListener('click', () => this.jumpPressed = true);
    bj.addEventListener('pointerdown', () => this.jumpHeldBtn = true); bj.addEventListener('pointerup', () => this.jumpHeldBtn = false); bj.addEventListener('pointerleave', () => this.jumpHeldBtn = false);
    const bd = document.getElementById('b-dive');
    if (bd) bd.addEventListener('click', () => this.diveTaps++);
    const bu = document.getElementById('b-surface');
    if (bu) bu.addEventListener('click', () => this.surfaceTaps++);
    const bw = document.getElementById('b-water');
    bw.addEventListener('pointerdown', () => this.waterHeld = true); bw.addEventListener('pointerup', () => this.waterHeld = false); bw.addEventListener('pointerleave', () => this.waterHeld = false);
    document.getElementById('b-love').addEventListener('click', () => this.onLove());
  }

  poll() {
    const k = this.keys;
    // arrow keys move; letters are powers (W water, L love, D dive, S surface)
    let x = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    let y = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.speedHeld;
    let water = k.has('KeyW') || this.waterHeld;
    // walk modifier: hold Alt or C to walk/skip
    const walk = k.has('KeyC') || k.has('AltLeft');
    let jumpHeld = k.has('Space') || this.jumpHeldBtn;
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
      if (p.buttons[4]?.pressed && !this._padDive) this.diveTaps++; this._padDive = p.buttons[4]?.pressed;
      if (p.buttons[5]?.pressed && !this._padUp) this.surfaceTaps++; this._padUp = p.buttons[5]?.pressed;
      if (p.buttons[0]?.pressed) jumpHeld = true;
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const scale = walk ? 0.45 : 1;
    this.x = x * scale; this.y = y * scale; this.sprint = sprint; this.water = water; this.jumpHeld = jumpHeld;
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
    $('q-turtle')?.classList.toggle('done', !!S.turtle);
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

// Sound: recorded-style samples (generated, see Tools/asset_manifest.json -> audio) with
// layered ambience, randomised footsteps and one-shots. Falls back to soft synth tones
// for anything that failed to load.
const SOUNDS = ['amb_surf', 'amb_island', 'music_island', 'step_sand', 'step_water', 'splash_small', 'power_water', 'power_love', 'pickup_shell', 'splash_big', 'jump', 'chest_open'];

export class Audio {
  constructor(base = 'assets/audio/') { this.base = base; this.AC = null; this.muted = false; this.buf = {}; this.loops = {}; }

  async start() {
    try {
      const AC = this.AC = new (window.AudioContext || window.webkitAudioContext)();
      this.master = AC.createGain(); this.master.gain.value = 0.8; this.master.connect(AC.destination);
      this.sfxBus = AC.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      this.ambBus = AC.createGain(); this.ambBus.gain.value = 0.7; this.ambBus.connect(this.master);
      this.musicBus = AC.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
      await Promise.all(SOUNDS.map(async n => {
        try { const r = await fetch(`${this.base}${n}.mp3`); if (!r.ok) return; this.buf[n] = await AC.decodeAudioData(await r.arrayBuffer()); } catch (e) { /* missing sound */ }
      }));
      this.loop('amb_surf', this.ambBus, 0.6); this.loop('amb_island', this.ambBus, 0.35); this.loop('music_island', this.musicBus, 1);
      if (!this.buf.amb_surf) this.synthSurf();
    } catch (e) { this.AC = null; }
  }

  loop(name, bus, vol) {
    const b = this.buf[name]; if (!b) return;
    const src = this.AC.createBufferSource(); src.buffer = b; src.loop = true;
    const g = this.AC.createGain(); g.gain.value = vol; src.connect(g).connect(bus);
    src.start(0, Math.random() * b.duration); this.loops[name] = g;
  }

  /** play a sample; slice picks a random part of longer files (footsteps) */
  play(name, { vol = 1, rate = 1, slice = 0 } = {}) {
    const AC = this.AC, b = this.buf[name]; if (!AC || this.muted || !b) return false;
    const src = AC.createBufferSource(); src.buffer = b; src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = AC.createGain(); g.gain.value = vol; src.connect(g).connect(this.sfxBus);
    if (slice) { const off = Math.random() * Math.max(0, b.duration - slice); src.start(0, off, slice); g.gain.setTargetAtTime(0, AC.currentTime + slice * 0.7, 0.03); }
    else src.start();
    return true;
  }

  step(inWater) { this.play(inWater ? 'step_water' : 'step_sand', { vol: inWater ? 0.35 : 0.22, slice: 0.32 }); }
  jump() { this.play('jump', { vol: 0.4 }) || this.sfx(520, 0.12, 'triangle', 0.05); }
  water() { if (!this._wt || this.AC.currentTime > this._wt) { this._wt = (this.AC?.currentTime || 0) + 0.45; this.play('power_water', { vol: 0.35, slice: 0.6 }) || this.sfx(900 + Math.random() * 300, 0.04, 'sine', 0.025); } }
  splash(big = false) { this.play(big ? 'splash_big' : 'splash_small', { vol: big ? 0.7 : 0.25 }); }
  love() { this.play('power_love', { vol: 0.55 }) || this.chime(660); }
  pickup() { this.play('pickup_shell', { vol: 0.55 }) || this.chime(988); }
  treasure() { this.play('chest_open', { vol: 0.8 }) || this.chime(523); }

  synthSurf() {
    const AC = this.AC;
    const len = AC.sampleRate * 3, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = AC.createGain(); g.gain.value = 0.3; src.connect(lp).connect(g).connect(this.ambBus); src.start();
    this.loops.amb_surf = g;
  }
  /** rushing water and wind inside the slide: filtered noise that follows the speed */
  rideStart() {
    const AC = this.AC; if (!AC) return;
    if (!this.ride) {
      const len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7; bp.frequency.value = 600;
      const g = AC.createGain(); g.gain.value = 0; src.connect(bp).connect(g).connect(this.sfxBus); src.start();
      this.ride = { g, bp };
    }
    this.play('splash_small', { vol: 0.5 });
  }
  rideSpeed(v) {
    if (!this.ride || !this.AC) return;
    const t = this.AC.currentTime;
    this.ride.g.gain.setTargetAtTime(this.muted ? 0 : Math.min(0.5, 0.06 + v * 0.014), t, 0.08);
    this.ride.bp.frequency.setTargetAtTime(300 + v * 55, t, 0.1);
  }
  rideStop() { if (this.ride && this.AC) this.ride.g.gain.setTargetAtTime(0, this.AC.currentTime, 0.15); }

  sfx(f, dur = 0.15, type = 'sine', vol = 0.1) {
    const AC = this.AC; if (!AC || this.muted) return;
    const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(g).connect(this.sfxBus); o.start(); o.stop(AC.currentTime + dur + 0.02);
  }
  chime(base = 784) { [0, 0.09, 0.18].forEach((t, i) => setTimeout(() => this.sfx(base * [1, 1.25, 1.5][i], 0.35, 'sine', 0.07), t * 1000)); }
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.8; return this.muted; }
  /** louder surf near the waterline, more birds inland */
  setShore(dist) {
    if (this.loops.amb_surf) this.loops.amb_surf.gain.value = Math.max(0.12, 0.75 - dist * 0.012);
    if (this.loops.amb_island) this.loops.amb_island.gain.value = Math.min(0.55, 0.15 + dist * 0.01);
  }
}

/** speech bubble that follows a character on screen */
export class Speech {
  constructor(lines) {
    this.lines = lines || {}; this.el = document.getElementById('speech'); this.text = document.getElementById('speech-text');
    this.t = 0; this.cool = 0; this.last = {}; this.quiet = 0;
  }
  /** say a line for an event; low-priority lines wait for silence */
  say(event, { force = false } = {}) {
    const L = this.lines[event]; if (!L || !L.length) return false;
    if (!force && (this.t > 0 || this.cool > 0)) return false;
    let line = L[Math.floor(Math.random() * L.length)];
    if (L.length > 1 && line === this.last[event]) line = L[(L.indexOf(line) + 1) % L.length];
    this.last[event] = line;
    this.text.textContent = line; this.el.classList.add('show');
    this.t = 2.2 + line.length * 0.045; this.cool = 1.5; this.quiet = 0;
    return true;
  }
  update(dt, camera, anchor, canvas) {
    this.quiet += dt;
    if (this.t > 0) {
      this.t -= dt; if (this.t <= 0) this.el.classList.remove('show');
    } else this.cool -= dt;
    if (!anchor) return;
    const p = anchor.clone().project(camera);
    const behind = p.z > 1;
    const r = canvas.getBoundingClientRect();
    const x = (p.x * 0.5 + 0.5) * r.width, y = (-p.y * 0.5 + 0.5) * r.height;
    this.el.style.left = `${Math.min(r.width - 130, Math.max(130, x))}px`;
    this.el.style.top = `${Math.max(60, y - 12)}px`;
    this.el.style.visibility = behind ? 'hidden' : 'visible';
  }
}
