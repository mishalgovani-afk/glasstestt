// Chapter 3 art: laundry-room background, floor tiles, set pieces (decor), hazards. Everything is
// procedural; static art is cached or drawn once into the level's pre-rendered layers.
import { TILE } from '../../core/constants.js';
import { grad, radial, rgba, mix, lighten, darken, roundRect, glow, contactShadow, cached, ctxScale, seeded, blit } from '../../core/draw.js';

export const P = {
  sky: '#e3eef2', wallA: '#e8f3f1', wallB: '#cfe3e6', solid: '#7f93ad', solidEdge: '#d3deea',
  water: '#8fd0f0', waterDeep: '#2f6aa8', accent: '#ffcc4d', shelf: '#c9a77a', hazard: '#ff6a3a',
};

// ---------------------------------------------------------------------------------------- background
function paintFar(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, [P.wallA, P.wallB]);
  c.fillRect(0, 0, w, h);
  // painted wall panels
  c.fillStyle = 'rgba(255,255,255,.35)';
  for (let x = 0; x < w; x += 160) c.fillRect(x, 0, 2, h);
  // wainscot: white subway tile
  const wy = 215;
  c.fillStyle = '#f5fafa'; c.fillRect(0, wy, w, h - wy);
  for (let y = wy; y < h; y += 14) {
    const off = ((y - wy) / 14) % 2 ? 14 : 0;
    c.fillStyle = 'rgba(120,150,165,.22)'; c.fillRect(0, y, w, 1);
    for (let x = -28; x < w + 28; x += 28) c.fillRect(x + off, y, 1, 14);
  }
  c.fillStyle = '#b9d0d8'; c.fillRect(0, wy - 5, w, 6);
  c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(0, wy - 5, w, 1.5);
  // ceiling pipes
  c.fillStyle = grad(c, 0, 8, 0, 24, ['#d9e0e8', '#8f9aaa']); c.fillRect(0, 10, w, 12);
  for (const x of [90, 330, 560]) { c.fillStyle = '#a7b2c0'; c.fillRect(x, 6, 12, 20); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x, 6, 12, 2); }
  // window
  const wx = 80, wy2 = 48, ww = 150, wh = 110;
  c.fillStyle = grad(c, 0, wy2, 0, wy2 + wh, ['#a7dcff', '#e5f6ff']); c.fillRect(wx, wy2, ww, wh);
  glow(c, wx + 110, wy2 + 30, 70, '#fff6c8', 0.9);
  c.fillStyle = '#9ccfa0'; c.beginPath(); c.moveTo(wx, wy2 + wh);
  for (let x = 0; x <= ww; x += 10) c.lineTo(wx + x, wy2 + wh - 18 - Math.sin(x * 0.07) * 8);
  c.lineTo(wx + ww, wy2 + wh); c.fill();
  c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.strokeRect(wx, wy2, ww, wh);
  c.lineWidth = 4; c.beginPath(); c.moveTo(wx + ww / 2, wy2); c.lineTo(wx + ww / 2, wy2 + wh); c.stroke();
  c.fillStyle = '#ffffff'; c.fillRect(wx - 10, wy2 + wh + 2, ww + 20, 7);
  c.fillStyle = 'rgba(0,0,0,.07)'; c.fillRect(wx - 10, wy2 + wh + 9, ww + 20, 4);
  // gingham curtain
  for (const side of [0, 1]) {
    const cx = side ? wx + ww - 8 : wx - 22;
    c.fillStyle = '#ffd9e4'; c.beginPath(); c.moveTo(cx, wy2 - 8); c.lineTo(cx + 30, wy2 - 8); c.quadraticCurveTo(cx + 22 + (side ? 6 : -6), wy2 + wh * 0.55, cx + 28, wy2 + wh); c.lineTo(cx + 2, wy2 + wh); c.quadraticCurveTo(cx + 8, wy2 + wh * 0.5, cx, wy2 - 8); c.fill();
    c.fillStyle = 'rgba(255,255,255,.4)'; for (let y = wy2; y < wy2 + wh; y += 10) c.fillRect(cx + 2, y, 26, 4);
  }
  // detergent shelf
  const sx = 300, sy = 128;
  c.fillStyle = '#c9a77a'; c.fillRect(sx, sy, 170, 6); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(sx, sy + 6, 170, 3);
  const cols = ['#4aa3df', '#ff8fb0', '#7fd1ae', '#ffd24d', '#b79bff'];
  for (let i = 0; i < 6; i++) {
    const bx = sx + 8 + i * 27, bh = 28 + (i % 3) * 6, col = cols[i % 5];
    c.fillStyle = grad(c, bx, 0, bx + 18, 0, [lighten(col, 0.25), col, darken(col, 0.2)]);
    roundRect(c, bx, sy - bh, 18, bh, 4); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(bx + 3, sy - bh + 10, 12, 9);
    c.fillStyle = '#2d5d8a'; c.fillRect(bx + 5, sy - bh - 5, 8, 5);
  }
  // clothesline
  c.strokeStyle = '#9aa6b4'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(430, 56); c.quadraticCurveTo(535, 90, 640, 54); c.stroke();
  const items = [['#ff8fb0', 458], ['#4aa3df', 492], ['#ffd24d', 526], ['#7fd1ae', 562], ['#b79bff', 600]];
  items.forEach(([col, x], i) => {
    const y = 56 + Math.sin(((x - 430) / 210) * Math.PI) * 24 + 2;
    c.fillStyle = col;
    if (i % 2) { c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.lineTo(x + 6, y + 30); c.lineTo(x - 6, y + 30); c.fill(); }
    else { c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x + 12, y); c.lineTo(x + 18, y + 12); c.lineTo(x + 10, y + 14); c.lineTo(x + 9, y + 36); c.lineTo(x - 9, y + 36); c.lineTo(x - 10, y + 14); c.lineTo(x - 18, y + 12); c.closePath(); c.fill(); }
    c.fillStyle = '#f2f2f2'; c.fillRect(x - 2, y - 4, 4, 8);
  });
}

