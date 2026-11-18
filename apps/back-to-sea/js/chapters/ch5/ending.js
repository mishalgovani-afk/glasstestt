// The ending: the fish drops through the grate, rides the storm drain and bursts out of an
// outfall into the open sea at sunset. Plugs into the core ending scene via the finale module's
// `ending: { draw, credits }` (see DESIGN.md). Screen space; everything procedural.
//
// Timeline (seconds): 0-2.4 drop down the shaft · 2.4-6.4 ride the drain · 6.4-7.2 burst out
// into the light · then the sunset sea, looping, with the fish leaping for joy. The DOM credits
// card stays hidden until the sea appears (tap to skip ahead) and gains a "Play again" button.

import { grad, radial, rgba, mix, glow, roundRect, seeded } from '../../core/draw.js';
import { save } from '../../core/save.js';
import { fmtTime } from '../../scenes/hud.js';
import { makePuppetFish } from '../../scenes/ui.js';

const T_RIDE = 2.4, T_BURST = 6.4, T_SEA = 7.2, T_CARD = 7.8;
const st = { fish: null, lastT: -1, skip: 0, node: null, others: null };

export function buildCredits() {
  const best = (save.data && save.data.best) || {};
  const levels = (globalThis.__bts && globalThis.__bts.LEVELS) || [];
  const out = [['Starring', 'One very determined goldfish'], ['With', 'Smudge the Garage Cat'], ['Best times', '']];
  const chapters = [];
  for (const e of levels) {
    let c = chapters.find((x) => x.ch === e.chapter);
    if (!c) chapters.push((c = { ch: e.chapter, sum: 0, n: 0, m: 0 }));
    c.m++;
    const b = best[e.level.id];
    if (b > 0) { c.sum += b; c.n++; }
  }
  for (const c of chapters) if (c.n) out.push([c.ch.title, `${fmtTime(c.sum)}${c.n < c.m ? `  (${c.n}/${c.m} levels)` : ''}`]);
  if (best['5-2'] > 0) out.push(['Fastest boss fight', fmtTime(best['5-2'])]);
  out.push(['No cats were harmed', 'Smudge is fine. Just damp.']);
  return out;
}

function dom(t) {
  if (typeof document === 'undefined') return;
  const node = document.querySelector('.screen.ending');
  if (!node) return;
  if (node !== st.node) {
    st.node = node;
    const card = node.querySelector('.end-card');
    if (card) {
      card.style.transition = 'opacity .9s ease, transform .9s ease';
      card.style.opacity = '0'; card.style.transform = 'translateY(14px)'; card.style.pointerEvents = 'none';
      const menu = card.querySelector('.menu');
      if (menu && !menu.querySelector('[data-ch5="again"]')) {
        const b = document.createElement('button');
        b.className = 'btn primary'; b.textContent = 'Play again'; b.dataset.ch5 = 'again';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const g = globalThis.__bts && globalThis.__bts.game;
          if (g) { g.audio.sfx('ui'); g.startLevel(0, { card: true }); } else location.href = location.pathname;
        });
        for (const o of menu.querySelectorAll('.btn.primary')) o.classList.remove('primary');
        menu.prepend(b);
        // three buttons must fit the card: let them share the row
        menu.style.gap = '8px';
        for (const o of menu.querySelectorAll('.btn')) Object.assign(o.style, { minWidth: '0', flex: '1 1 0', padding: '12px 8px', fontSize: '15px' });
      }
    }
    node.addEventListener('pointerdown', () => { if (st.lastT + st.skip < T_SEA) st.skip = T_SEA - st.lastT; });
  }
  const card = node.querySelector('.end-card');
  if (card && t >= T_CARD && card.style.opacity === '0') { card.style.opacity = '1'; card.style.transform = 'none'; card.style.pointerEvents = ''; }
}

