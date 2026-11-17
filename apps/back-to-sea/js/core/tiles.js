// Pre-rendered static level art, in column chunks (iOS rejects huge canvases):
//   back  = chapter decor (back) + solid tiles + one-way shelves  (drawn behind the player)
//   water = water bodies (depth-shaded) + puddles                  (drawn over the player, translucent)
//   front = chapter decor (front)                                  (drawn over everything in the world)
// world.setTile() re-renders the affected chunk(s).

import { TILE } from './constants.js';
import { mulberry32, hash2 } from './rng.js';
import { neighborMask } from './level.js';
import { makeCanvas, grad, rgba, mix, lighten, darken, roundRect, blit } from './draw.js';
import { waterColor, SURFACE_BAND } from './water.js';

const CHUNK = 16; // tiles per chunk

export class TileLayers {
  constructor(world, scale) {
    this.world = world;
    this.scale = scale;
    const L = world.level;
    this.n = Math.ceil(L.w / CHUNK);
    this.chunks = [];
    this.hidden = new Set();
    for (const d of world.decor) if (d.hideTiles) for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) this.hidden.add(`${x},${y}`);
    for (let i = 0; i < this.n; i++) this.chunks.push({ i, back: null, water: null, front: null, dirty: true });
    this.renderAll();
  }

  renderAll() { for (const c of this.chunks) this.renderChunk(c); }

  markDirty(tx) {
    const i = Math.floor(tx / CHUNK);
    for (const j of [i - 1, i, i + 1]) if (this.chunks[j]) this.chunks[j].dirty = true;
  }

  flush() { for (const c of this.chunks) if (c.dirty) this.renderChunk(c); }

  renderChunk(c) {
    c.dirty = false;
    const w = this.world, L = w.level, s = this.scale;
    const tx0 = c.i * CHUNK, tx1 = Math.min(L.w, tx0 + CHUNK);
    const pw = (tx1 - tx0) * TILE, ph = L.h * TILE;
    const mk = (old) => {
      const cv = old && old.width === Math.ceil(pw * s) && old.height === Math.ceil(ph * s) ? old : makeCanvas(pw * s, ph * s);
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.setTransform(s, 0, 0, s, -tx0 * TILE * s, 0);
      return [cv, g];
    };
    const ch = w.chapter, pal = w.palette;
    const decorHere = w.decor.filter((d) => d.x < tx1 + 1 && d.x + d.w > tx0 - 1);

    // back
    const [back, gb] = mk(c.back);
    for (const d of decorHere) safe(() => ch.drawDecor && ch.drawDecor(gb, d, { layer: 'back', TILE, level: L, palette: pal }));
    const isSolid = (t) => t === '#';
    for (let ty = 0; ty < L.h; ty++) for (let tx = Math.max(0, tx0 - 1); tx < Math.min(L.w, tx1 + 1); tx++) {
      const t = L.tile[ty][tx];
      if (this.hidden.has(`${tx},${ty}`)) continue;
      const x = tx * TILE, y = ty * TILE;
      if (t === '#') {
        const mask = neighborMask(L.tile, tx, ty, isSolid);
        const rng = mulberry32((hash2(tx, ty) * 4294967296) >>> 0);
        const info = { tx, ty, level: L, palette: pal };
        if (ch.drawSolidTile) safe(() => ch.drawSolidTile(gb, x, y, mask, rng, info));
        else defaultSolid(gb, x, y, mask, rng, info);
      } else if (t === '=') {
        const l = tx > 0 && L.tile[ty][tx - 1] === '=', r = tx < L.w - 1 && L.tile[ty][tx + 1] === '=';
        if (ch.drawOneWayTile) safe(() => ch.drawOneWayTile(gb, x, y, l, r, { tx, ty, level: L, palette: pal }));
        else defaultOneWay(gb, x, y, l, r, pal);
      }
    }
    c.back = back;

    // water
    let hasWater = false;
    for (let ty = 0; ty < L.h && !hasWater; ty++) for (let tx = tx0; tx < tx1; tx++) { const t = L.tile[ty][tx]; if (t === '~' || t === '-') { hasWater = true; break; } }
    if (hasWater) {
      const [wc, gw] = mk(c.water);
      for (let tx = tx0; tx < tx1; tx++) {
        let depth = -1;
        for (let ty = 0; ty < L.h; ty++) {
          const t = L.tile[ty][tx];
          const x = tx * TILE, y = ty * TILE;
          if (t === '~') {
            const surface = w.isSurfaceTile(tx, ty);
            if (depth < 0 || surface) depth = 0; else depth++;
            const top = surface ? y + SURFACE_BAND : y;
            const c0 = waterColor(pal, depth), c1 = waterColor(pal, depth + 1);
            gw.fillStyle = grad(gw, 0, y, 0, y + TILE, [rgba(c0, 0.52), rgba(c1, 0.58)]);
            gw.fillRect(x, top, TILE, y + TILE - top);
            // soft light at the bottom of a body of water
            if (ty + 1 < L.h && L.tile[ty + 1][tx] === '#') { gw.fillStyle = 'rgba(255,255,255,.06)'; gw.fillRect(x, y + TILE - 3, TILE, 3); }
          } else {
            depth = -1;
            if (t === '-') drawPuddle(gw, x, y, tx > 0 && L.tile[ty][tx - 1] === '-', tx < L.w - 1 && L.tile[ty][tx + 1] === '-', pal);
          }
        }
      }
      c.water = wc;
    } else c.water = null;

    // front
    if (decorHere.length && ch.drawDecor) {
      const [fc, gf] = mk(c.front);
      for (const d of decorHere) safe(() => ch.drawDecor(gf, d, { layer: 'front', TILE, level: L, palette: pal }));
      c.front = fc;
    } else c.front = null;
  }

  draw(ctx, layer, cam, view) {
    const L = this.world.level;
    const i0 = Math.max(0, Math.floor(cam.x / (CHUNK * TILE))), i1 = Math.min(this.n - 1, Math.floor((cam.x + view.w) / (CHUNK * TILE)));
    for (let i = i0; i <= i1; i++) {
      const c = this.chunks[i], cv = c[layer];
      if (!cv) continue;
      blit(ctx, cv, i * CHUNK * TILE, 0);
    }
  }
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
