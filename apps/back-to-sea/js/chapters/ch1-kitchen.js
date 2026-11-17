// Chapter 1 — The Kitchen. Reference chapter: copy its patterns.
//
//  - Background: cached parallax layers (drawBackground) + world-anchored backsplash.
//  - Custom solid tiles: countertop slab on exposed tops, wooden cabinet fronts below (drawSolidTile).
//  - Decor: big set pieces (fishbowl, sink, jars, glass) drawn once into the pre-rendered layers
//    (drawDecor), with `hideTiles` so the '#' tiles under them are not drawn by drawSolidTile.
//  - A custom entity: the dripping tap `T` that spawns falling drips you can catch (+moisture),
//    with its validator `reach` rule (the cell where the drips land counts as a refill spot).
//  - Chapter SFX (sfx) and a music mood (music).
//
// Nothing here touches the DOM at import time: art functions run only when the game calls them.

import { Entity } from '../core/entity.js';
import { TILE, DROPLET_MOISTURE } from '../core/constants.js';
import { grad, radial, roundRect, rgba, mix, darken, lighten, glow, cached, ctxScale, seeded, contactShadow, blit } from '../core/draw.js';

const P = {
  sky: '#ffe7c2', wallA: '#f6e7cf', wallB: '#e8d2b0', solid: '#8d5b3b', solidEdge: '#efe8dc',
  water: '#5cc6e4', waterDeep: '#1d6b97', accent: '#ff8a3d', shelf: '#b9824f', hazard: '#ff5a2a',
};

// ---------------------------------------------------------------------------------------------
// Entities

/** A falling drip spawned by a Tap. Catch it for +moisture. */
class Drip extends Entity {
  init() { this.w = 6; this.h = 9; this.vy = 30; this.layer = 1; }
  update(dt, world) {
    this.vy = Math.min(this.vy + 900 * dt, 520);
    this.y += this.vy * dt;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.y + this.h) / TILE);
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=' || c === '~' || c === '-' || this.y > world.level.pxH) {
      const sy = ty * TILE + (c === '-' ? 18 : 0);
      world.particles.splash(this.cx, sy, 0.35, world.palette.water);
      if (c === '~') world.rippleAt(this.cx, sy, 0.6);
      world.audio.sfx('plink', { vol: 0.25, pitch: 0.9 + Math.random() * 0.3, x: this.cx });
      this.dead = true;
    }
  }
  onPlayerOverlap(player, world) {
    player.addMoisture(DROPLET_MOISTURE);
    world.particles.sparkle(this.cx, this.cy, 6, '#bff3ff');
    world.audio.sfx('drip');
    this.dead = true;
  }
  draw(ctx) {
    const { cx, y } = this;
    ctx.fillStyle = grad(ctx, cx - 3, y, cx + 3, y + 9, ['#e9fbff', P.water]);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx + 3.5, y + 5, cx + 3, y + 7);
    ctx.arc(cx, y + 6.5, 3, 0.2, Math.PI - 0.2);
    ctx.quadraticCurveTo(cx - 3.5, y + 5, cx, y);
    ctx.fill();
  }
}

/**
 * T — dripping tap, mounted under a cabinet. Spawns a Drip every `period` seconds
 * (props: { period: 1.2, offset: 0 }). The drips fall straight down the tap's column.
 */
