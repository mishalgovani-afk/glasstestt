// Chapter 3 tests: dash maths, drum timing, honesty of the current regions, and that every level
// really needs the mechanic (it must NOT validate with the reach rules removed).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import laundry from '../js/chapters/ch3-laundry.js';
import { dashLaunch, dirVec, drumState, drumDashDir, DRUM_ORDER, DRUM_GRACE, DASH_SPEED, DASH_T, DRIFT_SPEED, inDrum } from '../js/chapters/ch3/flow.js';
import { validateLevel } from '../js/core/validate.js';
import { parseLevel } from '../js/core/level.js';
import { SWIM_SPEED, LEAP_BALLISTIC, TILE } from '../js/core/constants.js';

test('dash launch: horizontal dash is fast with a little lift, up is stronger', () => {
  const r = dashLaunch(1, 0);
  assert.equal(r.vx, DASH_SPEED); assert.ok(r.vy < 0 && r.vy > -300); assert.equal(r.leapT, LEAP_BALLISTIC);
  assert.equal(DASH_T, LEAP_BALLISTIC);
  assert.ok(dashLaunch(0, -1).vy < -DASH_SPEED);
  assert.ok(dashLaunch(-1, 0).vx < 0);
  for (const d of ['R', 'L', 'U', 'D', 'UR', 'UL', 'DR', 'DL']) { const [x, y] = dirVec(d); assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9, d); }
});

test('currents are always weaker than swimming (swimming upstream stays possible)', () => {
  assert.ok(DRIFT_SPEED < SWIM_SPEED * 0.6);
  for (const lv of laundry.levels) for (const p of Object.values(lv.props || {})) if (p.speed !== undefined) assert.ok(p.speed < SWIM_SPEED * 0.6);
});

test('drum: 8 directions, clockwise by default, ccw reverses, steps on schedule', () => {
  assert.equal(DRUM_ORDER.length, 8);
  assert.equal(drumState(0).dir, 'U'); assert.equal(drumState(1.01).dir, 'UR'); assert.equal(drumState(2.5).dir, 'R');
  assert.equal(drumState(1.01, { ccw: true }).dir, 'UL');
  assert.equal(drumState(1.0, { step: 0.5 }).dir, 'R');
  assert.equal(drumState(8.01).dir, 'U');
  assert.ok(drumState(0.5).phase > 0.45 && drumState(0.5).phase < 0.55);
  assert.ok(inDrum({ cx: 10, cy: 10, r: 2 }, 10 * TILE, 10 * TILE) && !inDrum({ cx: 10, cy: 10, r: 2 }, 13 * TILE, 10 * TILE));
});

test('drum: a press just after a tick still dashes the way the arrow pointed (reaction grace)', () => {
  assert.ok(DRUM_GRACE > 0.1 && DRUM_GRACE < 0.4);
  assert.equal(drumDashDir(0.05), 'U');                                  // no previous step yet
  assert.equal(drumDashDir(1.05), 'U');                                  // just ticked to UR
  assert.equal(drumDashDir(1.0 + DRUM_GRACE + 0.01), 'UR');
  assert.equal(drumDashDir(2.1, { ccw: true, step: 1.1 }), 'UL');        // ccw, inside step 2 of 1.1 s
  assert.equal(drumDashDir(2.2 + 0.05, { ccw: true, step: 1.1 }), 'UL'); // ticked to L, still in grace
});

test('drum exits: every drum has a porthole at least 4 tiles tall on its exit side', () => {
  for (const lv of laundry.levels) for (const d of lv.decor || []) {
    if (d.type !== 'washer' || !d.door) continue;
    assert.ok(d.door.h >= 4, `${lv.id} washer at x=${d.x}: exit porthole is ${d.door.h} tall`);
    for (let y = d.door.y; y < d.door.y + d.door.h; y++) for (let x = d.door.x; x < d.door.x + d.door.w; x++)
      assert.notEqual(lv.map[y][x], '#', `${lv.id} porthole cell ${x},${y} must be open`);
  }
});

test('chapter shape: entities, reach rules and budgets', () => {
  assert.equal(laundry.levels.length, 6);
  const sum = laundry.levels.reduce((a, l) => a + l.budget, 0);
  assert.ok(sum >= 400 && sum <= 440, `budgets sum to ${sum}`);
  for (const ch of Object.keys(laundry.entities)) assert.ok(ch in laundry.reach, `reach rule for ${ch}`);
  for (const lv of laundry.levels) {
    assert.ok(lv.map.length >= 15);
    assert.ok(/^#+$/.test(lv.map[lv.map.length - 1]) && /^#+$/.test(lv.map[lv.map.length - 2]), `${lv.id}: bottom two rows solid`);
  }
});

test('no current covers a surface cell (the plain leap must stay honest)', () => {
  for (const lv of laundry.levels) {
    const parsed = parseLevel(lv, laundry);
    for (const e of parsed.entities) {
      if (!'RLUDABYZ'.includes(e.ch)) continue;
      const w = e.props.w || 1, h = e.props.h || 1;
      for (let y = e.ty; y < e.ty + h; y++) for (let x = e.tx; x < e.tx + w; x++) {
        if (parsed.tile[y][x] !== '~') continue;
        const above = parsed.tile[y - 1] && parsed.tile[y - 1][x];
        assert.ok(above === '~' || above === '#', `${lv.id}: current cell ${x},${y} is a surface cell`);
      }
    }
  }
});

for (const lv of laundry.levels) {
  test(`level ${lv.id} needs the currents: it fails without the dash reach rules`, () => {
    const r = validateLevel(lv, { ...laundry, reach: {} });
    assert.equal(r.ok, false, `${lv.id} validates without currents, so the mechanic is optional`);
    assert.equal(validateLevel(lv, laundry).ok, true);
  });
}
