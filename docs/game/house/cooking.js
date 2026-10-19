// The cooking engine: what is inside every pot, pan, bowl, tray and plate, how heat changes it,
// and the "use what you're holding on that" actions that move food between them.
//
//  * contents live in item.state.c (saved with the item), e.g.
//      stockpot  { water: 2.8, temp: 100, food: [{ k: 'spaghetti', t: 31, st: 'cooked' }] }
//      saucepan  { temp: 82, sauce: 'marinara', dish: 'pasta_marinara' }
//      mixing bowl { add: { flour: 1, milk: 1, egg: 1 }, mix: 'pancake_batter' }
//      plate     { dish: 'pancakes', garnish: ['butter', 'syrup'] }
//  * burners and the griddle heat whatever sits on them; the pot filler fills a pot under it
//  * everything is driven by real world state, so the recipe book can check it
import * as THREE from 'three/webgpu';
import { Interactable, Item, CLIP_RANGES } from './interact.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
/** game cooking times in seconds (casual, kid-friendly speed) */
export const TIMES = { spaghetti: 30, fettuccine: 32, penne: 34, macaroni: 26, rigatoni: 36, linguine: 30, bowtie: 30, pancakeSide: 7, cookies: 12, cupcakes: 8, cool: 8, sauce: 6 };
const PASTA = ['spaghetti', 'fettuccine', 'penne', 'macaroni', 'rigatoni', 'linguine', 'bowtie'];
/** what one "add" of an ingredient uses from its package */
const PORTION = { flour: 150, milk: 250, sugar: 60, brown_sugar: 60, butter: 1, egg: 1, chocolate_chips: 120, spaghetti: 200, fettuccine: 200, penne: 200, macaroni: 200, rigatoni: 200, linguine: 200, bowtie: 200, marinara: 350, alfredo: 300, syrup: 40, olive_oil: 15, cream: 120, oats: 80 };
/** batters and doughs a stirred bowl can become (most specific first) */
const MIXES = [
  { mix: 'cookie_dough', name: 'cookie dough', needs: ['flour', 'butter', 'sugar', 'chocolate_chips'], col: 0xD9B07A },
  { mix: 'pancake_batter', name: 'pancake batter', needs: ['flour', 'milk', 'egg'], col: 0xF2DCA8 },
  { mix: 'cupcake_batter', name: 'cupcake batter', needs: ['flour', 'milk'], col: 0xF3E3C3 },
];
const ADDABLE = ['flour', 'milk', 'egg', 'sugar', 'brown_sugar', 'butter', 'baking_powder', 'baking_soda', 'vanilla', 'chocolate_chips', 'cocoa', 'salt', 'oats'];
export const DISH_NAMES = { spaghetti_marinara: 'spaghetti marinara', fettuccine_alfredo: 'fettuccine alfredo', pancakes: 'pancakes', cookies: 'chocolate chip cookies', fruit_salad: 'fruit salad', pasta_plain: 'plain pasta' };

/** the ingredient "kind" an item counts as for cooking (one of its tags) */
export function kindOf(it) {
  const t = it.tags;
  for (const k of ['flour', 'milk', 'egg', 'brown_sugar', 'sugar', 'butter', 'baking_powder', 'baking_soda', 'vanilla', 'chocolate_chips', 'cocoa', 'salt', 'oats', 'marinara', 'alfredo', 'parmesan', 'basil', 'olive_oil', 'garlic', 'syrup', 'cream', ...PASTA]) if (t.has(k)) return k;
  if (t.has('fruit')) return it.def || it.id;
  return null;
}
const cap = s => s[0].toUpperCase() + s.slice(1);

export class Cooking {
  constructor(H) {
    this.H = H; this.sys = H.sys; this.game = H.game;
    this.flags = {};               // milestones the recipe book reads (water boiled, pasta drained…)
    this.griddle = { food: [], temp: 20 };   // pancakes cooking on the flat-top
    this.listeners = [];
    this.fx = [];
    this.sys.combine = (held, target) => this.combine(held, target);
    this.buildStationVerbs();
    this.visualCache = new Map();
  }
  /** plates and bowls with a finished meal can be eaten (or shared at the table) */
  makeEdible(it) {
    const u0 = it.useVerb;
    it.useVerb = (s, x) => {
      const c = x.state.c;
      if (c?.dish) return { label: `Eat the ${DISH_NAMES[c.dish] || 'food'}`, clip: 'PickUp', run: () => { const d = DISH_NAMES[c.dish]; c.dish = null; c.garnish = []; x.state.clean = false; this.changed(x, `Yum! That ${d} was delicious.`); s.sfx('eat'); this.game.friend?.cheer?.(); } };
      return u0 ? u0(s, x) : null;
    };
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }
  flag(k) { if (!this.flags[k]) { this.flags[k] = true; this.emit('flag', k); this.sys.changed(); } }
  C(it) { return it.state.c || (it.state.c = {}); }

