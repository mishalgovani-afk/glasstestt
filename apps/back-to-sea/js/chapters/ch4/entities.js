// Chapter 4 entities: valves (V), tanks (T), gates (G), leaking pipes (D), steam vents (Y),
// plus their validator reach rules. Nothing here touches the DOM at import time.
//
// How the pieces fit (see also tests/ch4.test.mjs):
//   V  valve wheel. JUMP while touching it toggles its link(s). props: { link | links:[..],
//      timer?: s (drifts back), pipe?: [[tx,ty],..] (decor pipe), opens?: [{x,y,t,with?}] (reach) }
//   T  tank controller, placed inside a wall cell (static tile '#'). props: { id, x0, x1, off, on,
//      floor, rise?, fall?, inlet?: [tx,ty] }. The map shows the OFF state; when link `id` is ON the
//      water surface moves (smoothly) from row `off` to row `on`.
//   G  gate controller at the top-left '#' cell of a steel door. props: { id, w, h }.
//   D  leaking pipe that drips (refill spot).  Y  steam vent that periodically jets (hazard).

import { Entity } from '../../core/entity.js';
import { TILE, DROPLET_MOISTURE } from '../../core/constants.js';
import { grad, rgba, mix, lighten, darken, glow, roundRect } from '../../core/draw.js';
import { Plumbing, Fill, doorRowBlocked } from './logic.js';

const WATER = '#4fa3b8';
const BRASS = '#d9a441';
const COPPER = '#b8683a';

/** One Plumbing per world; checkpoints snapshot it and respawns restore it. */
export function getPlumb(world) {
  if (!world._plumb) {
    const p = new Plumbing();
    world._plumb = p;
    world.on('checkpoint', () => p.snapshot());
    world.on('respawn', () => p.restore());
  }
  return world._plumb;
}
function tickPlumb(world, dt) {
  const p = getPlumb(world);
  if (p._tickT !== world.time) { p._tickT = world.time; return p.update(dt); }
  return [];
}
const inView = (world, x, y, pad = 80) => {
  const c = world.camera, v = world.game.view;
  return x > c.x - pad && x < c.x + v.w + pad && y > c.y - pad && y < c.y + v.h + pad;
};

