// Ending: the fish reaches the open sea, credits roll, total play time, Play again / Levels / Title.
// The finale chapter may customise it with
//   ending: { draw(ctx, view, t, stats), credits: [...] | (stats) => [...], cardAt?, skipTo?, music? }
// stats = { total, cleared, best: {id: s}, levels: LEVELS }. See DESIGN.md "Boss & finale hooks".

import { el, mount, unmount, esc, makePuppetFish } from './ui.js';
import { grad, glow, rgba } from '../core/draw.js';
import { fmtLong } from './hud.js';
import { CHAPTERS, LEVELS } from '../chapters/index.js';

export class EndingScene {
  constructor(game) { this.game = game; this.t = 0; this.fish = makePuppetFish(); }

  enter() {
    const g = this.game;
    g.input.enabled = false;
    const fin = CHAPTERS[CHAPTERS.length - 1];
    this.custom = fin.ending || null;
    const opt = this.custom || {};
    this.cardAt = opt.cardAt || 0;          // seconds before the card fades in (tap skips ahead)
    this.skipTo = opt.skipTo || this.cardAt; // a tap before this jumps the scene clock to it
    g.audio.setMusic(opt.music || { bpm: 70, key: 'D', scale: 'lydian', progression: [1, 4, 6, 5], reverb: 0.6,
      pad: { wave: 'sine', vol: 0.55, octave: 3, cutoff: 2000, attack: 2 }, arp: { wave: 'sine', vol: 0.25, octave: 5, pattern: [0, 1, 2, 3, 2, 1], rate: 2, decay: 0.6 },
      lead: { wave: 'triangle', vol: 0.2, octave: 5, density: 0.3, decay: 1.2 } });
    const s = g.save.data;
    this.stats = { total: s.total || 0, cleared: Object.keys(s.cleared || {}).length, best: { ...(s.best || {}) }, levels: LEVELS };
    let extra = [];
    try { extra = typeof opt.credits === 'function' ? opt.credits(this.stats) : (opt.credits || []); } catch (e) { console.error(e); }
    const credits = [
      ['Back to Sea', ''],
      ['A game about getting home', ''],
      ['Design & code', 'Made with HTML5 canvas'],
      ['Art', 'Drawn procedurally, every frame'],
      ['Music & sound', 'Synthesized live with WebAudio'],
      ...extra.map((c) => (Array.isArray(c) ? c : [c, ''])),
      ['Thank you for playing', ''],
    ];
    const node = el(`
      <div class="screen ending${this.cardAt > 0 ? ' later' : ''}">
        <div class="end-card">
          <div class="eyebrow">The End</div>
          <h2>Back to Sea</h2>
          <p class="time">Total play time <b>${esc(fmtLong(this.stats.total))}</b></p>
          <div class="credits"><div class="roll">${credits.map(([a, b]) => `<p><b>${esc(a)}</b>${b ? `<span>${esc(b)}</span>` : ''}</p>`).join('')}</div></div>
          <div class="menu row end-menu">
            <button class="btn primary" data-a="again">Play again</button>
            <button class="btn" data-a="levels">Levels</button>
            <button class="btn" data-a="title">Title</button>
          </div>
        </div>
      </div>`);
    node.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !this.cardShown) return;
      g.audio.sfx('ui');
      const a = b.dataset.a;
      if (a === 'again') g.startLevel(0, { card: true });
      else if (a === 'title') g.toTitle();
      else g.toLevels();
    });
    // a tap during the intro skips ahead to the card
    node.addEventListener('pointerdown', (e) => { if (!this.cardShown && !e.target.closest('button') && this.t < this.skipTo) this.t = this.skipTo; });
    this.node = mount(node);
    this.cardShown = false;
    this._showCard(this.cardAt <= 0);
  }
  _showCard(now) {
    if (this.cardShown || !now) return;
    this.cardShown = true;
    this.node.classList.add('show');
  }
  exit() { unmount(this.node); }
  update(dt) { this.t += dt; this.fish.update(dt, 90, Math.cos(this.t * 1.4) * 60); this._showCard(this.t >= this.cardAt); }
  render(ctx, view) {
    if (this.custom && this.custom.draw) {
      try { this.custom.draw(ctx, view, this.t, this.stats); return; } catch (e) { console.error(e); }
    }
    const t = this.t, W = view.w, H = view.h, sea = H * 0.42;
    ctx.fillStyle = grad(ctx, 0, 0, 0, sea, ['#2c3e74', '#e7816b', '#ffd59a']);
    ctx.fillRect(0, 0, W, sea);
    glow(ctx, W * 0.68, sea - 6, 140, '#fff0c0', 0.8);
    ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(W * 0.68, sea + 4, 34, Math.PI, 0); ctx.fill();
    for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(255,240,230,.35)'; const x = ((i * 190 + t * 6) % (W + 200)) - 100; ctx.beginPath(); ctx.ellipse(x, 40 + i * 17, 60, 8, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = grad(ctx, 0, sea, 0, H, ['#3a8fb0', '#155a80', '#082c48']);
    ctx.fillRect(0, sea, W, H - sea);
    // sun path on water
    for (let i = 0; i < 14; i++) {
      const y = sea + 6 + i * 6, w = 40 + i * 6 + Math.sin(t * 2 + i) * 8;
      ctx.fillStyle = rgba('#ffe7b0', 0.45 - i * 0.03);
      ctx.fillRect(W * 0.68 - w / 2 + Math.sin(t * 1.5 + i * 2) * 6, y, w, 2);
    }
    // waves
    for (let L = 0; L < 3; L++) {
      ctx.beginPath(); ctx.moveTo(0, H);
      const y0 = sea + 20 + L * 40;
      for (let x = 0; x <= W; x += 6) ctx.lineTo(x, y0 + Math.sin(x * 0.03 + t * (1 + L * 0.3)) * (3 + L * 2));
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = rgba(['#2c7ea3', '#1d6890', '#0f4d72'][L], 0.55);
      ctx.fill();
    }
    // the fish, leaping now and then
    const cyc = (t % 6) / 6;
    const fx = W * 0.15 + ((t * 30) % (W * 0.7));
    const leap = cyc > 0.7 ? Math.sin((cyc - 0.7) / 0.3 * Math.PI) : 0;
    const fy = sea + 46 - leap * 80 + Math.sin(t * 2) * 4;
    this.fish.drawAt(ctx, fx, fy, 1.6, -leap * 0.5 * Math.cos((cyc - 0.7) / 0.3 * Math.PI));
  }
}
