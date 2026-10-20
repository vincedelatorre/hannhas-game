// Two playable characters: Hannah (Wren) and her friend.
//
//   Tab  switch which character you control (the other one stays exactly where they are)
//   H    whistle: the other character turns, acknowledges, walks over (pathfinding) and hangs out
//   J    "stay here": they stop following and go back to doing their own thing on the spot
//
// The character you are not controlling is an independent person by default. Their behaviour is
// a small state machine:
//   INDEPENDENT_IDLE → (whistle) RESPONDING_TO_WHISTLE → NAVIGATING_TO_PLAYER → COMPANION_HANGOUT
//   COMPANION_HANGOUT ⇄ COMPANION_FOLLOW   (start following past 4 m, settle again inside 2.2 m)
//   SEATED (left on a chair) · J or a character switch → INDEPENDENT_IDLE
// PLAYER_CONTROLLED is simply whichever character the party currently hands to the Player.
import * as THREE from 'three/webgpu';
import { Nav } from './nav.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = id => document.getElementById(id);
const ENGAGED = new Set(['RESPONDING_TO_WHISTLE', 'NAVIGATING_TO_PLAYER', 'COMPANION_HANGOUT', 'COMPANION_FOLLOW']);
const STATUS = {
  INDEPENDENT_IDLE: ['🧍', 'Independent'], SEATED: ['🪑', 'Sitting'], RESPONDING_TO_WHISTLE: ['❗', 'Heard you!'],
  NAVIGATING_TO_PLAYER: ['🏃', 'Coming'], COMPANION_HANGOUT: ['💬', 'Hanging out'], COMPANION_FOLLOW: ['👣', 'Following'], UNREACHABLE: ['❓', 'Can\'t find a way to you'],
};
const START_FOLLOW = 4.0, STOP_FOLLOW = 2.2;

export class Party {
  /** members: [{ key, name, char, body, player }] — index 0 starts as the player */
  constructor(game, members) {
    this.g = game; this.nav = new Nav(game);
    this.m = members.map(x => ({ ...x, held: null, seat: null, s: { run: false, crouch: false, flashlight: false } }));
    for (const m of this.m) { m.ai = new Buddy(this, m); m.char.root.userData.keep = true; }
    this.i = 0; this.wT = 0; this.pk = { whistle: 0, dismiss: 0 };
    this.who = document.createElement('div'); this.who.id = 'party-who'; this.who.className = 'hud'; document.body.append(this.who);
    this.stat = document.createElement('div'); this.stat.id = 'party-status'; this.stat.className = 'hud'; document.body.append(this.stat);
    this.apply();
  }
  get active() { return this.m[this.i]; }
  get other() { return this.m[1 - this.i]; }
  member(key) { return this.m.find(m => m.key === key); }
  inside(m) { return m.body.feet.y > 200; }
  apply() {
    const g = this.g, a = this.active, o = this.other;
    g.player = a.player; g.wren = a.char; g.friend = o.ai;
    a.ai.active = true; o.ai.active = false;
    if (g.speech) { g.speech.muted = a.key !== 'Wren'; const b = $('speech')?.querySelector('b'); if (b) b.textContent = o.name; }
  }
  /** who is holding what: the active hands use the interaction system, the other keeps theirs */
  heldBy(key) { const m = this.member(key); return m === this.active ? this.g.interact?.held : m?.held; }

