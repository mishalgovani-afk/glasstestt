// Chapter 3 entities: current regions (R L U D A B Y Z), the spin-cycle drum (M) and the dripping
// wet laundry (W). Class fields hold flags; setup lives in init() (see DESIGN.md).
import { Entity } from '../../core/entity.js';
import { TILE, DROPLET_MOISTURE } from '../../core/constants.js';
import { nearSurface } from '../../core/physics.js';
import { rgba, grad } from '../../core/draw.js';
import { dirVec, dashLaunch, DASH_COOLDOWN, DRIFT_SPEED, drumState, drumDashDir, inDrum, DRUM_PULL } from './flow.js';

const solidPx = (w, px, py) => w.solidAtPx(px, py);
/** Move the player body by (dx, dy) unless that would enter a solid tile (per axis). */
export function driftBody(world, b, dx, dy) {
  const hit = (x, y) => solidPx(world, x, y) || solidPx(world, x + b.w - 0.01, y) || solidPx(world, x, y + b.h - 0.01) || solidPx(world, x + b.w - 0.01, y + b.h - 0.01);
  // a current never carries you out of the water by itself (the edge of a pipe holds you there)
  const wet = (x, y) => world.waterAtPx(x + b.w / 2, y + b.h / 2);
  if (dx && !hit(b.x + dx, b.y) && wet(b.x + dx, b.y)) b.x += dx;
  if (dy && !hit(b.x, b.y + dy) && wet(b.x, b.y + dy)) b.y += dy;
}

/** After a dash, landing on dry ground skids to a stop (dash momentum would otherwise carry ~10 tiles). */
export const SKID_SPEED = 200;
function installSkid(world) {
  if (world.vars.skid) return;
  world.vars.skid = true;
  world.on('land', () => {
    const p = world.player;
    if (p.lastDashT === undefined || world.time - p.lastDashT > 2.5) return;
    const b = p.body;
    if (Math.abs(b.vx) > SKID_SPEED) {
      b.vx = Math.sign(b.vx) * SKID_SPEED;
      world.particles.dust(p.cx, b.y + b.h, 6);
      p.lastDashT = undefined;
    }
  });
}

/** Does this player dash from here? Shared by regions and the drum. */
function doDash(ent, player, world, dir) {
  const [dx, dy] = dirVec(dir);
  const l = dashLaunch(dx, dy);
  player.launch(l.vx, l.vy);
  player.body.leapT = l.leapT;
  player.dashUntil = world.time + 0.4;
  player.lastDashT = world.time;
  installSkid(world);
  player.strokeCD = DASH_COOLDOWN;
  ent.cool = DASH_COOLDOWN;
  player.facing = dx < 0 ? -1 : dx > 0 ? 1 : player.facing;
  player.squash(1.35, 0.7);
  world.audio.sfx('dash', { x: player.cx });
  const ang = Math.atan2(dy, dx);
  world.particles.emit({ x: player.cx - dx * 8, y: player.cy - dy * 8, count: 10, kind: 'bubble', color: '#ffffff', angle: ang + Math.PI, arc: 0.8, speed: 140, gravity: 0, drag: 3, life: 0.5, size: 2, jitter: 6 });
  world.shake(0.12);
}

