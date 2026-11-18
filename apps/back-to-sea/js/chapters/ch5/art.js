// Chapter 5 art: a rain-soaked garage at night. Cinder-block walls, wet concrete, metal shelving,
// a swinging bulb, lightning through a high window. Static layers are cached; per-frame work is
// a few gradients plus a bounded number of rain streaks.

import { TILE } from '../../core/constants.js';
import { grad, radial, roundRect, rgba, mix, darken, lighten, glow, cached, ctxScale, seeded, contactShadow, blit } from '../../core/draw.js';

export const P = {
  sky: '#1a2433', wallA: '#3b4758', wallB: '#202938', solid: '#5d646e', solidEdge: '#9aa4ae',
  water: '#5fb7d1', waterDeep: '#143c58', accent: '#ffc861', shelf: '#7b8794', hazard: '#c9f2ff',
};

/** 0..1 lightning brightness at time t (deterministic: a double flicker every ~13 s). */
export function lightning(t, extra = 0) {
  const period = 13.3, ph = ((t + 4) % period);
  let f = 0;
  if (ph < 0.09) f = 1 - ph / 0.09;
  else if (ph > 0.18 && ph < 0.36) f = 0.7 * (1 - (ph - 0.18) / 0.18);
  return Math.max(f, extra);
}

// ------------------------------------------------------------------------------ background
function paintFar(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, ['#1c2533', '#2b3646', '#222b39']);
  c.fillRect(0, 0, w, h);
  // cinder blocks
  const r = seeded(51);
  for (let y = 0, row = 0; y < h; y += 24, row++) {
    const off = row % 2 ? 24 : 0;
    for (let x = -48; x < w + 48; x += 48) {
      const v = r() * 0.08;
      c.fillStyle = mix('#36414f', '#46525f', v * 6);
      c.fillRect(x + off + 1, y + 1, 46, 22);
      c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(x + off + 1, y + 1, 46, 2);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + off + 1, y + 20, 46, 3);
    }
  }
  // damp streaks running down from the roof
  for (let i = 0; i < 14; i++) {
    const x = r() * w, len = 60 + r() * 200, wd = 6 + r() * 18;
    c.fillStyle = grad(c, 0, 0, 0, len, ['rgba(10,16,26,.45)', 'rgba(10,16,26,0)']);
    c.fillRect(x, 0, wd, len);
  }
  // pegboard with tool silhouettes
  const px = 50, py = 70, pw = 220, ph = 130;
  c.fillStyle = '#6b5a45'; roundRect(c, px, py, pw, ph, 4); c.fill();
  c.fillStyle = 'rgba(0,0,0,.35)';
  for (let y = py + 8; y < py + ph - 4; y += 12) for (let x = px + 8; x < px + pw - 4; x += 12) { c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
  c.fillStyle = '#2a2f37';
  // hammer
  c.fillRect(px + 28, py + 26, 6, 64); roundRect(c, px + 16, py + 18, 30, 12, 3); c.fill();
  // wrench
  c.save(); c.translate(px + 80, py + 60); c.rotate(0.15); roundRect(c, -4, -38, 8, 76, 4); c.fill();
  c.beginPath(); c.arc(0, -40, 10, 0, 7); c.fill(); c.fillStyle = '#6b5a45'; c.fillRect(-3, -52, 6, 12); c.restore();
  c.fillStyle = '#2a2f37';
  // saw
  c.beginPath(); c.moveTo(px + 120, py + 30); c.lineTo(px + 200, py + 40); c.lineTo(px + 200, py + 60); c.lineTo(px + 120, py + 50); c.fill();
  roundRect(c, px + 104, py + 26, 22, 30, 6); c.fill();
  // coiled rope / hose
  c.strokeStyle = '#2a2f37'; c.lineWidth = 4;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(px + 160, py + 98, 24 - i * 2, 16 - i * 2, 0, 0, 7); c.stroke(); }
  // high window frame (glass painted live, so lightning can light it)
  c.fillStyle = '#141b26'; c.fillRect(392, 36, 156, 92);
  c.strokeStyle = '#59636f'; c.lineWidth = 6; c.strokeRect(392, 36, 156, 92);
  c.lineWidth = 3; c.beginPath(); c.moveTo(470, 36); c.lineTo(470, 128); c.stroke();
  c.fillStyle = '#4b5562'; c.fillRect(384, 130, 172, 6);
}

