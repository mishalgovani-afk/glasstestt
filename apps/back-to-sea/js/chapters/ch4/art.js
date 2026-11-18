// Chapter 4 art: dim basement (brick + concrete, copper pipes, boiler), all procedural.
// Static layers are cached; the only per-frame cost is the half-resolution darkness mask.
import { TILE } from '../../core/constants.js';
import { Checkpoint } from '../../core/builtins.js';
import {
  grad, radial, rgba, mix, lighten, darken, roundRect, glow, cached, ctxScale, seeded, blit, makeCanvas,
} from '../../core/draw.js';

export const P = {
  sky: '#1a1f2b', wallA: '#2b3344', wallB: '#141822', solid: '#505a6c', solidEdge: '#8d98ab',
  water: '#4fa8bc', waterDeep: '#103646', accent: '#ffb347', shelf: '#7a5f43', hazard: '#ff6a2a',
};
const COPPER = '#b8683a';

// ------------------------------------------------------------------------------- background
function paintFar(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, ['#242c3c', '#141823']);
  c.fillRect(0, 0, w, h);
  const r = seeded(11);
  // brick courses
  for (let y = 0; y < h; y += 15) {
    const off = (y / 15) % 2 ? 0 : 16;
    for (let x = -32 + off; x < w; x += 32) {
      const t = r();
      c.fillStyle = `rgba(${50 + t * 30 | 0},${48 + t * 22 | 0},${58 + t * 26 | 0},${0.35 + t * 0.2})`;
      c.fillRect(x + 1, y + 1, 30, 13);
    }
  }
  c.fillStyle = 'rgba(0,0,0,.28)';
  for (let y = 0; y < h; y += 15) c.fillRect(0, y, w, 1);
  // a small high window with a cold shaft of light
  const wx = 330, wy = 40;
  c.fillStyle = '#0b1018'; c.fillRect(wx - 4, wy - 4, 64, 36);
  c.fillStyle = grad(c, 0, wy, 0, wy + 28, ['#5d7f95', '#2c4458']); c.fillRect(wx, wy, 56, 28);
  c.strokeStyle = '#10151d'; c.lineWidth = 3; c.beginPath(); c.moveTo(wx + 28, wy); c.lineTo(wx + 28, wy + 28); c.moveTo(wx, wy + 14); c.lineTo(wx + 56, wy + 14); c.stroke();
  c.save(); c.globalAlpha = 0.1; c.fillStyle = '#bfe6ff';
  c.beginPath(); c.moveTo(wx, wy + 28); c.lineTo(wx + 56, wy + 28); c.lineTo(wx + 150, h); c.lineTo(wx + 40, h); c.fill(); c.restore();
  // damp stains
  for (let i = 0; i < 6; i++) { const x = r() * w; glow(c, x, h - 20 - r() * 40, 50 + r() * 40, '#0a1016', 0.5); }
  // cobweb in the corner
  web(c, 0, 0, 1, 1, 46);
}

function web(c, x, y, sx, sy, s) {
  c.save(); c.translate(x, y); c.scale(sx, sy);
  c.strokeStyle = 'rgba(220,230,240,.28)'; c.lineWidth = 0.8;
  const n = 5;
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * s, Math.sin(a) * s); c.stroke(); }
  for (let k = 1; k <= 4; k++) {
    const rr = (k / 4) * s * 0.95;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI / 2, rad = rr * (i % 2 ? 0.86 : 1);
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      if (i) c.quadraticCurveTo(Math.cos(a - Math.PI / 4 / n * 2) * rr * 0.8, Math.sin(a - Math.PI / 4 / n * 2) * rr * 0.8, px, py); else c.moveTo(px, py);
    }
    c.stroke();
  }
  c.restore();
}

