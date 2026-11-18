// Chapter 2 entities. Bubbles B (fixed, re-forming) and M (emitter) both hand the fish to a
// FreeBubble that carries it. The motion rules live in logic.js so the validator agrees.
//
//   B  soap bubble   — touch to be carried; re-forms 2 s after it pops
//   M  bubble maker  — soap dish that blows a loose bubble every `period` s (props: period, offset, drift)
//   H  shower head   — a falling wet column; pops bubbles (props: period/on/offset for pulsing)
//   W  air current   — pushes bubbles sideways inside a w x h tile zone (props: w, h, vx)
//   D  dripping tap  — drips to catch for +moisture (props: period, offset)
//   K  rubber duck   — decoration that bobs on the water

import { Entity } from '../../core/entity.js';
import { TILE, DROPLET_MOISTURE } from '../../core/constants.js';
import { grad, roundRect, rgba, glow, lighten, darken } from '../../core/draw.js';
import { B, stepCarry, stepFree, touchesHazardTile, streamEnd } from './logic.js';
import { drawBubble, popEffect } from './bubblefx.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function blockedFn(world) {
  return (x0, y0, x1, y1) => {
    const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x1 - 0.001) / TILE);
    const ty0 = Math.floor(y0 / TILE), ty1 = Math.floor((y1 - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (world.tileAt(tx, ty) === '#') return true;
    return false;
  };
}
function hazardNear(world, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
    if (world.tileAt(xx, yy) === '^' && touchesHazardTile(x, y, xx, yy)) return true;
  }
  return false;
}
function streamHit(world, x, y) {
  for (const e of world.entities) {
    if (e.popsBubbles && e.active && !e.dead && x + B.HR > e.x && x - B.HR < e.x + e.w && y + B.HR > e.y && y - B.HR < e.y + e.h) return true;
  }
  return false;
}
function windAt(world, x, y) {
  let v = 0;
  for (const e of world.entities) {
    if (e.isWind && !e.dead && x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h) v += e.vx;
  }
  return clamp(v, -B.MAX_WIND, B.MAX_WIND);
}
function inputDir(world) {
  const i = world.game && world.game.input;
  return i && i.dir ? i.dir() : 0;
}

// ---------------------------------------------------------------------------------------------
/** A live bubble: either loose (floating, capturable) or carrying the fish. */
export class FreeBubble extends Entity {
  static tile = '.';
  layer = 1;
  wet = true;
  jumpPriority = 20;
  init(world) {
    this.mode = this.props.mode || 'free';
    this.home = this.props.home || null;
    this.drift = this.props.drift || 0;
    this.s = { x: this.x + TILE / 2, y: this.y + TILE / 2, vx: 0, vy: 0, t: 0, phase: Math.random() * 6 };
    this.fx = this.s.x; this.fy = this.s.y;
    this.carryT = 0; this.grow = this.mode === 'carry' ? 1 : 0;
    this.syncBox();
    if (this.mode === 'carry') this.capture(world, world.player);
  }
  syncBox() { this.x = this.s.x - TILE / 2; this.y = this.s.y - TILE / 2; this.w = TILE; this.h = TILE; }

  capture(world, p) {
    this.mode = 'carry';
    world._bubbleCarrier = this;
    this.carryT = 0; this.s.t = 0; this.s.vx = 0; this.s.vy = 0;
    this.fx = p.cx; this.fy = p.cy;
    p.buffer = 0; p.coyote = 0;
    p.body.onGround = false; p.body.groundBox = null;
    p.squash(1.25, 0.8);
    world.audio.sfx('bloop', { x: this.s.x });
    world.particles.sparkle(this.s.x, this.s.y, 5, '#ffffff');
    if (!world._bubbleHinted && world.def.id === '2-1') { world._bubbleHinted = true; world.say('MOVE to steer the bubble. JUMP to pop it for a boost!', 3.2); }
  }