/** A rectangular patch of current inside water. props: { w, h (tiles), speed?, jet? } */
export class Current extends Entity {
  static tile = '~';
  static dir = 'R';
  jumpPriority = 10;
  init() {
    this.cw = this.props.w || 1; this.chh = this.props.h || 1;
    this.setBox(0, 0, this.cw * TILE, this.chh * TILE);
    this.dir = this.constructor.dir;
    this.v = dirVec(this.dir);
    this.speed = this.props.speed ?? DRIFT_SPEED;
    this.cool = 0;
    this.layer = 1;
  }
  has(p, world) { return p.cx >= this.x && p.cx < this.x + this.w && p.cy >= this.y && p.cy < this.y + this.h && world.waterAtPx(p.cx, p.cy); }
  update(dt) { this.time += dt; this.cool = Math.max(0, this.cool - dt); }
  onPlayerOverlap(p, world) {
    if (!p.inWater || !this.has(p, world) || p.dashUntil > world.time) return;
    const dt = 1 / 120;
    driftBody(world, p.body, this.v[0] * this.speed * dt, this.v[1] * this.speed * dt);
  }
  onJump(p, world) {
    if (!p.inWater || !this.has(p, world) || nearSurface(p.body, world)) return false;
    if (this.cool > 0) return true;
    doDash(this, p, world, this.dir);
    return true;
  }
  draw(ctx, world) {
    const { x, y, w, h } = this;
    const [vx, vy] = this.v;
    const ang = Math.atan2(vy, vx);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(x, y, w, h);
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(ang);
    const L = Math.hypot(w, h) + 40;
    const laneGap = 22, along = 38, sp = 70 + this.speed * 0.5;
    const off = (this.time * sp) % along;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let ly = -L / 2; ly < L / 2; ly += laneGap) {
      const stag = (Math.round(ly / laneGap) % 2) * (along / 2);
      for (let lx = -L / 2 - along; lx < L / 2; lx += along) {
        const px = lx + off + stag;
        ctx.moveTo(px - 5, ly - 4); ctx.lineTo(px, ly); ctx.lineTo(px - 5, ly + 4);
        ctx.moveTo(px - 14, ly); ctx.lineTo(px - 6, ly);
      }
    }
    ctx.stroke();
    ctx.restore();
    if (this.props.jet) {
      // nozzle on the upstream edge
      const nx = this.x + w / 2 - vx * (w / 2 + 2), ny = this.y + h / 2 - vy * (h / 2 + 2);
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(ang);
      ctx.fillStyle = '#c8ccd4'; ctx.fillRect(-6, -7, 8, 14);
      ctx.fillStyle = '#7b8494'; ctx.fillRect(2, -5, 4, 10);
      ctx.restore();
    }
  }
}
export class CurR extends Current { static dir = 'R'; }
export class CurL extends Current { static dir = 'L'; }
export class CurU extends Current { static dir = 'U'; }
export class CurD extends Current { static dir = 'D'; }
export class CurUR extends Current { static dir = 'UR'; }
export class CurUL extends Current { static dir = 'UL'; }
export class CurDR extends Current { static dir = 'DR'; }
export class CurDL extends Current { static dir = 'DL'; }

/**
 * M — the washing-machine drum. Placed on any cell; props: { cx, cy, r (tiles, interior centre and
 * radius), step?, ccw?, start? }. Its current rotates through 8 directions, `step` s each. JUMP
 * dashes along the direction it points right now (time your jump).
 */
