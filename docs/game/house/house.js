// The Enchanted Island House: the inside of the clubhouse.
//
// Floor 1: the foyer, the kitchen and the walk-in pantry.
//   - the front door outside (on the clubhouse) and inside both work: E to go in or out
//   - the kitchen (Option A, sage & copper; see kitchen.js and appliances.js): 48" range
//     with burners, griddle and two ovens, copper hood (light + 3-speed fan), built-in
//     fridge and freezer, farmhouse sink (hot/cold, stopper), dishwasher, microwave
//     drawer, coffee station, island with stools, round oak table with chairs
//   - the walk-in pantry: oak shelves with LED strips, jars, cereal, toaster, light switch
//   - activities: cupcakes, hot cocoa, coffee for the grown-ups, washing dishes, toast
//   - everything you move or open is saved
//
// The interior is built once, out of sight high above the island (HOUSE_ORIGIN), and
// shown when you step through the door. Rooms use metres; local x = east, local z = south.
import * as THREE from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { Builder, makeMaterials, C } from './kit.js';
import { buildDoor } from './parts.js';
import { InteractionSystem, Interactable, Item, Slot, Seat, CLIP_RANGES } from './interact.js';
import { prop, simple, cyl } from './props.js';
import { buildShell, buildKitchen, updateKitchen } from './kitchen.js';
import { V, H } from '../world.js';

export const HOUSE_ORIGIN = new THREE.Vector3(0, 400, -400);
export const HOUSE_MODELS = ['SM_Kitchen_Cupcake', 'SM_Kitchen_MilkBottle', 'SM_Kitchen_JuiceJug', 'SM_Kitchen_Apple', 'SM_Kitchen_Cheese', 'SM_Kitchen_Strawberries',
  'SM_Kitchen_Mug', 'SM_Kitchen_MixingBowl', 'SM_Kitchen_CookieJar', 'SM_Kitchen_Teapot', 'SM_Kitchen_FruitBowl', 'SM_Kitchen_FlourSack',
  'SM_House_Monstera', 'SM_Kitchen_CopperPots',
  'SM_Kitchen_EspressoMachine', 'SM_Kitchen_Grinder', 'SM_Kitchen_Skillet', 'SM_Kitchen_DutchOven', 'SM_Kitchen_Herbs', 'SM_Kitchen_StandMixer'];
export const HOUSE_TEXTURES = ['T_Wall_Plaster', 'T_Cabinet_Turquoise', 'T_Honey_Wood', 'T_Window_View', 'T_Art_Fruit', 'T_Art_Turtle',
  'T_Oak_Floor', 'T_Sage_Cabinet', 'T_Limestone_Tile', 'T_Soapstone', 'T_Limewash', 'T_Aged_Copper', 'T_White_Oak', 'T_Cereal_Boxes', 'T_Cookbook', 'T_Countertop_Marble', 'T_Zellige_Tile', 'T_Hickory_Floor'];

export class House {
  constructor(game, scene, A, physics) {
    this.game = game; this.scene = scene; this.A = A;
    this.root = new THREE.Group(); this.root.name = 'house'; this.root.position.copy(HOUSE_ORIGIN); this.root.visible = false;
    scene.add(this.root); this.root.updateMatrixWorld(true);
    this.M = makeMaterials(A.textures);
    this.b = new Builder(this.root, physics); this.b.mats = this.M;
    this.sys = game.interact || (game.interact = new InteractionSystem(game, scene));
    this.indoors = false;
    this.sys.saveKey = 'hg.save.house.v2';      // the kitchen was rebuilt: old saves no longer fit
    this.windows = [];
    buildShell(this);
    const bowl = buildKitchen(this);
    this.buildCupcakes(bowl);
    this.buildFoyer();
    this.buildLights();
    this.buildExteriorDoor();
    this.sys.extraSave = () => ({ recipe: this.recipe.save(), cupcakes: this.cupcakes.filter(c => c.live).length });
    this.sys.extraLoad = d => { this.recipe.load(d.recipe); };
  }

