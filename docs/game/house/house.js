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
import { Cooking, TIMES } from './cooking.js';
import { stockKitchen, placeName } from './stock.js';
import { Focus } from './focus.js';
import { RecipeBook } from './recipebook.js';
import { ITEM_DEFS } from './items.js';
import { V, H } from '../world.js';

export const HOUSE_ORIGIN = new THREE.Vector3(0, 400, -400);
export const HOUSE_MODELS = ['SM_Kitchen_Cupcake', 'SM_Kitchen_MilkBottle', 'SM_Kitchen_JuiceJug', 'SM_Kitchen_Apple', 'SM_Kitchen_Cheese', 'SM_Kitchen_Strawberries',
  'SM_Kitchen_Mug', 'SM_Kitchen_MixingBowl', 'SM_Kitchen_CookieJar', 'SM_Kitchen_Teapot', 'SM_Kitchen_FruitBowl', 'SM_Kitchen_FlourSack',
  'SM_House_Monstera', 'SM_Kitchen_CopperPots',
  'SM_Kitchen_EspressoMachine', 'SM_Kitchen_Grinder', 'SM_Kitchen_Skillet', 'SM_Kitchen_DutchOven', 'SM_Kitchen_Herbs', 'SM_Kitchen_StandMixer'];
export const HOUSE_TEXTURES = ['T_Wall_Plaster', 'T_Cabinet_Turquoise', 'T_Honey_Wood', 'T_Window_View', 'T_Art_Fruit', 'T_Art_Turtle',
  'T_Oak_Floor', 'T_Sage_Cabinet', 'T_Limestone_Tile', 'T_Soapstone', 'T_Limewash', 'T_Aged_Copper', 'T_White_Oak', 'T_Cereal_Boxes', 'T_Cookbook', 'T_Countertop_Marble', 'T_Zellige_Tile', 'T_Natural_Oak_Floor'];

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

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
    this.itemDefs = ITEM_DEFS;
    if (!scene.children.includes(game.camera)) scene.add(game.camera);     // so things held in first person render
    const bowl = buildKitchen(this);
    this.bowl = bowl;
    this.buildCupcakes(bowl);
    this.cooking = new Cooking(this);
    stockKitchen(this);
    this.tagLegacyItems();
    this.focus = new Focus(this);
    this.buildFocusViews();
    this.recipeBook = new RecipeBook(this);
    this.buildMitts();
    for (const ov of this.range.ovens) ov.state.onDone = () => this.bakeIn(ov);
    this.buildFoyer();
    this.buildLights();
    this.buildExteriorDoor();
    this.sys.extraSave = () => ({ cooking: this.cooking.save(), book: this.recipeBook.save(), mitts: !!this.game.mitts });
    this.sys.extraLoad = d => { this.cooking.load(d.cooking); this.recipeBook.load(d.book); if (d.mitts) this.wearMitts(this.items.oven_mitts_mitts || this.mittsItem, true); for (const it of this.sys.items.values()) { if (it.state.gone) { it.object.visible = false; if (it.slot) { it.slot.item = null; it.slot = null; } } if (it.state.chopped) this.cooking.applyChopped(it); if (it.state.c) this.cooking.syncVisual(it); } };
  }

  local(x, y, z) { return new THREE.Vector3(x, y, z); }
  world(x, y, z) { return new THREE.Vector3(x, y, z).add(HOUSE_ORIGIN); }

  buildCupcakes(bowl) {
    const sys = this.sys, A = this.A, R = this.root;
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

  // --------------------------------------------------------------- kitchen systems glue
  /** where an item is right now, in words (for the recipe book and inspect card) */
  whereIs(it) {
    if (it.held) return 'In your hands';
    if (it.state.gone) return 'Used up';
    if (!it.slot) return 'Somewhere in the kitchen';
    return this.places?.get(it.slot) || placeName(it.slot);
  }
  /** older generated items join the cooking system */
  tagLegacyItems() {
    const I = this.items, tag = (id, tags, def, extra = {}) => { const it = I[id]; if (!it) return; for (const t of tags) it.tags.add(t); if (def) it.def = def; Object.assign(it.state, extra); };
    tag('apple', ['fruit', 'choppable', 'apple_red'], 'apple_red');
    tag('strawberries', ['fruit', 'choppable', 'berries'], 'strawberries');
    tag('cheese', ['cheese', 'cheddar', 'dairy']);
    tag('milk', ['dairy', 'pourable'], null, { qty: I.milk?.state.qty ?? 1000 }); if (I.milk) I.milk.unit = 'ml';
    tag('flour', ['baking'], null, { qty: I.flour?.state.qty ?? 1000 }); if (I.flour) I.flour.unit = 'g';
    tag('mug', ['mug', 'cup']);
    tag('bowl', ['bowl', 'mixing', 'container']);
    tag('skillet', ['pan', 'container']); tag('dutch_oven', ['pot', 'container']);
    for (const k of [1, 2]) tag(`plate_${k}`, ['servable', 'dish'], 'dinner_plate');
    tag('spoon', ['spoon']);
    // a banana bunch, grapes and an orange in the fruit bowl's company on the island for the fruit salad
    for (const it of this.sys.items.values()) { if (it.def && !it.baseName) it.baseName = it.name; if (it.tags.has('servable')) this.cooking.makeEdible(it); }
  }
  /** first-person close-up views for every storage space and station */
  buildFocusViews() {
    const F = this.focus, V = (o, opts) => Focus.view(o, opts);
    F.attach(this.fridge.door, V(this.fridge.root, { at: [0, 1.0, 0], dist: 1.15, up: 0.3, name: 'Fridge', radius: 1.3 }));
    F.attach(this.freezer.door, V(this.freezer.root, { at: [0, 1.0, 0], dist: 1.15, up: 0.3, name: 'Freezer', radius: 1.3 }));
    for (const col of [this.fridge, this.freezer]) for (const c of col.crispers) F.attach(c.slide, V(col.root, { at: [c.part.position.x, 0.3, 0.25], dist: 0.75, up: 0.6, name: col === this.fridge ? 'Produce drawer' : 'Freezer basket', radius: 0.9 }));
    const runs = [[this.runNL, 'Range-wall cupboards'], [this.runNR, 'Range-wall cupboards'], [this.island, 'Island'], [this.runE, 'Serving counter'], [this.runW, 'Sink counter'], [this.pantry.run, 'Pantry counter']];
    for (const [run, label] of runs) for (const m of run.info) {
      const name = this.places?.get(m.slots?.[0]) || null;
      const nm = s => (this.places && [...this.places.entries()].find(([sl, v]) => sl.id.startsWith(s))?.[1]?.split('→').pop().trim());
      if (m.doors) for (const d of m.doors) F.attach(d, V(run.root, { at: [m.xc, 0.35, 0.05], dist: 0.95, up: 0.55, name: cap(nm(`${run.id}_${run.info.indexOf(m)}_cg`) || 'cupboard'), radius: 0.9 }));
      if (m.drawer) F.attach(m.drawer, V(run.root, { at: [m.xc, 0.7, 0.3], dist: 0.65, up: 0.6, name: cap(nm(`${m.drawer.id}_g`) || (m.kind === 'trash' ? 'trash and recycling' : 'drawer')), radius: 0.8 }));
      if (m.dw) F.attach(m.dw.door, V(run.root, { at: [m.xc, 0.45, 0.3], dist: 0.85, up: 0.75, name: 'Dishwasher', radius: 0.9 }));
      if (m.mw) F.attach(m.mw.drawer, V(run.root, { at: [m.xc, 0.55, 0.35], dist: 0.7, up: 0.55, name: 'Microwave drawer', radius: 0.8 }));
      if (m.bev) F.attach(m.bev.door, V(run.root, { at: [m.xc, 0.45, 0.1], dist: 0.8, up: 0.55, name: 'Soda fridge', radius: 0.8 }));
    }
    for (const [g, n] of [[this.glassL, 'Left glass cupboard'], [this.glassR, 'Right glass cupboard']]) for (const d of g.doors) F.attach(d, V(g.root, { at: [0.82, 0.55, 0.05], dist: 1.05, up: -0.25, name: n, radius: 1.0 }));
    for (const ov of this.range.ovens) F.attach(ov.door, V(this.range.root, { at: [ov.slot.parent.position.x, 0.35, 0.25], dist: 0.9, up: 0.6, name: ov.door.name === 'big oven' ? 'Big oven' : 'Small oven', radius: 0.9 }));
    // stations: step up and look
    const R = this.root, rg = this.range;
    F.station('station_range', 'range', 'Cook at the range', rg.root, [0, 1.15, 0.45], V(rg.root, { at: [0, 0.95, 0.0], dist: 0.62, up: 0.62, name: 'Cooking at the range', radius: 1.05 }));
    const sk = this.sink; F.station('station_sink', 'sink', 'Use the sink', sk.root, [sk.mouth.x, 1.15, 0.5], V(sk.root, { at: [sk.mouth.x, 0.85, 0.05], dist: 0.62, up: 0.6, name: 'At the sink', radius: 0.95 }));
    const [IL, , IT] = this.islandSize, zI = IT > 2 ? -0.75 : -0.6;
    const prep = new THREE.Object3D(); prep.position.set(7.75, 0, zI + 0.35); R.add(prep);
    F.station('station_island', 'island', 'Prepare food at the island', prep, [0, 1.1, -0.45], V(prep, { at: [0, 0.92, 0.05], n: [0, 0, -1], dist: 0.8, up: 0.62, name: 'Island prep area', radius: 1.6 }));
    const shelf = (id, label, pos, n, radius) => { const o = new THREE.Object3D(); o.position.set(...pos); R.add(o); F.station(id, 'shelf', label, o, [n[0] * 0.6, 0.2, n[2] * 0.6], V(o, { at: [0, 0, 0], n, dist: 1.05, up: 0.15, name: label.replace('Inspect the ', '').replace(/^./, c => c.toUpperCase()), radius })); };
    shelf('station_pantry_n', 'Inspect the pasta & grains shelf', [13.8, 1.45, 0.72], [0, 0, 1], 1.5);
    shelf('station_pantry_e', 'Inspect the baking & snacks shelf', [15.18, 1.45, 2.2], [-1, 0, 0], 1.9);
    shelf('station_pantry_s', 'Inspect the spice rack', [13.8, 1.75, 3.73], [0, 0, -1], 1.4);
    const cf = this.coffee.root; F.station('station_coffee', 'coffee', 'Make coffee', cf, [0.55, 1.2, 0.5], V(cf, { at: [0.55, 1.05, 0.05], dist: 0.7, up: 0.35, name: 'Coffee nook', radius: 0.8 }));
  }
  /** oven mitts: a wearable that lets you take hot trays out of the oven */
  buildMitts() {
    const sys = this.sys, m = [...sys.items.values()].find(i => i.def === 'oven_mitts'); this.mittsItem = m;
    if (!m) return;
    m.useVerb = () => ({ label: 'Put on the oven mitts', clip: 'PickUp', run: () => this.wearMitts(m) });
    const d0 = sys.drop.bind(sys);
    sys.drop = () => { if (!sys.held && this.game.mitts) { this.takeOffMitts(); return true; } return d0(); };
    // hot trays need mitts
    const v0 = Object.getPrototypeOf(m).verb;
    for (const it of sys.items.values()) if (it.tags.has('tray')) it.verb = function (s) { if (this.state.c?.hot && !s.game.mitts && !this.held && this.slot?.enabled()) return { label: 'Too hot! Put on oven mitts first', disabled: true, run: () => s.toast('The oven mitts are in the towel drawer to the right of the range.') }; return v0.call(this, s); };
    const p0 = sys.pickUp.bind(sys);
    sys.pickUp = it => { p0(it); if (it.state.c?.baked) this.cooking.flag('cookies_out'); };
  }
  wearMitts(m, quiet) {
    const sys = this.sys, g = this.game; if (!m) return;
    if (sys.held === m) { sys.held = null; }
    m.held = false; if (m.slot) { m.slot.item = null; m.slot = null; }
    m.state.worn = true; g.mitts = true;
    const hand = g.wren.bones?.LeftHand;
    if (hand) { hand.add(m.object); const ws = new THREE.Vector3(); hand.getWorldScale(ws); m.object.scale.setScalar(1.3 / ws.x); m.object.position.set(0, 0.04 / ws.x, 0); m.object.visible = true; }
    if (!quiet) { sys.toast('Oven mitts on! Now you can carry hot trays. (Q with empty hands takes them off.)'); sys.changed(); }
  }
  takeOffMitts() {
    const m = this.mittsItem, sys = this.sys; if (!m) return;
    this.game.mitts = false; m.state.worn = false;
    if (m.home && !m.home.item) sys.place(m, m.home); else this.root.add(m.object);
    sys.toast('Oven mitts off.'); sys.changed();
  }
  /** the oven finished: cupcake batter becomes cupcakes, cookie dough becomes cookies */
  bakeIn(ov) {
    const sys = this.sys, it = ov.slot.item, c = it?.state.c;
    sys.sfx('ding');
    if (c?.mix === 'cupcake_batter') return this.bakeCupcakes(ov, it);
    if (it?.tags.has('tray') && c?.dough) { c.dough = false; c.baked = true; c.hot = TIMES.cool; this.cooking.changed(it, 'Ding! The cookies are baked. Put on oven mitts to take the tray out.'); this.cooking.flag('cookies_baked'); return; }
    sys.toast(it ? `Ding! The ${it.name} is nice and warm.` : 'Ding!');
  }
  bakeCupcakes(ov, bowl) {
    const sys = this.sys, g = this.game, c = bowl.state.c;
    c.mix = null; c.add = {}; bowl.tags.delete('bakeable'); this.cooking.changed(bowl);
    const free = [...sys.slots.values()].find(s => !s.item && s.id.startsWith('island_top') && s.enabled());
    sys.place(bowl, free || bowl.home);
    let first = true;
    for (const cc of this.cupcakes) {
      if (cc.live) continue; cc.live = true;
      if (first) { sys.place(cc, ov.slot); first = false; }
      else { const f2 = this.tableSlots.find(s => !s.item) || [...sys.slots.values()].find(s => !s.item && s.id.startsWith('island_top')); if (f2) sys.place(cc, f2); }
    }
    sys.toast('Cupcakes are ready! One is in the oven and the rest are on the table.');
    this.cooking.flag('cupcakes_baked');
    g.wren.play('Cheer', CLIP_RANGES.Cheer); g.friend?.cheer?.(); g.speech?.say('cupcakes', { force: true }); g.audio?.chime?.(988);
    sys.changed();
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
    for (let i = 0; i < 10; i++) { const top = (i + 1) * 0.2; b.box(M.oakFloor, [-2.75 + i * 0.3, top / 2, 0.57], [0.3, top, 0.9], { round: 0.02 }); }
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
    this.cooking.update(dt); this.focus.update(dt); this.recipeBook.update(dt);
  }
}