  release(world) {
    if (world._bubbleCarrier === this) world._bubbleCarrier = null;
    world._lastPopT = world.time;
    if (this.home) this.home.onCarrierGone();
    this.dead = true;
  }

  pop(world, why) {
    const p = world.player, s = this.s;
    popEffect(world, s.x, s.y, why === 'jump');
    world.audio.sfx(why === 'jump' ? 'pop' : 'pop', { x: s.x, vol: why === 'jump' ? 1 : 0.7, pitch: why === 'jump' ? 1 : 0.8 });
    if (this.mode === 'carry') {
      if (why === 'jump') { p.launch(clamp(s.vx, -B.DRIFT, B.DRIFT), B.POP_VY); world.shake(0.1); }
      else if (why === 'expired') p.launch(s.vx * 0.6, B.SOFT_VY);
      else if (why !== 'silent') p.launch(s.vx * 0.3, B.DROP_VY);
      p.anim.fin = 1;
      this.release(world);
    } else this.dead = true;
  }

  update(dt, world) {
    this.time += dt;
    const s = this.s;
    if (this.mode === 'carry') {
      const p = world.player;
      if (!p.alive || world.fainting || world.winning) { this.release(world); return; }
      this.carryT += dt;
      this.grow = Math.min(1, this.grow + dt * 8);
      const ev = stepCarry(s, dt, inputDir(world), windAt(world, s.x, s.y) + this.drift, blockedFn(world));
      // the fish is drawn in towards the bubble centre, then locked there
      if (this.carryT < 0.25) { const k = Math.min(1, dt * 20); this.fx += (s.x - this.fx) * k; this.fy += (s.y - this.fy) * k; } else { this.fx = s.x; this.fy = s.y; }
      const b = p.body;
      b.x = this.fx - b.w / 2; b.y = this.fy - b.h / 2; b.vx = 0; b.vy = 0; b.onGround = false; b.groundBox = null;
      p.coyote = 0; p.refill();
      this.syncBox();
      if (Math.random() < dt * 5) world.particles.bubbles(s.x + (Math.random() - 0.5) * 14, s.y + 12, 1);
      const why = ev.ceiling ? 'ceiling' : hazardNear(world, s.x, s.y) ? 'hazard' : streamHit(world, s.x, s.y) ? 'shower' : ev.expired ? 'expired' : null;
      if (why) this.pop(world, why);
      return;
    }
    // loose bubble
    this.grow = Math.min(1, this.grow + dt * 4);
    const ev = stepFree(s, dt, windAt(world, s.x, s.y) + this.drift, blockedFn(world));
    this.syncBox();
    if (ev.ceiling || ev.expired || hazardNear(world, s.x, s.y) || streamHit(world, s.x, s.y)) this.pop(world, 'loose');
  }

  onPlayerOverlap(player, world) {
    if (this.mode !== 'free' || this.grow < 0.5 || world._bubbleCarrier || !player.alive || world.fainting) return;
    if (world.time - (world._lastPopT ?? -9) < 0.3) return;
    this.capture(world, player);
  }
  onJump(player, world) {
    if (this.mode !== 'carry') return false;
    if (this.carryT >= B.GRACE) this.pop(world, 'jump');
    return true; // always swallow the press while carried (never fall through to a hop)
  }
  onRespawn(world) { if (world._bubbleCarrier === this) world._bubbleCarrier = null; this.dead = true; }

