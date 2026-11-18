// Chapter 5 levels: a short rainy approach through the garage, then the boss arena.
//
// Entity chars (see ./entities.js):
//   L  roof leak (drips; the cell they land on refills, like ch1's tap)
//   Y  the cat's eyes in the dark (5-1 foreshadowing; decoration only)
//   K  Smudge the garage cat (the boss; 5-2)
//   W  tipping watering can (phase 1)
//   B  soap bottle on the shelf (knocked down at phase 2 -> bubbles)
//   G  rain-gutter runoff current in the floor trench (JUMP inside = dash along the flow)
//   V  valve: props.kind 'hose' (floods the floor) or 'main' (the big spray)

export const ARENA_W = 34;

export const levels = [
  {
    id: '5-1', name: 'Rain on the Concrete', budget: 40,
    hint: 'The garage. Something is watching...',
    map: [
      '################################################',
      '#.........L.................L.............L....#',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#..............................................#',
      '#............................Y.................#',
      '#........................o.....................#',
      '#....................=====..........C..........#',
      '#...............................######.....o...#',
      '#~~~~#..........###.............######..####...#',
      '#~S~~#...-.^^...###...-..^^.....######.-####~E~#',
      '#~~~~#######################################~~~#',
      '################################################',
    ],
    props: { '29,7': { shadowAt: 27 }, '42,1': { period: 1.3 } },
    decor: [
      { type: 'tub', x: 1, y: 11, w: 4, h: 3 },
      { type: 'boxes', x: 16, y: 11, w: 3, h: 2, hideTiles: true },
      { type: 'crate', x: 32, y: 10, w: 6, h: 3, hideTiles: true },
      { type: 'toolbox', x: 41, y: 11, w: 4, h: 2, hideTiles: true },
      { type: 'gutter', x: 45, y: 12, w: 3, h: 2 },
      { type: 'shelving', x: 27, y: 2, w: 9, h: 8 },
    ],
    says: [
      { x: 7, text: 'Rain is leaking through the roof. Catch the drips!' },
      { x: 24, text: 'Was that... a pair of eyes?' },
      { x: 39, text: 'The storm drain is just through the next bay.' },
    ],
  },
  {
    id: '5-2', name: 'The Storm Drain', budget: 150,
    hint: 'The storm drain is right there...',
    map: [
      '##################################',
      '#....L.......L....L........L.....#',
      '#................................#',
      '#................................#',
      '#................................#',
      '#..........B......W..............#',
      '#.........=========..............#',
      '#.............................V..#',
      '#............................===.#',
      '#..-....-........................#',
      '#..######........................#',
      '#..######........................#',
      '#S-######-V...........K...-..E...#',
      '###########G~~~~~~~###############',
      '##################################',
    ],
    props: {
      '29,12': { locked: true },
      '10,12': { kind: 'hose' },
      '30,7': { kind: 'main' },
      '11,13': { len: 8, dir: 1 },
      '18,1': { intoCan: true, period: 1.1 },
    },
    decor: [
      { type: 'bench', x: 3, y: 10, w: 6, h: 3, hideTiles: true },
      { type: 'pipes', x: 28, y: 1, w: 4, h: 7 },
      { type: 'spigot', x: 9, y: 9, w: 3, h: 4 },
      { type: 'catflap', x: 33, y: 9, w: 1, h: 4 },
      { type: 'gutter', x: 11, y: 12, w: 8, h: 2 },
    ],
  },
];