export function drawEnding(ctx, view, t0, stats) {
  if (t0 < st.lastT) { st.skip = 0; st.node = null; }
  const dt = Math.max(0, Math.min(0.1, t0 - st.lastT));
  st.lastT = t0;
  const t = t0 + st.skip;
  if (!st.fish) st.fish = makePuppetFish();
  dom(t);
  const W = view.w, H = view.h;
  if (t < T_RIDE) drawDrop(ctx, W, H, t, dt);
  else if (t < T_BURST) drawRide(ctx, W, H, t - T_RIDE, dt);
  else drawSea(ctx, W, H, t - T_BURST, dt);
  // burst flash
  if (t > T_BURST - 0.35 && t < T_SEA + 0.6) {
    const k = t < T_BURST ? (t - (T_BURST - 0.35)) / 0.35 : 1 - (t - T_BURST) / (T_SEA + 0.6 - T_BURST);
    ctx.fillStyle = rgba('#fff4d6', Math.max(0, Math.min(1, k)) * 0.95); ctx.fillRect(0, 0, W, H);
  }
  // fade in from black
  if (t < 0.5) { ctx.fillStyle = rgba('#04121c', 1 - t / 0.5); ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------------------- 1. the drop
function drawDrop(ctx, W, H, t, dt) {
  ctx.fillStyle = grad(ctx, 0, 0, 0, H, ['#0b1622', '#12202e', '#0a121b']);
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, sw = 150;
  // shaft walls: concrete rings rushing upward
  ctx.fillStyle = grad(ctx, cx - sw, 0, cx + sw, 0, ['#2a3644', '#4a5a6b', '#2c3946', '#4a5a6b', '#2a3644']);
  ctx.fillRect(cx - sw, 0, sw * 2, H);
  const speed = 520 + t * 260;
  for (let i = 0; i < 9; i++) {
    const y = H - ((t * speed + i * 70) % (H + 70));
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(cx - sw, y, sw * 2, 7);
    ctx.fillStyle = 'rgba(160,180,200,.12)'; ctx.fillRect(cx - sw, y + 7, sw * 2, 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cx - sw - 6, 0, 10, H); ctx.fillRect(cx + sw - 4, 0, 10, H);
  // falling water sheets
  ctx.strokeStyle = 'rgba(170,225,245,.55)'; ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const x = cx - sw + 10 + ((i * 53) % (sw * 2 - 20)), y = ((i * 97 + t * 900) % (H + 60)) - 60;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 30 + (i % 4) * 10); ctx.stroke();
  }
  // the grate receding above
  // daylight from the open grate far above, washing down the shaft
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad(ctx, 0, 0, 0, H, [rgba('#9fd0f0', 0.35), 'rgba(159,208,240,0)']);
  ctx.beginPath(); ctx.moveTo(cx - 60, 0); ctx.lineTo(cx + 60, 0); ctx.lineTo(cx + 130, H); ctx.lineTo(cx - 130, H); ctx.fill();
  ctx.restore();
  const gy = 30 - t * 160;
  if (gy > -40) {
    glow(ctx, cx, gy, 90, '#9fc6e0', 0.35);
    ctx.fillStyle = '#2b3138'; ctx.fillRect(cx - 60, gy - 4, 120, 8);
    ctx.fillStyle = '#5a636d'; for (let i = -54; i < 56; i += 10) ctx.fillRect(cx + i, gy - 3, 4, 6);
  }
  // the fish, tumbling
  const f = st.fish;
  f.update(dt, 40, 300);
  const fy = H * 0.42 + Math.sin(t * 3) * 10;
  f.drawAt(ctx, cx + Math.sin(t * 2.3) * 22, fy, 1.8, t * 5);
  // splash below as the shaft ends
  if (t > T_RIDE - 0.5) { const k = (t - (T_RIDE - 0.5)) / 0.5; ctx.fillStyle = rgba('#cfefff', k * 0.8); ctx.fillRect(0, H * (1 - k), W, H * k); }
}

// ---------------------------------------------------------------------------- 2. the ride
function drawRide(ctx, W, H, t, dt) {
  const top = H * 0.16, bot = H * 0.86, wl = H * 0.52;
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = grad(ctx, 0, top, 0, bot, ['#141b23', '#2a3542', '#1a222b']);
  ctx.fillRect(0, top, W, bot - top);
  // light at the end of the tunnel, growing
  const k = t / (T_BURST - T_RIDE);
  const lx = W * 0.86, ly = (top + wl) / 2 + 20;
  glow(ctx, lx, ly, 60 + k * k * W * 0.9, '#ffd9a0', 0.5 + 0.5 * k);
  ctx.fillStyle = rgba('#fff2d6', 0.4 + 0.6 * k);
  ctx.beginPath(); ctx.ellipse(lx, ly, 10 + k * k * 160, 8 + k * k * 120, 0, 0, 7); ctx.fill();
  // pipe joints rushing past
  const speed = 520;
  for (let i = 0; i < 8; i++) {
    const x = W - ((t * speed + i * 120) % (W + 120));
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, top, 9, bot - top);
    ctx.fillStyle = 'rgba(190,200,215,.1)'; ctx.fillRect(x + 9, top, 2, bot - top);
  }
  ctx.fillStyle = grad(ctx, 0, top - 6, 0, top + 18, ['#05080d', 'rgba(5,8,13,0)']); ctx.fillRect(0, top - 6, W, 24);
  // rushing water
  ctx.beginPath(); ctx.moveTo(0, bot);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, wl + Math.sin(x * 0.035 + t * 9) * 5 + Math.sin(x * 0.011 - t * 4) * 6);
  ctx.lineTo(W, bot); ctx.closePath();
  ctx.fillStyle = grad(ctx, 0, wl - 10, 0, bot, ['#4fa9c9', '#1d5f80', '#0d3550']); ctx.fill();
  ctx.strokeStyle = 'rgba(230,250,255,.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    const x = W - ((t * (700 + (i % 3) * 120) + i * 83) % (W + 60)), y = wl + 6 + (i % 5) * 12;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 + (i % 3) * 10, y); ctx.stroke();
  }
  // leaves and a bottle cap swept along
  const r = seeded(3);
  for (let i = 0; i < 6; i++) {
    const x = W - ((t * (600 + r() * 200) + i * 190) % (W + 80)), y = wl + Math.sin(t * 5 + i) * 4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i);
    ctx.fillStyle = i % 3 ? '#c9853b' : '#7aa64a'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = '#05080d'; ctx.fillRect(0, bot, W, H - bot);
  // the fish riding the current, hopping the swells
  const f = st.fish;
  f.update(dt, 200, 0);
  const hop = Math.max(0, Math.sin(t * 2.6)) ** 3 * 36;
  const fx = W * 0.34 + Math.sin(t * 1.3) * 20 + k * W * 0.1, fy = wl - 4 - hop;
  f.drawAt(ctx, fx, fy, 1.8, -Math.cos(t * 2.6) * 0.3 * (hop > 2 ? 1 : 0));
  if (hop < 2) for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(230,250,255,.6)'; ctx.beginPath(); ctx.arc(fx - 30 - i * 9, wl + Math.sin(t * 9 + i) * 2, 2.5 - i * 0.5, 0, 7); ctx.fill(); }
}

