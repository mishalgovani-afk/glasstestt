// Title screen: a fish circling in its kitchen bowl, "Back to Sea", Play / Continue / Levels.

import { el, mount, unmount, makePuppetFish } from './ui.js';
import { grad, radial, roundRect, rgba, glow, contactShadow } from '../core/draw.js';
import { CHAPTERS } from '../chapters/index.js';

export class TitleScene {
  constructor(game) { this.game = game; this.t = 0; this.fish = makePuppetFish(); this.bubbles = []; }

  enter() {
    const g = this.game;
    g.input.enabled = false;
    g.audio.setMusic(CHAPTERS[0].music ? { ...CHAPTERS[0].music, lead: { ...(CHAPTERS[0].music.lead || {}), density: 0.12 } } : null);
    const cont = g.continueIndex();
    const node = el(`
      <div class="screen title">
        <div class="title-block">
          <h1><span class="w1">Back</span> <span class="w2">to</span> <span class="w3">Sea</span></h1>
          <p class="tag">A little fish. A big house. One long way home.</p>
        </div>
        <div class="menu title-menu">
          ${cont > 0 ? '<button class="btn primary" data-a="continue">Continue</button>' : ''}
          <button class="btn ${cont > 0 ? '' : 'primary'}" data-a="play">${cont > 0 ? 'New game' : 'Play'}</button>
          <button class="btn" data-a="levels">Levels</button>
        </div>
        <p class="foot">Move ◀ ▶ · Jump ⤒ &nbsp;·&nbsp; Keys: arrows / WASD + Space</p>
      </div>`);
    node.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      g.audio.unlock(); g.audio.sfx('ui');
      const a = b.dataset.a;
      if (a === 'play') g.startLevel(0, { card: true });
      else if (a === 'continue') g.startLevel(g.continueIndex(), { card: true });
      else if (a === 'levels') g.toLevels();
    });
    this.node = mount(node);
  }
  exit() { unmount(this.node); }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const vx = -Math.sin(t * 0.55) * 70, vy = Math.cos(t * 1.1) * 25;
    this.fish.update(dt, vx, vy);
    if (Math.random() < dt * 2.5) this.bubbles.push({ x: Math.cos(t * 0.55) * 60, y: 30, r: 1 + Math.random() * 2.5, s: 20 + Math.random() * 20 });
    for (const b of this.bubbles) b.y -= b.s * dt;
    this.bubbles = this.bubbles.filter((b) => b.y > -60);
  }

  render(ctx, view) {
    const t = this.t;
    const k = CHAPTERS[0];
    ctx.fillStyle = '#f0dcc0'; ctx.fillRect(0, 0, view.w, view.h);
    try { k.drawBackground(ctx, view, { x: 80 + Math.sin(t * 0.1) * 30, y: 0 }, t, null); } catch {}
    // counter
    const cy = view.h - 70;
    ctx.fillStyle = grad(ctx, 0, cy, 0, cy + 12, ['#fbf8f3', '#ddd5c8']); ctx.fillRect(0, cy, view.w, 12);
    ctx.fillStyle = grad(ctx, 0, cy + 12, 0, view.h, ['#8d5b3b', '#5e3a24']); ctx.fillRect(0, cy + 12, view.w, view.h);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, cy + 12, view.w, 3);
    for (let x = 60; x < view.w; x += 120) { ctx.fillStyle = 'rgba(40,20,10,.35)'; ctx.fillRect(x, cy + 15, 2, view.h); }
    // bowl
    const bx = view.w * 0.3, by = cy - 74, R = 78;
    contactShadow(ctx, bx, cy + 2, R * 0.9, 10, 0.35);
    ctx.save();
    ctx.beginPath(); ctx.arc(bx, by, R, -Math.PI * 0.78, Math.PI * 1.78); ctx.closePath();
    ctx.fillStyle = 'rgba(225,242,250,.35)'; ctx.fill();
    ctx.clip();
    const wl = by - R * 0.48;
    ctx.beginPath(); ctx.moveTo(bx - R - 4, by + R + 4);
    for (let x = -R - 4; x <= R + 4; x += 4) ctx.lineTo(bx + x, wl + Math.sin(x * 0.07 + t * 2) * 2 + Math.sin(x * 0.15 - t * 1.3));
    ctx.lineTo(bx + R + 4, by + R + 4); ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, wl, 0, by + R, [rgba('#7fd6f0', 0.8), rgba('#2a86b4', 0.85)]); ctx.fill();
    // gravel + plant
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = ['#f2b880', '#9ad0c2', '#f7e0a8', '#d48a7a'][i % 4];
      ctx.beginPath(); ctx.arc(bx - R * 0.8 + (i * 37 % (R * 1.6)), by + R * 0.86 - (i % 3) * 3, 3, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = '#4fa36a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx + 30 + i * 8, by + R * 0.8); ctx.quadraticCurveTo(bx + 20 + i * 10 + Math.sin(t + i) * 6, by + 10, bx + 30 + i * 9 + Math.sin(t * 1.2 + i) * 8, by - 18 + i * 8); ctx.stroke(); }
    // fish + bubbles
    const fx = bx + Math.cos(t * 0.55) * 42, fy = by + 12 + Math.sin(t * 1.1) * 12;
    this.fish.drawAt(ctx, fx, fy, 1.9);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2;
    for (const b of this.bubbles) { ctx.beginPath(); ctx.arc(bx + b.x + Math.sin(b.y * 0.1) * 3, by + b.y, b.r, 0, 7); ctx.stroke(); }
    // caustic-ish glints
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, bx - 20 + Math.sin(t) * 10, wl + 30, 50, '#bff3ff', 0.25);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // glass rim & highlights
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bx, by, R, -Math.PI * 0.78, Math.PI * 1.78); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; roundRect(ctx, bx - R * 0.62, by - R * 0.8, R * 1.24, 7, 3.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(bx - R * 0.6, by + 4, 8, R * 0.5, 0.18, 0, 7); ctx.fill();
    // warm light + vignette
    glow(ctx, view.w * 0.8, -30, view.w * 0.55, '#fff1c9', 0.35);
    ctx.fillStyle = radial(ctx, view.w / 2, view.h * 0.45, view.h * 0.35, view.w * 0.75, ['rgba(0,0,0,0)', 'rgba(30,15,5,.45)']);
    ctx.fillRect(0, 0, view.w, view.h);
  }
}
