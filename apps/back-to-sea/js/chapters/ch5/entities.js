// Chapter 5 entities. Everything the finale needs is re-implemented here (no imports from other
// chapters): roof leaks + drips, the cat's eyes in the dark, the watering can, the soap bottle and
// its bubbles, the gutter current, valves, the storm-drain grate, and Smudge the boss.
//
// DOM-free at import time. Boss phases run from CatBoss.update (see ./fight.js for the pure state
// machine). Debug: ?level=5-2&phase=2 (or 3) starts the fight at that phase.

import { Entity } from '../../core/entity.js';
import { TILE, DROPLET_MOISTURE } from '../../core/constants.js';
import { grad, radial, roundRect, rgba, mix, glow } from '../../core/draw.js';
import { P } from './art.js';
import { drawCat, catPoints, defaultPose, drawEyesInDark } from './cat.js';
import { createFight, hitBoss, nextPhase, resetPhase, tickFight, arcPoint, circleHitsBox, swipeTarget, PHASES } from './fight.js';

const FLOOR_ROW = 12;            // the arena's stand row (floor top is row 13)
const CAT_SCALE = 0.88;          // Smudge's size relative to cat.js's drawing units
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const boxOf = (p) => ({ x: p.body.x, y: p.body.y, w: p.body.w, h: p.body.h });
const findBoss = (world) => world._ch5 || null;

// ============================================================================ leaks & drips

class Drip extends Entity {
  init() { this.w = 6; this.h = 9; this.vy = 30; this.layer = 1; }
  update(dt, world) {
    this.vy = Math.min(this.vy + 900 * dt, 520);
    this.y += this.vy * dt;
    for (const c of world._ch5Catchers || []) {
      if (!c.dead && c.catches && c.catches(this)) { this.dead = true; return; }
    }
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.y + this.h) / TILE);
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=' || c === '~' || c === '-' || this.y > world.level.pxH) {
      const sy = ty * TILE + (c === '-' ? 18 : 0);
      world.particles.splash(this.cx, sy, 0.3, world.palette.water);
      if (c === '~') world.rippleAt(this.cx, sy, 0.5);
      world.audio.sfx('plink5', { vol: 0.2, pitch: 0.9 + Math.random() * 0.3, x: this.cx });
      this.dead = true;
    }
  }
  onPlayerOverlap(player, world) {
    player.addMoisture(DROPLET_MOISTURE);
    world.particles.sparkle(this.cx, this.cy, 5, '#bff3ff');
    world.audio.sfx('drip', { vol: 0.6 });
    this.dead = true;
  }
  draw(ctx) {
    const { cx, y } = this;
    ctx.fillStyle = grad(ctx, cx - 3, y, cx + 3, y + 9, ['#e9fbff', P.water]);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + 3.5, y + 5, cx + 3, y + 7);
    ctx.arc(cx, y + 6.5, 3, 0.2, Math.PI - 0.2); ctx.quadraticCurveTo(cx - 3.5, y + 5, cx, y); ctx.fill();
  }
}

/** L — a crack in the roof that drips rainwater every `period` s (props: period, offset, intoCan). */
export class Leak extends Entity {
  static tile = '.';
  init() { this.period = this.props.period || 1.2; this.t = this.props.offset ?? Math.random() * this.period; this.wob = 0; }
  update(dt, world) {
    this.t += dt; this.wob = Math.max(0, this.wob - dt * 3);
    if (this.t >= this.period) { this.t -= this.period; this.wob = 1; world.spawn(new Drip(world, this.cx - 3, this.y + 4)); }
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    ctx.fillStyle = 'rgba(10,14,20,.5)'; ctx.beginPath(); ctx.ellipse(x + 12, y - 1, 11, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,20,.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + 4, y - 2); ctx.lineTo(x + 9, y + 1); ctx.lineTo(x + 14, y - 1); ctx.lineTo(x + 20, y + 1); ctx.stroke();
    const k = this.t / this.period, r = 1 + 2.4 * k * k + this.wob * 0.5;
    ctx.fillStyle = rgba(P.water, 0.9); ctx.beginPath(); ctx.arc(this.cx, y + 2 + r * 0.6, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(this.cx - r * 0.35, y + 1.5 + r * 0.4, r * 0.3, 0, 7); ctx.fill();
  }
}

// ============================================================================ 5-1 foreshadowing

/** Y — eyes glinting in the dark under the shelving; then a big shadow slinks past. */
export class CatEyes extends Entity {
  static tile = '.';
  init() {
    this.layer = -1; this.ex = this.x + 12; this.ey = this.y + 14; this.blink = 0; this.nextBlink = 2;
    this.gone = false; this.shadowT = -1; this.shadowAt = this.props.shadowAt ?? this.tx - 2;
    this.x -= 40; this.y -= 140; this.w = 700; this.h = 320;   // generous box so the shadow isn't culled
  }
  update(dt, world) {
    this.time += dt;
    const p = world.player;
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blink = 0.18; this.nextBlink = 1.5 + Math.random() * 2.5; }
    this.blink = Math.max(0, this.blink - dt);
    if (!this.gone && p.cx / TILE >= this.shadowAt) {
      this.gone = true; this.shadowT = 0;
      world.audio.sfx('growl', { x: this.ex });
      world._ch5Flash = 0.9;
    }
    if (this.shadowT >= 0) this.shadowT += dt;
    if (world._ch5Flash > 0) world._ch5Flash = Math.max(0, world._ch5Flash - dt * 2.5);
  }
  draw(ctx, world) {
    const p = world.player;
    if (!this.gone) {
      const open = this.blink > 0 ? 0.1 : 1;
      const look = Math.max(-1, Math.min(1, (p.cx - this.ex) / 200));
      drawEyesInDark(ctx, this.ex, this.ey, open, look, this.time);
    }
    if (this.shadowT >= 0 && this.shadowT < 3.2) {
      // a huge cat silhouette slinking along the back wall in the lightning
      const k = this.shadowT / 3.2;
      const pose = defaultPose(this.ex - 120 + k * 700, this.ey + 30, 1);
      pose.crouch = 0.75; pose.air = 0; pose.sx = 1.7; pose.sy = 1.45; pose.tailT = this.time; pose.tailAmp = 0.6;
      pose.silhouette = '#0a1220'; pose.alpha = 0.32 * Math.min(1, k * 6) * Math.min(1, (1 - k) * 5);
      drawCat(ctx, pose);
    }
  }
}

// ============================================================================ phase 1: the can

