// Chapter 2 art: lilac-tiled bathroom, porcelain fixtures, steam. All procedural; static pieces are
// pre-rendered (cached layers / decor) and nothing touches the DOM at import time.
import { TILE } from '../../core/constants.js';
import { grad, radial, rgba, mix, darken, lighten, roundRect, glow, cached, ctxScale, seeded, contactShadow, blit } from '../../core/draw.js';

export const P = {
  sky: '#eadff5', wallA: '#f4eff9', wallB: '#d9cfe8', solid: '#f6f3fa', solidEdge: '#ffffff',
  water: '#7fd6ea', waterDeep: '#2a7fa3', accent: '#ff8fc7', shelf: '#cfe3ee', hazard: '#ff6b4a',
};
const WALL = { tile: '#f6f1fb', tile2: '#ece5f6', grout: '#d3c8e6', wain: '#a99bd0', wain2: '#9788c3', wainGrout: '#7f70ad' };

// ---------------------------------------------------------------------------------------------
// Background

function paintWall(c, w, h) {
  // subway tiles 24x12, running bond; the pattern repeats every 48x24 so 96x96 is seamless
  c.fillStyle = WALL.grout; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 12) {
    const off = (y / 12) % 2 ? 12 : 0;
    for (let x = -24; x < w + 24; x += 24) {
      c.fillStyle = grad(c, 0, y, 0, y + 12, [WALL.tile, WALL.tile2]);
      roundRect(c, x + off + 0.8, y + 0.8, 22.4, 10.4, 1.6); c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x + off + 2.5, y + 1.6, 18, 1);
    }
  }
}
function paintWainscot(c, w, h) {
  c.fillStyle = WALL.wainGrout; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 24) for (let x = 0; x < w; x += 24) {
    c.fillStyle = grad(c, x, y, x + 24, y + 24, [lighten(WALL.wain, 0.1), WALL.wain2]);
    roundRect(c, x + 1, y + 1, 22, 22, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,.28)';
    c.beginPath(); c.moveTo(x + 4, y + 18); c.lineTo(x + 12, y + 3); c.lineTo(x + 16, y + 3); c.lineTo(x + 7, y + 20); c.closePath(); c.fill();
  }
}
function paintPuff(c, w, h) {
  c.fillStyle = radial(c, w / 2, h / 2, 0, w / 2, ['rgba(255,255,255,.9)', 'rgba(255,255,255,.35)', 'rgba(255,255,255,0)']);
  c.fillRect(0, 0, w, h);
}

export function drawBackground(ctx, view, cam, time, world) {
  const s = ctxScale(ctx);
  const wall = cached('b2-wall', 96, 96, s, paintWall);
  const ox = -(((cam.x % 96) + 96) % 96), oy = -(((cam.y % 96) + 96) % 96);
  for (let y = oy; y < view.h; y += 96) for (let x = ox; x < view.w; x += 96) blit(ctx, wall, x, y);
  if (world) {
    // lilac wainscot up to 4 tiles above the floor, with a chair-rail cap
    const floorY = (world.level.h - 2) * TILE - cam.y;
    const top = floorY - 4 * TILE;
    const wain = cached('b2-wain', 96, 96, s, paintWainscot);
    const wx = -(((cam.x % 96) + 96) % 96);
    for (let y = top; y < Math.min(view.h, floorY); y += 96) {
      const h = Math.min(96, floorY - y);
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, view.w, h); ctx.clip();
      for (let x = wx; x < view.w; x += 96) blit(ctx, wain, x, y - ((y - top) % 96 === 0 ? 0 : 0));
      ctx.restore();
    }
    ctx.fillStyle = grad(ctx, 0, top - 5, 0, top + 4, ['#ffffff', '#cdbfe6']);
    ctx.fillRect(0, top - 5, view.w, 6);
    ctx.fillStyle = 'rgba(70,50,110,.22)'; ctx.fillRect(0, top + 1, view.w, 3);
  }
  // drifting steam, parallax
  const puff = cached('b2-puff', 128, 128, s, paintPuff);
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const span = view.w + 256;
    const px = ((i * 211 + time * (5 + i * 2) - cam.x * (0.25 + i * 0.07)) % span + span) % span - 128;
    const py = 40 + ((i * 97) % 200) - cam.y * 0.1 + Math.sin(time * 0.3 + i) * 12;
    ctx.globalAlpha = 0.17;
    ctx.drawImage(puff, px, py, 150 + i * 14, 150 + i * 14);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Tiles

