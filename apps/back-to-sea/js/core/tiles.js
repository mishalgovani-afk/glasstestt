// Pre-rendered static level art, in column chunks (iOS rejects huge canvases):
//   back  = chapter decor (back) + solid tiles + one-way shelves  (drawn behind the player)
//   water = water bodies (depth-shaded) + puddles                  (drawn over the player, translucent)
//   front = chapter decor (front)                                  (drawn over everything in the world)
// world.setTile() queues only the affected rows of the affected layer(s); world.step() flushes
// them once per frame (clip + clear + redraw those rows), so rising water costs a few rows, not a
// full-height chunk.

import { TILE } from './constants.js';
import { mulberry32, hash2 } from './rng.js';
import { neighborMask } from './level.js';
import { makeCanvas, grad, rgba, mix, lighten, darken, roundRect, blit } from './draw.js';
import { waterColor, SURFACE_BAND, WATER_DEPTH_ROWS } from './water.js';

const CHUNK = 16; // tiles per chunk

export class TileLayers {
  constructor(world, scale) {
    this.world = world;
    this.scale = scale;
    const L = world.level;
    this.n = Math.ceil(L.w / CHUNK);
    this.chunks = [];
    this.hidden = new Set();
    this.stats = { full: 0, partial: 0, rows: 0 };   // re-render counters (debug / perf checks)
    for (const d of world.decor) if (d.hideTiles) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) this.hidden.add(`${x},${y}`);
    for (let i = 0; i < this.n; i++) this.chunks.push({ i, back: null, water: null, front: null, dirty: { back: null, water: null } });
    this.renderAll();
  }

  renderAll() { for (const c of this.chunks) this.renderChunk(c); }

  /**
   * A tile changed at (tx, ty) from `was` to `now`. Only the rows whose art can change are queued:
   * the water layer from the row above (its surface band) down through the depth shading (which
   * saturates at WATER_DEPTH_ROWS), and the back layer only when a solid or shelf appeared or went
   * (rising water never touches it). Neighbour chunks are only touched at a chunk edge.
   */
  markDirty(tx, ty, was, now) {
    const i = Math.floor(tx / CHUNK), L = this.world.level;
    const edge = tx % CHUNK === 0 ? i - 1 : tx % CHUNK === CHUNK - 1 ? i + 1 : -1;
    const add = (ci, layer, r0, r1) => {
      const c = this.chunks[ci]; if (!c) return;
      r0 = Math.max(0, r0); r1 = Math.min(L.h - 1, r1);
      const d = c.dirty[layer];
      c.dirty[layer] = d ? [Math.min(d[0], r0), Math.max(d[1], r1)] : [r0, r1];
    };
    if (was === undefined) { // unknown change: whole column range
      for (const ci of [i - 1, i, i + 1]) { add(ci, 'back', 0, L.h - 1); add(ci, 'water', 0, L.h - 1); }
      return;
    }
    add(i, 'water', ty - 1, ty + WATER_DEPTH_ROWS + 1);
    if (edge >= 0 && (was === '-' || now === '-')) add(edge, 'water', ty, ty);
    if (was === '#' || was === '=' || now === '#' || now === '=') {
      add(i, 'back', ty - 1, ty + 1);
      if (edge >= 0) add(edge, 'back', ty - 1, ty + 1);
    }
  }

  flush() {
    for (const c of this.chunks) {
      const d = c.dirty;
      if (d.back) { this._renderBack(c, d.back[0], d.back[1]); d.back = null; }
      if (d.water) { this._renderWater(c, d.water[0], d.water[1]); d.water = null; }
    }
  }

  _bounds(c) {
    const L = this.world.level, tx0 = c.i * CHUNK, tx1 = Math.min(L.w, tx0 + CHUNK);
    return { tx0, tx1, pw: (tx1 - tx0) * TILE, ph: L.h * TILE };
  }
  /** (Re)use the chunk's canvas for `layer`; returns its context with the world transform set. */
  _ctx(c, layer, full) {
    const s = this.scale, { tx0, pw, ph } = this._bounds(c);
    const W = Math.ceil(pw * s), Hh = Math.ceil(ph * s);
    let cv = c[layer];
    if (!cv || cv.width !== W || cv.height !== Hh) { cv = makeCanvas(pw * s, ph * s); full = true; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (full) g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(s, 0, 0, s, -tx0 * TILE * s, 0);
    c[layer] = cv;
    return { cv, g, full };
  }
  /** Clip + clear rows r0..r1 on device-pixel boundaries (no seams), then restore the world transform. */
  _clipRows(cv, g, r0, r1) {
    const s = this.scale;
    const y0 = Math.floor(r0 * TILE * s), y1 = Math.min(cv.height, Math.ceil((r1 + 1) * TILE * s));
    const m = g.getTransform();
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath(); g.rect(0, y0, cv.width, y1 - y0); g.clip();
    g.clearRect(0, y0, cv.width, y1 - y0);
    g.setTransform(m);
  }

  renderChunk(c) {
    c.dirty.back = c.dirty.water = null;
    this.stats.full++;
    const w = this.world, L = w.level, ch = w.chapter, pal = w.palette;
    this._renderBack(c, 0, L.h - 1, true);
    this._renderWater(c, 0, L.h - 1, true);
    // front: decor only, never changes with setTile
    const { tx0, tx1 } = this._bounds(c);
    const decorHere = w.decor.filter((d) => d.x < tx1 + 1 && d.x + d.w > tx0 - 1);
    if (decorHere.length && ch.drawDecor) {
      const { g } = this._ctx(c, 'front', true);
      // most decor draws nothing in front: then drop the (chunk-sized, transparent) canvas so it
      // isn't composited every frame
      const touched = watchDraws(g);
      for (const d of decorHere) safe(() => ch.drawDecor(g, d, { layer: 'front', TILE, level: L, palette: pal }));
      if (!touched.done()) c.front = null;
    } else c.front = null;
  }

  _renderBack(c, r0, r1, full = false) {
    const w = this.world, L = w.level, ch = w.chapter, pal = w.palette;
    const { tx0, tx1 } = this._bounds(c);
    const { cv, g, full: isFull } = this._ctx(c, 'back', full);
    if (isFull) { r0 = 0; r1 = L.h - 1; } else { this._clipRows(cv, g, r0, r1); this.stats.partial++; this.stats.rows += r1 - r0 + 1; }
    const decorHere = w.decor.filter((d) => d.x < tx1 + 1 && d.x + d.w > tx0 - 1); // all of them: art may overhang its rect
    for (const d of decorHere) safe(() => ch.drawDecor && ch.drawDecor(g, d, { layer: 'back', TILE, level: L, palette: pal }));
    const isSolid = (t) => t === '#';
    // tiles one row/column beyond the range too: their art may overhang into it
    for (let ty = Math.max(0, r0 - 1); ty <= Math.min(L.h - 1, r1 + 1); ty++) for (let tx = Math.max(0, tx0 - 1); tx < Math.min(L.w, tx1 + 1); tx++) {
      const t = L.tile[ty][tx];
      if (this.hidden.has(`${tx},${ty}`)) continue;
      const x = tx * TILE, y = ty * TILE;
      if (t === '#') {
        const mask = neighborMask(L.tile, tx, ty, isSolid);
        const rng = mulberry32((hash2(tx, ty) * 4294967296) >>> 0);
        const info = { tx, ty, level: L, palette: pal };
        if (ch.drawSolidTile) safe(() => ch.drawSolidTile(g, x, y, mask, rng, info));
        else defaultSolid(g, x, y, mask, rng, info);
      } else if (t === '=') {
        const l = tx > 0 && L.tile[ty][tx - 1] === '=', r = tx < L.w - 1 && L.tile[ty][tx + 1] === '=';
        if (ch.drawOneWayTile) safe(() => ch.drawOneWayTile(g, x, y, l, r, { tx, ty, level: L, palette: pal }));
        else defaultOneWay(g, x, y, l, r, pal);
      }
    }
    if (!isFull) g.restore();
  }

  _renderWater(c, r0, r1, full = false) {
    const w = this.world, L = w.level, pal = w.palette;
    const { tx0, tx1 } = this._bounds(c);
    if (!c.water) {
      // no canvas yet: only allocate one once the chunk actually holds water
      let hasWater = false;
      for (let ty = 0; ty < L.h && !hasWater; ty++) for (let tx = tx0; tx < tx1; tx++) { const t = L.tile[ty][tx]; if (t === '~' || t === '-') { hasWater = true; break; } }
      if (!hasWater) return;
      full = true;
    }
    const { cv, g, full: isFull } = this._ctx(c, 'water', full);
    if (isFull) { r0 = 0; r1 = L.h - 1; } else { this._clipRows(cv, g, r0, r1); this.stats.partial++; this.stats.rows += r1 - r0 + 1; }
    const lo = Math.max(0, r0 - 1), hi = Math.min(L.h - 1, r1 + 1);
    for (let tx = tx0; tx < tx1; tx++) {
      let depth = -1;
      for (let ty = 0; ty <= hi; ty++) {        // depth needs the column from the top; draw only lo..hi
        const t = L.tile[ty][tx];
        const x = tx * TILE, y = ty * TILE;
        if (t === '~') {
          const surface = w.isSurfaceTile(tx, ty);
          if (depth < 0 || surface) depth = 0; else depth++;
          if (ty < lo) continue;
          const top = surface ? y + SURFACE_BAND : y;
          const c0 = waterColor(pal, depth), c1 = waterColor(pal, depth + 1);
          g.fillStyle = grad(g, 0, y, 0, y + TILE, [rgba(c0, 0.52), rgba(c1, 0.58)]);
          g.fillRect(x, top, TILE, y + TILE - top);
          // soft light at the bottom of a body of water
          if (ty + 1 < L.h && L.tile[ty + 1][tx] === '#') { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y + TILE - 3, TILE, 3); }
        } else {
          depth = -1;
          if (ty >= lo && t === '-') drawPuddle(g, x, y, tx > 0 && L.tile[ty][tx - 1] === '-', tx < L.w - 1 && L.tile[ty][tx + 1] === '-', pal);
        }
      }
    }
    if (!isFull) g.restore();
  }

  draw(ctx, layer, cam, view) {
    const i0 = Math.max(0, Math.floor(cam.x / (CHUNK * TILE))), i1 = Math.min(this.n - 1, Math.floor((cam.x + view.w) / (CHUNK * TILE)));
    for (let i = i0; i <= i1; i++) {
      const c = this.chunks[i], cv = c[layer];
      if (!cv) continue;
      blit(ctx, cv, i * CHUNK * TILE, 0);
    }
  }
}

