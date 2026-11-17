// Shared scene helpers: DOM screens with transitions, a puppet fish for menus, and an
// animated underwater backdrop.

import { Player } from '../player.js';
import { grad, radial, rgba, glow } from '../core/draw.js';

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Mount a screen element into #ui; returns it. Call unmount(node) to fade it out. */
export function mount(node) {
  const ui = document.getElementById('ui');
  ui.appendChild(node);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('in')));
  return node;
}
export function unmount(node) {
  if (!node || !node.parentNode) return;
  node.classList.remove('in');
  node.classList.add('out');
  setTimeout(() => node.remove(), 320);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const NOOP_WORLD = {
  waterAtPx: () => true, palette: { water: '#5cc6e4' },
  particles: { emit() {}, bubbles() {}, splash() {}, dust() {}, sparkle() {} },
  audio: { sfx() {} }, level: { pxH: 1e9 }, emit() {},
};
/** A fish you can draw anywhere (menus, title, ending): fish.drawAt(ctx, x, y, opts). */
export function makePuppetFish() {
  const p = new Player(NOOP_WORLD, 0, 0);
  p.body.inWater = true;
  return {
    p,
    update(dt, vx = 60, vy = 0, moisture = 100) {
      p.body.vx = vx; p.body.vy = vy; p.moisture = moisture;
      p.facing = vx < 0 ? -1 : 1;
      p._animate(dt, 0);
    },
    drawAt(ctx, x, y, scale = 1, rot = 0) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(scale, scale); ctx.rotate(rot);
      p.prev.x = p.body.x = -p.body.w / 2; p.prev.y = p.body.y = -p.body.h / 2;
      p.draw(ctx, 1);
      ctx.restore();
    },
  };
}

/** Animated deep-water backdrop (level select, cards). */
export function drawUnderwater(ctx, view, t, pal = { water: '#3fb2d6', waterDeep: '#0b3b5c' }) {
  ctx.fillStyle = grad(ctx, 0, 0, 0, view.h, [pal.water, pal.waterDeep, '#061d30']);
  ctx.fillRect(0, 0, view.w, view.h);
  // light rays
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = (i * 157 + t * 12) % (view.w + 200) - 100;
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.7 + i);
    ctx.fillStyle = grad(ctx, 0, 0, 0, view.h, ['#ffffff', 'rgba(255,255,255,0)']);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 140, view.h); ctx.lineTo(x + 40, view.h); ctx.fill();
  }
  ctx.restore();
  // drifting bubbles
  for (let i = 0; i < 26; i++) {
    const s = (i * 0.61803) % 1;
    const x = (s * view.w + Math.sin(t * 0.8 + i) * 10) % view.w;
    const y = view.h - ((t * (14 + (i % 5) * 6) + i * 53) % (view.h + 40)) + 20;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 4), 0, 7); ctx.stroke();
  }
  glow(ctx, view.w * 0.5, -40, view.w * 0.6, '#bff3ff', 0.25);
  ctx.fillStyle = radial(ctx, view.w / 2, view.h * 0.5, view.h * 0.3, view.w * 0.75, ['rgba(0,0,0,0)', rgba('#020a14', 0.55)]);
  ctx.fillRect(0, 0, view.w, view.h);
}