export function drawSolidTile(ctx, x, y, mask, rng, info) {
  const top = !(mask & 1), left = !(mask & 8), right = !(mask & 2), bottom = !(mask & 4);
  const floor = info.ty >= info.level.h - 2;
  if (floor) {
    const a = (info.tx + info.ty) % 2;
    ctx.fillStyle = grad(ctx, x, y, x + TILE, y + TILE, a ? ['#f4eee0', '#e2dac8'] : ['#e0d6c2', '#cfc4ad']);
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(110,90,60,.28)'; ctx.fillRect(x, y, 1, TILE); ctx.fillRect(x, y, TILE, 1);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(x + 3, y + 20); ctx.lineTo(x + 10, y + 4); ctx.lineTo(x + 13, y + 4); ctx.lineTo(x + 6, y + 21); ctx.fill();
    if (top) {
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(x, y, TILE, 2.2);
      ctx.fillStyle = 'rgba(90,70,130,.3)'; ctx.fillRect(x, y + 2.2, TILE, 2.5);
    }
    return;
  }
  ctx.fillStyle = grad(ctx, x, y, x + TILE, y + TILE, ['#faf7fd', '#ddd2ee']);
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(150,130,190,.35)'; ctx.fillRect(x + TILE - 1, y, 1, TILE); ctx.fillRect(x, y + TILE - 1, TILE, 1);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(x + 4, y + 20); ctx.lineTo(x + 11, y + 4); ctx.lineTo(x + 14, y + 4); ctx.lineTo(x + 7, y + 21); ctx.fill();
  if (top) { ctx.fillStyle = grad(ctx, 0, y, 0, y + 7, ['#ffffff', '#e8def5']); roundRect(ctx, x - (left ? 1 : 0), y, TILE + (left ? 1 : 0) + (right ? 1 : 0), 7, 2); ctx.fill(); ctx.fillStyle = 'rgba(80,60,130,.25)'; ctx.fillRect(x, y + 7, TILE, 2); }
  if (left) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x, y, 1.5, TILE); }
  if (right) { ctx.fillStyle = 'rgba(70,50,120,.25)'; ctx.fillRect(x + TILE - 2, y, 2, TILE); }
  if (bottom) { ctx.fillStyle = 'rgba(70,50,120,.3)'; ctx.fillRect(x, y + TILE - 3, TILE, 3); }
}

