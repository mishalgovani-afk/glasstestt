// The World: one running level. Owns tiles, entities, the player, particles, water, camera,
// hints, faint/respawn and level completion. Entities talk to the game only through this
// object (see DESIGN.md "World services").

import { TILE, STEP, MOISTURE_MAX } from './constants.js';
import { parseLevel, TILE_CHARS } from './level.js';
import { Particles } from './particles.js';
import { Camera } from './camera.js';
import { Waters, causticTexture, drawWaterRect, SURFACE_BAND } from './water.js';
import { TileLayers, defaultHazard } from './tiles.js';
import { Droplet, Checkpoint, Exit } from './builtins.js';
import { makeCanvas, radial, blit } from './draw.js';
import { Player } from '../player.js';

const DEFAULT_PAL = {
  sky: '#cfe8f5', wallA: '#e8eef2', wallB: '#cbd6de', solid: '#8b8f98', solidEdge: '#c5cad2',
  water: '#5cc6e4', waterDeep: '#1d6b97', accent: '#ff8a3d', shelf: '#b9824f', hazard: '#ff5a3a',
};

export class World {
  /**
   * @param game   { audio, view, debug, onLevelComplete(world), onFinishGame(world), reducedMotion }
   * @param entry  { chapter, level (def), index, ... } from chapters/index.js LEVELS
   */
  constructor(game, entry) {
    this.game = game;
    this.entry = entry;
    this.chapter = entry.chapter;
    this.def = entry.level;
    this.level = parseLevel(this.def, this.chapter);
    if (this.level.errors.length) console.warn(`level ${this.def.id}:`, this.level.errors);
    this.palette = { ...DEFAULT_PAL, ...(this.chapter.palette || {}) };
    this.decor = this.def.decor || [];
    this.w = this.level.w; this.h = this.level.h;
    this.time = 0; this.levelTime = 0; this.faints = 0;
    this.listeners = new Map();
    this.entities = [];
    this.boxes = [];
    this.hint = null;
    this.boss = null;
    this.flashC = null; this.flashT = 0; this.flashD = 0;
    this.fade = 0;
    this.fainting = null; this.winning = null;
    this.dryScale = 1;
    this._wavesDirty = false;
    this.says = (this.def.says || []).map((s) => ({ ...s, done: false }));

    this.particles = new Particles();
    this.particles.waterAt = (x, y) => this.waterAtPx(x, y);
    this.particles.solidAt = (x, y) => { const c = this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); return c === '#' || c === '='; };
    this.camera = new Camera();
    this.camera.reducedMotion = !!game.reducedMotion;
    this.waters = new Waters(this);
    const ga = game.audio;
    this.audio = {
      sfx: (name, o = {}) => {
        const pan = o.x !== undefined ? Math.max(-1, Math.min(1, (o.x - (this.camera.x + game.view.w / 2)) / (game.view.w * 0.7))) : o.pan;
        ga && ga.sfx(name, { ...o, pan });
      },
      register: (name, fn) => ga && ga.register(name, fn),
    };