// ---------------------------------------------------------------------------- 3. the sea
function drawSea(ctx, W, H, t, dt) {
  const hz = H * 0.46;                 // horizon
  const sunX = W * 0.27, sunY = hz + 6;
  // sky
  ctx.fillStyle = grad(ctx, 0, 0, 0, hz, ['#2a2a5c', '#7a3f78', '#e06a6a', '#ffb066', '#ffe0a0']);
  ctx.fillRect(0, 0, W, hz + 1);
  // stars fading in the top
  for (let i = 0; i < 20; i++) {
    const a = 0.3 + 0.3 * Math.sin(t * 2 + i * 1.7);
    ctx.fillStyle = rgba('#ffffff', a * 0.6); ctx.fillRect((i * 137) % W, (i * 41) % (hz * 0.3), 1.5, 1.5);
  }
  // sun with glow
  glow(ctx, sunX, sunY - 10, 260, '#ffcf8a', 0.55);
  glow(ctx, sunX, sunY - 6, 90, '#fff2c8', 0.9);
  ctx.fillStyle = grad(ctx, 0, sunY - 46, 0, sunY, ['#fff6da', '#ffd27a']);
  ctx.beginPath(); ctx.arc(sunX, sunY, 44, Math.PI, 0); ctx.fill();
  // cloud bands, lit from below
  for (let i = 0; i < 6; i++) {
    const y = 34 + i * 20, sp = 4 + i * 1.5, w = 120 + (i % 3) * 60;
    for (let j = 0; j < 3; j++) {
      const x = ((j * 330 + i * 140 + t * sp) % (W + 300)) - 150;
      ctx.fillStyle = rgba(mix('#5a3a78', '#ffb39a', i / 6), 0.55);
      ctx.beginPath(); ctx.ellipse(x, y, w, 7 + (i % 2) * 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = rgba('#ffd9b0', 0.35); ctx.beginPath(); ctx.ellipse(x + 10, y + 3, w * 0.8, 2.5, 0, 0, 7); ctx.fill();
    }
  }
  // gulls
  ctx.strokeStyle = 'rgba(40,25,50,.75)'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const gx = ((i * 170 + t * (18 + i * 4)) % (W + 80)) - 40, gy = 60 + i * 22 + Math.sin(t * 1.4 + i) * 6, fl = Math.sin(t * 6 + i) * 4;
    ctx.beginPath(); ctx.moveTo(gx - 9, gy - fl); ctx.quadraticCurveTo(gx - 4, gy - 5, gx, gy); ctx.quadraticCurveTo(gx + 4, gy - 5, gx + 9, gy - fl); ctx.stroke();
  }
  // sea body
  ctx.fillStyle = grad(ctx, 0, hz, 0, H, ['#e7a06a', '#3d7fa6', '#14527a', '#082a45']);
  ctx.fillRect(0, hz, W, H - hz);
  // sun glitter path
  for (let i = 0; i < 26; i++) {
    const y = hz + 3 + i * 5.5, w = 14 + i * 5 + Math.sin(t * 3 + i * 1.3) * 10;
    ctx.fillStyle = rgba('#fff0c0', Math.max(0, 0.75 - i * 0.028));
    ctx.fillRect(sunX - w / 2 + Math.sin(t * 2 + i * 2.1) * 8, y, w, 1.6);
  }
  // waves (parallax bands)
  const layers = [['#c98a68', 0.35, 2, 0.06], ['#3f86ac', 0.55, 4, 0.045], ['#2a6f97', 0.65, 6, 0.035], ['#1b5a80', 0.75, 8, 0.028]];
  layers.forEach(([c, a, amp, fr], L) => {
    const y0 = hz + 8 + L * 24;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, y0 + Math.sin(x * fr + t * (1 + L * 0.4)) * amp + Math.sin(x * fr * 2.3 - t * 1.7) * amp * 0.4);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = rgba(c, a); ctx.fill();
    ctx.strokeStyle = rgba('#ffe8c8', 0.25 - L * 0.04); ctx.lineWidth = 1; ctx.stroke();
  });
  // underwater: light rays + schools of fish + bubbles
  const uw = hz + 70;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, uw, W, H - uw); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const x = sunX - 120 + i * 70 + Math.sin(t * 0.5 + i) * 20;
    ctx.globalAlpha = 0.07 + 0.04 * Math.sin(t * 0.9 + i * 1.3);
    ctx.fillStyle = grad(ctx, 0, uw, 0, H, ['#ffe7b0', 'rgba(255,231,176,0)']);
    ctx.beginPath(); ctx.moveTo(x, uw); ctx.lineTo(x + 26, uw); ctx.lineTo(x + 90, H); ctx.lineTo(x + 40, H); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  if (!st.others) {
    const r = seeded(11);
    st.others = Array.from({ length: 18 }, (_, i) => ({ y: 0.25 + r() * 0.7, sp: 18 + r() * 30, ph: r() * 1000, s: 0.5 + r() * 0.6, c: ['#ffd166', '#6ce0c8', '#ff8fa3', '#9ad0ff', '#c3a6ff'][i % 5], school: i % 3 }));
  }
  for (const o of st.others) {
    const x = ((o.ph + t * o.sp) % (W + 80)) - 40, y = uw + o.y * (H - uw) + Math.sin(t * 1.5 + o.ph) * 6;
    smallFish(ctx, x, y, o.s, o.c, t + o.ph);
  }
  for (let i = 0; i < 16; i++) {
    const x = (i * 71 + Math.sin(t + i) * 8) % W, y = H - ((t * (16 + (i % 4) * 7) + i * 37) % (H - uw));
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 1.2 + (i % 3), 0, 7); ctx.stroke();
  }
  ctx.restore();
  // the outfall: a culvert in a mossy seawall at the left edge, still trickling
  ctx.fillStyle = grad(ctx, 0, hz - 60, 0, hz + 40, ['#4a4f58', '#2c3038']);
  ctx.beginPath(); ctx.moveTo(0, hz - 70); ctx.lineTo(48, hz - 64); ctx.lineTo(58, hz + 40); ctx.lineTo(0, hz + 40); ctx.fill();
  ctx.fillStyle = '#3f6b3a'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(10 + i * 8, hz + 20 + (i % 2) * 6, 6, 3, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#0b0f14'; ctx.beginPath(); ctx.ellipse(40, hz - 30, 14, 18, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6a717b'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(190,230,250,.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(52, hz - 22); ctx.quadraticCurveTo(68, hz - 16, 72, hz + 10); ctx.stroke();

  // the hero fish: first the big burst arc out of the pipe, then leaps for joy
  const f = st.fish;
  let fx, fy, rot = 0, sc = 1.7, splashAt = null;
  if (t < 1.4) {
    const k = t / 1.4;
    fx = 50 + k * (W * 0.22); fy = hz - 30 - Math.sin(k * Math.PI) * 90 + k * 60;
    rot = -0.9 + k * 1.8; f.update(dt, 200, -200 + k * 400);
    if (t > 1.3) splashAt = fx;
  } else {
    const u = t - 1.4, cyc = 3.2, ph = (u % cyc) / cyc, n = Math.floor(u / cyc);
    const baseX = W * 0.12 + ((n * 0.21) % 0.26) * W;
    if (ph < 0.55) {
      // swim along just under the surface
      const k = ph / 0.55;
      fx = baseX + k * W * 0.1; fy = hz + 40 + Math.sin(k * Math.PI * 2) * 6; rot = 0.1; sc = 1.4;
      f.update(dt, 120, 0);
    } else {
      const k = (ph - 0.55) / 0.45;
      fx = baseX + W * 0.1 + k * W * 0.14; fy = hz + 40 - Math.sin(k * Math.PI) * (90 + (n % 3) * 25);
      rot = -1.1 + k * 2.2 + (n % 2 ? Math.sin(k * Math.PI) * Math.PI * 2 : 0); sc = 1.6;
      f.update(dt, 160, -300 + k * 600);
      if (k < 0.08 || k > 0.92) splashAt = fx;
      if (k > 0.3 && k < 0.7 && Math.random() < 0.5) sparkle(ctx, fx + (Math.random() - 0.5) * 40, fy + (Math.random() - 0.5) * 30);
    }
  }
  if (splashAt !== null) {
    ctx.fillStyle = 'rgba(240,250,255,.85)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(splashAt + (i - 2.5) * 6, hz + 34 - Math.abs(i - 2.5) * 3 - Math.random() * 8, 2.4, 0, 7); ctx.fill(); }
  }
  // ripple rings where it last went in
  ctx.strokeStyle = 'rgba(255,240,220,.35)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) { const r = ((t * 30 + i * 25) % 50); ctx.beginPath(); ctx.ellipse(fx - 20, hz + 38, r * 1.6, r * 0.3, 0, 0, 7); ctx.stroke(); }
  f.drawAt(ctx, fx, fy, sc, rot);
}

function smallFish(ctx, x, y, s, c, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = rgba(c, 0.75);
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, 7); ctx.fill();
  const tw = Math.sin(t * 9) * 2;
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-14, -4 + tw); ctx.lineTo(-14, 4 + tw); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(10,20,30,.7)'; ctx.beginPath(); ctx.arc(5, -1, 1.1, 0, 7); ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y) {
  ctx.fillStyle = 'rgba(255,248,220,.9)';
  ctx.fillRect(x - 0.75, y - 4, 1.5, 8); ctx.fillRect(x - 4, y - 0.75, 8, 1.5);
}

export const ending = {
  draw: drawEnding,
  get credits() { return buildCredits(); },
};