function paintMid(c, w, h) {
  // soft silhouettes of machines, a hamper and a mop
  const body = '#dfe9f0', edge = '#c4d3de';
  const washer = (x, y, ww, hh) => {
    c.fillStyle = grad(c, x, 0, x + ww, 0, [lighten(body, 0.4), body, edge]); roundRect(c, x, y, ww, hh, 10); c.fill();
    c.fillStyle = edge; c.fillRect(x + 6, y + 8, ww - 12, 18);
    c.fillStyle = '#b6c8d6'; c.beginPath(); c.arc(x + ww / 2, y + hh * 0.58, ww * 0.34, 0, 7); c.fill();
    c.fillStyle = grad(c, x, y + hh * 0.3, x, y + hh * 0.9, ['#9fc3df', '#6e98bf']); c.beginPath(); c.arc(x + ww / 2, y + hh * 0.58, ww * 0.27, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(x + ww * 0.4, y + hh * 0.5, 9, 14, 0.4, 0, 7); c.fill();
  };
  washer(30, 150, 120, 220);
  washer(170, 150, 120, 220);
  c.fillStyle = '#d9c9a8'; roundRect(c, 350, 270, 80, 90, 10); c.fill();
  c.strokeStyle = 'rgba(120,90,50,.35)'; c.lineWidth = 2;
  for (let y = 280; y < 355; y += 11) { c.beginPath(); c.moveTo(352, y); c.lineTo(428, y); c.stroke(); }
  c.fillStyle = '#ff8fb0'; c.beginPath(); c.ellipse(375, 268, 22, 9, 0, 0, 7); c.fill(); c.fillStyle = '#4aa3df'; c.beginPath(); c.ellipse(405, 266, 18, 8, 0.2, 0, 7); c.fill();
  // mop + yellow bucket
  c.fillStyle = '#c9a77a'; c.fillRect(498, 150, 5, 210);
  c.fillStyle = '#e8e4da'; for (let i = 0; i < 7; i++) c.fillRect(488 + i * 5, 340, 3, 22);
  c.fillStyle = '#f5cc4d'; c.beginPath(); c.moveTo(530, 300); c.lineTo(600, 300); c.lineTo(590, 360); c.lineTo(540, 360); c.fill();
  // ironing board
  c.fillStyle = '#c7d3df'; c.beginPath(); c.ellipse(640, 250, 40, 9, 0, 0, 7); c.fill();
  c.strokeStyle = '#a9b8c7'; c.lineWidth = 4; c.beginPath(); c.moveTo(625, 256); c.lineTo(600, 360); c.moveTo(655, 256); c.lineTo(680, 360); c.stroke();
}

export function drawBackground(ctx, view, cam, time, world) {
  const s = ctxScale(ctx);
  const far = cached('l3-far', 640, 360, s, paintFar);
  const off = -((cam.x * 0.25) % 640 + 640) % 640;
  for (let x = Math.floor(off); x < view.w; x += 640) blit(ctx, far, x, -cam.y * 0.12);
  const mid = cached('l3-mid', 700, 360, s, paintMid);
  const off2 = -((cam.x * 0.5) % 700 + 700) % 700;
  ctx.save(); ctx.globalAlpha = 0.85;
  for (let x = Math.floor(off2); x < view.w; x += 700) blit(ctx, mid, x, 36 - cam.y * 0.3);
  ctx.restore();
  // lazy light shafts
  ctx.save();
  ctx.globalAlpha = 0.12 + 0.03 * Math.sin(time * 0.5);
  ctx.fillStyle = grad(ctx, 0, 0, view.w, view.h, ['#ffffff', 'rgba(255,255,255,0)']);
  const bx = 140 - ((cam.x * 0.25) % 640);
  ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 160, 0); ctx.lineTo(bx + 480, view.h); ctx.lineTo(bx + 120, view.h); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------- tiles
/** Exposed '#' tiles: concrete floor with a checker of pale tile. */
export function drawSolidTile(ctx, x, y, mask, rng, info) {
  const top = !(mask & 1), left = !(mask & 8), right = !(mask & 2), bottom = !(mask & 4);
  const floor = info.ty >= info.level.h - 2;
  ctx.fillStyle = grad(ctx, x, y, x, y + TILE, floor ? ['#8fa1b8', '#6f8199'] : ['#8798b0', '#6c7e98']);
  ctx.fillRect(x, y, TILE, TILE);
  if (floor) {
    if ((info.tx + info.ty) % 2) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x, y, TILE, TILE); }
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x, y, TILE, 1);
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + rng() * 22, y + rng() * 22, 2, 1.5);
  if (top) { ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, ['#e4ecf5', 'rgba(228,236,245,0)']); ctx.fillRect(x, y, TILE, 7); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x, y, TILE, 1.2); }
  if (bottom) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
  if (left) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, 2, TILE); }
  if (right) { ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
}