  // ------------------------------------------------------------------ Tab: switch
  switchTo() {
    const g = this.g, A = g.actions, sys = g.interact;
    if (!g.started || g.photo || g.ride?.riding || g.sliding >= 0 || g.onSwing) { g.toast?.('Finish what you\'re doing first!'); return false; }
    if (A?.s.talk) A.dialogue.close();
    if (A?.s.dance) A.toggleDance(false);
    if (A?.s.nap) A.wake();
    if (g.house?.focus?.active) g.house.focus.exit();
    const old = this.active, nw = this.other;
    // the old character keeps their state, hands and seat
    old.s = { run: A.s.run, crouch: A.s.crouch, flashlight: A.s.flashlight };
    old.held = sys.held; sys.held = null;
    if (old.held) this.toHand(old.held, old.char);
    old.seat = g.seated?.seat || null; g.seated = null;
    old.ai.takeOver(old.player);
    // the new character picks up exactly where they were
    const ai = nw.ai;
    nw.player.face = ai.face; nw.player.vel.set(0, 0, 0); nw.player.vy = 0; nw.player.indoors = this.inside(nw);
    ai.release();
    if (nw.seat) { g.seated = { seat: nw.seat, t: 0.6 }; nw.char.sitting = true; nw.seat = null; } else nw.char.sitting = false;
    if (nw.held) { sys.held = nw.held; nw.held = null; }
    A.s.run = nw.s.run; A.s.crouch = nw.s.crouch; A.s.flashlight = nw.s.flashlight;
    // the follow relationship never carries over: both are independent now
    old.ai.setState(old.seat ? 'SEATED' : 'INDEPENDENT_IDLE', true);
    const pFrom = old.char.root.position.clone();
    this.i = 1 - this.i; this.apply();
    // camera: glide over, or fade if it's far / the other side of the front door
    const inside = this.inside(nw), spaceChange = inside !== !!g.indoors;
    if (spaceChange) g.house.setSpace(inside);
    const to = nw.char.root.position, C = g.cam;
    C.yawTo = nw.player.face + Math.PI;
    if (spaceChange || pFrom.distanceTo(to) > 25) {
      this.fade(); C.yaw = C.yawTo; C.target.copy(to).add(V3(0, 1.35, 0)); C.look = C.target.clone();
      g.camera.position.copy(to).add(V3(-Math.sin(nw.player.face) * C.dist, 2.2, -Math.cos(nw.player.face) * C.dist));
    } else g.camEase = 0.65;
    this.flashWho(`Playing as ${nw.name}`);
    g.audio?.chime?.(nw.key === 'Wren' ? 880 : 660);
    A.applyHands?.();
    return true;
  }
  /** park an item in a character's right hand (it stays there while they're not controlled) */
  toHand(item, ch) {
    const hand = ch.bones?.RightHand; if (!hand) return;
    const o = item.object; hand.add(o);
    const ws = new THREE.Vector3(); hand.getWorldScale(ws);
    o.scale.setScalar(item.baseScale / ws.x); o.position.copy(item.gripOffset).divideScalar(ws.x); o.quaternion.identity();
  }
  fade() { const f = $('flash'); if (!f) return; f.style.background = '#0b1a1e'; f.style.transition = 'none'; f.style.opacity = '0.9'; requestAnimationFrame(() => { f.style.transition = 'opacity 0.45s'; f.style.opacity = '0'; }); }

  // ------------------------------------------------------------------ H: whistle, J: stay here
  whistle() {
    const g = this.g; if (!g.started || g.photo) return;
    if (this.wT > 0) return;                       // no stacking whistles
    this.wT = 1.4; this.pk.whistle = 1.15;
    g.audio?.whistle?.();
    const b = this.other.ai;
    if (b.state === 'COMPANION_HANGOUT' || b.state === 'COMPANION_FOLLOW') { b.say('I\'m right here! 😊'); return; }
    b.call(true);
  }
  dismiss() {
    const g = this.g, b = this.other.ai; if (!g.started) return;
    if (!ENGAGED.has(b.state)) { this.showStatus(b, 'They\'re already doing their own thing'); return; }
    this.pk.dismiss = 0.9;
    b.dismiss();
  }
  /** the Talk menu's "Come with me" / "Wait here" use the same commands without the whistle */
  callQuiet() { this.other.ai.call(false); }

