// Water: spring-driven wavy surfaces for every run of surface tiles, splash ripples, caustic
// shimmer, and a helper to draw an arbitrary water rectangle (for entity water volumes).

import { TILE } from './constants.js';
import { rgba, mix, makeCanvas, grad } from './draw.js';

const SPACING = 6;
export const SURFACE_BAND = 8; // px under the surface line drawn per frame (the rest is pre-rendered)

export class Waters {
  constructor(world) { this.world = world; this.runs = []; this.time = 0; this.build(); }

  build() {
    const w = this.world, L = w.level;
    const old = this.runs;
    this.runs = [];
    for (let ty = 0; ty < L.h; ty++) {
      let tx = 0;
      while (tx < L.w) {
        if (w.isSurfaceTile(tx, ty)) {
          const s = tx;
          while (tx < L.w && w.isSurfaceTile(tx, ty)) tx++;
          const x0 = s * TILE, x1 = tx * TILE;
          const n = Math.max(2, Math.ceil((x1 - x0) / SPACING) + 1);
          const prev = old.find((r) => r.ty === ty && r.x0 === x0 && r.x1 === x1);
          this.runs.push(prev || { ty, y: ty * TILE, x0, x1, n, h: new Float32Array(n), v: new Float32Array(n) });
        } else tx++;
      }
    }
  }

  runAt(px, py, tol = 16) {
    for (const r of this.runs) if (px >= r.x0 - 4 && px <= r.x1 + 4 && Math.abs(py - r.y) <= tol) return r;
    return null;
  }

  /** Push the surface at px (near y) down (force > 0) or up. */
  disturb(px, py, force, width = 12) {
    const r = this.runAt(px, py, 30);
    if (!r) return false;
    const c = (px - r.x0) / SPACING;
    for (let i = Math.max(0, Math.floor(c - width / SPACING)); i <= Math.min(r.n - 1, Math.ceil(c + width / SPACING)); i++) {
      const k = 1 - Math.abs(i - c) / (width / SPACING + 1);
      r.v[i] += force * Math.max(0, k);
    }
    return true;
  }

  update(dt) {
    this.time += dt;
    for (const r of this.runs) {
      const { h, v, n } = r;
      for (let i = 0; i < n; i++) {
        v[i] += (-60 * h[i] - 3.5 * v[i]) * dt;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          const l = i > 0 ? h[i - 1] : h[i], rr = i < n - 1 ? h[i + 1] : h[i];
          v[i] += (l + rr - 2 * h[i]) * 30 * dt;
        }
      }
      for (let i = 0; i < n; i++) h[i] = Math.max(-10, Math.min(10, h[i] + v[i] * dt));
    }
  }

  heightAt(r, px) {
    const t = this.time;
    const f = (px - r.x0) / SPACING;
    const i = Math.max(0, Math.min(r.n - 2, Math.floor(f))), k = Math.min(1, Math.max(0, f - i));
    const spring = r.h[i] * (1 - k) + r.h[i + 1] * k;
    return spring + 1.3 * Math.sin(px * 0.07 + t * 2.1) + 0.8 * Math.sin(px * 0.17 - t * 1.4);
  }

  draw(ctx, cam, view, pal) {
    const x0v = cam.x - 8, x1v = cam.x + view.w + 8, y0v = cam.y - 20, y1v = cam.y + view.h + 20;
    for (const r of this.runs) {
      if (r.x1 < x0v || r.x0 > x1v || r.y < y0v || r.y > y1v) continue;
      const a = Math.max(r.x0, x0v), b = Math.min(r.x1, x1v);
      const bottom = r.y + SURFACE_BAND;
      ctx.beginPath();
      ctx.moveTo(a, bottom);
      for (let x = a; x <= b; x += 3) ctx.lineTo(x, r.y + this.heightAt(r, x));
      ctx.lineTo(b, r.y + this.heightAt(r, b));
      ctx.lineTo(b, bottom);
      ctx.closePath();
      ctx.fillStyle = grad(ctx, 0, r.y - 6, 0, bottom, [rgba(mix(pal.water, '#ffffff', 0.35), 0.75), rgba(pal.water, 0.62)]);
      ctx.fill();
      // bright surface line
      ctx.beginPath();
      for (let x = a; x <= b; x += 3) {
        const y = r.y + this.heightAt(r, x);
        if (x === a) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
}

/** Water colour for a tile `depth` tiles under the surface (0 = surface tile). */
export function waterColor(pal, depth) {
  return mix(pal.water, pal.waterDeep, Math.min(1, depth / 6));
}

let causticImg = null;
export function causticTexture() {
  if (causticImg) return causticImg;
  const S = 128, c = makeCanvas(S, S), g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineCap = 'round';
  const rnd = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < 26; i++) {
    const x = rnd(i) * S, y = rnd(i + 50) * S, r = 10 + rnd(i + 99) * 18;
    g.lineWidth = 1 + rnd(i + 7) * 1.6;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, r, r * (0.6 + rnd(i + 3) * 0.4), rnd(i + 11) * 3, rnd(i + 5) * 6, rnd(i + 5) * 6 + 2.2);
      g.stroke();
    }
  }
  causticImg = c;
  return c;
}

/** Draw a free-standing water box (used by entity water volumes). Surface wave on top. */
export function drawWaterRect(ctx, x, y, w, h, pal, time, alpha = 0.62) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  for (let xx = x; xx <= x + w; xx += 4) ctx.lineTo(xx, y + 1.3 * Math.sin(xx * 0.07 + time * 2.1) + 0.8 * Math.sin(xx * 0.17 - time * 1.4));
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, y, 0, y + h, [rgba(mix(pal.water, '#ffffff', 0.25), alpha), rgba(pal.waterDeep, alpha + 0.1)]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}
