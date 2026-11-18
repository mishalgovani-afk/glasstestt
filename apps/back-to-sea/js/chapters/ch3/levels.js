// Chapter 3 levels, composed with the Grid builder. Flow regions are placed with g.flow(ch, x, y, w, h):
// R L U D = right/left/up/down, A = up-right, B = up-left, Y = down-right, Z = down-left, M = drum.
import { Grid } from './builder.js';

const done = (g, def) => ({ ...def, map: g.rows(), props: g.props });

/** a vent-strip of hot grates on the floor (falling there faints at once, so a miss is cheap) */
const vents = (g, x0, x1) => { for (let x = x0; x <= x1; x++) g.set(x, g.h - 3, '^'); };

// ------------------------------------------------------------------------------------------ 3-1
function l1() {
  const g = new Grid(58, 15).floor();
  // the bathroom drain pipe: ceiling row 2, floor row 5, current runs right
  g.rect(0, 2, 15, 4, '#').rect(1, 3, 14, 2, '~').flow('R', 1, 3, 14, 2);
  g.set(2, 3, 'S').set(11, 4, 'C');
  // utility tub A, water surface row 7
  g.rect(21, 7, 18, 6, '#').rect(22, 7, 16, 5, '~');
  g.set(24, 9, 'C');
  g.flow('A', 31, 8, 6, 2, { jet: true });
  // counter with the floor drain
  g.rect(44, 5, 12, 8, '#').set(53, 4, 'E');
  g.set(48, 4, 'o');
  vents(g, 15, 20); vents(g, 39, 43);
  return done(g, {
    id: '3-1', name: 'Down the Pipe', budget: 50,
    hint: 'Currents push you along. JUMP inside one to DASH!',
    says: [
      { x: 8, y: 4, text: 'End of the pipe: JUMP while the current carries you!', seconds: 4 },
      { x: 24, y: 9, text: 'A jet! JUMP inside it to dash up and across.', seconds: 4 },
    ],
    decor: [
      { type: 'pipe', x: 0, y: 2, w: 15, h: 4, hideTiles: true },
      { type: 'tub', x: 21, y: 7, w: 18, h: 6, hideTiles: true },
      { type: 'counter', x: 44, y: 5, w: 12, h: 8, hideTiles: true },
    ],
  });
}



// ------------------------------------------------------------------------------------------ 3-2
function l2() {
  const g = new Grid(90, 16).floor();
  // utility sink A with a jet
  g.rect(0, 10, 17, 4, '#').rect(1, 10, 15, 3, '~');
  g.set(2, 11, 'S').flow('A', 9, 11, 7, 2, { jet: true });
  // laundry counter: puddles, an iron, drips
  g.rect(24, 8, 15, 6, '#');
  g.set(26, 7, '-').set(27, 7, '-').set(35, 7, '^').set(29, 6, 'o').set(32, 6, 'o').set(37, 7, 'C');
  // the clothesline gap: stepping shelves under wet laundry
  g.put(42, 8, '==').put(46, 6, '==').put(50, 8, '==');
  g.set(43, 4, 'W').prop(43, 4, { period: 1.2 }).set(47, 2, 'W').prop(47, 2, { period: 1.2, color: '#7fd1ae' });
  g.set(51, 5, 'W').prop(51, 5, { period: 1.3, color: '#ffd24d' });
  // tub B with a side pipe
  g.rect(54, 9, 22, 5, '#').rect(55, 9, 14, 4, '~');
  g.rect(69, 9, 7, 2, '#').rect(69, 11, 7, 2, '~').flow('R', 69, 11, 7, 2);
  g.set(60, 11, 'C');
  // counter with the sink drain
  g.rect(82, 13, 8, 1, '#').set(86, 12, 'E');
  vents(g, 17, 23); vents(g, 39, 41); vents(g, 76, 81);
  return done(g, {
    id: '3-2', name: 'Utility Sink', budget: 65,
    hint: 'A jet! Dash with JUMP, but hot vents wait below.',
    says: [
      { x: 25, text: 'Hot iron! Hop over it. Puddles refill you.', seconds: 3.5 },
      { x: 41, text: 'Catch the drips from the wet laundry.', seconds: 3.5 },
      { x: 66, y: 11, text: 'Another pipe: dash from inside it.', seconds: 3.5 },
    ],
    decor: [
      { type: 'tub', x: 0, y: 10, w: 17, h: 4, hideTiles: true },
      { type: 'counter', x: 24, y: 8, w: 15, h: 6, hideTiles: true },
      { type: 'board', x: 34, y: 7, w: 3, h: 1 },
      { type: 'line', x: 40, y: 3, w: 14, h: 1 },
      { type: 'tub', x: 54, y: 9, w: 15, h: 5, hideTiles: true },
      { type: 'pipe', x: 69, y: 9, w: 7, h: 4, hideTiles: true },
      { type: 'counter', x: 82, y: 13, w: 8, h: 1, hideTiles: true },
    ],
  });
}