// ---------------------------------------------------------------------------------------- hazards
/** A lone hazard is a hot steam iron; a run of them is a row of dryer-vent grates. */
export function drawHazard(ctx, x, y, time, world) {
  const t = (c) => world.tileAt(Math.floor(c / TILE), Math.floor(y / TILE)) === '^';
  const run = t(x - 4) || t(x + TILE + 4);
  const p = 0.65 + 0.35 * Math.sin(time * 4 + x * 0.1);
  if (run) {
    glow(ctx, x + 12, y + 20, 22, '#ff6a2a', 0.3 * p);
    ctx.fillStyle = '#2b2f38'; ctx.fillRect(x, y + 16, TILE, 8);
    ctx.fillStyle = grad(ctx, 0, y + 16, 0, y + 24, ['#555d6b', '#3a404b']); ctx.fillRect(x + 1, y + 17, TILE - 2, 6);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = mix('#ff4a1f', '#ffd27a', p * 0.6); ctx.fillRect(x + 2 + i * 6, y + 18, 3, 4); }
    ctx.strokeStyle = `rgba(255,190,140,${0.3 * p})`; ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) { const ox = x + 6 + i * 12, tt = time * 2 + i + x; ctx.beginPath(); ctx.moveTo(ox, y + 14); ctx.bezierCurveTo(ox + 3 * Math.sin(tt), y + 9, ox - 3 * Math.sin(tt), y + 5, ox + 2 * Math.sin(tt * 1.3), y); ctx.stroke(); }
    return;
  }
  glow(ctx, x + 12, y + 18, 20, '#ff6a2a', 0.25 * p);
  // steam iron: sole plate + body + handle
  ctx.fillStyle = mix('#ff4a1f', '#ffb347', p * 0.7); roundRect(ctx, x + 1, y + 18, 22, 5, 2.5); ctx.fill();
  ctx.fillStyle = grad(ctx, x, y + 8, x, y + 19, ['#f1f4f8', '#aab4c1']);
  ctx.beginPath(); ctx.moveTo(x + 2, y + 19); ctx.quadraticCurveTo(x + 2, y + 10, x + 11, y + 9); ctx.lineTo(x + 17, y + 11); ctx.lineTo(x + 23, y + 19); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#59626f'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x + 7, y + 14); ctx.quadraticCurveTo(x + 11, y + 5, x + 19, y + 11); ctx.stroke();
  ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.arc(x + 17, y + 14, 1.6, 0, 7); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.4 * p})`; ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) { const ox = x + 6 + i * 9, tt = time * 2.2 + i; ctx.beginPath(); ctx.moveTo(ox, y + 8); ctx.bezierCurveTo(ox + 3 * Math.sin(tt), y + 4, ox - 3 * Math.sin(tt), y, ox + 2 * Math.sin(tt * 1.3), y - 4); ctx.stroke(); }
}

// ---------------------------------------------------------------------------------------- decor
const waterCells = (info, d) => {
  const out = [];
  for (let ty = d.y; ty < d.y + d.h; ty++) for (let tx = d.x; tx < d.x + d.w; tx++) if (info.level.tile[ty] && info.level.tile[ty][tx] === '~') out.push([tx, ty]);
  return out;
};
const isWaterAt = (info, tx, ty) => info.level.tile[ty] && info.level.tile[ty][tx] === '~';

/** Paint the dark inside of a vessel behind its water cells (+ optional extra cells). */
function wells(ctx, info, d, c0, c1) {
  for (const [tx, ty] of waterCells(info, d)) {
    ctx.fillStyle = grad(ctx, 0, ty * TILE, 0, ty * TILE + TILE, [c0, c1]);
    ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }
}
/** Lit rims along the boundary between a vessel's water and its walls (front layer). */
function rims(ctx, info, d, col, w = 3) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [tx, ty] of waterCells(info, d)) {
    const x = tx * TILE, y = ty * TILE;
    const solid = (a, b) => info.level.tile[b] && info.level.tile[b][a] === '#';
    if (solid(tx - 1, ty)) { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE); }
    if (solid(tx + 1, ty)) { ctx.moveTo(x + TILE, y); ctx.lineTo(x + TILE, y + TILE); }
    if (solid(tx, ty + 1)) { ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y + TILE); }
    if (solid(tx, ty - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + TILE, y); }
  }
  ctx.stroke();
}

function shell(ctx, X, Y, W, H, c0, c1, r = 8) {
  ctx.fillStyle = grad(ctx, X, Y, X + W, Y + H, [c0, c1]);
  roundRect(ctx, X, Y, W, H, r); ctx.fill();
}

export function drawDecor(ctx, d, info) {
  const X = d.x * TILE, Y = d.y * TILE, W = d.w * TILE, H = d.h * TILE;
  const back = info.layer === 'back';
  switch (d.type) {
    case 'counter': {
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.5, 6, 0.25);
        ctx.fillStyle = grad(ctx, X, Y, X, Y + H, ['#9fb6cc', '#7f98b1']); ctx.fillRect(X, Y + 8, W, H - 8);
        ctx.strokeStyle = 'rgba(40,60,90,.28)'; ctx.lineWidth = 1.5;
        for (let x = X + TILE * 3; x < X + W - 4; x += TILE * 3) { ctx.beginPath(); ctx.moveTo(x, Y + 10); ctx.lineTo(x, Y + H - 2); ctx.stroke(); }
        ctx.fillStyle = '#e7eef5';
        for (let x = X + TILE * 3; x < X + W - 4; x += TILE * 3) { ctx.beginPath(); ctx.arc(x - 8, Y + 24, 2, 0, 7); ctx.arc(x + 8, Y + 24, 2, 0, 7); ctx.fill(); }
        if (H > TILE * 2) { ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(X, Y + H - 6, W, 6); }
      } else {
        ctx.fillStyle = grad(ctx, 0, Y, 0, Y + 9, ['#ffffff', '#cdd8e3']); roundRect(ctx, X - 2, Y - 1, W + 4, 10, 4); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(X, Y + 9, W, 2);
      }
      break;
    }
    case 'tub':
    case 'bucket':
    case 'basin': {
      const bucket = d.type === 'bucket', basin = d.type === 'basin';
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.5, 6, 0.22);
        if (bucket) shell(ctx, X, Y, W, H, '#ffd95c', '#e6a92d', 6);
        else if (basin) shell(ctx, X, Y, W, H, '#c5ced8', '#8f9bab', 4);
        else shell(ctx, X, Y, W, H, '#f6f9fc', '#b9c6d3', 6);
        if (bucket) { ctx.fillStyle = 'rgba(180,110,10,.35)'; ctx.fillRect(X, Y + H * 0.45, W, 5); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(X + 5, Y + 4, 4, H - 8); }
        else { ctx.fillStyle = 'rgba(80,100,125,.18)'; ctx.fillRect(X, Y + H - 7, W, 7); }
        wells(ctx, info, d, bucket ? '#6a5320' : '#3d5d7e', bucket ? '#4a3a14' : '#244566');
      } else {
        rims(ctx, info, d, bucket ? '#fff1b0' : '#ffffff', 3);
        // rim cap on top of the wall tops that border the water
        ctx.fillStyle = bucket ? '#ffe98a' : '#ffffff';
        for (let tx = d.x; tx < d.x + d.w; tx++) {
          const t = info.level.tile[d.y] && info.level.tile[d.y][tx];
          if (t === '#' && (isWaterAt(info, tx - 1, d.y) || isWaterAt(info, tx + 1, d.y))) { roundRect(ctx, tx * TILE - 1, d.y * TILE - 2, TILE + 2, 6, 3); ctx.fill(); }
        }
        if (bucket && W >= TILE * 6) {
          ctx.strokeStyle = '#9aa3ae'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(X + 6, Y); ctx.bezierCurveTo(X + 6, Y - 22, X + W - 6, Y - 22, X + W - 6, Y); ctx.stroke();
        }
        if (d.type === 'tub' && !basin) { // faucet
          ctx.fillStyle = grad(ctx, X + W * 0.5 - 5, 0, X + W * 0.5 + 5, 0, ['#cfd6de', '#ffffff', '#8f99a6']);
          roundRect(ctx, X + W * 0.5 - 4, Y - 14, 8, 14, 2); ctx.fill();
        }
      }
      break;
    }
    case 'pipe': {
      if (back) {
        const g = grad(ctx, 0, Y, 0, Y + H, ['#d9e0e8', '#95a2b2', '#d9e0e8']);
        ctx.fillStyle = g; ctx.fillRect(X, Y, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(X, Y + 3, W, 2); ctx.fillRect(X, Y + H - 8, W, 2);
        wells(ctx, info, d, '#2c4a66', '#1c3350');
        // joint rings
        for (let x = X + TILE * 4; x < X + W - 4; x += TILE * 5) { ctx.fillStyle = '#7c8999'; ctx.fillRect(x, Y - 2, 6, H + 4); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x, Y - 2, 2, H + 4); }
      } else {
        rims(ctx, info, d, 'rgba(255,255,255,.55)', 2);
        // open end flange
        const mouthRight = !isWaterAt(info, d.x + d.w, d.y + 1) && waterCells(info, d).some(([tx]) => tx === d.x + d.w - 1);
        if (mouthRight) { ctx.fillStyle = '#c2ccd8'; roundRect(ctx, X + W - 6, Y - 3, 8, H + 6, 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(X + W - 6, Y - 3, 2, H + 6); }
      }
      break;
    }
    case 'washer': {
      const cx = d.cx * TILE, cy = d.cy * TILE, R = d.r * TILE;
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.55, 8, 0.25);
        shell(ctx, X, Y, W, H, '#fbfcfe', '#c3cfdc', 12);
        ctx.fillStyle = 'rgba(0,0,0,.05)'; ctx.fillRect(X + 4, Y + 44, W - 8, 2);
        // control panel
        ctx.fillStyle = grad(ctx, 0, Y + 6, 0, Y + 40, ['#dfe8f1', '#b7c5d4']); roundRect(ctx, X + 8, Y + 6, W - 16, 34, 6); ctx.fill();
        ctx.fillStyle = '#0f2a3c'; roundRect(ctx, X + 18, Y + 14, 54, 18, 3); ctx.fill();
        ctx.fillStyle = '#7fe0ff'; ctx.font = 'bold 10px monospace'; ctx.fillText('SPIN', X + 24, Y + 27);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = radial(ctx, X + W - 30 - i * 30, Y + 23, 1, 9, ['#ffffff', '#8c99a8']); ctx.beginPath(); ctx.arc(X + W - 30 - i * 30, Y + 23, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#ff6a3a'; ctx.fillRect(X + W - 31 - i * 30, Y + 15, 2, 7); }
        // drum ring (steel) and dark interior
        ctx.fillStyle = radial(ctx, cx - 10, cy - 10, R * 0.8, R + 28, ['#e9eef4', '#9fabb9', '#6f7c8c']);
        ctx.beginPath(); ctx.arc(cx, cy, R + 22, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(40,60,90,.35)';
        const r = seeded(11);
        for (let i = 0; i < 70; i++) { const a = r() * 6.283, rr = R + 3 + r() * 16; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5, 0, 7); ctx.fill(); }
        ctx.fillStyle = radial(ctx, cx, cy, 2, R + 1, ['#2d5a86', '#1b3a5c']);
        ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, 7); ctx.fill();
        // porthole tunnels
        for (const t of [d.door, d.door2]) {
          if (!t) continue;
          ctx.fillStyle = grad(ctx, 0, t.y * TILE, 0, (t.y + t.h) * TILE, ['#2a4668', '#16283f']);
          ctx.fillRect(t.x * TILE, t.y * TILE, t.w * TILE, t.h * TILE);
        }
      } else {
        // glass shine + chrome door frame at each porthole
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI * 1.05, Math.PI * 1.4); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, R - 6, Math.PI * 0.05, Math.PI * 0.2); ctx.stroke();
        ctx.strokeStyle = '#dfe7ef'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(70,90,120,.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R + 7, 0, 7); ctx.stroke();
        for (const t of [d.door, d.door2]) {
          if (!t) continue;
          const tx = t.x * TILE, ty = t.y * TILE, tw = t.w * TILE, th = t.h * TILE;
          ctx.strokeStyle = '#e8eef5'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(tx, ty - 1); ctx.lineTo(tx + tw, ty - 1); ctx.moveTo(tx, ty + th + 1); ctx.lineTo(tx + tw, ty + th + 1); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(tx, ty, tw, 4);
        }
        rims(ctx, info, d, 'rgba(255,255,255,.35)', 2);
      }
      break;
    }
    case 'line': {
      if (!back) break;
      ctx.strokeStyle = '#8d97a6'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X, Y + 6); ctx.quadraticCurveTo(X + W / 2, Y + 20, X + W, Y + 6); ctx.stroke();
      ctx.fillStyle = '#8d97a6'; ctx.fillRect(X - 3, Y - 2, 5, 16); ctx.fillRect(X + W - 2, Y - 2, 5, 16);
      break;
    }
    case 'board': {
      if (!back) break;
      ctx.fillStyle = '#aab6c4'; ctx.fillRect(X + 6, Y + 18, 3, 6); ctx.fillRect(X + W - 9, Y + 18, 3, 6);
      ctx.fillStyle = grad(ctx, 0, Y + 14, 0, Y + 20, ['#fff7e0', '#e1d2a8']); roundRect(ctx, X, Y + 14, W, 6, 3); ctx.fill();
      break;
    }
    case 'hamper': {
      if (!back) break;
      ctx.fillStyle = '#e0c892'; roundRect(ctx, X + 2, Y + 4, W - 4, H - 4, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(130,90,40,.4)'; ctx.lineWidth = 1.5;
      for (let y = Y + 10; y < Y + H - 2; y += 8) { ctx.beginPath(); ctx.moveTo(X + 3, y); ctx.lineTo(X + W - 3, y); ctx.stroke(); }
      ctx.fillStyle = '#ff8fb0'; ctx.beginPath(); ctx.ellipse(X + W * 0.35, Y + 4, 10, 5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4aa3df'; ctx.beginPath(); ctx.ellipse(X + W * 0.68, Y + 3, 9, 5, 0.3, 0, 7); ctx.fill();
      break;
    }
    default: break;
  }
}
