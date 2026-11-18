// Chapter 4 levels, painted with the small grid helper. Each level's map shows the INITIAL state
// (all valves off). Tank/gate props say what a valve changes; `opens` on a valve says which
// stand cells it makes reachable (validator edges, re-verified by tests/ch4.test.mjs).
import { grid } from './paint.js';

const TL = 24; // tile px (for long lamp cords)

// ----------------------------------------------------------------------------- 4-1 Down the Drain
function level41() {
  const W = 62, H = 17, g = grid(W, H);
  g.fill(0, 0, W - 1, 1, '#');            // ceiling
  g.fill(0, 15, W - 1, 16, '#');          // floor
  g.fill(0, 2, 1, 14, '#');               // left wall
  // laundry floor drain: a pool in a recess, rim on its right
  g.fill(2, 11, 6, 14, '~');
  g.fill(7, 12, 9, 14, '#');
  g.put(4, 13, 'S');
  // crates
  g.fill(14, 13, 15, 14, '#');
  g.put(12, 14, 'o'); g.put(17, 11, 'o');
  // valve + cistern
  g.put(19, 14, 'V');
  g.fill(21, 13, 22, 14, '#');
  g.fill(23, 13, 26, 14, '~');
  g.fill(27, 6, 38, 14, '#');
  g.put(27, 11, 'T');
  // platform up top, droplets
  g.put(31, 5, 'o'); g.put(35, 5, 'o');
  // floor after the drop
  g.put(41, 14, '-'); g.put(42, 14, '-');
  g.put(45, 14, 'C');
  g.put(48, 14, '^'); g.put(49, 14, '^');
  g.fill(52, 11, 54, 11, '=');
  g.put(53, 10, 'o');
  g.fill(56, 12, 60, 14, '~');
  g.fill(61, 2, 61, 14, '#');
  g.put(58, 14, 'E');
  return {
    id: '4-1', name: 'Down the Drain', budget: 55,
    hint: 'Valve wheels turn when you JUMP while touching them.',
    map: g.rows(),
    props: {
      '19,14': { link: 'a', pipe: [[19, 13], [19, 3], [25, 3]], opens: [{ x: 28, y: 5, t: 2.6, with: ['a'] }] },
      '27,11': { id: 'a', x0: 23, x1: 26, off: 13, on: 7, floor: 14, inlet: [25, 2] },
    },
    decor: [],
    says: [
      { x: 10, text: 'A valve wheel! Stand at it and JUMP to turn it.' },
      { x: 21, text: 'Water rising? Swim up and leap out the top!' },
    ],
  };
}


// helper: room shell with ceiling (rows 0-1), floor (last 2 rows) and side walls
function shell(W, H) {
  const g = grid(W, H);
  g.fill(0, 0, W - 1, 1, '#'); g.fill(0, H - 2, W - 1, H - 1, '#');
  g.fill(0, 2, 1, H - 3, '#'); g.fill(W - 2, 2, W - 1, H - 3, '#');
  return g;
}