    // core entities
    const L = this.level;
    for (const d of L.droplets) this._add(new Droplet(this, d.tx * TILE, d.ty * TILE, d.props));
    for (const c of L.checkpoints) this._add(new Checkpoint(this, c.tx * TILE, c.ty * TILE, c.props));
    if (L.exit) this.exit = this._add(new Exit(this, L.exit.tx * TILE, L.exit.ty * TILE, L.exit.props));
    for (const e of L.entities) {
      try { this._add(new e.cls(this, e.tx * TILE, e.ty * TILE, e.props)); } catch (err) { console.error(`entity '${e.ch}' failed`, err); }
    }
    this.spawnPoint = L.spawn ? { tx: L.spawn.tx, ty: L.spawn.ty } : { tx: 1, ty: 1 };
    this.checkpoint = { ...this.spawnPoint };
    const sp = this._spawnPos(this.checkpoint);
    this.player = new Player(this, sp.cx, sp.bottom);
    this.tiles = new TileLayers(this, game.view.backingScale);
    this._buildWaterPath();
    this.camera.snap(this.player, game.view, this.level);
    if (this.def.hint) this.say(this.def.hint, 5.5, 0.8);
  }

  _add(e) {
    this.entities.push(e);
    try { e.init(this); } catch (err) { console.error('entity init failed', err); }
    return e;
  }

  // ======================================================================== world services
  /** Tile char at (tx,ty): '.', '#', '=', '~', '-', '^'. Outside: sides/top '#', below '.'. */
  tileAt(tx, ty) {
    if (tx < 0 || tx >= this.w || ty < 0) return '#';
    if (ty >= this.h) return '.';
    return this.level.tile[ty][tx];
  }
  /** Change a tile at runtime (re-renders that chunk and the water surfaces). */
  setTile(tx, ty, c) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || !TILE_CHARS.has(c)) return;
    if (this.level.tile[ty][tx] === c) return;
    this.level.tile[ty][tx] = c;
    this.tiles.markDirty(tx);
    this._wavesDirty = true;
  }
  isSolid(tx, ty) { return this.tileAt(tx, ty) === '#'; }
  isWater(tx, ty) { return this.tileAt(tx, ty) === '~'; }
  isSurfaceTile(tx, ty) {
    if (this.tileAt(tx, ty) !== '~' || ty <= 0) return false;
    const up = this.tileAt(tx, ty - 1);
    return up !== '~' && up !== '#';
  }
  solidAtPx(px, py) { return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE)); }
  waterAtPx(px, py) { return this.waterAt(Math.floor(px / TILE), Math.floor(py / TILE)) || !!this.waterBoxAt(px, py); }

  // physics env interface (see js/core/physics.js)
  solidAt(tx, ty) { return tx < 0 || tx >= this.w || ty < 0 ? true : ty >= this.h ? false : this.level.tile[ty][tx] === '#'; }
  oneWayAt(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.level.tile[ty][tx] === '='; }
  waterAt(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.level.tile[ty][tx] === '~'; }
  waterBoxAt(px, py) {
    for (const e of this.entities) if (e.water && !e.dead && px >= e.x && px < e.x + e.w && py >= e.y && py < e.y + e.h) return e;
    return null;
  }
  waterSurfaceAt(px, py) { const e = this.waterBoxAt(px, py); return e ? e.y : null; }

  spawn(e) { return this._add(e); }
  findEntities(pred) { return this.entities.filter((e) => !e.dead && pred(e)); }
  shake(amount = 0.3) { this.camera.shake(amount); }
  /** On-screen hint. Replaces the current one. */
  say(text, seconds = 3, delay = 0) { this.hint = { text, t: -delay, dur: seconds }; }
  flash(color = '#ffffff', seconds = 0.25) { this.flashC = color; this.flashT = seconds; this.flashD = seconds; }
  splash(x, y, power = 1, up = false) {
    this.particles.splash(x, y, power, this.palette.water);
    this.waters.disturb(x, y, (up ? -1 : 1) * 160 * power);
    this.audio.sfx('splash', { vol: Math.min(1, 0.35 + power * 0.5), pitch: up ? 1.15 : 1, x });
    if (power > 1) this.shake(0.12);
  }
  rippleAt(x, y, power = 0.5) { this.waters.disturb(x, y, 120 * power); }
  drawWaterRect(ctx, x, y, w, h, alpha) { drawWaterRect(ctx, x, y, w, h, this.palette, this.time, alpha); }
  setCheckpoint(tx, ty) { this.checkpoint = { tx, ty }; }

  on(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(fn); return () => this.off(name, fn); }
  off(name, fn) { const l = this.listeners.get(name); if (l) this.listeners.set(name, l.filter((f) => f !== fn)); }
  emit(name, data) { for (const fn of this.listeners.get(name) || []) { try { fn(data, this); } catch (e) { console.error(e); } } }

  /** Player faints (dried out, hazard, fell...). Respawns at the last checkpoint. */
  faint(reason = 'dried') {
    if (this.fainting || this.winning) return;
    this.fainting = { t: 0, reason };
    this.faints++;
    const p = this.player;
    p.state = 'faint'; p.anim.faintT = 0;
    this.audio.sfx(reason === 'hazard' ? 'burn' : 'faint', { x: p.cx });
    if (reason === 'hazard') this.particles.steam(p.cx, p.cy, 6);
    this.shake(0.35);
    this.emit('faint', reason);
  }
  /** Complete the level (touching E calls this). */
  win(exit = null) {
    if (this.winning || this.fainting) return;
    const p = this.player;
    this.winning = { t: 0, x: exit ? exit.tx * TILE + 12 : p.cx, y: exit ? exit.ty * TILE + 16 : p.cy, sx: p.cx, sy: p.cy };
    p.state = 'win'; p.anim.winT = 0;
    this.audio.sfx('exit');
    this.particles.sparkle(this.winning.x, this.winning.y, 18, '#e8fbff');
    this.emit('win', exit);
  }
  /** Boss/finale: show a boss bar ({ name, hp, max }, mutated live) or hide it (null). */
  setBoss(b) { this.boss = b; }
  /** Boss/finale: clamp the camera inside a world-px rect {x,y,w,h}, or null to release. */
  lockCamera(rect) { this.camera.lock = rect; }
  /** Finale: jump to the ending scene (credits + total play time). */
  finishGame() { if (this.game.onFinishGame) this.game.onFinishGame(this); }

  // ============================================================================= simulation
  _spawnPos(cp) {
    const submerged = this.level.tile[cp.ty] && this.level.tile[cp.ty][cp.tx] === '~';
    return { cx: cp.tx * TILE + 12, bottom: submerged ? cp.ty * TILE + 19 : (cp.ty + 1) * TILE };
  }

  respawn() {
    const sp = this._spawnPos(this.checkpoint);
    const p = this.player;
    p.place(sp.cx, sp.bottom);
    p.moisture = MOISTURE_MAX;
    p.state = 'air'; p.anim.faintT = 0; p.anim.rot = 0; p.buffer = 0;
    for (const e of this.entities) { try { e.onRespawn(this); } catch (err) { console.error(err); } }
    this.camera.snap(p, this.game.view, this.level);
    this.emit('respawn', this.checkpoint);
  }

  step(dt, input) {
    this.time += dt;
    if (!this.winning) this.levelTime += dt;
    const p = this.player;

    // entities
    for (const e of this.entities) {
      if (e.dead) continue;
      e._px = e.x; e._py = e.y;
      try { e.update(dt, this); } catch (err) { console.error('entity update', err); e.dead = true; }
    }
    this.boxes = [];
    for (const e of this.entities) if (!e.dead && (e.solid || e.oneWay)) this.boxes.push({ x: e.x, y: e.y, w: e.w, h: e.h, solid: e.solid, oneWay: e.oneWay, ref: e });
    // carry the player on moving platforms
    const gb = p.body.groundBox;
    if (gb && gb.ref && !gb.ref.dead) { p.body.x += gb.ref.x - gb.ref._px; p.body.y += gb.ref.y - gb.ref._py; }

    p.update(dt, this.fainting || this.winning ? null : input);

    // overlaps
    p.wetTouch = false;
    if (p.alive) {
      const b = p.body;
      for (const e of this.entities) {
        if (e.dead) continue;
        if (b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
          if (e.wet) p.wetTouch = true;
          if (e.hazard) { this.faint('hazard'); break; }
          try { e.onPlayerOverlap(p, this); } catch (err) { console.error(err); }
          if (!p.alive) break;
        }
      }
    }
    if (this.entities.some((e) => e.dead)) this.entities = this.entities.filter((e) => !e.dead);

    this.particles.update(dt);
    if (this._wavesDirty) { this._wavesDirty = false; this.waters.build(); this._buildWaterPath(); this.tiles.flush(); }
    this.waters.update(dt);

    // positional hints
    const ptx = Math.floor(p.cx / TILE);
    for (const s of this.says) if (!s.done && ptx >= s.x && (s.y === undefined || Math.abs(Math.floor(p.cy / TILE) - s.y) <= 3)) { s.done = true; this.say(s.text, s.seconds || 3.5); }
    if (this.hint) { this.hint.t += dt; if (this.hint.t > this.hint.dur) this.hint = null; }
    if (this.flashT > 0) this.flashT -= dt;

    // faint sequence
    if (this.fainting) {
      const f = this.fainting;
      f.t += dt;
      if (f.t > 1.0) this.fade = Math.min(1, (f.t - 1.0) / 0.35);
      if (f.t > 1.4 && !f.respawned) { f.respawned = true; this.respawn(); }
      if (f.t > 1.4) this.fade = Math.max(0, 1 - (f.t - 1.4) / 0.4);
      if (f.t > 1.8) { this.fainting = null; this.fade = 0; }
    }
    // win sequence: swirl into the exit
    if (this.winning) {
      const wv = this.winning;
      wv.t += dt;
      const k = Math.min(1, wv.t / 0.8);
      const e = k * k * (3 - 2 * k);
      p.body.x = wv.sx + (wv.x - wv.sx) * e - p.body.w / 2;
      p.body.y = wv.sy + (wv.y - wv.sy) * e - p.body.h / 2;
      p.anim.winT = wv.t;
      if (wv.t > 1.0) this.fade = Math.min(1, (wv.t - 1.0) / 0.3);
      if (wv.t > 1.35 && !wv.done) { wv.done = true; this.game.onLevelComplete && this.game.onLevelComplete(this); }
    }
    this.camera.update(dt, p, this.game.view, this.level);
  }

  // ================================================================================ render
  _buildWaterPath() {
    if (typeof Path2D === 'undefined') return;
    const path = new Path2D();
    let any = false;
    for (let ty = 0; ty < this.h; ty++) for (let tx = 0; tx < this.w; tx++) {
      if (this.level.tile[ty][tx] !== '~') continue;
      const top = this.isSurfaceTile(tx, ty) ? ty * TILE + SURFACE_BAND : ty * TILE;
      path.rect(tx * TILE, top, TILE, (ty + 1) * TILE - top);
      any = true;
    }
    this.waterPath = any ? path : null;
  }

  render(ctx, view, alpha) {
    const cam = this.camera.view(alpha, view.backingScale);
    const ch = this.chapter;
    // background (screen space)
    ctx.fillStyle = this.palette.wallB;
    ctx.fillRect(0, 0, view.w, view.h);
    try { ch.drawBackground && ch.drawBackground(ctx, view, cam, this.time, this); } catch (e) { this._artError(e); }

    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    this.tiles.draw(ctx, 'back', cam, view);
    // hazards (animated)
    const tx0 = Math.max(0, Math.floor(cam.x / TILE)), tx1 = Math.min(this.w - 1, Math.floor((cam.x + view.w) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE)), ty1 = Math.min(this.h - 1, Math.floor((cam.y + view.h) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (this.level.tile[ty][tx] !== '^') continue;
      try { if (ch.drawHazard) ch.drawHazard(ctx, tx * TILE, ty * TILE, this.time, this); else defaultHazard(ctx, tx * TILE, ty * TILE, this.time, this.palette); } catch (e) { this._artError(e); }
    }
    const vis = (e) => e.x < cam.x + view.w + 64 && e.x + e.w > cam.x - 64 && e.y < cam.y + view.h + 64 && e.y + e.h > cam.y - 64;
    const drawE = (filter) => {
      for (const e of this.entities) if (!e.dead && filter(e.layer || 0) && vis(e)) {
        try { ctx.save(); e.draw(ctx, this); ctx.restore(); } catch (err) { ctx.restore(); this._artError(err); }
      }
    };
    drawE((l) => l < 0);
    drawE((l) => l === 0);
    this.player.draw(ctx, alpha);
    drawE((l) => l > 0);
    this.tiles.draw(ctx, 'water', cam, view);
    this._drawCaustics(ctx, cam, view);
    this.waters.draw(ctx, cam, view, this.palette);
    this.particles.draw(ctx, cam, view);
    this.tiles.draw(ctx, 'front', cam, view);
    if (this.game.debug) this._drawDebug(ctx);
    ctx.restore();

    try { ch.drawForeground && ch.drawForeground(ctx, view, cam, this.time, this); } catch (e) { this._artError(e); }
    blit(ctx, vignette(view), 0, 0);
    if (this.flashT > 0) { ctx.globalAlpha = Math.max(0, this.flashT / this.flashD) * 0.7; ctx.fillStyle = this.flashC; ctx.fillRect(0, 0, view.w, view.h); ctx.globalAlpha = 1; }
    if (this.fade > 0) { ctx.globalAlpha = this.fade; ctx.fillStyle = '#04121c'; ctx.fillRect(0, 0, view.w, view.h); ctx.globalAlpha = 1; }
  }

  _drawCaustics(ctx, cam, view) {
    if (!this.waterPath) return;
    if (!this._pattern || this._patternCtx !== ctx) { this._pattern = ctx.createPattern(causticTexture(), 'repeat'); this._patternCtx = ctx; }
    ctx.save();
    ctx.clip(this.waterPath);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this._pattern;
    const t = this.time;
    for (const [sx, sy, a, sc] of [[14, 6, 0.05, 0.6], [-9, 11, 0.035, 0.9]]) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(t * sx + Math.sin(t * 0.7) * 6, t * sy);
      ctx.scale(sc, sc);
      const x = (cam.x - t * sx - 10) / sc, y = (cam.y - t * sy - 10) / sc;
      ctx.fillRect(x, y, (view.w + 20) / sc + 130, (view.h + 20) / sc + 130);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawDebug(ctx) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#00ff88';
    const b = this.player.body;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.strokeStyle = '#ff00ff';
    for (const e of this.entities) ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
  }

  _artError(e) { if (!this._artErrors) { this._artErrors = 0; } if (this._artErrors++ < 5) console.error('art error', e); }
}

let vigCache = null;
function vignette(view) {
  const k = `${view.w}x${view.h}x${view.backingScale}`;
  if (vigCache && vigCache.k === k) return vigCache.c;
  const s = view.backingScale;
  const c = makeCanvas(view.w * s, view.h * s), g = c.getContext('2d');
  g.scale(s, s);
  const r = Math.hypot(view.w, view.h) / 2;
  g.fillStyle = radial(g, view.w / 2, view.h * 0.45, r * 0.45, r * 1.05, ['rgba(0,0,0,0)', 'rgba(10,20,30,.18)', 'rgba(5,10,20,.45)']);
  g.fillRect(0, 0, view.w, view.h);
  vigCache = { k, c };
  return c;
}

export { STEP };