function paintMid(c, w, h) {
  // iron beams, a hanging pipe run with a gauge, a coil of hose
  c.fillStyle = '#10141c';
  for (const x of [60, 300, 520]) { c.fillRect(x, 0, 14, h); c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(x, 0, 2, h); c.fillStyle = '#10141c'; }
  c.fillRect(0, 36, w, 12);
  c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, 36, w, 2);
  // copper run
  c.fillStyle = grad(c, 0, 92, 0, 104, [darken(COPPER, 0.5), darken(COPPER, 0.2), darken(COPPER, 0.6)]);
  c.fillRect(0, 92, w, 12);
  c.fillStyle = darken(COPPER, 0.65);
  for (let x = 40; x < w; x += 110) c.fillRect(x, 90, 6, 16);
  // gauge on the run
  const gx = 200, gy = 140;
  c.fillStyle = darken(COPPER, 0.4); c.fillRect(gx - 2, 104, 4, 22);
  c.fillStyle = '#12151b'; c.beginPath(); c.arc(gx, gy, 14, 0, 7); c.fill();
  c.strokeStyle = '#8a6a38'; c.lineWidth = 2.5; c.stroke();
  c.fillStyle = '#b9b39f'; c.beginPath(); c.arc(gx, gy, 10.5, 0, 7); c.fill();
  c.strokeStyle = '#a53a2a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 6, gy - 5); c.stroke();
  // electrical box
  c.fillStyle = '#1a2029'; roundRect(c, 400, 120, 40, 52, 3); c.fill();
  c.fillStyle = '#0d1016'; c.fillRect(406, 128, 28, 14);
  for (let i = 0; i < 3; i++) { c.fillStyle = ['#3b8a5a', '#8a3b3b', '#8a7a3b'][i]; c.beginPath(); c.arc(410 + i * 9, 154, 2.2, 0, 7); c.fill(); }
}

export function drawBackground(ctx, view, cam, time, world) {
  const s = ctxScale(ctx);
  const far = cached('b-far', 480, 360, s, paintFar);
  const off = -((cam.x * 0.25) % 480 + 480) % 480;
  for (let x = Math.floor(off); x < view.w; x += 480) blit(ctx, far, x, -cam.y * 0.12);
  const mid = cached('b-mid', 560, 360, s, paintMid);
  const off2 = -((cam.x * 0.5) % 560 + 560) % 560;
  for (let x = Math.floor(off2); x < view.w; x += 560) blit(ctx, mid, x, 14 - cam.y * 0.25);
}

// ------------------------------------------------------------------------------------ tiles
/** Concrete block wall with a lamp-lit lip on exposed tops. */
export function drawSolidTile(ctx, x, y, mask, rng, info) {
  const up = mask & 1, right = mask & 2, down = mask & 4, left = mask & 8;
  const t = rng();
  ctx.fillStyle = grad(ctx, x, y, x, y + TILE, [mix('#4a5366', '#3c4456', t * 0.6), mix('#394152', '#2e3543', t * 0.5)]);
  ctx.fillRect(x, y, TILE, TILE);
  // cinder blocks: 24x12 courses, offset every other row
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.fillRect(x, y + 11, TILE, 1.5);
  ctx.fillRect(x, y + 23, TILE, 1);
  const off = ((info.ty * 2) % 2) ? 12 : 0;
  ctx.fillRect(x + off, y, 1.2, 11);
  ctx.fillRect(x + ((off + 12) % 24), y + 12, 1.2, 11);
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  ctx.fillRect(x, y + 1, TILE, 1); ctx.fillRect(x, y + 12.5, TILE, 1);
  // speckle
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + rng() * 22, y + rng() * 22, 1.5, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + rng() * 22, y + rng() * 22, 1.5, 1);
  if (!up) {
    ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, ['rgba(190,205,225,.55)', 'rgba(190,205,225,0)']);
    ctx.fillRect(x, y, TILE, 7);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x, y, TILE, 1);
    if (rng() < 0.2) { ctx.fillStyle = 'rgba(70,120,80,.45)'; ctx.fillRect(x + rng() * 16, y, 5 + rng() * 4, 2); } // moss
  }
  if (!down) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
  if (!left) { ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x, y, 1.5, TILE); }
  if (!right) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
}

/** Wooden storage shelf with iron brackets. */
export function drawOneWayTile(ctx, x, y, l, r) {
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + 7, TILE, 4);
  ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, ['#a98a63', '#7a5f43', '#4c3a28']);
  roundRect(ctx, x - (l ? 1 : 0), y, TILE + (l ? 1 : 0) + (r ? 1 : 0), 7, l && r ? 0 : 1.5); ctx.fill();
  ctx.strokeStyle = 'rgba(30,18,8,.4)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x + 2, y + 3.5); ctx.lineTo(x + 20, y + 3.5); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x, y, TILE, 1);
  ctx.fillStyle = '#262b34';
  for (const [edge, bx] of [[!l, x + 3], [!r, x + TILE - 7]]) {
    if (!edge) continue;
    ctx.beginPath(); ctx.moveTo(bx, y + 7); ctx.lineTo(bx + 4, y + 7); ctx.lineTo(bx, y + 17); ctx.closePath(); ctx.fill();
  }
}

