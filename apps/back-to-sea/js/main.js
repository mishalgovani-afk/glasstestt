// Back to Sea — boot: canvas/view sizing, fixed-timestep loop, scene manager, game flow.

import { VIEW_H, VIEW_W_MIN, VIEW_W_MAX, MAX_DPR, STEP, MAX_FRAME } from './core/constants.js';
import { Audio } from './core/audio.js';
import { Input } from './core/input.js';
import { save } from './core/save.js';
import { LEVELS, findLevel } from './chapters/index.js';
import { GameScene } from './scenes/game.js';
import { TitleScene } from './scenes/title.js';
import { LevelSelectScene } from './scenes/levels.js';
import { CardScene } from './scenes/card.js';
import { EndingScene } from './scenes/ending.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const fadeEl = document.getElementById('fade');
const safeProbe = document.getElementById('safe-probe');

const view = { w: 640, h: VIEW_H, scale: 1, dpr: 1, backingScale: 1, cssW: 0, cssH: 0, safe: { l: 0, r: 0, t: 0, b: 0 } };

save.load();
const audio = new Audio();
audio.setMuted(save.data.mute);
const input = new Input();
input.attach(document.getElementById('touch'), {
  left: document.querySelector('#touch .left'), right: document.querySelector('#touch .right'), jump: document.querySelector('#touch .jump'),
});

const game = {
  view, audio, input, save, params, levels: LEVELS,
  debug: params.has('debug') && params.get('debug') !== '0',
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  blocked: false,
  scene: null,
  transitioning: false,

  go(scene, { fade = true } = {}) {
    const swap = () => {
      if (this.scene && this.scene.exit) this.scene.exit();
      this.scene = scene;
      if (scene.enter) scene.enter();
      if (scene.resize) scene.resize(view);
    };
    if (!fade || !this.scene) { swap(); fadeEl.classList.remove('on'); return; }
    if (this.transitioning) { this._queued = scene; return; }
    this.transitioning = true;
    fadeEl.classList.add('on');
    setTimeout(() => {
      swap();
      const q = this._queued; this._queued = null;
      requestAnimationFrame(() => { fadeEl.classList.remove('on'); this.transitioning = false; if (q) this.go(q); });
    }, 300);
  },

  /** Start LEVELS[index]; shows the chapter card first when entering a chapter. */
  startLevel(index, { card = true } = {}) {
    const entry = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
    if (!entry) return;
    const play = () => this.go(new GameScene(this, entry));
    if (card && (entry.levelIndex === 0 || card === 'always')) this.go(new CardScene(this, entry, play));
    else play();
  },
  onLevelComplete(world) {
    const e = world.entry;
    save.clear(e.level.id, world.levelTime);
    const next = LEVELS[e.index + 1];
    if (!next) { this.toEnding(); return; }
    this.startLevel(next.index, { card: next.chapterIndex !== e.chapterIndex });
  },
  onFinishGame(world) { if (world) save.clear(world.entry.level.id, world.levelTime); this.toEnding(); },
  toTitle() { this.go(new TitleScene(this)); },
  toLevels() { this.go(new LevelSelectScene(this)); },
  toEnding() { this.go(new EndingScene(this)); },
  /** First level not yet cleared (0 if none cleared). */
  continueIndex() {
    const first = LEVELS.findIndex((e) => !save.isCleared(e.level.id));
    const any = LEVELS.some((e) => save.isCleared(e.level.id));
    return !any ? 0 : first < 0 ? LEVELS.length - 1 : first;
  },
  toggleMute() {
    audio.unlock();
    audio.setMuted(!audio.muted);
    save.setMute(audio.muted);
    document.body.classList.toggle('muted', audio.muted);
  },
  togglePause() { if (this.scene && this.scene.togglePause) { audio.sfx('ui'); this.scene.togglePause(); } },
};

// ------------------------------------------------------------------------------- view sizing
function readSafe() {
  const cs = getComputedStyle(safeProbe);
  return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}
