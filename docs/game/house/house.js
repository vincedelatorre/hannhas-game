// The Enchanted Island House: the inside of the clubhouse.
//
// Floor 1 (this milestone): the foyer and the fully working kitchen.
//   - the front door outside (on the clubhouse) and inside both work: E to go in or out
//   - kitchen door, fridge (two doors, light, shelves, door shelf), cupboards, drawer,
//     sink with a real tap and water, oven with a knob and timer, upper cupboards
//   - generated 3D food, mug, bowl, flour, cookie jar, teapot, fruit bowl, table,
//     chairs, plant, lamp, copper pots, pantry shelf
//   - activity: make cupcakes (flour + milk in the bowl, stir with the spoon, bake)
//   - the mug fills under the running tap; drink it
//   - everything you move or open is saved
//
// The interior is built once, out of sight high above the island (HOUSE_ORIGIN), and
// shown when you step through the door. Rooms use metres; local x = east, local z = south.
import * as THREE from 'three/webgpu';
import { texture, uv, vec3, float, time, sin, mix, color } from 'three/tsl';
import { Builder, makeMaterials, C } from './kit.js';
import { buildFridge, buildCounterRun, buildUpperCabinets, buildDoor } from './parts.js';
import { InteractionSystem, Interactable, Item, Slot, Seat, CLIP_RANGES } from './interact.js';
import { extractMesh } from '../assets.js';
import { toNodeMaterial } from '../dressing.js';
import { V, H } from '../world.js';

export const HOUSE_ORIGIN = new THREE.Vector3(0, 400, -400);
export const HOUSE_MODELS = ['SM_Kitchen_Cupcake', 'SM_Kitchen_MilkBottle', 'SM_Kitchen_JuiceJug', 'SM_Kitchen_Apple', 'SM_Kitchen_Cheese', 'SM_Kitchen_Strawberries',
  'SM_Kitchen_Mug', 'SM_Kitchen_MixingBowl', 'SM_Kitchen_CookieJar', 'SM_Kitchen_Teapot', 'SM_Kitchen_FruitBowl', 'SM_Kitchen_FlourSack',
  'SM_House_Table', 'SM_House_Chair', 'SM_House_Monstera', 'SM_House_PendantLamp', 'SM_Kitchen_CopperPots', 'SM_House_BarStool', 'SM_Kitchen_Pantry'];
export const HOUSE_TEXTURES = ['T_Kitchen_Floor', 'T_Wall_Plaster', 'T_Cabinet_Turquoise', 'T_Countertop_Marble', 'T_Honey_Wood', 'T_Backsplash', 'T_Window_View', 'T_Art_Fruit', 'T_Art_Turtle', 'T_Rug_Tropical'];

// ------------------------------------------------------------------ props from generated models
/** a generated model as a mesh with its origin at the bottom centre, scaled to `height` */
function prop(A, name, height, fallback) {
  const src = extractMesh(A.models[name]);
  let mesh;
  if (src) {
    const g = src.geometry.clone(); g.computeBoundingBox();
    const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    const mat = toNodeMaterial(src.material); mat.side = THREE.FrontSide;
    mesh = new THREE.Mesh(g, mat);
    mesh.baseScale = height / Math.max(1e-3, bb.max.y - bb.min.y);
  } else {
    mesh = fallback();
    mesh.baseScale = 1; mesh.userData.fallback = true;
  }
  mesh.scale.setScalar(mesh.baseScale); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}
const simple = (geo, col, rough = 0.5) => () => new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({ color: col, roughness: rough }));
const cyl = (r, h, col) => { const g = new THREE.CylinderGeometry(r, r, h, 20); g.translate(0, h / 2, 0); return simple(g, col); };