// ------------------------------------------------------------------------------- 4-2 Boiler Room
// Hot pipes line a trench the fish can't hop. A timed valve floods it; a second timed valve lifts
// a steel gate. Introduces drift-back timers, steam vents and drips.
function level42() {
  const W = 74, H = 19, g = shell(W, H);
  g.fill(2, 13, W - 3, 16, '#');                 // main floor mass, stand row 12
  g.fill(3, 13, 6, 14, '~'); g.put(4, 14, 'S');  // starting pool (a puddle off the drain)
  g.put(9, 10, 'o');
  g.put(12, 12, 'Y');                            // steam vent
  g.fill(15, 7, 19, 8, '#'); g.put(17, 9, 'D');  // overhang + dripping pipe
  g.put(20, 12, 'V');
  g.fill(22, 13, 35, 15, '.'); g.fill(22, 16, 35, 16, '^'); // the hot-pipe trench
  g.put(21, 15, 'T');
  g.put(38, 12, 'C');
  g.put(43, 12, '^'); g.put(44, 12, '^');        // hot pipe on the floor
  g.put(41, 10, 'o'); g.put(46, 10, 'o');
  g.fill(46, 7, 48, 8, '#'); g.put(47, 9, 'D');
  g.put(52, 12, 'V');
  g.fill(58, 2, 59, 12, '#'); g.put(58, 9, 'G'); // gate region rows 9..12
  g.put(61, 12, '-'); g.put(62, 12, '-');
  g.fill(64, 10, 68, 12, '#');                   // boiler body
  g.put(66, 9, 'o');
  g.fill(69, 13, 71, 14, '~'); g.put(70, 14, 'E');
  return {
    id: '4-2', name: 'Boiler Room', budget: 60,
    hint: 'Hot pipes! Flood the trench so you can swim over them.',
    map: g.rows(),
    props: {
      '20,12': { link: 'a', timer: 22, pipe: [[20, 11], [20, 3], [28, 3]], opens: [{ x: 37, y: 12, t: 2.4, with: ['a'] }] },
      '21,15': { id: 'a', x0: 22, x1: 35, off: 16, on: 13, floor: 15, rise: 2.2, fall: 1.4, inlet: [28, 2] },
      '52,12': { link: 'b', timer: 20, pipe: [[52, 11], [52, 7], [57, 7]], opens: [{ x: 61, y: 12, t: 2.6, with: ['b'], dry: true }] },
      '58,9': { id: 'b', w: 2, h: 4 },
      '12,12': { rows: 2, period: 4.6, offset: 1 },
    },
    says: [
      { x: 5, text: 'Steam vents jet on a rhythm. Time your hop!' },
      { x: 18, text: 'The wheel is on a timer: it drifts back!', seconds: 4 },
      { x: 50, text: 'This one lifts the steel gate. Hurry through.' },
    ],
  };
}

// ----------------------------------------------------------------------------- 4-3 The Cistern Shaft
// Climb a two-stage shaft. Valve A lifts the first water column, valve B (on the ledge it brings you
// to) lifts the second one.
function level43() {
  const W = 46, H = 26, g = shell(W, H);
  g.put(3, 23, 'S'); g.put(4, 23, '-'); g.put(5, 23, '-'); g.put(7, 21, 'o');
  g.put(10, 23, 'V');
  // shaft 1: interior x14..19, arch at the bottom rows 22..23
  g.fill(12, 2, 13, 21, '#');
  g.fill(14, 22, 19, 23, '~');
  g.put(13, 15, 'T');
  g.fill(20, 14, 43, 23, '#');                   // right mass, ledge L1 top row 14 (stand row 13) for x20..25
  g.put(22, 13, 'Y');
  g.put(24, 13, 'V');
  // shaft 2: interior x26..30, bottom row 13
  g.fill(26, 12, 30, 13, '~');
  g.fill(31, 5, 37, 13, '#');                    // top ledge: stand row 4
  g.put(31, 8, 'T');
  g.put(34, 3, 'o'); g.put(36, 3, 'o');
  g.fill(38, 6, 38, 6, '=');
  g.fill(40, 14, 43, 15, '~'); g.put(41, 15, 'E');
  g.fill(38, 10, 39, 10, '=');
  g.put(25, 8, 'o');
  return {
    id: '4-3', name: 'The Cistern Shaft', budget: 65,
    hint: 'Two valves, two water columns. Climb!',
    map: g.rows(),
    props: {
      '10,23': { link: 'a', pipe: [[10, 22], [10, 12], [16, 12], [16, 3]], opens: [{ x: 20, y: 13, t: 2.4, with: ['a'] }] },
      '13,15': { id: 'a', x0: 14, x1: 19, off: 22, on: 15, floor: 23, inlet: [16, 2] },
      '24,13': { link: 'b', timer: 24, pipe: [[24, 12], [24, 3], [28, 3]], opens: [{ x: 32, y: 4, t: 2.6, with: ['a', 'b'] }] },
      '31,8': { id: 'b', x0: 26, x1: 30, off: 12, on: 6, floor: 13, inlet: [28, 2] },
      '22,13': { rows: 2, period: 4.2, offset: 0.5 },
    },
    says: [
      { x: 11, text: 'Turn the wheel, swim up the shaft, leap out the top.' },
      { x: 21, y: 13, text: 'A second valve! This one drifts back, so be quick.' },
    ],
  };
}