/** W — a watering can on the shelf end. Land on it (or JUMP on it) to tip it over Smudge's head. */
export class WateringCan extends Entity {
  static tile = '.';
  oneWay = true;
  init(world) {
    this.setBox(2, 8, 20, 16);
    this.home = { x: this.x, y: this.y };
    this.fill = 1; this.tilt = 0; this.pourT = -1; this.wasOn = false; this.fallen = false; this.fall = null;
    (world._ch5Catchers = world._ch5Catchers || []).push(this);
  }
  get standing() {
    const p = this.world.player, gb = p && p.body.groundBox;
    return !!(p && p.alive && p.body.onGround && gb && gb.ref === this);
  }
  catches(drip) {
    if (this.fallen) return false;
    const hit = drip.cx > this.x && drip.cx < this.x + this.w && drip.y + drip.h > this.y && drip.y < this.y + this.h;
    if (hit && this.pourT < 0) { this.fill = Math.min(1, this.fill + 0.34); this.world.particles.splash(drip.cx, this.y + 2, 0.15, P.water); }
    return hit;
  }
  tip(world) {
    if (this.fill < 0.99 || this.pourT >= 0 || this.fallen) return;
    this.pourT = 0; this.fill = 0;
    world.audio.sfx('pour', { x: this.cx });
    world.audio.sfx('clank', { x: this.cx });
    const boss = findBoss(world);
    if (boss) boss.onPour(this);
  }
  spout() { return { x: this.x + this.w + 10, y: this.y + 2 }; }
  update(dt, world) {
    this.time += dt;
    if (this.fall) {
      const f = this.fall;
      f.vy += 1300 * dt; this.x += f.vx * dt; this.y += f.vy * dt; f.rot += f.vr * dt;
      if (this.y + this.h >= (FLOOR_ROW + 1) * TILE) {
        this.y = (FLOOR_ROW + 1) * TILE - this.h; f.vx *= 0.3; f.vr = 0; f.rot = -1.57;
        if (!f.landed) { f.landed = true; world.audio.sfx('clank', { x: this.cx, pitch: 0.8 }); world.particles.splash(this.cx, this.y + this.h, 0.5, P.water); }
        f.vy = 0;
      }
      return;
    }
    const on = this.standing;
    if (on && !this.wasOn) this.tip(world);
    this.wasOn = on;
    if (this.pourT >= 0) {
      this.pourT += dt;
      if (this.pourT > 1.3) this.pourT = -1;
    } else if (this.fill < 1) this.fill = Math.min(1, this.fill + dt * 0.12); // the leak overhead refills it
    const want = this.pourT >= 0 && this.pourT < 1.0 ? 0.95 : 0;
    this.tilt += (want - this.tilt) * Math.min(1, dt * 10);
  }
  onJump(player, world) { if (this.standing) this.tip(world); return false; }
  knock(world) {
    if (this.fallen) return;
    this.fallen = true; this.oneWay = false;
    this.fall = { vx: -120, vy: -260, rot: 0, vr: -8, landed: false };
  }
  onRespawn(world) {
    const boss = findBoss(world);
    if (boss && boss.fight.phase === 1) { this.fallen = false; this.fall = null; this.oneWay = true; this.x = this.home.x; this.y = this.home.y; this.fill = 1; this.pourT = -1; this.tilt = 0; }
  }
  draw(ctx, world) {
    const rot = this.fall ? this.fall.rot : -this.tilt;
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h);
    ctx.rotate(-rot);
    // body (galvanised steel)
    ctx.fillStyle = grad(ctx, -10, 0, 10, 0, ['#7f8b96', '#d7dee5', '#8a96a1']);
    roundRect(ctx, -10, -16, 20, 16, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-10, -11, 20, 1.5); ctx.fillRect(-10, -5, 20, 1.5);
    // spout
    ctx.strokeStyle = '#a7b2bc'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(19, -15); ctx.stroke();
    ctx.fillStyle = '#c8d1d9'; ctx.beginPath(); ctx.ellipse(20, -16, 3.5, 2, -0.8, 0, 7); ctx.fill();
    // handle
    ctx.strokeStyle = '#8a96a1'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-6, -16, 7, Math.PI, Math.PI * 1.9); ctx.stroke();
    // water level window
    if (!this.fallen) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-6, -14, 3, 12);
      ctx.fillStyle = P.water; const h = 12 * this.fill; ctx.fillRect(-6, -2 - h, 3, h);
    }
    ctx.restore();
    // ready sparkle
    if (!this.fallen && this.fill >= 0.99 && this.pourT < 0 && findBoss(world)?.fight.phase === 1) {
      const a = 0.5 + 0.5 * Math.sin(this.time * 5);
      glow(ctx, this.cx, this.y + 2, 16, '#bff3ff', 0.35 * a);
      ctx.fillStyle = rgba('#ffffff', 0.7 * a);
      const ay = this.y - 14 + Math.sin(this.time * 4) * 2;
      ctx.beginPath(); ctx.moveTo(this.cx - 4, ay); ctx.lineTo(this.cx + 4, ay); ctx.lineTo(this.cx, ay + 5); ctx.closePath(); ctx.fill();
    }
  }
}

// ============================================================================ phase 2: soap + bubbles + current

/** B — a soap bottle on the shelf. Smudge knocks it into the gutter stream: bubbles! */
export class SoapBottle extends Entity {
  static tile = '.';
  init() { this.setBox(5, 2, 14, 22); this.home = { x: this.x, y: this.y }; this.state = 'shelf'; this.vx = 0; this.vy = 0; this.rot = 0; this.emitT = 0.6; }
  knock(world, instant = false) {
    if (this.state !== 'shelf') return;
    if (instant) { this.land(world, true); return; }
    this.state = 'fall'; this.vx = 70; this.vy = -200;
  }
  land(world, quiet) {
    this.state = 'spill';
    this.x = 14 * TILE + 4; this.y = (FLOOR_ROW + 1) * TILE + 4; this.rot = 1.4;
    if (!quiet) { world.splash(this.cx, this.y, 0.9); world.audio.sfx('clank', { x: this.cx, pitch: 1.3 }); }
  }
  update(dt, world) {
    this.time += dt;
    if (this.state === 'fall') {
      this.vy += 1300 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 9;
      if (this.y > (FLOOR_ROW + 1) * TILE) this.land(world, false);
    } else if (this.state === 'spill') {
      const boss = findBoss(world);
      if (!boss || boss.fight.phase !== 2 || boss.fight.state === 'defeated') return;
      // a froth of suds; a bubble big enough to ride every couple of seconds
      if (Math.random() < dt * 6) world.particles.emit({ x: this.cx + (Math.random() - 0.5) * 60, y: this.y - 2, count: 1, kind: 'bubble', color: '#ffffff', vy: -30, gravity: -40, life: 0.8, size: 1.5 + Math.random() * 2 });
      this.emitT -= dt;
      const live = world.findEntities((e) => e instanceof Bubble).length;
      if (this.emitT <= 0 && live < 2) {
        this.emitT = 2.1;
        const bx = (12.5 + Math.random() * 3.5) * TILE;
        world.spawn(new Bubble(world, bx - 16, (FLOOR_ROW + 1) * TILE - 6));
      }
    }
  }
  onRespawn(world) { this.emitT = 0.8; }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.cx, this.y + this.h / 2);
    ctx.rotate(this.rot);
    ctx.fillStyle = grad(ctx, -7, 0, 7, 0, ['#d94f8a', '#ff8cc0', '#c23f78']);
    roundRect(ctx, -7, -9, 14, 20, 4); ctx.fill();
    ctx.fillStyle = '#fff3fa'; roundRect(ctx, -5, -3, 10, 7, 2); ctx.fill();
    ctx.fillStyle = '#ffd6ea'; ctx.fillRect(-2.5, -15, 5, 6);
    ctx.fillStyle = '#e9eef2'; ctx.fillRect(-4, -17, 8, 3);
    ctx.restore();
    if (this.state === 'spill') {
      for (let i = 0; i < 7; i++) {
        const fx = this.cx - 26 + i * 9 + Math.sin(this.time * 2 + i) * 2, fy = this.y - 2 + Math.sin(this.time * 3 + i * 2) * 1.5;
        ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(fx, fy, 3 + (i % 3), 0, 7); ctx.fill();
      }
    }
  }
}