  // ------------------------------------------------------------------ station interactables
  buildStationVerbs() {
    const H = this.H, sys = this.sys, rg = H.range;
    // the griddle: pour batter, flip, serve (verbs depend on what you hold)
    const gr = new Interactable({ id: 'griddle_cook', name: 'griddle', object: rg.root, anchor: [0, rg.H + 0.06, 0.05], radius: 1.6, save: false });
    gr.verb = s => this.griddleVerb(s);
    sys.add(gr); this.griddleI = gr;
    // the pot filler's valve: only when the arm is swung out
    const pf = H.potFiller;
    this.filler = { on: false, stream: null };
    const valve = new Interactable({ id: 'pot_filler_valve', name: 'pot filler tap', object: pf.spout, anchor: [0, 0.02, 0], radius: 1.8, save: false });
    valve.verb = s => {
      if (pf.hinge.openAmount < 0.9) return null;
      if (this.filler.on) return { label: 'Turn off the pot filler', clip: 'PickUp', run: () => this.setFiller(false) };
      return { label: 'Turn on the pot filler', clip: 'PickUp', run: () => this.setFiller(true) };
    };
    sys.add(valve);
    const sm = new THREE.MeshStandardNodeMaterial({ color: 0xBFE6F2, transparent: true, opacity: 0.7, roughness: 0.05 });
    this.filler.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 8, 1, true), sm); this.filler.stream.visible = false; this.game.scene.add(this.filler.stream);
    // the sink as a drain (when you hold a pot of water and there's no colander)
    const sk = H.sink;
    const drain = new Interactable({ id: 'sink_drain', name: 'sink', object: sk.root, anchor: [sk.mouth.x, sk.basinY + 0.15, 0.05], radius: 1.7, save: false });
    drain.verb = s => this.sinkVerb(s);
    sys.add(drain);
    // oven mitts: a wearable
    this.game.mitts = false;
  }

  setFiller(on) {
    this.filler.on = on; this.sys.sfx('tap', on);
    if (!on) this.filler.stream.visible = false;
  }
  /** world position of the pot filler's spout tip */
  spoutTip(out = new THREE.Vector3()) { const s = this.H.potFiller.spout; s.updateWorldMatrix(true, false); return out.set(0, -0.045, 0).applyMatrix4(s.matrixWorld); }

  // ------------------------------------------------------------------ "use held on target"
  combine(held, target) {
    if (!held || !target || held === target || target.held || target.state?.gone) return null;
    const hk = kindOf(held), hc = held.state.c, tc = target.state.c, T = target.tags, Hd = held.tags;
    const sys = this.sys;
    // ---- mixing bowl: add ingredients, add chopped fruit, stir
    if (T.has('bowl') || T.has('mixing')) {
      const c = this.C(target);
      if (c.mix && !c.mix.endsWith('_raw')) {
        if (Hd.has('servable') && c.mix === 'fruit_salad') return null;
      }
      if (hk && ADDABLE.includes(hk) && !c.mix) {
        if (this.empty(held)) return { label: `The ${held.name} is empty`, disabled: true, run: () => sys.toast(`That ${held.name} is all used up. There may be more in the pantry or fridge.`) };
        if ((c.add || {})[hk] >= 2) return null;
        return { label: `Add ${hk === 'egg' ? 'an egg' : held.name} to the bowl`, clip: 'PickUp', run: () => this.addTo(target, held, hk) };
      }
      if (held.tags.has('fruit') && held.state.chopped && !c.mix) return { label: `Add the ${held.name} to the bowl`, clip: 'PickUp', run: () => this.addFruit(target, held) };
      if (held.tags.has('fruit') && !held.state.chopped && !c.mix) return { label: `Chop the ${held.name} on a cutting board first`, disabled: true, run: () => sys.toast('Put the fruit on the cutting board, then use the kid-safe knife.') };
      if ((Hd.has('spoon') || Hd.has('whisk')) && !c.mix && this.addCount(c) >= 2) return { label: `Stir the bowl with the ${held.name}`, clip: 'PickUp', run: () => this.stir(target, held) };
      if (hc?.food?.some(f => f.st === 'cooked') && Hd.has('colander')) return { label: 'Tip the pasta into the bowl', clip: 'PickUp', run: () => this.moveFood(held, target) };
    }
    // ---- chopping on the cutting board
    if (Hd.has('knife') && T.has('choppable') && !target.state.chopped && target.slot?.id.startsWith('board')) {
      if (T.has('washable') && !target.state.clean) return { label: `Wash the ${target.name} in the sink first`, disabled: true, run: () => sys.toast(`Rinse the ${target.name} under the tap, then chop it.`) };
      return { label: `Chop the ${target.name}`, clip: 'PickUp', run: () => this.chop(target) };
    }
    // ---- pots and pans: pasta, sauce, oil, garlic
    if (T.has('pot') || T.has('pan')) {
      const c = this.C(target);
      if (hk && PASTA.includes(hk)) {
        if (!T.has('stockpot') && !T.has('saucepan')) return null;
        if ((c.water || 0) < 0.8) return { label: 'Fill the pot with water first', disabled: true, run: () => sys.toast('Put the pot on a burner, swing out the brass pot filler and turn it on.') };
        if ((c.temp || 20) < 98) return { label: 'Wait until the water boils', disabled: true, run: () => sys.toast('Turn the burner up and wait for big bubbles.') };
        if (c.food?.length) return null;
        return { label: `Add the ${held.name} to the boiling water`, clip: 'PickUp', run: () => this.addPasta(target, held, hk) };
      }
      if ((hk === 'marinara' || hk === 'alfredo') && !c.sauce && !(c.water > 0.2)) return { label: `Pour ${held.name} into the ${target.name}`, clip: 'PickUp', run: () => this.addSauce(target, held, hk) };
      if (hk === 'olive_oil' && !c.oil && !(c.water > 0.2)) return { label: `Drizzle olive oil in the ${target.name}`, clip: 'PickUp', run: () => { c.oil = true; this.use(held, 'olive_oil'); this.changed(target, 'Sizzle-ready!'); } };
      if (hk === 'garlic' && c.oil && !c.garlic) return { label: 'Add the garlic', clip: 'PickUp', run: () => { c.garlic = true; this.changed(target, 'Mmm, garlicky!'); } };
      if (Hd.has('colander') && hc?.food?.length && c.sauce && c.sauceWarm && !c.dish) return { label: 'Toss the pasta into the sauce', clip: 'PickUp', run: () => this.tossPasta(held, target) };
    }
    // ---- draining: pot of pasta into the colander in the sink
    if (T.has('colander') && Hd.has('pot') && hc?.water > 0.1) {
      if (!target.slot || !target.slot.id.includes('sink_basin')) return { label: 'Put the colander in the sink first', disabled: true, run: () => sys.toast('Set the colander in the sink, then pour the pot into it.') };
      if (hc.food?.length && hc.food.some(f => f.st !== 'cooked' && f.st !== 'soggy')) return { label: 'The pasta is not cooked yet', disabled: true, run: () => sys.toast('Keep it boiling until the timer says it is ready.') };
      return { label: hc.food?.length ? 'Pour the pasta into the colander' : 'Pour the water out', clip: 'PickUp', run: () => this.drain(held, target) };
    }
    // ---- serving onto plates and bowls
    if (T.has('servable') && target.state.clean !== false && !tc?.dish) {
      if (hc?.dish && (Hd.has('pot') || Hd.has('pan'))) return { label: `Serve the ${DISH_NAMES[hc.dish === 'pasta_marinara' ? 'spaghetti_marinara' : hc.dish === 'pasta_alfredo' ? 'fettuccine_alfredo' : hc.dish] || 'food'} into the ${target.name}`, clip: 'PickUp', run: () => this.serve(held, target) };
      if (hc?.mix === 'fruit_salad') return { label: `Serve the fruit salad into the ${target.name}`, clip: 'PickUp', run: () => this.serve(held, target) };
    }
    if (T.has('servable') && target.state.clean === false && (hc?.dish || hc?.baked || hc?.mix === 'fruit_salad')) return { label: `The ${target.name} is dirty: wash it first`, disabled: true, run: () => sys.toast('Rinse it in the sink, or use a clean one from the cupboard.') };
    if (T.has('servable') && Hd.has('tray') && hc?.baked && !hc.hot && !tc?.dish) return { label: 'Move the cookies onto the plate', clip: 'PickUp', run: () => this.serve(held, target) };
    if (Hd.has('servable') && T.has('tray') && tc?.baked && !hc?.dish) {
      if (tc.hot) return { label: 'Let the cookies cool first', disabled: true, run: () => sys.toast('They are still hot. Wait for the steam to stop.') };
      return { label: 'Move the cookies onto the plate', clip: 'PickUp', run: () => this.serve(target, held) };
    }
    // ---- garnish
    if (tc?.dish) {
      const g = tc.garnish || [];
      if (hk === 'parmesan' && /spaghetti|fettuccine|pasta/.test(tc.dish) && !g.includes('parmesan')) return { label: 'Sprinkle parmesan on top', clip: 'PickUp', run: () => this.garnish(target, 'parmesan') };
      if (hk === 'basil' && /spaghetti|pasta/.test(tc.dish) && !g.includes('basil')) return { label: 'Add fresh basil leaves', clip: 'PickUp', run: () => this.garnish(target, 'basil') };
      if (hk === 'butter' && tc.dish === 'pancakes' && !g.includes('butter')) return { label: 'Add a pat of butter', clip: 'PickUp', run: () => this.garnish(target, 'butter', held) };
      if (hk === 'syrup' && tc.dish === 'pancakes' && !g.includes('syrup')) return { label: 'Drizzle maple syrup', clip: 'PickUp', run: () => this.garnish(target, 'syrup', held) };
    }
    // ---- cookie dough onto a baking tray
    if (T.has('tray') && !T.has('muffin_tray') && hc?.mix === 'cookie_dough' && !tc?.dough && !tc?.baked) return { label: 'Scoop cookie dough onto the tray', clip: 'PickUp', run: () => this.scoop(held, target) };
    return null;
  }

  // ------------------------------------------------------------------ actions
  empty(it) { return it.state.qty !== undefined && it.state.qty <= 0; }
  use(it, k) {
    if (it.state.qty === undefined) return;
    it.state.qty = Math.max(0, it.state.qty - (PORTION[k] || 1));
    if (it.state.qty <= 0) this.sys.toast(`That was the last of the ${it.name}.`);
    it.onState?.();
  }
  addCount(c) { return Object.keys(c.add || {}).length + Object.keys(c.fruit || {}).length; }
  addTo(bowl, held, k) {
    const c = this.C(bowl); c.add = c.add || {}; c.add[k] = (c.add[k] || 0) + 1;
    this.use(held, k);
    this.sys.sfx(k === 'egg' ? 'click' : 'pour');
    if (k === 'egg') this.crackFx(bowl);
    this.changed(bowl, `${cap(k === 'egg' ? 'egg' : held.name)} in!`);
    this.emit('added', { k, bowl });
  }
  addFruit(bowl, fruit) {
    const c = this.C(bowl); c.fruit = c.fruit || {}; const k = fruit.def || fruit.id; c.fruit[k] = (c.fruit[k] || 0) + 1;
    this.consume(fruit);
    this.changed(bowl, `${cap(fruit.name)} in the bowl!`);
  }
  stir(bowl, spoon) {
    const c = this.C(bowl), sys = this.sys;
    c.stirring = 2.2; sys.sfx('stir'); sys.toast('Stir, stir, stir…');
    const fin = () => {
      c.stirring = 0;
      if (c.fruit && Object.keys(c.fruit).length >= 3) { c.mix = 'fruit_salad'; this.flag('mixed_fruit_salad'); this.changed(bowl, 'A colourful fruit salad! Serve it in a bowl.'); this.emit('mixed', { mix: 'fruit_salad', bowl }); return; }
      const has = Object.keys(c.add || {});
      const pref = this.H.recipeBook?.active?.mix;
      const ok = MIXES.filter(m => m.needs.every(n => has.includes(n)));
      const pick = ok.find(m => m.mix === pref) || ok[0];
      if (!pick) { this.changed(bowl, `Hmm, that needs more ingredients. Check the recipe book!`); return; }
      c.mix = pick.mix; this.flag('mixed_' + pick.mix); this.changed(bowl, `Smooth ${pick.name}!`); this.emit('mixed', { mix: pick.mix, bowl });
      if (pick.mix === 'cupcake_batter') bowl.tags.add('bakeable');
    };
    this.after(2.2, fin, () => { const sp = sys.held; if (sp) sp.object.rotation.y += 0.2; });
  }
  chop(fruit) {
    fruit.state.chopped = true; fruit.name = `chopped ${fruit.name.replace(/^chopped /, '')}`;
    this.sys.sfx('stir'); this.applyChopped(fruit);
    this.changed(fruit, `Chop chop! ${cap(fruit.name)}.`); this.emit('chopped', { fruit });
  }
  applyChopped(fruit) {
    if (!fruit.state.chopped || fruit.object.userData.chopped) return;
    fruit.object.userData.chopped = true;
    // swap the whole fruit for a little pile of pieces in its colour
    let col = 0xD32F2F; fruit.object.traverse(m => { if (m.isMesh && m.material?.color && col === 0xD32F2F) col = m.material.color.getHex(); });
    for (const ch of [...fruit.object.children]) ch.visible = false;
    const m = new THREE.MeshStandardNodeMaterial({ color: col, roughness: 0.5 });
    for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.022), m); p.position.set((Math.random() - 0.5) * 0.08, 0.009 + (i % 3) * 0.01, (Math.random() - 0.5) * 0.06); p.rotation.set(Math.random(), Math.random(), Math.random()); fruit.object.add(p); }
  }
  addPasta(pot, box, k) {
    const c = this.C(pot); c.food = [{ k, t: 0, st: 'cooking' }];
    this.use(box, k); this.sys.sfx('pour');
    this.changed(pot, `${cap(box.name)} in! Timer started.`); this.flag('pasta_in'); this.emit('pasta_in', { pot, k });
  }
  addSauce(pan, jar, k) { const c = this.C(pan); c.sauce = k; c.sauceT = 0; this.use(jar, k); this.sys.sfx('pour'); this.changed(pan, `${cap(jar.name)} in the ${pan.name}. Heat it up!`); }
  tossPasta(col, pan) {
    const cc = this.C(col), pc = this.C(pan);
    pc.dish = pc.sauce === 'alfredo' ? 'pasta_alfredo' : 'pasta_marinara'; pc.pasta = cc.food[0]?.k; cc.food = [];
    this.sys.sfx('stir'); this.changed(col); this.changed(pan, 'Tossed in the sauce. Now serve it into a pasta bowl!'); this.flag('combined'); this.emit('combined', { pan });
  }
  moveFood(from, to) { const fc = this.C(from), tc = this.C(to); tc.pasta = fc.food[0]?.k; tc.mix = 'pasta_plain'; fc.food = []; this.changed(from); this.changed(to, 'Pasta in the bowl.'); }
  drain(pot, col) {
    const pc = this.C(pot), cc = this.C(col), sys = this.sys;
    pot.pouring = 1.6; sys.sfx('pour');
    const sk = this.H.sink; sk.S.level = Math.min(sk.maxLevel, sk.S.level + 0.05);
    this.after(1.6, () => {
      pot.pouring = 0;
      if (pc.food?.length) { cc.food = pc.food.map(f => ({ ...f, st: f.st === 'soggy' ? 'soggy' : 'cooked', drained: true })); pc.food = []; this.flag('drained'); }
      pc.water = 0; pc.temp = 30;
      this.changed(pot); this.changed(col, cc.food?.length ? 'Drained! Steamy pasta in the colander.' : 'Water poured out.');
      this.emit('drained', { col });
    }, dt => { pot.object.rotation.z = Math.min(1.2, (pot.object.rotation.z || 0) + dt * 2); this.steam(col.object, 0.6); });
  }
  serve(from, plate) {
    const fc = this.C(from), pc = this.C(plate);
    if (fc.baked) { pc.dish = 'cookies'; fc.baked = false; fc.dough = false; }
    else if (fc.mix === 'fruit_salad') { pc.dish = 'fruit_salad'; fc.mix = null; fc.fruit = {}; fc.add = {}; }
    else { pc.dish = fc.dish === 'pasta_alfredo' ? 'fettuccine_alfredo' : 'spaghetti_marinara'; fc.dish = null; fc.sauce = null; fc.oil = fc.garlic = false; }
    pc.garnish = [];
    from.state.clean = false; plate.state.clean = true;
    this.sys.sfx('place');
    this.changed(from); this.changed(plate, `${cap(DISH_NAMES[pc.dish])} served!`);
    this.emit('served', { plate, dish: pc.dish });
  }
  garnish(plate, g, held) { const c = this.C(plate); c.garnish = [...(c.garnish || []), g]; if (held) this.use(held, g === 'syrup' ? 'syrup' : 'butter'); this.sys.sfx('place'); this.changed(plate, { parmesan: 'Cheesy!', basil: 'Fresh basil on top!', butter: 'A melty pat of butter!', syrup: 'Drip drip, maple syrup!' }[g]); this.emit('garnish', { plate, g }); }
  scoop(bowl, tray) { const bc = this.C(bowl), tc = this.C(tray); tc.dough = true; bc.mix = null; bc.add = {}; bowl.state.clean = false; this.sys.sfx('place'); this.changed(bowl); this.changed(tray, 'Twelve cookie dough balls! Bake them in the big oven.'); this.flag('scooped'); this.emit('scooped', { tray }); }
  /** the ingredient is used up in the recipe (it comes back to its home later, fresh) */
  consume(it) {
    const sys = this.sys;
    if (sys.held === it) { sys.held = null; }
    if (it.slot) { it.slot.item = null; it.slot = null; }
    it.held = false; it.state.gone = true; it.state.goneAt = Date.now(); it.object.visible = false; this.H.root.add(it.object);
    sys.changed();
  }

  // ------------------------------------------------------------------ griddle and sink verbs
  griddleVerb(s) {
    const G = this.griddle, held = s.held, rg = this.H.range, on = rg.griddle.level > 0;
    if (held && held.state.c?.mix === 'pancake_batter') {
      if (!on) return { label: 'Turn on the griddle first', disabled: true, run: () => s.toast('Click the middle red knob to heat the griddle.') };
      if (G.temp < 170) return { label: 'Wait for the griddle to heat up', disabled: true, run: () => s.toast('Almost hot… watch for the glow.') };
      if (G.food.length) return null;
      return { label: 'Pour pancakes on the griddle', clip: 'PickUp', run: () => { G.food = [0, 1, 2].map(i => ({ i, side: 0, t: 0, st: 'raw' })); held.state.c.mix = null; held.state.c.add = {}; held.state.clean = false; this.changed(held); s.sfx('pour'); s.toast('Sizzle! Wait for the bubbles, then flip.'); this.syncGriddle(); this.flag('pancakes_poured'); } };
    }
    if (!G.food.length) return null;
    const ready = G.food.every(p => p.side === 0 && p.t >= TIMES.pancakeSide);
    if (ready) {
      if (!held?.tags.has('spatula')) return { label: 'Flip the pancakes: grab the spatula', disabled: true, run: () => s.toast('The spatula is in the utensil drawer, to the left of the range.') };
      return { label: 'Flip the pancakes', clip: 'PickUp', run: () => { for (const p of G.food) { p.side = 1; p.t = 0; } s.sfx('place'); s.toast('Flip! Golden side up.'); this.syncGriddle(); this.flag('pancakes_flipped'); } };
    }
    const done = G.food.every(p => p.side === 1 && p.t >= TIMES.pancakeSide * 0.8);
    if (done && held?.tags.has('servable') && !held.state.c?.dish && held.state.clean === false) return { label: 'That plate is dirty: wash it first', disabled: true, run: () => s.toast('Rinse it in the sink or grab a clean plate from the cupboard left of the range.') };
    if (done && held?.tags.has('servable') && !held.state.c?.dish) return { label: 'Stack the pancakes on the plate', clip: 'PickUp', run: () => { G.food = []; const c = this.C(held); c.dish = 'pancakes'; c.garnish = []; this.syncGriddle(); this.changed(held, 'A fluffy stack! Add butter and maple syrup.'); this.emit('served', { plate: held, dish: 'pancakes' }); } };
    if (done) return { label: 'Pancakes are ready: bring a plate', disabled: true, run: () => s.toast('Plates are in the cupboard to the left of the range.') };
    return null;
  }
  sinkVerb(s) {
    const held = s.held; if (!held) return null;
    const c = held.state.c;
    if ((held.tags.has('pot') || held.tags.has('pan')) && c?.water > 0.1) {
      const col = [...this.sys.items.values()].find(i => i.tags.has('colander') && i.slot?.id.includes('sink_basin'));
      if (c.food?.length && !col) return { label: 'Put the colander in the sink first', disabled: true, run: () => s.toast('The colander is in the cookware cupboard right of the range.') };
      if (col) return this.combine(held, col);
      return { label: 'Pour the water out', clip: 'PickUp', run: () => { c.water = 0; c.temp = 25; this.changed(held, 'Glug glug.'); s.sfx('pour'); } };
    }
    return null;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const H = this.H, g = this.game, rg = H.range, sys = this.sys;
    rg.root.updateWorldMatrix(true, false);
    // timed actions (stirring, pouring)
    this.fx = this.fx.filter(f => { f.t -= dt; f.tick?.(dt); if (f.t <= 0) { f.done(); return false; } return true; });
    // ---- burners heat what sits on them
    const onBurner = new Set();
    for (const br of rg.burners) {
      const it = br.slot.item; if (!it) continue;
      onBurner.add(it);
      const c = this.C(it), power = [0, 0.5, 1, 1.6][br.dial.level];
      this.heat(it, c, power, dt);
    }
    // cookware off the heat cools down
    for (const it of sys.items.values()) {
      const c = it.state.c; if (!c || onBurner.has(it)) continue;
      if (c.temp !== undefined && c.temp > 22) { c.temp = Math.max(20, c.temp - dt * 4); if (c.temp > 60 && Math.random() < 0.08) this.steam(it.object, 0.3); }
      // a hot tray out of the oven cools
      if (c.hot && !String(it.slot?.id || '').includes('range_')) { c.hot = Math.max(0, c.hot - dt); if (Math.random() < 0.3) this.steam(it.object, 0.5); if (!c.hot) { this.changed(it, 'The cookies have cooled. Put them on a plate!'); this.flag('cookies_cooled'); } }
    }
    // ---- griddle
    const G = this.griddle;
    const gOn = rg.griddle.level > 0;
    G.temp = THREE.MathUtils.clamp(G.temp + (gOn ? 32 : -10) * dt, 20, 210);
    if (gOn && G.temp >= 170 && !this._gReadySaid) { this._gReadySaid = true; sys.toast('Griddle ready! Add some food.'); }
    if (!gOn) this._gReadySaid = false;
    if (G.food.length && gOn && G.temp > 150) {
      for (const p of G.food) {
        p.t += dt;
        if (p.side === 0 && p.t >= TIMES.pancakeSide && !p.bubbled) { p.bubbled = true; }
        if (p.t > TIMES.pancakeSide * 2.2 && !p.dark) { p.dark = true; }
      }
      if (G.food[0].side === 0 && G.food[0].t >= TIMES.pancakeSide && !this._flipSaid) { this._flipSaid = true; sys.toast('Bubbles! Time to flip the pancakes.'); }
      if (G.food[0].side === 1 && G.food[0].t >= TIMES.pancakeSide * 0.8 && !this._doneSaid) { this._doneSaid = true; sys.toast('Pancakes cooked! Bring a plate.'); }
      if (Math.random() < 0.15) { const p = V3(0, rg.H + 0.03, -0.02).applyMatrix4(rg.root.matrixWorld); g.fxFoam?.emit(p, V3(0, 0.35, 0), { life: 1.2, size: 0.08, grow: 1.6, alpha: 0.14 }); }
      g.audio?.houseLoop?.('sizzle', 0.6);
      this.syncGriddle();
    } else { this._flipSaid = this._doneSaid = false; }
    // ---- pot filler
    // the pot filler swings over the first pot it finds on a burner
    { let aim = null; for (const br of rg.burners) { const it = br.slot.item; if (it?.tags.has('pot') && !aim) aim = br.slot.world(V3(0, 0, 0)); } H.potFiller.target = aim; }
    if (this.filler.on) {
      const tip = this.spoutTip(V3(0, 0, 0));
      let target = null, bd = 0.12;
      for (const br of rg.burners) { const it = br.slot.item; if (!it || !it.tags.has('pot')) continue; const p = br.slot.world(V3(0, 0, 0)); const d = Math.hypot(p.x - tip.x, p.z - tip.z); if (d < bd) { bd = d; target = it; } }
      const floorY = target ? target.object.getWorldPosition(V3(0, 0, 0)).y + 0.02 + (this.C(target).water || 0) / (ITEMCAP(target)) * 0.18 : rg.root.getWorldPosition(V3(0, 0, 0)).y + rg.H + 0.06;
      const st = this.filler.stream, len = Math.max(0.05, tip.y - floorY);
      st.visible = true; st.position.set(tip.x, tip.y - len / 2, tip.z); st.scale.set(1, len, 1);
      if (target) {
        const c = this.C(target), capL = ITEMCAP(target) * 0.75;
        c.water = Math.min(capL, (c.water || 0) + dt * 0.5); c.temp = c.temp ?? 18;
        if (Math.random() < 0.4) g.fxWater?.emit(V3(tip.x, floorY + 0.02, tip.z), V3((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4), { life: 0.25, size: 0.02, gravity: 6 });
        if (c.water >= capL - 1e-3) { this.setFiller(false); this.changed(target, `The ${target.name} is full of water!`); this.flag('pot_filled'); this.emit('filled', { pot: target }); }
        else this.changed(target, null, true);
      } else if (!this._fillWarn) { this._fillWarn = true; sys.toast('Put a pot on a back burner under the pot filler!'); setTimeout(() => { this._fillWarn = false; }, 4000); }
      g.audio?.houseTap?.(true);
    }
    // ---- consumed groceries come back fresh after a while
    if (Math.random() < 0.02) for (const it of sys.items.values()) {
      if (it.state.gone && Date.now() - (it.state.goneAt || 0) > 120000 && it.home && !it.home.item) { it.state.gone = false; it.state.chopped = false; it.state.clean = it.def ? undefined : it.state.clean; it.object.visible = true; delete it.object.userData.chopped; it.object.children.forEach(ch => { if (ch.isMesh && ch.geometry?.parameters?.width === 0.022) it.object.remove(ch); else ch.visible = true; }); it.name = it.baseName || it.name.replace(/^chopped /, ''); sys.place(it, it.home); }
    }
    // oven bakes trays (the house's oven code handles cupcakes)
    // visuals of anything heating
    for (const it of onBurner) this.syncVisual(it);
  }

  heat(it, c, power, dt) {
    const sys = this.sys, g = this.game;
    const water = c.water || 0;
    if (power > 0) {
      const rate = water > 0.05 ? power * 14 / (0.5 + water) : power * 22;
      c.temp = Math.min(water > 0.05 ? 100 : 220, (c.temp ?? 20) + rate * dt);
    } else c.temp = Math.max(20, (c.temp ?? 20) - dt * 3);
    const t = c.temp;
    // stages the recipe book and the player can see
    const stage = water > 0.05 ? (t >= 99.5 ? 'boiling' : t >= 90 ? 'simmering' : t >= 70 ? 'hot' : t >= 40 ? 'warming' : 'cold') : null;
    if (stage && stage !== c.stage) { c.stage = stage; if (stage === 'boiling') { sys.toast(`The water is boiling!${c.food?.length ? '' : ' Add the pasta.'}`); this.flag('boiled'); this.emit('boiling', { pot: it }); } }
    // pasta cooks only in boiling water
    for (const f of c.food || []) {
      if (water > 0.3 && t >= 96) {
        f.t += dt; const T = TIMES[f.k] || 30;
        if (f.st === 'cooking' && f.t >= T) { f.st = 'cooked'; sys.sfx('ding'); sys.toast('Pasta is ready! Turn off the burner and drain it in the sink.'); this.flag('pasta_cooked'); this.emit('cooked', { pot: it }); }
        if (f.st === 'cooked' && f.t >= T * 1.6) { f.st = 'soggy'; sys.toast('Oops, the pasta got a little soggy. It still tastes fine!'); }
        else if (f.st === 'cooked' && f.t >= T * 1.3 && !f.warned) { f.warned = true; sys.toast('Hurry! Turn off the burner before the pasta gets soggy.'); }
      }
    }
    // sauce warms when there's no water
    if (c.sauce && water < 0.05 && power > 0) {
      c.sauceT = (c.sauceT || 0) + dt * power;
      if (!c.sauceWarm && c.sauceT >= TIMES.sauce) { c.sauceWarm = true; sys.toast('The sauce is bubbling! Add the drained pasta.'); this.flag('sauce_warm'); }
    }
    // steam and bubbles
    if (water > 0.05 && t > 70 && Math.random() < (t - 70) / 60) this.steam(it.object, (t - 60) / 40);
    if (c.sauce && power > 0 && Math.random() < 0.1) this.steam(it.object, 0.4);
    if (water > 0.05 && t >= 99.5) g.audio?.houseLoop?.('sizzle', 0.25);
  }

  steam(obj, k = 1) {
    const g = this.game; if (!g.fxFoam || !this.H.indoors) return;
    const p = obj.getWorldPosition(V3(0, 0, 0)); p.y += 0.12;
    const fan = this.H.hood?.fan?.level || 0;
    g.fxFoam.emit(p.add(V3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)), V3(0, 0.3 + fan * 0.3, 0), { life: fan ? 1 : 2, size: 0.08 * (0.6 + k), grow: 1.6, alpha: 0.12 });
  }
  crackFx(bowl) { const g = this.game, p = bowl.object.getWorldPosition(V3(0, 0, 0)); p.y += 0.12; for (let i = 0; i < 6; i++) g.fxGlow?.emit(p, V3((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6), { life: 0.4, size: 0.02, gravity: 5, color: [1, 0.95, 0.85] }); }
  after(t, done, tick) { this.fx.push({ t, done, tick }); }
  changed(it, msg, quiet) { this.syncVisual(it); if (msg) this.sys.toast(msg); if (!quiet) this.sys.changed(); }

  // ------------------------------------------------------------------ what you see inside things
  syncVisual(it) {
    const c = it.state.c || {}, o = it.object;
    let v = o.userData.contents;
    if (!v) { v = new THREE.Group(); v.name = 'contents'; o.add(v); o.userData.contents = v; }
    const inv = 1 / (it.baseScale || 1); v.scale.setScalar(inv);
    const key = JSON.stringify([c.water > 0.05 ? Math.round(c.water * 10) : 0, c.stage, c.food?.map(f => f.st), c.sauce, c.sauceWarm, c.dish, c.garnish, c.mix, c.add && Object.keys(c.add).sort(), c.fruit && Object.keys(c.fruit), c.dough, c.baked, !!c.hot, c.pasta, c.oil, c.garlic]);
    if (v.userData.key === key) return; v.userData.key = key;
    v.clear();
    const dims = DIMS(it);
    const disk = (r, y, col, op = 1, rough = 0.4) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 28), new THREE.MeshStandardNodeMaterial({ color: col, roughness: rough, transparent: op < 1, opacity: op })); m.position.y = y; v.add(m); return m; };
    // water level
    if (c.water > 0.05) disk(dims.r * 0.96, dims.y0 + Math.min(1, c.water / ITEMCAP(it)) * dims.h, c.stage === 'boiling' ? 0xD8EEF4 : 0x9ED6E6, 0.75, 0.05);
    // pasta in the pot or colander
    const pastaK = c.food?.[0];
    if (pastaK) v.add(pastaMesh(pastaK.st, dims, c.water > 0.05 ? dims.y0 + Math.min(1, c.water / ITEMCAP(it)) * dims.h * 0.6 : dims.y0 + 0.01));
    if (c.oil && !c.sauce) disk(dims.r * 0.7, dims.y0 + 0.004, 0xC9A227, 0.6, 0.1);
    if (c.sauce) disk(dims.r * 0.92, dims.y0 + 0.02, c.sauce === 'alfredo' ? 0xF2E6C9 : 0xB3261E, 1, 0.35);
    if (c.dish === 'pasta_marinara' || c.dish === 'pasta_alfredo') { v.add(pastaMesh('cooked', dims, dims.y0 + 0.025)); }
    // the mixing bowl
    if (c.add && Object.keys(c.add).length && !c.mix) {
      const mixed = Object.keys(c.add); const col = mixed.includes('egg') ? 0xF6E3A6 : mixed.includes('milk') ? 0xF8F4EC : 0xFBF8F1;
      disk(dims.r * 0.75, dims.y0 + 0.03, col, 1, 0.7);
      if (c.add.chocolate_chips) for (let i = 0; i < 10; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardNodeMaterial({ color: 0x3B2314 })); d.position.set((Math.random() - 0.5) * dims.r, dims.y0 + 0.035, (Math.random() - 0.5) * dims.r); v.add(d); }
    }
    if (c.fruit && !c.mix) fruitPile(v, Object.keys(c.fruit), dims);
    if (c.mix) {
      const m = MIXES.find(x => x.mix === c.mix);
      if (m) disk(dims.r * 0.78, dims.y0 + 0.04, m.col, 1, 0.75);
      if (c.mix === 'fruit_salad') fruitPile(v, Object.keys(c.fruit || {}).length ? Object.keys(c.fruit) : ['apple_red', 'banana', 'grapes'], dims, true);
      if (c.mix === 'cookie_dough') for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardNodeMaterial({ color: 0x3B2314 })); d.position.set((Math.random() - 0.5) * dims.r * 1.2, dims.y0 + 0.045, (Math.random() - 0.5) * dims.r * 1.2); v.add(d); }
      if (c.mix === 'pasta_plain') v.add(pastaMesh('cooked', dims, dims.y0 + 0.02));
    }
    // baking tray: dough balls, then cookies
    if (c.dough || c.baked) for (let i = 0; i < 12; i++) {
      const x = -0.14 + (i % 4) * 0.093, z = -0.08 + Math.floor(i / 4) * 0.08;
      const ck = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 8), new THREE.MeshStandardNodeMaterial({ color: c.baked ? 0xC98B3E : 0xD9B07A, roughness: 0.8 }));
      ck.scale.set(1, c.baked ? 0.35 : 0.75, 1); ck.position.set(x, 0.012, z); v.add(ck);
      for (let j = 0; j < 3; j++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.005, 5, 4), new THREE.MeshStandardNodeMaterial({ color: 0x3B2314 })); d.position.set(x + (j - 1) * 0.01, c.baked ? 0.022 : 0.03, z + ((j % 2) - 0.5) * 0.012); v.add(d); }
    }
    // finished dishes on plates and bowls
    if (c.dish && it.tags.has('servable')) v.add(dishMesh(c.dish, c.garnish || [], dims));
    // a used plate shows a smudge
    if (it.state.clean === false && !c.dish && it.tags.has('dish')) { const s = disk(dims.r * 0.4, dims.y0 + 0.002, 0x8A5A2E, 0.8, 0.9); s.scale.set(1, 0.3, 0.7); }
  }

  syncGriddle() {
    const rg = this.H.range, G = this.griddle;
    let v = this._gv;
    if (!v) { v = this._gv = new THREE.Group(); rg.root.add(v); v.position.set(0, rg.H + 0.022, -0.02); }
    const key = G.food.map(p => `${p.side}${p.t >= TIMES.pancakeSide ? 1 : 0}${p.dark ? 1 : 0}`).join(',');
    if (v.userData.key === key) return; v.userData.key = key; v.clear();
    for (const p of G.food) {
      const done = p.t >= TIMES.pancakeSide;
      const col = p.side === 1 ? (p.dark ? 0x9A5A22 : 0xC8853A) : done ? 0xE8C88A : 0xF2DCA8;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 24), new THREE.MeshStandardNodeMaterial({ color: col, roughness: 0.75 }));
      m.position.set(0, 0.006, -0.17 + p.i * 0.17); v.add(m);
      if (p.side === 0 && done) for (let b = 0; b < 8; b++) { const bub = new THREE.Mesh(new THREE.SphereGeometry(0.004, 5, 4), new THREE.MeshStandardNodeMaterial({ color: 0xD8B878 })); bub.position.set((Math.random() - 0.5) * 0.07, 0.013, -0.17 + p.i * 0.17 + (Math.random() - 0.5) * 0.07); v.add(bub); }
    }
  }

  // ------------------------------------------------------------------ save
  save() { return { flags: this.flags, griddle: this.griddle.food }; }
  load(d) { if (!d) return; this.flags = d.flags || {}; this.griddle.food = d.griddle || []; this.syncGriddle(); }
}

