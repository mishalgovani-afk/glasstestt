// Level validation for every chapter (run: node --test apps/back-to-sea/tests/levels.test.mjs).
// Checks each level's shape and that E is reachable from S with the real physics and dry budget.
// Also runs control fixtures so the validator itself can't silently become vacuous.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAPTERS, LEVELS } from '../js/chapters/index.js';
import { validateLevel, checkShape } from '../js/core/validate.js';
import { parseLevel } from '../js/core/level.js';
import { Entity } from '../js/core/entity.js';
import * as K from '../js/core/constants.js';

test('registry: 5 chapters in order with unique level ids', () => {
  assert.equal(CHAPTERS.length, 5);
  CHAPTERS.forEach((c, i) => {
    assert.equal(c.number, i + 1, `chapter ${c.id} number`);
    for (const k of ['id', 'title', 'subtitle']) assert.equal(typeof c[k], 'string', `${c.id}.${k}`);
    assert.ok(c.mechanic && c.mechanic.name && c.mechanic.hint, `${c.id}.mechanic`);
    assert.ok(c.palette && c.palette.water && c.palette.solid, `${c.id}.palette`);
    assert.equal(typeof c.drawBackground, 'function', `${c.id}.drawBackground`);
    assert.ok(Array.isArray(c.levels) && c.levels.length > 0, `${c.id}.levels`);
    for (const L of c.levels) assert.ok(L.id.startsWith(`${c.number}-`), `level ${L.id} id should start with ${c.number}-`);
  });
  const ids = LEVELS.map((e) => e.level.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate level ids');
});

for (const chapter of CHAPTERS) {
  for (const level of chapter.levels) {
    test(`level ${level.id} "${level.name}" (${chapter.id}) is valid and beatable`, () => {
      assert.ok(level.map.length >= K.VIEW_H / K.TILE, `level ${level.id}: map must be at least ${K.VIEW_H / K.TILE} rows (the view height)`);
      assert.ok(level.map[0].length >= Math.ceil(K.VIEW_W_MIN / K.TILE), `level ${level.id}: map must be at least ${Math.ceil(K.VIEW_W_MIN / K.TILE)} columns`);
      const r = validateLevel(level, chapter);
      assert.deepEqual(r.errors, [], `level ${level.id}:\n  ${r.errors.join('\n  ')}`);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Validator controls: these MUST fail / pass, or the validator is broken.

const AIR = (w, n = 8) => Array(n).fill('.'.repeat(w));
const fixture = (map) => ({ id: '9-1', name: 'fixture', budget: 10, map: [...AIR(map[0].length), ...map] });
const ok = (map, ch = null) => validateLevel(fixture(map), ch).ok;

test('control: flat walk is reachable', () => {
  assert.ok(ok(['S......E.', '#########']));
});
test('control: hop clears a 4-tile gap, not a 6-tile gap', () => {
  assert.ok(ok(['S....' + '....' + '...E.', '#####' + '....' + '#####']));
  assert.ok(!ok(['S....' + '......' + '...E.', '#####' + '......' + '#####']));
});
test('control: hop climbs 3 tiles but not 4; a puddle splash-hop climbs 4', () => {
  const ledge = (h, start) => [
    '......E...', ...Array(h).fill('......####').map((r, i) => (i === h - 1 ? start + r.slice(start.length) : r)), '##########',
  ];
  assert.ok(ok(ledge(3, 'S')));
  assert.ok(!ok(ledge(4, 'S')));
  assert.ok(ok(ledge(4, 'S....-')));
});
test('control: leap from water clears 5 tiles up but not 7', () => {
  const m = (k) => {
    const rows = AIR(12, 10);
    rows[9 - k] = '......E.....';
    for (let i = 10 - k; i < 10; i++) rows[i] = '......######';
    return { id: '9-1', name: 'f', budget: 9, map: [...rows, '#~~~S~######', '#~~~~~######', '############'] };
  };
  assert.ok(validateLevel(m(5), null).ok);
  assert.ok(!validateLevel(m(7), null).ok);
});
test('control: a dry stretch longer than DRY_TIME fails; droplets make it pass', () => {
  const long = 'S' + '.'.repeat(37) + 'E.';
  assert.ok(!ok([long, '#'.repeat(long.length)]));
  const drops = 'S.........o..........o...........o....E.';
  assert.ok(ok([drops, '#'.repeat(drops.length)]));
  const pud = 'S.............-..............-........E.';
  assert.ok(ok([pud, '#'.repeat(pud.length)]));
});
test('control: one droplet cannot be reused to stay dry forever', () => {
  // ~32 tiles is the dry range on flat ground; one droplet adds ~11. 42 passes, 52 must not
  // (it would if the search could hop back and forth over the same droplet).
  const row = (n) => 'S' + '.'.repeat(n / 2) + 'o' + '.'.repeat(n / 2) + 'E.';
  assert.ok(ok([row(42), '#'.repeat(row(42).length)]));
  assert.ok(!ok([row(52), '#'.repeat(row(52).length)]));
});
test('control: hazards block', () => {
  assert.ok(ok(['S...^^...E.', '###########']));
  assert.ok(!ok(['S...^^^^^^^^...E.', '#################']));
});
test('control: shape errors are reported', () => {
  assert.ok(checkShape({ id: '9-1', name: 'x', budget: 5, map: ['S..', 'E.'] }).length > 0);
  assert.ok(checkShape({ id: '9-1', name: 'x', budget: 5, map: ['S.E', '#?#'] }).some((e) => e.includes("unknown char '?'")));
  assert.ok(checkShape({ id: '9-1', name: 'x', budget: 5, map: ['S.S', '###'] }).length > 0);
  assert.ok(checkShape({ id: '9-1', name: 'x', budget: 5, map: ['S..', '###'] }).some((e) => e.includes('no E')));
});
test('control: reach rules add edges (trigger + launch)', () => {
  class Spring extends Entity {}
  const chapter = {
    entities: { J: Spring },
    reach: { J: { trigger: true, edges: ({ x, y, TILE }) => [{ launch: { cx: (x + 0.5) * TILE, cy: (y + 0.5) * TILE, vy: -900 } }] } },
  };
  const map = ['......E...', '......####', '......####', '......####', '......####', '......####', 'S...J.####', '##########'];
  assert.ok(!validateLevel(fixture(map), { entities: { J: Spring } }).ok);
  assert.ok(validateLevel(fixture(map), chapter).ok);
});
test('control: reach rule edges can start from a cell (from: {x,y})', () => {
  class Pipe extends Entity { static tile = '~'; }
  const map = [...AIR(20, 11), '#~R~#...............', '#~S~#..............E', '#~~~#........#######', '#####........#######'];
  const def = { id: '9-1', name: 'f', budget: 9, map };
  assert.ok(!validateLevel(def, { entities: { R: Pipe } }).ok);
  const chapter = { entities: { R: Pipe }, reach: { R: { edges: ({ x, y }) => [{ from: { x, y }, to: { x: 15, y: 12 }, time: 1 }] } } };
  assert.ok(validateLevel(def, chapter).ok);
});
test('control: entity flags without a reach rule are not ignored', () => {
  class Paw extends Entity { hazard = true; }
  class Block extends Entity { solid = true; }
  const map = ['S...PP...E.', '###########'];
  assert.ok(ok(['S...PP...E.'.replace(/P/g, '.'), '###########']));
  assert.ok(!validateLevel(fixture(['S...PPPPPPPPP...E.', '##################']), { entities: { P: Paw } }).ok, 'hazard entity blocks');
  const r = validateLevel(fixture(['S...X...E.', '##########']), { entities: { X: Block } });
  assert.ok(!r.ok && r.errors.some((e) => e.includes("reach.X.as")), 'solid entity without reach.as is reported');
  assert.ok(validateLevel(fixture(['S...X...E.', '##########']), { entities: { X: Block }, reach: { X: { as: 'solid' } } }).ok);
  void map;
});
test('validator stays fast on a big level with many droplets', () => {
  const W = 110, rows = AIR(W, 10);
  let a = 'S', b = '#';
  for (let x = 1; x < W - 2; x++) { a += x % 7 === 3 ? 'o' : x % 23 === 11 ? '-' : '.'; b += x % 17 === 9 ? '.' : '#'; }
  rows.push(a + 'E.', b + '##', '#'.repeat(W), '#'.repeat(W));
  const t0 = performance.now();
  const r = validateLevel({ id: '9-1', name: 'big', budget: 99, map: rows }, null);
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `validation took ${ms.toFixed(0)} ms`);
  assert.ok(r.ok, r.errors.join('; '));
});
test('submerged rule: S in a bowl and E at a sink bottom are water', () => {
  const p = parseLevel({ map: ['#~S~#', '#~E~#', '#####'] });
  assert.equal(p.tile[0][2], '~');
  assert.equal(p.tile[1][2], '~');
  const q = parseLevel({ map: ['.S.E.', '#####'] });
  assert.equal(q.tile[0][1], '.');
});
test('constants are sane', () => {
  assert.equal(K.TILE, 24);
  assert.equal(K.DRY_TIME, 6);
  assert.ok(K.SPLASH_HOP_VY < K.HOP_VY && K.LEAP_VY < K.SPLASH_HOP_VY);
  assert.ok(Math.abs(K.WATER_GRAVITY / K.WATER_DRAG - 40) < 1, 'idle sink speed ~40 px/s');
});