// ------------------------------------------------------------------------------------------ pipes
function drawPipe(ctx, pts, flow, time) {
  if (!pts || pts.length < 2) return;
  const P = pts.map(([x, y]) => [x * TILE + TILE / 2, y * TILE + TILE / 2]);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 8; ctx.stroke();
  ctx.strokeStyle = COPPER; ctx.lineWidth = 6; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,214,170,.55)'; ctx.lineWidth = 1.6;
  ctx.save(); ctx.translate(-1, -1.5); ctx.stroke(); ctx.restore();
  // flanges at the corners
  ctx.fillStyle = darken(COPPER, 0.25);
  for (let i = 1; i < P.length - 1; i++) { ctx.beginPath(); ctx.arc(P[i][0], P[i][1], 4.6, 0, 7); ctx.fill(); }
  // flow pulses
  if (flow) {
    let len = 0; const seg = [];
    for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(l); len += l; }
    ctx.fillStyle = 'rgba(190,240,255,.9)';
    for (let k = 0; k < len / 34; k++) {
      let d = ((time * 60 + k * 34) % len);
      let i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const f = d / seg[i];
      ctx.beginPath(); ctx.arc(P[i][0] + (P[i + 1][0] - P[i][0]) * f, P[i][1] + (P[i + 1][1] - P[i][1]) * f, 1.8, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------- Valve
export class Valve extends Entity {
  jumpPriority = 20;
  init(world) {
    const p = this.props;
    this.plumb = getPlumb(world);
    this.ids = p.links || [p.link || 'a'];
    this.dur = p.timer || 0;
    this.setBox(3, 0, 18, 24);
    this.ang = 0; this.cool = 0; this.used = false; this.prevOn = false; this.shake = 0;
    this.light = { x: this.cx, y: this.y + 10, r: 78 };
  }
  get on() { return this.plumb.isOn(this.ids[0]); }
  onJump(player, world) {
    if (this.cool > 0) return false;           // never eat stroke presses while cooling down
    // Holding ANY direction means "hop/swim on": otherwise waiting at the wheel and then hopping
    // away would turn it straight back. Stand still and JUMP to turn it.
    const inp = world.game && world.game.input;
    const dir = inp && inp.dir ? inp.dir() : 0;
    if (dir !== 0) return false;
    this.cool = 0.5; this.used = true; this.shake = 1;
    const next = !this.on;
    for (const id of this.ids) this.plumb.set(id, next, next ? this.dur : 0);
    world.audio.sfx('clank', { x: this.cx, pitch: next ? 1 : 0.8 });
    world.audio.sfx('rumble', { x: this.cx, vol: 0.7 });
    world.shake(0.18);
    world.particles.emit({ x: this.cx, y: this.y + 9, count: 7, kind: 'spark', color: '#ffd9a0', speed: 70, gravity: 300, life: 0.4, size: 1.4 });
    player.squash(1.15, 0.85);
    return true;
  }
  update(dt, world) {
    this.time += dt;
    this.cool = Math.max(0, this.cool - dt);
    this.shake = Math.max(0, this.shake - dt * 4);
    const expired = tickPlumb(world, dt);
    const on = this.on;
    if (on !== this.prevOn) {
      if (!on && expired.some((id) => this.ids.includes(id))) world.audio.sfx('creak', { x: this.cx });
      this.prevOn = on;
    }
    const target = on ? Math.PI * 4 : 0;
    const d = target - this.ang;
    this.ang += Math.sign(d) * Math.min(Math.abs(d), dt * 14 * (on ? 1 : 0.6));
    this.near = world.player && Math.abs(world.player.cx - this.cx) < 64 && Math.abs(world.player.cy - this.cy) < 56;
  }
  draw(ctx, world) {
    const x = this.x - 3, y = this.y, cx = this.cx, wy = y + 9;
    const on = this.on;
    if (this.props.pipe) drawPipe(ctx, this.props.pipe, on || this.ids.some((id) => this.plumb.fraction(id) > 0), this.time);
    glow(ctx, cx, wy, 30, on ? '#7dffb0' : '#ffb347', 0.22);
    // stand pipe + flange
    ctx.fillStyle = grad(ctx, cx - 3, 0, cx + 3, 0, [darken(COPPER, 0.2), lighten(COPPER, 0.3), darken(COPPER, 0.3)]);
    ctx.fillRect(cx - 3, wy, 6, y + TILE - wy);
    ctx.fillStyle = '#3a3f4a'; roundRect(ctx, cx - 8, y + TILE - 4, 16, 4, 1.5); ctx.fill();
    // wheel
    ctx.save();
    ctx.translate(cx + (this.shake ? Math.sin(this.time * 70) * this.shake * 1.2 : 0), wy);
    ctx.rotate(this.ang);
    ctx.strokeStyle = on ? '#58c88a' : '#d4502c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, 7); ctx.stroke();
    ctx.strokeStyle = on ? '#2d7a52' : '#8a2d18'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.stroke();
    ctx.strokeStyle = BRASS; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * -8, Math.sin(a) * -8); ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.stroke(); }
    ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(8.5, 0, 1.6, 0, 7); ctx.fill();
    ctx.restore();
    // timer ring
    const f = this.dur ? this.plumb.fraction(this.ids[0]) : 0;
    if (f > 0) {
      ctx.strokeStyle = f < 0.25 ? '#ff7a5a' : '#bff6ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, wy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
    }
    // status lamp
    ctx.fillStyle = on ? '#7dffb0' : '#ff6a4a'; ctx.beginPath(); ctx.arc(cx + 9, y + 19, 1.8, 0, 7); ctx.fill();
    // hint chevron
    if (this.near && !this.used) {
      const ay = y - 8 + Math.sin(this.time * 5) * 2;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath(); ctx.moveTo(cx - 5, ay - 6); ctx.lineTo(cx + 5, ay - 6); ctx.lineTo(cx, ay); ctx.closePath(); ctx.fill();
    }
  }
}