// ------------------------------------------------------------------ container shapes for the contents visuals
function ITEMCAP(it) { return { stockpot: 4, saucepan: 1.5, frying_pan: 0.6 }[it.def] || 2; }
function DIMS(it) {
  const d = {
    stockpot: { r: 0.125, y0: 0.01, h: 0.19 }, saucepan: { r: 0.082, y0: 0.01, h: 0.085 }, frying_pan: { r: 0.115, y0: 0.008, h: 0.04 },
    colander: { r: 0.09, y0: 0.02, h: 0.07 }, mixing_bowl_2: { r: 0.12, y0: 0.012, h: 0.09 }, bowl: { r: 0.1, y0: 0.012, h: 0.1 },
    dinner_plate: { r: 0.11, y0: 0.017, h: 0.03 }, small_plate: { r: 0.085, y0: 0.017, h: 0.03 }, platter: { r: 0.13, y0: 0.017, h: 0.03 },
    pasta_bowl: { r: 0.1, y0: 0.01, h: 0.045 }, soup_bowl: { r: 0.065, y0: 0.01, h: 0.05 }, baking_tray: { r: 0.17, y0: 0.006, h: 0.02 },
  }[it.def || it.id];
  return d || { r: 0.1, y0: 0.012, h: 0.08 };
}
function pastaMesh(st, dims, y) {
  const g = new THREE.Group();
  const col = st === 'soggy' ? 0xF2E7B8 : st === 'cooked' ? 0xF2D98A : 0xE8C46A;
  const m = new THREE.MeshStandardNodeMaterial({ color: col, roughness: 0.55 });
  if (st === 'cooking' || st === 'dry') {
    for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, dims.h * 1.4, 4), m); s.position.set((Math.random() - 0.5) * dims.r * 0.5, y + dims.h * 0.5, (Math.random() - 0.5) * dims.r * 0.5); s.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6); g.add(s); }
  } else {
    for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.TorusKnotGeometry(dims.r * 0.35, 0.004, 64, 4, 2 + i % 3, 3), m); t.scale.set(1, 0.25, 1); t.position.set((Math.random() - 0.5) * dims.r * 0.4, y + 0.006 * i, (Math.random() - 0.5) * dims.r * 0.4); t.rotation.y = i; g.add(t); }
  }
  return g;
}
const FRUIT_COL = { apple_red: 0xF4E3B5, apple_green: 0xF4ECC0, banana: 0xF6E7A6, strawberries: 0xE53935, grapes: 0x8BC34A, orange: 0xF57C00, blueberries: 0x3949AB, peach: 0xF4A26B, pear: 0xF0EBC0, kiwi: 0x7CB342, mango: 0xF5A623, pineapple: 0xF7D44C, watermelon: 0xE84A5F, cantaloupe: 0xF3A65A, raspberries: 0xE53958, blackberries: 0x2A1B3D, apple: 0xF4E3B5 };
function fruitPile(v, kinds, dims, mixed) {
  const n = mixed ? 30 : 8 * kinds.length;
  for (let i = 0; i < n; i++) {
    const k = kinds[i % kinds.length]; const col = FRUIT_COL[k] ?? 0xE57373;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, 0.018), new THREE.MeshStandardNodeMaterial({ color: col, roughness: 0.45 }));
    const a = Math.random() * 6.28, r = Math.random() * dims.r * 0.7; p.position.set(Math.cos(a) * r, dims.y0 + 0.02 + Math.random() * 0.03, Math.sin(a) * r); p.rotation.set(Math.random(), Math.random(), Math.random()); v.add(p);
  }
}
/** a finished dish on a plate or in a bowl */
export function dishMesh(dish, garnish, dims = { r: 0.11, y0: 0.017 }) {
  const g = new THREE.Group(); const y = dims.y0;
  const M = (c, r = 0.6) => new THREE.MeshStandardNodeMaterial({ color: c, roughness: r });
  if (dish === 'spaghetti_marinara' || dish === 'fettuccine_alfredo' || dish === 'pasta_plain') {
    g.add(pastaMesh('cooked', { r: dims.r, h: 0.03 }, y + 0.004));
    if (dish !== 'pasta_plain') { const s = new THREE.Mesh(new THREE.SphereGeometry(dims.r * 0.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(dish === 'fettuccine_alfredo' ? 0xF4EBD0 : 0xB3261E, 0.35)); s.scale.y = 0.25; s.position.y = y + 0.018; g.add(s); }
    if (garnish.includes('parmesan')) for (let i = 0; i < 40; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.004), M(0xFFF6D5)); p.position.set((Math.random() - 0.5) * dims.r, y + 0.032, (Math.random() - 0.5) * dims.r); g.add(p); }
    if (garnish.includes('basil')) for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M(0x2E8B3A, 0.5)); l.scale.set(1.5, 0.2, 0.8); l.position.set((i - 1.5) * 0.015, y + 0.036, (i % 2) * 0.012); l.rotation.y = i; g.add(l); }
  }
  if (dish === 'pancakes') {
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.013, 24), M(0xC8853A, 0.75)); p.position.y = y + 0.007 + i * 0.013; g.add(p); }
    if (garnish.includes('syrup')) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.004, 24), new THREE.MeshPhysicalNodeMaterial({ color: 0x8B4513, roughness: 0.1, clearcoat: 1 })); s.position.y = y + 0.042; g.add(s); }
    if (garnish.includes('butter')) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.022), M(0xF6E7A1, 0.4)); b.position.y = y + 0.05; b.rotation.y = 0.5; g.add(b); }
  }
  if (dish === 'cookies') for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 0.05 : 0; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18), M(0xC98B3E, 0.8)); c.position.set(Math.cos(a) * r, y + 0.006 + (i ? 0 : 0.01), Math.sin(a) * r); c.rotation.set((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2); g.add(c); for (let j = 0; j < 3; j++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.005, 5, 4), M(0x3B2314)); d.position.set(c.position.x + (j - 1) * 0.01, c.position.y + 0.006, c.position.z + (j % 2) * 0.01); g.add(d); } }
  if (dish === 'fruit_salad') fruitPile(g, ['strawberries', 'banana', 'grapes', 'orange', 'blueberries', 'kiwi'], { r: dims.r * 0.9, y0: y }, true);
  return g;
}
