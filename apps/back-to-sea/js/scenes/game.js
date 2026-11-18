// Gameplay scene: runs a World, draws the HUD, handles pause.

import { World } from '../core/world.js';
import { drawHUD, drawDebug } from './hud.js';
import { el, mount, unmount, esc } from './ui.js';

export class GameScene {
  constructor(game, entry) {
    this.game = game;
    this.entry = entry;
    this.paused = false;
    this.pauseEl = null;
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.saveAcc = 0;
  }

  enter() {
    const g = this.game;
    this.world = new World(g, this.entry);
    g.audio.registerAll(this.entry.chapter.sfx);
    g.audio.setMusic(this.entry.chapter.music || null);
    g.input.enabled = true;
    g.input.clear();
    document.body.classList.add('playing');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  exit() {
    document.body.classList.remove('playing');
    this.closePause(true);
    this.game.save.write();
  }

  update(dt) {
    if (this.paused || this.game.blocked) return;
    this.world.step(dt, this.game.input);
    if (!this.world.winning) {
      this.game.save.addTime(dt);
      this.saveAcc += dt;
      if (this.saveAcc > 10) { this.saveAcc = 0; this.game.save.write(); }
    }
  }

  render(ctx, view, alpha, frameDt) {
    this.world.render(ctx, view, this.paused ? 1 : alpha);
    drawHUD(ctx, view, this.world);
    if (frameDt > 0) { this._fpsAcc += frameDt; this._fpsN++; if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; } }
    if (this.game.debug) drawDebug(ctx, view, this.world, this.fps);
  }

  restart() { this.closePause(true); this.game.startLevel(this.entry.index, { card: false }); }

  togglePause() { if (this.paused) this.closePause(); else this.openPause(); }
  openPause() {
    if (this.paused || this.world.winning) return;
    this.paused = true;
    this.game.input.clear();
    this.game.save.write();
    const g = this.game;
    const node = el(`
      <div class="screen pause" role="dialog" aria-label="Paused">
        <div class="card">
          <div class="eyebrow">${esc(this.entry.chapter.title)} · ${esc(this.entry.level.id)}</div>
          <h2>Paused</h2>
          <div class="menu">
            <button class="btn primary" data-a="resume">Resume</button>
            <button class="btn" data-a="restart">Restart level</button>
            <button class="btn" data-a="levels">Level select</button>
            <button class="btn ghost" data-a="mute">Sound: <span>${g.audio.muted ? 'Off' : 'On'}</span></button>
          </div>
        </div>
      </div>`);
    node.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      g.audio.sfx('ui');
      const a = b.dataset.a;
      if (a === 'resume') this.closePause();
      else if (a === 'restart') this.restart();
      else if (a === 'levels') { this.closePause(true); g.toLevels(); }
      else if (a === 'mute') { g.toggleMute(); b.querySelector('span').textContent = g.audio.muted ? 'Off' : 'On'; }
    });
    this.pauseEl = mount(node);
    setTimeout(() => node.querySelector('button')?.focus({ preventScroll: true }), 50);
    document.body.classList.add('paused');
  }
  closePause(immediate = false) {
    if (!this.paused) return;
    this.paused = false;
    document.body.classList.remove('paused');
    if (this.pauseEl) { if (immediate) this.pauseEl.remove(); else unmount(this.pauseEl); this.pauseEl = null; }
    this.game.input.clear();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
}