function resize() {
  const vv = window.visualViewport;
  const cssW = Math.max(1, Math.round(vv ? vv.width : innerWidth));
  const cssH = Math.max(1, Math.round(vv ? vv.height : innerHeight));
  const w = Math.round(Math.max(VIEW_W_MIN, Math.min(VIEW_W_MAX, (VIEW_H * cssW) / cssH)));
  const scale = Math.min(cssW / w, cssH / VIEW_H);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const changed = w !== view.w || Math.abs(scale - view.scale) > 0.001 || dpr !== view.dpr;
  Object.assign(view, { w, h: VIEW_H, scale, dpr, backingScale: scale * dpr, cssW, cssH });
  const s = readSafe();
  view.safe = { l: s.l / scale, r: s.r / scale, t: s.t / scale, b: s.b / scale };
  canvas.style.width = `${w * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  canvas.width = Math.round(w * scale * dpr);
  canvas.height = Math.round(VIEW_H * scale * dpr);
  game.blocked = cssH > cssW && matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('portrait', game.blocked);
  if (changed && game.scene && game.scene.world) {
    // re-render the pre-rendered tile chunks at the new resolution
    const wd = game.scene.world;
    wd.tiles.scale = view.backingScale;
    wd.tiles.renderAll();
  }
}
let resizeT = 0;
const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 60); };
addEventListener('resize', onResize);
if (window.visualViewport) visualViewport.addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// -------------------------------------------------------------------------------- UI wiring
const unlock = () => audio.unlock();
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });
addEventListener('touchend', unlock, { capture: true });
document.getElementById('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); game.togglePause(); });
document.getElementById('btn-mute').addEventListener('click', (e) => { e.currentTarget.blur(); game.toggleMute(); });
for (const b of document.querySelectorAll('#hud-buttons button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
input.onPause = () => game.togglePause();
input.onMute = () => game.toggleMute();
document.body.classList.toggle('muted', audio.muted);
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.scene && game.scene.openPause) game.scene.openPause();
    save.write();
    audio.suspend();
  } else audio.resume();
});
addEventListener('pagehide', () => save.write());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// ------------------------------------------------------------------------------------- loop
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  if (dt < 0) dt = 0;
  const sc = game.scene;
  if (sc) {
    const t0 = performance.now();
    if (perf.hold) acc = 0;
    else {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 20) { sc.update(STEP); acc -= STEP; n++; }
      if (n >= 20) acc = 0;
    }
    const t1 = performance.now();
    ctx.setTransform(view.backingScale, 0, 0, view.backingScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    try { sc.render(ctx, view, acc / STEP, dt); } catch (e) { if (!frame.err) { frame.err = true; console.error(e); } }
    perf.record(t1 - t0, performance.now() - t1);
  }
  audio.tick();
}

// Frame-cost probe for automated checks (cheap: two numbers per frame into a ring buffer).
const perf = {
  hold: false, n: 0, upd: new Float32Array(1024), ren: new Float32Array(1024),
  record(u, r) { const i = this.n++ & 1023; this.upd[i] = u; this.ren[i] = r; },
  reset() { this.n = 0; },
  samples() { const k = Math.min(this.n, 1024), out = []; for (let i = 0; i < k; i++) out.push([this.upd[i], this.ren[i]]); return out; },
};

// --------------------------------------------------------------------------- start + debug
const lvParam = params.get('level');
const target = lvParam ? findLevel(lvParam) : null;
if (target) game.startLevel(target.index, { card: false });
else game.toTitle();
requestAnimationFrame((t) => { last = t; frame(t); });

// Test/debug hook (read-only state + virtual input), used by automated checks.
window.__bts = {
  game, input, LEVELS, perf,
  /** hold(true) stops the real-time loop from stepping the scene; step(n) then advances it n fixed steps. */
  hold(on = true) { perf.hold = !!on; },
  step(n = 1) { for (let i = 0; i < n; i++) if (game.scene) game.scene.update(STEP); },
  get world() { return game.scene && game.scene.world; },
  state() {
    const w = this.world; if (!w) return { scene: game.scene && game.scene.constructor.name };
    const p = w.player, b = p.body;
    return { scene: game.scene.constructor.name, level: w.def.id, x: b.x, y: b.y, cx: p.cx, cy: p.cy, vx: b.vx, vy: b.vy, tx: Math.floor(p.cx / 24), ty: Math.floor(p.cy / 24), state: p.state, moisture: p.moisture, inWater: b.inWater, onGround: b.onGround, nearSurface: undefined, faints: w.faints, time: w.levelTime, winning: !!w.winning, paused: !!game.scene.paused };
  },
};
