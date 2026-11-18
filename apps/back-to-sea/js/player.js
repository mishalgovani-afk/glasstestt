// The fish. Physics via the shared stepBody() (js/core/physics.js); this file adds jump
// resolution (entities' onJump first, then stroke / leap / hop / splash-hop), coyote time,
// jump buffer, moisture, faint, and the procedural drawing.

import * as K from './core/constants.js';
import {
  makeBody, stepBody, nearSurface, applyHop, applyLeap, applyStroke, forTilesTouched, overlapsTileBox,
} from './core/physics.js';
import { clamp, lerp } from './core/rng.js';
import { mix, rgba, grad } from './core/draw.js';

const { TILE } = K;

export class Player {
  constructor(world, cx, bottom) {
    this.world = world;
    this.body = makeBody(cx - K.PLAYER_W / 2, bottom - K.PLAYER_H);
    this.prev = { x: this.body.x, y: this.body.y };
    this.facing = 1;
    this.moisture = K.MOISTURE_MAX;
    this.state = 'air';          // 'swim' | 'air' | 'land' | 'faint' | 'win' | 'frozen'
    this.coyote = 0;
    this.buffer = 0;
    this.strokeCD = 0;
    this.heldT = 0;
    this.inPuddle = false;
    this.wetTouch = false;
    // animation
    this.anim = { t: 0, tail: 0, fin: 0, sx: 1, sy: 1, svx: 0, svy: 0, rot: 0, blink: 0, nextBlink: 2, flop: 0, drip: 0, gasp: 0, wet: 1, faintT: 0 };
    this.body.inWater = world.waterAtPx(this.cx, this.cy);
    this.lastJump = null;
  }

  // --- public API (entities may use these) ---
  get x() { return this.body.x; } get y() { return this.body.y; }
  get w() { return this.body.w; } get h() { return this.body.h; }
  get vx() { return this.body.vx; } set vx(v) { this.body.vx = v; }
  get vy() { return this.body.vy; } set vy(v) { this.body.vy = v; }
  get cx() { return this.body.x + this.body.w / 2; }
  get cy() { return this.body.y + this.body.h / 2; }
  get inWater() { return this.body.inWater; }
  get onGround() { return this.body.onGround; }
  get alive() { return this.state !== 'faint' && this.state !== 'win'; }
  /** Add moisture (clamped to 0..100). */
  addMoisture(n) { this.moisture = clamp(this.moisture + n, 0, K.MOISTURE_MAX); this.anim.wet = 1; }
  /** Fill moisture to full. */
  refill() { this.moisture = K.MOISTURE_MAX; this.anim.wet = 1; }
  /** Set velocity (e.g. a boosted jump from a bubble); leaves the ground. */
  launch(vx, vy) {
    if (vx !== null && vx !== undefined) this.body.vx = vx;
    if (vy !== null && vy !== undefined) this.body.vy = vy;
    this.body.onGround = false; this.coyote = 0;
    this.squash(0.75, 1.3);
  }
  /** Teleport (keeps velocity unless reset). */
  place(cx, bottom, resetVel = true) {
    this.body.x = cx - this.body.w / 2; this.body.y = bottom - this.body.h;
    this.prev.x = this.body.x; this.prev.y = this.body.y;
    if (resetVel) { this.body.vx = 0; this.body.vy = 0; }
    this.body.inWater = this.world.waterAtPx(this.cx, this.cy);
  }
  squash(sx, sy) { this.anim.sx = sx; this.anim.sy = sy; }