// -------------------------------------------------------------------------------------------- Tank
export class Tank extends Entity {
  static tile = '#';
  init(world) {
    const p = this.props;
    this.plumb = getPlumb(world);
    this.fill = new Fill({ off: p.off, on: p.on, floor: p.floor, rise: p.rise || 2.8, fall: p.fall || 3 });
    this.applied = this.fill.waterRow;
    this.epoch = this.plumb.epoch;
    this.snd = 0; this.warnT = 0; this.warn = false; this.px = (p.x0 + p.x1 + 1) * TILE / 2;
    this.layer = 1;
    this.setBox(0, 0, TILE, TILE);
  }
  _row(world, r, water) {
    const p = this.props;
    for (let x = p.x0; x <= p.x1; x++) {
      const c = world.tileAt(x, r);
      if (c === '#' || c === '=' || c === '^') continue;
      world.setTile(x, r, water ? '~' : '.');
    }
  }
  _apply(world) {
    const nw = this.fill.waterRow;
    if (nw < this.applied) for (let r = nw; r < this.applied; r++) this._row(world, r, true);
    else if (nw > this.applied) for (let r = this.applied; r < nw; r++) this._row(world, r, false);
    this.applied = nw;
  }
  update(dt, world) {
    this.time += dt;
    tickPlumb(world, dt);
    const on = this.plumb.isOn(this.props.id);
    if (this.epoch !== this.plumb.epoch) { this.epoch = this.plumb.epoch; this.fill.snap(on); this._apply(world); return; }
    this.fill.setTarget(on);
    const left = this.plumb.left(this.props.id);
    if (left > 0 && left < 4.5) {                       // timed valve about to drift back: warn
      this.warnT -= dt;
      if (this.warnT <= 0) { this.warnT = 0.75; world.audio.sfx('tick', { x: this.px }); }
    } else this.warnT = 0;
    this.warn = left > 0 && left < 4.5;
    if (this.fill.update(dt)) {
      this._apply(world);
      this.snd -= dt;
      if (this.snd <= 0) {
        this.snd = 0.5;
        world.audio.sfx('rumble', { x: this.px, vol: 0.5 });
        world.shake(0.04);
      }
      const y = this.fill.surf * TILE, p = this.props;
      if (Math.random() < dt * 14) world.particles.bubbles((p.x0 + Math.random() * (p.x1 - p.x0 + 1)) * TILE, y + 10, 1);
      if (this.fill.rising && p.inlet && Math.random() < dt * 20) world.particles.splash((p.inlet[0] + 0.5) * TILE, y, 0.25, world.palette.water);
    }
  }
  draw(ctx, world) {
    const p = this.props, f = this.fill;
    if (!inView(world, this.px, this.y, 400)) return;
    // partial water row
    if (f.partial > 0.02) world.drawWaterRect(ctx, p.x0 * TILE, f.surf * TILE, (p.x1 - p.x0 + 1) * TILE, f.partial * TILE, 0.5);
    // inlet pipe + stream
    if (p.inlet) {
      const ix = (p.inlet[0] + 0.5) * TILE, iy = p.inlet[1] * TILE;
      ctx.fillStyle = grad(ctx, ix - 5, 0, ix + 5, 0, [darken(COPPER, 0.2), lighten(COPPER, 0.3), darken(COPPER, 0.3)]);
      roundRect(ctx, ix - 6, iy + 4, 12, 16, 3); ctx.fill();
      ctx.fillStyle = darken(COPPER, 0.4); ctx.fillRect(ix - 7, iy + 17, 14, 3);
      if (f.rising || (this.plumb.isOn(p.id) && f.moving)) {
        const y1 = Math.max(iy + 20, f.surf * TILE);
        ctx.strokeStyle = 'rgba(200,245,255,.8)'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
        ctx.setLineDash([9, 5]); ctx.lineDashOffset = -this.time * 90;
        ctx.beginPath(); ctx.moveTo(ix, iy + 20); ctx.lineTo(ix, y1); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // gauge on the wall cell
    const gx = this.x + 12, gy = this.y + 12;
    ctx.fillStyle = '#1b1f27'; ctx.beginPath(); ctx.arc(gx, gy, 9.5, 0, 7); ctx.fill();
    ctx.strokeStyle = this.warn && Math.sin(this.time * 12) > 0 ? '#ff5a3a' : BRASS; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e9e3cf'; ctx.beginPath(); ctx.arc(gx, gy, 7.4, 0, 7); ctx.fill();
    const full = f.fullness;
    ctx.strokeStyle = 'rgba(40,40,40,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const a = Math.PI * (0.8 + 1.4 * i / 4); ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * 5.4, gy + Math.sin(a) * 5.4); ctx.lineTo(gx + Math.cos(a) * 7, gy + Math.sin(a) * 7); ctx.stroke(); }
    const a = Math.PI * (0.8 + 1.4 * full);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * 6.4, gy + Math.sin(a) * 6.4); ctx.stroke();
  }
}

// -------------------------------------------------------------------------------------------- Gate
export class Gate extends Entity {
  static tile = '#';
  init(world) {
    const p = this.props;
    this.plumb = getPlumb(world);
    this.gw = p.w || 1; this.gh = p.h || 1;
    this.ratio = 1; this.epoch = this.plumb.epoch; this.snd = 0;
    this.setBox(0, 0, this.gw * TILE, this.gh * TILE);
    this.layer = 0;
  }
  _rows(world, snap) {
    const pl = world.player;
    for (let k = 0; k < this.gh; k++) {
      const block = doorRowBlocked(k, this.gh, this.ratio);
      const y = this.ty + k;
      for (let i = 0; i < this.gw; i++) {
        const x = this.tx + i, c = world.tileAt(x, y);
        if (block && c !== '#') {
          if (!snap && pl && pl.x < (x + 1) * TILE && pl.x + pl.w > x * TILE && pl.y < (y + 1) * TILE && pl.y + pl.h > y * TILE) return false;
          world.setTile(x, y, '#');
        } else if (!block && c === '#') world.setTile(x, y, '.');
      }
    }
    return true;
  }
  update(dt, world) {
    this.time += dt;
    tickPlumb(world, dt);
    const on = this.plumb.isOn(this.props.id);
    if (this.epoch !== this.plumb.epoch) { this.epoch = this.plumb.epoch; this.ratio = on ? 0 : 1; this._rows(world, true); return; }
    const target = on ? 0 : 1;
    if (this.ratio === target) return;
    const old = this.ratio;
    const step = dt * (on ? 1.2 : 0.9);
    this.ratio = on ? Math.max(0, this.ratio - step) : Math.min(1, this.ratio + step);
    if (!this._rows(world, false)) this.ratio = old;        // the fish is in the way: hold
    this.snd -= dt;
    if (this.snd <= 0) { this.snd = 0.35; world.audio.sfx('rumble', { x: this.cx, vol: 0.45 }); world.particles.dust(this.cx, this.y + this.ratio * this.gh * TILE, 2); }
    if (this.ratio === target) { world.audio.sfx('clank', { x: this.cx, pitch: 0.7 }); world.shake(0.2); }
  }
  draw(ctx, world) {
    const x = this.x, y = this.y, W = this.gw * TILE, H = this.gh * TILE, on = this.plumb.isOn(this.props.id);
    // rails
    ctx.fillStyle = '#2a2f3a'; ctx.fillRect(x - 3, y - 2, 4, H + 2); ctx.fillRect(x + W - 1, y - 2, 4, H + 2);
    ctx.fillStyle = '#586071'; ctx.fillRect(x - 3, y - 2, 1.5, H + 2); ctx.fillRect(x + W + 1.5, y - 2, 1.5, H + 2);
    // housing above
    ctx.fillStyle = '#3b4250'; roundRect(ctx, x - 5, y - 8, W + 10, 8, 2); ctx.fill();
    ctx.fillStyle = on ? '#7dffb0' : '#ff5a3a'; ctx.beginPath(); ctx.arc(x + W / 2, y - 4, 2, 0, 7); ctx.fill();
    glow(ctx, x + W / 2, y - 4, 16, on ? '#7dffb0' : '#ff5a3a', 0.3);
    const dh = this.ratio * H;
    if (dh > 0.5) {
      ctx.fillStyle = grad(ctx, x, 0, x + W, 0, ['#6c7686', '#8b95a5', '#5e6878']);
      ctx.fillRect(x, y, W, dh);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      for (let yy = y + 12; yy < y + dh; yy += 12) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + W, yy); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let yy = y + 6; yy < y + dh; yy += 12) for (let xx = x + 4; xx < x + W; xx += 12) { ctx.beginPath(); ctx.arc(xx, yy, 1.3, 0, 7); ctx.fill(); }
      // hazard stripe on the bottom edge
      const by = y + dh - 6;
      ctx.save(); ctx.beginPath(); ctx.rect(x, by, W, 6); ctx.clip();
      ctx.fillStyle = '#e8b73a'; ctx.fillRect(x, by, W, 6);
      ctx.fillStyle = '#23262c';
      for (let xx = x - 6; xx < x + W + 6; xx += 10) { ctx.beginPath(); ctx.moveTo(xx, by + 6); ctx.lineTo(xx + 5, by + 6); ctx.lineTo(xx + 11, by); ctx.lineTo(xx + 6, by); ctx.fill(); }
      ctx.restore();
    }
  }
}