function paintMid(c, w, h) {
  // dark metal shelving with paint cans, boxes and a hung bicycle wheel
  const r = seeded(77);
  c.fillStyle = '#171e29';
  const sx = 70;
  c.fillRect(sx, 60, 5, h); c.fillRect(sx + 180, 60, 5, h);
  for (let y = 100; y < h; y += 70) {
    c.fillStyle = '#1d2531'; c.fillRect(sx, y, 185, 6);
    for (let x = sx + 10; x < sx + 170;) {
      const bw = 18 + r() * 34, bh = 16 + r() * 34;
      c.fillStyle = r() > 0.5 ? '#1a222d' : '#212a36';
      if (r() > 0.45) { roundRect(c, x, y - bh, bw, bh, 2); c.fill(); }
      else { c.beginPath(); c.ellipse(x + bw / 2, y - 2, bw / 2, 4, 0, 0, 7); c.fill(); c.fillRect(x, y - bh, bw, bh - 2); }
      x += bw + 4 + r() * 8;
    }
  }
  // bicycle wheel on a hook
  c.strokeStyle = '#1b222d'; c.lineWidth = 5;
  c.beginPath(); c.arc(470, 150, 58, 0, 7); c.stroke();
  c.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.beginPath(); c.moveTo(470, 150); c.lineTo(470 + Math.cos(a) * 56, 150 + Math.sin(a) * 56); c.stroke(); }
  c.lineWidth = 3; c.beginPath(); c.moveTo(470, 92); c.lineTo(470, 60); c.stroke();
  // stacked tires
  for (let i = 0; i < 3; i++) {
    c.fillStyle = '#12171f';
    c.beginPath(); c.ellipse(640, h - 30 - i * 34, 52, 18, 0, 0, 7); c.fill();
    c.fillStyle = '#1c232e'; c.beginPath(); c.ellipse(640, h - 34 - i * 34, 24, 7, 0, 0, 7); c.fill();
  }
  // fade to floor
  c.fillStyle = grad(c, 0, h - 80, 0, h, ['rgba(20,26,36,0)', 'rgba(20,26,36,.7)']);
  c.fillRect(0, h - 80, w, 80);
}