// ------------------------------------------------------------------------ 4-4 Pressure Gauges
// Three valves in a row: a timed gate, a slow-filling basin (a pipe pours into it) and another
// timed gate. Steam vents and hot pipes between them.
function level44() {
  const W = 80, H = 17, g = shell(W, H);
  g.put(3, 14, 'S'); g.put(4, 14, '-'); g.put(5, 14, '-'); g.put(8, 12, 'o');
  g.put(10, 14, 'Y');
  g.fill(13, 11, 15, 11, '='); g.put(14, 10, 'o');
  g.put(18, 14, 'V');
  g.fill(22, 2, 22, 14, '#'); g.put(22, 9, 'G');          // gate 1 rows 9..14
  g.fill(25, 8, 27, 9, '#'); g.put(26, 10, 'D');
  g.put(30, 14, 'V');
  g.fill(32, 2, 33, 13, '#');                              // basin left wall, arch at row 14
  g.fill(34, 13, 39, 14, '~');
  g.fill(40, 8, 45, 14, '#'); g.put(40, 12, 'T');          // basin right block, stand row 7
  g.put(41, 6, 'o'); g.put(43, 7, 'Y');
  g.put(48, 14, '-'); g.put(49, 14, '-');
  g.put(52, 14, '^'); g.put(53, 14, '^');
  g.put(55, 14, 'V');
  g.fill(60, 2, 61, 14, '#'); g.put(60, 10, 'G');        // gate 3 rows 10..14
  g.put(63, 14, 'C');
  g.fill(66, 12, 69, 14, '#'); g.put(67, 11, 'o');
  g.fill(72, 13, 76, 14, '~'); g.put(74, 14, 'E');
  return {
    id: '4-4', name: 'Pressure Gauges', budget: 70,
    hint: 'Open the gate, fill the basin, open the next gate.',
    map: g.rows(),
    props: {
      '18,14': { link: 'a', timer: 18, pipe: [[18, 13], [18, 7], [21, 7]], opens: [{ x: 23, y: 14, t: 2.0, with: ['a'], dry: true }] },
      '22,9': { id: 'a', w: 1, h: 6 },
      '10,14': { rows: 2, period: 4.4, offset: 2 },
      '26,10': { period: 1.3 },
      '30,14': { link: 'b', pipe: [[30, 13], [30, 4], [36, 4]], opens: [{ x: 41, y: 7, t: 2.6, with: ['b'] }] },
      '40,12': { id: 'b', x0: 34, x1: 39, off: 13, on: 8, floor: 14, rise: 0.9, fall: 2.5, inlet: [36, 2] },
      '43,7': { rows: 2, period: 4, offset: 1 },
      '55,14': { link: 'c', timer: 16, pipe: [[55, 13], [55, 8], [59, 8]], opens: [{ x: 62, y: 14, t: 2.4, with: ['c'], dry: true }] },
      '60,10': { id: 'c', w: 2, h: 5 },
    },
    says: [
      { x: 16, text: 'Valve first, then run for the gate.' },
      { x: 29, text: 'Slow pipe! The basin fills while you ride it.', seconds: 4 },
    ],
  };
}