// --------------------------------------------------------------------------------------- Drip pipe
class Drop extends Entity {
  init() { this.w = 6; this.h = 9; this.vy = 30; this.layer = 1; }
  update(dt, world) {
    this.vy = Math.min(this.vy + 900 * dt, 520);
    this.y += this.vy * dt;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.y + this.h) / TILE);
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=' || c === '~' || c === '-' || this.y > world.level.pxH) {
      const sy = ty * TILE + (c === '-' ? 18 : 0);
      world.particles.splash(this.cx, sy, 0.3, world.palette.water);
      if (c === '~') world.rippleAt(this.cx, sy, 0.6);
      world.audio.sfx('plink', { vol: 0.25, pitch: 0.7 + Math.random() * 0.3, x: this.cx });
      this.dead = true;
    }
  }
  onPlayerOverlap(player, world) {
    player.addMoisture(DROPLET_MOISTURE);
    world.particles.sparkle(this.cx, this.cy, 6, '#bff3ff');
    world.audio.sfx('drip');
    this.dead = true;
  }
  draw(ctx) {
    const { cx, y } = this;
    ctx.fillStyle = grad(ctx, cx - 3, y, cx + 3, y + 9, ['#e9fbff', WATER]);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + 3.5, y + 5, cx + 3, y + 7);
    ctx.arc(cx, y + 6.5, 3, 0.2, Math.PI - 0.2); ctx.quadraticCurveTo(cx - 3.5, y + 5, cx, y); ctx.fill();
  }
}