export function drawBackground(ctx, view, cam, time, world) {
  const s = ctxScale(ctx);
  const L = lightning(time, (world && world.vars.flash) || 0);
  const far = cached('g5-far', 640, 360, s, paintFar);
  const fx = cam.x * 0.25, off = -((fx % 640) + 640) % 640;
  for (let x = Math.floor(off); x < view.w; x += 640) {
    blit(ctx, far, x, -cam.y * 0.1);
    // window glass: night sky with rain, lit by lightning
    const gx = x + 395, gy = 39 - cam.y * 0.1;
    ctx.fillStyle = grad(ctx, 0, gy, 0, gy + 86, [mix('#14223a', '#dfe9ff', L), mix('#22344d', '#a9bde0', L * 0.8)]);
    ctx.fillRect(gx, gy, 72, 86); ctx.fillRect(gx + 78, gy, 72, 86);
    ctx.strokeStyle = rgba('#9fb6d4', 0.35); ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const rx = gx + ((i * 37 + time * 40) % 150), ry = gy + ((i * 53 + time * 170) % 86);
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 9); ctx.stroke();
    }
    if (L > 0.05) glow(ctx, gx + 75, gy + 60, 180, '#cfe0ff', 0.35 * L);
  }
  const mid = cached('g5-mid', 760, 360, s, paintMid);
  const mx = cam.x * 0.5, off2 = -((mx % 760) + 760) % 760;
  for (let x = Math.floor(off2); x < view.w; x += 760) blit(ctx, mid, x, 10 - cam.y * 0.3);
  // swinging bulb (world-anchored every 26 tiles) with a warm light cone
  if (world) {
    for (let bx = 13 * TILE; bx < world.level.pxW; bx += 26 * TILE) {
      const sw = Math.sin(time * 0.9 + bx) * 0.08;
      const ax = bx - cam.x, ay = 24 - cam.y;
      const lx = ax + Math.sin(sw) * 70, ly = ay + Math.cos(sw) * 70;
      ctx.strokeStyle = '#11161e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lx, ly); ctx.stroke();
      const flick = 0.85 + 0.15 * Math.sin(time * 23 + bx) * Math.sin(time * 7.1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 * flick;
      ctx.fillStyle = grad(ctx, 0, ly, 0, view.h, ['#ffd98a', 'rgba(255,217,138,0)']);
      ctx.beginPath(); ctx.moveTo(lx - 6, ly + 4); ctx.lineTo(lx + 6, ly + 4); ctx.lineTo(lx + 150 + sw * 300, view.h); ctx.lineTo(lx - 150 + sw * 300, view.h); ctx.fill();
      ctx.restore();
      glow(ctx, lx, ly + 6, 60, '#ffcf7a', 0.5 * flick);
      ctx.fillStyle = '#2a2f37'; ctx.fillRect(lx - 4, ly - 4, 8, 6);
      ctx.fillStyle = mix('#ffe7b0', '#ffffff', 0.4 * flick); ctx.beginPath(); ctx.arc(lx, ly + 6, 6, 0, 7); ctx.fill();
    }
  }
}

/** Rain through the leaky roof, plus the lightning wash. Screen space, bounded count. */
export function drawForeground(ctx, view, cam, time, world) {
  ctx.strokeStyle = 'rgba(180,210,240,.16)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 46; i++) {
    const sp = 380 + (i % 5) * 60;
    const x = ((i * 173.3 - cam.x * 1.1 + time * 40) % (view.w + 40) + view.w + 40) % (view.w + 40) - 20;
    const y = ((i * 97.7 + time * sp - cam.y) % (view.h + 30) + view.h + 30) % (view.h + 30) - 15;
    ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12);
  }
  ctx.stroke();
  const L = lightning(time, (world && world.vars.flash) || 0);
  if (L > 0.02) { ctx.fillStyle = rgba('#dfe8ff', 0.16 * L); ctx.fillRect(0, 0, view.w, view.h); }
}

// ------------------------------------------------------------------------------ tiles
export function drawSolidTile(ctx, x, y, mask, rng, info) {
  const top = !(mask & 1), left = !(mask & 8), right = !(mask & 2), bottom = !(mask & 4);
  const { tx, ty, level } = info;
  const W = level.w;
  const isWall = tx === 0 || tx === W - 1;
  if (ty === 0) {
    // roof rafter
    ctx.fillStyle = grad(ctx, 0, y, 0, y + TILE, ['#2a2219', '#3c3125']);
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + TILE - 4, TILE, 4);
    if (tx % 5 === 0) { ctx.fillStyle = '#1d1711'; ctx.fillRect(x, y, 4, TILE); }
    return;
  }
  if (isWall) {
    ctx.fillStyle = '#323c49'; ctx.fillRect(x, y, TILE, TILE);
    const off = ty % 2 ? 12 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, TILE, 1.5); ctx.fillRect(x + off, y, 1.5, TILE);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(x + off + 2, y + 2, 9, 2);
    if (tx === 0) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + TILE - 3, y, 3, TILE); }
    else { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, 2, TILE); }
    return;
  }
  // concrete
  ctx.fillStyle = grad(ctx, 0, y, 0, y + TILE, top ? ['#6a717b', '#565d67'] : ['#545b65', '#4a5059']);
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + rng() * 22, y + rng() * 22, 1.5, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + rng() * 22, y + rng() * 22, 2, 1.5);
  if (tx % 6 === 0) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, y, 1.5, TILE); }
  if (rng() < 0.12) { ctx.strokeStyle = 'rgba(20,24,30,.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + 10, y + 11); ctx.lineTo(x + 8, y + 18); ctx.stroke(); }
  if (top) {
    // wet sheen: a glossy band reflecting the bulb
    ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, ['#9fb0c0', 'rgba(110,125,140,0)']);
    ctx.fillRect(x, y, TILE, 7);
    ctx.fillStyle = 'rgba(220,235,255,.5)'; ctx.fillRect(x, y, TILE, 1.2);
    if (rng() < 0.5) { ctx.fillStyle = 'rgba(190,215,240,.35)'; ctx.fillRect(x + rng() * 16, y + 2, 4 + rng() * 6, 1); }
  }
  if (left && !top) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, y, 2, TILE); }
  if (left && top) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, y + 2, 2, TILE - 2); }
  if (right) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
  if (bottom) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
}