// ------------------------------------------------------------------------------------ hazard
/** Scalding steam pipe lying on the floor. */
export function drawHazard(ctx, x, y, time) {
  const p = 0.65 + 0.35 * Math.sin(time * 4 + x * 0.1);
  glow(ctx, x + 12, y + 17, 26, '#ff6a2a', 0.35 * p);
  ctx.fillStyle = grad(ctx, 0, y + 10, 0, y + 24, ['#8a4a34', '#c4623a', '#5a2a1c']);
  roundRect(ctx, x - 0.5, y + 10, TILE + 1, 14, 5); ctx.fill();
  ctx.fillStyle = mix('#ff5a2a', '#ffd27a', 0.5 * p); ctx.fillRect(x + 2, y + 13, TILE - 4, 2);
  ctx.fillStyle = '#2a1812'; ctx.fillRect(x + 11, y + 9, 3, 15);
  ctx.strokeStyle = `rgba(255,170,110,${0.3 * p})`; ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const ox = x + 7 + i * 10, t = time * 2 + i + x;
    ctx.beginPath(); ctx.moveTo(ox, y + 8);
    ctx.bezierCurveTo(ox + 3 * Math.sin(t), y + 3, ox - 3 * Math.sin(t), y - 2, ox + 2 * Math.sin(t * 1.3), y - 7); ctx.stroke();
  }
}