export class DripPipe extends Entity {
  static tile = '.';
  init() { this.period = this.props.period || 1.4; this.t = this.props.offset || 0; this.wob = 0; }
  update(dt, world) {
    this.t += dt; this.wob = Math.max(0, this.wob - dt * 3);
    if (this.t >= this.period) { this.t -= this.period; this.wob = 1; world.spawn(new Drop(world, this.cx - 3, this.y + 17)); }
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = grad(ctx, x + 6, 0, x + 18, 0, [darken(COPPER, 0.25), lighten(COPPER, 0.3), darken(COPPER, 0.3)]);
    ctx.fillRect(x + 9, y - 4, 6, 14);
    roundRect(ctx, x + 6, y + 8, 12, 6, 2); ctx.fill();
    ctx.fillStyle = darken(COPPER, 0.5); ctx.fillRect(x + 5, y + 2, 14, 2.5);
    const k = this.t / this.period, r = 1 + 2 * k * k + this.wob * 0.5;
    ctx.fillStyle = rgba(WATER, 0.9); ctx.beginPath(); ctx.arc(this.cx, y + 15 + r * 0.6, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(this.cx - r * 0.35, y + 14.5 + r * 0.4, r * 0.3, 0, 7); ctx.fill();
  }
}

// -------------------------------------------------------------------------------------- Steam vent
export class Vent extends Entity {
  static tile = '.';
  hazard = false;
  init() {
    const p = this.props;
    this.period = p.period || 4.4; this.warn = p.warn || 0.9; this.jetT = p.jet || 1.3;
    this.rows = p.rows || 2;
    this.t = p.offset || 0;
    this.setBox(5, TILE - this.rows * TILE, 14, this.rows * TILE);
    this.phase = 'idle';
    this.light = { x: this.cx, y: this.y + this.h - 10, r: 54 };
  }
  update(dt, world) {
    this.time += dt;
    this.t = (this.t + dt) % this.period;
    const jetStart = this.period - this.jetT, warnStart = jetStart - this.warn;
    const ph = this.t >= jetStart ? 'jet' : this.t >= warnStart ? 'warn' : 'idle';
    if (ph !== this.phase) {
      this.phase = ph;
      if (ph === 'warn') world.audio.sfx('hiss', { x: this.cx, vol: 0.4 });
      if (ph === 'jet') { world.audio.sfx('hiss', { x: this.cx, vol: 1 }); world.shake(0.08); }
    }
    this.hazard = ph === 'jet';
    const bottom = this.y + this.h;
    if (ph === 'jet' && Math.random() < dt * 40) world.particles.steam(this.cx, bottom - Math.random() * this.h, 1);
    else if (ph === 'warn' && Math.random() < dt * 10) world.particles.steam(this.cx, bottom - 6, 1);
    else if (ph === 'idle' && Math.random() < dt * 1.5) world.particles.steam(this.cx, bottom - 6, 1);
  }
  draw(ctx) {
    const x = this.tx * TILE, y = this.ty * TILE, bottom = y + TILE;
    ctx.fillStyle = '#2c313b'; roundRect(ctx, x + 2, bottom - 6, 20, 6, 2); ctx.fill();
    ctx.strokeStyle = '#0d0f13'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 6 + i * 4, bottom - 5); ctx.lineTo(x + 6 + i * 4, bottom - 1.5); ctx.stroke(); }
    const rx = this.phase === 'warn' ? Math.sin(this.time * 60) * 0.8 : 0;
    ctx.fillStyle = this.phase === 'idle' ? '#59606d' : '#8b4a2a'; ctx.fillRect(x + 4 + rx, bottom - 8, 16, 2);
    if (this.phase === 'jet') {
      const H = this.rows * TILE + 14;
      const g = grad(ctx, 0, bottom - H, 0, bottom, ['rgba(255,255,255,0)', 'rgba(255,240,225,.75)', 'rgba(255,170,110,.9)']);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x + 6, bottom - 6);
      for (let i = 0; i <= 8; i++) ctx.lineTo(x + 3 + Math.sin(this.time * 18 + i) * 2, bottom - 6 - (H * i) / 8);
      for (let i = 8; i >= 0; i--) ctx.lineTo(x + 21 + Math.sin(this.time * 17 + i * 1.3) * 2, bottom - 6 - (H * i) / 8);
      ctx.lineTo(x + 18, bottom - 6); ctx.fill();
      glow(ctx, this.cx, bottom - 14, 44, '#ff9a5a', 0.4);
    } else if (this.phase === 'warn') {
      glow(ctx, this.cx, bottom - 8, 20, '#ff9a5a', 0.25 + 0.2 * Math.sin(this.time * 30));
    }
  }
}

