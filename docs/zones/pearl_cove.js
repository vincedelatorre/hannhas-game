// Pearl Cove, zone 1. Everything placed in the world lives here as data, so new zones are
// new files like this one. Positions are metres in the blockout frame shared with Unreal:
// x east, y inland (jungle), sea toward -y. The engine converts to three.js (x, up, -y).
export default {
  id: 'pearl_cove',
  name: 'Pearl Cove',
  size: 260,                     // terrain square, metres
  seaLevel: 0,
  spawn: { pos: [0, -3], face: 0 },          // face 0 = looking inland, at the clubhouse

  sun: { elevation: 24, azimuth: 32 },       // golden hour, over the sea behind the player's right shoulder

  lagoon: { center: [0, 11], radius: [7.0, 4.4], level: 0.35 },
  tidePools: [[24, -4], [28, -6]],

  clubhouse: { model: 'SM_PearlCove_Clubhouse', pos: [0, 28], footprint: 23, yaw: -90 },

  // gameplay water slide (separate from the decorative slides on the clubhouse model)
  slide: { tower: [-17, 24], radius: 3.2, top: 11.5, turns: 2, exit: [-4.2, 12.2], ring: [-13.5, 17.5] },

  props: [
    { model: 'SM_PalmSwing', pos: [-30, 2], height: 2.9, yaw: -90 },
    { model: 'SM_TreasureChest', id: 'chest', pos: [53, 6], height: 0.78, faceToward: [44, -2], collider: 'box' },
    { model: 'SM_Driftwood', pos: [-12, -2], length: 3.2, yaw: 20, collider: 'box' },
    { model: 'SM_Driftwood', pos: [18, -3], length: 2.6, yaw: -65, collider: 'box' },
    { model: 'SM_Driftwood', pos: [-41, -11], length: 2.2, yaw: 75 },
    { model: 'SM_Driftwood', pos: [36, -9.5], length: 1.8, yaw: 10 },
    { model: 'SM_Shells_Cluster', pos: [-18, -4.2], width: 0.5, yaw: 40 },
    { model: 'SM_Shells_Cluster', pos: [10, -5.1], width: 0.4, yaw: 110 },
    { model: 'SM_Shells_Cluster', pos: [31, -7.6], width: 0.45, yaw: 300 },
  ],

  torches: [[9.8, 9], [6.2, 8.5], [8.8, 3], [5.2, 2.6], [4.5, -2], [1.6, -1.6], [-6.5, 8.5], [-9.6, 9]],

  palms: {
    hero: [[-44, -14], [-36, -10], [-20, -1], [-14, 1], [16, 1], [22, -2], [30, -6], [40, -14], [47, -19],
           [-17, 30], [-20, 24], [17, 30], [19, 22], [-8, 40], [8, 41], [-32.3, 4], [-27.7, 4], [-24, 12], [26, 12], [13, 15]],
    jungle: { count: 70, x: [-80, 80], y: [42, 95], seed: 11 },
    heights: [9, 13],
  },

  hibiscus: [[-9, 15], [9, 15], [-13, 13], [12, 12.5], [-4, 17.5], [5, 18], [-5, 5.5], [5, 5.5],
             [-15, 20], [15, 20], [-26, 6], [27, 5], [-11, 36], [11, 37], [-34, 1], [37, -3], [3, 44], [-3, 44]],

  boulders: [
    // tide pool rocks
    [20, -5, 0.9], [23, -7, 1.1], [27, -3, 0.8], [30, -7, 1.0], [31, -4, 0.7], [25.5, -8.5, 0.6],
    // beach and cliff
    [-24, -6, 1.6], [44, -12, 2.2], [50, 4, 2.0], [55, 9, 1.7], [56, 4.5, 1.4], [-47, -6, 2.4], [60, -2, 2.8],
    // lagoon rim
    [-7.6, 11, 0.7], [7.6, 11, 0.7], [-6.6, 13.6, 0.6], [6.4, 13.8, 0.6], [-4.5, 15, 0.5], [4.2, 15.2, 0.55],
    [-7.2, 8.4, 0.5], [7.3, 8.6, 0.5],
    // sea stacks offshore, west and east of the cove mouth
    [-30, -40, 6.5], [-23, -46, 4.2], [-36, -34, 3.2], [-27, -52, 3.0], [31, -42, 5.5], [25, -49, 3.6], [37, -37, 2.6],
  ],

  jetty: { from: [36, -14], to: [42, -36], width: 2.4 },

  quests: {
    shells: [[-38, -8], [-26, -3], [-10, -3.5], [6, -3.5], [14, -3], [26, -1.5], [34, -8], [-2, -4.5]],
    gull: [-27.6, 0.6],
    chest: [53, 6],
    turtle: true,          // bonus: dive down and say hi to the sea turtle
  },

  companion: { start: [3, 6] },

  // what Wren's friend says. Each key is an event; one line is picked at random.
  // hint_* lines play when nothing has happened for a while and that quest is still open.
  dialogue: {
    start: ['Race you to the lagoon!', 'The shells only glow at Pearl Cove. Let\'s find them all!'],
    shell: ['Ooh, a sparkly one!', 'That one\'s my favourite.', 'The museum is going to love these.'],
    shells_done: ['All eight! You found every shell!'],
    pool: ['Look, a crab popped out!', 'Your water power is amazing!'],
    slide: ['That was the best ride ever!', 'Again! Again!'],
    gull: ['The seagull is smiling now.'],
    dive: ['Whoa, look at all the fish down there!', 'Hold Q to swim deeper. I\'ll keep watch up here!'],
    turtle: ['You found the sea turtle! She likes you.'],
    flowers: ['Flowers! Your love power makes everything bloom.'],
    ready: ['I think the treasure chest just opened. Look for the light on the east cliff!'],
    win: ['We did it! Pearl Cove is the best.'],
    hint_shells: ['I saw a glowing shell down by the water.', 'Shells like the edge of the sand. Keep looking!'],
    hint_slide: ['See the mint ring by the slide tower? Stand in it!'],
    hint_pools: ['The tide pools on the east beach are empty. Use your water power on them!'],
    hint_gull: ['That seagull by the swing looks sad. Maybe your love power can help?'],
    hint_turtle: ['Want to see something cool? Swim out past the beach and dive down. There\'s a turtle!'],
  },
};