/** Note whether anything gets painted on context g until done() (instance-level method shims). */
function watchDraws(g) {
  let hit = false;
  const names = ['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'strokeText', 'putImageData'];
  for (const n of names) { const f = g[n]; g[n] = function (...a) { hit = true; return f.apply(this, a); }; }
  return { done() { for (const n of names) delete g[n]; return hit; } };
}

function safe(fn) { try { fn(); } catch (e) { console.warn('tile art error', e); } }

/** Default solid tile: palette.solid block with a lit top edge and rounded exposed corners. */
export function defaultSolid(ctx, x, y, mask, rng, info) {
  const pal = info.palette;
  const up = mask & 1, right = mask & 2, down = mask & 4, left = mask & 8;
  const r = 5;
  const rTL = !up && !left ? r : 0, rTR = !up && !right ? r : 0, rBR = !down && !right ? r : 0, rBL = !down && !left ? r : 0;
  ctx.beginPath();
  ctx.moveTo(x + rTL, y);
  ctx.lineTo(x + TILE - rTR, y); if (rTR) ctx.arcTo(x + TILE, y, x + TILE, y + rTR, rTR);
  ctx.lineTo(x + TILE, y + TILE - rBR); if (rBR) ctx.arcTo(x + TILE, y + TILE, x + TILE - rBR, y + TILE, rBR);
  ctx.lineTo(x + rBL, y + TILE); if (rBL) ctx.arcTo(x, y + TILE, x, y + TILE - rBL, rBL);
  ctx.lineTo(x, y + rTL); if (rTL) ctx.arcTo(x, y, x + rTL, y, rTL);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, x, y, x + 8, y + TILE, [lighten(pal.solid, 0.06), darken(pal.solid, 0.1)]);
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + rng() * TILE, y + rng() * TILE, 2 + rng() * 3, 1.5);
  if (!up) { ctx.fillStyle = grad(ctx, 0, y, 0, y + 6, [pal.solidEdge, rgba(pal.solidEdge, 0)]); ctx.fillRect(x, y, TILE, 6); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, y, TILE, 1); }
  if (!down) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
  if (!left) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, 2, TILE); }
  if (!right) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
  ctx.restore();
}