// ---------------------------------------------------------------------------------------- reach
// Valves are not triggers: a trigger would capture any trajectory crossing the cell. Instead each
// valve adds trusted edges FROM its own stand/water cell TO cells that only the valve makes
// reachable (see props.opens). tests/ch4.test.mjs re-checks every such edge physically in the
// valves-ON map, so the claims stay honest.
export const reach = {
  V: {
    edges({ x, y, props }) {
      const from = props.from || { x, y };
      return (props.opens || []).map((o) => ({ from, to: { x: o.x, y: o.y }, time: o.t }));
    },
  },
  // Drip pipes: same rule as the kitchen tap (the landing cell counts as a refill spot).
  D: {
    mark({ x, y, env, props }) {
      if ((props.period || 1.4) > 2) return [];
      for (let yy = y + 1; yy < env.h; yy++) {
        if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
        if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];
      }
      return [];
    },
  },
  // Steam vents: the cell and the jet column count as hazard, so validated routes hop over them
  // at any moment (no timing assumed).
  Y: {
    mark({ x, y, props, env }) {
      const out = [{ x, y, hazard: true }];
      for (let k = 1; k < (props.rows || 2); k++) { if (env.isSolid(x, y - k)) break; out.push({ x, y: y - k, hazard: true }); }
      return out;
    },
  },
};