  // ------------------------------------------------------------------ UI
  flashWho(t) { const w = this.who; w.textContent = t; w.classList.remove('show'); void w.offsetWidth; w.classList.add('show'); clearTimeout(this._wt); this._wt = setTimeout(() => w.classList.remove('show'), 2200); }
  showStatus(b, override) {
    const [ico, txt] = STATUS[b.status || b.state] || ['', ''];
    const s = this.stat; s.innerHTML = `<span>${ico}</span><b>${b.m.name}</b> ${override || txt}`;
    s.classList.remove('show'); void s.offsetWidth; s.classList.add('show');
    clearTimeout(this._st); this._st = setTimeout(() => s.classList.remove('show'), 3500);
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g, C = g.cam;
    this.wT = Math.max(0, this.wT - dt);
    for (const k in this.pk) this.pk[k] = Math.max(0, this.pk[k] - dt);
    if (g.camEase > 0) {
      g.camEase -= dt;
      if (C.yawTo !== undefined && g.view !== 'first') { let d = C.yawTo - C.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); C.yaw += d * Math.min(1, dt * 7); }
    }
    // only people in the same space (beach / house) are drawn
    const o = this.other, same = this.inside(o) === this.inside(this.active);
    if (o.char.root.visible !== same) o.char.root.visible = same;
  }

  /** procedural overlay poses (called from the pose hook after the animation mixer) */
  pose(ch, rot) {
    const t = performance.now() / 1000;
    if (ch === this.active.char) {
      // whistle: hand to the mouth, head tilted
      const w = this.pk.whistle > 0 ? Math.min(1, Math.min(this.pk.whistle, 1.15 - this.pk.whistle) * 5) : 0;
      if (w > 0.01) { rot('RightArm', [1, 0, 0], -1.25 * w, ch); rot('RightArm', [0, 1, 0], 0.55 * w, ch); rot('RightForeArm', [1, 0, 0], -1.55 * w, ch); rot('Head', [0, 0, 1], 0.14 * w, ch); rot('Head', [1, 0, 0], -0.12 * w, ch); }
      // "stay here": a small friendly hand wave
      const d = this.pk.dismiss > 0 ? Math.min(1, Math.min(this.pk.dismiss, 0.9 - this.pk.dismiss) * 6) : 0;
      if (d > 0.01) { rot('RightArm', [0, 0, 1], -1.55 * d, ch); rot('RightForeArm', [0, 0, 1], (-0.5 + 0.4 * Math.sin(t * 14)) * d, ch); }
      return;
    }
    const b = this.other.ai; if (ch !== b.c) return;
    b.pose(rot, t);
  }
}

// ------------------------------------------------------------------ the character you're not playing
class Buddy {
  constructor(party, m) {
    this.P = party; this.m = m; this.g = party.g;
    this.vel = V3(0, 0, 0); this.face = 0; this.vy = 0;
    this.state = 'INDEPENDENT_IDLE'; this.t = 0; this.status = null;
    this.path = null; this.wi = 0; this.planGoal = null; this.planT = 0; this.stuck = { t: 0, p: null, n: 0 };
    this.idle = { next: 2 + Math.random() * 4, kind: null, until: 0, shift: 0, shiftTo: 0, arms: 0 };
    this.k = { wave: 0, arms: 0 };     // pose weights
    this.waveT = 0; this.dancing = false; this.talking = false; this.danceK = 0;
  }
  get c() { return this.m.char; }
  get body() { return this.m.body; }
  get pos() { return this.body.feet; }
  get leader() { return this.P.active.player; }
  get follow() { return ENGAGED.has(this.state); }
  set follow(v) { if (v) this.call(false); else this.dismiss(); }
  get inside() { return this.P.inside(this.m); }

  setState(s, quiet) {
    if (s === this.state && !quiet) return;
    this.state = s; this.t = 0; this.status = null;
    if (!quiet) this.P.showStatus(this);
  }
  /** the player stopped controlling this character */
  takeOver(player) { this.face = player.face; this.vel.set(0, 0, 0); this.vy = 0; this.path = null; this.dancing = this.talking = false; }
  /** the player takes control of this character */
  release() { this.path = null; this.c.lookTarget = null; this.k.arms = 0; this.k.wave = 0; this.idle.kind = null; }

  call(whistled) {
    if (this.m.seat) this.standUp();
    this.path = null; this.stuck = { t: 0, p: null, n: 0 };
    this.setState('RESPONDING_TO_WHISTLE');
    this.reactT = whistled ? 0.9 : 0.35;
    if (whistled) setTimeout(() => this.say(['Coming! 👋', 'On my way!', 'Be right there!'][Math.floor(Math.random() * 3)]), 350);
  }
  dismiss() {
    this.path = null;
    this.setState('INDEPENDENT_IDLE');
    this.say(['Okay! I\'ll hang out here.', 'Sure, see you soon!', 'Okay! 👍'][Math.floor(Math.random() * 3)]);
  }
  standUp() {
    const s = this.m.seat; if (!s) return;
    this.m.seat = null; this.c.sitting = false;
    const p = s.seatPose(), f = s.facing;
    this.body.teleport(p.x + Math.sin(f) * 0.55, p.y - (s.seatY - 0.42) - 0.42 + 0.05, p.z + Math.cos(f) * 0.55);
    this.face = f;
  }
  say(t) { const g = this.g; if (!g.speech) return; const b = $('speech')?.querySelector('b'); if (b) b.textContent = this.m.name; g.speech.show(t, 2.2); }
  wave() { if (this.c.actions?.Wave) this.c.play('Wave', { fadeIn: 0.15 }); else this.waveT = 1.8; }
  cheer() {
    if (this.c.busy || !this.body.grounded || this.m.player.waterDepth(this.pos) > 0.15 || this.pos.distanceTo(this.leader.pos) > 14) return;
    const flip = Math.random() < 0.5;
    this.vy = flip ? 7.8 : 7.2;
    this.c.play(flip ? 'Backflip' : 'Jump', flip ? { from: 0.58, to: 1.55, timeScale: 1.05 } : { from: 0.5, to: 1.3, timeScale: 1.05 });
  }