// ------------------------------------------------------------------------------------------ 3-3
function l3() {
  const g = new Grid(80, 16).floor();
  // bucket brigade: three buckets rising, each with a jet
  g.rect(1, 10, 10, 4, '#').rect(2, 10, 8, 3, '~').set(3, 11, 'S').flow('A', 6, 11, 4, 2, { jet: true });
  g.rect(15, 7, 10, 7, '#').rect(16, 7, 8, 5, '~').flow('A', 19, 8, 4, 2, { jet: true }).set(17, 9, 'C');
  g.rect(29, 4, 10, 10, '#').rect(30, 4, 8, 8, '~').flow('A', 33, 5, 5, 2, { jet: true });
  // top shelf gauntlet
  g.rect(44, 4, 20, 10, '#');
  g.set(53, 2, 'W').prop(53, 2, { period: 1.2 }).set(56, 3, '^').set(58, 3, 'o').set(60, 3, 'C');
  g.set(61, 0, 'W').prop(61, 0, { period: 1.3, color: '#7fd1ae' });
  g.set(54, 3, '-').set(55, 3, '-');
  // down to the sink drain via a hose pipe
  g.put(66, 5, '==').put(70, 7, '==');
  g.rect(73, 9, 7, 5, '#').rect(74, 9, 5, 4, '~').set(77, 12, 'E');
  vents(g, 11, 14); vents(g, 25, 28); vents(g, 39, 43);
  return done(g, {
    id: '3-3', name: 'Bucket Brigade', budget: 70,
    hint: 'Dash from jet to jet. Each bucket is higher than the last!',
    says: [
      { x: 47, text: 'Drips refill you up here. Mind the iron!', seconds: 3.5 },
    ],
    decor: [
      { type: 'bucket', x: 1, y: 10, w: 10, h: 4, hideTiles: true },
      { type: 'bucket', x: 15, y: 7, w: 10, h: 7, hideTiles: true },
      { type: 'bucket', x: 29, y: 4, w: 10, h: 10, hideTiles: true },
      { type: 'counter', x: 44, y: 4, w: 20, h: 10, hideTiles: true },
      { type: 'board', x: 56, y: 3, w: 3, h: 1 },
      { type: 'line', x: 51, y: 0, w: 12, h: 1 },
      { type: 'tub', x: 73, y: 9, w: 7, h: 5, hideTiles: true },
    ],
  });
}