/** A soap bubble: touch it to ride it up (you stay wet), MOVE drifts, JUMP pops for a boost. */
export class Bubble extends Entity {
  wet = true;
  jumpPriority = 10;
  init() { this.w = 32; this.h = 32; this.r = 16; this.rise = 46; this.held = false; this.life = 9; this.wob = Math.random() * 6; this.layer = 1; this.grow = 0; }
  update(dt, world) {
    this.time += dt; this.life -= dt; this.grow = Math.min(1, this.grow + dt * 2.5);
    const p = world.player;
    if (this.held) {
      if (!p.alive) { this.pop(world, false); return; }
      this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2;
      if (this.y < TILE + 4 || this.life < 0) { this.pop(world, false); return; }
    } else {
      this.y -= this.rise * dt;
      this.x += Math.sin(this.time * 1.7 + this.wob) * 10 * dt;
      if (this.y < TILE + 4 || this.life < 0) this.pop(world, false);
    }
  }
  onPlayerOverlap(p, world) {
    if (this.grow < 0.6) return;
    if (!this.held) {
      if ((p._ch5BubbleCD || 0) > world.time) return;
      this.held = true; this.life = Math.min(this.life, 7);
      world.audio.sfx('bubble', { x: this.cx });
      world.particles.sparkle(this.cx, this.cy, 6, '#ffffff');
    }
    p.vy = -this.rise;
    if (p.vx > 85) p.vx = 85; else if (p.vx < -85) p.vx = -85;
    p.body.leapT = 0;
  }
  onJump(p, world) {
    if (!this.held) return false;
    p.launch(null, -600);
    world.particles.sparkle(this.cx, this.cy, 10, '#ffffff');
    this.pop(world, true);
    return true;
  }
  pop(world, boosted) {
    if (this.dead) return;
    this.dead = true;
    world.player._ch5BubbleCD = world.time + 0.35;
    world.audio.sfx('pop5', { x: this.cx, pitch: boosted ? 1 : 1.3 });
    world.particles.emit({ x: this.cx, y: this.cy, count: 10, kind: 'drop', color: 'rgba(240,250,255,.9)', speed: 120, gravity: 400, life: 0.4, size: 1.4 });
  }
  onRespawn() { this.dead = true; }
  draw(ctx) {
    const r = this.r * (0.3 + 0.7 * this.grow) * (1 + Math.sin(this.time * 6) * 0.03), cx = this.cx, cy = this.cy;
    ctx.fillStyle = radial(ctx, cx - r * 0.3, cy - r * 0.3, 1, r, ['rgba(255,255,255,.08)', 'rgba(190,230,255,.12)', 'rgba(255,180,240,.28)']);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,255,230,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0.3 + this.time, 1.6 + this.time); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.12, -0.7, 0, 7); ctx.fill();
  }
}

/** G — rain runoff along the floor trench (props: len tiles, dir). JUMP inside = dash along it. */
export class GutterCurrent extends Entity {
  static tile = '~';
  jumpPriority = 5;
  init() { this.len = this.props.len || 6; this.dir = this.props.dir || 1; this.w = this.len * TILE; this.h = TILE; this.layer = 1; }
  update(dt, world) {
    this.time += dt;
    const p = world.player;
    if (p.alive && p.inWater && this.overlaps(p.body)) {
      if (p.vx * this.dir < 230) p.vx += this.dir * 320 * dt;
      p.addMoisture(100);
    }
  }
  onJump(p, world) {
    if (!p.inWater || !this.overlaps(p.body)) return false;
    p.launch(this.dir * 430, -540);
    p.body.leapT = 0.14;
    p._ch5DashT = world.time;
    world.audio.sfx('dash5', { x: p.cx });
    world.splash(p.cx, this.y, 0.8, true);
    world.particles.bubbles(p.cx - this.dir * 10, p.cy, 6);
    return true;
  }
  draw(ctx) {
    // streamlines riding the flow
    ctx.strokeStyle = 'rgba(220,245,255,.45)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < this.len * 2; i++) {
      const u = ((i * 0.37 + this.time * 0.55 * this.dir) % 1 + 1) % 1;
      const x = this.x + u * this.w, y = this.y + 7 + (i % 3) * 5;
      ctx.beginPath(); ctx.moveTo(x - 7 * this.dir, y); ctx.quadraticCurveTo(x - 2 * this.dir, y - 2, x + 3 * this.dir, y); ctx.stroke();
    }
    // chevrons
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (let i = 0; i < this.len; i += 2) {
      const x = this.x + (i + 0.5) * TILE + ((this.time * 30) % 24) * this.dir, y = this.y + 12;
      ctx.beginPath(); ctx.moveTo(x - 4 * this.dir, y - 4); ctx.lineTo(x + 3 * this.dir, y); ctx.lineTo(x - 4 * this.dir, y + 4); ctx.fill();
    }
  }
}

// ============================================================================ phase 3: valves

