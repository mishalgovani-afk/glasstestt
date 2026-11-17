// Shared player physics (DOM-free). The game's player (js/player.js) and the level validator
// (js/core/validate.js) both call stepBody() with the same fixed STEP, so the validator's
// reachability is the game's reachability.
//
// env interface (game: World, validator: a static grid):
//   env.w, env.h                 size in tiles
//   env.solidAt(tx, ty)          solid tile? (out of bounds left/right/top = solid, bottom = open)
//   env.oneWayAt(tx, ty)         one-way platform tile?
//   env.waterAt(tx, ty)          water tile?
//   env.boxes                    optional array of dynamic colliders {x,y,w,h,solid,oneWay}
//   env.waterBoxAt(px, py)       optional: point inside an entity water volume?
//   env.waterSurfaceAt(px, py)   optional: surface y of the entity water volume containing the point

import {
  TILE, GRAVITY, MAX_FALL, AIR_SPEED, AIR_ACCEL, AIR_DECEL, WRIGGLE_SPEED, GROUND_ACCEL,
  GROUND_DECEL, HOP_VY, SPLASH_HOP_VY, SWIM_SPEED, SWIM_ACCEL, SWIM_DECEL, WATER_DRAG,
  WATER_GRAVITY, WATER_ENTRY_DAMP, STROKE_VY, LEAP_VY, LEAP_ZONE, LEAP_BALLISTIC,
  PLAYER_W, PLAYER_H,
} from './constants.js';
import { approach } from './rng.js';

const EPS = 0.001;

export function makeBody(x, y) {
  return { x, y, w: PLAYER_W, h: PLAYER_H, vx: 0, vy: 0, onGround: false, inWater: false, leapT: 0, groundBox: null };
}

export function pointInWater(env, px, py) {
  if (env.waterAt(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
  return env.waterBoxAt ? !!env.waterBoxAt(px, py) : false;
}

export function bodyInWater(b, env) {
  return pointInWater(env, b.x + b.w / 2, b.y + b.h / 2);
}

/** Y (px) of the water surface above point (px,py), or null if the water reaches a ceiling. */
export function surfaceAbove(env, px, py) {
  if (env.waterBoxAt && env.waterBoxAt(px, py) && env.waterSurfaceAt) return env.waterSurfaceAt(px, py);
  const tx = Math.floor(px / TILE);
  let ty = Math.floor(py / TILE);
  if (!env.waterAt(tx, ty)) return null;
  while (ty > 0 && env.waterAt(tx, ty - 1)) ty--;
  if (ty <= 0 || env.solidAt(tx, ty - 1)) return null;
  return ty * TILE;
}

/** True when JUMP would leap out of the water instead of stroking. */
export function nearSurface(b, env) {
  if (!b.inWater) return false;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const s = surfaceAbove(env, cx, cy);
  return s !== null && cy - s <= LEAP_ZONE;
}

export function applyHop(b, splash = false) { b.vy = splash ? SPLASH_HOP_VY : HOP_VY; b.onGround = false; }
export function applyLeap(b) { b.vy = LEAP_VY; b.leapT = LEAP_BALLISTIC; b.onGround = false; }
export function applyStroke(b) { b.vy = STROKE_VY; b.onGround = false; }

/**
 * Advance one fixed step. dir = -1 | 0 | 1 (MOVE input). Returns events:
 * { landed, wall, bonk, enteredWater, exitedWater, impactVy }
 */
export function stepBody(b, dir, dt, env) {
  const ev = { landed: false, wall: false, bonk: false, enteredWater: false, exitedWater: false, impactVy: 0 };
  const wasWater = b.inWater;
  const wasGround = b.onGround;
  if (b.leapT > 0) b.leapT -= dt;

  if (b.inWater && b.leapT <= 0) {
    b.vx = approach(b.vx, dir * SWIM_SPEED, (dir ? SWIM_ACCEL : SWIM_DECEL) * dt);
    b.vy += WATER_GRAVITY * dt;
    b.vy *= Math.exp(-WATER_DRAG * dt);
  } else if (b.inWater) {
    // ballistic first instants of a leap: no drag so the leap height is predictable
    b.vx = approach(b.vx, dir * SWIM_SPEED, (dir ? SWIM_ACCEL : SWIM_DECEL) * dt);
    b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
  } else if (b.onGround) {
    b.vx = approach(b.vx, dir * WRIGGLE_SPEED, (dir ? GROUND_ACCEL : GROUND_DECEL) * dt);
    b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
  } else {
    // momentum above AIR_SPEED (dashes, launches) bleeds off slowly while you steer with it
    if (dir && Math.sign(b.vx) === dir && Math.abs(b.vx) > AIR_SPEED) b.vx = approach(b.vx, dir * AIR_SPEED, AIR_DECEL * dt);
    else if (dir) b.vx = approach(b.vx, dir * AIR_SPEED, AIR_ACCEL * dt);
    else b.vx = approach(b.vx, 0, AIR_DECEL * dt);
    b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
  }

  moveX(b, b.vx * dt, env, ev);
  const vyBefore = b.vy;
  moveY(b, b.vy * dt, env, ev);
  if (ev.landed && !wasGround) ev.impactVy = vyBefore;

  b.inWater = bodyInWater(b, env);
  if (!wasWater && b.inWater) {
    ev.enteredWater = true;
    ev.impactVy = b.vy;
    if (b.vy > 0) b.vy *= WATER_ENTRY_DAMP;
  }
  if (wasWater && !b.inWater) ev.exitedWater = true;
  return ev;
}

function overlap(a, bx, by, bw, bh) {
  return a.x < bx + bw && a.x + a.w > bx && a.y < by + bh && a.y + a.h > by;
}

function moveX(b, dx, env, ev) {
  if (!dx) return;
  b.x += dx;
  const ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - EPS) / TILE);
  if (dx > 0) {
    const tx = Math.floor((b.x + b.w - EPS) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) if (env.solidAt(tx, ty)) { b.x = tx * TILE - b.w; b.vx = 0; ev.wall = true; break; }
  } else {
    const tx = Math.floor(b.x / TILE);
    for (let ty = ty0; ty <= ty1; ty++) if (env.solidAt(tx, ty)) { b.x = (tx + 1) * TILE; b.vx = 0; ev.wall = true; break; }
  }
  if (env.boxes) for (const o of env.boxes) {
    if (!o.solid || !overlap(b, o.x, o.y, o.w, o.h)) continue;
    if (dx > 0) b.x = o.x - b.w; else b.x = o.x + o.w;
    b.vx = 0; ev.wall = true;
  }
}

