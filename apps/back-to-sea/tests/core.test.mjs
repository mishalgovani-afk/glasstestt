// Core engine tests that need no DOM: which rows of which tile layers a setTile() re-renders.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TileLayers } from '../js/core/tiles.js';
import { WATER_DEPTH_ROWS } from '../js/core/water.js';

function layers(w = 64, h = 22) {
  const t = Object.create(TileLayers.prototype);
  t.world = { level: { w, h } };
  t.n = Math.ceil(w / 16);
  t.chunks = Array.from({ length: t.n }, (_, i) => ({ i, dirty: { back: null, water: null } }));
  return t;
}

test('rising water only queues the water rows it can change, in its own chunk', () => {
  const t = layers();
  t.markDirty(20, 10, '.', '~');
  assert.deepEqual(t.chunks[1].dirty.water, [9, 10 + WATER_DEPTH_ROWS + 1]);
  assert.equal(t.chunks[1].dirty.back, null, 'no solid changed: back layer untouched');
  assert.equal(t.chunks[0].dirty.water, null);
  assert.equal(t.chunks[2].dirty.water, null);
  // a second row merges into one range
  t.markDirty(21, 9, '.', '~');
  assert.deepEqual(t.chunks[1].dirty.water, [8, 10 + WATER_DEPTH_ROWS + 1]);
});

test('a solid change queues back rows around it, plus the neighbour chunk at a chunk edge', () => {
  const t = layers();
  t.markDirty(31, 5, '.', '#');           // last column of chunk 1
  assert.deepEqual(t.chunks[1].dirty.back, [4, 6]);
  assert.deepEqual(t.chunks[2].dirty.back, [4, 6]);
  assert.equal(t.chunks[0].dirty.back, null);
  const u = layers();
  u.markDirty(20, 5, '#', '.');           // middle of chunk 1
  assert.equal(u.chunks[0].dirty.back, null);
  assert.equal(u.chunks[2].dirty.back, null);
});

test('dirty ranges are clamped to the level', () => {
  const t = layers(64, 15);
  t.markDirty(3, 14, '.', '~');
  assert.deepEqual(t.chunks[0].dirty.water, [13, 14]);
  t.markDirty(3, 0, '=', '.');
  assert.deepEqual(t.chunks[0].dirty.back, [0, 1]);
});
