// Stocks the kitchen: the fridge, freezer, pantry, drawers and cupboards get real, individually
// pickable items from the item library, each in its own storage slot. Also tags every storage
// space with a first-person "focus" view and a place name the recipe book uses ("Pantry → Baking
// shelf").
import * as THREE from 'three/webgpu';
import { Item, Slot, Interactable } from './interact.js';
import { ITEM_DEFS, makeItemObject } from './items.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** a row/grid of slots on a shelf, in `parent` space */
export function grid(sys, prefix, parent, { xs, zs = [0], y, name, enabled, accepts, radius = 1.9, place }) {
  const out = [];
  zs.forEach((z, j) => xs.forEach((x, i) => {
    const s = sys.addSlot(new Slot({ id: `${prefix}_${j}_${i}`, name, parent, pos: [x, y, z], enabled, accepts, radius }));
    s.place = place; out.push(s);
  }));
  return out;
}
const spread = (a, b, n) => Array.from({ length: n }, (_, i) => n === 1 ? (a + b) / 2 : a + (b - a) * i / (n - 1));

export function stockKitchen(H) {
  const sys = H.sys, items = H.items;
  const reg = H.places = new Map();     // slot -> human place name (for the recipe book)
  const where = (slots, label) => { for (const s of slots) reg.set(s, label); return slots; };
  let n = 0;
  /** make a library item and put it in a slot */
  const put = (def, slot, opts = {}) => {
    if (!slot || slot.item) return null;
    const D = ITEM_DEFS[def]; if (!D) return null;
    const id = opts.id || `${def}_${++n}`;
    const obj = makeItemObject(def, { cereal: () => H.pantry.cerealBox(opts.cereal || 0) });
    const it = new Item({ id, name: opts.name || D.name, object: obj, tags: [...D.tags, def], home: slot, state: { ...(D.state || {}), ...(D.qty ? { qty: D.qty } : {}) }, grip: opts.grip });
    it.def = def; it.baseName = it.name; it.baseScale = 1; it.yaw = opts.yaw ?? slot.yaw ?? 0;
    if (D.qty) it.unit = D.unit, it.qtyMax = D.qty;
    sys.add(it); sys.place(it, slot); items[id] = it;
    return it;
  };
  const fillTo = (slots, defs, frac = 0.9) => { const n0 = Math.round(slots.length * frac); const L = []; for (let i = 0; L.length < n0; i++) L.push(defs[i % defs.length]); fill(slots, L); };
  const fill = (slots, defs, opts) => { let i = 0; for (const d of defs) { while (i < slots.length && slots[i].item) i++; if (i >= slots.length) break; put(d, slots[i++], opts); } };

  // ---------------------------------------------------------------- fridge
  const F = H.fridge, Z = H.freezer;
  const shelfRows = (col, label, xs, zs) => col.shelfY.flatMap((y, k) => where(grid(sys, `${col.door.id.split('.')[0]}_g${k}`, col.root, { xs, zs, y: y + 0.008, name: `in the ${label}`, enabled: col.open, accepts: it => it.tags.has('food') || it.tags.has('drink') || it.tags.has('frozen') }), `${label === 'fridge' ? 'Fridge' : 'Freezer'} → shelf ${col.shelfY.length - k}`));
  const fr = shelfRows(F, 'fridge', spread(-0.31, 0.31, 6), [-0.16, 0.06]);
  const zr = shelfRows(Z, 'freezer', spread(-0.27, 0.27, 4), [-0.14, 0.08]);
  const bins = (col, label) => col.binYs.flatMap((y, k) => where(grid(sys, `${col.door.id.split('.')[0]}_bn${k}`, col.hinge, { xs: [-0.24, 0.24].map(x => col.sgn * col.w * 0.5 + x), y: y + 0.007, zs: [-0.075], name: `in the ${label} door`, enabled: col.open, accepts: it => it.tags.has('food') || it.tags.has('drink') }), `${label === 'fridge' ? 'Fridge' : 'Freezer'} → door`));
  const fb = bins(F, 'fridge'), zb = bins(Z, 'freezer');
  // existing door-bin slots hold the milk and juice; label them too
  for (const s of F.slots) reg.set(s, s.id.includes('bin') ? 'Fridge → door' : 'Fridge → shelf');
  for (const s of Z.slots) reg.set(s, s.id.includes('bin') ? 'Freezer → door' : 'Freezer → shelf');
  // the old two-per-shelf slots overlap the new grid: retire them
  for (const s of [...F.slots, ...Z.slots]) if (!s.id.includes('bin')) s.enabled = () => false;
  const crisp = (col, label) => col.crispers.flatMap((c, k) => where(grid(sys, `${col.door.id.split('.')[0]}_cr${k}`, c.part, { xs: spread(-c.w / 2 + 0.07, c.w / 2 - 0.07, col.crispers.length > 1 ? 2 : 4), zs: [-0.11, 0.08], y: 0.006, name: `in the ${label}`, enabled: () => c.slide.t > 0.7, accepts: it => it.tags.has('food') }), label === 'produce drawer' ? `Fridge → produce drawer (${k ? 'right' : 'left'})` : 'Freezer → bottom basket'));
  const fc = crisp(F, 'produce drawer'), zc = crisp(Z, 'freezer basket');
  // move the generated food that lived on the retired slots onto the new shelves
  for (const [id, slot] of [['cheese', fr[35]], ['strawberries', fr[23]], ['apple', fr[22]], ['icecream', zr[1]]]) { const it = items[id]; if (it && slot) { it.home = slot; sys.place(it, slot); } }
  // fruit and veg in the produce drawers and on the shelves
  fill(fc, ['apple_green', 'carrots', 'broccoli', 'bell_pepper_red', 'cucumber', 'romaine', 'tomato', 'zucchini', 'banana', 'orange', 'apple_red', 'peach']);
  // bottom shelf first (shelfY runs bottom → top): raw meat and fish stay packaged on the lowest shelf
  fill(fr.slice(0, 12), ['chicken_breast', 'chicken_thighs', 'ground_beef', 'steak', 'bacon', 'sausage', 'salmon', 'shrimp', 'white_fish', 'tofu', 'turkey', 'ham']);
  fill(fr.slice(12, 24), ['blueberries', 'raspberries', 'blackberries', 'grapes', 'peach', 'pear', 'kiwi', 'mango', 'lemon', 'lime', 'cherry_tomatoes', 'mushrooms']);
  fill(fr.slice(24, 36), ['parmesan', 'mozzarella', 'swiss', 'cheddar', 'pesto', 'marinara', 'jam', 'pickles', 'mayo', 'basil', 'parsley', 'cilantro']);
  fill(fr.slice(36, 48), ['milk_whole', 'milk_2', 'eggs', 'butter', 'yogurt_greek', 'yogurt', 'cream', 'cream_cheese', 'sour_cream', 'ricotta', 'milk_almond', 'half_half']);
  fill(fb, ['ketchup', 'mustard', 'bbq', 'hot_sauce', 'soy_sauce', 'dressing']);
  fill(fc, ['spinach', 'celery']);
  fill([...fr, ...fb], ['green_onions', 'asparagus', 'cauliflower', 'bell_pepper_yellow', 'bell_pepper_green', 'jalapeno', 'kale', 'milk_oat']);
  fill(fb, ['orange_juice', 'apple_juice', 'lemonade', 'sparkling', 'water_bottle', 'water_bottle']);
  // room-temperature fruit: bananas, oranges and apples out on the serving counter and the table
  const S = id => sys.slots.get(id);
  fill([S('kitchen_runE_top_0'), S('kitchen_runE_top_1'), S('kitchen_table_3'), S('kitchen_table_4')].filter(Boolean), ['banana', 'orange', 'banana', 'apple_red']);
  // ---------------------------------------------------------------- freezer
  fill(zr, ['frozen_veg', 'frozen_berries', 'frozen_chicken', 'frozen_fish', 'waffles', 'fries', 'frozen_dessert', 'ice_tray', 'frozen_pizza']);
  fill(zc, ['ice_tray', 'frozen_veg']);
  fill(zb, ['frozen_berries', 'frozen_dessert']);

  // ---------------------------------------------------------------- pantry
  const P = H.pantry;
  const north = (y, k, n2 = 10) => where(grid(sys, `pantry_N${k}`, H.root, { xs: spread(12.85, 14.75, n2), zs: [0.72], y: y + 0.018, name: 'on the pantry shelf', radius: 2.0, place: 'pantry' }), `Pantry → back shelf, ${['bottom', 'low', 'middle', 'high', 'top', 'very top'][k]}`);
  const east = (y, k, n2 = 12) => where(grid(sys, `pantry_E${k}`, H.root, { xs: [15.18], zs: spread(0.85, 3.55, n2), y: y + 0.018, name: 'on the pantry shelf', radius: 2.0 }), `Pantry → right shelf, ${['bottom', 'low', 'middle', 'high', 'top', 'very top'][k]}`);
  const levels = [0.85, 1.25, 1.65, 2.05, 2.45];
  const N = levels.map((y, k) => north(y, k + 1)), E = levels.map((y, k) => east(y, k + 1));
  for (const row of E) for (const s of row) s.yaw = -Math.PI / 2;      // fronts face into the pantry
  const south = [1.45, 1.85, 2.25, 2.65].map((y, k) => where(grid(sys, `pantry_S${k}`, H.root, { xs: spread(12.8, 14.8, k < 2 ? 10 : 7), zs: [3.73], y: y + 0.018, name: 'on the spice shelf', radius: 2.0 }), `Pantry → ${k < 2 ? 'spice rack' : 'shelf over the counter'}`));
  for (const row of south) for (const s of row) s.yaw = Math.PI;
  // the old decorative jars, cereal and baskets' slots are replaced by real stock
  // north (back) shelves: pasta, grains, sauces
  fillTo(N[0], ['spaghetti', 'spaghetti', 'fettuccine', 'penne', 'rigatoni', 'macaroni']);
  fillTo(N[1], ['linguine', 'bowtie', 'lasagna', 'marinara', 'alfredo', 'crushed_tomatoes']);
  fillTo(N[2], ['rice_white', 'rice_brown', 'rice_jasmine', 'quinoa', 'couscous', 'oats']);
  fillTo(N[3], ['olive_oil', 'avocado_oil', 'veg_oil', 'sesame_oil', 'balsamic', 'vinegar_red']);
  fillTo(N[4], ['vinegar_white', 'tomato_paste', 'tomato_paste', 'crushed_tomatoes', 'peanut_butter', 'almond_butter']);
  // east (right) shelves: baking and snacks
  fillTo(E[0], ['flour_ap', 'flour_bread', 'sugar', 'brown_sugar', 'powdered_sugar', 'cornstarch', 'cocoa']);
  fillTo(E[1], ['baking_powder', 'baking_soda', 'vanilla', 'choc_chips', 'honey', 'maple_syrup', 'yeast']);
  fillTo(E[2], ['cereal_0', 'cereal_0', 'cereal_0', 'granola', 'crackers', 'graham', 'popcorn']);
  fillTo(E[3], ['pretzels', 'chips', 'cookies_pack', 'nuts', 'trail_mix', 'dried_fruit', 'bread']);
  fillTo(E[4], ['tortillas', 'chips', 'pretzels', 'graham', 'crackers', 'popcorn', 'granola']);
  // spice rack over the counter
  fill(south[0], ['salt', 'pepper', 'garlic_powder', 'onion_powder', 'paprika', 'smoked_paprika', 'cinnamon', 'oregano', 'dried_basil', 'thyme']);
  fill(south[1], ['rosemary', 'chili_powder', 'cumin', 'italian', 'red_pepper', 'bay_leaves', 'salt', 'pepper', 'cinnamon', 'paprika']);
  fill(south[2], ['honey', 'maple_syrup', 'jelly', 'jam', 'peanut_butter', 'nuts', 'dried_fruit']);
  // root vegetables live in the baskets on the bottom shelf
  const baskets = where(grid(sys, 'pantry_B', H.root, { xs: spread(12.95, 14.79, 5), zs: [0.72], y: 0.45 + 0.03, name: 'in the basket', radius: 2.0 }), 'Pantry → baskets, bottom shelf');
  fill(baskets, ['potato', 'sweet_potato', 'onion_yellow', 'onion_red', 'garlic']);
  // name the cereal boxes after their atlas pictures
  let ci = 0; for (const it of sys.items.values()) if (it.def === 'cereal_0') { const k = ci++; it.name = it.baseName = ['fruity loops cereal', 'honey bees cereal', 'rainbow loops cereal'][k % 3]; const box = P.cerealBox(k % 8); it.object.clear(); it.object.add(...box.children); }

  // ---------------------------------------------------------------- cupboards and drawers
  const mod = (run, i) => run.info[i];
  const inCup = (run, i, label, xs, zs, ys = [0.13, 0.485]) => { const m = mod(run, i); for (const o of m.slots || []) o.enabled = () => false; const open = () => (m.doors || []).some(d => d.openAmount > 0.6); return ys.flatMap((y, k) => where(grid(sys, `${run.root.name || run.id}_${i}_cg${k}`, run.root, { xs: xs.map(x => m.xc + x), zs, y: y + 0.01, name: `in the ${label}`, enabled: open }), `Kitchen → ${label}`)); };
  const inDrawer = (run, i, label, xs, zs) => { const m = mod(run, i); for (const o of m.slots || []) o.enabled = () => false; const sl = m.drawer; const part = sl.part; return where(grid(sys, `${sl.id}_g`, part, { xs, zs, y: -(m.fh0 || 0.2) / 2 + 0.03, name: `in the ${label}`, enabled: () => sl.t > 0.7 }), `Kitchen → ${label}`); };
  H.runNL.id = 'runNL'; H.runNR.id = 'runNR'; H.island.id = 'island'; H.runE.id = 'runE';
  // plates cupboard (left of the range), cookware cupboard (right of the range)
  const plates = inCup(H.runNL, 1, 'plate cupboard', [-0.27, 0, 0.27], [-0.12, 0.12]);
  fill(plates, ['dinner_plate', 'dinner_plate', 'pasta_bowl', 'pasta_bowl', 'small_plate', 'soup_bowl', 'dinner_plate', 'pasta_bowl', 'platter', 'soup_bowl', 'small_plate', 'dinner_plate']);
  const cookware = inCup(H.runNR, 2, 'cookware cupboard', [-0.26, 0.0, 0.26], [0.0]);
  fill(cookware, ['stockpot', 'colander', 'mixing_bowl_2', 'saucepan', 'frying_pan', 'baking_tray']);
  const cook2 = inCup(H.runNR, 0, 'cookware cupboard', [0.0], [-0.1, 0.12], [0.13, 0.485]);
  fill(cook2, ['muffin_tray', 'saucepan', 'stockpot']);
  // cutlery drawer, utensil drawer, linen drawer
  const cutlery = inDrawer(H.runNL, 0, 'cutlery drawer', [-0.2, -0.1, 0, 0.1, 0.2], [-0.32, -0.12]);
  fill(cutlery, ['fork', 'fork', 'spoon_table', 'spoon_table', 'butter_knife', 'kid_knife', 'chopsticks', 'fork', 'spoon_table', 'butter_knife'], { grip: [0, -0.02, 0.05] });
  const utensils = inDrawer(H.runNL, 2, 'utensil drawer', [-0.3, -0.15, 0, 0.15, 0.3], [-0.3, -0.08]);
  fill(utensils, ['spatula', 'whisk', 'ladle', 'tongs', 'masher', 'peeler', 'pasta_server', 'spatula'], { grip: [0, -0.02, 0.06] });
  const linens = inDrawer(H.runNR, 3, 'towel drawer', [-0.12, 0.12], [-0.3, -0.1]);
  fill(linens, ['towel_blue', 'oven_mitts', 'towel_stripe', 'napkins']);
  const equip = inDrawer(H.island, 0, 'baking drawer', [-0.25, 0, 0.25], [-0.3, -0.12]);
  fill(equip, ['measuring_cup', 'rolling_pin', 'grater', 'whisk']);
  // island cupboard: cutting boards and the big bowl
  const islandCup = inCup(H.island, 2, 'island cupboard', [-0.22, 0.22], [0.0]);
  fill(islandCup, ['cutting_board', 'cutting_board', 'mixing_bowl_2']);
  // glassware in the glass uppers
  for (const [g, label] of [[H.glassL, 'left glass cupboard'], [H.glassR, 'right glass cupboard']]) {
    const open = () => g.doors.some(d => d.openAmount > 0.6);
    const sl = [0.36, 0.69].flatMap((f, k) => where(grid(sys, `${label}_${k}`.replace(/ /g, '_'), g.root, { xs: [0.25, 0.55, 0.85, 1.15, 1.4], zs: [0.05], y: 1.05 * f + 0.012, name: `in the ${label}`, enabled: open, radius: 2.1 }), `Kitchen → ${label}`));
    fill(sl, label.startsWith('left') ? ['water_glass', 'water_glass', 'tall_glass', 'juice_glass', 'water_glass', 'tall_glass'] : ['pitcher', 'juice_glass', 'tall_glass', 'water_glass']);
  }
  // cutting-board slots: what you put on a board can be chopped
  for (const it of sys.items.values()) if (it.def === 'cutting_board') {
    const b = it;
    const s = sys.addSlot(new Slot({ id: `board_${b.id}`, name: 'on the cutting board', parent: b.object, pos: [0, 0.027, 0], radius: 1.7, enabled: () => !b.held && !!b.slot && !b.slot.id.includes('cg'), accepts: x => x.tags.has('choppable') }));
    reg.set(s, 'on a cutting board');
  }
  // place names for the remaining slots (generated earlier by the kitchen)
  for (const s of sys.slots.values()) if (!reg.has(s)) reg.set(s, placeName(s));
  return { put };
}

