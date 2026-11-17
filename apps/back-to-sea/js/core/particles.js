// Bounded particle system (at most MAX_PARTICLES alive; the oldest are recycled).
//
// world.particles.emit({ x, y, count=1, kind='drop', color, vx=0, vy=0, spread=60, speed?,
//                        life=0.6, size=2, gravity=900, drag=0, grow=0, alpha=1, angle?, arc? })
// kinds: 'drop' (water droplet, stretched by velocity), 'bubble' (ring, rises), 'spark' (glow),
//        'steam' (soft puff that grows), 'dust' (flat dot), 'flake' (small rotating square)
// presets: splash(x, y, power, color), bubbles(x, y, n), sparkle(x, y, n, color), steam(x, y, n), dust(x, y, n, color)

import { MAX_PARTICLES } from './constants.js';

export class Particles {
  constructor(max = MAX_PARTICLES) {
    this.max = max;
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push({ alive: false });
    this.cursor = 0;
    this.count = 0;
    this.waterAt = null; // set by World: (px,py) => bool, lets bubbles pop at the surface
    this.solidAt = null; // set by World: (px,py) => bool, drops/dust stop at solid ground
  }

  emit(o) {
    const n = Math.min(o.count ?? 1, 80);
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      const ang = o.angle !== undefined ? o.angle + (Math.random() - 0.5) * (o.arc ?? 1) : Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 0) * (0.4 + Math.random() * 0.6);
      p.alive = true;
      p.kind = o.kind || 'drop';
      p.x = o.x + (Math.random() - 0.5) * (o.jitter ?? 0);
      p.y = o.y + (Math.random() - 0.5) * (o.jitter ?? 0);
      p.vx = (o.vx ?? 0) + Math.cos(ang) * sp + (Math.random() - 0.5) * (o.spread ?? 0);
      p.vy = (o.vy ?? 0) + Math.sin(ang) * sp + (Math.random() - 0.5) * (o.spread ?? 0);
      p.life = p.max = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      p.size = (o.size ?? 2) * (0.7 + Math.random() * 0.6);
      p.color = o.color || '#bfefff';
      p.gravity = o.gravity ?? 900;
      p.drag = o.drag ?? 0;
      p.grow = o.grow ?? 0;
      p.alpha = o.alpha ?? 1;
      p.rot = Math.random() * 6.28;
      p.spin = (Math.random() - 0.5) * 8;
    }
  }

  splash(x, y, power = 1, color = '#bfefff') {
    const n = Math.round(6 + 14 * Math.min(power, 1.5));
    this.emit({ x, y, count: n, kind: 'drop', color, angle: -Math.PI / 2, arc: 2.2, speed: 160 + 200 * power, life: 0.55, size: 1.6 + power, gravity: 1100, jitter: 10 });
    this.emit({ x, y: y + 4, count: Math.round(n / 2), kind: 'bubble', color: '#ffffff', speed: 40, gravity: -120, life: 0.6, size: 1.6, drag: 3, jitter: 16 });
  }
  bubbles(x, y, n = 3) {
    this.emit({ x, y, count: n, kind: 'bubble', color: '#ffffff', vy: -30, spread: 30, gravity: -160, life: 1.1, size: 1.8, drag: 2, jitter: 4 });
  }
  sparkle(x, y, n = 8, color = '#fff6c9') {
    this.emit({ x, y, count: n, kind: 'spark', color, speed: 120, gravity: 0, drag: 4, life: 0.6, size: 2.4 });
  }
  steam(x, y, n = 1) {
    this.emit({ x, y, count: n, kind: 'steam', color: '#ffffff', vy: -40, spread: 20, gravity: -20, drag: 1, life: 1.4, size: 5, grow: 10, alpha: 0.35, jitter: 8 });
  }
  dust(x, y, n = 5, color = '#d9c9b0') {
    this.emit({ x, y, count: n, kind: 'dust', color, angle: -Math.PI / 2, arc: 2.6, speed: 60, gravity: 200, drag: 3, life: 0.45, size: 2 });
  }

  update(dt) {
    let c = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.gravity * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.spin * dt;
      if (p.kind === 'bubble' && this.waterAt && !this.waterAt(p.x, p.y)) { p.alive = false; continue; }
      if (p.kind === 'drop' && p.vy > 0 && this.waterAt && this.waterAt(p.x, p.y)) { p.alive = false; continue; }
      if ((p.kind === 'drop' || p.kind === 'dust') && p.vy > 0 && this.solidAt && this.solidAt(p.x, p.y)) { p.alive = false; continue; }
      c++;
    }
    this.count = c;
  }

  draw(ctx, cam, view) {
    const x0 = cam.x - 20, x1 = cam.x + view.w + 20, y0 = cam.y - 20, y1 = cam.y + view.h + 20;
    for (const p of this.pool) {
      if (!p.alive || p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const t = p.life / p.max;
      const a = p.alpha * Math.min(1, t * 2.2);
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 'drop': {
          const sp = Math.hypot(p.vx, p.vy);
          const len = Math.min(3, sp / 120);
          ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.beginPath(); ctx.ellipse(0, 0, p.size * (1 + len * 0.6), p.size, 0, 0, 6.283); ctx.fill();
          ctx.restore();
          break;
        }
        case 'bubble':
          ctx.strokeStyle = p.color; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.arc(p.x + Math.sin(p.rot) * 1.5, p.y, p.size, 0, 6.283); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(p.x - p.size * 0.4, p.y - p.size * 0.5, 1, 1);
          break;
        case 'spark': {
          const s = p.size * (0.5 + t);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - s * 2); ctx.lineTo(p.x + s * 0.5, p.y); ctx.lineTo(p.x, p.y + s * 2); ctx.lineTo(p.x - s * 0.5, p.y); ctx.closePath();
          ctx.moveTo(p.x - s * 2, p.y); ctx.lineTo(p.x, p.y + s * 0.5); ctx.lineTo(p.x + s * 2, p.y); ctx.lineTo(p.x, p.y - s * 0.5); ctx.closePath();
          ctx.fill();
          break;
        }
        case 'steam':
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
          break;
        case 'flake':
          ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
          break;
        default:
          ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() { for (const p of this.pool) p.alive = false; }
}