/** V — a valve wheel (props.kind 'hose' | 'main'). JUMP while touching it turns it. */
export class Valve extends Entity {
  static tile = '.';
  jumpPriority = 8;
  init() {
    this.kind = this.props.kind || 'hose';
    this.setBox(-6, -6, 36, 36);
    this.turned = false; this.spin = 0; this.spinV = 0; this.nag = 0;
  }
  update(dt) { this.time += dt; this.spin += this.spinV * dt; this.spinV *= Math.exp(-dt * 2.5); this.nag = Math.max(0, this.nag - dt); }
  usable(world) {
    const boss = findBoss(world);
    return !!(boss && boss.fight.phase === 3 && boss.fight.state === 'fight' && !this.turned && (this.kind === 'hose' || boss.hoseOn));
  }
  onJump(p, world) {
    const boss = findBoss(world);
    if (this.turned || !boss) return false;
    if (!this.usable(world)) {
      if (this.nag <= 0) {
        this.nag = 2.5; this.spinV = 2;
        world.audio.sfx('clank', { x: this.cx, pitch: 0.7 });
        world.say(boss.fight.phase < 3 ? 'Rusted stuck... not yet.' : 'No pressure! Open the hose valve first.', 2.2);
      }
      return false;
    }
    this.turned = true; this.spinV = 16;
    world.audio.sfx('valve5', { x: this.cx });
    world.shake(0.25);
    p.launch(null, -320);
    boss.onValve(this);
    return true;
  }
  onRespawn() { this.turned = false; this.spinV = 0; }
  draw(ctx, world) {
    const big = this.kind === 'main';
    const cx = this.tx * TILE + 12, cy = this.ty * TILE + (big ? 12 : 8), R = big ? 11 : 8;
    if (this.usable(world)) {
      const a = 0.5 + 0.5 * Math.sin(this.time * 5);
      glow(ctx, cx, cy, 30, '#ffe08a', 0.45 * a);
      ctx.fillStyle = rgba('#ffffff', 0.8);
      const ay = cy - R - 16 + Math.sin(this.time * 4) * 3;
      ctx.beginPath(); ctx.moveTo(cx - 5, ay); ctx.lineTo(cx + 5, ay); ctx.lineTo(cx, ay + 6); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = grad(ctx, cx - 5, 0, cx + 5, 0, ['#6e5a3f', '#c7a46a', '#6e5a3f']);
    ctx.fillRect(cx - 4, cy, 8, big ? 10 : 14);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.spin);
    ctx.strokeStyle = big ? '#c8352c' : '#d24a3a'; ctx.lineWidth = big ? 4 : 3;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
    ctx.fillStyle = '#e8e2d8'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/** The storm-drain grate around E (spawned by the boss). Opens when Smudge is beaten. */
class Grate extends Entity {
  init() { this.layer = -1; this.open = 0; this.ex = this.x + 12; this.ey = this.y + TILE; this.x -= 30; this.w = 84; this.y -= 30; this.h = 60; }
  update(dt, world) {
    this.time += dt;
    const unlocked = world.exit && !world.exit.locked;
    this.open += ((unlocked ? 1 : 0) - this.open) * Math.min(1, dt * 2.5);
    const p = world.player;
    if (unlocked && p.alive) {
      // the drain's pull: a gentle whirlpool toward the opening
      const dx = this.ex - p.cx, dy = this.ey - 6 - p.cy, d = Math.hypot(dx, dy);
      if (d < 170 && d > 1) {
        const k = p.inWater ? 1000 : 420, cap = 160;
        p.vx = Math.max(-cap, Math.min(cap, p.vx + (dx / d) * k * dt));
        if (p.inWater) p.vy = Math.max(-cap, Math.min(cap, p.vy + (dy / d) * 700 * dt));
      }
      if (Math.random() < dt * 20) world.particles.emit({ x: this.ex + (Math.random() - 0.5) * 60, y: this.ey - 4, count: 1, kind: 'bubble', color: '#e8fbff', vx: 0, vy: 10, gravity: 20, life: 0.6, size: 1.6 });
    }
  }
  draw(ctx) {
    const cx = this.ex, cy = this.ey;
    ctx.fillStyle = radial(ctx, cx, cy, 2, 36, ['#02060a', '#0c141c', 'rgba(12,20,28,0)']);
    ctx.beginPath(); ctx.ellipse(cx, cy, 38, 9, 0, 0, 7); ctx.fill();
    if (this.open > 0.05) {
      ctx.strokeStyle = rgba('#bff6ff', 0.6 * this.open); ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const t = this.time * (3 - i * 0.6); ctx.beginPath(); ctx.ellipse(cx, cy - 2, 12 + i * 9, 3 + i * 2, 0, t, t + 4); ctx.stroke(); }
    }
    // iron grate: lid hinged on the left, swings up as it opens
    ctx.save();
    ctx.translate(cx - 34, cy);
    ctx.rotate(-this.open * 1.35);
    ctx.fillStyle = '#2b3138'; roundRect(ctx, 0, -4, 68, 8, 3); ctx.fill();
    ctx.fillStyle = '#5a636d';
    for (let i = 5; i < 66; i += 8) ctx.fillRect(i, -3, 3.5, 6);
    ctx.strokeStyle = '#8b949e'; ctx.lineWidth = 1; roundRect(ctx, 0, -4, 68, 8, 3); ctx.stroke();
    ctx.restore();
  }
}

// ============================================================================ the boss

const MUSIC = PHASES.map((ph, i) => ({
  bpm: ph.bpm, key: 'E', scale: i === 2 ? 'phrygian' : 'minor', progression: i === 0 ? [1, 6, 3, 7] : i === 1 ? [1, 7, 6, 5] : [1, 2, 1, 7],
  swing: 0, reverb: 0.3,
  pad: { wave: 'sawtooth', vol: 0.26, octave: 3, cutoff: 900 + i * 400, attack: 0.3 },
  bass: { wave: i === 2 ? 'square' : 'triangle', vol: 0.62, octave: 2, pattern: i === 0 ? 'x..xx.x.' : i === 1 ? 'x.xxx.xx' : 'xxx.xxx.xxx.x.x.' },
  arp: { wave: 'square', vol: 0.1 + i * 0.02, octave: 4, pattern: i === 2 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 1], rate: 4, decay: 0.12, cutoff: 2200 },
  lead: i ? { wave: 'triangle', vol: 0.14, octave: 5, density: 0.35, decay: 0.4 } : undefined,
  noise: { vol: 0.16, cutoff: 1400 },
}));
const MUSIC_INTRO = { bpm: 90, key: 'E', scale: 'phrygian', progression: [1, 2], reverb: 0.5,
  pad: { wave: 'sawtooth', vol: 0.3, octave: 2, cutoff: 600, attack: 1 }, bass: { wave: 'sine', vol: 0.6, octave: 1, pattern: 'x.......' }, noise: { vol: 0.2, cutoff: 1200 } };
const MUSIC_WIN = { bpm: 96, key: 'E', scale: 'major', progression: [1, 4, 5, 1], reverb: 0.5,
  pad: { wave: 'triangle', vol: 0.45, octave: 3, cutoff: 2000, attack: 0.6 }, bass: { wave: 'sine', vol: 0.5, octave: 2, pattern: 'x...x...' },
  arp: { wave: 'sine', vol: 0.28, octave: 5, pattern: [0, 1, 2, 3], rate: 4, decay: 0.3 }, noise: { vol: 0.08, cutoff: 900 } };

/** K — Smudge, the garage cat. Sits guarding the storm drain; three phases. */
export class CatBoss extends Entity {
  static tile = '.';
  init(world) {
    let start = 1;
    try { const q = new URLSearchParams(globalThis.location ? globalThis.location.search : ''); start = +q.get('phase') || 1; } catch { start = 1; }
    this.fight = createFight(start);
    this.debugStart = start > 1;
    this.home = { x: this.tx * TILE + 12, y: (this.ty + 1) * TILE };
    this.pose = defaultPose(this.home.x, this.home.y, -1);
    this.pose.eye = 0.05; this.pose.crouch = 0.2; this.pose.sx = this.pose.sy = CAT_SCALE;
    this.bar = { name: 'Smudge the Garage Cat', hp: this.fight.hp, max: this.fight.max };
    this.mode = 'intro'; this.mt = 0;           // current behaviour + time in it
    this.atk = null;                             // current attack { kind, ... }
    this.cool = 2;                               // seconds until the next attack
    this.queue = [];                             // timed events [{ t, fn }]
    this.hurt = 0; this.wet = 0; this.hoseOn = false; this.flooded = false; this.floodQ = [];
    this.started = false; this.contactCD = 0; this.saidLocked = false;
    this.cx0 = this.home.x;                      // the cat's current floor x
    this.layer = -1;                             // behind the can, bottle, bubbles and valves
    world._ch5 = this;
    world._ch5Flash = 0;
    world.lockCamera({ x: 0, y: 0, w: world.level.pxW, h: world.level.pxH });
    installSlowMo(world);
  }