// ------------------------------------------------------------------------------ 4-5 Boiler Run
// Gate, a flooded hot-pipe hall with a stepping-stone island, then a tall basin to the roof.
function level45() {
  const W = 96, H = 19, g = shell(W, H);
  g.fill(2, 13, W - 3, 16, '#');                  // floor mass, stand row 12
  g.fill(3, 13, 6, 14, '~'); g.put(4, 14, 'S');
  g.put(10, 9, 'o');
  g.put(14, 12, 'Y');
  g.fill(16, 8, 18, 9, '#'); g.put(17, 10, 'D');
  g.put(20, 12, 'Y'); g.put(23, 9, 'o');
  g.fill(21, 9, 23, 9, '=');
  g.put(26, 12, 'V');
  g.fill(31, 2, 32, 12, '#'); g.put(31, 8, 'G');   // gate A rows 8..12
  g.put(35, 12, 'C');
  g.put(38, 12, 'V');
  // hot hall: trench x40..62, hazards on row 16
  g.fill(39, 13, 39, 16, '#');
  g.fill(40, 13, 62, 15, '.'); g.fill(40, 16, 62, 16, '^');
  g.fill(50, 10, 52, 15, '#');                    // island (top row 10, stand row 9)
  g.fill(50, 16, 52, 16, '#');
  g.put(51, 9, 'o');
  g.fill(63, 13, 69, 16, '#'); g.put(63, 14, 'T');
  g.fill(48, 6, 54, 6, '#'); g.put(51, 7, 'D');
  g.put(70, 12, 'C');
  g.put(72, 12, 'V');
  g.put(75, 12, '^'); g.put(76, 12, '^');
  // tall basin: arch row 12, interior x80..85
  g.fill(78, 2, 79, 11, '#');
  g.fill(80, 11, 85, 12, '~');
  g.fill(86, 4, 92, 12, '#'); g.put(86, 9, 'T');
  g.put(88, 2, 'o');
  g.put(83, 3, 'o');
  g.fill(88, 4, 91, 5, '~'); g.put(89, 5, 'E');
  return {
    id: '4-5', name: 'Boiler Run', budget: 80,
    hint: 'Flood the hot hall, hop the island, climb to the roof.',
    map: g.rows(),
    props: {
      '14,12': { rows: 2, period: 4.6, offset: 0 },
      '20,12': { rows: 2, period: 4.2, offset: 2 },
      '17,10': { period: 1.3 },
      '26,12': { link: 'a', timer: 20, pipe: [[26, 11], [26, 5], [30, 5]], opens: [{ x: 33, y: 12, t: 2.4, with: ['a'], dry: true }] },
      '31,8': { id: 'a', w: 2, h: 5 },
      '38,12': { link: 'b', timer: 26, pipe: [[38, 11], [38, 3], [50, 3], [50, 4]], opens: [{ x: 64, y: 12, t: 3.4, with: ['b'] }] },
      '63,14': { id: 'b', x0: 40, x1: 62, off: 16, on: 13, floor: 15, rise: 1.6, fall: 1.0, inlet: [45, 2] },
      '51,7': { period: 1.3 },
      '72,12': { link: 'c', pipe: [[72, 11], [72, 3], [82, 3]], opens: [{ x: 87, y: 3, t: 2.6, with: ['c'] }] },
      '86,9': { id: 'c', x0: 80, x1: 85, off: 11, on: 5, floor: 12, rise: 1.8, fall: 2.5, inlet: [82, 2] },
    },
    says: [
      { x: 13, text: 'Steam vents. Hop over them between bursts.' },
      { x: 37, text: 'Flood the trench. Hot pipes below!' },
    ],
  };
}