  local(x, y, z) { return new THREE.Vector3(x, y, z); }
  world(x, y, z) { return new THREE.Vector3(x, y, z).add(HOUSE_ORIGIN); }

  buildCupcakes(bowl) {
    const sys = this.sys, A = this.A, R = this.root;
    this.recipe = new CupcakeRecipe(this, bowl);
    sys.add(this.recipe);
    this.cupcakes = [];
    for (let i = 0; i < 3; i++) {
      const c = new Item({ id: `cupcake_${i}`, name: 'cupcake', object: prop(A, 'SM_Kitchen_Cupcake', 0.09, cyl(0.035, 0.08, C.pink)), tags: ['food', 'edible', 'cupcake'],
        use: (s, it) => ({ label: 'Eat the cupcake', clip: 'PickUp', run: () => this.eat(it) }) });
      c.baseScale = c.object.baseScale; c.state = { live: false };
      c.onState = () => { c.object.visible = !!c.state.live; };
      Object.defineProperty(c, 'live', { get: () => !!c.state.live, set: v => { c.state.live = v; c.onState(); } });
      c.object.visible = false;
      c.verb = function (s) { return this.live ? Item.prototype.verb.call(this, s) : null; };
      sys.add(c); R.add(c.object);
      this.cupcakes.push(c);
    }
  }