/** Glass shelf on chrome brackets. */
export function drawOneWayTile(ctx, x, y, l, r) {
  ctx.fillStyle = 'rgba(70,50,120,.14)'; ctx.fillRect(x, y + 6, TILE, 4);
  ctx.fillStyle = grad(ctx, 0, y, 0, y + 6, ['rgba(235,250,255,.95)', 'rgba(170,215,230,.85)']);
  roundRect(ctx, x - (l ? 1 : 0), y, TILE + (l ? 1 : 0) + (r ? 1 : 0), 6, l && r ? 0 : 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(x, y, TILE, 1.2);
  ctx.fillStyle = 'rgba(80,140,170,.45)'; ctx.fillRect(x, y + 5, TILE, 1);
  for (const [edge, bx] of [[!l, x + 3], [!r, x + TILE - 7]]) {
    if (!edge) continue;
    ctx.fillStyle = grad(ctx, bx, 0, bx + 4, 0, ['#8f9ba6', '#f5f8fa', '#8f9ba6']);
    ctx.beginPath(); ctx.moveTo(bx, y + 6); ctx.lineTo(bx + 4, y + 6); ctx.lineTo(bx + 4, y + 15); ctx.closePath(); ctx.fill();
  }
}

/** Scalding steam vent (hazard). */
export function drawHazard(ctx, x, y, time) {
  const p = 0.6 + 0.4 * Math.sin(time * 4 + x * 0.1);
  glow(ctx, x + 12, y + 18, 20, '#ff7a55', 0.3 * p);
  ctx.fillStyle = grad(ctx, 0, y + 14, 0, y + 24, ['#d9e0e6', '#7d8993']);
  roundRect(ctx, x + 1, y + 14, 22, 10, 3); ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(${255},${Math.round(90 + 90 * p)},60,.95)`;
    ctx.fillRect(x + 4 + i * 5, y + 17, 3, 5);
  }
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x + 3, y + 14.5, 18, 1);
  ctx.strokeStyle = `rgba(255,255,255,${0.4 * p})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ox = x + 6 + i * 6, t = time * 2.2 + i * 1.7;
    ctx.beginPath(); ctx.moveTo(ox, y + 13); ctx.bezierCurveTo(ox + 4 * Math.sin(t), y + 8, ox - 4 * Math.sin(t), y + 4, ox + 3 * Math.sin(t * 1.3), y); ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------------
// Decor (d.x/y/w/h in tiles)

function porcelain(c, x, y, w, h, r) {
  c.fillStyle = grad(c, x, y, x + w, y + h, ['#ffffff', '#e7eef3', '#c5d2dc']);
  roundRect(c, x, y, w, h, r); c.fill();
}
function chromeV(c, x, y, w, h) { c.fillStyle = grad(c, x, 0, x + w, 0, ['#8f9ba6', '#ffffff', '#8f9ba6']); c.fillRect(x, y, w, h); }

function towels(c, x, y, cols) {
  cols.forEach((col, i) => {
    c.fillStyle = grad(c, x, y + i * 4, x, y + i * 4 + 8, [lighten(col, 0.25), col]);
    roundRect(c, x + i * 1.5, y - i * 7, 28, 8, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 4 + i * 1.5, y - i * 7 + 1, 20, 1.4);
  });
}

export function drawDecor(ctx, d, info) {
  const X = d.x * TILE, Y = d.y * TILE, W = d.w * TILE, H = d.h * TILE;
  const back = info.layer === 'back';
  switch (d.type) {
    case 'bucket': {
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.55, 6, 0.25);
        ctx.strokeStyle = '#8d949c'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(X + W / 2, Y + 4, W * 0.46, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
        ctx.fillStyle = grad(ctx, X, Y, X + W, Y, ['#e8b81c', '#ffd84a', '#c99710']);
        roundRect(ctx, X + 2, Y, W - 4, H, 7); ctx.fill();
        ctx.fillStyle = '#5c7882'; roundRect(ctx, X + TILE - 2, Y + 3, W - 2 * TILE + 4, H - TILE + 2, 4); ctx.fill();
      } else {
        ctx.fillStyle = grad(ctx, 0, Y - 2, 0, Y + 7, ['#fff1a0', '#f0c21e']);
        roundRect(ctx, X, Y - 2, W, 8, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(X + 5, Y - 1, W - 10, 1.5);
        ctx.fillStyle = 'rgba(160,110,0,.35)'; ctx.fillRect(X + 4, Y + 6, W - 8, 2);
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(X + 6, Y + 12, 3, H - 28);
        ctx.fillStyle = '#e24a6e'; roundRect(ctx, X + W - TILE + 2, Y + H - 34, 18, 12, 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(X + W - TILE + 6, Y + H - 30, 10, 2); ctx.fillRect(X + W - TILE + 6, Y + H - 26, 7, 2);
      }
      break;
    }
    case 'pipe': {
      if (!back) return;
      // the kitchen drain pipe coming out of the wall and pouring into the bucket
      const py = Y + 18, ex = X + W - 12;
      ctx.fillStyle = grad(ctx, 0, py - 10, 0, py + 10, ['#dfe4e8', '#ffffff', '#8c96a0']);
      ctx.fillRect(X - 6, py - 10, ex - X - 2, 20);
      ctx.fillStyle = grad(ctx, ex - 12, 0, ex + 12, 0, ['#8c96a0', '#ffffff', '#7b8590']);
      roundRect(ctx, ex - 11, py - 10, 22, 36, 5); ctx.fill();
      ctx.fillStyle = '#6e7882'; ctx.fillRect(X + 28, py - 12, 5, 24); ctx.fillRect(X + 4, py - 12, 5, 24);
      ctx.fillStyle = '#31404a'; ctx.beginPath(); ctx.ellipse(ex, py + 26, 8, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = grad(ctx, ex - 6, 0, ex + 6, 0, ['rgba(160,215,240,.5)', 'rgba(230,248,255,.85)', 'rgba(160,215,240,.5)']);
      ctx.fillRect(ex - 5, py + 26, 10, Y + H - py - 26);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(ex - 1, py + 28, 1.5, Y + H - py - 28);
      break;
    }
    case 'cabinet': {
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.55, 5, 0.2);
        ctx.fillStyle = grad(ctx, X, Y, X + W, Y, ['#d9cfe8', '#f6f1fb', '#cfc3e2']);
        roundRect(ctx, X, Y, W, H, 4); ctx.fill();
        const n = Math.max(1, Math.round(d.w / 2));
        for (let i = 0; i < n; i++) {
          const dw = W / n;
          ctx.strokeStyle = 'rgba(110,90,160,.5)'; ctx.lineWidth = 1.3;
          roundRect(ctx, X + i * dw + 4, Y + 12, dw - 8, H - 22, 3); ctx.stroke();
          ctx.fillStyle = grad(ctx, X + i * dw + dw / 2 - 2, 0, X + i * dw + dw / 2 + 2, 0, ['#8f9ba6', '#fff', '#8f9ba6']);
          ctx.fillRect(X + i * dw + dw / 2 - 2, Y + 16, 4, 16);
        }
        ctx.fillStyle = grad(ctx, 0, Y - 1, 0, Y + 9, ['#ffffff', '#ddd2ee']); roundRect(ctx, X - 3, Y - 2, W + 6, 9, 3); ctx.fill();
        if (!d.plain) towels(ctx, X + 10, Y - 4, ['#ff9ec9', '#8fd8e8', '#ffe08a']);
      }
      break;
    }
    case 'vanity': {
      const [b0, b1] = d.basin || [d.x + 3, d.x + d.w - 4];
      const bx = b0 * TILE, bw = (b1 + 1 - b0) * TILE;
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.55, 5, 0.2);
        ctx.fillStyle = grad(ctx, X, Y, X + W, Y, ['#cfc3e2', '#f6f1fb', '#c4b7dc']);
        roundRect(ctx, X, Y, W, H, 4); ctx.fill();
        const n = Math.max(1, Math.round(d.w / 3));
        for (let i = 0; i < n; i++) {
          const dw = W / n;
          ctx.strokeStyle = 'rgba(110,90,160,.5)'; ctx.lineWidth = 1.3; roundRect(ctx, X + i * dw + 5, Y + 3 * TILE + 8, dw - 10, H - 3 * TILE - 16, 3); ctx.stroke();
          chromeV(ctx, X + i * dw + dw / 2 - 2, Y + 3 * TILE + 18, 4, 14);
        }
        // basin interior
        ctx.fillStyle = grad(ctx, 0, Y, 0, Y + 3 * TILE, ['#a9b9c6', '#dfe9f0']);
        roundRect(ctx, bx - 2, Y - 2, bw + 4, 3 * TILE + 2, 12); ctx.fill();
        // faucet
        const fx = bx + bw / 2;
        chromeV(ctx, fx - 3, Y - 26, 6, 26);
        ctx.strokeStyle = '#d5dde3'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(fx, Y - 24); ctx.quadraticCurveTo(fx, Y - 36, fx + 10, Y - 32); ctx.stroke();
        ctx.fillStyle = '#ff8fc7'; ctx.beginPath(); ctx.arc(fx - 12, Y - 12, 3, 0, 7); ctx.arc(fx + 12, Y - 12, 3, 0, 7); ctx.fill();
        // drain plate
        ctx.fillStyle = '#7d8a94'; ctx.beginPath(); ctx.ellipse(fx, Y + 3 * TILE - 3, 12, 3.5, 0, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = grad(ctx, 0, Y - 3, 0, Y + 8, ['#ffffff', '#ddd2ee']);
        roundRect(ctx, X - 3, Y - 3, bx - X + 3, 10, 4); ctx.fill();
        roundRect(ctx, bx + bw, Y - 3, X + W - bx - bw + 3, 10, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(X, Y - 2, bx - X, 1.4); ctx.fillRect(bx + bw, Y - 2, X + W - bx - bw, 1.4);
        ctx.fillStyle = 'rgba(255,255,255,.6)'; roundRect(ctx, bx + 6, Y + 8, 4, 3 * TILE - 22, 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.5; roundRect(ctx, bx - 1, Y - 1, bw + 2, 3 * TILE, 12); ctx.stroke();
      }
      break;
    }
    case 'mirror': {
      if (!back) return;
      ctx.fillStyle = '#c7bbe0'; roundRect(ctx, X - 5, Y - 5, W + 10, H + 10, 16); ctx.fill();
      ctx.fillStyle = grad(ctx, X, Y, X + W, Y + H, ['#f7fdff', '#cfe6ee', '#e7f6fa']); roundRect(ctx, X, Y, W, H, 12); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (const [ox, ww] of [[0.2, 16], [0.42, 6]]) { ctx.beginPath(); ctx.moveTo(X + W * ox, Y + H); ctx.lineTo(X + W * ox + ww, Y + H); ctx.lineTo(X + W * ox + ww + 50, Y); ctx.lineTo(X + W * ox + 50, Y); ctx.fill(); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; roundRect(ctx, X + 1, Y + 1, W - 2, H - 2, 12); ctx.stroke();
      break;
    }
    case 'cup': { // tooth glass with brushes (tiles x..x+w, rows y..y+h)
      if (back) {
        for (const [ox, col, tilt] of [[0.38, '#ff8fc7', -0.18], [0.62, '#7fd6ea', 0.12]]) {
          ctx.save(); ctx.translate(X + W * ox, Y + H - 4); ctx.rotate(tilt);
          ctx.fillStyle = col; roundRect(ctx, -2, -52, 5, 52, 2); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -58, 5, 8);
          ctx.fillStyle = '#4f9ad0'; ctx.fillRect(-2, -62, 5, 4);
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(205,235,248,.4)'; roundRect(ctx, X + 2, Y, W - 4, H, 5); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; roundRect(ctx, X + 2, Y - 1, W - 4, H + 1, 5); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(X + 7, Y + 4, 4, H - 10);
      }
      break;
    }
    case 'toilet': { // tank rows y..y+4 (water inside), bowl below
      const tw = W;
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.5, 5, 0.22);
        ctx.fillStyle = grad(ctx, 0, Y + 4 * TILE, 0, Y + H, ['#f3f6f9', '#cdd8e1']);
        ctx.beginPath(); ctx.moveTo(X + 20, Y + 4 * TILE); ctx.bezierCurveTo(X - 20, Y + 4 * TILE + 30, X + 10, Y + H - 22, X + 34, Y + H - 14); ctx.lineTo(X + W - 34, Y + H - 14); ctx.bezierCurveTo(X + W - 10, Y + H - 22, X + W + 20, Y + 4 * TILE + 30, X + W - 20, Y + 4 * TILE); ctx.fill();
        porcelain(ctx, X + 26, Y + H - 20, W - 52, 20, 6);
        porcelain(ctx, X, Y, tw, 4 * TILE + 6, 8);
        ctx.fillStyle = '#5c7a88'; roundRect(ctx, X + TILE - 2, Y + 4, tw - 2 * TILE + 4, 2 * TILE + 2, 4); ctx.fill();
        chromeV(ctx, X + W + 2, Y + 18, 7, 10);
      } else {
        porcelain(ctx, X - 4, Y - 4, tw + 8, 9, 5);
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(X, Y - 3, tw, 1.5);
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(X + 5, Y + 10, 4, 4 * TILE - 20);
      }
      break;
    }
    case 'tub': { // cutaway claw-foot tub: walls (tiles) hidden, water from map
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.5, 5, 0.22);
        for (const fx of [X + 14, X + W - 14]) {
          ctx.fillStyle = grad(ctx, fx - 8, 0, fx + 8, 0, ['#c6a24a', '#f6dc8a', '#b08a30']);
          ctx.beginPath(); ctx.moveTo(fx - 8, Y + H - 14); ctx.lineTo(fx + 8, Y + H - 14); ctx.quadraticCurveTo(fx + 12, Y + H - 2, fx + 8, Y + H); ctx.lineTo(fx - 8, Y + H); ctx.quadraticCurveTo(fx - 12, Y + H - 2, fx - 8, Y + H - 14); ctx.fill();
        }
        ctx.fillStyle = grad(ctx, 0, Y, 0, Y + H, ['#ffffff', '#e5edf3', '#b9c7d3']);
        roundRect(ctx, X, Y, W, H - 6, 18); ctx.fill();
        ctx.fillStyle = '#6f8f9c'; roundRect(ctx, X + TILE - 2, Y + 3, W - 2 * TILE + 4, (d.depth || d.h - 1) * TILE - 3, 6); ctx.fill();
      } else {
        ctx.fillStyle = grad(ctx, 0, Y - 3, 0, Y + 8, ['#ffffff', '#d5deea']);
        roundRect(ctx, X - 4, Y - 3, TILE + 8, 11, 5); ctx.fill();
        roundRect(ctx, X + W - TILE - 4, Y - 3, TILE + 8, 11, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(X, Y - 2, TILE, 1.4); ctx.fillRect(X + W - TILE, Y - 2, TILE, 1.4);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(X + 6, Y + 12, 4, H - 40);
      }
      break;
    }
    case 'foam': { // bubble-bath foam heaped on the water surface (drawn behind the water)
      if (!back) return;
      const r = seeded(d.x * 31 + d.y);
      for (let i = 0; i < d.w * 5; i++) {
        const fx = X + r() * W, fy = Y + 2 + r() * 6, fr = 4 + r() * 6;
        ctx.fillStyle = grad(ctx, fx - fr, fy - fr, fx + fr, fy + fr, ['#ffffff', '#e8f4fb']);
        ctx.beginPath(); ctx.arc(fx, fy, fr, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(160,200,230,.4)'; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(fx - fr * 0.3, fy - fr * 0.3, fr * 0.22, 0, 7); ctx.fill();
      }
      break;
    }
    case 'curtain': { // shower curtain hanging from a rail (behind the fish)
      if (!back) return;
      ctx.fillStyle = '#aeb9c3'; ctx.fillRect(X, Y, W, 4);
      const folds = Math.round(W / 14);
      for (let i = 0; i < folds; i++) {
        const fx = X + i * (W / folds), fw = W / folds;
        ctx.fillStyle = grad(ctx, fx, 0, fx + fw, 0, i % 2 ? ['rgba(255,176,214,.55)', 'rgba(255,214,234,.55)'] : ['rgba(255,214,234,.55)', 'rgba(240,160,205,.55)']);
        ctx.fillRect(fx, Y + 4, fw, H - 4);
        ctx.fillStyle = '#e8eef2'; ctx.beginPath(); ctx.arc(fx + fw / 2, Y + 2, 3, 0, 7); ctx.fill();
      }
      const r = seeded(d.x * 17 + d.y);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < d.w * 4; i++) { ctx.beginPath(); ctx.arc(X + r() * W, Y + 14 + r() * (H - 22), 2 + r() * 3, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(X, Y + H - 4, W, 4);
      break;
    }
    case 'window': {
      if (!back) return;
      ctx.fillStyle = '#ffffff'; roundRect(ctx, X - 5, Y - 5, W + 10, H + 10, 8); ctx.fill();
      ctx.fillStyle = grad(ctx, X, Y, X + W, Y + H, ['#e2f6ff', '#fff6dc']); ctx.fillRect(X, Y, W, H);
      const r = seeded(5);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 40; i++) ctx.fillRect(X + r() * W, Y + r() * H, 3 + r() * 4, 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X + W / 2, Y); ctx.lineTo(X + W / 2, Y + H); ctx.stroke();
      glow(ctx, X + W / 2, Y + H / 2, W * 0.9, '#fff4c2', 0.35);
      break;
    }
    case 'towels': { // wall rail with two towels
      if (!back) return;
      ctx.fillStyle = '#aeb9c3'; ctx.fillRect(X, Y, W, 3.5);
      ctx.fillStyle = '#8f9ba6'; ctx.fillRect(X, Y - 3, 4, 10); ctx.fillRect(X + W - 4, Y - 3, 4, 10);
      [['#ff9ec9', 0.1, 0.5], ['#8fd8e8', 0.55, 0.4]].forEach(([col, a, b]) => {
        const tx = X + W * a, tw = W * b;
        ctx.fillStyle = grad(ctx, tx, 0, tx + tw, 0, [darken(col, 0.08), lighten(col, 0.2), col]);
        ctx.beginPath(); ctx.moveTo(tx, Y + 1); ctx.lineTo(tx + tw, Y + 1); ctx.lineTo(tx + tw - 2, Y + H); ctx.quadraticCurveTo(tx + tw / 2, Y + H + 5, tx + 2, Y + H); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(tx + 2, Y + H - 9, tw - 4, 2);
      });
      break;
    }
    case 'medcab': { // mirrored medicine cabinet on the wall
      if (!back) return;
      ctx.fillStyle = '#e6def2'; roundRect(ctx, X, Y, W, H, 6); ctx.fill();
      ctx.fillStyle = grad(ctx, X, Y, X + W, Y + H, ['#f7fdff', '#c9e2ea']); roundRect(ctx, X + 5, Y + 5, W - 10, H - 10, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(X + 12, Y + H - 8); ctx.lineTo(X + 24, Y + H - 8); ctx.lineTo(X + 52, Y + 8); ctx.lineTo(X + 40, Y + 8); ctx.fill();
      chromeV(ctx, X + W / 2 - 1.5, Y + 6, 3, H - 12);
      break;
    }
    case 'bottles': { // a row of toiletries standing on the tiles above y+h
      if (!back) return;
      const cols = ['#8fd8e8', '#ffb0d4', '#ffe08a', '#b9a4ff', '#a8e6b8'];
      for (let i = 0; i < d.w; i++) {
        const bx = X + i * TILE + 4, bh = 14 + (i * 7) % 12, col = cols[i % cols.length];
        ctx.fillStyle = grad(ctx, bx, 0, bx + 14, 0, [lighten(col, 0.3), col, darken(col, 0.15)]);
        roundRect(ctx, bx, Y + H - bh, 14, bh, 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + 4, Y + H - bh - 5, 6, 6);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(bx + 3, Y + H - bh + 3, 2, bh - 8);
      }
      break;
    }
    case 'hamper': {
      if (back) {
        contactShadow(ctx, X + W / 2, Y + H, W * 0.55, 5, 0.2);
        ctx.fillStyle = grad(ctx, X, Y, X + W, Y, ['#c9a46a', '#ecd29a', '#b58d52']); roundRect(ctx, X, Y, W, H, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(110,70,20,.35)'; ctx.lineWidth = 1.2;
        for (let yy = Y + 8; yy < Y + H; yy += 8) { ctx.beginPath(); ctx.moveTo(X + 2, yy); ctx.lineTo(X + W - 2, yy); ctx.stroke(); }
        for (let xx = X + 8; xx < X + W; xx += 12) { ctx.beginPath(); ctx.moveTo(xx, Y + 3); ctx.lineTo(xx, Y + H - 3); ctx.stroke(); }
        ctx.fillStyle = '#fff4f9'; roundRect(ctx, X - 3, Y - 3, W + 6, 8, 4); ctx.fill();
        towels(ctx, X + 8, Y - 4, ['#8fd8e8', '#ff9ec9']);
      }
      break;
    }
    case 'mat': { // bath mat on the floor (visual)
      if (!back) return;
      ctx.fillStyle = grad(ctx, 0, Y + H - 6, 0, Y + H, ['#ff9ec9', '#f07fb4']); roundRect(ctx, X, Y + H - 6, W, 6, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X + 4, Y + H - 3); ctx.lineTo(X + W - 4, Y + H - 3); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'drain': { // big floor drain (finale of the chapter): decorative
      if (!back) return;
      ctx.fillStyle = '#5f6d78'; ctx.beginPath(); ctx.ellipse(X + W / 2, Y + H - 6, W / 2, 7, 0, 0, 7); ctx.fill();
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------
/** Steam haze over the world for the hot levels. */
export function drawForeground(ctx, view, cam, time, world) {
  if (!world || !world.def.steamy) return;
  const g = grad(ctx, 0, 0, 0, view.h, ['rgba(255,255,255,0.10)', 'rgba(255,230,245,0.16)']);
  ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
}