  // ----------------------------------------------------------------------------------- update
  update(dt, input) {
    const w = this.world, b = this.body, a = this.anim;
    this.prev.x = b.x; this.prev.y = b.y;
    a.t += dt;
    if (this.state === 'faint' || this.state === 'win' || this.state === 'frozen') {
      if (this.state === 'faint') {
        a.faintT += dt;
        if (b.inWater) { b.vy = -20; b.vx *= 0.95; } else { b.vx *= 0.9; }
        stepBody(b, 0, dt, w);
      }
      this._animate(dt, 0);
      return;
    }
    const dir = input ? input.dir() : 0;
    if (dir) this.facing = dir;
    const held = input ? input.jumpHeld() : false;
    this.heldT = held ? this.heldT + dt : 0;

    this.strokeCD = Math.max(0, this.strokeCD - dt);
    if (b.onGround) this.coyote = K.COYOTE_TIME; else this.coyote = Math.max(0, this.coyote - dt);

    this._scanTiles();

    // ---- jump resolution: entities first (priority), then the default for the current state
    if (input && input.takeJump()) {
      this.buffer = K.JUMP_BUFFER;
      if (this._entityJump()) this.buffer = 0;
    }
    if (this.buffer > 0) {
      if (this._defaultJump(false)) this.buffer = 0;
      else this.buffer = Math.max(0, this.buffer - dt);
    } else if (held && b.inWater && this.heldT > 0.2 && this.strokeCD <= 0) {
      // holding JUMP underwater keeps stroking (and leaps once at the surface)
      this._defaultJump(true);
    }

    // ---- physics
    const wasWater = b.inWater, wasGround = b.onGround;
    const ev = stepBody(b, dir, dt, w);
    if (ev.enteredWater) {
      const p = clamp(Math.abs(ev.impactVy) / 600, 0.25, 1.4);
      w.splash(this.cx, this._surfaceY() ?? b.y, p);
    }
    if (ev.exitedWater && b.vy < -150) {
      w.splash(this.cx, this._surfaceY(true) ?? b.y + b.h, 0.6, true);
    }
    if (ev.landed && !wasGround && !b.inWater) {
      const k = clamp(ev.impactVy / 900, 0, 1);
      this.squash(1 + 0.45 * k, 1 - 0.38 * k);
      if (ev.impactVy > 200) {
        w.audio.sfx(this.inPuddle ? 'splashhop' : 'flop', { vol: 0.4 + k * 0.6, x: this.cx });
        if (this.inPuddle) w.particles.splash(this.cx, b.y + b.h - 2, 0.4 * k + 0.2, w.palette.water);
        else w.particles.dust(this.cx, b.y + b.h, 3 + Math.round(4 * k));
      }
      if (ev.impactVy > 700) w.shake(0.15);
      w.emit('land', { vy: ev.impactVy });
    }
    if (ev.bonk) { w.audio.sfx('bonk', { vol: 0.5 }); this.squash(1.2, 0.8); }
    if (wasWater !== b.inWater) w.emit(b.inWater ? 'enterWater' : 'exitWater', this);

    this._scanTiles();
    this._moisture(dt);
    this._hazards();
    if (b.y > w.level.pxH + 60) w.faint('fell');

    this.state = b.inWater ? 'swim' : b.onGround ? 'land' : 'air';
    this._animate(dt, dir);
  }

  _scanTiles() {
    const w = this.world, b = this.body;
    this.inPuddle = false;
    forTilesTouched(b, (tx, ty) => {
      if (w.tileAt(tx, ty) === '-' && overlapsTileBox(b, tx, ty, K.PUDDLE_BOX)) this.inPuddle = true;
    });
  }

  _hazards() {
    const w = this.world, b = this.body;
    let hit = false;
    forTilesTouched(b, (tx, ty) => {
      if (!hit && w.tileAt(tx, ty) === '^' && overlapsTileBox(b, tx, ty, K.HAZARD_BOX)) hit = true;
    });
    if (hit) w.faint('hazard');
  }

  _moisture(dt) {
    const b = this.body;
    const wet = b.inWater || this.inPuddle || this.wetTouch;
    if (b.inWater) this.moisture = K.MOISTURE_MAX;
    else if (wet) this.moisture = Math.min(K.MOISTURE_MAX, this.moisture + K.REFILL_RATE * dt);
    else this.moisture -= K.DRY_RATE * dt * (this.world.dryScale ?? 1);
    if (wet) this.anim.wet = 1; else this.anim.wet = Math.max(0, this.anim.wet - dt / K.DRY_TIME);
    if (this.moisture <= 0) { this.moisture = 0; this.world.faint('dried'); }
  }

