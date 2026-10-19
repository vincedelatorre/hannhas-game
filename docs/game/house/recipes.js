// Recipe data for the recipe book. Data-driven: each recipe lists what it needs (by ingredient
// tag, so the book finds the real items wherever they are now), its equipment, and, for the
// playable ones, steps that check the actual world state (nothing is ticked just because an
// animation played).
//
// image: [sheet, cell] in the Higgsfield recipe photo sheets (3 x 3 grids)
// W (world) helpers come from RecipeBook: W.got(tag), W.flag(k), W.dish(id, garnish[]),
// W.mixed(mix), W.water(), W.chopped(n), W.washed(n)

const R = (id, name, cat, diff, time, image, desc, ingredients, equipment, extra = {}) => ({ id, name, cat, diff, time, image, desc, ingredients, equipment, ...extra });
const I = (tag, label, qty, opts = {}) => ({ tag, label, qty, ...opts });

export const CATS = ['Breakfast', 'Lunch', 'Dinner', 'Baking', 'Desserts', 'Snacks', 'Drinks & Smoothies'];
export const DIFF = ['', 'Super easy', 'Easy cooking', 'Cooking adventure', 'Junior baker', 'Junior chef'];

export const RECIPES = [
  // ------------------------------------------------------------------ playable now
  R('fruit_salad', 'Fruit Salad', 'Desserts', 1, '3 min', [3, 1], 'Wash, chop and mix your favourite fruit into a rainbow bowl.',
    [I('strawberries', 'Strawberries', '1 punnet'), I('banana', 'Bananas', '1'), I('grapes', 'Grapes', '1 bunch'), I('orange', 'Orange', '1', { optional: true }), I('blueberries', 'Blueberries', '1 punnet', { optional: true })],
    ['Cutting board', 'Kid-safe knife', 'Mixing bowl', 'Serving bowl'], {
      playable: true, final: { dish: 'fruit_salad' },
      steps: [
        { t: 'Collect three kinds of fruit', done: W => W.gotFruit() >= 3 },
        { t: 'Wash the fruit under the sink tap', done: W => W.washed() >= 2 || W.chopped() >= 3 },
        { t: 'Get a cutting board and the kid-safe knife', done: W => W.got('board') && W.got('knife') },
        { t: 'Chop three fruits on the board', done: W => W.chopped() >= 3 },
        { t: 'Add them to a mixing bowl and stir', done: W => W.mixed('fruit_salad') },
        { t: 'Serve it in a bowl', done: W => W.dish('fruit_salad') },
      ] }),
  R('pancakes', 'Fluffy Pancakes', 'Breakfast', 2, '5 min', [0, 1], 'Golden pancakes from the centre griddle, with butter and maple syrup.',
    [I('flour', 'Flour', '1½ cups'), I('milk', 'Milk', '1¼ cups'), I('egg', 'Egg', '1 large'), I('baking_powder', 'Baking powder', '3½ tsp', { optional: true }), I('sugar', 'Sugar', '1 tbsp', { optional: true }), I('butter', 'Butter', '3 tbsp'), I('syrup', 'Maple syrup', 'to drizzle')],
    ['Mixing bowl', 'Whisk', 'Griddle', 'Spatula', 'Plate'], {
      playable: true, mix: 'pancake_batter', final: { dish: 'pancakes', garnish: ['butter', 'syrup'] }, stages: 'T_Steps_Pancakes',
      steps: [
        { t: 'Collect flour', done: W => W.got('flour') }, { t: 'Collect milk', done: W => W.got('milk') }, { t: 'Collect an egg', done: W => W.got('egg') },
        { t: 'Get a mixing bowl', done: W => W.got('bowl') || W.added() > 0 },
        { t: 'Add flour, milk and egg, then whisk the batter', done: W => W.mixed('pancake_batter') || W.flag('pancakes_poured') },
        { t: 'Heat the centre griddle', done: W => W.griddleHot() || W.flag('pancakes_poured') },
        { t: 'Pour, cook and flip the pancakes', done: W => W.flag('pancakes_flipped') },
        { t: 'Stack them on a plate with butter and syrup', done: W => W.dish('pancakes', ['butter', 'syrup']) },
      ] }),
  R('cookies', 'Chocolate Chip Cookies', 'Baking', 4, '6 min', [2, 2], 'Mix the dough, scoop it on a tray and bake in the big oven.',
    [I('flour', 'Flour', '2¼ cups'), I('butter', 'Butter', '1 cup'), I('sugar', 'Sugar', '¾ cup'), I('brown_sugar', 'Brown sugar', '¾ cup', { optional: true }), I('egg', 'Eggs', '2', { optional: true }), I('vanilla', 'Vanilla extract', '2 tsp', { optional: true }), I('baking_soda', 'Baking soda', '1 tsp', { optional: true }), I('chocolate_chips', 'Chocolate chips', '2 cups')],
    ['Mixing bowl', 'Wooden spoon', 'Baking tray', 'Oven', 'Oven mitts', 'Plate'], {
      playable: true, mix: 'cookie_dough', final: { dish: 'cookies' }, stages: 'T_Steps_Cookies',
      steps: [
        { t: 'Collect flour, butter, sugar and chocolate chips', done: W => ['flour', 'butter', 'sugar', 'chocolate_chips'].every(k => W.got(k)) },
        { t: 'Mix the cookie dough in a bowl', done: W => W.mixed('cookie_dough') || W.flag('scooped') },
        { t: 'Scoop the dough onto a baking tray', done: W => W.flag('scooped') },
        { t: 'Bake in the big oven (close the door, turn its knob)', done: W => W.flag('cookies_baked') },
        { t: 'Put on oven mitts and take the tray out', done: W => W.flag('cookies_out') },
        { t: 'Let them cool, then move them to a plate', done: W => W.dish('cookies') },
      ] }),
  R('spaghetti', 'Spaghetti Marinara', 'Dinner', 3, '6 min', [1, 3], 'Boil spaghetti with the pot filler, drain it, toss it in warm marinara.',
    [I('spaghetti', 'Spaghetti', '200 g'), I('water', 'Water', 'pot filler', { auto: true }), I('marinara', 'Marinara sauce', '1 jar'), I('olive_oil', 'Olive oil', '1 tbsp', { optional: true }), I('parmesan', 'Parmesan', 'to sprinkle'), I('basil', 'Fresh basil', 'a few leaves', { optional: true })],
    ['Stockpot', 'Colander', 'Saucepan', 'Pasta bowl'], {
      playable: true, final: { dish: 'spaghetti_marinara', garnish: ['parmesan'] }, stages: 'T_Steps_Spaghetti',
      steps: [
        { t: 'Collect spaghetti from the pantry', done: W => W.got('spaghetti') },
        { t: 'Get the stockpot from the cookware cupboard', done: W => W.got('stockpot') },
        { t: 'Put it on a back burner and fill it with the pot filler', done: W => W.flag('pot_filled') },
        { t: 'Boil the water, then add the spaghetti', done: W => W.flag('pasta_in') || W.flag('pasta_cooked') },
        { t: 'Cook until the timer says ready', done: W => W.flag('pasta_cooked') },
        { t: 'Drain it into the colander in the sink', done: W => W.flag('drained') },
        { t: 'Warm the marinara in a saucepan', done: W => W.flag('sauce_warm') },
        { t: 'Toss the pasta in the sauce', done: W => W.flag('combined') },
        { t: 'Serve in a pasta bowl with parmesan', done: W => W.dish('spaghetti_marinara', ['parmesan']) },
      ] }),
  R('cupcakes', 'Cupcakes', 'Baking', 4, '4 min', [2, 7], 'Flour and milk in the bowl, stir, then bake in the big oven.',
    [I('flour', 'Flour', '1½ cups'), I('milk', 'Milk', '½ cup'), I('sugar', 'Sugar', '¾ cup', { optional: true }), I('butter', 'Butter', '½ cup', { optional: true })],
    ['Mixing bowl', 'Wooden spoon', 'Oven'], {
      playable: true, mix: 'cupcake_batter', final: { flag: 'cupcakes_baked' },
      steps: [
        { t: 'Collect flour and milk', done: W => W.got('flour') && W.got('milk') },
        { t: 'Stir the batter in the mixing bowl', done: W => W.mixed('cupcake_batter') || W.flag('cupcakes_baked') },
        { t: 'Bake it in the big oven', done: W => W.flag('cupcakes_baked') },
      ] }),
  R('hot_chocolate', 'Hot Chocolate', 'Drinks & Smoothies', 2, '2 min', [4, 3], 'A mug of water from the sink, warmed in the microwave drawer into cocoa.',
    [I('mug', 'Mug', '1'), I('cocoa', 'Cocoa powder', '2 tbsp', { optional: true })], ['Mug', 'Sink', 'Microwave drawer'], {
      playable: true, final: { flag: 'cocoa' },
      steps: [
        { t: 'Fill a mug with water at the sink', done: W => W.flag('mug_filled') || W.flag('cocoa') },
        { t: 'Heat it in the microwave drawer', done: W => W.flag('cocoa') },
      ] }),
  R('coffee', 'Coffee for the Grown-ups', 'Drinks & Smoothies', 2, '2 min', [4, 4], 'Grind beans, click the handle in, brew a little coffee to serve.',
    [I('beans', 'Coffee beans', '1 scoop')], ['Grinder', 'Espresso machine', 'Coffee cup'], {
      playable: true, final: { flag: 'coffee' },
      steps: [
        { t: 'Pour beans into the grinder', done: W => W.flag('beans_in') || W.flag('ground') || W.flag('coffee') },
        { t: 'Grind into the coffee handle', done: W => W.flag('ground') || W.flag('coffee') },
        { t: 'Brew into the cup', done: W => W.flag('coffee') },
      ] }),
  // ------------------------------------------------------------------ the rest of the library
  R('scrambled_eggs', 'Scrambled Eggs', 'Breakfast', 2, '3 min', [0, 0], 'Crack, whisk and gently stir eggs in a buttery pan.', [I('egg', 'Eggs', '2'), I('milk', 'Milk', '2 tbsp'), I('butter', 'Butter', '1 tbsp'), I('salt', 'Salt', 'a pinch'), I('pepper', 'Pepper', 'a pinch')], ['Bowl', 'Whisk', 'Frying pan', 'Spatula']),
  R('french_toast', 'French Toast', 'Breakfast', 2, '5 min', [0, 2], 'Dip bread in egg and milk, then griddle until golden.', [I('bread', 'Bread', '2 slices'), I('egg', 'Eggs', '2'), I('milk', 'Milk', '¼ cup'), I('cinnamon', 'Cinnamon', '½ tsp'), I('butter', 'Butter', '1 tbsp'), I('syrup', 'Maple syrup', 'to serve')], ['Bowl', 'Whisk', 'Griddle', 'Spatula']),
  R('bacon_eggs', 'Bacon and Eggs', 'Breakfast', 2, '5 min', [0, 3], 'Crispy bacon and sunny eggs from the griddle.', [I('bacon', 'Bacon', '4 strips'), I('egg', 'Eggs', '2'), I('butter', 'Butter', '1 tsp')], ['Griddle', 'Spatula', 'Plate']),
  R('oatmeal', 'Oatmeal', 'Breakfast', 2, '4 min', [0, 4], 'Warm oats with berries and a drizzle of honey.', [I('oats', 'Oats', '½ cup'), I('milk', 'Milk', '1 cup'), I('berries', 'Berries', 'a handful'), I('honey', 'Honey', '1 tsp')], ['Saucepan', 'Spoon', 'Bowl']),
  R('breakfast_sandwich', 'Breakfast Sandwich', 'Breakfast', 2, '5 min', [0, 5], 'Toasted muffin, egg, cheese and bacon.', [I('bread', 'Bread or muffin', '1'), I('egg', 'Egg', '1'), I('cheese', 'Cheese', '1 slice'), I('bacon', 'Bacon', '2 strips')], ['Frying pan', 'Toaster', 'Spatula']),
  R('grilled_cheese', 'Grilled Cheese', 'Lunch', 2, '4 min', [0, 6], 'Buttery bread, melty cheddar, flipped until golden.', [I('bread', 'Bread', '2 slices'), I('cheddar', 'Cheddar cheese', '2 slices'), I('butter', 'Butter', '1 tbsp')], ['Frying pan', 'Spatula']),
  R('pbj', 'Peanut Butter & Jelly', 'Lunch', 1, '2 min', [0, 7], 'Spread, stack and slice into triangles.', [I('bread', 'Bread', '2 slices'), I('peanut_butter', 'Peanut butter', '2 tbsp'), I('jam', 'Jelly or jam', '1 tbsp')], ['Plate', 'Butter knife']),
  R('quesadilla', 'Cheese Quesadilla', 'Lunch', 2, '4 min', [0, 8], 'A crispy folded tortilla full of melted cheese.', [I('tortilla', 'Tortilla', '1'), I('cheese', 'Shredded cheese', '½ cup'), I('butter', 'Butter or oil', '1 tsp')], ['Skillet', 'Spatula']),
  R('turkey_sandwich', 'Turkey & Cheese Sandwich', 'Lunch', 1, '3 min', [1, 0], 'Stack turkey, cheese and lettuce on bread.', [I('bread', 'Bread', '2 slices'), I('deli', 'Sliced turkey', '3 slices'), I('cheese', 'Cheese', '1 slice'), I('romaine', 'Lettuce', '1 leaf'), I('mayo', 'Mayonnaise', '1 tsp')], ['Plate', 'Cutting board']),
  R('mac_cheese', 'Macaroni and Cheese', 'Lunch', 3, '6 min', [1, 1], 'Boil macaroni, drain, stir in a cheesy sauce.', [I('macaroni', 'Macaroni', '200 g'), I('butter', 'Butter', '2 tbsp'), I('milk', 'Milk', '1 cup'), I('cheddar', 'Cheddar cheese', '1 cup')], ['Stockpot', 'Colander', 'Saucepan']),
  R('mini_pizzas', 'Mini Pizzas', 'Lunch', 2, '5 min', [1, 2], 'Sauce, mozzarella and toppings on little bases, baked.', [I('bread', 'Muffins or bases', '4'), I('marinara', 'Marinara', '½ cup'), I('mozzarella', 'Mozzarella', '1 cup')], ['Baking tray', 'Oven']),
  R('fettuccine_alfredo', 'Fettuccine Alfredo', 'Dinner', 3, '6 min', [1, 4], 'Silky fettuccine in a creamy parmesan sauce.', [I('fettuccine', 'Fettuccine', '200 g'), I('alfredo', 'Alfredo sauce', '1 jar'), I('parmesan', 'Parmesan', 'to sprinkle')], ['Stockpot', 'Colander', 'Saucepan']),
  R('cheeseburger', 'Cheeseburger', 'Dinner', 3, '6 min', [1, 5], 'Shape, grill, melt the cheese and stack it up.', [I('beef', 'Ground beef', '1 patty'), I('bread', 'Bun', '1'), I('cheddar', 'Cheese', '1 slice'), I('romaine', 'Lettuce', '1 leaf'), I('tomato', 'Tomato', '2 slices')], ['Griddle', 'Spatula']),
  R('chicken_rice', 'Chicken and Rice', 'Dinner', 5, '8 min', [1, 6], 'Fluffy rice and seasoned chicken.', [I('meat', 'Chicken', '2 pieces'), I('rice', 'Rice', '1 cup'), I('salt', 'Seasoning', 'a pinch'), I('butter', 'Butter or oil', '1 tbsp')], ['Pot', 'Skillet']),
  R('stir_fry', 'Vegetable Stir-Fry', 'Dinner', 3, '7 min', [1, 7], 'Chop colourful veggies and stir-fry with soy sauce.', [I('broccoli', 'Broccoli', '1 head'), I('carrots', 'Carrots', '2'), I('bell_pepper_red', 'Pepper', '1'), I('soy', 'Soy sauce', '2 tbsp'), I('oil', 'Oil', '1 tbsp'), I('rice', 'Rice', '1 cup')], ['Skillet', 'Pot', 'Spatula']),
  R('baked_potatoes', 'Baked Potatoes', 'Dinner', 3, '7 min', [1, 8], 'Scrubbed potatoes baked soft with all the toppings.', [I('potato', 'Potatoes', '2'), I('butter', 'Butter', '1 tbsp'), I('cheese', 'Cheese', '¼ cup'), I('sour_cream', 'Sour cream', '2 tbsp')], ['Oven', 'Baking tray']),
  R('tacos', 'Taco Night', 'Dinner', 5, '8 min', [2, 0], 'Cook the filling, chop toppings, build your tacos.', [I('beef', 'Ground beef', '250 g'), I('tortilla', 'Tortillas', '6'), I('romaine', 'Lettuce', '1 cup'), I('tomato', 'Tomatoes', '2'), I('cheese', 'Cheese', '1 cup')], ['Skillet', 'Spatula', 'Serving bowls']),
  R('pizza', 'Homemade Pizza', 'Dinner', 5, '9 min', [2, 1], 'Shape the dough, spread sauce, add cheese and bake.', [I('flour', 'Flour', '2 cups'), I('marinara', 'Tomato sauce', '½ cup'), I('mozzarella', 'Mozzarella', '1½ cups')], ['Baking tray', 'Oven', 'Rolling pin']),
  R('brownies', 'Brownies', 'Baking', 4, '6 min', [2, 3], 'Rich chocolate brownies.', [I('butter', 'Butter', '½ cup'), I('sugar', 'Sugar', '1 cup'), I('cocoa', 'Cocoa', '⅓ cup'), I('egg', 'Eggs', '2'), I('flour', 'Flour', '½ cup')], ['Mixing bowl', 'Baking pan', 'Oven']),
  R('banana_bread', 'Banana Bread', 'Baking', 4, '7 min', [2, 4], 'Mash ripe bananas into a cosy loaf.', [I('banana', 'Bananas', '3'), I('flour', 'Flour', '1½ cups'), I('sugar', 'Sugar', '¾ cup'), I('egg', 'Egg', '1'), I('butter', 'Butter', '⅓ cup'), I('baking_soda', 'Baking soda', '1 tsp')], ['Bowl', 'Loaf pan', 'Oven']),
  R('muffins', 'Blueberry Muffins', 'Baking', 4, '6 min', [2, 5], 'Bursting with blueberries.', [I('flour', 'Flour', '2 cups'), I('blueberries', 'Blueberries', '1 cup'), I('milk', 'Milk', '1 cup'), I('egg', 'Eggs', '2'), I('sugar', 'Sugar', '½ cup'), I('butter', 'Butter', '½ cup')], ['Mixing bowl', 'Cupcake tray', 'Oven']),
  R('sugar_cookies', 'Sugar Cookies', 'Baking', 4, '6 min', [2, 6], 'Roll, cut fun shapes and bake.', [I('flour', 'Flour', '2 cups'), I('butter', 'Butter', '1 cup'), I('sugar', 'Sugar', '1 cup'), I('egg', 'Egg', '1'), I('vanilla', 'Vanilla', '1 tsp')], ['Bowl', 'Rolling pin', 'Oven']),
  R('cinnamon_rolls', 'Cinnamon Rolls', 'Baking', 5, '9 min', [2, 8], 'Roll, spread, swirl, bake and ice.', [I('flour', 'Flour', '3 cups'), I('butter', 'Butter', '½ cup'), I('cinnamon', 'Cinnamon', '2 tbsp'), I('brown_sugar', 'Brown sugar', '½ cup'), I('yeast', 'Yeast', '1 packet')], ['Bowl', 'Rolling pin', 'Baking dish', 'Oven']),
  R('biscuits', 'Homemade Biscuits', 'Baking', 4, '6 min', [3, 0], 'Flaky golden biscuits.', [I('flour', 'Flour', '2 cups'), I('butter', 'Butter', '½ cup'), I('baking_powder', 'Baking powder', '1 tbsp'), I('milk', 'Milk', '¾ cup')], ['Mixing bowl', 'Rolling pin', 'Baking tray']),
  R('choc_strawberries', 'Chocolate-Dipped Strawberries', 'Desserts', 2, '3 min', [3, 2], 'Wash, dip and let set.', [I('strawberries', 'Strawberries', '1 punnet'), I('chocolate_chips', 'Melting chocolate', '1 cup')], ['Bowl', 'Microwave', 'Plate']),
  R('parfait', 'Yogurt Parfait', 'Desserts', 1, '2 min', [3, 3], 'Layer yogurt, granola and berries in a glass.', [I('yogurt', 'Yogurt', '1 cup'), I('granola', 'Granola', '½ cup'), I('berries', 'Berries', 'a handful'), I('honey', 'Honey', '1 tsp')], ['Glass', 'Spoon']),
  R('sundae', 'Ice Cream Sundae', 'Desserts', 1, '2 min', [3, 4], 'Scoop, pour and decorate.', [I('edible', 'Ice cream', '2 scoops'), I('cocoa', 'Chocolate', 'a drizzle')], ['Bowl', 'Spoon']),
  R('apple_pb', 'Apple Slices with Peanut Butter', 'Snacks', 1, '2 min', [3, 5], 'Crunchy apple with a peanut-butter dip.', [I('apple_red', 'Apple', '1'), I('peanut_butter', 'Peanut butter', '2 tbsp')], ['Cutting board', 'Kid-safe knife', 'Plate']),
  R('trail_mix', 'Trail Mix', 'Snacks', 1, '1 min', [3, 6], 'Gather, measure and mix.', [I('pretzels', 'Pretzels', '½ cup'), I('dried_fruit', 'Dried fruit', '½ cup'), I('cereal', 'Cereal', '½ cup'), I('chocolate_chips', 'Chocolate chips', '¼ cup')], ['Bowl', 'Measuring cup']),
  R('fruit_kabobs', 'Fruit Kabobs', 'Snacks', 1, '3 min', [3, 7], 'Colourful fruit on blunt sticks.', [I('strawberries', 'Strawberries', '8'), I('grapes', 'Grapes', '12'), I('cantaloupe', 'Melon', '¼'), I('pineapple', 'Pineapple', '¼')], ['Cutting board', 'Kid-safe knife']),
  R('strawberry_banana', 'Strawberry Banana Smoothie', 'Drinks & Smoothies', 2, '2 min', [3, 8], 'Blend strawberries, banana, milk and yogurt.', [I('strawberries', 'Strawberries', '1 cup'), I('banana', 'Banana', '1'), I('milk', 'Milk', '1 cup'), I('yogurt', 'Yogurt', '½ cup')], ['Blender', 'Glass']),
  R('choc_milk', 'Chocolate Milk', 'Drinks & Smoothies', 1, '1 min', [4, 0], 'Pour milk and stir in chocolate.', [I('milk', 'Milk', '1 glass'), I('cocoa', 'Chocolate', '1 tbsp')], ['Glass', 'Spoon']),
  R('lemonade', 'Lemonade', 'Drinks & Smoothies', 2, '3 min', [4, 1], 'Squeeze lemons, add sugar and water, stir.', [I('lemon', 'Lemons', '4'), I('sugar', 'Sugar', '½ cup')], ['Juicer', 'Pitcher', 'Spoon']),
  R('berry_smoothie', 'Berry Smoothie', 'Drinks & Smoothies', 2, '2 min', [4, 2], 'Blueberries, strawberries, yogurt and milk.', [I('blueberries', 'Blueberries', '½ cup'), I('strawberries', 'Strawberries', '½ cup'), I('yogurt', 'Yogurt', '½ cup'), I('milk', 'Milk', '½ cup')], ['Blender', 'Glass']),
];

/** recipe photo sheets (Higgsfield, 3 x 3 cells each) */
export const SHEETS = ['T_Recipe_Sheet_1', 'T_Recipe_Sheet_2', 'T_Recipe_Sheet_3', 'T_Recipe_Sheet_4', 'T_Recipe_Sheet_5'];