  // ---------------------------------------------------------------- helpers
  get phase() { return this.fight.phase; }
  slow(scale, seconds) { const w = this.world; w._ts = scale; w._slowT = seconds; }
  later(t, fn) { this.queue.push({ t, fn }); }
  music(m) { const a = this.world.game && this.world.game.audio; if (a) a.setMusic(m); }
  syncBar() { this.bar.hp = this.fight.hp; }
  flash(k = 1) { this.world._ch5Flash = Math.max(this.world._ch5Flash || 0, k); }

  firstUpdate(world) {
    this.started = true;
    this.origRow = world.level.tile[FLOOR_ROW].slice();
    const E = world.level.exit;
    if (E) world.spawn(new Grate(world, E.tx * TILE, E.ty * TILE));
    this.can = world.findEntities((e) => e instanceof WateringCan)[0] || null;
    this.bottle = world.findEntities((e) => e instanceof SoapBottle)[0] || null;
    this.valves = world.findEntities((e) => e instanceof Valve);
    world.on('faint', () => { world._ts = 1; world._slowT = 0; this.atk = null; });
    if (this.debugStart) {
      // ?phase=N: skip straight to that phase's set-up
      if (this.can) this.can.knock(world);
      if (this.bottle) this.bottle.knock(world, true);
      this.fight.state = 'fight';
      world.setBoss(this.bar);
      this.mode = 'fight'; this.cool = 1.5;
      this.music(MUSIC[this.phase - 1]);
      world.say(this.phaseHint(), 4);
    } else {
      this.music(MUSIC_INTRO);
    }
  }

  phaseHint() {
    return [
      'Splash-hop up to the watering can and land on it to soak Smudge!',
      'Ride a soap bubble over Smudge and pop it to drop on his nose. Or JUMP in the stream to dash!',
      'Pounce! JUMP at the red valve to turn on the hose!',
    ][this.phase - 1];
  }

  // ---------------------------------------------------------------- update
  update(dt, world) {
    this.time += dt;
    if (!this.started) this.firstUpdate(world);
    const p = world.player, f = this.fight;
    tickFight(f, dt);
    this.mt += dt;
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    this.wet = Math.max(0, this.wet - dt * 0.08);
    this.contactCD = Math.max(0, this.contactCD - dt);
    if (world._ch5Flash > 0) world._ch5Flash = Math.max(0, world._ch5Flash - dt * 2);
    for (const q of this.queue) q.t -= dt;
    const due = this.queue.filter((q) => q.t <= 0); this.queue = this.queue.filter((q) => q.t > 0);
    for (const q of due) q.fn();
    // flooding spreads a column at a time
    if (this.floodQ.length) { this.floodAcc = (this.floodAcc || 0) + dt; while (this.floodAcc > 0.035 && this.floodQ.length) { this.floodAcc -= 0.035; const x = this.floodQ.shift(); world.setTile(x, FLOOR_ROW, '~'); world.rippleAt(x * TILE + 12, FLOOR_ROW * TILE, 0.6); } }

    const busy = world.fainting || world.winning;
    switch (this.mode) {
      case 'intro': this.updIntro(dt, world); break;
      case 'fight': if (!busy) this.updFight(dt, world); break;
      case 'transition': break; // driven by queued events
      case 'blasted': this.updBlasted(dt, world); break;
      case 'flee': this.updFlee(dt, world); break;
      default: break;
    }
    if (!busy && p.alive && this.mode !== 'gone' && this.mode !== 'flee' && this.mode !== 'blasted') this.contact(world, p);
    if (!busy && p.alive && this.mode === 'fight' && !this.saidLocked && p.cx > 27 * TILE) { this.saidLocked = true; world.say('The grate is shut tight. Beat Smudge first!', 2.5); }
    this.animate(dt, world);
    this.x = 0; this.y = 0; this.w = world.level.pxW; this.h = world.level.pxH;
  }

  updIntro(dt, world) {
    const t = this.mt;
    world.dryScale = 0; // no drying while Smudge wakes up
    if (t > 0.9 && !this.introA) { this.introA = true; this.flash(1); world.audio.sfx('thunder', { vol: 0.9 }); }
    if (t > 1.6 && !this.introB) { this.introB = true; world.audio.sfx('hiss', { x: this.pose.x }); world.shake(0.3); }
    if (t > 2.7) {
      this.mode = 'fight'; this.mt = 0; this.fight.state = 'fight'; this.cool = 1.6;
      world.dryScale = 1;
      world.setBoss(this.bar);
      this.music(MUSIC[0]);
      world.say(this.phaseHint(), 4.5);
    }
  }

  updFight(dt, world) {
    if (this.fight.state !== 'fight') return;
    if (this.phase <= 2) this.updSwipes(dt, world);
    else this.updPounce(dt, world);
  }

  // ---- phases 1 & 2: telegraphed paw swipes ------------------------------------------------
  updSwipes(dt, world) {
    const p = world.player;
    const a = this.atk;
    if (!a) {
      this.cool -= dt;
      if (this.cool > 0 || !p.alive) return;
      const sh = catPoints(this.pose).shoulder;
      const tgt = swipeTarget(sh.x, sh.y, p.cx, p.cy, 340, 9 * TILE);
      if (!tgt) { this.cool = 0.5; return; }
      this.atk = { kind: 'swipe', t: 0, x: tgt.x, y: tgt.y, wind: this.phase === 1 ? 0.85 : 0.7, gy: groundBelow(world, tgt.x, tgt.y) };
      world.audio.sfx('growl', { x: this.pose.x, vol: 0.5 });
      return;
    }
    a.t += dt;
    const strikeAt = a.wind, holdEnd = a.wind + 0.32, end = a.wind + 0.62;
    if (a.t >= strikeAt && !a.struck) { a.struck = true; world.audio.sfx('swipe', { x: a.x }); }
    if (a.t >= strikeAt + 0.06 && a.t < holdEnd) {
      // hazard: the paw (generous to the fish: a small radius at the target)
      if (p.alive && circleHitsBox(a.x, a.y, 15, boxOf(p))) world.faint('hazard');
      for (const b of world.findEntities((e) => e instanceof Bubble)) if (Math.hypot(b.cx - a.x, b.cy - a.y) < 26) b.pop(world, false);
      if (!a.thud && a.gy !== null && Math.abs(a.gy - a.y) < 30) { a.thud = true; world.shake(0.2); world.particles.splash(a.x, a.gy, 0.5, P.water); }
    }
    if (a.t >= end) { this.atk = null; this.cool = this.phase === 1 ? 1.25 + Math.random() * 0.4 : 0.9 + Math.random() * 0.4; }
  }