  _entityJump() {
    const w = this.world, b = this.body;
    const cands = w.entities.filter((e) => !e.dead && (e === b.groundBox?.ref || overlapBox(b, e)) && e.onJump !== undefined);
    cands.sort((p, q) => (q.jumpPriority || 0) - (p.jumpPriority || 0));
    for (const e of cands) {
      let used = false;
      try { used = e.onJump(this, w) === true; } catch (err) { console.warn(err); }
      if (used) { this.lastJump = 'entity'; w.emit('jump', { kind: 'entity', entity: e }); return true; }
    }
    return false;
  }

  _defaultJump(auto) {
    const w = this.world, b = this.body;
    if (b.inWater) {
      if (nearSurface(b, w)) {
        applyLeap(b);
        this.strokeCD = K.STROKE_COOLDOWN;
        this.squash(0.7, 1.35);
        w.audio.sfx('leap', { x: this.cx });
        this.lastJump = 'leap';
        w.emit('jump', { kind: 'leap' });
        return true;
      }
      if (this.strokeCD > 0) return false;
      applyStroke(b);
      this.strokeCD = K.STROKE_COOLDOWN;
      this.squash(0.85, 1.15);
      this.anim.fin = 1;
      w.audio.sfx('stroke', { vol: auto ? 0.5 : 0.8, x: this.cx });
      w.particles.bubbles(this.cx - this.facing * 8, this.cy + 2, 2);
      this.lastJump = 'stroke';
      w.emit('jump', { kind: 'stroke' });
      return true;
    }
    if (auto) return false;
    if (b.onGround || this.coyote > 0) {
      const splash = this.inPuddle;
      applyHop(b, splash);
      this.coyote = 0;
      this.squash(0.72, 1.32);
      if (splash) {
        w.audio.sfx('splashhop', { x: this.cx });
        w.particles.splash(this.cx, b.y + b.h, 0.7, w.palette.water);
      } else {
        w.audio.sfx('hop', { x: this.cx, pitch: 0.9 + Math.random() * 0.2 });
        w.particles.dust(this.cx, b.y + b.h, 3);
      }
      this.lastJump = splash ? 'splash-hop' : 'hop';
      w.emit('jump', { kind: this.lastJump });
      return true;
    }
    return false;
  }

  _surfaceY(above = false) {
    const w = this.world;
    const tx = Math.floor(this.cx / TILE);
    let ty = Math.floor((above ? this.body.y + this.body.h + 4 : this.cy) / TILE);
    if (!w.isWater(tx, ty)) return null;
    while (ty > 0 && w.isWater(tx, ty - 1)) ty--;
    return ty * TILE;
  }

  // -------------------------------------------------------------------------------- animation
  _animate(dt, dir) {
    const a = this.anim, b = this.body, w = this.world;
    const speed = Math.hypot(b.vx, b.vy);
    // squash spring
    const k = 160, d = 14;
    a.svx += (-(a.sx - 1) * k - a.svx * d) * dt; a.sx += a.svx * dt;
    a.svy += (-(a.sy - 1) * k - a.svy * d) * dt; a.sy += a.svy * dt;
    // tail & fins
    const swim = b.inWater ? 1 : 0;
    a.tail += dt * (5 + Math.min(speed, 300) * (swim ? 0.06 : 0.03) + (this.state === 'land' && dir ? 9 : 0));
    a.fin = Math.max(0, a.fin - dt * 3);
    // body rotation
    let target = 0;
    if (this.state === 'faint') target = 0;
    else if (b.inWater) target = clamp(Math.atan2(b.vy, Math.max(40, Math.abs(b.vx))) * 0.6, -0.6, 0.6);
    else if (!b.onGround) target = clamp(b.vy / 900, -0.6, 0.7);
    else target = dir ? Math.sin(a.t * 14) * 0.12 : 0;
    a.rot = lerp(a.rot, target, Math.min(1, dt * 10));
    // land flop: little bounce while wriggling
    if (this.state === 'land' && dir) {
      const before = a.flop;
      a.flop = (a.flop + dt * 2.6) % 1;
      if (a.flop < before) { this.squash(1.12, 0.88); w.audio.sfx('flop', { vol: 0.18, pitch: 1.3, x: this.cx }); }
    } else a.flop = 0;
    // blink
    a.nextBlink -= dt;
    if (a.nextBlink <= 0) { a.blink = 0.14; a.nextBlink = 2 + Math.random() * 3.5; }
    a.blink = Math.max(0, a.blink - dt);
    // drips while out of water and still wet
    if (!b.inWater && this.alive && this.moisture > 5) {
      a.drip -= dt * (0.6 + 2.5 * a.wet);
      if (a.drip <= 0) {
        a.drip = 0.25 + Math.random() * 0.5;
        w.particles.emit({ x: this.cx + (Math.random() - 0.5) * 14, y: b.y + b.h - 3, count: 1, kind: 'drop', color: rgba(w.palette.water, 0.9), vy: 20, gravity: 900, life: 0.5, size: 1.3 });
      }
    }
    // gasp when low
    if (!b.inWater && this.moisture < K.LOW_MOISTURE && this.alive) {
      a.gasp += dt * (2 + (K.LOW_MOISTURE - this.moisture) * 0.12);
      if (a.gasp > 1) { a.gasp -= 1; w.audio.sfx('gasp', { vol: 0.4, x: this.cx }); }
    } else a.gasp = 0;
    // bubbles while swimming fast
    if (b.inWater && speed > 120 && Math.random() < dt * 6) w.particles.bubbles(this.cx + this.facing * 9, this.cy - 2, 1);
  }

