// Chapter title card shown before the first level of a chapter: chapter number, title,
// subtitle, the new mechanic's name + hint. Tap / any key / 5 s continues.

import { el, mount, unmount, esc } from './ui.js';
import { grad } from '../core/draw.js';

export class CardScene {
  constructor(game, entry, next) { this.game = game; this.entry = entry; this.next = next; this.t = 0; this.done = false; }

  enter() {
    const g = this.game, c = this.entry.chapter;
    g.input.enabled = false;
    g.audio.setMusic(c.music || null);
    g.audio.registerAll(c.sfx);
    const node = el(`
      <div class="screen card-screen" style="--acc:${esc(c.palette.accent || '#ff8a3d')}">
        <div class="chapter-card">
          <div class="eyebrow">Chapter ${c.number}</div>
          <h2>${esc(c.title)}</h2>
          <p class="sub">${esc(c.subtitle || '')}</p>
          <div class="mech"><span class="new">New</span><b>${esc(c.mechanic.name)}</b><span class="hint">${esc(c.mechanic.hint)}</span></div>
          <p class="tap">Tap or press any key</p>
        </div>
      </div>`);
    const go = () => this.go();
    node.addEventListener('pointerdown', go);
    this._key = (e) => { if (!e.repeat) go(); };
    setTimeout(() => addEventListener('keydown', this._key), 350);
    this.node = mount(node);
  }
  exit() { removeEventListener('keydown', this._key); unmount(this.node); }
  go() { if (this.done || this.t < 0.6) return; this.done = true; this.game.audio.sfx('ui'); this.next(); }
  update(dt) { this.t += dt; if (this.t > 5.5) this.go(); }
  render(ctx, view) {
    const c = this.entry.chapter;
    try { c.drawBackground(ctx, view, { x: this.t * 18, y: 0 }, this.t, null); } catch { ctx.fillStyle = '#123'; ctx.fillRect(0, 0, view.w, view.h); }
    ctx.fillStyle = grad(ctx, 0, 0, view.w, 0, ['rgba(4,14,24,.85)', 'rgba(4,14,24,.55)', 'rgba(4,14,24,.25)']);
    ctx.fillRect(0, 0, view.w, view.h);
  }
}