  // ---- phase 3: rhythmic pounces -----------------------------------------------------------
  updPounce(dt, world) {
    const p = world.player;
    const a = this.atk;
    const beat = 60 / PHASES[2].bpm * 2; // two beats of the phase-3 music
    if (!a) {
      this.cool -= dt;
      if (this.cool > 0) return;
      const n = (this.pounces = (this.pounces || 0) + 1);
      // never lands on the hose valve (col 10): its body would cover it; the far side is the fight
      const tx = Math.max(13.5 * TILE, Math.min(31 * TILE, p.cx));
      this.atk = { kind: 'pounce', t: 0, x0: this.cx0, x1: tx, crouch: beat * 1.1, air: beat * 0.75, n };
      return;
    }
    a.t += dt;
    const tAir = a.crouch, tLand = a.crouch + a.air, tEnd = tLand + beat * 0.7;
    if (a.t >= tAir && !a.jumped) { a.jumped = true; world.audio.sfx('swipe', { x: this.pose.x, pitch: 0.7 }); world.audio.sfx('hiss', { x: this.pose.x, vol: 0.5 }); }
    if (a.t >= tAir && a.t < tLand) this.cx0 = lerp(a.x0, a.x1, ease((a.t - tAir) / a.air));
    if (a.t >= tLand && !a.landed) {
      a.landed = true; this.cx0 = a.x1;
      world.shake(0.4);
      world.audio.sfx('thud', { x: a.x1 });
      if (this.flooded) world.splash(a.x1, FLOOR_ROW * TILE, 1.3); else world.particles.dust(a.x1, (FLOOR_ROW + 1) * TILE, 10);
    }
    if (a.landed && a.t < tLand + 0.22 && p.alive) {
      const hb = { x: a.x1 - 46, y: (FLOOR_ROW + 1) * TILE - 52, w: 92, h: 52 };
      const b = boxOf(p);
      if (b.x < hb.x + hb.w && b.x + b.w > hb.x && b.y < hb.y + hb.h && b.y + b.h > hb.y) world.faint('hazard');
    }
    if (a.t >= tEnd) {
      this.atk = null;
      this.cool = a.n % 3 === 0 ? beat * 2.2 : beat * 0.35; // three pounces, then a breather
    }
  }

  /** Touching Smudge outside an attack shoves you away (no faint) — and in phase 2 his nose is the target. */
  contact(world, p) {
    const pts = catPoints(this.pose);
    const b = boxOf(p);
    const f = this.fight;
    if (this.phase === 2 && f.state === 'fight' && this.mode === 'fight' && circleHitsBox(pts.head.x, pts.head.y, pts.headR + 4, b)) {
      const dashing = world.time - (p._ch5DashT || -9) < 0.9;
      if (p.vy > 40 || dashing) {
        this.onNoseHit(world, p);
        return;
      }
    }
    if (this.contactCD > 0) return;
    if (this.valves && this.valves.some((v) => v.usable(world) && v.overlaps(b))) return; // don't shove you off a valve
    const bx = pts.body;
    if (b.x < bx.x + bx.w && b.x + b.w > bx.x && b.y < bx.y + bx.h && b.y + b.h > bx.y && b.y + b.h > bx.y + 30) {
      const dir = p.cx < this.pose.x ? -1 : 1;
      p.launch(dir * 230, -300);
      this.contactCD = 0.6;
      world.audio.sfx('hiss', { x: this.pose.x, vol: 0.4 });
    }
  }

  // ---------------------------------------------------------------- damage
  onPour(can) {
    const w = this.world;
    if (this.phase !== 1 || this.fight.state !== 'fight' || this.mode !== 'fight') return;
    this.pourFrom = can;
    this.later(0.35, () => this.damage('pour'));
  }
  onNoseHit(world, p) {
    p.launch((p.cx < this.pose.x ? -1 : 1) * 170, -460);
    p._ch5DashT = -9;
    world.audio.sfx('boing', { x: p.cx });
    this.damage('nose');
  }
  onValve(v) {
    const w = this.world;
    if (v.kind === 'hose') {
      this.hoseOn = true;
      this.flood(w);
      w.audio.sfx('gush', { x: v.cx });
      this.later(0.9, () => this.damage('flood'));
    } else {
      this.spray = { t: 0, from: { x: v.tx * TILE + 12, y: v.ty * TILE + 14 } };
      w.audio.sfx('gush', { x: v.cx, vol: 1 });
      this.later(0.25, () => this.damage('spray'));
    }
  }

  damage(kind) {
    const w = this.world;
    const r = hitBoss(this.fight);
    if (!r) return;
    this.syncBar();
    this.atk = null; this.cool = 1.6;
    for (const b of w.findEntities((e) => e instanceof Bubble)) if (!b.held) b.pop(w, false);
    this.hurt = 1; this.wet = 1;
    w.shake(0.55); w.flash('rgba(233,247,255,0.45)', 0.1); this.flash(0.3);
    w.audio.sfx('yowl', { x: this.pose.x });
    this.slow(0.3, 0.55);
    const pts = catPoints(this.pose);
    w.particles.splash(pts.head.x, pts.head.y, 1.3, P.water);
    w.particles.sparkle(pts.head.x, pts.head.y - 20, 10, '#ffffff');
    if (r === 'hit') {
      w.say(['Soaked! Again!', 'Bonk! One more!', 'He hates it! Find the big valve!'][this.phase - 1], 2.2);
    } else if (r === 'phase') this.transition();
    else if (r === 'defeated') this.defeat();
  }

  transition() {
    const w = this.world;
    this.mode = 'transition'; this.mt = 0;
    this.music(MUSIC_INTRO);
    const from = this.phase;
    if (from === 1) {
      w.say('Smudge is furious!', 2);
      this.later(0.9, () => { this.swatShelf = 0.0001; w.audio.sfx('swipe', { x: 430 }); w.audio.sfx('hiss', { x: this.pose.x }); });
      this.later(1.15, () => { if (this.can) this.can.knock(w); if (this.bottle) this.bottle.knock(w); w.shake(0.5); this.flash(1); w.audio.sfx('thunder'); });
      this.later(2.6, () => this.beginPhase());
    } else {
      w.say('Smudge leaps off his post!', 2);
      this.later(0.4, () => { w.audio.sfx('sneeze', { x: this.pose.x }); });
      this.later(1.2, () => { this.flash(1); w.audio.sfx('thunder'); w.shake(0.4); });
      this.later(2.2, () => this.beginPhase());
    }
  }
  beginPhase() {
    const w = this.world;
    nextPhase(this.fight);
    this.mode = 'fight'; this.mt = 0; this.cool = 1.4; this.atk = null; this.pounces = 0;
    this.music(MUSIC[this.phase - 1]);
    w.say(this.phaseHint(), 4.5);
  }