// --------------------------------------------------------------------------- 4-6 The Outflow Pipe
// The long way out: a basin to the ledge, a gate, then a drained hall flooded with one big timed
// valve, ending at the pipe mouth that leads to the garage storm drain.
function level46() {
  const W = 100, H = 22, g = shell(W, H);
  g.fill(2, 20, W - 3, 21, '#');
  g.fill(3, 18, 6, 19, '~'); g.put(4, 19, 'S');
  g.fill(7, 18, 9, 19, '#'); g.put(11, 16, 'o'); g.put(12, 19, 'o');
  g.put(14, 19, 'V');
  // tank A: arch row 19, interior x20..25
  g.fill(18, 2, 19, 18, '#');
  g.fill(20, 18, 25, 19, '~');
  g.fill(26, 12, 56, 19, '#'); g.put(26, 16, 'T');        // ledge, stand row 11
  g.put(29, 11, 'Y'); g.put(35, 11, 'Y');
  g.put(32, 8, 'o'); g.fill(31, 9, 33, 9, '=');
  g.put(38, 11, 'V');
  g.fill(42, 2, 43, 11, '#'); g.put(42, 6, 'G');           // gate rows 6..11
  g.put(46, 11, 'C');
  g.put(49, 11, '-'); g.put(50, 11, '-');
  g.put(53, 11, 'V');
  // the hall: x57..88, rows 12..19, hazards on row 19... floor rows 20..21
  g.fill(57, 12, 88, 18, '.'); g.fill(57, 12, 88, 12, '.');
  g.fill(57, 19, 88, 19, '^');
  g.fill(57, 12, 57, 19, '.');
  g.fill(57, 20, 57, 21, '#');
  g.fill(68, 16, 70, 19, '#'); g.fill(76, 15, 78, 19, '#');
  g.fill(89, 12, 97, 19, '#'); g.put(89, 13, 'T');                              // pipe block, top row 12
  g.fill(89, 10, 90, 11, '.');                              // pipe mouth rows 10..11
  g.fill(91, 9, 97, 9, '#'); g.fill(89, 2, 97, 8, '#');
  g.put(95, 11, 'E');
  g.put(93, 11, 'o');
  return {
    id: '4-6', name: 'The Outflow Pipe', budget: 90,
    hint: 'The big pipe out is at the far end of the hall. Flood it!',
    map: g.rows(),
    props: {
      '14,19': { link: 'a', pipe: [[14, 18], [14, 4], [22, 4]], opens: [{ x: 27, y: 11, t: 2.4, with: ['a'] }] },
      '26,16': { id: 'a', x0: 20, x1: 25, off: 18, on: 12, floor: 19, rise: 2.4, fall: 2.5, inlet: [22, 2] },
      '29,11': { rows: 2, period: 4.4, offset: 0 },
      '35,11': { rows: 2, period: 4.0, offset: 2 },
      '38,11': { link: 'b', timer: 20, pipe: [[38, 10], [38, 4], [41, 4]], opens: [{ x: 44, y: 11, t: 2.2, with: ['b'], dry: true }] },
      '42,6': { id: 'b', w: 2, h: 6 },
      '53,11': { link: 'c', timer: 34, pipe: [[53, 10], [53, 3], [70, 3], [70, 4]], opens: [{ x: 89, y: 11, t: 3.4, with: ['a', 'c'] }] },
      '89,13': { id: 'c', x0: 57, x1: 88, off: 19, on: 12, floor: 18, rise: 1.5, fall: 0.6, inlet: [70, 2] },
    },
    says: [
      { x: 52, text: 'Turn the big wheel and wait for the water. Then swim for the pipe!', seconds: 5 },
    ],
  };
}