  // ------------------------------------------------------------------ thinking
  update(dt) {
    this.t += dt; this.waveT = Math.max(0, this.waveT - dt);
    const g = this.g, me = this.pos, L = this.leader, lp = L.pos;
    const same = this.inside === this.P.inside(this.P.active);
    const dist = same ? Math.hypot(lp.x - me.x, lp.z - me.z) : Infinity;
    // seated: stay put on the chair until called
    if (this.m.seat) {
      if (this.state !== 'SEATED') this.setState('SEATED', true);
      const p = this.m.seat.seatPose(); this.c.sitting = true;
      this.c.update(dt, 0); this.c.root.position.copy(p); this.c.root.rotation.set(0, this.m.seat.facing, 0); this.face = this.m.seat.facing;
      this.idleThink(dt, false); return;
    }
    let goal = null;
    switch (this.state) {
      case 'RESPONDING_TO_WHISTLE': {
        // stop, turn toward the sound, acknowledge, then set off
        if (same) this.turnTo(Math.atan2(lp.x - me.x, lp.z - me.z), dt, 6);
        if (this.t > 0.2 && !this._waved) { this._waved = true; if (same && dist < 25) this.wave(); }
        if (this.t > this.reactT) { this._waved = false; this.setState('NAVIGATING_TO_PLAYER'); }
        break;
      }
      case 'NAVIGATING_TO_PLAYER':
        if (same && dist < STOP_FOLLOW + 0.3 && this.lineOfSight(lp)) { this.setState('COMPANION_HANGOUT'); break; }
        goal = this.goalNear(lp); break;
      case 'COMPANION_HANGOUT':
        if (!same || dist > START_FOLLOW) { this.setState('COMPANION_FOLLOW', true); this.P.showStatus(this); break; }
        break;
      case 'COMPANION_FOLLOW':
        if (same && dist < STOP_FOLLOW && this.lineOfSight(lp)) { this.setState('COMPANION_HANGOUT', true); break; }
        goal = this.goalNear(lp); break;
    }
    // where to walk this frame
    let want = V3(0, 0, 0), speed = 0;
    if (goal && !this.talking && !this.dancing) {
      const v = this.steer(goal, same ? dist : 99, dt);
      if (v) { want = v.dir; speed = v.speed; }
    }
    this.move(want, speed, dt);
    const idle = speed < 0.1 && Math.hypot(this.vel.x, this.vel.z) < 0.3;
    if (this.talking || this.dancing) { if (same) this.turnTo(Math.atan2(lp.x - me.x, lp.z - me.z), dt, 5); }
    this.idleThink(dt, idle, same && ENGAGED.has(this.state) ? lp : null);
  }

  /** a comfortable spot ~1.8 m from the player on our side, never on top of them */
  goalNear(lp) {
    const me = this.pos, d = V3(me.x - lp.x, 0, me.z - lp.z); const l = d.length() || 1;
    return lp.clone().addScaledVector(d.divideScalar(l), 1.8);
  }
  lineOfSight(p) {
    const g = this.g; if (!g.rayHit) return true;
    const a = this.pos.clone().add(V3(0, 1.0, 0)), b = p.clone().add(V3(0, 1.0, 0)), dir = b.clone().sub(a), len = dir.length();
    if (len < 0.3) return true;
    const h = g.rayHit(a, dir.divideScalar(len), len); return !h || h.toi > len - 0.3;
  }