  defeat() {
    const w = this.world;
    this.mode = 'blasted'; this.mt = 0;
    this.slow(0.25, 0.9);
    w.say('WHOOSH!', 1.5);
    this.blastDir = this.spray && this.spray.from.x > this.cx0 ? -1 : 1;
    this.later(3.4, () => {
      w.setBoss(null);
      if (w.exit) w.exit.locked = false;
      w.audio.sfx('checkpoint');
      w.say('The storm drain is open! Dive in!', 4);
      this.music(MUSIC_WIN);
    });
  }
  updBlasted(dt, world) {
    // tumbling across the floor in the jet
    this.cx0 += this.blastDir * 260 * dt * Math.max(0, 1 - this.mt / 1.3);
    this.cx0 = Math.max(4 * TILE, Math.min(31 * TILE, this.cx0));
    if (Math.random() < dt * 30) world.particles.emit({ x: this.cx0, y: FLOOR_ROW * TILE - 40, count: 2, kind: 'drop', color: P.water, speed: 160, gravity: 600, life: 0.5, size: 1.8 });
    if (this.mt > 1.5) { this.mode = 'flee'; this.mt = 0; world.audio.sfx('yowl', { x: this.cx0, pitch: 1.3 }); }
  }
  updFlee(dt, world) {
    this.cx0 += 300 * dt;
    if (this.cx0 > world.level.pxW + 60) this.mode = 'gone';
  }

  flood(world) {
    if (this.flooded) return;
    this.flooded = true;
    const hoseX = 10, cols = [];
    for (let d = 0; d < world.w; d++) for (const x of d ? [hoseX - d, hoseX + d] : [hoseX]) {
      if (x < 1 || x > world.w - 2) continue;
      const c = world.level.tile[FLOOR_ROW][x];
      if (c === '.' || c === '-') cols.push(x);
    }
    this.floodQ = cols;
  }
  unflood(world) {
    this.floodQ = [];
    if (!this.flooded) return;
    this.flooded = false;
    for (let x = 0; x < world.w; x++) world.setTile(x, FLOOR_ROW, this.origRow[x]);
  }

  onRespawn(world) {
    if (this.fight.state === 'defeated' || this.mode === 'gone' || this.mode === 'flee' || this.mode === 'blasted') return;
    this.queue = [];
    resetPhase(this.fight);
    this.syncBar();
    this.atk = null; this.cool = 1.8; this.pounces = 0;
    this.mode = this.mode === 'intro' ? 'intro' : 'fight';
    if (this.mode === 'fight') { world.setBoss(this.bar); this.music(MUSIC[this.phase - 1]); }
    this.cx0 = this.home.x;
    this.spray = null;
    if (this.phase === 3) { this.hoseOn = false; this.unflood(world); }
    if (this.phase >= 2) { if (this.can) this.can.knock(world); if (this.bottle) this.bottle.knock(world, true); }
    world._ts = 1;
  }

  // ---------------------------------------------------------------- animation
  animate(dt, world) {
    const s = this.pose, p = world.player, a = this.atk;
    const k = Math.min(1, dt * 8);
    s.tailT += dt * (1 + this.phase * 0.4);
    let crouch = this.phase === 2 ? 0.55 : 0.12, stretch = 0, eye = 1, ears = 0.25 + this.phase * 0.2, mouth = 0, pupil = 0.35, hdx = 0, hdy = 0, tailAmp = 0.35 + this.phase * 0.15;
    s.paw = null; let raise = 0, air = 0, sy = 1, sx = 1;
    if (this.mode === 'intro') {
      const t = this.mt;
      eye = t < 0.9 ? 0.05 : Math.min(1, (t - 0.9) * 4); pupil = t < 1.4 ? 0.9 : 0.25; crouch = t < 1.6 ? 0.25 : 0.05;
      ears = t > 1.6 ? 0.8 : 0; mouth = t > 1.6 && t < 2.5 ? 1 : 0; tailAmp = t > 1.6 ? 0.9 : 0.15;
    }
    if (this.mode === 'fight' && this.phase === 1 && p.cy < 7 * TILE && p.cx > 9 * TILE) { hdx = 12; hdy = -6; } // looks up at the shelf
    if (a && a.kind === 'swipe') {
      const t = a.t, w = a.wind;
      if (t < w) { raise = ease(t / w); ears = 1; mouth = 0.3; pupil = 0.9; crouch += 0.1; }
      else if (t < w + 0.12) { s.paw = lerpPt(catPoints(s).shoulder, a, ease((t - w) / 0.12)); mouth = 0.8; ears = 1; }
      else if (t < w + 0.32) { s.paw = { x: a.x, y: a.y }; mouth = 0.6; ears = 1; }
      else { s.paw = lerpPt(a, catPoints(s).shoulder, ease((t - w - 0.32) / 0.3)); }
    }
    if (this.swatShelf !== undefined && this.swatShelf >= 0) {
      this.swatShelf += dt;
      const kk = this.swatShelf;
      if (kk < 0.5) { s.paw = lerpPt(catPoints(s).shoulder, { x: 425, y: 140 }, ease(kk / 0.25)); stretch = 0.6; mouth = 1; ears = 1; }
      else this.swatShelf = -1;
    }
    if (a && a.kind === 'pounce') {
      const t = a.t, tAir = a.crouch, tLand = a.crouch + a.air;
      if (t < tAir) { crouch = 0.95; sy = 1 - 0.08 * Math.sin(t * 22); s.tailAmp = 1; ears = 1; pupil = 1; tailAmp = 1.1; } // butt wiggle
      else if (t < tLand) { air = 1; crouch = 0.3; mouth = 0.9; }
      else { crouch = 0.6; sy = t < tLand + 0.1 ? 0.85 : 1; sx = t < tLand + 0.1 ? 1.12 : 1; }
      s.f = a.x1 < a.x0 ? -1 : 1;
    } else if (this.phase === 3 && this.mode === 'fight') {
      s.f = p.cx < this.cx0 ? -1 : 1; crouch = 0.45; mouth = 0.15;
    }
    if (this.mode === 'transition') { ears = 1; mouth = 0.7 + 0.3 * Math.sin(this.mt * 18); tailAmp = 1.2; stretch = this.phase === 1 ? 0.3 : 0; }
    if (this.mode === 'blasted') { air = 0.6; s.airTilt = -2 + Math.sin(this.mt * 12) * 0.5; mouth = 1; ears = 1; this.hurt = 1; this.wet = 1; }
    else s.airTilt = 1;
    if (this.mode === 'flee') { s.f = 1; crouch = 0.6; ears = 1; mouth = 0.4; air = 0.3; sy = 1 + Math.sin(this.mt * 25) * 0.06; }
    if (this.hurt > 0.5) { eye = 0.2; mouth = 1; ears = 1; crouch = Math.max(crouch, 0.3); }
    s.crouch += (crouch - s.crouch) * k; s.stretch += (stretch - s.stretch) * k; s.air += (air - s.air) * Math.min(1, dt * 14);
    s.eye += (eye - s.eye) * k; s.ears += (ears - s.ears) * k; s.mouth += (mouth - s.mouth) * Math.min(1, dt * 14); s.pupil += (pupil - s.pupil) * k;
    s.headDX += (hdx - s.headDX) * k; s.headDY += (hdy - s.headDY) * k; s.raise += (raise - s.raise) * Math.min(1, dt * 12);
    s.sx += (sx * CAT_SCALE - s.sx) * Math.min(1, dt * 16); s.sy += (sy * CAT_SCALE - s.sy) * Math.min(1, dt * 16);
    s.hurt = this.hurt; s.wet = Math.min(1, this.wet); s.tailAmp = tailAmp;
    s.look = { x: p.cx, y: p.cy };
    // position: floor x, plus the pounce arc
    s.x = this.cx0; s.y = this.home.y;
    if (a && a.kind === 'pounce' && a.t >= a.crouch && a.t < a.crouch + a.air) {
      const pt = arcPoint(a.x0, this.home.y, a.x1, this.home.y, (a.t - a.crouch) / a.air, 120);
      s.x = pt.x; s.y = pt.y;
    }
    if (this.mode !== 'gone' && this.phase === 1 && this.mode === 'fight' && Math.random() < dt * 0.2) world.audio.sfx('growl', { x: s.x, vol: 0.3 });
    if (this.spray) { this.spray.t += dt; if (this.spray.t > 2.6) this.spray = null; }
    if (this.wet > 0.3 && Math.random() < dt * 8) { const pt = catPoints(s); world.particles.emit({ x: pt.head.x + (Math.random() - 0.5) * 60, y: pt.head.y + 10, count: 1, kind: 'drop', color: P.water, vy: 20, gravity: 900, life: 0.6, size: 1.4 }); }
  }

