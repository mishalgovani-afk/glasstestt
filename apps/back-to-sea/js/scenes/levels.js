// Level select: a grid of levels grouped by chapter. Level i is unlocked when it is the first
// level, it was cleared, or the level before it was cleared.

import { el, mount, unmount, esc, drawUnderwater, makePuppetFish } from './ui.js';
import { CHAPTERS, LEVELS } from '../chapters/index.js';
import { fmtTime } from './hud.js';

export class LevelSelectScene {
  constructor(game) { this.game = game; this.t = 0; this.fish = makePuppetFish(); }

  enter() {
    const g = this.game;
    g.input.enabled = false;
    const s = g.save;
    const unlocked = (e) => e.index === 0 || s.isCleared(e.level.id) || (LEVELS[e.index - 1] && s.isCleared(LEVELS[e.index - 1].level.id)) || g.debug;
    const chapters = CHAPTERS.map((c, ci) => {
      const lv = LEVELS.filter((e) => e.chapterIndex === ci);
      const tiles = lv.map((e) => {
        const ok = unlocked(e), done = s.isCleared(e.level.id), best = s.data.best[e.level.id];
        return `<button class="lv ${done ? 'done' : ''}" data-i="${e.index}" ${ok ? '' : 'disabled'} style="--acc:${esc(c.palette.accent || '#ff8a3d')}">
          <span class="n">${esc(e.level.id)}</span>
          <span class="nm">${ok ? esc(e.level.name) : 'Locked'}</span>
          <span class="bt">${done && best ? fmtTime(best) : done ? '✓' : ok ? '' : '🔒'}</span>
        </button>`;
      }).join('');
      return `<section class="chap" style="--acc:${esc(c.palette.accent || '#ff8a3d')}">
        <h3><span class="cn">${c.number}</span> ${esc(c.title)} <small>${esc(c.mechanic.name)}</small></h3>
        <div class="lvgrid">${tiles}</div>
      </section>`;
    }).join('');
    const node = el(`
      <div class="screen levels">
        <header><button class="btn ghost back" data-a="back" aria-label="Back">‹ Back</button><h2>Levels</h2>
        <span class="total">Played ${fmtTime(s.data.total || 0)}</span></header>
        <div class="scroll">${chapters}</div>
      </div>`);
    node.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      g.audio.unlock(); g.audio.sfx('ui');
      if (b.dataset.a === 'back') g.toTitle();
      else if (b.dataset.i !== undefined) g.startLevel(+b.dataset.i, { card: true });
    });
    // let the list scroll by touch despite the global no-scroll rules
    this.node = mount(node);
  }
  exit() { unmount(this.node); }
  update(dt) { this.t += dt; this.fish.update(dt, 60, Math.sin(this.t) * 20); }
  render(ctx, view) {
    drawUnderwater(ctx, view, this.t);
    this.fish.drawAt(ctx, ((this.t * 40) % (view.w + 100)) - 50, view.h * 0.82 + Math.sin(this.t * 1.3) * 8, 1.4);
  }
}