  /** path following with replanning, door crossing, stuck detection */
  steer(goal, dist, dt) {
    const g = this.g, me = this.pos, H = g.house;
    const leaderInside = this.P.inside(this.P.active), mine = this.inside;
    // different side of the front door: walk to the door and go through it
    if (mine !== leaderInside) {
      const door = mine ? H.world(0, 0.05, 4.5) : H.doorOutside.clone().add(V3(0, 0, 1.4));
      if (!mine) door.y = g.groundFn(door.x, door.z);
      if (Math.hypot(door.x - me.x, door.z - me.z) < 0.9) {
        const out = mine ? H.doorOutside.clone().add(V3(0.8, 0, 1.6)) : H.world(0.8, 0.05, 3.8);
        if (mine) out.y = g.groundFn(out.x, out.z) + 0.1;
        this.body.teleport(out.x, out.y + 0.05, out.z); this.path = null; this.g.audio?.house?.('door', true);
        return null;
      }
      goal = door;
    }
    // replan when there's no path, the goal moved a lot, or we're stuck
    const goalMoved = !this.planGoal || this.planGoal.distanceTo(goal) > 1.5;
    this.planT -= dt;
    if (!this.path || (goalMoved && this.planT <= 0)) this.replan(goal);
    if (this.status === 'UNREACHABLE') return null;
    // follow the waypoints
    let wp = this.path?.[this.wi];
    while (wp && Math.hypot(wp.x - me.x, wp.z - me.z) < (mine ? 0.3 : 0.55) && this.wi < this.path.length - 1) wp = this.path[++this.wi];
    if (!wp) wp = goal;
    const dir = V3(wp.x - me.x, 0, wp.z - me.z); const l = dir.length();
    const toGoal = Math.hypot(goal.x - me.x, goal.z - me.z);
    if (l < 0.05 || (this.wi >= (this.path?.length || 1) - 1 && toGoal < 0.35)) return null;
    // stuck?
    const S = this.stuck; S.t += dt;
    if (S.t > 1.5) { const moved = S.p ? Math.hypot(S.p.x - me.x, S.p.z - me.z) : 1; S.p = me.clone(); S.t = 0; if (moved < 0.25) { S.n++; this.P.nav.invalidate(); this.openDoors(); this.path = null; if (S.n > 3) this.giveUp(); } else S.n = 0; }
    // pace: jog when far, walk when close; ease in after acknowledging
    const far = Math.min(dist, toGoal + (mine !== leaderInside ? 10 : 0));
    let speed = far > 9 ? 4.2 : far > 4 ? 2.6 : 1.5;
    if (this.state === 'NAVIGATING_TO_PLAYER' && this.t < 0.8) speed *= 0.4 + this.t * 0.75;
    return { dir: dir.divideScalar(l), speed };
  }
  replan(goal) {
    const P = this.P, mine = this.inside;
    this.planGoal = goal.clone(); this.planT = 1.0; this.wi = 1;
    let path = P.nav.path(this.pos, goal, mine);
    if (!path && mine) { this.openDoors(); P.nav.invalidate(); path = P.nav.path(this.pos, goal, mine); }
    if (!path && !mine && this.pos.distanceTo(goal) > 60) path = [this.pos.clone(), goal.clone()];   // far across the beach: head that way, replan when closer
    if (!path) { this.failures = (this.failures || 0) + 1; if (this.failures > 2) this.giveUp(); this.path = [this.pos.clone(), goal.clone()]; return; }
    this.failures = 0; this.path = path;
  }
  /** a closed room door in the way: open it like a person would */
  openDoors() {
    const sys = this.g.interact; if (!sys) return;
    for (const x of sys.list) {
      if (!/(^|_)(door)(_|$)|kitchen_door|pantry_door/.test(x.id) || x.isOpen || x.constructor.name !== 'Hinge') continue;
      if (x.anchor(V3(0, 0, 0)).distanceTo(this.pos) > 6) continue;
      const v = x.verb(sys); if (v && !v.disabled) { try { v.run(sys); } catch (e) { /* ignore */ } }
    }
  }
  giveUp() {
    this.path = null; this.status = 'UNREACHABLE'; this.P.showStatus(this);
    this.say('I can\'t find a way over there! 🤔');
    this.state = 'INDEPENDENT_IDLE'; this.t = 0; setTimeout(() => { this.status = null; }, 1500);
  }

  turnTo(yaw, dt, rate) { let a = yaw - this.face; a = Math.atan2(Math.sin(a), Math.cos(a)); this.face += a * Math.min(1, dt * rate); }

