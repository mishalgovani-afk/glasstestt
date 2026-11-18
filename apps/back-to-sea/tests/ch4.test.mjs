// Chapter 4 (Basement): pure valve/water logic + an honesty check of every valve reach claim.
//
// The level validator only knows the INITIAL map. Each valve V declares `opens: [{x,y,t,with}]`:
// "after turning me (and the links in `with`), stand cell (x,y) is reachable from my cell in t
// seconds". Here we re-verify each claim physically: build the map in the valves-ON state, put S
// on the valve's cell and E on the target, and run the real validator with no valve edges. We also
// check that, with every valve ON, each level is beatable by physics alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import basement from '../js/chapters/ch4-basement.js';
import { Plumbing, Fill, doorBlockedCount, applyLinkState, valveAcceptsPress } from '../js/chapters/ch4/logic.js';
import { validateLevel } from '../js/core/validate.js';
import { parseLevel } from '../js/core/level.js';
import * as K from '../js/core/constants.js';

// ------------------------------------------------------------------------------------ logic
test('valves turn only on a JUMP with no direction held (hopping away never turns one back)', () => {
  assert.equal(valveAcceptsPress(0), true);
  assert.equal(valveAcceptsPress(1), false);
  assert.equal(valveAcceptsPress(-1), false);
});

test('Plumbing: toggle, timers drift back, checkpoint snapshot restores', () => {
  const p = new Plumbing();
  assert.equal(p.isOn('a'), false);
  p.toggle('a'); assert.equal(p.isOn('a'), true);
  p.toggle('a'); assert.equal(p.isOn('a'), false);
  p.set('t', true, 2);
  assert.ok(Math.abs(p.fraction('t') - 1) < 1e-9);
  assert.deepEqual(p.update(1.5), []);
  assert.equal(p.isOn('t'), true);
  assert.deepEqual(p.update(0.6), ['t']);
  assert.equal(p.isOn('t'), false);
  p.set('a', true); p.set('t', true, 5); p.snapshot();
  p.set('a', false); p.set('b', true);
  const e = p.epoch; p.restore();
  assert.equal(p.isOn('a'), true, 'untimed link restored ON');
  assert.equal(p.isOn('t'), false, 'timed link restored OFF');
  assert.equal(p.isOn('b'), false);
  assert.equal(p.epoch, e + 1);
});

test('Fill: surface moves smoothly to the target and back', () => {
  const f = new Fill({ off: 13, on: 8, floor: 14, rise: 2.5, fall: 5 });
  assert.equal(f.waterRow, 13); assert.equal(f.partial, 0);
  f.setTarget(true);
  let t = 0; while (f.moving && t < 10) { f.update(0.05); t += 0.05; }
  assert.ok(Math.abs(t - 2) < 0.1, `5 rows at 2.5 rows/s take ~2 s, got ${t}`);
  assert.equal(f.waterRow, 8);
  f.setTarget(false); f.update(0.1);
  assert.ok(f.surf > 8 && f.surf < 9);
  assert.ok(f.partial > 0 && f.partial < 1);
  f.snap(false); assert.equal(f.waterRow, 13);
  const empty = new Fill({ off: 15, on: 15, floor: 14 }); assert.equal(empty.waterRow, 15);
});

test('door rows unblock from the bottom as the door rises', () => {
  assert.equal(doorBlockedCount(4, 1), 4);
  assert.equal(doorBlockedCount(4, 0), 0);
  assert.equal(doorBlockedCount(4, 0.5), 2);
  assert.equal(doorBlockedCount(4, 0.3), 1);
});

// ------------------------------------------------------------------------------- level data
const chapter = basement;
const noValveReach = { ...chapter.reach, V: {} };
const chapterNoV = { ...chapter, reach: noValveReach };
const ROW_CH = new Set(['.', '#', '=', '~', '-', '^']);

function derivedDef(level, onIds, from, to) {
  const parsed = parseLevel(level, chapter);
  const tile = parsed.tile.map((r) => r.slice());
  applyLinkState(tile, parsed.entities, onIds);
  const rows = parsed.raw.map((r, y) => r.map((c, x) => {
    if (ROW_CH.has(c)) return tile[y][x];
    if (c === 'S' || c === 'E' || c === 'V' || c === 'T' || c === 'G') return tile[y][x];
    return c; // o, C, D, Y keep their rules
  }));
  rows[from.y][from.x] = 'S';
  rows[to.y][to.x] = 'E';
  const props = {};
  for (const [k, v] of Object.entries(level.props || {})) { const [x, y] = k.split(',').map(Number); if (['D', 'Y'].includes(parsed.raw[y][x])) props[k] = v; }
  return { ...level, map: rows.map((r) => r.join('')), props, decor: [], says: [] };
}

