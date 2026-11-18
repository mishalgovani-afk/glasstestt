// Chapter 2 bubble rules: pure, DOM-free logic shared by the game entities (entities.js), the
// validator reach rules (reach.js) and tests/ch2.test.mjs. Every honest claim the validator
// makes about bubbles is derived from the numbers and the step function in this file.

import { TILE, HAZARD_BOX } from '../../core/constants.js';

export const B = {
  HR: 11.5,          // bubble collision half-extent (px). Must be >= the fish's 9 x 7 half-box.
  DRAW_R: 17,        // drawn radius while the fish is inside
  IDLE_R: 13,        // drawn radius of a loose bubble
  RISE: 46,          // px/s: how fast a carrying bubble rises
  EASE: 0.3,         // s: linear ramp from 0 to full rise speed
  DRIFT: 70,         // px/s: sideways speed the player can steer to
  DRIFT_ACCEL: 320,  // px/s^2
  LIFE: 3.0,         // s: a carrying bubble thins out and pops softly after this
  POP_VY: -700,      // JUMP in a bubble: boosted jump (~6.8 tiles of rise)
  SOFT_VY: -220,     // the bubble just ran out of air: a gentle hop
  DROP_VY: 30,       // popped by a ceiling / hazard / shower: you just drop
  GRACE: 0.15,       // s after capture during which JUMP is swallowed (no accidental pops)
  RESPAWN: 2.0,      // s until a popped fixed bubble re-forms at its home
  FREE_RISE: 40,     // px/s: a loose bubble from an emitter rises this fast
  FREE_LIFE: 7,      // s a loose bubble floats before it pops on its own
  MAX_WIND: 30,      // px/s: strongest air current a level may use (keeps the claims valid)
  RISE_TILES: 5,     // honest reach: a bubble is guaranteed to rise this many tiles
};

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

/**
 * Advance a carrying bubble. s = { x, y, vx, vy, t } (px, centre). dir = -1|0|1 (MOVE),
 * wind = px/s of air current, blocked(x0,y0,x1,y1) -> true if a solid tile overlaps the box.
 * Returns { ceiling, expired }.
 */
export function stepCarry(s, dt, dir, wind, blocked) {
  s.t += dt;
  s.vy = -B.RISE * Math.min(1, s.t / B.EASE);
  s.vx = approach(s.vx, dir * B.DRIFT + wind, B.DRIFT_ACCEL * dt);
  const nx = s.x + s.vx * dt;
  if (blocked(nx - B.HR, s.y - B.HR, nx + B.HR, s.y + B.HR)) s.vx = 0; else s.x = nx;
  const ny = s.y + s.vy * dt;
  const ev = { ceiling: false, expired: s.t >= B.LIFE };
  if (blocked(s.x - B.HR, ny - B.HR, s.x + B.HR, ny + B.HR)) ev.ceiling = true; else s.y = ny;
  return ev;
}

/** Advance a loose (unclaimed) bubble: slow rise, a little sway, plus wind. */
export function stepFree(s, dt, wind, blocked) {
  s.t += dt;
  const nx = s.x + (wind + Math.cos(s.t * 1.7 + s.phase) * 9) * dt;
  if (blocked(nx - B.HR, s.y - B.HR, nx + B.HR, s.y + B.HR)) { /* slide along walls */ } else s.x = nx;
  const ny = s.y - B.FREE_RISE * dt;
  const ev = { ceiling: false, expired: s.t >= B.FREE_LIFE };
  if (blocked(s.x - B.HR, ny - B.HR, s.x + B.HR, ny + B.HR)) ev.ceiling = true; else s.y = ny;
  return ev;
}

/** Does a circle-ish bubble at (x,y) touch the hazard box of tile (tx,ty)? */
export function touchesHazardTile(x, y, tx, ty) {
  const x0 = tx * TILE + HAZARD_BOX.x, y0 = ty * TILE + HAZARD_BOX.y;
  const x1 = x0 + HAZARD_BOX.w, y1 = y0 + HAZARD_BOX.h;
  const px = Math.max(x0, Math.min(x, x1)), py = Math.max(y0, Math.min(y, y1));
  return Math.hypot(px - x, py - y) < B.HR + 2;
}

/**
 * Honest bubble rise & drift, from a bubble at tile (x,y): the list of (dx, rise) launch points
 * a first-time player can pop from. Pure function of the parsed level (ctx.level) so the game
 * and the validator agree. `blocked(tx,ty)` says a cell stops a bubble ('#', '^', shower stream).
 */
export function popPoints(x, y, blocked) {
  const out = [];
  for (let rise = 0; rise <= B.RISE_TILES; rise++) {
    const yy = y - rise;
    // worst-case sideways drift against a MAX_WIND current: steer speed minus wind, over the
    // time it takes to rise `rise` tiles (the bubble's rise time is at least rise*TILE/RISE s).
    const t = (rise * TILE) / B.RISE;
    const reachPx = Math.max(0, (B.DRIFT - B.MAX_WIND) * t - TILE * 0.5);
    const maxDx = Math.min(3, Math.floor(reachPx / TILE));
    for (let dx = -maxDx; dx <= maxDx; dx++) {
      let ok = true;
      const x0 = Math.min(x, x + dx), x1 = Math.max(x, x + dx);
      for (let cy = yy; cy <= y && ok; cy++) for (let cx = x0; cx <= x1 && ok; cx++) if (blocked(cx, cy)) ok = false;
      if (ok) out.push({ dx, rise, x: x + dx, y: yy });
    }
  }
  return out;
}

/** Vertical extent of a shower stream that starts below tile (tx,ty): last tile row it covers. */
export function streamEnd(tx, ty, tileAt, h) {
  let yy = ty;
  while (yy + 1 < h) {
    const c = tileAt(tx, yy + 1);
    if (c === '#' || c === '=' || c === '~' || c === '-') break;
    yy++;
  }
  return yy;
}