  // ------------------------------------------------------------------------------------- draw
  draw(ctx, alpha = 1) {
    const b = this.body, a = this.anim;
    const x = lerp(this.prev.x, b.x, alpha) + b.w / 2;
    const y = lerp(this.prev.y, b.y, alpha) + b.h;
    const dry = 1 - this.moisture / K.MOISTURE_MAX;
    const faint = this.state === 'faint';
    const L = 27, H = 16;
    ctx.save();
    ctx.translate(x, y - H * 0.5 * a.sy + 1);
    if (this.state === 'win') { const s = Math.max(0, 1 - a.winT * 1.2); ctx.rotate(a.winT * 10); ctx.scale(s, s); }
    ctx.scale(this.facing, 1);
    ctx.rotate(a.rot);
    if (faint) ctx.rotate(Math.PI * Math.min(1, a.faintT * 3));
    ctx.scale(a.sx, a.sy);

    // colours: vivid -> pale & cracked as moisture drops
    const pale = Math.max(0, dry - 0.25) / 0.75;
    const cTop = mix('#ff6a1f', '#b9a48e', pale * 0.85);
    const cMid = mix('#ff9a3c', '#d6c3ac', pale * 0.85);
    const cBelly = mix('#ffe1b0', '#efe2d2', pale * 0.7);
    const cFin = mix('#ff7a45', '#b8a28a', pale * 0.8);

    const tail = Math.sin(a.tail) * (0.28 + Math.min(0.3, Math.hypot(b.vx, b.vy) * 0.0012));
    // tail
    ctx.save();
    ctx.translate(-L / 2 + 3, 0);
    ctx.rotate(tail);
    ctx.fillStyle = rgba(cFin, 0.92);
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.quadraticCurveTo(-6, -4, -11, -9);
    ctx.quadraticCurveTo(-8, 0, -11, 9);
    ctx.quadraticCurveTo(-6, 4, 1, 0);
    ctx.fill();
    ctx.strokeStyle = rgba(mix(cFin, '#ffffff', 0.3), 0.6); ctx.lineWidth = 0.7;
    for (const s of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(-9, s * 1.2); ctx.stroke(); }
    ctx.restore();

    // dorsal fin
    ctx.fillStyle = rgba(cFin, 0.95);
    ctx.beginPath();
    ctx.moveTo(4, -H / 2 + 1);
    ctx.quadraticCurveTo(-2, -H / 2 - 7 - Math.sin(a.tail * 0.7) * 1.2, -8, -H / 2 + 2);
    ctx.closePath(); ctx.fill();

    // body
    ctx.beginPath();
    ctx.moveTo(L / 2, 1);
    ctx.bezierCurveTo(L / 2 - 2, -H / 2 - 1, -L / 4, -H / 2 - 1, -L / 2 + 2, -1.5);
    ctx.quadraticCurveTo(-L / 2 + 1, 0, -L / 2 + 2, 1.5);
    ctx.bezierCurveTo(-L / 4, H / 2 + 1, L / 2 - 3, H / 2, L / 2, 1);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, -H / 2, 0, H / 2, [cTop, cMid, cBelly]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // scales
    ctx.strokeStyle = rgba('#ffffff', 0.16 * (1 - pale));
    ctx.lineWidth = 0.8;
    for (let sx = -6; sx < 9; sx += 4) for (let sy = -4; sy < 5; sy += 4) { ctx.beginPath(); ctx.arc(sx + (sy % 8 ? 2 : 0), sy, 2.6, -1.2, 1.2); ctx.stroke(); }
    // gill line
    ctx.strokeStyle = rgba('#a33a10', 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(L / 2 - 10, 0, 5, -1.1, 1.1); ctx.stroke();
    // wet sheen
    ctx.fillStyle = rgba('#ffffff', 0.15 + 0.35 * a.wet * (1 - pale));
    ctx.beginPath(); ctx.ellipse(1, -H / 2 + 3.5, 8, 2.2, -0.05, 0, 7); ctx.fill();
    // cracks when parched
    if (this.moisture < K.LOW_MOISTURE + 10) {
      const c = Math.min(1, (K.LOW_MOISTURE + 10 - this.moisture) / (K.LOW_MOISTURE + 10));
      ctx.strokeStyle = rgba('#6b4a33', 0.65 * c); ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-3, -6); ctx.lineTo(-1, -3); ctx.lineTo(-4, -1); ctx.lineTo(-2, 2);
      ctx.moveTo(5, -5); ctx.lineTo(3, -2); ctx.lineTo(6, 0);
      ctx.moveTo(-8, 1); ctx.lineTo(-6, 3); ctx.lineTo(-9, 5);
      ctx.stroke();
    }
    ctx.restore();
    // outline
    ctx.strokeStyle = rgba('#7a2c08', 0.35); ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(L / 2, 1);
    ctx.bezierCurveTo(L / 2 - 2, -H / 2 - 1, -L / 4, -H / 2 - 1, -L / 2 + 2, -1.5);
    ctx.stroke();

    // pectoral fin
    ctx.save();
    ctx.translate(3, 3.5);
    ctx.rotate(0.5 + Math.sin(a.tail * 1.6) * 0.35 + a.fin * 0.8);
    ctx.fillStyle = rgba(mix(cFin, '#ffffff', 0.15), 0.85);
    ctx.beginPath(); ctx.ellipse(-3, 0, 4.5, 2.2, 0, 0, 7); ctx.fill();
    ctx.restore();

    // eye
    const ex = L / 2 - 7, ey = -2.2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ex, ey, 3.7, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba('#7a2c08', 0.4); ctx.lineWidth = 0.6; ctx.stroke();
    if (faint) {
      ctx.strokeStyle = '#2b1a12'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ex - 2, ey - 2); ctx.lineTo(ex + 2, ey + 2); ctx.moveTo(ex + 2, ey - 2); ctx.lineTo(ex - 2, ey + 2); ctx.stroke();
    } else {
      const look = clamp(this.body.vy / 400, -1, 1);
      ctx.fillStyle = '#1b130f';
      ctx.beginPath(); ctx.arc(ex + 1, ey + look * 0.9, 2.1, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1.8, ey - 0.9 + look * 0.9, 0.8, 0, 7); ctx.fill();
      if (a.blink > 0 || (this.moisture < 15 && Math.sin(a.t * 8) > 0.6)) {
        ctx.fillStyle = cTop;
        ctx.beginPath(); ctx.arc(ex, ey, 3.9, Math.PI, 0); ctx.lineTo(ex + 3.9, ey + 0.5); ctx.lineTo(ex - 3.9, ey + 0.5); ctx.fill();
      }
    }
    // mouth (gasping when dry)
    const open = this.moisture < K.LOW_MOISTURE && !faint ? 0.5 + 0.5 * Math.sin(a.gasp * Math.PI * 2) : 0;
    ctx.fillStyle = '#7a2c08';
    ctx.beginPath(); ctx.ellipse(L / 2 - 1.2, 2.2, 1.1 + open * 0.6, 0.6 + open * 1.4, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
}

function overlapBox(b, e) {
  return b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y;
}