// ------------------------------------------------------------------------------------------ 3-4
function l4() {
  const g = new Grid(66, 17).floor();
  // feeder pipe into the washing machine (cabinet x14..27)
  g.rect(2, 7, 12, 4, '#').rect(3, 8, 11, 2, '~');
  g.rect(14, 2, 14, 13, '#');
  g.drum(22, 9, 4, 0);
  g.rect(14, 8, 4, 2, '~').flow('R', 3, 8, 15, 2);   // inlet pipe through the cabinet
  g.set(4, 8, 'S').set(22, 9, 'M').prop(22, 9, { cx: 22, cy: 9, r: 4, step: 1 });
  g.rect(26, 6, 2, 4, '.').set(25, 6, '.');            // the porthole door out of the drum (upper right)
  // counter with an iron and drips
  g.rect(33, 9, 15, 6, '#');
  g.set(35, 8, '-').set(36, 8, '-').set(44, 8, '^').set(39, 7, 'o').set(41, 7, 'o').set(46, 8, 'C');
  g.set(40, 4, 'W').prop(40, 4, { period: 1.2 });
  // bucket with the drain
  g.rect(51, 9, 11, 6, '#').rect(52, 9, 9, 5, '~').set(57, 12, 'E');
  vents(g, 28, 32); vents(g, 48, 50);
  return done(g, {
    id: '3-4', name: 'Spin Cycle', budget: 75,
    hint: 'The drum spins its current round. JUMP when the arrow points the way out!',
    says: [
      { x: 19, y: 9, text: 'The arrow shows where a dash would go. Aim for the porthole!', seconds: 5 },
      { x: 34, text: 'Puddles and drips keep you wet. Hop the iron.', seconds: 3.5 },
    ],
    decor: [
      { type: 'pipe', x: 2, y: 7, w: 12, h: 4, hideTiles: true },
      { type: 'washer', x: 14, y: 2, w: 14, h: 13, hideTiles: true, cx: 22, cy: 9, r: 4, door: { x: 25, y: 6, w: 3, h: 4 } },
      { type: 'counter', x: 33, y: 9, w: 15, h: 6, hideTiles: true },
      { type: 'board', x: 43, y: 8, w: 3, h: 1 },
      { type: 'line', x: 39, y: 3, w: 6, h: 1 },
      { type: 'bucket', x: 51, y: 9, w: 11, h: 6, hideTiles: true },
    ],
  });
}

// ------------------------------------------------------------------------------------------ 3-5
function l5() {
  const g = new Grid(92, 17).floor();
  // laundry tub with a jet: up to the first counter
  g.rect(1, 11, 11, 4, '#').rect(2, 11, 9, 3, '~').set(3, 12, 'S').flow('A', 6, 12, 5, 2, { jet: true });
  g.rect(18, 9, 8, 6, '#');
  g.set(20, 8, '-').set(21, 8, '-').set(23, 7, 'o').set(24, 8, 'C');
  // washer A (counter-clockwise, brisk): porthole in on the left, out on the right
  g.rect(26, 2, 13, 13, '#');
  g.drum(33, 8, 4, 0);
  g.rect(26, 7, 3, 2, '.');
  g.rect(37, 7, 2, 2, '.');
  g.set(33, 8, 'M').prop(33, 8, { cx: 33, cy: 8, r: 4, step: 0.9, ccw: true });
  // counter B
  g.rect(44, 11, 14, 4, '#');
  g.set(46, 10, '-').set(47, 10, '-').set(53, 10, '^').set(50, 9, 'o').set(56, 10, 'C');
  g.set(49, 6, 'W').prop(49, 6, { period: 1.2 });
  // washer B (clockwise): porthole in on the left, out up on the right
  g.rect(58, 2, 15, 13, '#');
  g.drum(66, 8, 4, 0);
  g.rect(58, 9, 4, 2, '.');
  g.rect(70, 6, 3, 3, '.');
  g.set(66, 8, 'M').prop(66, 8, { cx: 66, cy: 8, r: 4, step: 0.8 });
  // high shelf with the floor drain
  g.rect(78, 10, 14, 4, '#').set(86, 9, 'E').set(81, 9, 'o');
  vents(g, 12, 17); vents(g, 39, 43); vents(g, 73, 77);
  return done(g, {
    id: '3-5', name: 'Agitation', budget: 85,
    hint: 'Two washers. Wriggle through the portholes, then time your dash.',
    says: [
      { x: 28, y: 8, text: 'This drum spins the other way, and faster!', seconds: 4 },
      { x: 59, y: 10, text: 'Last one: dash out through the upper porthole.', seconds: 4 },
    ],
    decor: [
      { type: 'bucket', x: 1, y: 11, w: 11, h: 4, hideTiles: true },
      { type: 'counter', x: 18, y: 9, w: 8, h: 6, hideTiles: true },
      { type: 'washer', x: 26, y: 2, w: 13, h: 13, hideTiles: true, cx: 33, cy: 8, r: 4, door: { x: 37, y: 7, w: 2, h: 2 }, door2: { x: 26, y: 7, w: 3, h: 2 } },
      { type: 'counter', x: 44, y: 11, w: 14, h: 4, hideTiles: true },
      { type: 'board', x: 52, y: 10, w: 3, h: 1 },
      { type: 'washer', x: 58, y: 2, w: 15, h: 13, hideTiles: true, cx: 66, cy: 8, r: 4, door: { x: 70, y: 6, w: 3, h: 3 }, door2: { x: 58, y: 9, w: 4, h: 2 } },
      { type: 'counter', x: 78, y: 10, w: 14, h: 4, hideTiles: true },
    ],
  });
}