  /** eat food: crumbs, a happy sound, and the item goes away (fruit returns to its home later) */
  eat(it) {
    const sys = this.sys; const p = sys.handPos();
    for (let i = 0; i < 16; i++) this.game.fxGlow?.emit(p, new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2), { life: 0.7, size: 0.05, gravity: 5, color: [1, 0.85, 0.6] });
    sys.sfx('eat'); sys.toast(`Yum! ${it.name[0].toUpperCase() + it.name.slice(1)} eaten.`);
    sys.held = null; it.held = false;
    if (it.tags.has('cupcake')) { it.live = false; this.root.add(it.object); }
    else if (it.home) { sys.place(it, it.home); it.object.visible = true; }   // a fresh one appears back in the fridge
    this.game.friend?.cheer?.();
    sys.changed();
  }

  buildFoyer() {
    const b = this.b, M = this.M, sys = this.sys;
    // staircase up to floor 2 (built next milestone): visible steps, blocked by a rope
    for (let i = 0; i < 10; i++) { const top = (i + 1) * 0.2; b.box(M.wood, [-2.75 + i * 0.3, top / 2, 0.57], [0.3, top, 0.9], { round: 0.02 }); }
    b.box(M.teak, [-1.4, 1.05, 1.06], [3.0, 0.06, 0.06], { collide: false });           // handrail
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), M.coral); rope.rotation.x = Math.PI / 2; rope.position.set(-3.0 + 0.15, 0.85, 0.6); this.root.add(rope);
    { const c = new THREE.Mesh(); c.visible = false; c.position.set(-1.4, 1.2, 1.15); this.root.add(c); b.solid(c, 3.2, 2.4, 0.12); }   // keeps you off the unfinished stairs
    const sign = new Interactable({ id: 'foyer_stairs', name: 'stairs', object: this.root, anchor: [-1.5, 1.0, 1.2], save: false });
    sign.verb = s => ({ label: 'Upstairs is still being built', disabled: true, run: () => s.toast('The bedrooms, playroom and rooftop telescope are coming next!') });
    sys.add(sign);
    // west door: living room (next milestone)
    const west = buildDoor(b, M, sys, { id: 'foyer_living_door', name: 'living room door', at: this.local(-3, 0, 3), rotY: Math.PI / 2, w: 1.0, h: 2.2, swing: -95 });
    west.hinge.requires = () => 'The living room opens soon!';
    // the inside of the front door: go back out to the beach
    const front = new THREE.Group(); front.position.set(0, 0, 6); this.root.add(front);
    b.box(M.wood, [0, 1.15, 0.03], [1.18, 2.3, 0.06], { parent: front, collide: true, round: 0.02 });
    b.box(M.cabinet, [0, 1.6, -0.005], [0.8, 0.9, 0.01], { parent: front, collide: false });
    const kb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), M.brass); kb.position.set(0.45, 1.05, -0.03); front.add(kb);
    const out = new Interactable({ id: 'house_front_inside', name: 'front door', object: front, anchor: [0, 1.1, -0.2], save: false, radius: 2.0 });
    out.verb = () => ({ label: 'Go outside to the beach', clip: 'OpenDoor', run: () => this.exit() });
    sys.add(out);
    // a bench and a doormat
    b.box(M.wood, [2.0, 0.24, 4.8], [1.2, 0.08, 0.4], { round: 0.02 });
    for (const x of [1.5, 2.5]) b.box(M.teak, [x, 0.1, 4.8], [0.08, 0.2, 0.36], { collide: false });
    b.box(M.coral, [0, 0.005, 5.4], [1.3, 0.01, 0.8], { collide: false, cast: false });
  }

  buildLights() {
    const R = this.root;
    this.lights = [];
    // soft recessed ceiling light over the kitchen (always a little on), foyer lamp
    const k1 = new THREE.PointLight(0xffe6c4, 0, 8, 1.5); k1.position.set(5.3, 3.5, 1.5); R.add(k1); this.lights.push([k1, 5]);
    const k2 = new THREE.PointLight(0xffe6c4, 0, 8, 1.5); k2.position.set(10.2, 3.5, 2.5); R.add(k2); this.lights.push([k2, 5]);
    const foy = new THREE.PointLight(0xffd29a, 0, 7, 1.6); foy.position.set(0, 2.7, 3); R.add(foy); this.lights.push([foy, 7]);
    // warm bounce light
    this.fill = new THREE.HemisphereLight(0xfff0dc, 0x6b5a40, 0); this.fill.position.copy(HOUSE_ORIGIN); this.scene.add(this.fill);
  }

  /** the clubhouse's real front door on the beach: E to go inside */
  buildExteriorDoor() {
    const z = this.game.zone, c = z.clubhouse;
    const p = this.doorOutside = z.house?.door ? V(z.house.door[0], z.house.door[1]) : V(c.pos[0], c.pos[1] - 11.4);
    const anchor = new THREE.Object3D(); anchor.position.copy(p); this.scene.add(anchor);
    const door = new Interactable({ id: 'house_front_outside', name: 'front door', object: anchor, anchor: [0, 1.0, 0], save: false, radius: 2.4 });
    door.verb = () => this.indoors ? null : { label: 'Go inside the house', clip: 'OpenDoor', run: () => this.enter() };
    this.sys.add(door);
  }

  // --------------------------------------------------------------- going in and out
  setOutdoorsVisible(v) {
    if (!this.outdoor) {
      const keep = new Set([this.root, this.fill, this.game.sky.sky, this.game.sky.stars, this.game.sky.moon, this.game.sky.sun, this.game.sky.sun.target, this.game.sky.fill, this.game.sky.moonLight,
        this.game.wren.root, this.game.friend?.c.root, this.sys.marker, ...['fxWater', 'fxGlow', 'fxHeart', 'fxFoam'].map(k => this.game[k]?.sprite)].filter(Boolean));
      this.outdoor = this.scene.children.filter(o => !keep.has(o) && !o.isCamera);
    }
    for (const o of this.outdoor) o.visible = v;
  }

  fade(cb) {
    const f = document.getElementById('flash'); f.style.background = '#1b1410'; f.style.transition = 'opacity 0.25s'; f.style.opacity = '1';
    setTimeout(() => { cb(); setTimeout(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = '0'; }, 120); }, 260);
  }

  enter() {
    this.sys.sfx('door', true);
    this.fade(() => this.goInside());
  }
  goInside() {
    const g = this.game, P = g.player;
    this.indoors = true; g.indoors = true; P.indoors = true;
    this.root.visible = true; this.setOutdoorsVisible(false);
    const s = this.world(0, 0.05, 3.9);
    P.body.teleport(s.x, s.y, s.z); P.vel.set(0, 0, 0); P.face = Math.PI;
    if (g.friend) { g.friend.body.teleport(s.x + 0.9, s.y, s.z - 0.4); g.friend.vel.set(0, 0, 0); }
    g.cam.yaw = 0; g.cam.pitch = 0.32; g.cam.dist = 3.6;
    g.cam.target.copy(s).add(new THREE.Vector3(0, 1.35, 0));
    g.camera.position.copy(s).add(new THREE.Vector3(0, 2.3, 3.2));
    g.scene.fog.density = 0.002;
    this.sys.changed();
    g.toast('Welcome home! The kitchen is through the door on the right.');
    if (!this._welcomed) { this._welcomed = true; setTimeout(() => g.speech?.say('house', { force: true }), 1800); }
  }
  exit() { this.fade(() => this.goOutside()); }
  goOutside() {
    const g = this.game, P = g.player;
    this.indoors = false; g.indoors = false; P.indoors = false;
    this.root.visible = false; this.setOutdoorsVisible(true);
    const p = this.doorOutside.clone().add(new THREE.Vector3(0, 0, 1.4));
    p.y = H(p.x, -p.z) + 0.1;
    P.body.teleport(p.x, p.y, p.z); P.vel.set(0, 0, 0); P.face = 0;
    if (g.friend) g.friend.body.teleport(p.x + 1, p.y, p.z + 0.6);
    g.cam.yaw = 0; g.cam.pitch = 0.28; g.cam.dist = 6.5;
    g.cam.target.copy(p).add(new THREE.Vector3(0, 1.35, 0));
    g.camera.position.copy(p).add(new THREE.Vector3(0, 2.5, 6));
    g.scene.fog.density = g._outFog || 0.0009;
    this.sys.changed();
  }

  // --------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game;
    // lamps: brighter at night, always a little on inside
    const night = 1 - THREE.MathUtils.smoothstep(g.sky.elevation, -2, 18);
    for (const [l, base] of this.lights) l.intensity = this.indoors ? base * (0.45 + night * 0.9) : 0;
    this.fill.intensity = this.indoors ? 0.55 + night * 0.15 : 0;
    for (const p of this.pendants) p.light.intensity = this.indoors && this.pendantSwitch.on ? 7 * (0.6 + night * 0.6) : 0;
    for (const l of this.underLights) l.intensity = this.indoors && this.underSwitch.on ? 1.6 : 0;
    updateKitchen(this, dt);
    this.recipe.update(dt);
  }
}