// -------------------------------------------------------------------------------------- decor
export function drawDecor(ctx, d, info) {
  const X = d.x * TILE, Y = d.y * TILE, W = d.w * TILE, H = d.h * TILE;
  const back = info.layer === 'back';
  if (d.type === 'boiler') {
    if (!back) return;
    ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#6b5d56', '#43383a', '#2a2326']);
    roundRect(ctx, X, Y + 6, W, H - 6, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2;
    for (let i = 1; i < d.w; i++) { ctx.beginPath(); ctx.moveTo(X + i * TILE, Y + 8); ctx.lineTo(X + i * TILE, Y + H - 2); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, X + 6, Y + 9, W - 12, 4, 2); ctx.fill();
    // chimney collar
    ctx.fillStyle = '#2b2528'; ctx.fillRect(X + W - 26, Y - 4, 14, 12);
    // glowing fire window
    const wx = X + W / 2 - 14, wy = Y + H / 2 - 4;
    ctx.fillStyle = '#120a08'; roundRect(ctx, wx - 3, wy - 3, 34, 24, 5); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, wy, 0, wy + 18, ['#ffdf8a', '#ff8a3a', '#c4361c']);
    roundRect(ctx, wx, wy, 28, 18, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,200,.55)'; ctx.beginPath(); ctx.ellipse(wx + 14, wy + 14, 8, 4, 0, 0, 7); ctx.fill();
    // dial
    ctx.fillStyle = '#14100f'; ctx.beginPath(); ctx.arc(X + 14, Y + 20, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#d6d0b8'; ctx.beginPath(); ctx.arc(X + 14, Y + 20, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a53a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X + 14, Y + 20); ctx.lineTo(X + 17, Y + 17); ctx.stroke();
    contactShadowSimple(ctx, X + W / 2, Y + H, W * 0.6);
  } else if (d.type === 'crates') {
    if (!back) return;
    const r = seeded(d.x * 31 + d.y);
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
      const cx = X + i * TILE, cy = Y + j * TILE, t = r();
      ctx.fillStyle = mix('#7d6244', '#5d4630', t * 0.6); ctx.fillRect(cx + 0.5, cy + 0.5, TILE - 1, TILE - 1);
      ctx.strokeStyle = 'rgba(30,18,8,.55)'; ctx.lineWidth = 1.4; ctx.strokeRect(cx + 2, cy + 2, TILE - 4, TILE - 4);
      ctx.beginPath(); ctx.moveTo(cx + 2, cy + 2); ctx.lineTo(cx + TILE - 2, cy + TILE - 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(cx + 1, cy + 1, TILE - 2, 1.5);
    }
  } else if (d.type === 'barrels') {
    if (!back) return;
    for (let i = 0; i < d.w; i++) {
      const bx = X + i * TILE + 2, bw = TILE - 4;
      ctx.fillStyle = grad(ctx, bx, 0, bx + bw, 0, ['#2f5460', '#4a7a88', '#243f48']);
      roundRect(ctx, bx, Y + 2, bw, H - 2, 4); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx, Y + 8, bw, 1.5); ctx.fillRect(bx, Y + H - 9, bw, 1.5);
      ctx.fillStyle = '#d6b23a'; ctx.fillRect(bx + 4, Y + H / 2 - 4, bw - 8, 7);
    }
  } else if (d.type === 'lamp') {
    // hanging bulb in a cage
    if (!back) return;
    const lx = X + TILE / 2, ly = Y + (d.drop || 20);
    ctx.strokeStyle = '#0c0e12'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(lx, Y); ctx.lineTo(lx, ly - 7); ctx.stroke();
    ctx.fillStyle = '#1d222b'; roundRect(ctx, lx - 6, ly - 9, 12, 5, 2); ctx.fill();
    glow(ctx, lx, ly, 22, '#ffd98a', 0.7);
    ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.arc(lx, ly, 4.2, 0, 7); ctx.fill();
  } else if (d.type === 'web') {
    if (!back) return;
    web(ctx, d.flip ? X + W : X, Y, d.flip ? -1 : 1, 1, d.w * TILE);
  } else if (d.type === 'cistern') {
    // riveted steel back panel behind a tank interior, with level marks
    if (!back) return;
    ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#1b2430', '#243242']);
    ctx.fillRect(X, Y, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5;
    for (let xx = X; xx <= X + W; xx += TILE * 2) { ctx.beginPath(); ctx.moveTo(xx, Y); ctx.lineTo(xx, Y + H); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    for (let xx = X; xx <= X + W; xx += TILE * 2) for (let yy = Y + 6; yy < Y + H; yy += 14) { ctx.beginPath(); ctx.arc(xx + 4, yy, 1.1, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(190,230,255,.3)'; ctx.font = '8px sans-serif';
    for (let yy = Y + TILE; yy < Y + H; yy += TILE * 2) { ctx.fillRect(X + W - 14, yy, 10, 1.2); }
    // rust streaks
    ctx.fillStyle = 'rgba(140,80,40,.12)';
    for (let i = 0; i < d.w; i += 2) ctx.fillRect(X + i * TILE + 8, Y, 3, H * 0.6);
  } else if (d.type === 'outpipe') {
    // the big outflow pipe lying in the wall: d.x,d.y,d.w,d.h = the tunnel rect (tiles)
    if (back) {
      ctx.fillStyle = '#0b0e13'; ctx.fillRect(X, Y, W, H);
      ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#2a313d', '#10141b', '#252c37']);
      ctx.fillRect(X, Y, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.2;
      for (let xx = X + 18; xx < X + W; xx += 30) { ctx.beginPath(); ctx.moveTo(xx, Y); ctx.lineTo(xx, Y + H); ctx.stroke(); }
      glow(ctx, X + W - 12, Y + H / 2, 54, '#cfe6ff', 0.35);
    } else {
      // flange ring around the mouth
      ctx.strokeStyle = '#6a7384'; ctx.lineWidth = 5; ctx.strokeRect(X + 1, Y + 1, 12, H - 2);
      ctx.fillStyle = '#9aa4b6'; for (let yy = Y + 6; yy < Y + H; yy += 12) { ctx.beginPath(); ctx.arc(X + 3, yy, 1.6, 0, 7); ctx.fill(); }
    }
  } else if (d.type === 'drain') {
    if (!back) return;
    ctx.fillStyle = '#0c1016'; ctx.beginPath(); ctx.ellipse(X + W / 2, Y + H - 6, W * 0.42, 5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7d8798'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#4b5361';
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(X + W / 2 + i * 6, Y + H - 10); ctx.lineTo(X + W / 2 + i * 6, Y + H - 2); ctx.stroke(); }
  } else if (d.type === 'drainpipe') {
    // vertical pipe coming down from the laundry (ceiling) into a pool
    if (!back) return;
    ctx.fillStyle = grad(ctx, X, 0, X + W, 0, ['#4a3a34', '#8a6a5a', '#3a2c28']);
    ctx.fillRect(X + 4, Y, W - 8, H);
    ctx.fillStyle = '#2a201c'; ctx.fillRect(X, Y + H - 8, W, 8); ctx.fillRect(X, Y + 30, W, 5);
  } else if (d.type === 'pipes') {
    // d.pts = [[tx,ty],...] polyline of tile centres, plain copper run with flanges
    if (!back) return;
    const pts = d.pts.map(([a, b]) => [a * TILE + TILE / 2, b * TILE + TILE / 2]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = d.thick || 9; ctx.stroke();
    ctx.strokeStyle = darken(COPPER, 0.15); ctx.lineWidth = (d.thick || 9) - 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,170,.3)'; ctx.lineWidth = 1.5; ctx.save(); ctx.translate(-1.5, -1.5); ctx.stroke(); ctx.restore();
  } else if (d.type === 'boxes') {
    if (!back) return;
    const r = seeded(d.x * 17 + d.y * 5);
    for (let i = 0; i < d.w; i++) {
      const bw = 14 + r() * 8, bh = 12 + r() * 10, bx = X + i * TILE + 2, by = Y + H - bh;
      ctx.fillStyle = mix('#8a7a5a', '#6a5a3e', r()); ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(bx, by + bh * 0.4, bw, 2);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx, by, bw, 1.4);
    }
  }
}
function contactShadowSimple(ctx, cx, cy, rx) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.12);
  ctx.fillStyle = radial(ctx, 0, 0, 0, rx, ['rgba(0,0,0,.45)', 'rgba(0,0,0,0)']);
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
}

// -------------------------------------------------------------------------------- darkness
let mask = null, mctx = null, hot = null, hotFor = null;

function lightsOf(world, cam, view) {
  const out = [];
  const p = world.player;
  if (p) out.push({ x: p.cx, y: p.cy, r: 112, k: 0.92 });
  for (const d of world.decor) {
    if (d.type === 'lamp') out.push({ x: d.x * TILE + TILE / 2, y: d.y * TILE + (d.drop || 20), r: d.r || 150, k: 0.85, warm: true });
    else if (d.type === 'boiler') out.push({ x: (d.x + d.w / 2) * TILE, y: (d.y + d.h / 2) * TILE, r: 130, k: 0.8, warm: true });
    else if (d.type === 'outpipe') out.push({ x: (d.x + d.w) * TILE, y: (d.y + d.h / 2) * TILE, r: 120, k: 0.75, cold: true });
    else if (d.type === 'light') out.push({ x: (d.x + 0.5) * TILE, y: (d.y + 0.5) * TILE, r: d.r || 110, k: d.k || 0.8 });
  }
  for (const e of world.entities) {
    if (e.dead) continue;
    if (e.light) out.push({ ...e.light, k: 0.7 });
    else if (e === world.exit) out.push({ x: e.tx * TILE + 12, y: e.ty * TILE + 12, r: 100, k: 0.8, cold: true });
    else if (e.active && e instanceof Checkpoint) out.push({ x: e.tx * TILE + 12, y: e.ty * TILE + 12, r: 80, k: 0.7, warm: true });
    else if (e.hazard && e.phase === 'jet') out.push({ x: e.cx, y: e.cy, r: 80, k: 0.7, warm: true });
  }
  // hot pipes glow (collected once per level)
  if (hotFor !== world.level) {
    hotFor = world.level; hot = [];
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) if (world.level.raw[y][x] === '^') hot.push({ x: x * TILE + 12, y: y * TILE + 16, r: 54, k: 0.65, warm: true });
  }
  for (const h of hot) if (h.x > cam.x - 70 && h.x < cam.x + view.w + 70 && h.y > cam.y - 70 && h.y < cam.y + view.h + 70) out.push(h);
  return out.filter((l) => l.x > cam.x - l.r && l.x < cam.x + view.w + l.r && l.y > cam.y - l.r && l.y < cam.y + view.h + l.r);
}

export function drawForeground(ctx, view, cam, time, world) {
  if (!world) return;
  const mw = Math.ceil(view.w / 2), mh = Math.ceil(view.h / 2);
  if (!mask || mask.width !== mw || mask.height !== mh) { mask = makeCanvas(mw, mh); mctx = mask.getContext('2d'); }
  const lights = lightsOf(world, cam, view);
  // warm pools first (additive), then the darkness with holes punched where there is light
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) if (l.warm || l.cold) glow(ctx, l.x - cam.x, l.y - cam.y, l.r * 0.8, l.warm ? '#ff9a4a' : '#8fd2ff', 0.1 + 0.015 * Math.sin(time * 3 + l.x));
  ctx.restore();
  const c = mctx;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, mw, mh);
  c.fillStyle = 'rgba(4,6,15,0.7)'; c.fillRect(0, 0, mw, mh);
  c.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const x = (l.x - cam.x) / 2, y = (l.y - cam.y) / 2, r = l.r / 2;
    const g = c.createRadialGradient(x, y, r * 0.08, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${l.k})`); g.addColorStop(0.55, `rgba(0,0,0,${l.k * 0.55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.drawImage(mask, 0, 0, view.w, view.h);
}