export class Tap extends Entity {
  static tile = '.';
  init() { this.period = this.props.period || 1.2; this.t = this.props.offset || 0; this.wobble = 0; }
  update(dt, world) {
    this.t += dt;
    this.wobble = Math.max(0, this.wobble - dt * 3);
    if (this.t >= this.period) {
      this.t -= this.period;
      this.wobble = 1;
      world.spawn(new Drip(world, this.cx - 3, this.y + 17));
    }
  }
  draw(ctx, world) {
    const x = this.x, y = this.y;
    // pipe from the cabinet above
    ctx.fillStyle = grad(ctx, x + 9, 0, x + 15, 0, ['#8d97a3', '#f4f7fb', '#9aa4ae']);
    ctx.fillRect(x + 9, y - 6, 6, 12);
    // spout
    ctx.fillStyle = grad(ctx, 0, y + 4, 0, y + 14, ['#f4f7fb', '#8d97a3']);
    roundRect(ctx, x + 4, y + 5, 16, 7, 3.5); ctx.fill();
    ctx.fillRect(x + 9, y + 10, 6, 6);
    // handle
    ctx.fillStyle = '#d0d6dd';
    roundRect(ctx, x + 2, y - 1, 7, 4, 2); ctx.fill();
    ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(x + 4, y + 1, 1.6, 0, 7); ctx.fill();
    // forming drop
    const k = this.t / this.period;
    const r = 1 + 2.2 * k * k + this.wobble * 0.5;
    ctx.fillStyle = rgba(P.water, 0.9);
    ctx.beginPath(); ctx.arc(this.cx, y + 16 + r * 0.6, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath(); ctx.arc(this.cx - r * 0.35, y + 15.5 + r * 0.4, r * 0.3, 0, 7); ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
// Validator reach rules (see DESIGN.md "Reach rules")

export const reach = {
  // The tap's drips land on the first stand cell below it. Standing there you catch a drip every
  // `period` s (+35 moisture vs ~20 lost), so the validator may treat that cell as a refill spot.
  T: {
    mark({ x, y, env, props }) {
      if ((props.period || 1.2) > 2) return []; // too slow to keep you wet: no refill credit
      for (let yy = y + 1; yy < env.h; yy++) {
        if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
        if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];
      }
      return [];
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Art

function paintFar(c, w, h) {
  // warm wall with faint wallpaper stripes + a window with morning sky
  c.fillStyle = grad(c, 0, 0, 0, h, [P.wallA, P.wallB]);
  c.fillRect(0, 0, w, h);
  c.globalAlpha = 0.18;
  for (let x = 0; x < w; x += 20) { c.fillStyle = x % 40 ? '#fff6e6' : '#e2c7a0'; c.fillRect(x, 0, 8, h); }
  c.globalAlpha = 1;
  const wx = 120, wy = 40, ww = 190, wh = 150;
  c.fillStyle = grad(c, 0, wy, 0, wy + wh, ['#9fd8ff', '#d9f0ff', '#ffe2b8']);
  c.fillRect(wx, wy, ww, wh);
  glow(c, wx + 140, wy + 110, 90, '#fff3c4', 0.9);
  // distant hills + trees
  c.fillStyle = '#a8d6a0'; c.beginPath(); c.moveTo(wx, wy + wh);
  for (let x = 0; x <= ww; x += 10) c.lineTo(wx + x, wy + wh - 26 - Math.sin(x * 0.05) * 10 - Math.sin(x * 0.13) * 5);
  c.lineTo(wx + ww, wy + wh); c.fill();
  c.fillStyle = '#7fbf86'; c.beginPath(); c.moveTo(wx, wy + wh);
  for (let x = 0; x <= ww; x += 8) c.lineTo(wx + x, wy + wh - 12 - Math.abs(Math.sin(x * 0.09)) * 12);
  c.lineTo(wx + ww, wy + wh); c.fill();
  // frame + mullions
  c.strokeStyle = '#fffaf1'; c.lineWidth = 8; c.strokeRect(wx, wy, ww, wh);
  c.lineWidth = 5; c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.moveTo(wx, wy + wh / 2); c.lineTo(wx + ww, wy + wh / 2); c.stroke();
  // sill
  c.fillStyle = '#fffaf1'; c.fillRect(wx - 14, wy + wh + 2, ww + 28, 8);
  c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(wx - 14, wy + wh + 10, ww + 28, 4);
  // potted herb on the sill
  c.fillStyle = '#d0704a'; roundRect(c, wx + 24, wy + wh - 18, 22, 20, 3); c.fill();
  c.fillStyle = '#5aa45a';
  for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(wx + 35 + Math.sin(i * 1.7) * 9, wy + wh - 26 - i * 2, 5, 9, Math.sin(i) * 0.8, 0, 7); c.fill(); }
  // curtains
  for (const side of [-1, 1]) {
    const cx = side < 0 ? wx - 18 : wx + ww - 22;
    c.fillStyle = grad(c, cx, 0, cx + 40, 0, ['#f08f6a', '#ffb08f', '#e57a57']);
    c.beginPath(); c.moveTo(cx, wy - 18); c.lineTo(cx + 40, wy - 18);
    c.quadraticCurveTo(cx + 30 - side * 6, wy + wh * 0.6, cx + 36, wy + wh + 10);
    c.lineTo(cx + 4, wy + wh + 10); c.quadraticCurveTo(cx + 12 + side * 4, wy + wh * 0.5, cx, wy - 18); c.fill();
  }
  c.fillStyle = '#c9a47a'; c.fillRect(wx - 30, wy - 22, ww + 60, 5);
  // a wall clock far right
  const kx = 470, ky = 80;
  c.fillStyle = '#fffaf1'; c.beginPath(); c.arc(kx, ky, 26, 0, 7); c.fill();
  c.strokeStyle = '#c9a47a'; c.lineWidth = 4; c.stroke();
  c.strokeStyle = '#5b4a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(kx, ky); c.lineTo(kx + 10, ky - 9); c.moveTo(kx, ky); c.lineTo(kx - 3, ky + 15); c.stroke();
  // shelf with plates
  c.fillStyle = '#c9a47a'; c.fillRect(380, 170, 160, 6);
  for (let i = 0; i < 5; i++) {
    c.fillStyle = ['#7cc4d8', '#f2c46b', '#ffffff', '#e98b7a', '#9ccf9a'][i];
    c.beginPath(); c.ellipse(400 + i * 30, 152, 12, 18, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(397 + i * 30, 148, 5, 10, 0, 0, 7); c.fill();
  }
}

function paintMid(c, w, h) {
  // hanging utensil rail + pans
  c.strokeStyle = '#a7aeb6'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(40, 64); c.lineTo(300, 64); c.stroke();
  const pans = [[70, 26, '#3c4148'], [130, 18, '#b9733f'], [180, 22, '#3c4148'], [250, 16, '#c9cdd2']];
  for (const [x, r, col] of pans) {
    c.strokeStyle = '#8b9299'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 64); c.lineTo(x, 74); c.stroke();
    c.fillStyle = col; c.fillRect(x - 3, 72, 6, 22);
    c.fillStyle = grad(c, x - r, 0, x + r, 0, [darken(col, 0.2), lighten(col, 0.25), darken(col, 0.3)]);
    c.beginPath(); c.arc(x, 94 + r, r, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.arc(x - r * 0.35, 94 + r * 0.7, r * 0.35, 0, 7); c.fill();
  }
  // tall fridge silhouette
  c.fillStyle = grad(c, 520, 0, 640, 0, ['#e9edf0', '#fdfefe', '#d5dbe0']);
  roundRect(c, 520, 30, 120, h, 10); c.fill();
  c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(520, 140, 120, 3);
  c.fillStyle = '#b8c0c8'; roundRect(c, 528, 70, 5, 50, 2); c.fill(); roundRect(c, 528, 160, 5, 60, 2); c.fill();
  // fridge magnets
  for (const [x, y, col] of [[570, 80, '#ff8a3d'], [600, 100, '#6cc4a1'], [585, 190, '#f2c46b']]) {
    c.fillStyle = col; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
  }
  c.fillStyle = '#fff'; c.save(); c.translate(592, 120); c.rotate(-0.08); c.fillRect(-14, -10, 28, 34); c.restore();
}

function paintBacksplash(c, w, h) {
  c.fillStyle = '#f9f4ec'; c.fillRect(0, 0, w, h);
  const tw = 24, th = 12;
  for (let y = 0; y < h; y += th) {
    const off = (y / th) % 2 ? tw / 2 : 0;
    for (let x = -tw; x < w + tw; x += tw) {
      c.fillStyle = grad(c, 0, y, 0, y + th, ['#ffffff', '#eae3d8']);
      roundRect(c, x + off + 1, y + 1, tw - 2, th - 2, 2); c.fill();
    }
  }
  c.fillStyle = grad(c, 0, 0, 0, 14, ['rgba(0,0,0,.12)', 'rgba(0,0,0,0)']); c.fillRect(0, 0, w, 14);
}

export function drawBackground(ctx, view, cam, time, world) {
  const s = ctxScale(ctx);
  const far = cached('k-far', 640, 360, s, paintFar);
  const off = -((cam.x * 0.25) % 640 + 640) % 640;
  for (let x = Math.floor(off); x < view.w; x += 640) blit(ctx, far, x, -cam.y * 0.15);
  const mid = cached('k-mid', 700, 360, s, paintMid);
  const off2 = -((cam.x * 0.5) % 700 + 700) % 700;
  for (let x = Math.floor(off2); x < view.w; x += 700) blit(ctx, mid, x, 20 - cam.y * 0.3);
  // world-anchored backsplash band behind the counters
  if (world) {
    const counterTop = (world.level.h - 2) * TILE;
    const bs = cached('k-bs', 240, 168, s, paintBacksplash);
    const y = counterTop - 168 - cam.y;
    const ox = -((cam.x % 240) + 240) % 240;
    for (let x = Math.floor(ox); x < view.w; x += 240) blit(ctx, bs, x, y);
  }
  // sunbeam
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.03 * Math.sin(time * 0.6);
  ctx.fillStyle = grad(ctx, 0, 0, view.w, view.h, ['#fff4c9', 'rgba(255,244,201,0)']);
  const bx = 150 - ((cam.x * 0.25) % 640);
  ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 200, 0); ctx.lineTo(bx + 520, view.h); ctx.lineTo(bx + 160, view.h); ctx.fill();
  ctx.restore();
}

/** Counter tiles: marble slab on exposed tops, wooden cabinet doors below. */
export function drawSolidTile(ctx, x, y, mask, rng, info) {
  const top = !(mask & 1), left = !(mask & 8), right = !(mask & 2), bottom = !(mask & 4);
  const tx = info.tx;
  ctx.fillStyle = grad(ctx, x, y, x + TILE, y + TILE, ['#9a6643', '#7f5033']);
  ctx.fillRect(x, y, TILE, TILE);
  // wood grain
  ctx.strokeStyle = 'rgba(60,30,15,.18)'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const gx = x + 3 + rng() * 18;
    ctx.beginPath(); ctx.moveTo(gx, y); ctx.bezierCurveTo(gx + 2, y + 8, gx - 2, y + 16, gx + 1, y + TILE); ctx.stroke();
  }
  // door seams every 3 tiles + knobs
  if (tx % 3 === 0) { ctx.fillStyle = 'rgba(40,20,10,.45)'; ctx.fillRect(x, y, 1.5, TILE); ctx.fillStyle = 'rgba(255,220,180,.15)'; ctx.fillRect(x + 1.5, y, 1, TILE); }
  if (tx % 3 === 1 && top) { ctx.fillStyle = '#e6d3b4'; ctx.beginPath(); ctx.arc(x + 12, y + 16, 1.8, 0, 7); ctx.fill(); }
  if (top) {
    // marble countertop slab
    ctx.fillStyle = grad(ctx, 0, y, 0, y + 8, ['#fbf8f3', '#e2dbcf']);
    ctx.fillRect(x - (left ? 1 : 0), y, TILE + (left ? 1 : 0) + (right ? 1 : 0), 8);
    ctx.fillStyle = 'rgba(120,110,100,.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + rng() * 22, y + 1 + rng() * 5, 1.5, 1);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x, y, TILE, 1.2);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, y + 8, TILE, 2);
  }
  if (left) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, y, 2, TILE); }
  if (right) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
  if (bottom) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
}

/** Big set pieces, drawn once into the pre-rendered layers. d is in tiles. */
export function drawDecor(ctx, d, info) {
  const X = d.x * TILE, Y = d.y * TILE, W = d.w * TILE, H = d.h * TILE;
  if (d.type === 'bowl') {
    if (info.layer === 'back') {
      contactShadow(ctx, X + W / 2, Y + H, W * 0.55, 8, 0.3);
      ctx.fillStyle = 'rgba(220,240,250,.35)';
      bowlPath(ctx, X, Y, W, H); ctx.fill();
      // gravel
      const r = seeded(7);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = ['#f2b880', '#9ad0c2', '#f7e0a8', '#d48a7a'][i % 4];
        ctx.beginPath(); ctx.arc(X + 30 + r() * (W - 60), Y + H - 6 - r() * 8, 2 + r() * 2, 0, 7); ctx.fill();
      }
      // weed
      ctx.strokeStyle = '#4fa36a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(X + W - 44 + i * 6, Y + H - 8); ctx.quadraticCurveTo(X + W - 54 + i * 9, Y + H - 40, X + W - 46 + i * 7, Y + H - 60 + i * 6); ctx.stroke(); }
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
      bowlPath(ctx, X, Y, W, H); ctx.stroke();
      ctx.strokeStyle = 'rgba(160,200,220,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.beginPath(); ctx.ellipse(X + W * 0.22, Y + H * 0.5, 6, H * 0.3, 0.15, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; roundRect(ctx, X + 12, Y + 12, W - 24, 5, 2.5); ctx.fill();
    }
  } else if (d.type === 'sink') {
    if (info.layer === 'back') {
      ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#c9d1d8', '#8c97a1']);
      roundRect(ctx, X, Y, W, H + 4, 8); ctx.fill();
      ctx.fillStyle = grad(ctx, 0, Y + 12, 0, Y + H, ['#7c8892', '#aab4bd']);
      roundRect(ctx, X + 10, Y + 12, W - 20, H - 10, 10); ctx.fill();
    } else {
      ctx.fillStyle = grad(ctx, 0, Y, 0, Y + 12, ['#f6f8fa', '#b7c0c8']);
      roundRect(ctx, X, Y, 14, H, 6); ctx.fill();
      roundRect(ctx, X + W - 14, Y, 14, H, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(X + 3, Y + 2, W - 6, 2);
      ctx.fillStyle = grad(ctx, 0, Y, 0, Y + 10, ['#ffffff', '#c3cbd2']);
      roundRect(ctx, X - 2, Y - 2, W + 4, 9, 4); ctx.fill();
    }
  } else if (d.type === 'jars') {
    if (info.layer !== 'back') return;
    const cols = ['#e7c07a', '#c2dfe3', '#e7a07a'];
    const n = Math.max(1, d.w);
    for (let i = 0; i < n; i++) {
      const jx = X + i * TILE + 1, jw = TILE - 2;
      ctx.fillStyle = grad(ctx, jx, 0, jx + jw, 0, [lighten(cols[i % 3], 0.2), cols[i % 3], darken(cols[i % 3], 0.2)]);
      roundRect(ctx, jx, Y + 6, jw, H - 6, 4); ctx.fill();
      ctx.fillStyle = '#7a5134'; roundRect(ctx, jx - 1, Y, jw + 2, 8, 2); ctx.fill();
      ctx.fillStyle = '#fff8ec'; roundRect(ctx, jx + 4, Y + 28, jw - 8, 16, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(jx + 3, Y + 10, 3, H - 20);
    }
  } else if (d.type === 'glass') {
    if (info.layer === 'back') {
      ctx.fillStyle = 'rgba(210,235,245,.25)'; roundRect(ctx, X + 2, Y, W - 4, H, 4); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2.5;
      roundRect(ctx, X + 3, Y - 4, W - 6, H + 4, 4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(X + 7, Y, 4, H - 4);
    }
  } else if (d.type === 'stove') {
    if (info.layer !== 'back') return;
    ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#4a4e55', '#2d3036']);
    roundRect(ctx, X, Y, W, H, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(X + 4, Y + 3, W - 8, 2);
    for (let i = 0; i < d.w; i++) { ctx.fillStyle = '#c7ccd2'; ctx.beginPath(); ctx.arc(X + 12 + i * TILE, Y + H - 10, 4, 0, 7); ctx.fill(); }
  }
}

function bowlPath(ctx, X, Y, W, H) {
  ctx.beginPath();
  ctx.moveTo(X + 14, Y + 6);
  ctx.bezierCurveTo(X - 10, Y + H * 0.35, X - 4, Y + H, X + W * 0.25, Y + H);
  ctx.lineTo(X + W * 0.75, Y + H);
  ctx.bezierCurveTo(X + W + 4, Y + H, X + W + 10, Y + H * 0.35, X + W - 14, Y + 6);
  ctx.closePath();
}

/** Hot burner coil (hazard look). Called every frame for visible '^' tiles. */
export function drawHazard(ctx, x, y, time) {
  const p = 0.65 + 0.35 * Math.sin(time * 5 + x * 0.1);
  glow(ctx, x + 12, y + 20, 22, '#ff6a2a', 0.35 * p);
  ctx.fillStyle = '#2b2d31'; roundRect(ctx, x + 1, y + 17, 22, 7, 3); ctx.fill();
  ctx.strokeStyle = mix('#ff3b1f', '#ffd27a', p * 0.6); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x + 12, y + 19, 9, 2.6, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + 12, y + 19, 4.5, 1.3, 0, 0, 7); ctx.stroke();
  // heat shimmer
  ctx.strokeStyle = `rgba(255,170,110,${0.25 * p})`; ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const ox = x + 7 + i * 10, t = time * 2 + i;
    ctx.beginPath(); ctx.moveTo(ox, y + 15);
    ctx.bezierCurveTo(ox + 3 * Math.sin(t), y + 10, ox - 3 * Math.sin(t), y + 6, ox + 2 * Math.sin(t * 1.3), y + 1); ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------------
// Levels

const levels = [
  {
    id: '1-1', name: 'Out of the Bowl', budget: 55,
    hint: 'Swim up and JUMP at the surface to leap out!',
    map: [
      '...............###########.............##############',
      '...............###########.............##############',
      '.....................................................',
      '.....................................................',
      '.....................................................',
      '.....................................................',
      '.....................................................',
      '.....................................................',
      '...................................o..#...........#..',
      '......#~~~~~#.............###....====.#~~~~~~~~~~~#..',
      '......#~~S~~#.............###.........#~~~~~~~~~~~#..',
      '......#~~~~~#........o....###.........#~~~~~~~~~~~#..',
      '......#~~~~~#....o......--###.C.-.....#~~~~~E~~~~~#..',
      '#####################################################',
      '#####################################################',
    ],
    decor: [
      { type: 'bowl', x: 6, y: 8, w: 7, h: 5, hideTiles: true },
      { type: 'jars', x: 26, y: 9, w: 3, h: 4, hideTiles: true },
      { type: 'sink', x: 38, y: 8, w: 13, h: 5, hideTiles: true },
    ],
    says: [
      { x: 14, text: 'Out of water you dry out. Grab droplets!' },
      { x: 23, text: 'JUMP from a puddle for a big splash-hop.' },
      { x: 39, text: 'Find the drain!' },
    ],
  },
  {
    id: '1-2', name: 'Drip, Drip', budget: 75,
    hint: 'Hot burners! Hop over them. Stand under the tap to catch drips.',
    map: [
      '......................................................................',
      '......................................................................',
      '..............######........................................#####.....',
      '.................T............................................T.......',
      '......................................................................',
      '......................................................................',
      '.........................................#~~#.........................',
      '.................................C...o...#~~#..^......................',
      '.........................====..###################...o...#..........#.',
      '...............................###################..===..#~~~~~~~~~~#.',
      '....................===........###################.......#~~~~~~~~~~#.',
      '...............................###################.......#~~~~~~~~~~#.',
      '..S-.....^^...........^^^......###################.......#~~~~~~E~~~#.',
      '######################################################################',
      '######################################################################',
    ],
    props: { '63,3': { period: 1.6, offset: 0.5 } },
    decor: [
      { type: 'stove', x: 8, y: 12, w: 3, h: 1 },
      { type: 'stove', x: 22, y: 12, w: 3, h: 1 },
      { type: 'glass', x: 41, y: 6, w: 4, h: 2, hideTiles: true },
      { type: 'sink', x: 57, y: 8, w: 12, h: 5, hideTiles: true },
    ],
    says: [
      { x: 14, text: 'Stand under the tap to catch drips.' },
      { x: 33, text: 'Checkpoints save your spot and refill you.' },
    ],
  },
];

// ---------------------------------------------------------------------------------------------

export default {
  id: 'kitchen', number: 1,
  title: 'The Kitchen', subtitle: 'Out of the bowl',
  mechanic: { name: 'Puddles & drips', hint: 'Puddles keep you wet — jump from one for a big splash-hop.' },
  palette: P,
  drawBackground, drawSolidTile, drawDecor, drawHazard,
  entities: { T: Tap },
  reach,
  sfx: {
    // chapter SFX receive the synth helper `a` (see js/core/audio.js "Synth helper")
    plink: (a, o) => a.tone({ freq: 1500 * (o.pitch || 1), to: 900 * (o.pitch || 1), dur: 0.12, type: 'sine', vol: 0.3 * (o.vol ?? 1), attack: 0.002 }),
    sizzle: (a, o) => a.noise({ dur: 0.35, vol: 0.18 * (o.vol ?? 1), filter: 'highpass', freq: 3000 }),
  },
  music: {
    bpm: 84, key: 'F', scale: 'major', progression: [1, 5, 6, 4], swing: 0.12, reverb: 0.4,
    pad: { wave: 'triangle', vol: 0.45, octave: 3, cutoff: 1300, attack: 1.2 },
    bass: { wave: 'sine', vol: 0.55, octave: 2, pattern: 'x.....x.' },
    arp: { wave: 'sine', vol: 0.3, octave: 4, pattern: [0, 2, 1, 2], rate: 2, decay: 0.35 },
    lead: { wave: 'triangle', vol: 0.18, octave: 5, density: 0.22, decay: 0.7 },
    drips: { vol: 0.3, density: 0.25 },
  },
  levels,
};