/** Default one-way shelf plank. l/r: neighbour is also a shelf. */
export function defaultOneWay(ctx, x, y, l, r, pal) {
  const col = pal.shelf || pal.solidEdge;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(x, y + 7, TILE, 4);
  ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, [lighten(col, 0.25), col, darken(col, 0.2)]);
  roundRect(ctx, x - (l ? 1 : 0), y, TILE + (l ? 1 : 0) + (r ? 1 : 0), 7, l && r ? 0 : 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, y, TILE, 1);
  for (const [edge, bx] of [[!l, x + 4], [!r, x + TILE - 8]]) {
    if (!edge) continue;
    ctx.fillStyle = darken(col, 0.35);
    ctx.beginPath(); ctx.moveTo(bx, y + 7); ctx.lineTo(bx + 4, y + 7); ctx.lineTo(bx + 4, y + 16); ctx.closePath(); ctx.fill();
  }
}

function drawPuddle(ctx, x, y, l, r, pal) {
  const top = y + TILE - 5;
  ctx.fillStyle = grad(ctx, 0, top, 0, y + TILE, [rgba(lighten(pal.water, 0.25), 0.85), rgba(pal.water, 0.7)]);
  ctx.beginPath();
  const x0 = x - (l ? 0 : -2), x1 = x + TILE - (r ? 0 : 2);
  ctx.moveTo(x0, y + TILE);
  if (!l) ctx.quadraticCurveTo(x0, top, x0 + 6, top); else ctx.lineTo(x0, top);
  ctx.lineTo(x1 - (r ? 0 : 6), top);
  if (!r) ctx.quadraticCurveTo(x1, top, x1, y + TILE); else ctx.lineTo(x1, y + TILE);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x0 + 5, top + 1, Math.max(2, x1 - x0 - 12), 1);
}

/** Default hazard look: glowing red spikes. Chapters override with drawHazard(ctx, x, y, time). */
export function defaultHazard(ctx, x, y, time, pal) {
  const p = 0.7 + 0.3 * Math.sin(time * 4 + x);
  ctx.fillStyle = mix(pal.hazard || '#ff5a3a', '#ffd27a', 0.3 * p);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = x + 1 + i * 5.5;
    ctx.moveTo(bx, y + TILE); ctx.lineTo(bx + 2.75, y + 11); ctx.lineTo(bx + 5.5, y + TILE);
  }
  ctx.fill();
}