export function drawOneWayTile(ctx, x, y, leftIsShelf, rightIsShelf) {
  // perforated steel shelf with brackets
  ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, ['#b9c3cc', '#6f7a85']);
  ctx.fillRect(x, y, TILE, 6);
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x, y, TILE, 1);
  ctx.fillStyle = 'rgba(20,26,34,.55)';
  for (let i = 4; i < TILE; i += 8) ctx.fillRect(x + i, y + 2.5, 3, 1.6);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + 6, TILE, 2);
  if (!leftIsShelf || !rightIsShelf) {
    const bx = !leftIsShelf ? x + 3 : x + TILE - 6;
    ctx.fillStyle = '#5f6a75';
    ctx.beginPath(); ctx.moveTo(bx, y + 6); ctx.lineTo(bx + 3, y + 6); ctx.lineTo(bx + 3, y + 20); ctx.closePath(); ctx.fill();
  }
}

export function drawHazard(ctx, x, y, time) {
  // broken glass shards from a smashed jar, glinting
  const shards = [[4, 24, 7, 13, -0.2], [11, 24, 5, 18, 0.15], [16, 24, 6, 11, 0.4], [20, 24, 3, 8, -0.3]];
  for (const [sx, sy, w, h, a] of shards) {
    ctx.save(); ctx.translate(x + sx, y + sy); ctx.rotate(a);
    ctx.fillStyle = 'rgba(190,235,250,.55)';
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(0, -h); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }
  const g = 0.5 + 0.5 * Math.sin(time * 3 + x * 0.37);
  if (g > 0.85) { ctx.fillStyle = `rgba(255,255,255,${(g - 0.85) * 6})`; ctx.fillRect(x + 10, y + 9, 1.5, 6); ctx.fillRect(x + 8, y + 11, 6, 1.5); }
}

