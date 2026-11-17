// Camera: smooth follow with look-ahead, level-bounds clamp, optional lock rect (boss arenas)
// and trauma-based screen shake (disabled under prefers-reduced-motion).

import { CAM_LOOK_AHEAD, CAM_FOLLOW_X, CAM_FOLLOW_Y, SHAKE_MAX } from './constants.js';
import { clamp } from './rng.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.px = 0; this.py = 0;
    this.look = 0;
    this.trauma = 0;
    this.lock = null;       // {x,y,w,h} world px, or null
    this.lockBlend = 0;
    this.reducedMotion = false;
    this.shakeX = 0; this.shakeY = 0;
    this.t = 0;
  }

  bounds(view, level) {
    const span = (r) => {
      const minX = r.x, maxX = r.x + r.w - view.w, minY = r.y, maxY = r.y + r.h - view.h;
      return {
        minX: maxX < minX ? (minX + maxX) / 2 : minX, maxX: maxX < minX ? (minX + maxX) / 2 : maxX,
        minY: maxY < minY ? (minY + maxY) / 2 : minY, maxY: maxY < minY ? (minY + maxY) / 2 : maxY,
      };
    };
    const L = span({ x: 0, y: 0, w: level.pxW, h: level.pxH });
    if (!this.lock) return L;
    // a lock rect (boss arena) narrower than the view is centred, but never shows outside the level
    const k = span(this.lock);
    const c = (v, a, b) => Math.max(a, Math.min(b, v));
    return { minX: c(k.minX, L.minX, L.maxX), maxX: c(k.maxX, L.minX, L.maxX), minY: c(k.minY, L.minY, L.maxY), maxY: c(k.maxY, L.minY, L.maxY) };
  }

  target(player, view) {
    const want = player.facing * CAM_LOOK_AHEAD + clamp(player.body.vx * 0.25, -40, 40);
    return { want, tx: player.cx - view.w / 2, ty: player.cy - view.h * 0.55 };
  }

  snap(player, view, level) {
    const { tx, ty } = this.target(player, view);
    const b = this.bounds(view, level);
    this.look = player.facing * CAM_LOOK_AHEAD;
    this.x = clamp(tx + this.look, b.minX, b.maxX);
    this.y = clamp(ty, b.minY, b.maxY);
    this.px = this.x; this.py = this.y;
  }

  update(dt, player, view, level) {
    this.px = this.x; this.py = this.y;
    this.t += dt;
    const { want, tx, ty } = this.target(player, view);
    this.look += (want - this.look) * (1 - Math.exp(-2.2 * dt));
    const b = this.bounds(view, level);
    const gx = clamp(tx + this.look, b.minX, b.maxX);
    // vertical: follow slower while standing, faster while falling
    const ky = player.body.vy > 300 ? CAM_FOLLOW_Y * 2 : CAM_FOLLOW_Y;
    const gy = clamp(ty, b.minY, b.maxY);
    this.x += (gx - this.x) * (1 - Math.exp(-CAM_FOLLOW_X * dt));
    this.y += (gy - this.y) * (1 - Math.exp(-ky * dt));
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.reducedMotion ? 0 : this.trauma * this.trauma * SHAKE_MAX;
    this.shakeX = s * (Math.sin(this.t * 61) + Math.sin(this.t * 37) * 0.5) / 1.5;
    this.shakeY = s * (Math.sin(this.t * 53 + 1) + Math.sin(this.t * 29) * 0.5) / 1.5;
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  /** Interpolated, shaken, pixel-snapped camera for rendering. */
  view(alpha, dpr = 1) {
    const x = this.px + (this.x - this.px) * alpha + this.shakeX;
    const y = this.py + (this.y - this.py) * alpha + this.shakeY;
    return { x: Math.round(x * dpr) / dpr, y: Math.round(y * dpr) / dpr };
  }
}
