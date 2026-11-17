// Core entities created from core map chars: o (Droplet), C (Checkpoint), E (Exit).

import { Entity } from './entity.js';
import { TILE, DROPLET_BOX, CHECKPOINT_BOX, EXIT_BOX, DROPLET_MOISTURE } from './constants.js';
import { grad, radial, rgba, roundRect, glow, lighten } from './draw.js';

export class Droplet extends Entity {
  init() { this.setBox(DROPLET_BOX.x, DROPLET_BOX.y, DROPLET_BOX.w, DROPLET_BOX.h); this.taken = false; this.phase = Math.random() * 6; this.layer = 1; }
  update(dt) { this.time += dt; }
  onPlayerOverlap(player, world) {
    if (this.taken) return;
    this.taken = true;
    player.addMoisture(DROPLET_MOISTURE);
    world.particles.sparkle(this.cx, this.cy, 8, '#c9f6ff');
    world.particles.emit({ x: this.cx, y: this.cy, count: 8, kind: 'drop', color: world.palette.water, speed: 90, gravity: 500, life: 0.4, size: 1.6 });
    world.audio.sfx('drip', { x: this.cx });
  }
  onRespawn() { this.taken = false; }
  draw(ctx, world) {
    if (this.taken) return;
    const pal = world.palette;
    const cx = this.cx, cy = this.y + 7 + Math.sin(this.time * 3 + this.phase) * 2;
    glow(ctx, cx, cy + 1, 14, lighten(pal.water, 0.4), 0.45);
    ctx.fillStyle = grad(ctx, cx - 5, cy - 7, cx + 5, cy + 6, ['#ffffff', lighten(pal.water, 0.2), pal.water]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.bezierCurveTo(cx + 2, cy - 4, cx + 6, cy, cx + 5.5, cy + 2.5);
    ctx.arc(cx, cy + 2.5, 5.5, 0, Math.PI);
    ctx.bezierCurveTo(cx - 6, cy, cx - 2, cy - 4, cx, cy - 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.ellipse(cx - 2, cy + 0.5, 1.4, 2.4, 0.4, 0, 7); ctx.fill();
  }
}

export class Checkpoint extends Entity {
  init(world) {
    this.setBox(CHECKPOINT_BOX.x, CHECKPOINT_BOX.y, CHECKPOINT_BOX.w, CHECKPOINT_BOX.h);
    this.active = false; this.raise = 0; this.ring = 0;
    this.submerged = world.level.tile[this.ty][this.tx] === '~';
  }
  update(dt) { this.time += dt; this.raise += ((this.active ? 1 : 0) - this.raise) * Math.min(1, dt * 5); this.ring = Math.max(0, this.ring - dt); }
  onPlayerOverlap(player, world) {
    player.refill();
    if (!this.active) {
      for (const c of world.findEntities((e) => e instanceof Checkpoint)) c.active = false;
      this.active = true; this.ring = 1;
      world.setCheckpoint(this.tx, this.ty);
      world.audio.sfx('checkpoint', { x: this.cx });
      world.particles.sparkle(this.cx, this.y + 4, 12, '#fff3b0');
      world.emit('checkpoint', this);
    }
  }
  draw(ctx, world) {
    const pal = world.palette;
    const x = this.tx * TILE, y = this.ty * TILE;
    const bx = x + 12, by = y + TILE;
    if (this.active) glow(ctx, bx, by - 8, 26, pal.accent, 0.35 + 0.1 * Math.sin(this.time * 3));
    // pole + flag
    ctx.fillStyle = '#d8dde2'; ctx.fillRect(bx + 5, by - 26, 2, 22);
    const fy = by - 26 + (1 - this.raise) * 12;
    const wave = Math.sin(this.time * 6) * 1.5;
    ctx.fillStyle = this.active ? pal.accent : '#9aa3ad';
    ctx.beginPath(); ctx.moveTo(bx + 7, fy); ctx.quadraticCurveTo(bx + 13, fy + 2 + wave, bx + 18, fy + 3); ctx.lineTo(bx + 7, fy + 8); ctx.closePath(); ctx.fill();
    // bottle cap holding water
    ctx.fillStyle = grad(ctx, 0, by - 8, 0, by, ['#f2f4f6', '#9aa3ad']);
    roundRect(ctx, bx - 10, by - 7, 20, 7, 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.15)'; for (let i = -8; i < 9; i += 3) ctx.fillRect(bx + i, by - 6, 1, 5);
    ctx.fillStyle = rgba(pal.water, 0.9); ctx.fillRect(bx - 8, by - 7, 16, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(bx - 6, by - 7, 6, 1);
    if (this.ring > 0) {
      ctx.strokeStyle = rgba('#ffffff', this.ring); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by - 10, 30 * (1 - this.ring) + 6, 0, 7); ctx.stroke();
    }
  }
}

export class Exit extends Entity {
  init(world) {
    this.setBox(EXIT_BOX.x, EXIT_BOX.y, EXIT_BOX.w, EXIT_BOX.h);
    this.locked = !!this.props.locked;
    this.submerged = world.level.tile[this.ty][this.tx] === '~';
    this.layer = -1;
  }
  update(dt, world) {
    this.time += dt;
    if (!this.locked && Math.random() < dt * (this.submerged ? 6 : 3)) {
      const a = Math.random() * 6.28;
      world.particles.emit({ x: this.cx + Math.cos(a) * 14, y: this.cy + Math.sin(a) * 8, count: 1, kind: this.submerged ? 'bubble' : 'spark', color: '#e8fbff', vx: -Math.cos(a) * 20, vy: this.submerged ? -30 : -25, gravity: this.submerged ? -60 : -10, life: 0.9, size: this.submerged ? 1.5 : 1.4, drag: 1 });
    }
  }
  onPlayerOverlap(player, world) { if (!this.locked) world.win(this); }
  draw(ctx, world) {
    const pal = world.palette;
    const cx = this.tx * TILE + 12, cy = this.ty * TILE + (this.submerged ? 20 : 21);
    const a = this.locked ? 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    glow(ctx, cx, cy - 4, 34, '#bff6ff', 0.55 + 0.15 * Math.sin(this.time * 2.5));
    // swirl rings
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const r = 6 + i * 5, t = this.time * (2.4 - i * 0.5);
      ctx.strokeStyle = rgba('#ffffff', 0.55 - i * 0.12);
      ctx.beginPath(); ctx.ellipse(cx, cy - 2, r * 1.3, r * 0.45, 0, t, t + 4.2); ctx.stroke();
    }
    // drain grate
    ctx.fillStyle = radial(ctx, cx, cy, 1, 12, ['#0b1a24', '#24333d']);
    ctx.beginPath(); ctx.ellipse(cx, cy, 12, 4.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c8d0d6'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(200,208,214,.8)'; ctx.lineWidth = 1;
    for (let i = -8; i <= 8; i += 4) { ctx.beginPath(); ctx.moveTo(cx + i, cy - 3.5 + Math.abs(i) * 0.12); ctx.lineTo(cx + i, cy + 3.5 - Math.abs(i) * 0.12); ctx.stroke(); }
    if (!this.locked) {
      // bobbing arrow
      const ay = cy - 26 + Math.sin(this.time * 4) * 3;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.moveTo(cx - 5, ay); ctx.lineTo(cx + 5, ay); ctx.lineTo(cx, ay + 6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}