// ------------------------------------------------------------------------------ decor
export function drawDecor(ctx, d, info) {
  const X = d.x * TILE, Y = d.y * TILE, W = d.w * TILE, H = d.h * TILE;
  const back = info.layer === 'back';
  switch (d.type) {
    case 'tub': {
      // an old oil-drip pan / plastic tub full of rainwater
      if (back) { contactShadow(ctx, X + W / 2, Y + H, W * 0.6, 6, 0.3); return; }
      ctx.strokeStyle = '#2f6b52'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(X + 2, Y + 4); ctx.lineTo(X + 5, Y + H); ctx.lineTo(X + W - 5, Y + H); ctx.lineTo(X + W - 2, Y + 4); ctx.stroke();
      ctx.fillStyle = '#3f8a6b'; roundRect(ctx, X - 2, Y, W + 4, 6, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(X, Y + 1, W, 1.5);
      return;
    }
    case 'boxes': {
      if (!back) return;
      const r = seeded(d.x * 7 + 3);
      for (let i = 0; i < d.w; i++) {
        const bx = X + i * TILE, c = mix('#a9814f', '#8d6a3f', r());
        ctx.fillStyle = grad(ctx, bx, 0, bx + TILE, 0, [lighten(c, 0.1), c, darken(c, 0.15)]);
        ctx.fillRect(bx + 1, Y, TILE - 2, H);
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(bx + 1, Y + TILE - 1, TILE - 2, 2);
        ctx.fillStyle = 'rgba(230,210,170,.5)'; ctx.fillRect(bx + 9, Y, 5, H);
        ctx.fillStyle = 'rgba(40,60,90,.35)'; ctx.fillRect(bx + 1, Y + 2, TILE - 2, 3); // soaked top
      }
      return;
    }
    case 'crate': case 'toolbox': {
      if (!back) return;
      const red = d.type === 'toolbox';
      ctx.fillStyle = red ? grad(ctx, 0, Y, 0, Y + H, ['#c2463b', '#8e2a24']) : grad(ctx, 0, Y, 0, Y + H, ['#7d6b55', '#5c4d3c']);
      roundRect(ctx, X, Y, W, H + 2, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(X + 2, Y + 1, W - 4, 2);
      if (red) {
        for (let i = 1; i < d.h; i++) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(X + 3, Y + i * TILE - 1, W - 6, 2); }
        ctx.fillStyle = '#d8dde2'; for (let i = 0; i < d.h; i++) roundRect(ctx, X + W / 2 - 10, Y + i * TILE + 9, 20, 4, 2), ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(30,20,10,.45)'; ctx.lineWidth = 2;
        for (let i = 1; i < d.h; i++) { ctx.beginPath(); ctx.moveTo(X, Y + i * TILE); ctx.lineTo(X + W, Y + i * TILE); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(X + 6, Y + 6); ctx.lineTo(X + W - 6, Y + H - 4); ctx.moveTo(X + W - 6, Y + 6); ctx.lineTo(X + 6, Y + H - 4); ctx.stroke();
        ctx.fillStyle = 'rgba(230,220,200,.5)'; ctx.font = '700 11px sans-serif'; ctx.fillText('FRAGILE', X + W / 2 - 24, Y + 18);
      }
      return;
    }
    case 'gutter': {
      // the floor trench / drain channel the rain runs along
      if (back) return;
      ctx.fillStyle = '#3a414b'; ctx.fillRect(X - 3, Y + TILE - 3, 3, TILE + 3); ctx.fillRect(X + W, Y + TILE - 3, 3, TILE + 3);
      ctx.fillStyle = 'rgba(200,215,230,.55)'; ctx.fillRect(X - 3, Y + TILE - 3, 3, 1); ctx.fillRect(X + W, Y + TILE - 3, 3, 1);
      return;
    }
    case 'shelving': {
      if (!back) return;
      // the dark gap under a tall shelving unit where something lurks
      ctx.fillStyle = 'rgba(8,10,16,.55)'; ctx.fillRect(X, Y, W, H);
      ctx.fillStyle = '#2b333f';
      ctx.fillRect(X, Y, 5, H); ctx.fillRect(X + W - 5, Y, 5, H);
      for (let yy = Y; yy < Y + H; yy += 46) { ctx.fillStyle = '#39424f'; ctx.fillRect(X, yy, W, 5); }
      const r = seeded(9);
      for (let yy = Y + 46; yy < Y + H; yy += 46) for (let xx = X + 8; xx < X + W - 30; xx += 28 + r() * 14) {
        ctx.fillStyle = ['#4f3d2c', '#3d4a5a', '#5a4a3a'][Math.floor(r() * 3)];
        roundRect(ctx, xx, yy - 18 - r() * 12, 20 + r() * 8, 30, 2); ctx.fill();
      }
      return;
    }
    case 'bench': {
      if (back) {
        // workbench: thick wooden top, drawers, a vise on the end
        ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#7a5636', '#5b3e26']);
        ctx.fillRect(X + 4, Y + 10, W - 8, H - 10);
        for (let i = 0; i < 3; i++) {
          const dx = X + 10 + i * ((W - 20) / 3), dw = (W - 20) / 3 - 4;
          ctx.fillStyle = grad(ctx, 0, Y + 16, 0, Y + 40, ['#8c6743', '#6e4d30']);
          roundRect(ctx, dx, Y + 16, dw, 22, 2); ctx.fill();
          ctx.fillStyle = '#c9ced4'; roundRect(ctx, dx + dw / 2 - 7, Y + 25, 14, 3, 1.5); ctx.fill();
        }
        ctx.fillStyle = '#3d2a1a'; ctx.fillRect(X + 6, Y + 44, W - 12, H - 44);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(X + 6, Y + 44, W - 12, 3);
      } else {
        ctx.fillStyle = grad(ctx, 0, Y, 0, Y + 12, ['#b48556', '#8a6038']);
        roundRect(ctx, X - 2, Y, W + 4, 11, 2); ctx.fill();
        ctx.fillStyle = 'rgba(190,220,255,.35)'; ctx.fillRect(X, Y + 1, W, 1.5);
        ctx.strokeStyle = 'rgba(60,35,15,.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X + 10, Y + 5); ctx.lineTo(X + W - 30, Y + 6); ctx.stroke();
      }
      return;
    }
    case 'pipes': {
      if (!back) return;
      // the water main coming down the wall to the high valve
      ctx.fillStyle = grad(ctx, X + W / 2 - 7, 0, X + W / 2 + 7, 0, ['#6e5a3f', '#c7a46a', '#6e5a3f']);
      ctx.fillRect(X + W / 2 - 7, Y, 14, H);
      ctx.fillStyle = '#5b4a33';
      for (let yy = Y + 30; yy < Y + H; yy += 50) roundRect(ctx, X + W / 2 - 10, yy, 20, 7, 2), ctx.fill();
      ctx.fillStyle = grad(ctx, 0, Y + 20, 0, Y + 34, ['#7c8792', '#c5ccd3', '#6f7a85']);
      ctx.fillRect(X, Y + 20, W, 12);
      return;
    }
    case 'spigot': {
      if (!back) return;
      // outdoor hose bib on the wall with the green hose coiled on the floor
      ctx.fillStyle = grad(ctx, X + 26, 0, X + 38, 0, ['#6e5a3f', '#c7a46a', '#6e5a3f']);
      ctx.fillRect(X + 28, Y, 10, H - 18);
      ctx.strokeStyle = '#3f8f4f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(X + 33, Y + H - 14);
      ctx.bezierCurveTo(X + 60, Y + H - 4, X + 70, Y + H - 2, X + 90, Y + H - 3);
      ctx.stroke(); ctx.lineCap = 'butt';
      return;
    }
    case 'catflap': {
      // the side door with Smudge's cat flap (front layer: the cat vanishes behind it)
      if (back) return;
      ctx.fillStyle = grad(ctx, X, 0, X + W, 0, ['#5a4634', '#4a3a2c']); ctx.fillRect(X, Y, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(X, Y, 3, H);
      ctx.fillStyle = '#0c0f14'; roundRect(ctx, X + 3, Y + H - 50, W - 5, 44, 5); ctx.fill();
      ctx.fillStyle = 'rgba(150,170,190,.3)'; roundRect(ctx, X + 4, Y + H - 49, W - 7, 40, 4); ctx.fill();
      ctx.strokeStyle = '#8d97a3'; ctx.lineWidth = 2; roundRect(ctx, X + 3, Y + H - 50, W - 5, 44, 5); ctx.stroke();
      ctx.fillStyle = '#c9a46a'; ctx.beginPath(); ctx.arc(X + 8, Y + H - 70, 2.5, 0, 7); ctx.fill();
    }
  }
}