  /** the same kinematic body and blend-tree animation the player uses: no sliding, no floating */
  move(dir, speed, dt) {
    const me = this.pos, wp = this.m.player;
    const depth = wp.waterDepth(me);
    this.c.swimming = depth > 1.05;
    const tv = dir.clone().multiplyScalar(this.c.swimming ? Math.min(speed, 2.2) : depth > 0.45 ? speed * 0.65 : speed);   // swim / wade slower, like the player
    const k = Math.min(1, dt * (speed > 0 ? 5 : 7)); this.vel.x += (tv.x - this.vel.x) * k; this.vel.z += (tv.z - this.vel.z) * k;
    if (this.body.grounded && this.vy <= 0) this.vy = -2; else this.vy -= (depth > 0.9 ? 6 : 22) * dt;
    if (depth > 1.15) this.vy = Math.max(this.vy, (wp.waterLevelAt(me) - 1.15 - me.y) * 4);
    this.body.move(V3(this.vel.x * dt, this.vy * dt, this.vel.z * dt));
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) this.turnTo(Math.atan2(this.vel.x, this.vel.z), dt, 7);
    this.c.setWet?.(depth, dt);
    this.c.update(dt, hs);
    this.c.root.position.copy(this.pos);
    this.c.root.rotation.set(0, this.face, 0);
  }

  /** calm, mostly-still idling: look around now and then, shift weight, sometimes fold arms */
  idleThink(dt, idle, friendPos) {
    const I = this.idle, c = this.c;
    I.next -= dt; I.until -= dt;
    if (!idle) { c.lookTarget = friendPos && Math.random() < 0.5 ? friendPos.clone().add(V3(0, 1.4, 0)) : null; I.kind = null; this.k.arms += (0 - this.k.arms) * Math.min(1, dt * 4); return; }
    if (I.until <= 0 && I.kind) { I.kind = null; c.lookTarget = null; }
    if (I.next <= 0) {
      I.next = 3.5 + Math.random() * 7;
      const r = Math.random(), me = this.pos;
      if (friendPos && r < 0.4) { I.kind = 'friend'; I.until = 2 + Math.random() * 2.5; c.lookTarget = friendPos.clone().add(V3(0, 1.4, 0)); this.turnGoal = Math.atan2(friendPos.x - me.x, friendPos.z - me.z); }
      else if (r < 0.62) { const a = this.face + (Math.random() - 0.5) * 2.4; I.kind = 'look'; I.until = 1.5 + Math.random() * 2; c.lookTarget = me.clone().add(V3(Math.sin(a) * 3, 1.2 + (Math.random() - 0.4) * 0.8, Math.cos(a) * 3)); }
      else if (r < 0.8) { I.shiftTo = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4); }
      else if (r < 0.88 && !this.m.seat && !this.c.swimming) { I.kind = 'arms'; I.until = 5 + Math.random() * 4; }
      // otherwise: simply stand still
    }
    if (this.turnGoal !== undefined && I.kind === 'friend') this.turnTo(this.turnGoal, dt, 1.8);
    I.shift += (I.shiftTo - I.shift) * Math.min(1, dt * 0.8);
    this.k.arms += ((I.kind === 'arms' ? 1 : 0) - this.k.arms) * Math.min(1, dt * 2.5);
  }

  pose(rot, t) {
    const c = this.c, I = this.idle;
    this.k.wave += ((this.waveT > 0 ? 1 : 0) - this.k.wave) * 0.15;
    if (this.k.wave > 0.01) { const w = this.k.wave; rot('RightArm', [0, 0, 1], -2.4 * w, c); rot('RightForeArm', [0, 0, 1], (-0.3 + 0.45 * Math.sin(t * 11)) * w, c); }
    if (this.m.seat || this.dancing) return;
    // weight shift and breathing (tiny)
    rot('Hips', [0, 0, 1], 0.045 * I.shift, c); rot('Spine01', [0, 0, 1], -0.03 * I.shift, c);
    rot('Spine01', [1, 0, 0], 0.012 * Math.sin(t * 1.7), c);
    // arms folded loosely across the tummy
    const a = this.k.arms;
    if (a > 0.01) {
      rot('RightArm', [1, 0, 0], -0.35 * a, c); rot('LeftArm', [1, 0, 0], -0.35 * a, c);
      rot('RightForeArm', [1, 0, 0], -1.35 * a, c); rot('LeftForeArm', [1, 0, 0], -1.35 * a, c);
      rot('RightForeArm', [0, 1, 0], -0.9 * a, c); rot('LeftForeArm', [0, 1, 0], 0.9 * a, c);
    }
  }
}