const allLinks = (parsed) => [...new Set(parsed.entities.filter((e) => e.ch === 'T' || e.ch === 'G').map((e) => e.props.id))];

for (const level of chapter.levels) {
  const parsed = parseLevel(level, chapter);
  const valves = parsed.entities.filter((e) => e.ch === 'V');
  const tanks = parsed.entities.filter((e) => e.ch === 'T');
  const gates = parsed.entities.filter((e) => e.ch === 'G');

  test(`${level.id}: every valve links to a tank/gate and vice versa`, () => {
    const targets = new Set([...tanks, ...gates].map((e) => e.props.id));
    const used = new Set(valves.flatMap((v) => v.props.links || [v.props.link]));
    for (const id of used) assert.ok(targets.has(id), `valve link '${id}' has no tank or gate`);
    for (const id of targets) assert.ok(used.has(id), `tank/gate '${id}' has no valve`);
    assert.ok(valves.length >= 1);
  });

  test(`${level.id}: tank maps show the OFF state; gates are solid`, () => {
    const tile = parsed.tile.map((r) => r.slice());
    const copy = parsed.tile.map((r) => r.slice());
    applyLinkState(copy, parsed.entities, []);
    for (let y = 0; y < parsed.h; y++) for (let x = 0; x < parsed.w; x++) assert.equal(tile[y][x], copy[y][x], `${level.id} tank cell ${x},${y} disagrees with its OFF state`);
    for (const g of gates) for (let y = g.ty; y < g.ty + g.props.h; y++) for (let x = g.tx; x < g.tx + g.props.w; x++) assert.equal(parsed.tile[y][x], '#', `gate cell ${x},${y}`);
  });

  test(`${level.id}: timers are generous and edges are quick`, () => {
    for (const v of valves) {
      const timer = v.props.timer || 0;
      if (timer) assert.ok(timer >= 15, `timer on ${v.tx},${v.ty} should be >= 15 s`);
      for (const o of v.props.opens || []) {
        assert.ok(o.t < K.DRY_TIME - K.VALIDATOR_MARGIN, 'edge time must fit the dry budget');
        if (timer) assert.ok(o.t < timer * 0.6, 'edge must finish well inside the timer');
      }
    }
  });

  test(`${level.id}: claims that fill an empty hot bed allow time for the water to rise`, () => {
    for (const v of valves) for (const o of v.props.opens || []) {
      for (const id of v.props.links || [v.props.link]) for (const t of tanks.filter((q) => q.props.id === id && q.props.off === q.props.floor + 1)) {
        const need = (t.props.off - (t.props.floor - 1)) / (t.props.rise || 2.8) + 0.8;
        assert.ok(o.t >= need - 1e-9, `claim ${v.tx},${v.ty} t=${o.t} < ${need.toFixed(2)} (water must reach 2 rows deep)`);
      }
    }
  });

  test(`${level.id}: valves matter (the level fails without their edges)`, () => {
    const r = validateLevel(level, chapterNoV);
    assert.equal(r.ok, false, 'level is beatable without any valve: the valves are decoration');
  });

  for (const v of valves) {
    (v.props.opens || []).forEach((o, i) => {
      test(`${level.id}: valve ${v.tx},${v.ty} claim #${i} -> ${o.x},${o.y} is physically real`, () => {
        const on = [...new Set([...(v.props.links || [v.props.link]), ...(o.with || [])])];
        const from = v.props.from || { x: v.tx, y: v.ty };
        const def = derivedDef(level, on, from, { x: o.x, y: o.y });
        const r = validateLevel(def, chapterNoV);
        assert.deepEqual(r.errors, [], `${level.id} claim ${v.tx},${v.ty}->${o.x},${o.y}`);
        if (!o.dry) assert.ok(r.stats.path.some((n) => n.startsWith('~')), 'route must pass through water (a refill), not hide a dry gap in the teleport');
        else assert.ok(Math.abs(o.x - from.x) + Math.abs(o.y - from.y) <= 10, 'dry claims must be short hops from the valve');
      });
    });
  }

  test(`${level.id}: with every valve ON the level is beatable by physics alone`, () => {
    const def = derivedDef(level, allLinks(parsed), parsed.spawn ? { x: parsed.spawn.tx, y: parsed.spawn.ty } : null, { x: parsed.exit.tx, y: parsed.exit.ty });
    const r = validateLevel(def, chapterNoV);
    assert.deepEqual(r.errors, [], `${level.id} all-ON`);
  });
}
