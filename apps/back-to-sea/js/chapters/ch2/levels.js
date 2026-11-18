// Chapter 2 levels, built with grid(). Legend (chapter): B bubble, M bubble maker, H shower head,
// W air current, D dripping tap, K rubber duck. Core: # = ~ - ^ o S E C.
import { grid } from './grid.js';

// ---------------------------------------------------------------------------------------------
// 2-1  Mop Bucket Escape — the kitchen drain empties into a mop bucket. Learn bubbles.
function l21() {
  const g = grid(48, 16).floor();
  g.fill(2, 10, 2, 13, '#').fill(7, 10, 7, 13, '#').fill(3, 10, 6, 13, '~').set(4, 11, 'S');
  g.set(10, 13, 'o');
  g.set(15, 11, 'B');                       // teaching bubble, one hop above the floor
  g.fill(19, 8, 26, 13, '#');               // linen cabinet
  g.set(29, 7, 'B');                        // bubble over the gap to the vanity
  g.fill(33, 9, 46, 13, '#').fill(37, 9, 42, 11, '~').set(39, 11, 'E'); // vanity + basin
  g.set(30, 12, 'B');                       // floor bubble: a way back up if you fall
  return {
    id: '2-1', name: 'Mop Bucket Escape', budget: 55,
    hint: 'The kitchen drain dumped you in a mop bucket. Touch a bubble!',
    map: g.out(),
    decor: [
      { type: 'window', x: 22, y: 2, w: 3, h: 4 },
      { type: 'pipe', x: 0, y: 5, w: 4, h: 5 },
      { type: 'bucket', x: 2, y: 10, w: 6, h: 4, hideTiles: true },
      { type: 'cabinet', x: 19, y: 8, w: 8, h: 6, hideTiles: true },
      { type: 'vanity', x: 33, y: 9, w: 14, h: 5, hideTiles: true, basin: [37, 42] },
      { type: 'mirror', x: 34, y: 2, w: 8, h: 5 },
      { type: 'mat', x: 9, y: 13, w: 4, h: 1 },
    ],
    says: [
      { x: 12, text: 'Touch a bubble to float up. MOVE steers it.' },
      { x: 20, text: 'JUMP pops a bubble into a big boost!' },
      { x: 33, text: 'The sink drain is just ahead.' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// 2-2  Soap Dish Shelf — bubble makers blow bubbles on a rhythm. Up the shelves, across to the toilet tank.
function l22(hx = 27) {
  const g = grid(hx + 24, 19).floor();               // floor rows 17,18; stand row 16
  g.fill(0, 13, 13, 16, '#');                        // vanity, top row 13
  g.fill(2, 11, 2, 12, '#').fill(6, 11, 6, 12, '#').fill(3, 11, 5, 12, '~').set(4, 12, 'S'); // tooth glass
  g.set(10, 12, 'M');                                // soap dish on the counter
  g.fill(16, 8, 21, 8, '=');                         // glass shelf, stand row 7
  g.set(19, 7, 'M');
  g.set(14, 11, 'o');
  g.fill(hx, 12, hx + 6, 16, '#');                   // hamper, top row 12
  g.set(hx + 4, 11, 'M');
  const t = hx + 11;                                 // toilet tank
  g.fill(t, 9, t, 16, '#').fill(t + 6, 9, t + 6, 16, '#').fill(t + 1, 9, t + 5, 10, '~').fill(t + 1, 11, t + 5, 16, '#').set(t + 3, 10, 'E');
  g.set(hx - 3, 15, 'B').set(hx + 9, 15, 'B');      // floor bubbles: the way back up
  return {
    id: '2-2', name: 'Soap Dish Shelf', budget: 60,
    hint: 'Soap dishes blow bubbles on a beat. Wait in the dish to catch one.',
    map: g.out(),
    decor: [
      { type: 'window', x: 34, y: 2, w: 3, h: 5 },
      { type: 'mirror', x: 2, y: 5, w: 5, h: 5 },
      { type: 'towels', x: 46, y: 9, w: 3, h: 2 },
      { type: 'cabinet', x: 0, y: 13, w: 14, h: 4, hideTiles: true, plain: true },
      { type: 'cup', x: 2, y: 11, w: 5, h: 2, hideTiles: true },
      { type: 'bottles', x: 12, y: 12, w: 2, h: 1 },
      { type: 'bottles', x: 16, y: 7, w: 3, h: 1 },
      { type: 'hamper', x: 27, y: 12, w: 7, h: 5, hideTiles: true },
      { type: 'toilet', x: 38, y: 9, w: 7, h: 8, hideTiles: true },
    ],
    says: [
      { x: 6, text: 'Stand in the soap dish. It blows a bubble every few seconds.' },
      { x: 15, y: 9, text: 'Glass shelves: jump up through them from below.' },
      { x: 24, text: 'Missed? Bubbles on the floor will lift you back up.' },
      { x: 36, text: 'The toilet tank is a clean pool. Dive in!' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// 2-3  Shower Stall — showers are wet columns: they refill you but pop bubbles.
function l23() {
  const g = grid(64, 19).floor();                      // stand row 16
  g.set(2, 16, 'S').set(3, 16, '-').set(4, 16, '-').set(7, 16, 'o');
  g.set(6, 13, 'B');                                   // bubble over the tall tile partition
  g.fill(10, 8, 11, 16, '#');                          // partition
  g.fill(14, 10, 20, 10, '=');                         // shelf, stand row 9
  g.set(17, 3, 'H');                                   // shower: stream lands on the shelf (refill)
  g.set(14, 9, 'M');
  g.fill(26, 6, 32, 6, '=');                           // upper shelf, stand row 5
  g.set(23, 9, 'B');
  g.set(28, 5, 'o').set(31, 5, 'M');
  g.fill(37, 9, 38, 16, '#');                          // second partition (top row 9)
  g.set(33, 2, 'H');                                   // always-on stream beside it, lands on the floor
  g.set(35, 15, 'B');
  g.set(42, 3, 'H');                                   // pulsing shower between the partition and the tub
  g.puts(16, 44, '-----');
  // bathtub
  g.fill(46, 11, 46, 16, '#').fill(60, 11, 60, 16, '#').fill(47, 12, 59, 16, '~').set(56, 15, 'E');
  g.set(52, 11, 'K').set(44, 15, 'B');
  g.set(38, 8, 'M');
  return {
    id: '2-3', name: 'Shower Stall', budget: 65,
    hint: 'Showers keep you wet, but they pop any bubble that touches them.',
    map: g.out(), props: { '42,3': { period: 4, on: 2.4 } },
    decor: [
      { type: 'curtain', x: 0, y: 2, w: 9, h: 14 },
      { type: 'window', x: 21, y: 1, w: 3, h: 4 },
      { type: 'mat', x: 13, y: 16, w: 6, h: 1 },
      { type: 'bottles', x: 36, y: 8, w: 1, h: 1 },
      { type: 'tub', x: 46, y: 11, w: 15, h: 7, depth: 6, hideTiles: true },
      { type: 'foam', x: 47, y: 12, w: 13, h: 1 },
      { type: 'towels', x: 62, y: 8, w: 3, h: 2 },
    ],
    says: [
      { x: 5, text: 'Bubble over the wall! Hold MOVE to steer.' },
      { x: 14, text: 'Showers keep you wet. Stand in one to refill.' },
      { x: 24, text: 'A shower pops any bubble that touches it.' },
      { x: 40, text: 'This shower pulses. Wait for a dry moment.' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// 2-4  Medicine Cabinet — a tall climb up the cabinet shelves to the tooth glass at the top.
function l24() {
  const g = grid(36, 30).floor();                      // tier 0: stand row 27
  const slab = (row, h0, h1) => { g.fill(0, row, 35, row, '#'); g.fill(h0, row, h1, row, '.'); };
  slab(22, 8, 12);                                     // tier 1 floor: stand row 21, hole at the left
  slab(16, 18, 21);                                    // tier 2: stand row 15, hole at the right
  slab(10, 6, 8);                                      // tier 3: stand row 9, narrow hole at the left
  slab(4, 22, 24);                                     // top tier: stand row 3, hole at the right
  g.set(2, 27, 'S').set(3, 27, '-').set(4, 27, '-').set(15, 27, 'o');
  g.set(7, 25, 'B');                                   // under hole 1
  g.set(19, 21, 'M').set(14, 20, 'o');                 // dish under hole 2
  g.set(12, 15, 'C').set(9, 14, 'B');                   // checkpoint; bubble under hole 3 (the ceiling is 3 tiles up)
  g.set(23, 9, 'M').set(14, 6, 'D');                   // dish under hole 4; tap over tier 3
  g.fill(13, 5, 15, 5, '#');
  g.fill(27, 2, 27, 3, '#').fill(32, 2, 32, 3, '#').fill(28, 2, 31, 3, '~').set(29, 3, 'E'); // tooth glass
  return {
    id: '2-4', name: 'Medicine Cabinet', budget: 70,
    hint: 'Steer your bubble up through the holes. Bump a ceiling and it pops!',
    map: g.out(),
    decor: [
      { type: 'towels', x: 20, y: 23, w: 4, h: 2 },
      { type: 'mirror', x: 24, y: 17, w: 4, h: 3 },
      { type: 'bottles', x: 10, y: 21, w: 3, h: 1 },
      { type: 'window', x: 26, y: 11, w: 3, h: 4 },
      { type: 'medcab', x: 22, y: 5, w: 4, h: 3 },
      { type: 'mirror', x: 3, y: 0, w: 6, h: 3 },
      { type: 'cup', x: 27, y: 2, w: 6, h: 2, hideTiles: true },
    ],
    says: [
      { x: 4, y: 26, text: 'Steer into the hole! Bump the ceiling and the bubble pops.' },
      { x: 16, y: 20, text: 'Wait in the dish for the next bubble.' },
      { x: 8, y: 14, text: 'The ceiling is low here. Pop before you bump it.' },
      { x: 24, y: 3, text: 'The tooth glass! Dive in.' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// 2-5  Steam Room — scalding vents on the floor; air currents carry bubbles across.
function l25() {
  const g = grid(74, 17).floor();                      // stand row 14
  g.set(2, 14, 'S').set(3, 14, '-').set(5, 14, 'o');
  g.puts(14, 9, '^^^^^^^^^^^^^^');                     // vent field 1 (cols 9..22)
  g.set(7, 12, 'B');
  g.fill(15, 11, 16, 14, '#').set(15, 10, 'M');        // pedestal 1
  g.set(24, 14, 'C').set(25, 12, 'o').set(27, 14, 'M');
  g.puts(14, 29, '^^^^^^^^^^^^^^');                    // vent field 2 (cols 29..42)
  g.fill(34, 10, 35, 14, '#').set(34, 9, 'M');         // pedestal 2
  g.set(30, 5, 'W');
  g.fill(43, 11, 44, 14, '#').set(44, 10, 'M');        // pedestal 3
  g.puts(14, 45, '^^^^^^^^^^^^^^^^');                  // vent field 3 (cols 45..60)
  g.fill(52, 10, 53, 14, '#').set(53, 9, 'M');         // pedestal 4
  g.set(48, 5, 'W');
  g.set(61, 12, 'B');
  g.fill(63, 9, 63, 14, '#').fill(69, 9, 69, 14, '#').fill(64, 10, 68, 11, '~').fill(64, 12, 68, 14, '#').set(66, 11, 'E');
  return {
    id: '2-5', name: 'Steam Room', budget: 80, steamy: true,
    hint: 'Scalding vents! Float over them. Air currents push bubbles sideways.',
    map: g.out(), props: { '30,5': { w: 12, h: 5, vx: 24 }, '48,5': { w: 12, h: 5, vx: 24 } },
    decor: [
      { type: 'window', x: 10, y: 2, w: 3, h: 4 },
      { type: 'window', x: 40, y: 2, w: 3, h: 4 },
      { type: 'cabinet', x: 15, y: 11, w: 2, h: 4, hideTiles: true, plain: true },
      { type: 'cabinet', x: 34, y: 10, w: 2, h: 5, hideTiles: true, plain: true },
      { type: 'cabinet', x: 43, y: 11, w: 2, h: 4, hideTiles: true, plain: true },
      { type: 'cabinet', x: 52, y: 10, w: 2, h: 5, hideTiles: true, plain: true },
      { type: 'towels', x: 20, y: 6, w: 3, h: 2 },
      { type: 'tub', x: 63, y: 9, w: 7, h: 6, depth: 3, hideTiles: true },
      { type: 'foam', x: 64, y: 10, w: 5, h: 1 },
    ],
    says: [
      { x: 6, text: 'Scalding vents on the floor! Touch one and you faint.' },
      { x: 29, text: 'Air currents push bubbles sideways.' },
      { x: 60, text: 'One more bubble up to the tub.' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// 2-6  Down the Drain — the whole bathroom at once, ending at the bathtub plug.
function l26() {
  const g = grid(84, 19).floor();                      // stand row 16
  g.set(2, 16, 'S').set(3, 16, '-').set(4, 16, '-').set(7, 16, 'o');
  g.set(8, 14, 'B');                                   // over the first partition
  g.fill(11, 11, 12, 16, '#');                         // partition 1 (stand row 10)
  g.set(15, 6, 'H');                                   // stream 1: refills you on the floor
  g.fill(17, 12, 23, 12, '=').set(23, 11, 'M');        // shelf (stand row 11)
  g.set(26, 5, 'H');                                   // stream 2: pulsing
  g.fill(29, 9, 30, 16, '#').set(30, 8, 'M').set(29, 8, 'C');          // partition 2 (stand row 8)
  g.puts(16, 35, '^^^^^^^^^^^^^^^^');                  // vents (cols 35..50)
  g.fill(37, 12, 38, 16, '#').set(38, 11, 'M');        // pedestal A
  g.fill(46, 12, 47, 16, '#').set(47, 11, 'M');        // pedestal B
  g.set(36, 6, 'W');
  g.puts(8, 42, '^^^');                                // hot pipe overhead
  g.set(55, 16, 'C').set(53, 13, 'o');
  g.fill(52, 11, 61, 11, '#').fill(56, 11, 58, 11, '.'); // cabinet floor with a hole
  g.set(57, 16, 'M');                                  // dish under the hole
  g.set(60, 7, 'D').fill(60, 6, 60, 6, '#');
  // bathtub
  g.fill(65, 10, 65, 16, '#').fill(83, 10, 83, 16, '#').fill(66, 11, 82, 16, '~').set(80, 16, 'E');
  g.set(73, 10, 'K').set(70, 3, 'H');
  g.set(62, 15, 'B');
  return {
    id: '2-6', name: 'Down the Drain', budget: 90,
    hint: 'Everything at once. The tub plug is the way out!',
    map: g.out(),
    props: { '15,6': {}, '26,5': { period: 4, on: 2.4 }, '36,6': { w: 12, h: 5, vx: 24 } },
    decor: [
      { type: 'curtain', x: 0, y: 2, w: 9, h: 14 },
      { type: 'window', x: 44, y: 1, w: 3, h: 4 },
      { type: 'mat', x: 13, y: 16, w: 4, h: 1 },
      { type: 'cabinet', x: 37, y: 12, w: 2, h: 5, hideTiles: true, plain: true },
      { type: 'cabinet', x: 46, y: 12, w: 2, h: 5, hideTiles: true, plain: true },
      { type: 'towels', x: 40, y: 3, w: 4, h: 2 },
      { type: 'tub', x: 65, y: 10, w: 19, h: 8, depth: 7, hideTiles: true },
      { type: 'foam', x: 66, y: 11, w: 17, h: 1 },
    ],
    says: [
      { x: 6, text: 'Last bathroom. Everything you learned, all at once.' },
      { x: 35, text: 'Hot vents ahead. Use the pedestals.' },
      { x: 52, text: 'Steer up through the hole in the cabinet top.' },
      { x: 66, text: 'Dive down to the plug. That is the way out!' },
    ],
  };
}

export const levels = [l21(), l22(), l23(), l24(), l25(), l26()];
