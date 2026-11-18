// In-game HUD, drawn on the canvas in screen space: moisture drop gauge, level name, play timer,
// hint pill, level intro banner, boss bar. Pause/mute are DOM buttons (index.html).

import { LOW_MOISTURE, MOISTURE_MAX, LEVEL_BANNER_T } from '../core/constants.js';
import { grad, rgba, roundRect, mix } from '../core/draw.js';

export const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

export function fmtTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
export function fmtLong(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m ${r}s` : `${m}m ${r < 10 ? '0' : ''}${r}s`;
}

export function drawHUD(ctx, view, world) {
  const safe = view.safe;
  const p = world.player;
  const m = p.moisture / MOISTURE_MAX;
  const t = world.time;
  const x = 14 + safe.l, y = 10 + safe.t;

  // ---- moisture drop gauge
  const low = p.moisture < LOW_MOISTURE && p.alive;
  const pulse = low ? 1 + 0.08 * Math.sin(t * 14) : 1;
  ctx.save();
  ctx.translate(x + 15, y + 22);
  ctx.scale(pulse, pulse);
  const drop = () => {
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(4, -12, 14, -4, 14, 6);
    ctx.arc(0, 6, 14, 0, Math.PI);
    ctx.bezierCurveTo(-14, -4, -4, -12, 0, -20);
    ctx.closePath();
  };
  ctx.shadowColor = 'rgba(0,20,40,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  drop();
  ctx.fillStyle = 'rgba(12,32,48,.55)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  drop(); ctx.clip();
  const lvl = 20 - 40 * m;
  const c1 = low ? mix('#ff7a59', '#ffd0a0', 0.5 + 0.5 * Math.sin(t * 14)) : '#7fe0ff';
  const c2 = low ? '#d9482b' : '#1f8fc4';
  ctx.fillStyle = grad(ctx, 0, lvl - 4, 0, 20, [c1, c2]);
  ctx.beginPath();
  ctx.moveTo(-16, 22);
  for (let xx = -16; xx <= 16; xx += 2) ctx.lineTo(xx, lvl + Math.sin(xx * 0.4 + t * 4) * 1.4);
  ctx.lineTo(16, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(-5, -2, 3, 7, 0.4, 0, 7); ctx.fill();
  ctx.restore();
  drop();
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // ---- level label + timer
  ctx.font = `700 13px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  const label = `${world.def.id}  ${world.def.name}`;
  ctx.fillStyle = 'rgba(0,20,35,.45)';
  ctx.fillText(label, x + 38, y + 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x + 37, y + 19);
  ctx.font = `600 11px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(`⏱ ${fmtTime(world.levelTime)}`, x + 37, y + 35);
  if (low) {
    ctx.fillStyle = 'rgba(0,20,35,.5)';
    ctx.fillText('drying out!', x + 101, y + 36);
    ctx.fillStyle = rgba('#ffd2c2', 0.75 + 0.25 * Math.sin(t * 10));
    ctx.fillText('drying out!', x + 100, y + 35);
  }

  // ---- boss bar
  if (world.boss) {
    const b = world.boss, bw = Math.min(260, view.w * 0.42), bx = (view.w - bw) / 2, by = 12 + safe.t;
    const f = Math.max(0, Math.min(1, b.hp / (b.max || 1)));
    ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.fillText(String(b.name || 'Boss').toUpperCase(), view.w / 2, by + 9);
    ctx.textAlign = 'left';
    roundRect(ctx, bx, by + 14, bw, 9, 4.5); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
    if (f > 0) { roundRect(ctx, bx + 1.5, by + 15.5, (bw - 3) * f, 6, 3); ctx.fillStyle = grad(ctx, bx, 0, bx + bw, 0, ['#ffb15c', '#ff5d5d']); ctx.fill(); }
    roundRect(ctx, bx, by + 14, bw, 9, 4.5); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // ---- level intro banner
  const it = world.levelTime, BT = LEVEL_BANNER_T;
  if (it < BT && !world.boss) {
    const a = Math.min(1, it / 0.35) * Math.min(1, (BT - it) / 0.6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `800 26px ${FONT}`;
    const yy = view.h * 0.38 - (1 - Math.min(1, it / 0.5)) * 10;
    // soft dark backdrop so the title reads on bright rooms
    const nw = Math.min(view.w - 24, ctx.measureText(world.def.name).width + 56);
    const bg = ctx.createRadialGradient(view.w / 2, yy - 12, 8, view.w / 2, yy - 12, nw / 2 + 20);
    bg.addColorStop(0, 'rgba(0,20,34,.62)'); bg.addColorStop(0.7, 'rgba(0,20,34,.42)'); bg.addColorStop(1, 'rgba(0,20,34,0)');
    ctx.save(); ctx.translate(view.w / 2, yy - 12); ctx.scale(1, 0.55); ctx.translate(-view.w / 2, -(yy - 12));
    ctx.fillStyle = bg; ctx.fillRect(view.w / 2 - nw / 2 - 30, yy - 12 - nw / 2 - 20, nw + 60, nw + 40);
    ctx.restore();
    ctx.shadowColor = 'rgba(0,20,34,.85)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#fff'; ctx.fillText(world.def.name, view.w / 2, yy);
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`${world.chapter.title.toUpperCase()}  ·  ${world.def.id}`, view.w / 2, yy - 28);
    ctx.restore();
  }

  // ---- hint pill
  const h = world.hint;
  if (h && h.t > 0 && !world.bannerOn) {
    const a = Math.min(1, h.t / 0.25) * Math.min(1, (h.dur - h.t) / 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `700 14px ${FONT}`;
    const tw = Math.min(view.w - 40, ctx.measureText(h.text).width);
    const pw = tw + 28, ph = 30, px = (view.w - pw) / 2, py = (world.boss ? 46 : 54) + safe.t - (1 - Math.min(1, h.t / 0.3)) * 6;
    roundRect(ctx, px, py, pw, ph, 15);
    ctx.fillStyle = 'rgba(8,30,46,.62)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(h.text, view.w / 2, py + ph / 2 + 1, view.w - 40);
    ctx.restore();
  }
}

export function drawDebug(ctx, view, world, fps) {
  const p = world.player, b = p.body;
  ctx.save();
  ctx.font = `11px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(view.w - 190 - view.safe.r, 50, 182, 70);
  ctx.fillStyle = '#9f9';
  const lines = [
    `fps ${fps.toFixed(0)}  parts ${world.particles.count}`,
    `pos ${b.x.toFixed(0)},${b.y.toFixed(0)} tile ${Math.floor(p.cx / 24)},${Math.floor(p.cy / 24)}`,
    `v ${b.vx.toFixed(0)},${b.vy.toFixed(0)} ${p.state}${p.inPuddle ? ' puddle' : ''}`,
    `moist ${p.moisture.toFixed(0)}  ents ${world.entities.length}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, view.w - 184 - view.safe.r, 66 + i * 14));
  ctx.restore();
}