  // ---------------------------------------------------------------- draw
  draw(ctx, world) {
    const a = this.atk, s = this.pose;
    // telegraphs first (under the cat)
    if (a && a.kind === 'swipe' && a.t < a.wind + 0.32) {
      const k = Math.min(1, a.t / a.wind);
      if (a.gy !== null) {
        ctx.fillStyle = rgba('#0a0608', 0.25 + 0.35 * k);
        ctx.beginPath(); ctx.ellipse(a.x, a.gy, 8 + 20 * k, 3 + 3 * k, 0, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = rgba('#ff6b5a', 0.35 + 0.55 * k); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(a.x, a.y, 30 - 12 * k, 0, 7); ctx.stroke();
      ctx.lineWidth = 2.4; ctx.strokeStyle = rgba('#ffffff', 0.25 + 0.6 * k);
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(a.x - 8 + i * 6, a.y - 9); ctx.lineTo(a.x + 2 + i * 6, a.y + 9); ctx.stroke(); }
    }
    if (a && a.kind === 'pounce' && a.t < a.crouch + a.air) {
      const k = Math.min(1, a.t / (a.crouch + a.air));
      const gy = (FLOOR_ROW + 1) * TILE - 2;
      ctx.fillStyle = rgba('#05030a', 0.2 + 0.45 * k);
      ctx.beginPath(); ctx.ellipse(a.x1, gy, 20 + 30 * k, 4 + 4 * k, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba('#ff6b5a', 0.3 + 0.6 * k); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(a.x1, gy, 50, 9, 0, 0, 7); ctx.stroke();
    }
    if (this.mode !== 'gone') drawCat(ctx, s);
    // the watering-can pour onto his head
    const can = this.pourFrom;
    if (can && can.pourT >= 0 && can.pourT < 1.0) {
      const sp = can.spout(), hd = catPoints(s).head;
      const k = Math.min(1, can.pourT / 0.3), fade = Math.min(1, (1.0 - can.pourT) / 0.3);
      const ex = lerp(sp.x, hd.x, k), ey = lerp(sp.y, hd.y - 26, k);
      ctx.strokeStyle = rgba('#bdefff', 0.75 * fade); ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.quadraticCurveTo(sp.x + 26, sp.y - 6, ex, ey); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.6 * fade); ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.lineDashOffset = -world.time * 60;
      ctx.stroke(); ctx.setLineDash([]);
      if (k >= 1 && Math.random() < 0.6) world.particles.emit({ x: hd.x + (Math.random() - 0.5) * 30, y: hd.y - 26, count: 2, kind: 'drop', color: P.water, speed: 90, gravity: 700, life: 0.4, size: 1.6 });
    }
    // the main's spray: a fat wobbling jet
    if (this.spray) {
      const sp = this.spray, fr = sp.from, hd = catPoints(s).head;
      const fade = Math.min(1, (2.6 - sp.t) / 0.5);
      ctx.lineCap = 'round';
      for (const [wdt, col] of [[16, rgba('#7fd3ec', 0.55 * fade)], [8, rgba('#e8fbff', 0.8 * fade)]]) {
        ctx.strokeStyle = col; ctx.lineWidth = wdt + Math.sin(world.time * 30) * 2;
        ctx.beginPath(); ctx.moveTo(fr.x, fr.y);
        ctx.quadraticCurveTo((fr.x + hd.x) / 2, Math.min(fr.y, hd.y) - 40, hd.x, hd.y); ctx.stroke();
      }
      if (Math.random() < 0.8) world.particles.splash(hd.x, hd.y, 0.6, P.water);
    }
  }
}

function lerpPt(a, b, k) { return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; }

/** Top y (px) of the first solid / one-way tile at or below (x, y), or null. */
function groundBelow(world, x, y) {
  const tx = Math.floor(x / TILE);
  for (let ty = Math.floor(y / TILE); ty < world.h; ty++) {
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=') return ty * TILE;
    if (c === '~') return ty * TILE;
  }
  return null;
}

/** Slow motion: wrap this world's step so the boss can scale time (real-time countdown). */
function installSlowMo(world) {
  if (world._ch5Step) return;
  world._ch5Step = true; world._ts = 1; world._slowT = 0;
  const orig = world.step.bind(world);
  world.step = (dt, input) => {
    const s = world._ts ?? 1;
    orig(dt * s, input);
    if (world._slowT > 0) { world._slowT -= dt; if (world._slowT <= 0) world._ts = 1; }
  };
}

// ============================================================================ validator rules

export const reach = {
  // Drips land on the first stand cell below the leak; standing there catches one every period
  // (+35 moisture against ~20 lost), so that cell may count as a refill spot. A leak that drips
  // into the watering can feeds the can, not the fish: no credit.
  L: {
    mark({ x, y, env, props }) {
      if (props.intoCan || (props.period || 1.2) > 2) return [];
      for (let yy = y + 1; yy < env.h; yy++) {
        if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
        if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];
      }
      return [];
    },
  },
  // The can is a small platform you can stand on, but we claim nothing for it: its cell is air.
  W: { as: 'air' },
};