// ------------------------------------------------------------------ cupcake activity
class CupcakeRecipe extends Interactable {
  constructor(house, bowl) {
    super({ id: 'recipe_cupcake', name: 'cupcakes', object: bowl.object, anchor: [0, 0.1, 0], radius: 1.6, save: false });
    this.house = house; this.bowl = bowl;
    this.s = { flour: false, milk: false, stirred: false, baked: false };
    this.stirT = 0;
    // batter inside the bowl (two looks: lumpy mix, smooth golden batter)
    const disk = this.batter = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.04, 24), new THREE.MeshStandardNodeMaterial({ roughness: 0.6, color: 0xf3e3c3 }));
    disk.visible = false; bowl.object.add(disk); this.syncBatter();
    // a slot inside the bowl for ingredients (only while the bowl sits on the counter or table)
    const sys = house.sys;
    this.slot = sys.addSlot(new Slot({ id: 'bowl_in', name: 'into the bowl', parent: bowl.object, pos: [0, 0.06 / bowl.baseScale, 0], radius: 1.6,
      enabled: () => !bowl.held && !this.s.stirred && !!bowl.slot && !bowl.slot.id.includes('rack'),
      accepts: it => (it.tags.has('flour') && !this.s.flour) || (it.tags.has('milk') && !this.s.milk),
      onPut: (it, s) => this.add(it, s) }));
    // the oven turns stirred batter into cupcakes
    house.oven.state.onDone = () => this.bake();
  }
  syncBatter() {
    const s = this.s, b = this.batter, inv = 1 / (this.bowl.baseScale || 1);
    b.visible = s.flour || s.milk; b.scale.setScalar(inv); b.position.y = 0.065 * inv;
    b.material.color.set(s.stirred ? 0xe8b75a : s.flour && s.milk ? 0xf3e3c3 : s.flour ? 0xfbf6ec : 0xffffff);
    this.bowl.tags[s.stirred ? 'add' : 'delete']('bakeable');
  }
  add(it, sys) {
    const k = it.tags.has('flour') ? 'flour' : 'milk';
    this.s[k] = true; this.syncBatter();
    sys.toast(this.s.flour && this.s.milk ? 'Flour and milk are in! Now stir it with a wooden spoon.' : k === 'flour' ? 'Flour in! Add some milk from the fridge.' : 'Milk in! Add some flour from the pantry.');
    sys.sfx('pour');
    // the ingredient hops back out onto the nearest free counter spot
    setTimeout(() => {
      if (it.slot !== this.slot) return;
      let best = null, bd = 9; const p = this.slot.world();
      for (const s of sys.slots.values()) { if (s.item || s === this.slot || !s.enabled() || !s.id.includes('top')) continue; const d = s.world().distanceTo(p); if (d < bd) { bd = d; best = s; } }
      const target = best || it.home;
      this.slot.item = null; sys.flyTo(it, () => target.world(), () => { sys.place(it, target); sys.changed(); });
    }, 700);
  }
  verb(sys) {
    const s = this.s, bowl = this.bowl;
    if (bowl.held || !bowl.slot || this.stirT > 0) return null;
    if (s.flour && s.milk && !s.stirred) {
      if (sys.held?.tags.has('spoon')) return { label: 'Stir the batter', clip: 'PickUp', run: () => this.stir(sys) };
      return { label: 'Stir it: get the wooden spoon from the drawer', disabled: true, run: () => sys.toast('The wooden spoon is in the top drawer at the end of the island.') };
    }
    return null;
  }
  stir(sys) {
    this.stirT = 2.2; sys.sfx('stir');
    sys.toast('Stir, stir, stir…');
  }
  update(dt) {
    const sys = this.house.sys;
    if (this.stirT > 0) {
      this.stirT -= dt;
      const sp = sys.held; if (sp?.tags.has('spoon')) { sp.object.rotation.y += dt * 12; }
      this.batter.rotation.y += dt * 8;
      if (this.stirT <= 0) {
        this.s.stirred = true; this.syncBatter();
        sys.toast('Smooth batter! Put the bowl in the big oven (the right one), close it and turn its red knob.');
        sys.changed();
      }
    }
  }
  bake() {
    const sys = this.house.sys, ov = this.house.oven, g = this.house.game;
    sys.sfx('ding');
    const item = ov.slot.item;
    if (!item || item !== this.bowl || !this.s.stirred) { sys.toast('Ding! (Nothing to bake.)'); return; }
    // the bowl goes back to the counter, washed; three cupcakes appear on the oven tray
    this.s = { flour: false, milk: false, stirred: false, baked: true }; this.syncBatter();
    sys.place(this.bowl, this.bowl.home.item ? [...sys.slots.values()].find(s => !s.item && s.id.includes('island_top')) || this.bowl.home : this.bowl.home);
    const tray = ov.slot; let first = true;
    for (const c of this.house.cupcakes) {
      if (c.live) continue;
      c.live = true;
      if (first) { sys.place(c, tray); first = false; }
      else {
        const free = this.house.tableSlots.find(s => !s.item) || [...sys.slots.values()].find(s => !s.item && s.id.includes('top'));
        if (free) sys.place(c, free);
      }
    }
    sys.toast('Cupcakes are ready! One is in the oven and the rest are on the table.');
    g.wren.play('Cheer', CLIP_RANGES.Cheer); g.friend?.cheer?.(); g.speech?.say('cupcakes', { force: true });
    g.audio?.chime?.(988);
    sys.changed();
  }
  save() { return this.s; }
  load(s) { if (s) { this.s = { ...this.s, ...s }; this.syncBatter(); } }
}