// ------------------------------------------------------------------------------------- decor
// Pre-rendered set pieces (ch4/art.js drawDecor). Lamps/boilers also cast pools of light.
const lamp = (x, y = 2, drop = 20, r = 150) => ({ type: 'lamp', x, y, w: 1, h: Math.ceil(drop / 24), drop, r });
const DECOR = {
  '4-1': [
    { type: 'drainpipe', x: 4, y: 2, w: 1, h: 9 }, { type: 'crates', x: 14, y: 13, w: 2, h: 2, hideTiles: true },
    { type: 'cistern', x: 23, y: 6, w: 4, h: 9 }, { type: 'boxes', x: 52, y: 10, w: 3, h: 1 },
    { type: 'barrels', x: 33, y: 5, w: 2, h: 1 }, { type: 'barrels', x: 10, y: 14, w: 1, h: 1 },
    lamp(9, 2, 22), lamp(30, 2, 20), lamp(44, 2, 26), lamp(57, 2, 26),
  ],
  '4-2': [
    { type: 'cistern', x: 22, y: 7, w: 14, h: 10 }, { type: 'boiler', x: 64, y: 10, w: 5, h: 3, hideTiles: true },
    { type: 'crates', x: 7, y: 11, w: 2, h: 1 }, { type: 'barrels', x: 40, y: 11, w: 2, h: 1 }, { type: 'boxes', x: 55, y: 11, w: 2, h: 1 },
    lamp(8, 2, 24), lamp(24, 2, 20), lamp(40, 2, 30), lamp(55, 2, 26), lamp(66, 2, 26),
  ],
  '4-3': [
    { type: 'cistern', x: 14, y: 8, w: 6, h: 16 }, { type: 'cistern', x: 26, y: 4, w: 5, h: 10 },
    { type: 'crates', x: 6, y: 22, w: 2, h: 1 }, { type: 'barrels', x: 9, y: 22, w: 1, h: 1 },
    lamp(7, 2, 19 * TL), lamp(16, 2, 10 * TL, 170), lamp(28, 2, 8 * TL, 150), lamp(36, 2, 18, 150), lamp(41, 2, 11 * TL, 140),
  ],
  '4-4': [
    { type: 'cistern', x: 34, y: 3, w: 6, h: 12 }, { type: 'boxes', x: 13, y: 10, w: 3, h: 1 },
    { type: 'barrels', x: 46, y: 14, w: 2, h: 1 }, { type: 'crates', x: 36, y: 5, w: 1, h: 1 },
    lamp(8, 2, 22), lamp(19, 2, 24), lamp(30, 2, 26), lamp(43, 2, 22), lamp(54, 2, 26), lamp(66, 2, 24), lamp(73, 2, 26),
  ],
  '4-5': [
    { type: 'boiler', x: 8, y: 9, w: 5, h: 3 }, { type: 'cistern', x: 40, y: 7, w: 23, h: 10 }, { type: 'cistern', x: 80, y: 3, w: 6, h: 10 },
    { type: 'crates', x: 28, y: 11, w: 2, h: 1 }, { type: 'barrels', x: 66, y: 11, w: 2, h: 1 }, { type: 'boxes', x: 21, y: 8, w: 3, h: 1 },
    lamp(9, 2, 22), lamp(24, 2, 24), lamp(35, 2, 26), lamp(46, 2, 26), lamp(58, 2, 26), lamp(70, 2, 26), lamp(83, 2, 20),
  ],
  '4-6': [
    { type: 'cistern', x: 20, y: 9, w: 6, h: 11 }, { type: 'cistern', x: 57, y: 6, w: 32, h: 14 }, { type: 'outpipe', x: 89, y: 10, w: 9, h: 2 },
    { type: 'crates', x: 12, y: 18, w: 2, h: 1 }, { type: 'boxes', x: 31, y: 8, w: 3, h: 1 }, { type: 'barrels', x: 47, y: 10, w: 2, h: 1 },
    lamp(8, 2, 22), lamp(15, 2, 9 * TL, 160), lamp(33, 2, 6 * TL, 170), lamp(46, 2, 22), lamp(60, 2, 24, 170), lamp(72, 2, 24, 170), lamp(84, 2, 26, 170), lamp(94, 2, 6 * TL, 130),
  ],
};
const WEB = (l) => [{ type: 'web', x: 2, y: 2, w: 2, h: 2 }, { type: 'web', x: l.map[0].length - 4, y: 2, w: 2, h: 2, flip: true }];

export const levels = [level41(), level42(), level43(), level44(), level45(), level46()]
  .map((l) => ({ ...l, decor: [...WEB(l), ...(DECOR[l.id] || [])] }));