  draw(ctx, world) {
    const s = this.s, t = this.time;
    if (this.mode === 'carry') {
      const left = B.LIFE - this.carryT;
      const low = left < 0.9;
      const wob = Math.sin(t * 7) * 0.035, flick = low ? 0.7 + 0.3 * Math.sin(t * 40) : 1;
      const r = 13 + (B.DRAW_R - 13) * this.grow;
      drawBubble(ctx, s.x, s.y, r, { sx: 1 + wob, sy: 1 - wob, alpha: flick, rot: t * 0.3 });
      // thin air gauge: shrinks as the bubble runs out
      ctx.save();
      ctx.strokeStyle = low ? 'rgba(255,170,190,.95)' : 'rgba(255,255,255,.6)';
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(s.x, s.y, B.DRAW_R + 3.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / B.LIFE)); ctx.stroke();
      ctx.restore();
    } else {
      const left = B.FREE_LIFE - s.t;
      const flick = left < 1 ? 0.5 + 0.5 * Math.sin(t * 30) : 1;
      const wob = Math.sin(t * 5 + s.phase) * 0.05;
      drawBubble(ctx, s.x, s.y, B.IDLE_R * (0.55 + 0.45 * this.grow), { sx: 1 + wob, sy: 1 - wob, alpha: flick * 0.95, rot: t * 0.2 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
/** B — a fixed soap bubble that re-forms where it was. */
export class Bubble extends Entity {
  static tile = '.';
  layer = 1;
  wet = true;
  init() { this.state = 'idle'; this.rt = 0; this.appear = 1; this.phase = this.tx * 1.7 + this.ty * 0.9; }
  update(dt, world) {
    this.time += dt;
    if (this.state === 'gone') {
      this.rt -= dt;
      if (this.rt <= 0 && !world._bubbleCarrier) { this.state = 'idle'; this.appear = 0; this.wet = true; world.particles.sparkle(this.cx, this.cy, 4, '#ffffff'); world.audio.sfx('blow', { vol: 0.4, x: this.cx }); }
    } else if (this.state === 'idle') this.appear = Math.min(1, this.appear + dt * 3);
  }
  onPlayerOverlap(player, world) {
    if (this.state !== 'idle' || world._bubbleCarrier || !player.alive || world.fainting || world.winning) return;
    if (world.time - (world._lastPopT ?? -9) < 0.3) return;
    this.state = 'busy'; this.wet = false;
    world.spawn(new FreeBubble(world, this.x, this.y, { mode: 'carry', home: this }));
  }
  onCarrierGone() { this.state = 'gone'; this.rt = B.RESPAWN; }
  onRespawn() { this.state = 'idle'; this.appear = 1; this.wet = true; }
  draw(ctx) {
    const t = this.time + this.phase;
    if (this.state === 'idle') {
      const bob = Math.sin(t * 2) * 2, wob = Math.sin(t * 3.1) * 0.05;
      drawBubble(ctx, this.cx, this.cy + bob, B.IDLE_R * (0.6 + 0.4 * this.appear) + 0.6, { sx: 1 + wob, sy: 1 - wob, rot: Math.sin(t) * 0.3 });
    } else {
      // a faint dotted ring where it will re-form
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(this.cx, this.cy, B.IDLE_R - 1, t, t + 6.28); ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
/** M — bubble maker: a soap dish with a sudsy lump that blows a bubble every `period` seconds. */
export class Maker extends Entity {
  static tile = '.';
  layer = -1;
  wet = true; // the dish is full of soapy water: standing in the nozzle cell keeps you moist
  init() { this.period = this.props.period || 2.6; this.t = this.props.offset ?? this.period * 0.4; this.drift = this.props.drift || 0; }
  update(dt, world) {
    this.time += dt; this.t += dt;
    if (this.t >= this.period) {
      this.t -= this.period;
      world.spawn(new FreeBubble(world, this.x, this.y, { drift: this.drift }));
      const p = world.player;
      if (Math.abs(p.cx - this.cx) < 340 && Math.abs(p.cy - this.cy) < 260) world.audio.sfx('blow', { vol: 0.5, x: this.cx });
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y, k = this.t / this.period;
    // soap dish
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(x + 12, y + 23, 11, 2.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = grad(ctx, x, y + 15, x, y + 24, ['#ffffff', '#c9d6df']);
    ctx.beginPath(); ctx.moveTo(x + 1, y + 17); ctx.lineTo(x + 23, y + 17); ctx.quadraticCurveTo(x + 21, y + 24, x + 12, y + 24); ctx.quadraticCurveTo(x + 3, y + 24, x + 1, y + 17); ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,170,.5)'; ctx.lineWidth = 1; ctx.stroke();
    // suds
    for (const [dx, dy, r] of [[7, 0, 4.5], [13, -2, 5.5], [18, 0, 4]]) {
      ctx.fillStyle = grad(ctx, x + dx - r, y + 14 + dy - r, x + dx + r, y + 14 + dy + r, ['#ffffff', '#e4f3fb']);
      ctx.beginPath(); ctx.arc(x + dx, y + 14 + dy, r, 0, 7); ctx.fill();
    }
    // the bubble being blown
    const e = k * k * (3 - 2 * k);
    if (e > 0.04) {
      const r = 2 + e * (B.IDLE_R - 2), by = y + 12 - e * 2 + Math.sin(this.time * 12) * 0.6 * e;
      drawBubble(ctx, x + 12, by, r, { alpha: 0.5 + 0.5 * e });
    }
    // charging pip
    glow(ctx, x + 12, y + 14, 12 + 6 * e, '#ffffff', 0.18 + 0.3 * e);
  }
}

// ---------------------------------------------------------------------------------------------
/** H — shower head. A wet column of water falls to the first floor / shelf / water below. */
export class Shower extends Entity {
  static tile = '.';
  layer = 1;
  popsBubbles = true;
  wet = true;
  active = true;
  init(world) {
    this.period = this.props.period || 0; this.on = this.props.on || 0; this.off0 = this.props.offset || 0;
    const end = streamEnd(this.tx, this.ty, (x, y) => world.tileAt(x, y), world.h);
    this.bottom = (end + 1) * TILE;
    const top = this.y + 16;
    this.x0 = this.x; // keep for draw
    this.x = this.tx * TILE + 5; this.w = 14; this.y = top; this.h = Math.max(2, this.bottom - top);
    this.flow = 1;
    this.seed = Math.random() * 10;
  }
  update(dt, world) {
    this.time += dt;
    if (this.period) this.active = ((this.time + this.off0) % this.period) < this.on;
    this.flow += ((this.active ? 1 : 0) - this.flow) * Math.min(1, dt * 6);
    this.wet = this.active;
    if (this.active && Math.random() < dt * 14) {
      world.particles.emit({ x: this.x + 7 + (Math.random() - 0.5) * 12, y: this.bottom - 1, count: 1, kind: 'drop', color: world.palette.water, vy: -90, spread: 70, gravity: 700, life: 0.35, size: 1.2 });
      if (Math.random() < 0.3) world.particles.steam(this.x + 7, this.bottom - 6, 1);
    }
  }
  draw(ctx) {
    const hx = this.tx * TILE + 12, hy = this.ty * TILE;
    // pipe arm from the ceiling/wall and the rose
    ctx.fillStyle = grad(ctx, hx - 2, 0, hx + 2, 0, ['#a9b4be', '#ffffff', '#9aa5af']);
    ctx.fillRect(hx - 2, hy - 8, 4, 14);
    ctx.fillStyle = grad(ctx, hx - 11, hy + 4, hx + 11, hy + 12, ['#f7fafc', '#98a4af']);
    ctx.beginPath(); ctx.moveTo(hx - 4, hy + 5); ctx.lineTo(hx + 4, hy + 5); ctx.lineTo(hx + 12, hy + 15); ctx.lineTo(hx - 12, hy + 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(60,90,110,.55)';
    for (let i = -9; i <= 9; i += 3) ctx.fillRect(hx + i - 0.5, hy + 13.5, 1.4, 1.6);
    if (this.flow < 0.05) return;
    // falling streaks
    const x0 = this.x, w = this.w, y0 = this.y, y1 = this.bottom;
    ctx.save();
    ctx.globalAlpha = 0.9 * this.flow;
    ctx.fillStyle = grad(ctx, 0, y0, 0, y1, ['rgba(110,195,238,.40)', 'rgba(90,180,232,.32)']);
    ctx.fillRect(x0, y0, w, y1 - y0);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    const T = this.time * 190;
    for (let i = 0; i < 6; i++) {
      const lx = x0 + 1.5 + i * 2.4 + ((i * 7) % 3) * 0.3, len = 9 + ((i * 5) % 4) * 3, span = (y1 - y0) + len;
      let yy = (T * (0.8 + (i % 3) * 0.12) + i * 37) % span;
      ctx.fillRect(lx, y0 + yy - len, 1.2, Math.min(len, Math.max(0, y1 - (y0 + yy - len))));
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
/** W — air current zone: warm draught that pushes bubbles sideways. */
export class Wind extends Entity {
  static tile = '.';
  isWind = true;
  layer = -1;
  init() {
    this.vx = clamp(this.props.vx ?? 24, -B.MAX_WIND, B.MAX_WIND);
    this.zw = this.props.w || 4; this.zh = this.props.h || 3;
    this.w = this.zw * TILE; this.h = this.zh * TILE;
  }
  update(dt) { this.time += dt; }
  draw(ctx) {
    const dirn = Math.sign(this.vx) || 1, spd = Math.abs(this.vx);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
    ctx.fillStyle = 'rgba(190,160,235,.10)'; ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeStyle = 'rgba(140,105,205,.7)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (let i = 0; i < this.zh * 2; i++) {
      const yy = this.y + 6 + i * (this.h / (this.zh * 2)) + Math.sin(i * 2.1) * 3;
      const off = ((this.time * spd * 1.6 * dirn + i * 41) % (this.w + 40) + (this.w + 40)) % (this.w + 40) - 20;
      const sx = dirn > 0 ? this.x + off : this.x + this.w - off;
      ctx.globalAlpha = 0.45 + 0.3 * Math.sin(this.time * 2 + i);
      ctx.beginPath(); ctx.moveTo(sx, yy); ctx.bezierCurveTo(sx + 8 * dirn, yy - 3, sx + 16 * dirn, yy + 3, sx + 24 * dirn, yy); ctx.stroke();
    }
    ctx.restore();
    // vent grille at the upwind end
    const vx0 = dirn > 0 ? this.x - 3 : this.x + this.w - 5;
    ctx.fillStyle = '#c3ced6'; roundRect(ctx, vx0, this.y + this.h / 2 - 14, 8, 28, 3); ctx.fill();
    ctx.strokeStyle = '#7e8b95'; ctx.lineWidth = 1;
    for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(vx0 + 1, this.y + this.h / 2 + i); ctx.lineTo(vx0 + 7, this.y + this.h / 2 + i); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------------------------------------
/** A falling drip from a tub tap. Catch it for +moisture. */
class Drip extends Entity {
  layer = 1;
  init() { this.w = 6; this.h = 9; this.vy = 30; }
  update(dt, world) {
    this.vy = Math.min(this.vy + 900 * dt, 520);
    this.y += this.vy * dt;
    const tx = Math.floor((this.x + 3) / TILE), ty = Math.floor((this.y + this.h) / TILE);
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=' || c === '~' || c === '-' || this.y > world.level.pxH) {
      const sy = ty * TILE;
      world.particles.splash(this.x + 3, sy, 0.3, world.palette.water);
      if (c === '~') world.rippleAt(this.x + 3, sy, 0.6);
      world.audio.sfx('plink', { vol: 0.25, pitch: 0.9 + Math.random() * 0.3, x: this.x });
      this.dead = true;
    }
  }
  onPlayerOverlap(player, world) {
    player.addMoisture(DROPLET_MOISTURE);
    world.particles.sparkle(this.x + 3, this.y + 4, 6, '#bff3ff');
    world.audio.sfx('drip');
    this.dead = true;
  }
  draw(ctx, world) {
    const cx = this.x + 3, y = this.y;
    ctx.fillStyle = grad(ctx, cx - 3, y, cx + 3, y + 9, ['#e9fbff', world.palette.water]);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + 3.5, y + 5, cx + 3, y + 7); ctx.arc(cx, y + 6.5, 3, 0.2, Math.PI - 0.2); ctx.quadraticCurveTo(cx - 3.5, y + 5, cx, y); ctx.fill();
  }
}

/** D — dripping tub tap (chrome swan neck). Drips fall straight down. */
export class TubTap extends Entity {
  static tile = '.';
  init() { this.period = this.props.period || 1.3; this.t = this.props.offset || 0; this.wobble = 0; }
  update(dt, world) {
    this.t += dt; this.wobble = Math.max(0, this.wobble - dt * 3);
    if (this.t >= this.period) { this.t -= this.period; this.wobble = 1; world.spawn(new Drip(world, this.cx - 3, this.y + 17)); }
  }
  draw(ctx, world) {
    const x = this.x, y = this.y;
    ctx.fillStyle = grad(ctx, x + 9, 0, x + 15, 0, ['#8d97a3', '#f8fbfd', '#98a2ad']);
    ctx.fillRect(x + 10, y - 6, 5, 11);
    ctx.strokeStyle = '#dfe6ec'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 12, y + 2); ctx.quadraticCurveTo(x + 12, y + 9, x + 12, y + 12); ctx.stroke();
    ctx.fillStyle = grad(ctx, 0, y + 8, 0, y + 16, ['#f8fbfd', '#8d97a3']);
    roundRect(ctx, x + 8, y + 9, 8, 7, 3); ctx.fill();
    ctx.fillStyle = '#ff9ccf'; ctx.beginPath(); ctx.arc(x + 5, y + 1, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#d6dde3'; ctx.fillRect(x + 5, y + 2, 5, 2);
    const k = this.t / this.period, r = 1 + 2.2 * k * k + this.wobble * 0.5;
    ctx.fillStyle = rgba(world.palette.water, 0.9);
    ctx.beginPath(); ctx.arc(this.cx, y + 16 + r * 0.6, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(this.cx - r * 0.35, y + 15.5 + r * 0.4, r * 0.3, 0, 7); ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
/** K — a rubber duck bobbing on the water (decoration, sits in the air cell above the surface). */
export class Duck extends Entity {
  static tile = '.';
  layer = -1;
  init() { this.ph = this.tx * 0.77; }
  update(dt) { this.time += dt; }
  draw(ctx) {
    const x = this.x + 12, y = this.y + 21 + Math.sin(this.time * 1.6 + this.ph) * 1.6;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(Math.sin(this.time * 1.2 + this.ph) * 0.07);
    ctx.fillStyle = grad(ctx, 0, -10, 0, 4, ['#ffe77a', '#ffc933']);
    ctx.beginPath(); ctx.ellipse(0, -2, 10, 6.5, 0, 0, 7); ctx.fill();            // body
    ctx.beginPath(); ctx.moveTo(6, -4); ctx.quadraticCurveTo(10, -9, 6, -12); ctx.lineTo(8, -2); ctx.closePath(); ctx.fill(); // tail
    ctx.beginPath(); ctx.arc(-5, -9, 5, 0, 7); ctx.fill();                          // head
    ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(-10.5, -8.5, 3.6, 1.8, 0.1, 0, 7); ctx.fill(); // beak
    ctx.fillStyle = '#2a2020'; ctx.beginPath(); ctx.arc(-6, -10, 1, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-1, -4.5, 4.5, 1.6, -0.2, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(190,120,20,.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(1, -1, 6, 3.4, 0.1, 0.4, 2.6); ctx.stroke();
    ctx.restore();
  }
}
