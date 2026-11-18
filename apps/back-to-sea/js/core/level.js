// Level parsing (DOM-free). Turns a chapter level definition (ASCII map) into grids the game
// world and the validator both use. See DESIGN.md "Level format".

import { TILE } from './constants.js';

/** Characters the core engine owns. Chapters must not redefine them. */
export const CORE_CHARS = new Set(['.', ' ', '#', '=', '~', '-', '^', 'o', 'S', 'E', 'C']);
/** Tile chars that may exist in the runtime grid (and be passed to world.setTile). */
export const TILE_CHARS = new Set(['.', '#', '=', '~', '-', '^']);
/** Chars that become something else at parse time (entities or the spawn point). */
const SPECIAL = new Set(['o', 'S', 'E', 'C']);

/**
 * parseLevel(def, chapter) -> parsed level. Never throws; problems go in `errors`.
 *
 * Underlying tile of special cells (S, E, C, o and chapter entity chars) — "submerged rule":
 *   1. An entity class may declare `static tile = '~' | '.' | '#' | '='` to force it.
 *   2. Otherwise the cell is water if the cell above is water, or if at least one horizontal
 *      neighbour is water and neither horizontal neighbour is open air. Else it is air.
 * So `S` inside a fishbowl and `E` at the bottom of a sink are underwater, `E` on a counter is not.
 */
export function parseLevel(def, chapter = null) {
  const errors = [];
  const entityMap = (chapter && chapter.entities) || {};
  const rows = Array.isArray(def && def.map) ? def.map : [];
  if (!rows.length) errors.push('map is empty or missing');
  const h = rows.length;
  const w = h ? Math.max(...rows.map((r) => String(r).length)) : 0;
  rows.forEach((r, i) => {
    if (typeof r !== 'string') errors.push(`row ${i} is not a string`);
    else if (r.length !== w) errors.push(`row ${i} has length ${r.length}, expected ${w}`);
  });

  // raw[ty][tx] = original char (spaces normalised to '.')
  const raw = [];
  for (let y = 0; y < h; y++) {
    const row = String(rows[y] ?? '');
    const out = [];
    for (let x = 0; x < w; x++) {
      let c = row[x] ?? '.';
      if (c === ' ') c = '.';
      out.push(c);
    }
    raw.push(out);
  }

  let spawn = null, exit = null;
  const checkpoints = [], droplets = [], entities = [];
  const props = (def && def.props) || {};

  // tile[y][x]: resolved runtime tile char ('.', '#', '=', '~', '-', '^') or null while unresolved.
  const tile = raw.map((r) => r.map(() => null));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = raw[y][x];
      if (TILE_CHARS.has(c)) { tile[y][x] = c; continue; }
      if (SPECIAL.has(c)) {
        const p = { tx: x, ty: y, props: props[`${x},${y}`] || {} };
        if (c === 'S') { if (spawn) errors.push(`more than one S (at ${x},${y})`); else spawn = p; }
        else if (c === 'E') { if (exit) errors.push(`more than one E (at ${x},${y})`); else exit = p; }
        else if (c === 'C') checkpoints.push(p);
        else droplets.push(p);
        continue;
      }
      const cls = entityMap[c];
      if (!cls) { errors.push(`unknown char '${c}' at ${x},${y}`); tile[y][x] = '.'; continue; }
      entities.push({ ch: c, cls, tx: x, ty: y, props: props[`${x},${y}`] || {} });
      if (cls.tile && TILE_CHARS.has(cls.tile)) tile[y][x] = cls.tile;
    }
  }
  if (!spawn) errors.push('no S (spawn)');
  if (!exit) errors.push('no E (exit)');

  // Submerged rule, iterated to a fixpoint (unresolved cells count as neither water nor air).
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : tile[y][x]);
  const isOpenAir = (c) => c === '.' || c === '-' || c === '^' || c === '=';
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tile[y][x] !== null) continue;
        const up = y > 0 ? tile[y - 1][x] : '.';
        const l = at(x - 1, y), r = at(x + 1, y);
        if (up === '~' || ((l === '~' || r === '~') && !isOpenAir(l) && !isOpenAir(r))) {
          tile[y][x] = '~'; changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (tile[y][x] === null) tile[y][x] = '.';

  return {
    id: def && def.id, name: (def && def.name) || '', hint: def && def.hint,
    budget: def && def.budget, def,
    w, h, raw, tile, spawn, exit, checkpoints, droplets, entities, errors,
    pxW: w * TILE, pxH: h * TILE,
  };
}

/** Neighbour bit mask for tile art: 1 = up, 2 = right, 4 = down, 8 = left (same kind of tile). */
export function neighborMask(tile, x, y, pred) {
  const h = tile.length, w = h ? tile[0].length : 0;
  const t = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? true : pred(tile[yy][xx]));
  return (t(x, y - 1) ? 1 : 0) | (t(x + 1, y) ? 2 : 0) | (t(x, y + 1) ? 4 : 0) | (t(x - 1, y) ? 8 : 0);
}