/** a readable place for any slot, from its id */
export function placeName(s) {
  const id = s.id;
  const rules = [[/^island_top/, 'Kitchen → island'], [/^kitchen_table/, 'Kitchen → dining table'], [/^range_burner/, 'Kitchen → range burner'], [/^range_griddle/, 'Kitchen → griddle'], [/^range_.*rack/, 'Kitchen → oven'],
    [/^kitchen_fridge/, 'Fridge'], [/^kitchen_freezer/, 'Freezer'], [/^kitchen_runW_sink/, 'Kitchen → sink'], [/^kitchen_runW_bev/, 'Kitchen → soda fridge'], [/^kitchen_runW_dw/, 'Kitchen → dishwasher'], [/^kitchen_runW/, 'Kitchen → sink counter'],
    [/^coffee/, 'Kitchen → coffee nook'], [/^niche_shelf/, 'Kitchen → shelves over the sink'], [/^pantry_run_top/, 'Pantry → counter'], [/^pantry/, 'Pantry'], [/^kitchen_runE/, 'Kitchen → serving counter'], [/^kitchen_runN/, 'Kitchen → range-wall counter'],
    [/^kitchen_glass/, 'Kitchen → glass cupboard'], [/^island_/, 'Kitchen → island'], [/^board_/, 'on a cutting board'], [/^kitchen_runS/, 'Kitchen']];
  for (const [re, name] of rules) if (re.test(id)) return name;
  return 'Kitchen';
}