export class House {
  constructor(game, scene, A, physics) {
    this.game = game; this.scene = scene; this.A = A;
    this.root = new THREE.Group(); this.root.name = 'house'; this.root.position.copy(HOUSE_ORIGIN); this.root.visible = false;
    scene.add(this.root); this.root.updateMatrixWorld(true);
    this.M = makeMaterials(A.textures);
    this.b = new Builder(this.root, physics); this.b.mats = this.M;
    this.sys = game.interact || (game.interact = new InteractionSystem(game, scene));
    this.indoors = false;
    this.buildShell();
    this.buildKitchen();
    this.buildFoyer();
    this.buildLights();
    this.buildExteriorDoor();
    this.sys.extraSave = () => ({ recipe: this.recipe.save(), cupcakes: this.cupcakes.filter(c => c.live).length });
    this.sys.extraLoad = d => { this.recipe.load(d.recipe); };
  }

  local(x, y, z) { return new THREE.Vector3(x, y, z); }
  world(x, y, z) { return new THREE.Vector3(x, y, z).add(HOUSE_ORIGIN); }

  // --------------------------------------------------------------- walls, floors, windows
  buildShell() {
    const b = this.b, M = this.M;
    // foyer x -3..3, z 0..6 ; kitchen x 3..11, z -1..6
    b.floor(-3, 0, 3, 6, M.wood);
    b.floor(3, -1, 11, 6, M.floor);
    b.ceiling(-3, 0, 3, 6, 3.2, M.plaster);
    b.ceiling(3, -1, 11, 6, 3.2, M.plaster);
    const W = (x0, z0, x1, z1, openings, mat = M.plaster) => b.wall(x0, z0, x1, z1, { mat, openings });
    // foyer
    W(-3, 6, 3, 6, [{ at: 3, w: 1.2, h: 2.35 }, { at: 1.0, w: 0.9, h: 1.25, y0: 1.0 }, { at: 5.0, w: 0.9, h: 1.25, y0: 1.0 }]);   // south, front door
    W(-3, 0, -3, 6, [{ at: 3, w: 1.1, h: 2.25 }]);        // west (living room: next milestone)
    W(-3, 0, 3, 0, []);                                  // north (stairs)
    // honey-wood wainscoting around the foyer
    const wains = [[-1.825, 5.86, 2.35, 0.03], [1.825, 5.86, 2.35, 0.03], [0, 0.14, 6, 0.03], [-2.86, 1.2, 0.03, 2.4], [-2.86, 4.8, 0.03, 2.4], [2.86, 1.42, 0.03, 2.84], [2.86, 4.97, 0.03, 2.06]];
    for (const [x, z, w, d] of wains) b.box(M.wood, [x, 0.5, z], [w, 1.0, d], { collide: false, cast: false });
    W(3, 0, 3, 6, [{ at: 3.4, w: 1.05, h: 2.25 }]);              // shared with kitchen
    // kitchen
    W(3, -1, 11, -1, [{ at: 4.31, w: 1.2, h: 1.0, y0: 1.25 }]);   // north, window over the sink
    W(11, -1, 11, 6, [{ at: 5.0, w: 1.4, h: 1.3, y0: 0.95 }]);   // east
    W(3, 6, 11, 6, [{ at: 5.5, w: 1.6, h: 1.3, y0: 0.9 }]);      // south
    W(3, -1, 3, 0, []);                                          // little return wall
    // views through the windows: painted beach backdrops just outside each window
    const view = this.A.textures.T_Window_View;
    const vmat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, fog: false });
    if (view) { view.wrapS = view.wrapT = THREE.ClampToEdgeWrapping; vmat.colorNode = texture(view, uv()).rgb.mul(1.05); } else vmat.color.set(0x7fc8e6);
    const backdrop = (x, y, z, ry, w = 3.4, h = 2.2) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vmat); m.position.set(x, y, z); m.rotation.y = ry; this.root.add(m); };
    backdrop(7.31, 1.75, -2.6, 0); backdrop(12.6, 1.6, 4.0, -Math.PI / 2); backdrop(8.5, 1.55, 7.6, Math.PI); backdrop(-2, 1.6, 7.6, Math.PI, 2.2, 1.8); backdrop(2, 1.6, 7.6, Math.PI, 2.2, 1.8);
    // window glass
    const glass = (x, y, z, ry, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.M.glass); m.position.set(x, y, z); m.rotation.y = ry; this.root.add(m); };
    glass(7.31, 1.75, -1.0, 0, 1.2, 1.0); glass(11, 1.6, 4.0, -Math.PI / 2, 1.4, 1.3); glass(8.5, 1.55, 6, 0, 1.6, 1.3); glass(-2, 1.625, 6, 0, 0.9, 1.25); glass(2, 1.625, 6, 0, 0.9, 1.25);
  }

  // --------------------------------------------------------------- kitchen
  buildKitchen() {
    const b = this.b, M = this.M, sys = this.sys, A = this.A, R = this.root;
    // north counter: drawers | cupboard | SINK | cupboard | drawers  (sink under the window)
    const north = buildCounterRun(b, M, sys, { id: 'kitchen_counterN', at: this.local(5.76, 0, -1 + 0.12 + 0.31), modules: ['drawers', 'door', 'sink', 'door', 'drawers'] });
    this.north = north; this.sink = north.info[2].sink;
    // east counter (faces west): cupboard | OVEN | drawers
    const east = buildCounterRun(b, M, sys, { id: 'kitchen_counterE', at: this.local(11 - 0.12 - 0.31, 0, 1.3), rotY: -Math.PI / 2, modules: ['door', 'oven', 'drawers'] });
    this.east = east; this.oven = east.info[1].oven;
    // backsplash strips behind the counters
    b.box(M.backsplash, [7.31, 1.1, -1 + 0.125], [3.1, 0.36, 0.01], { collide: false, cast: false });
    b.box(M.backsplash, [11 - 0.125, 1.1, 1.3 + 0.93], [0.01, 0.36, 1.86], { collide: false, cast: false });
    // upper cupboards either side of the window
    this.upperL = buildUpperCabinets(b, M, sys, { id: 'kitchen_upperL', at: this.local(5.4, 1.45, -1 + 0.12 + 0.18), count: 2 });
    this.upperR = buildUpperCabinets(b, M, sys, { id: 'kitchen_upperR', at: this.local(7.98, 1.45, -1 + 0.12 + 0.18), count: 2 });
    // fridge in the north-east corner, facing west
    this.fridge = buildFridge(b, M, sys, { at: this.local(11 - 0.12 - 0.36, 0, -1 + 0.12 + 0.43 + 0.04), rotY: -Math.PI / 2 });
    // a child's drawing stuck on the freezer door
    if (A.textures.T_Art_Turtle) {
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.29), new THREE.MeshStandardNodeMaterial({ roughness: 0.9 }));
      art.material.colorNode = texture(A.textures.T_Art_Turtle, uv()).rgb; art.position.set(0.45, 1.66, 0.076);
      this.fridge.freezer.object.add(art);
      const magnet = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), M.coral); magnet.position.set(0.45, 1.8, 0.08); this.fridge.freezer.object.add(magnet);
    }
    // kitchen door between foyer and kitchen
    this.kitchenDoor = buildDoor(b, M, sys, { id: 'kitchen_door_01', name: 'kitchen door', at: this.local(3, 0, 3.4), rotY: Math.PI / 2, w: 1.0, h: 2.2, swing: 95 });

    // ---- table, chairs, plant, lamp, rug, pantry, pots, stool (generated models)
    const place = (name, h, x, z, ry = 0, y = 0, fb) => { const m = prop(A, name, h, fb || simple(new THREE.BoxGeometry(0.5, h, 0.5), C.honey)); m.position.set(x, y, z); m.rotation.y = ry; R.add(m); return m; };
    const table = place('SM_House_Table', 0.76, 7.4, 3.3, 0, 0, cyl(0.6, 0.76, C.honey));
    { const c = new THREE.Mesh(); c.position.set(7.4, 0.38, 3.3); R.add(c); b.solid(c, 1.0, 0.76, 1.0); }
    this.chairs = [];
    for (const [x, z, ry] of [[6.45, 3.3, Math.PI / 2], [8.35, 3.3, -Math.PI / 2], [7.4, 4.3, Math.PI]]) {
      const ch = place('SM_House_Chair', 0.98, x, z, ry + Math.PI, 0,   // the generated chair faces -z
        simple(new THREE.BoxGeometry(0.45, 0.98, 0.45), C.honey));
      this.chairs.push(ch);
      sys.add(new Seat({ id: `kitchen_chair_${this.chairs.length}`, name: 'chair', object: ch, anchor: [0, 0.5, 0], seatY: 0.4, facing: ry, back: -0.72, radius: 1.6 }));
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.42)); c.position.set(x, 0.45, z); c.visible = false; R.add(c); b.solid(c, 0.42, 0.9, 0.42);
    }
    const plant = place('SM_House_Monstera', 1.35, 10.35, 5.35, 0.6, 0, cyl(0.3, 1.2, 0x2f7d32));
    { const c = new THREE.Mesh(); c.position.set(10.35, 0.6, 5.35); R.add(c); b.solid(c, 0.55, 1.2, 0.55); }
    const lamp = place('SM_House_PendantLamp', 0.55, 7.4, 2.4, 0, 2.15, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), this.M.lamp); m.geometry.translate(0, 0.25, 0); return m; });
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 6), M.teak); cord.position.set(7.4, 2.95, 3.3); R.add(cord);
    lamp.position.z = 3.3;
    this.pantry = place('SM_Kitchen_Pantry', 1.7, 4.2, 5.55, Math.PI, 0, simple(new THREE.BoxGeometry(1.0, 1.7, 0.4), C.honey));
    { const c = new THREE.Mesh(); c.position.set(4.2, 0.85, 5.6); R.add(c); b.solid(c, 1.1, 1.7, 0.5); }
    place('SM_Kitchen_CopperPots', 0.32, 10.5, -0.4, -Math.PI / 2, 1.95, cyl(0.15, 0.25, 0xb87333));
    const stool = place('SM_House_BarStool', 0.75, 9.9, 2.2, -Math.PI / 2, 0, cyl(0.2, 0.75, C.turquoise));
    { const c = new THREE.Mesh(); c.position.set(9.9, 0.37, 2.2); R.add(c); b.solid(c, 0.38, 0.75, 0.38); }
    // round rug under the table
    if (A.textures.T_Rug_Tropical) {
      const rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshStandardNodeMaterial({ roughness: 0.95 }));
      rug.material.colorNode = texture(A.textures.T_Rug_Tropical, uv()).rgb.mul(0.9); rug.rotation.x = -Math.PI / 2; rug.position.set(7.4, 0.006, 3.3); rug.receiveShadow = true; R.add(rug);
    }
    // painting in the foyer
    if (A.textures.T_Art_Fruit) {
      const art = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshStandardNodeMaterial({ roughness: 0.7 }));
      art.material.colorNode = texture(A.textures.T_Art_Fruit, uv()).rgb; art.position.set(-1.6, 1.75, 0.13); R.add(art);
      b.box(M.wood, [-1.6, 1.75, 0.125], [1.32, 1.02, 0.03], { collide: false });
    }

    // ---- table slots
    const T = new THREE.Group(); T.position.set(7.4, 0.76, 3.3); R.add(T);
    this.tableSlots = [[0, 0], [0.32, 0.12], [-0.32, 0.1], [0.05, -0.33], [-0.12, 0.34]].map(([x, z], i) => sys.addSlot(new Slot({ id: `kitchen_table_${i}`, name: 'on the table', parent: T, pos: [x, 0, z] })));

    // ---- items (generated food and kitchenware)
    const S = id => sys.slots.get(id);
    const items = this.items = {};
    const mk = (id, model, name, h, tags, home, fb, extra = {}) => {
      const obj = prop(A, model, h, fb);
      const it = new Item({ id, name, object: obj, tags, home: S(home), ...extra });
      it.baseScale = obj.baseScale; it.yaw = extra.yaw || 0;
      sys.add(it); sys.place(it, it.home);
      items[id] = it; return it;
    };
    const F = this.fridge;
    mk('milk', 'SM_Kitchen_MilkBottle', 'milk', 0.24, ['drink', 'food', 'ingredient', 'milk'], 'kitchen_fridge_01_door_d1', cyl(0.045, 0.24, 0xffffff));
    mk('juice', 'SM_Kitchen_JuiceJug', 'orange juice', 0.23, ['drink', 'food'], 'kitchen_fridge_01_door_d2', cyl(0.05, 0.23, 0xff9a1f));
    mk('cheese', 'SM_Kitchen_Cheese', 'cheese', 0.07, ['food'], 'kitchen_fridge_01_shelf_c1', simple(new THREE.BoxGeometry(0.12, 0.07, 0.08).translate(0, 0.035, 0), 0xf6c945));
    mk('strawberries', 'SM_Kitchen_Strawberries', 'strawberries', 0.11, ['food'], 'kitchen_fridge_01_shelf_b2', cyl(0.07, 0.1, 0xd9302f));
    mk('apple', 'SM_Kitchen_Apple', 'apple', 0.08, ['food', 'edible'], 'kitchen_fridge_01_shelf_c2', () => { const g = new THREE.SphereGeometry(0.04, 16, 12); g.translate(0, 0.04, 0); return simple(g, 0xd42a2a)(); },
      { use: (s, it) => ({ label: 'Eat the apple', clip: 'PickUp', run: () => this.eat(it) }) });
    const mug = mk('mug', 'SM_Kitchen_Mug', 'mug', 0.11, ['fillable', 'washable'], 'kitchen_upperL_0_shelf', cyl(0.045, 0.11, C.turquoise),
      { state: { fill: 0 }, use: (s, it) => it.state.fill > 0.15 ? { label: 'Drink the water', clip: 'PickUp', run: () => { it.state.fill = 0; it.onState(); s.toast('Ahh, refreshing!'); s.sfx('drink'); s.changed(); } } : null });
    this.addMugWater(mug);
    const bowl = mk('bowl', 'SM_Kitchen_MixingBowl', 'mixing bowl', 0.13, ['washable', 'bowl'], 'kitchen_counterN_top_0', cyl(0.13, 0.12, C.coral));
    mk('flour', 'SM_Kitchen_FlourSack', 'flour', 0.2, ['ingredient', 'flour'], 'kitchen_counterN_cup_1', simple(new THREE.BoxGeometry(0.14, 0.2, 0.1).translate(0, 0.1, 0), C.cream));
    mk('cookies', 'SM_Kitchen_CookieJar', 'cookie jar', 0.22, ['food'], 'kitchen_counterN_top_4', cyl(0.08, 0.22, 0xd9c9a3));
    mk('teapot', 'SM_Kitchen_Teapot', 'teapot', 0.19, ['washable'], 'kitchen_upperR_1_shelf', cyl(0.08, 0.18, C.turquoise));
    mk('fruit', 'SM_Kitchen_FruitBowl', 'fruit bowl', 0.2, ['food'], 'kitchen_table_0', cyl(0.15, 0.15, C.honey));
    // wooden spoon (simple parametric: a handle and a bowl)
    const spoonObj = (() => {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.26, 8), M.wood); h.position.y = 0.17; g.add(h);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.wood); s.scale.set(1, 0.4, 1.4); s.position.y = 0.035; g.add(s);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    })();
    const spoon = new Item({ id: 'spoon', name: 'wooden spoon', object: spoonObj, tags: ['spoon', 'washable'], home: S('kitchen_counterN_drawer_0_in'), grip: [0, -0.12, 0.04] });
    spoon.baseScale = 1; spoonObj.rotation.z = 0; sys.add(spoon); sys.place(spoon, spoon.home); items.spoon = spoon;

    // ---- cupcake making
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

  addMugWater(mug) {
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 20), new THREE.MeshPhysicalNodeMaterial({ color: 0x8fd8e8, roughness: 0.05, transparent: true, opacity: 0.8 }));
    disk.visible = false; mug.object.add(disk);
    mug.onState = () => {
      const k = mug.state.fill; disk.visible = k > 0.02;
      // the disk lives in the mug's model space: height scales with the model
      const inv = 1 / (mug.baseScale || 1);
      disk.scale.setScalar(inv); disk.position.y = (0.012 + 0.085 * k) * inv;
    };
    mug.onState();
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
    { const c = new THREE.Mesh(); c.position.set(-1.4, 1.2, 1.15); this.root.add(c); b.solid(c, 3.2, 2.4, 0.12); }   // keeps you off the unfinished stairs
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
    const pend = new THREE.PointLight(0xffc77a, 0, 7, 1.6); pend.position.set(7.4, 2.25, 3.3); R.add(pend); this.lights.push([pend, 9]);
    const k2 = new THREE.PointLight(0xffe0b0, 0, 6, 1.6); k2.position.set(7.3, 2.7, 0.2); R.add(k2); this.lights.push([k2, 6]);
    const foy = new THREE.PointLight(0xffd29a, 0, 7, 1.6); foy.position.set(0, 2.7, 3); R.add(foy); this.lights.push([foy, 7]);
    // warm bounce light from the honey wood
    this.fill = new THREE.HemisphereLight(0xffe7c4, 0x6b4a2a, 0); this.fill.position.copy(HOUSE_ORIGIN); this.scene.add(this.fill);
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
    // tap water: splashes, sink pool and filling whatever sits in the basin
    const sk = this.sink;
    if (sk.tap.on && this.indoors) {
      sk.root.updateWorldMatrix(true, false);
      const m = new THREE.Vector3(sk.mouth.x, sk.basinY + 0.03, sk.mouth.z).applyMatrix4(sk.root.matrixWorld);
      if (Math.random() < 0.6) g.fxWater?.emit(m, new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5), { life: 0.3, size: 0.025, gravity: 6 });
      const it = sk.slot.item;
      if (it?.tags.has('fillable')) { it.state.fill = Math.min(1, (it.state.fill || 0) + dt * 0.22); it.onState?.(); if (it.state.fill >= 1 && !it._fullSaid) { it._fullSaid = true; g.toast('The mug is full!'); this.sys.changed(); } }
      else if (it && it._fullSaid) it._fullSaid = false;
      sk.pool.visible = true; sk.pool.scale.y = 1; sk.pool.position.y = sk.basinY + 0.012;
    } else sk.pool.visible = false;
    g.audio?.houseTap?.(sk.tap.on && this.indoors);
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
      enabled: () => !bowl.held && !this.s.stirred && !!bowl.slot && !bowl.slot.id.includes('oven'),
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
    sys.toast(this.s.flour && this.s.milk ? 'Flour and milk are in! Now stir it with a wooden spoon.' : k === 'flour' ? 'Flour in! Add some milk from the fridge.' : 'Milk in! Add some flour from the cupboard.');
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
      return { label: 'Stir it: get the wooden spoon from the drawer', disabled: true, run: () => sys.toast('The wooden spoon is in the top drawer by the bowl.') };
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
        sys.toast('Smooth batter! Put the bowl in the oven, close it and turn the knob.');
        sys.changed();
      }
    }
    // oven: bake for a few seconds, glowing
    const ov = this.house.oven, st = ov.state;
    if (ov.knob.on && st.baking > 0) {
      st.baking += dt;
      ov.glow.intensity = 1.5 + Math.sin(performance.now() * 0.01) * 0.2;
      ov.coil.material.color.setRGB(0.9, 0.25 + 0.1 * Math.sin(performance.now() * 0.008), 0.05);
      if (st.baking >= st.total) { st.baking = 0; ov.knob.set(false, sys); st.onDone?.(); }
    } else { ov.glow.intensity = 0; ov.coil.material.color.set(0x3a2a22); }
  }
  bake() {
    const sys = this.house.sys, ov = this.house.oven, g = this.house.game;
    sys.sfx('ding');
    const item = ov.slot.item;
    if (!item || item !== this.bowl || !this.s.stirred) { sys.toast('Ding! (Nothing to bake.)'); return; }
    // the bowl goes back to the counter, washed; three cupcakes appear on the oven tray
    this.s = { flour: false, milk: false, stirred: false, baked: true }; this.syncBatter();
    sys.place(this.bowl, this.bowl.home.item ? [...sys.slots.values()].find(s => !s.item && s.id.includes('counterN_top')) || this.bowl.home : this.bowl.home);
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
