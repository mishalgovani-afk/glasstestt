// Bubble art + pop effects (only runs when the game calls it; nothing here touches the DOM at import).
import { Entity } from '../../core/entity.js';
import { cached, ctxScale, radial, glow } from '../../core/draw.js';

const SPR = 64; // sprite size in logical px (bubble radius 30)

function paintBubble(c, w, h) {
  const cx = w / 2, cy = h / 2, r = 30;
  // very faint body, a little denser toward the rim
  c.fillStyle = radial(c, cx, cy, r * 0.2, r, ['rgba(255,255,255,0.03)', 'rgba(210,240,255,0.10)', 'rgba(255,255,255,0.30)']);
  c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
  // iridescent rim: segmented arcs with drifting hue
  const cols = ['#ff9ad5', '#ffd27a', '#aaffc9', '#7fe0ff', '#b9a4ff', '#ff9ad5'];
  c.lineWidth = 3.2; c.lineCap = 'butt';
  const seg = 24;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1.15) / seg) * Math.PI * 2;
    const k = ((i / seg) * (cols.length - 1)), j = Math.floor(k);
    c.strokeStyle = cols[j];
    c.globalAlpha = 0.34 + 0.2 * Math.sin(a0 * 2 + 1);
    c.beginPath(); c.arc(cx, cy, r - 1.6, a0, a1); c.stroke();
  }
  c.globalAlpha = 1;
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.2;
  c.beginPath(); c.arc(cx, cy, r - 0.6, 0, 7); c.stroke();
  // highlights
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath(); c.ellipse(cx - r * 0.42, cy - r * 0.46, r * 0.26, r * 0.13, -0.7, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath(); c.arc(cx - r * 0.12, cy - r * 0.68, r * 0.06, 0, 7); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2;
  c.beginPath(); c.arc(cx, cy, r * 0.74, 0.35, 1.2); c.stroke();
}

/** Draw a soap bubble centred at (x,y) with radius r. squash: x/y scale wobble. */
export function drawBubble(ctx, x, y, r, opts = {}) {
  const spr = cached('b2-bubble', SPR, SPR, ctxScale(ctx), paintBubble);
  const sx = opts.sx ?? 1, sy = opts.sy ?? 1;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.translate(x, y);
  ctx.rotate(opts.rot || 0);
  ctx.drawImage(spr, -r * sx, -r * sy, r * 2 * sx, r * 2 * sy);
  ctx.restore();
}

/** The lovely pop: a ring of foam puffs, rainbow droplets, tiny bubbles and a flash. */
export function popEffect(world, x, y, big = true) {
  const P = world.particles;
  const n = big ? 1 : 0.6;
  P.emit({ x, y, count: Math.round(7 * n), kind: 'steam', color: '#ffffff', speed: 70, gravity: 10, drag: 2.6, life: 0.7, size: 4.5, grow: 9, alpha: 0.5, jitter: 6 });
  const tints = ['#ffb3de', '#b6f3ff', '#fff2a8', '#d2c4ff'];
  tints.forEach((c, i) => P.emit({ x, y, count: Math.round(5 * n), kind: 'drop', color: c, angle: (i / 4) * 6.28, arc: 3.2, speed: 120 + 70 * n, gravity: 500, drag: 1.2, life: 0.5, size: 1.5 }));
  P.emit({ x, y, count: Math.round(6 * n), kind: 'bubble', color: '#ffffff', speed: 60, gravity: -70, drag: 2, life: 0.9, size: 2.4, jitter: 10 });
  P.sparkle(x, y, Math.round(5 * n), '#ffffff');
  world.spawn(new PopRing(world, x - 12, y - 12, { big }));
}

/** An expanding iridescent ring that fades. */
export class PopRing extends Entity {
  layer = 2;
  init() { this.w = 0; this.h = 0; this.big = !!this.props.big; this.cx0 = this.x + 12; this.cy0 = this.y + 12; }
  update(dt) { this.time += dt; if (this.time > 0.4) this.dead = true; }
  onRespawn() { this.dead = true; }
  draw(ctx) {
    const k = this.time / 0.4;
    const r = 8 + k * (this.big ? 30 : 20);
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.9;
    glow(ctx, this.cx0, this.cy0, r * 1.2, '#ffffff', 0.5 * (1 - k));
    ctx.lineWidth = 3 * (1 - k) + 0.6;
    ctx.strokeStyle = '#ffd5f0'; ctx.beginPath(); ctx.arc(this.cx0, this.cy0, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#b8f0ff'; ctx.beginPath(); ctx.arc(this.cx0, this.cy0, r * 0.82, 0, 7); ctx.stroke();
    ctx.restore();
  }
}
