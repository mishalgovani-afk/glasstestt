// Chapter 1 tests: the pure logic of the kettle / sponge, and honest validator rules for K, P and T.
// Each rule is proven needed (the fixture fails without the entity) and real (it passes with it).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ch1 from '../js/chapters/ch1-kitchen.js';
import { steamLift, steamRows, spongePuddleCells, reach, Kettle, Sponge, Tap, STEAM_FLOAT, STEAM_BOOST_VY, SPONGE_BOUNCE_VY } from '../js/chapters/ch1/entities.js';
import { validateLevel } from '../js/core/validate.js';
import { HOP_VY, SPLASH_HOP_VY, VIEW_H, TILE } from '../js/core/constants.js';

const chapter = { entities: { T: Tap, K: Kettle, P: Sponge }, reach };
const fixture = (map) => ({ id: '9-1', name: 'fixture', budget: 10, map: [...Array(8).fill('.'.repeat(map[0].length)), ...map] });
const ok = (map) => validateLevel(fixture(map), chapter).ok;

test('steamLift: holds a falling fish up, never slows a fast rise', () => {
  assert.equal(steamLift(-300, 0.01), -300);
  assert.ok(steamLift(200, 0.01) < 200);
  let vy = 400;
  for (let i = 0; i < 200; i++) vy = steamLift(vy, 1 / 120);
  assert.equal(vy, -STEAM_FLOAT);
});

test('steamRows: the steam column stops under a ceiling', () => {
  const solid = (x, y) => y < 3;
  assert.equal(steamRows(solid, 0, 10, 7), 7);
  assert.equal(steamRows(solid, 0, 6, 7), 3);
  assert.equal(steamRows(solid, 0, 3, 7), 0);
});

test('spongePuddleCells: above the sponge and the open counter beside it', () => {
  // sponge at (5,5) on a counter at row 6; right neighbour is a wall
  const tile = (x, y) => (y >= 6 ? '#' : x === 6 && y === 5 ? '#' : '.');
  assert.deepEqual(spongePuddleCells(tile, 5, 5), [[5, 4], [4, 5]]);
  assert.deepEqual(spongePuddleCells((x, y) => (y === 4 && x === 5 ? '#' : tile(x, y)), 5, 5), [[4, 5]]);
});

test('numbers: the boosts sit between a splash-hop and a leap', () => {
  assert.ok(SPONGE_BOUNCE_VY < SPLASH_HOP_VY && SPONGE_BOUNCE_VY < HOP_VY);
  assert.ok(STEAM_BOOST_VY <= SPONGE_BOUNCE_VY);
  assert.ok(STEAM_BOOST_VY >= -760);
});

// S on the left, the entity beside a wall `h` tiles tall (the entity's own row counts), E on top.
const tall = (h, ent) => [
  '.....E.',
  ...Array.from({ length: h - 1 }, () => '.....##'),
  `S...${ent}##`,
  '#######',
];
test('a 7-tall wall needs the kettle: unreachable without it, reachable with it', () => {
  assert.ok(!ok(tall(7, '.')));
  assert.ok(ok(tall(7, 'K')));
  assert.ok(!ok(tall(8, 'K')), 'the kettle rule must not over-claim');
});
test('a 6-tall wall needs the sponge; the sponge does not claim 7', () => {
  assert.ok(!ok(tall(6, '.')));
  assert.ok(ok(tall(6, 'P')));
  assert.ok(!ok(tall(7, 'P')), 'the sponge rule must not over-claim');
});

test('the tap really is the refill that makes a long dry stretch beatable', () => {
  const len = 44;
  const floor = '#'.repeat(len);
  const air = '.'.repeat(len);
  const dry = ['S' + '.'.repeat(len - 3) + 'E.', floor];
  assert.ok(!ok(dry), 'a 41-tile dry stretch must fail without a refill');
  const withTap = ['.'.repeat(len), 'S' + '.'.repeat(len - 3) + 'E.', floor].map((r) => r);
  withTap[0] = air.slice(0, 20) + 'T' + air.slice(21);
  assert.ok(ok(withTap), 'a tap (period 1.2) halfway makes it beatable');
  // a tap that drips too slowly gives no credit
  const slow = fixture(withTap);
  slow.props = { '20,8': { period: 3 } };
  assert.ok(!validateLevel(slow, chapter).ok, 'a slow tap gives no credit');
});

test('kitchen chapter shape: ~420 s of levels, bottom two rows solid, tall enough', () => {
  const sum = ch1.levels.reduce((a, l) => a + l.budget, 0);
  assert.ok(sum >= 400 && sum <= 440, `budget sum ${sum}`);
  assert.ok(ch1.levels.length >= 6);
  for (const l of ch1.levels) {
    assert.ok(l.map.length >= VIEW_H / TILE, `${l.id} height`);
    for (const row of l.map.slice(-2)) assert.ok(/^#+$/.test(row), `${l.id} bottom rows solid`);
    assert.ok(l.says && l.says.length >= 1, `${l.id} has a teaching hint`);
    const r = validateLevel(l, ch1);
    assert.deepEqual(r.errors, [], l.id);
  }
});

test('the chapter ends at a sink drain', () => {
  const last = ch1.levels[ch1.levels.length - 1];
  assert.ok(last.decor.some((d) => d.type === 'sink'));
  assert.match(last.says.map((s) => s.text).join(' '), /bathroom/i);
});