export class Drum extends Entity {
  static tile = '~';
  jumpPriority = 10;
  init() {
    const p = this.props;
    this.setBox(0, 0, TILE, TILE);
    this.x = (p.cx - p.r) * TILE; this.y = (p.cy - p.r) * TILE; this.w = this.h = p.r * 2 * TILE;
    this.wide = { ...p, r: p.r + 0.8 };
    this.cool = 0; this.lastTick = -1; this.layer = 1;
    this.socks = [0, 1, 2, 3, 4].map((i) => ({ a: i * 1.26, r: 0.35 + 0.1 * i, c: ['#ff7aa8', '#ffd24d', '#7fd1ae', '#ff9d5c', '#b79bff'][i] }));
  }
  state(world) { return drumState(world.time, this.props); }
  // a little wider than the circle so the corner cells of the tile-built drum are inside it too
  has(p, world) { return inDrum(this.wide, p.cx, p.cy) && world.waterAtPx(p.cx, p.cy); }
  update(dt, world) {
    this.time += dt; this.cool = Math.max(0, this.cool - dt);
    const s = this.state(world);
    if (s.ticks !== this.lastTick) {
      if (this.lastTick >= 0 && world.player && this.has(world.player, world)) world.audio.sfx('tick', { x: this.cx });
      this.lastTick = s.ticks;
    }
  }
  onPlayerOverlap(p, world) {
    if (!p.inWater || !this.has(p, world) || p.dashUntil > world.time) return;
    const [vx, vy] = dirVec(this.state(world).dir);
    const dt = 1 / 120;
    // the churning water also holds you up (cancels the idle sink), so you ride the spin round,
    // and it eddies you back toward the middle (DRUM_PULL) instead of pinning you to the wall:
    // you circle ~2 tiles out, so when the arrow points at the porthole a dash clears it
    const ox = this.props.cx * TILE - p.cx, oy = this.props.cy * TILE - p.cy;
    driftBody(world, p.body, (vx * 70 + ox * DRUM_PULL) * dt, (vy * 70 - 40 + oy * DRUM_PULL) * dt);
  }
  onJump(p, world) {
    if (!p.inWater || !this.has(p, world) || nearSurface(p.body, world)) return false;
    if (this.cool > 0) return true;
    doDash(this, p, world, drumDashDir(world.time, this.props));
    return true;
  }
  draw(ctx, world) {
    const { cx, cy, r } = this.props;
    const X = cx * TILE, Y = cy * TILE, R = r * TILE;
    const s = this.state(world);
    const [dx, dy] = dirVec(s.dir);
    const ang = Math.atan2(dy, dx);
    const ease = Math.min(1, s.phase * 8);
    ctx.save();
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.clip();
    // chevron lanes along the current direction
    ctx.translate(X, Y); ctx.rotate(ang);
    const along = 40, off = (this.time * 110) % along;
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let ly = -R; ly <= R; ly += 24) {
      const stag = (Math.round(ly / 24) % 2) * (along / 2);
      for (let lx = -R - along; lx < R; lx += along) {
        const px = lx + off + stag;
        ctx.moveTo(px - 5, ly - 4); ctx.lineTo(px, ly); ctx.lineTo(px - 5, ly + 4);
      }
    }
    ctx.stroke();
    ctx.rotate(-ang);
    // tumbling laundry
    for (const k of this.socks) {
      const a = k.a + this.time * 0.5;
      const px = Math.cos(a) * R * k.r, py = Math.sin(a * 1.3) * R * k.r * 0.8;
      ctx.fillStyle = rgba(k.c, 0.85);
      ctx.save(); ctx.translate(px, py); ctx.rotate(a * 2);
      ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(3, -3); ctx.quadraticCurveTo(7, 0, 4, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // hub clock: 8 ticks + big arrow
    ctx.save(); ctx.translate(X, Y);
    ctx.fillStyle = 'rgba(30,45,80,.35)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (-90 + i * 45) * Math.PI / 180;
      ctx.fillStyle = i === s.index ? '#ffcc4d' : 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, i === s.index ? 2.6 : 1.4, 0, 7); ctx.fill();
    }
    ctx.rotate(ang);
    const pulse = 1 + (1 - ease) * 0.3;
    ctx.fillStyle = '#ffcc4d'; ctx.scale(pulse, pulse);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-1, -6); ctx.lineTo(-1, -2.2); ctx.lineTo(-8, -2.2); ctx.lineTo(-8, 2.2); ctx.lineTo(-1, 2.2); ctx.lineTo(-1, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/** A falling drip (from W). */
class Drip extends Entity {
  init() { this.w = 6; this.h = 9; this.vy = 30; this.layer = 1; }
  update(dt, world) {
    this.vy = Math.min(this.vy + 900 * dt, 520);
    this.y += this.vy * dt;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.y + this.h) / TILE);
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=' || c === '~' || c === '-' || this.y > world.level.pxH) {
      world.particles.splash(this.cx, ty * TILE, 0.3, world.palette.water);
      world.audio.sfx('plink', { vol: 0.25, pitch: 0.9 + Math.random() * 0.3, x: this.cx });
      this.dead = true;
    }
  }
  onPlayerOverlap(player, world) {
    player.addMoisture(DROPLET_MOISTURE);
    world.particles.sparkle(this.cx, this.cy, 6, '#bff3ff');
    world.audio.sfx('drip');
    this.dead = true;
  }
  draw(ctx, world) {
    const { cx, y } = this;
    ctx.fillStyle = grad(ctx, cx - 3, y, cx + 3, y + 9, ['#f2fcff', world.palette.water]);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + 3.5, y + 5, cx + 3, y + 7); ctx.arc(cx, y + 6.5, 3, 0.2, Math.PI - 0.2); ctx.quadraticCurveTo(cx - 3.5, y + 5, cx, y); ctx.fill();
  }
}

/** W — wet laundry on a line, dripping. props: { period: 1.2, offset: 0, color } */
export class WetCloth extends Entity {
  static tile = '.';
  init() { this.period = this.props.period || 1.3; this.t = this.props.offset || 0; this.wobble = 0; }
  update(dt, world) {
    this.t += dt; this.time += dt; this.wobble = Math.max(0, this.wobble - dt * 3);
    if (this.t >= this.period) { this.t -= this.period; this.wobble = 1; world.spawn(new Drip(world, this.cx - 3, this.y + 18)); }
  }
  draw(ctx, world) {
    const x = this.x, y = this.y, col = this.props.color || '#ff8fb0';
    const sway = Math.sin(this.time * 1.4 + x) * 1.2;
    ctx.fillStyle = '#9aa3b2'; ctx.fillRect(x + 2, y - 2, 20, 2);
    ctx.fillStyle = '#e8e8ee';
    for (const px of [x + 5, x + 19]) { ctx.beginPath(); ctx.arc(px, y - 1, 1.8, 0, 7); ctx.fill(); }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + 21, y); ctx.lineTo(x + 21 + sway, y + 14); ctx.quadraticCurveTo(x + 12, y + 18, x + 3 + sway, y + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x + 6, y + 2, 3, 10);
    const k = this.t / this.period, r = 1 + 2 * k * k + this.wobble * 0.5;
    ctx.fillStyle = rgba(world.palette.water, 0.95);
    ctx.beginPath(); ctx.arc(this.cx, y + 17 + r * 0.6, r, 0, 7); ctx.fill();
  }
}

export const ENTITIES = { R: CurR, L: CurL, U: CurU, D: CurD, A: CurUR, B: CurUL, Y: CurDR, Z: CurDL, M: Drum, W: WetCloth };
