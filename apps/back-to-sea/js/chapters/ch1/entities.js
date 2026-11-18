// Chapter 1 entities + validator rules (DOM-free at import time).
//
//   T  Tap          dripping tap: catch the drips for +moisture (the reference entity)
//   K  Kettle       a whistling kettle. Stand on it (or in its steam) and JUMP: the steam lifts you
//   P  Sponge       a squishy sponge. Land on it and it wrings out a puddle; JUMP = a big bounce
//
// JUMP is the only verb. The kettle and sponge replace what a ground JUMP does (onJump), exactly
// like a puddle turns a hop into a splash-hop.

import { Entity } from '../../core/entity.js';
import { TILE, DROPLET_MOISTURE, PLAYER_H } from '../../core/constants.js';
import { grad, radial, roundRect, rgba, mix, darken, lighten, glow, cached, ctxScale } from '../../core/draw.js';

export const WATER = '#5cc6e4';
const ACCENT = '#ff8a3d';

// Tuning (exported so tests and the validator rules share the numbers)
export const STEAM_BOOST_VY = -700;  // JUMP on the kettle / in steam: ~6.5 tiles of rise
export const STEAM_FLOAT = 150;      // px/s: steam holds you rising at least this fast while airborne in it
export const STEAM_LIFT = 2600;      // px/s^2 of steam updraft (beats gravity 1500)
export const SPONGE_BOUNCE_VY = -640; // JUMP on the sponge: ~5.7 tiles of rise
export const SPONGE_REFILL = 40;     // moisture wrung out onto you per bounce

// ---------------------------------------------------------------------------------------------
// Pure logic (unit-tested in tests/ch1.test.mjs)

/** New vertical speed for an airborne fish inside a steam column: rise at least STEAM_FLOAT. */
export function steamLift(vy, dt) {
  return vy > -STEAM_FLOAT ? Math.max(-STEAM_FLOAT, vy - STEAM_LIFT * dt) : vy;
}

/** How many tiles of steam a kettle at (tx,ty) has: up to `rows`, stopping below a solid tile. */
export function steamRows(isSolid, tx, ty, rows) {
  let n = 0;
  while (n < rows && !isSolid(tx, ty - 1 - n)) n++;
  return n;
}

/**
 * Cells where a sponge at (tx,ty) wrings out puddle: the cell above it (you stand in it) and the
 * two neighbours above the counter. `tileAt` returns '.', '#', '=', '~', '-', '^'.
 */
