// Chapter 2 (bathroom) mechanic tests: the pure bubble rules that the validator's reach claims rely on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { B, stepCarry, stepFree, popPoints, streamEnd, touchesHazardTile } from '../js/chapters/ch2/logic.js';
import { reach } from '../js/chapters/ch2/reach.js';
import bathroom from '../js/chapters/ch2-bathroom.js';
import { TILE, STEP } from '../js/core/constants.js';

const open = () => false;
const fresh = (x = 100, y = 400) => ({ x, y, vx: 0, vy: 0, t: 0 });

test('a carrying bubble rises at least RISE_TILES before it runs out of air', () => {
  const s = fresh();
  let ev;
  const y0 = s.y;
  while (!(ev = stepCarry(s, STEP, 0, 0, open)).expired) { /* rise */ }
  assert.ok(y0 - s.y >= B.RISE_TILES * TILE, `rose ${(y0 - s.y) / TILE} tiles`);
});

test('worst-case sideways drift (full wind against you) covers every dx the reach rule claims', () => {
  for (let rise = 0; rise <= B.RISE_TILES; rise++) {
    const pts = popPoints(20, 20, open).filter((p) => p.rise === rise);
    const maxDx = Math.max(...pts.map((p) => Math.abs(p.dx)));
    for (const dir of [-1, 1]) {
      const s = fresh(0, 0);
      const wind = -dir * B.MAX_WIND;
      const need = (rise * TILE) / B.RISE; // seconds to rise that far is at least this
      let t = 0;
      while (t < need) { stepCarry(s, STEP, dir, wind, open); t += STEP; }
      assert.ok(Math.abs(s.x) >= maxDx * TILE - 0.01, `rise ${rise}: drifted ${s.x.toFixed(1)}px, claimed ${maxDx} tiles`);
    }
  }
});

test('a bubble that bumps a ceiling reports it, and is not moved into the solid', () => {
  const solidAbove = (x0, y0, x1, y1) => y0 < 300; // everything above y=300 is solid
  const s = fresh(100, 320);
  let hit = false;
  for (let i = 0; i < 400 && !hit; i++) hit = stepCarry(s, STEP, 0, 0, solidAbove).ceiling;
  assert.ok(hit);
  assert.ok(s.y - B.HR >= 300 - 1e-6);
});

test('walls stop sideways drift without popping', () => {
  const wallRight = (x0, y0, x1) => x1 > 150;
  const s = fresh(100, 400);
  for (let i = 0; i < 600; i++) { const ev = stepCarry(s, STEP, 1, 0, wallRight); assert.equal(ev.ceiling, false); if (ev.expired) break; }
  assert.ok(s.x + B.HR <= 150 + 1e-6);
});

test('a bubble fits a one-tile shaft', () => { assert.ok(B.HR * 2 < TILE); assert.ok(B.HR >= 9, 'must cover the fish (half width 9)'); });

test('loose bubbles rise and eventually expire', () => {
  const s = { x: 100, y: 400, t: 0, phase: 0 };
  let ev;
  for (let i = 0; i < 2000 && !(ev = stepFree(s, STEP, 0, open)).expired; i++);
  assert.ok(ev.expired && s.y < 400 - 100);
});

test('popPoints respects blockers and drift limits', () => {
  const blocked = (x, y) => y === 17; // ceiling row
  const pts = popPoints(10, 20, blocked);
  assert.ok(pts.every((p) => p.y >= 18), 'cannot rise through a blocked row');
  assert.ok(pts.some((p) => p.dx === 0 && p.rise === 2));
  assert.ok(!pts.some((p) => p.rise === 0 && p.dx !== 0), 'no drift before it has risen');
  assert.ok(!popPoints(10, 20, (x) => x === 11).some((p) => p.dx > 0), 'cannot drift through a wall');
});

test('streamEnd stops on floors, shelves, water', () => {
  const rows = ['.....', '.....', '..=..', '.....', '#####'];
  const at = (x, y) => (rows[y] ? rows[y][x] : '.');
  assert.equal(streamEnd(2, 0, at, 5), 1);
  assert.equal(streamEnd(0, 0, at, 5), 3);
});

test('hazard tiles pop a bubble that touches them', () => {
  assert.ok(touchesHazardTile(5 * TILE + 12, 5 * TILE + 10, 5, 5));
  assert.ok(!touchesHazardTile(5 * TILE + 12, 5 * TILE - 30, 5, 5));
});

test('reach rules cover every chapter entity that matters', () => {
  for (const k of ['B', 'M', 'H', 'D']) assert.ok(reach[k], `reach.${k}`);
  assert.ok(reach.B.trigger && reach.M.trigger);
});

test('level design lint: emitters stand on something, winds stay within MAX_WIND', () => {
  for (const L of bathroom.levels) {
    const at = (x, y) => (L.map[y] ? L.map[y][x] : '#');
    L.map.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === 'M') assert.ok(['#', '='].includes(at(x, y + 1)), `${L.id}: M at ${x},${y} floats`);
      if (c === 'W') assert.ok(Math.abs((L.props[`${x},${y}`] || {}).vx ?? 24) <= B.MAX_WIND, `${L.id}: wind too strong`);
      if (c === 'K') assert.equal(at(x, y + 1), '~', `${L.id}: duck at ${x},${y} should sit on water`);
    }));
  }
});

test('chapter budgets sum to about 7 minutes', () => {
  const total = bathroom.levels.reduce((a, l) => a + l.budget, 0);
  assert.ok(total >= 400 && total <= 440, `budgets sum to ${total}s`);
});
