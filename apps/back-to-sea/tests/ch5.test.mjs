// Chapter 5 (finale) tests: the boss phase state machine, and validator checks that each phase's
// objective is physically reachable (the boss itself is scripted, so levels.test.mjs only proves
// the arena's S -> E floor route; these variants prove the fight's targets are reachable too).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import finale from '../js/chapters/ch5-finale.js';
import { validateLevel } from '../js/core/validate.js';
import { createFight, hitBoss, nextPhase, resetPhase, arcPoint, circleHitsBox, swipeTarget, BOSS_MAX } from '../js/chapters/ch5/fight.js';

const arena = finale.levels.find((l) => l.id === '5-2');
const find = (ch) => { for (let y = 0; y < arena.map.length; y++) { const x = arena.map[y].indexOf(ch); if (x >= 0) return { x, y }; } return null; };
/** The arena with E moved to (x,y) (and the real E removed), optionally with the floor flooded. */
function variant(x, y, { flood = false } = {}) {
  const map = arena.map.map((r) => r.replace('E', '.'));
  const row = (yy, xx, c) => { map[yy] = map[yy].slice(0, xx) + c + map[yy].slice(xx + 1); };
  if (flood) for (let xx = 1; xx < map[12].length - 1; xx++) if ('.-'.includes(map[12][xx])) row(12, xx, '~');
  row(y, x, 'E');
  const props = { ...arena.props };
  delete props['27,12'];
  for (const k of Object.keys(props)) { const [px, py] = k.split(',').map(Number); if (px === x && py === y) delete props[k]; }
  return { ...arena, id: '9-1', map, props };
}

test('finale: three phases, two hits each; a hit during invulnerability is ignored', () => {
  const f = createFight(1);
  assert.equal(f.hp, BOSS_MAX);
  assert.equal(hitBoss(f), null, 'no damage during the intro');
  f.state = 'fight';
  assert.equal(hitBoss(f), 'hit');
  assert.equal(hitBoss(f), null, 'invulnerable right after a hit');
  f.invuln = 0;
  assert.equal(hitBoss(f), 'phase');
  assert.equal(f.state, 'transition');
  assert.ok(nextPhase(f));
  assert.equal(f.phase, 2); assert.equal(f.hp, 4); assert.equal(f.phaseStartHp, 4);
  f.invuln = 0; hitBoss(f); f.invuln = 0;
  assert.equal(hitBoss(f), 'phase'); nextPhase(f);
  assert.equal(f.phase, 3);
  f.invuln = 0; hitBoss(f); f.invuln = 0;
  assert.equal(hitBoss(f), 'defeated');
  assert.equal(f.hp, 0);
});

test('finale: a faint resets only the current phase', () => {
  const f = createFight(1); f.state = 'fight';
  hitBoss(f); f.invuln = 0; hitBoss(f); nextPhase(f);      // phase 2 at 4 hp
  f.invuln = 0; hitBoss(f);                                // 3 hp
  resetPhase(f);
  assert.equal(f.phase, 2); assert.equal(f.hp, 4, 'back to the hp phase 2 started with, not full');
  // fainting during a transition keeps the cleared phase
  f.invuln = 0; hitBoss(f); f.invuln = 0; hitBoss(f);
  assert.equal(f.state, 'transition');
  resetPhase(f);
  assert.equal(f.phase, 3); assert.equal(f.hp, 2);
  assert.equal(createFight(3).hp, 2, '?phase=3 debug start');
});

test('finale: geometry helpers', () => {
  const a = arcPoint(0, 100, 200, 100, 0.5, 120);
  assert.ok(Math.abs(a.x - 100) < 1e-9 && a.y < 0, 'pounce arc peaks above the start');
  assert.deepEqual(arcPoint(0, 100, 200, 100, 1, 120), { x: 200, y: 100 });
  assert.ok(circleHitsBox(10, 10, 5, { x: 12, y: 8, w: 4, h: 4 }));
  assert.ok(!circleHitsBox(0, 0, 5, { x: 10, y: 10, w: 4, h: 4 }));
  assert.equal(swipeTarget(500, 200, 100, 200, 340, 216), null, 'left safe zone is out of reach');
  assert.ok(swipeTarget(500, 200, 300, 150, 340, 216));
});

test('finale arena: every phase objective is reachable, and the high valve really needs the flood', () => {
  const can = find('W'), hose = { x: arena.map[12].indexOf('V'), y: 12 };
  const main = { x: arena.map[7].indexOf('V'), y: 7 };
  assert.ok(can && hose.x > 0 && main.x > 0);
  // phase 1: standing on the can's cell (top of the shelf) is reachable from the start
  assert.ok(validateLevel(variant(can.x, can.y), finale).ok, 'watering can reachable');
  // phase 2: the gutter stream (dash launch point) and the bubble spill area are reachable
  assert.ok(validateLevel(variant(15, 13), finale).ok, 'gutter stream reachable');
  // phase 3: the hose valve on the floor, then the main valve once the floor is flooded
  assert.ok(validateLevel(variant(hose.x, hose.y), finale).ok, 'hose valve reachable');
  assert.ok(validateLevel(variant(main.x, main.y, { flood: true }), finale).ok, 'main valve reachable after the flood');
  assert.ok(!validateLevel(variant(main.x, main.y), finale).ok, 'main valve must NOT be reachable before the flood');
  // the locked grate itself is on a plain floor route (levels.test.mjs checks the real map)
  assert.deepEqual(arena.props['27,12'], { locked: true });
});