// ------------------------------------------------------------------------------------------ 3-6
function l6() {
  const g = new Grid(86, 17).floor();
  // the washer's drain hose, high on the left: a tub feeding a pipe
  g.rect(1, 3, 12, 6, '#').rect(2, 3, 10, 5, '~');
  g.rect(12, 4, 7, 4, '#').rect(12, 5, 7, 2, '~').flow('R', 2, 5, 17, 2);
  g.set(3, 4, 'S').set(8, 6, 'C');
  // counter: puddles, iron, wet laundry
  g.rect(25, 8, 12, 7, '#');
  g.set(27, 7, '-').set(28, 7, '-').set(35, 7, '^').set(30, 6, 'o').set(33, 6, 'o').set(36, 7, 'C');
  g.set(31, 3, 'W').prop(31, 3, { period: 1.2 });
  // washer: counter-clockwise and quick
  g.rect(40, 1, 15, 14, '#');
  g.drum(48, 7, 4, 0);
  g.rect(40, 6, 4, 2, '.');
  g.rect(52, 7, 3, 2, '.');
  g.set(48, 7, 'M').prop(48, 7, { cx: 48, cy: 7, r: 4, step: 0.9, ccw: true });
  // the draining basin: flows funnel toward the floor drain
  g.rect(60, 11, 24, 3, '#').rect(61, 11, 22, 3, '~');
  g.flow('Y', 61, 12, 10, 2).flow('D', 71, 12, 1, 2).flow('Z', 72, 12, 10, 2);
  g.set(71, 13, 'E');
  vents(g, 19, 24); vents(g, 37, 39); vents(g, 55, 59);
  return done(g, {
    id: '3-6', name: 'Down the Drain', budget: 75,
    hint: 'Pipe, counter, washer. Then the floor drain!',
    says: [
      { x: 41, y: 7, text: 'It spins the other way. Get next to the porthole, then dash!', seconds: 4.5 },
      { x: 62, y: 12, text: 'The basin drains toward the floor drain. Let it pull you in!', seconds: 4.5 },
    ],
    decor: [
      { type: 'tub', x: 1, y: 3, w: 11, h: 6, hideTiles: true },
      { type: 'pipe', x: 12, y: 4, w: 7, h: 4, hideTiles: true },
      { type: 'counter', x: 25, y: 8, w: 12, h: 7, hideTiles: true },
      { type: 'board', x: 34, y: 7, w: 3, h: 1 },
      { type: 'line', x: 28, y: 2, w: 6, h: 1 },
      { type: 'washer', x: 40, y: 1, w: 15, h: 14, hideTiles: true, cx: 48, cy: 7, r: 4, door: { x: 52, y: 7, w: 3, h: 2 }, door2: { x: 40, y: 6, w: 4, h: 2 } },
      { type: 'basin', x: 60, y: 11, w: 24, h: 3, hideTiles: true },
    ],
  });
}

export const levels = [l1(), l2(), l3(), l4(), l5(), l6()];