function moveY(b, dy, env, ev) {
  b.onGround = false;
  b.groundBox = null;
  if (!dy) dy = 0.0001;
  const prevBottom = b.y + b.h;
  b.y += dy;
  const tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - EPS) / TILE);
  if (dy > 0) {
    const bottom = b.y + b.h;
    const ty = Math.floor((bottom - EPS) / TILE);
    const top = ty * TILE;
    for (let tx = tx0; tx <= tx1; tx++) {
      if (env.solidAt(tx, ty) || (env.oneWayAt(tx, ty) && prevBottom <= top + 0.01)) {
        b.y = top - b.h; b.vy = 0; b.onGround = true; ev.landed = true; break;
      }
    }
  } else {
    const ty = Math.floor(b.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (env.solidAt(tx, ty)) { b.y = (ty + 1) * TILE; b.vy = 0; ev.bonk = true; break; }
    }
  }
  if (env.boxes) for (const o of env.boxes) {
    if (!(o.solid || o.oneWay) || !overlap(b, o.x, o.y, o.w, o.h)) continue;
    if (dy > 0 && (o.solid || prevBottom <= o.y + 0.01)) {
      b.y = o.y - b.h; b.vy = 0; b.onGround = true; b.groundBox = o; ev.landed = true;
    } else if (dy < 0 && o.solid) {
      b.y = o.y + o.h; b.vy = 0; ev.bonk = true;
    }
  }
}

/** Does body b overlap the inset box `box` ({x,y,w,h} inside a tile) of tile (tx,ty)? */
export function overlapsTileBox(b, tx, ty, box) {
  return overlap(b, tx * TILE + box.x, ty * TILE + box.y, box.w, box.h);
}

/** Calls fn(tx, ty) for every tile the body (optionally grown by pad px) touches. */
export function forTilesTouched(b, fn, pad = 0) {
  const tx0 = Math.floor((b.x - pad) / TILE), tx1 = Math.floor((b.x + b.w + pad - EPS) / TILE);
  const ty0 = Math.floor((b.y - pad) / TILE), ty1 = Math.floor((b.y + b.h + pad - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) fn(tx, ty);
}

export { overlap as boxOverlapXYWH };