export function spongePuddleCells(tileAt, tx, ty) {
  const out = [];
  if (tileAt(tx, ty - 1) === '.') out.push([tx, ty - 1]);
  for (const dx of [-1, 1]) if (tileAt(tx + dx, ty) === '.' && tileAt(tx + dx, ty + 1) === '#') out.push([tx + dx, ty]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// T — dripping tap

/** A falling drip spawned by a Tap. Catch it for +moisture. */
class Drip extends Entity {
  init() { this.w = 6; this.h = 9; this.vy = 30; this.layer = 1; }
  update(dt, world) {
    this.vy = Math.min(this.vy + 900 * dt, 520);
    this.y += this.vy * dt;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor((this.y + this.h) / TILE);
    const c = world.tileAt(tx, ty);
    if (c === '#' || c === '=' || c === '~' || c === '-' || this.y > world.level.pxH) {
      const sy = ty * TILE + (c === '-' ? 18 : 0);
      world.particles.splash(this.cx, sy, 0.35, world.palette.water);
      if (c === '~') world.rippleAt(this.cx, sy, 0.6);
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
  draw(ctx) {
    const { cx, y } = this;
    ctx.fillStyle = grad(ctx, cx - 3, y, cx + 3, y + 9, ['#e9fbff', WATER]);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.quadraticCurveTo(cx + 3.5, y + 5, cx + 3, y + 7);
    ctx.arc(cx, y + 6.5, 3, 0.2, Math.PI - 0.2);
    ctx.quadraticCurveTo(cx - 3.5, y + 5, cx, y);
    ctx.fill();
  }
}

/**
 * T — dripping tap, mounted under a cabinet. Spawns a Drip every `period` seconds
 * (props: { period: 1.2, offset: 0 }). The drips fall straight down the tap's column.
 */
export class Tap extends Entity {
  static tile = '.';
  init() { this.period = this.props.period || 1.2; this.t = this.props.offset || 0; this.wobble = 0; }
  update(dt, world) {
    this.t += dt;
    this.wobble = Math.max(0, this.wobble - dt * 3);
    if (this.t >= this.period) {
      this.t -= this.period;
      this.wobble = 1;
      world.spawn(new Drip(world, this.cx - 3, this.y + 17));
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y;
    // pipe from the cabinet above
    ctx.fillStyle = grad(ctx, x + 9, 0, x + 15, 0, ['#8d97a3', '#f4f7fb', '#9aa4ae']);
    ctx.fillRect(x + 9, y - 6, 6, 12);
    // spout
    ctx.fillStyle = grad(ctx, 0, y + 4, 0, y + 14, ['#f4f7fb', '#8d97a3']);
    roundRect(ctx, x + 4, y + 5, 16, 7, 3.5); ctx.fill();
    ctx.fillRect(x + 9, y + 10, 6, 6);
    // handle
    ctx.fillStyle = '#d0d6dd';
    roundRect(ctx, x + 2, y - 1, 7, 4, 2); ctx.fill();
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(x + 4, y + 1, 1.6, 0, 7); ctx.fill();
    // forming drop
    const k = this.t / this.period;
    const r = 1 + 2.2 * k * k + this.wobble * 0.5;
    ctx.fillStyle = rgba(WATER, 0.9);
    ctx.beginPath(); ctx.arc(this.cx, y + 16 + r * 0.6, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.beginPath(); ctx.arc(this.cx - r * 0.35, y + 15.5 + r * 0.4, r * 0.3, 0, 7); ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------
// K — kettle + its steam column

/** The rising steam above a kettle: wet (keeps you moist), slows your fall, JUMP = steam boost. */
class SteamColumn extends Entity {
  wet = true;
  jumpPriority = 20;
  layer = -1;   // behind the fish so the steam never hides it
  init(world) {
    const k = this.props.kettle;
    this.kettle = k;
    this.x = k.x + 2; this.w = TILE - 4;
    this.h = k.rows * TILE; this.y = k.y - this.h;
    this.seed = k.tx * 7.3 + k.ty;
  }
  /** Boost only from the ground (or coyote), so the steam can't be chained into a ladder. */
  onJump(player, world) {
    if (player.inWater || !(player.onGround || player.coyote > 0)) return false;
    player.launch(null, STEAM_BOOST_VY);
    this.kettle.kick = 1;
    world.audio.sfx('whoosh', { x: this.cx });
    world.particles.steam(player.cx, player.y + player.h, 6);
    world.particles.sparkle(player.cx, player.cy, 5, '#ffffff');
    return true;
  }
  update(dt) { this.dt = dt; }
  onPlayerOverlap(player, world) {
    if (player.inWater || player.onGround) return;
    player.vy = steamLift(player.vy, this.dt || 1 / 120);
  }
  draw(ctx) {
    const t = this.kettle.time, x = this.x, w = this.w, bottom = this.y + this.h;
    // faint column so the fish can read how far the steam reaches
    ctx.fillStyle = grad(ctx, 0, this.y, 0, bottom, ['rgba(150,205,235,0)', 'rgba(150,205,235,.16)', 'rgba(130,195,235,.3)']);
    ctx.fillRect(x + 1, this.y, w - 2, this.h);
    ctx.fillStyle = 'rgba(120,185,225,.35)';
    ctx.fillRect(x + 1, this.y + 8, 1, this.h - 8); ctx.fillRect(x + w - 2, this.y + 8, 1, this.h - 8);
    const puff = cached('k-puff', 40, 40, ctxScale(ctx), (c) => {
      c.fillStyle = radial(c, 20, 20, 0, 20, ['rgba(255,255,255,1)', 'rgba(215,236,248,.75)', 'rgba(170,210,236,0)']);
      c.fillRect(0, 0, 40, 40);
    });
    const N = Math.min(14, 4 + this.kettle.rows);
    for (let i = 0; i < N; i++) {
      const k = (t * 0.45 + i / N) % 1;                       // 0 at the spout .. 1 at the top
      const px = this.kettle.cx + Math.sin(t * 2 + i * 2.1 + this.seed) * (3 + 6 * k);
      const py = bottom - 4 - k * (this.h - 4);
      const r = 7 + 12 * k;
      ctx.globalAlpha = 0.8 * Math.sin(Math.PI * Math.min(1, k * 1.1)) + 0.04;
      ctx.drawImage(puff, px - r, py - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * K — kettle on a counter (a solid 1-tile block you can stand on). Its steam column rises
 * `rows` tiles (props: { rows: 7, flip: false }); stop it early under a ceiling.
 * Stand on it or in the steam and JUMP: the steam carries you up.
 */
export class Kettle extends Entity {
  static tile = '.';
  solid = true;
  jumpPriority = 20;
  init(world) {
    this.rows = steamRows((tx, ty) => world.isSolid(tx, ty), this.tx, this.ty, this.props.rows || 7);
    this.flip = !!this.props.flip;
    this.kick = 0;
    this.column = world.spawn(new SteamColumn(world, this.x, this.y, { kettle: this }));
  }
  update(dt) { this.time += dt; this.kick = Math.max(0, this.kick - dt * 3); }
  onJump(player, world) { return this.column.onJump(player, world); }
  draw(ctx) {
    const x = this.x, y = this.y, f = this.flip ? -1 : 1, cx = this.cx;
    const sq = 1 + this.kick * 0.08;
    ctx.save();
    ctx.translate(cx, y + TILE); ctx.scale(f / sq, sq); ctx.translate(-cx, -(y + TILE));
    // shadow on the counter
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(cx, y + TILE - 1, 12, 2.6, 0, 0, 7); ctx.fill();
    // handle (back)
    ctx.strokeStyle = '#3a3f46'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 7, y + 7); ctx.bezierCurveTo(cx - 18, y + 1, cx - 19, y + 17, cx - 10, y + 19); ctx.stroke();
    // spout
    ctx.fillStyle = grad(ctx, cx + 8, 0, cx + 15, 0, ['#c2c9d0', '#8a949e']);
    ctx.beginPath(); ctx.moveTo(cx + 8, y + 19); ctx.lineTo(cx + 12, y + 5); ctx.lineTo(cx + 16, y + 5); ctx.lineTo(cx + 12, y + 21); ctx.closePath(); ctx.fill();
    // body
    ctx.fillStyle = grad(ctx, cx - 11, 0, cx + 11, 0, ['#d9323a', '#ff6a62', '#b81f2a']);
    ctx.beginPath(); ctx.moveTo(cx - 10, y + 22.5); ctx.bezierCurveTo(cx - 14, y + 12, cx - 9, y + 7, cx - 6, y + 6); ctx.lineTo(cx + 6, y + 6); ctx.bezierCurveTo(cx + 9, y + 7, cx + 14, y + 12, cx + 10, y + 22.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(cx - 5, y + 14, 1.8, 5.5, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(cx - 11, y + 19.5, 22, 3);
    // lid + knob
    ctx.fillStyle = grad(ctx, 0, y + 3, 0, y + 7, ['#e8edf1', '#9aa4ae']);
    roundRect(ctx, cx - 7, y + 3.5, 14, 3.5, 1.5); ctx.fill();
    ctx.fillStyle = '#2f343a'; ctx.beginPath(); ctx.arc(cx, y + 2.6, 2.2, 0, 7); ctx.fill();
    ctx.restore();
    // a little glow where the steam leaves the spout
    glow(ctx, cx + f * 13, y + 4, 9, '#ffffff', 0.35 + 0.15 * Math.sin(this.time * 6));
  }
}

// ---------------------------------------------------------------------------------------------
// P — sponge

/**
 * P — a sponge block (solid, one tile, stand on it). Landing squeezes a puddle onto it (and onto
 * the counter either side): you get wet and splash-hop height. JUMP on it = a big squishy bounce.
 */
export class Sponge extends Entity {
  static tile = '.';
  solid = true;
  jumpPriority = 20;
  init() { this.squish = 0; this.standing = false; this.made = []; this.drops = 0; }
  update(dt, world) {
    this.time += dt;
    this.squish = Math.max(0, this.squish - dt * 3.2);
    const gb = world.player.body.groundBox;
    const on = !!(gb && gb.ref === this);
    if (on && !this.standing) { this.squish = 0.7; this.squeeze(world); }
    this.standing = on;
  }
  squeeze(world) {
    const p = world.player;
    for (const [x, y] of spongePuddleCells((a, b) => world.tileAt(a, b), this.tx, this.ty)) {
      world.setTile(x, y, '-');
      this.made.push([x, y]);
    }
    p.addMoisture(SPONGE_REFILL);
    world.audio.sfx('squish', { x: this.cx });
    world.particles.splash(this.cx, this.y, 0.5, world.palette.water);
  }
  onJump(player, world) {
    if (!(player.body.groundBox && player.body.groundBox.ref === this) && !player.onGround) return false;
    player.launch(null, SPONGE_BOUNCE_VY);
    player.addMoisture(SPONGE_REFILL);
    this.squish = 1;
    world.audio.sfx('squish', { x: this.cx, pitch: 1.3 });
    world.particles.splash(this.cx, this.y, 0.9, world.palette.water);
    return true;
  }
  onRespawn(world) {
    for (const [x, y] of this.made) world.setTile(x, y, '.');
    this.made = []; this.standing = false; this.squish = 0;
  }
  draw(ctx) {
    const x = this.x, y = this.y, sq = this.squish;
    const sy = 1 - 0.22 * Math.sin(Math.min(1, sq) * Math.PI / 2 * 1.0);
    ctx.save();
    ctx.translate(x + 12, y + TILE); ctx.scale(1 + (1 - sy) * 0.7, sy); ctx.translate(-(x + 12), -(y + TILE));
    // yellow body with a green scrubbing back
    ctx.fillStyle = grad(ctx, x, y, x, y + 17, ['#ffe27a', '#f2c230']);
    roundRect(ctx, x + 0.5, y + 2, TILE - 1, 17, 5); ctx.fill();
    ctx.fillStyle = grad(ctx, x, y + 17, x, y + TILE, ['#4fae6a', '#2f8a55']);
    roundRect(ctx, x + 0.5, y + 17, TILE - 1, 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + 4, y + 3, TILE - 10, 1.5);
    // pores
    ctx.fillStyle = 'rgba(190,130,20,.55)';
    for (const [px, py, r] of [[6, 8, 1.8], [15, 6, 1.4], [18, 12, 1.9], [9, 13, 1.3], [13, 10, 1.1]]) { ctx.beginPath(); ctx.ellipse(x + px, y + py, r, r * 0.8, 0, 0, 7); ctx.fill(); }
    ctx.restore();
    // a dripping bead when it is wet
    if (this.made.length) {
      const k = (this.time * 0.9) % 1;
      ctx.fillStyle = rgba(WATER, 0.85);
      ctx.beginPath(); ctx.arc(x + 20, y + 20 + k * 3, 1.4 + (1 - k) * 0.6, 0, 7); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Validator reach rules (see DESIGN.md "Reach rules")

const standLaunch = (vy) => ({ x, y, K }) => [
  // standing on top of the block (cell above it) and pressing JUMP
  { from: { x, y: y - 1 }, launch: { cx: (x + 0.5) * TILE, cy: y * TILE - K.PLAYER_H / 2, vy } },
];

export const reach = {
  // The tap's drips land on the first stand cell below it. Standing there you catch a drip every
  // `period` s (+35 moisture vs ~20 lost), so the validator may treat that cell as a refill spot.
  T: {
    mark({ x, y, env, props }) {
      if ((props.period || 1.2) > 2) return []; // too slow to keep you wet: no refill credit
      for (let yy = y + 1; yy < env.h; yy++) {
        if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
        if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];
      }
      return [];
    },
  },
  // The kettle is a solid block. Standing on it you are in the steam (wet), and JUMP boosts you.
  // Only the boost from that one cell is claimed; the steam's slow fall is a bonus the validator ignores.
  K: {
    as: 'solid',
    mark: ({ x, y }) => [{ x, y: y - 1, refill: true }],
    edges: standLaunch(STEAM_BOOST_VY),
  },
  // The sponge is a solid block; landing on it wrings a puddle onto its top (a refill), and JUMP bounces.
  P: {
    as: 'solid',
    mark: ({ x, y }) => [{ x, y: y - 1, refill: true }],
    edges: standLaunch(SPONGE_BOUNCE_VY),
  },
};
