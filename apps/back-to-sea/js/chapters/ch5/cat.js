// Smudge, the garage cat: an original, procedurally drawn and animated blue-grey tabby with a
// white bib and socks, a notched ear and a dark smudge on the nose. Drawn every frame from a
// pose (no images). DOM-free; `catPoints` gives the same anatomy points the boss logic uses.
//
// pose = {
//   x, y        feet centre on the floor (world px)     f      facing: -1 left, 1 right
//   crouch 0..1 (head and chest low)  stretch 0..1 (reared up)  air 0..1 (pounce, body long)
//   headDX, headDY  extra head offset (local px)        look {x,y} world point the eyes follow
//   eye 0..1 openness  pupil 0..1 (slit..round)  ears 0..1 (flat = angry)  mouth 0..1 (hiss)
//   hurt 0..1 (eyes squeezed)  wet 0..1  tailT (time)  tailAmp  paw {x,y}|null (near paw reaching
//   a world point)  raise 0..1 (paw wound up)  sx, sy squash  alpha  silhouette (colour) }

import { grad, rgba, mix } from '../../core/draw.js';

const FUR = '#7d8896', FUR_D = '#5f6a78', STRIPE = '#3c434f', WHITE = '#eef0f2', PINK = '#e79aa6';

export function defaultPose(x, y, f = -1) {
  return { x, y, f, crouch: 0, stretch: 0, air: 0, headDX: 0, headDY: 0, look: null, eye: 1, pupil: 0.3,
    ears: 0, mouth: 0, hurt: 0, wet: 0, tailT: 0, tailAmp: 0.35, paw: null, raise: 0, sx: 1, sy: 1, alpha: 1, silhouette: null };
}

/** Anatomy points in WORLD px for a pose: head centre, nose, shoulder, head radius, body box. */
export function catPoints(s) {
  const L = local(s);
  const w = (lx, ly) => ({ x: s.x + s.f * s.sx * lx, y: s.y + s.sy * ly });
  const head = w(L.hx, L.hy), nose = w(L.hx + 8, L.hy + 10), shoulder = w(L.shx, L.shy);
  const top = s.y + s.sy * (L.hy - 34), left = s.x + Math.min(s.f * s.sx * -95, s.f * s.sx * 60);
  return { head, nose, shoulder, headR: 34 * Math.max(s.sx, s.sy),
    body: { x: left, y: top, w: Math.abs(155 * s.sx), h: s.y - top } };
}

function local(s) {
  const c = s.crouch, st = s.stretch;
  return {
    hx: 26 + c * 26 - st * 4 + s.air * 30 + s.headDX,
    hy: -138 + c * 56 - st * 38 + s.air * 50 + s.headDY,
    shx: 20 + c * 12 + s.air * 20, shy: -96 + c * 42 - st * 24 + s.air * 30,
  };
}

export function drawCat(ctx, s) {
  const sil = s.silhouette;
  const col = (c) => (sil || c);
  const wetMix = (c) => (s.wet > 0 ? mix(c, darken2(c), s.wet * 0.55) : c);
  const fur = col(wetMix(FUR)), furD = col(wetMix(FUR_D)), stripe = col(wetMix(STRIPE)), white = col(wetMix(WHITE));
  const L = local(s);
  const t = s.tailT || 0;
  ctx.save();
  ctx.globalAlpha *= s.alpha ?? 1;
  ctx.translate(s.x, s.y);
  ctx.scale(s.f * s.sx, s.sy);
  if (s.air > 0) { ctx.translate(-10, -60); ctx.rotate(-0.25 * s.air * (s.airTilt ?? 1)); ctx.translate(10, 60); }

  // ---- shadow
  if (!sil && s.air < 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(-10, 0, 80, 7, 0, 0, 7); ctx.fill();
  }

  // ---- tail (segment chain, swishing)
  const segs = 13;
  let tx = -74, ty = -18 + s.crouch * 10, a = Math.PI * 1.05 + s.air * 0.5;
  const pts = [[tx, ty]];
  for (let i = 0; i < segs; i++) {
    a += -0.16 + Math.sin(t * 2.4 - i * 0.45) * (s.tailAmp ?? 0.35) * 0.32 + (i > 8 ? 0.12 : 0);
    tx += Math.cos(a) * 9; ty += Math.sin(a) * 9 - 2.2;
    pts.push([tx, ty]);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.strokeStyle = sil ? sil : (i % 3 === 1 ? stripe : fur);
    ctx.lineWidth = 16 - i * 0.65 + (s.wet > 0.5 ? -3 : 0);
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
  }
  ctx.strokeStyle = sil || stripe; ctx.lineWidth = 7;
  const e = pts[pts.length - 1], e2 = pts[pts.length - 2];
  ctx.beginPath(); ctx.moveTo(e2[0], e2[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();

  // ---- far front leg (behind the body)
  const pawY = -6 + (s.air > 0 ? -20 * s.air : 0);
  limb(ctx, L.shx - 10, L.shy + 10, 10 + s.air * 40, pawY, 15, furD, col(wetMix('#d9dcdf')));

  // ---- haunch + hind paw
  ctx.fillStyle = grad(ctx, 0, -90, 0, 0, [fur, furD]);
  ctx.beginPath(); ctx.ellipse(-38 - s.air * 10, -44 + s.crouch * 6 - s.air * 6, 50, 44 - s.crouch * 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = white;
  ctx.beginPath(); ctx.ellipse(-8 - s.air * 30, -7 - s.air * 10, 22, 8, 0, 0, 7); ctx.fill();

  // ---- torso
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(4 + s.crouch * 8 + s.air * 6, -78 + s.crouch * 32 - s.stretch * 14 + s.air * 20, 40 + s.air * 14, 56 - s.crouch * 12 - s.air * 18, -0.25 - s.crouch * 0.5 - s.air * 0.9, 0, 7);
  ctx.fillStyle = grad(ctx, -40, -120, 40, 0, [fur, furD]);
  ctx.fill();
  if (!sil) {
    ctx.clip();
    ctx.strokeStyle = stripe; ctx.lineWidth = 7;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(-46 + i * 13, -60 + s.crouch * 20, 44, -1.9, -0.9); ctx.stroke();
    }
    // bib
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.ellipse(28 + s.crouch * 10, -72 + s.crouch * 30 - s.stretch * 12, 18, 38, -0.2, 0, 7); ctx.fill();
  }
  ctx.restore();
  // haunch stripes
  if (!sil) {
    ctx.strokeStyle = stripe; ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-38, -44, 26 + i * 9, -2.4, -1.5); ctx.stroke(); }
  }

  // ---- near front leg: planted, wound up, or reaching for s.paw
  let px = 30 + s.air * 50, py = pawY, reach = false;
  if (s.paw) {
    px = (s.paw.x - s.x) / (s.f * s.sx); py = (s.paw.y - s.y) / s.sy; reach = true;
  } else if (s.raise > 0) {
    px = px + (L.shx + 22 - px) * s.raise; py = py + (L.shy - 38 - py) * s.raise;
  }
  limb(ctx, L.shx, L.shy, px, py, 17, fur, white, reach || s.raise > 0.6, stripe, !sil);

  // ---- head
  const hx = L.hx, hy = L.hy;
  const earF = s.ears || 0;
  // ears (back ear notched)
  ear(ctx, hx - 20, hy - 22, -0.35 - earF * 0.9, fur, col(PINK), true, sil);
  ear(ctx, hx + 22, hy - 24, 0.3 + earF * 0.9, fur, col(PINK), false, sil);
  // skull + cheek fluff
  ctx.fillStyle = grad(ctx, 0, hy - 34, 0, hy + 30, [fur, furD]);
  ctx.beginPath();
  ctx.moveTo(hx - 36, hy + 4);
  ctx.bezierCurveTo(hx - 38, hy - 30, hx + 38, hy - 34, hx + 38, hy + 2);
  ctx.lineTo(hx + 44, hy + 10); ctx.lineTo(hx + 36, hy + 14); ctx.lineTo(hx + 40, hy + 22);
  ctx.bezierCurveTo(hx + 20, hy + 34, hx - 20, hy + 34, hx - 38, hy + 22);
  ctx.lineTo(hx - 44, hy + 14); ctx.lineTo(hx - 37, hy + 10);
  ctx.closePath(); ctx.fill();
  if (s.wet > 0.3) {
    // soaked: spiky, dripping fur on the crown
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.moveTo(hx - 26, hy - 24);
    for (let i = 0; i <= 6; i++) ctx.lineTo(hx - 26 + i * 9, hy - 30 - (i % 2 ? 9 * s.wet : 0));
    ctx.lineTo(hx + 28, hy - 22); ctx.closePath(); ctx.fill();
  }
  if (!sil) {
    // tabby "M" + cheek stripes
    ctx.strokeStyle = stripe; ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(hx - 12, hy - 14); ctx.lineTo(hx - 7, hy - 26); ctx.lineTo(hx, hy - 17); ctx.lineTo(hx + 7, hy - 27); ctx.lineTo(hx + 12, hy - 14);
    ctx.moveTo(hx - 36, hy + 2); ctx.lineTo(hx - 24, hy + 4); ctx.moveTo(hx - 37, hy + 10); ctx.lineTo(hx - 25, hy + 9);
    ctx.moveTo(hx + 36, hy + 1); ctx.lineTo(hx + 25, hy + 4); ctx.moveTo(hx + 38, hy + 9); ctx.lineTo(hx + 26, hy + 9);
    ctx.stroke();
    // white muzzle
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.ellipse(hx - 4, hy + 15, 11, 9, 0, 0, 7); ctx.ellipse(hx + 14, hy + 15, 11, 9, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + 5, hy + 22, 10, 8, 0, 0, 7); ctx.fill();
    // the smudge on the nose bridge
    ctx.fillStyle = rgba('#2d333c', 0.75);
    ctx.beginPath(); ctx.ellipse(hx + 7, hy + 1, 5, 7, 0.3, 0, 7); ctx.fill();
    eyes(ctx, s, hx, hy);
    // nose
    ctx.fillStyle = PINK;
    ctx.beginPath(); ctx.moveTo(hx + 1, hy + 8); ctx.lineTo(hx + 11, hy + 8); ctx.lineTo(hx + 6, hy + 14); ctx.closePath(); ctx.fill();
    // mouth
    const m = s.mouth || 0;
    if (m > 0.05) {
      ctx.fillStyle = '#5a1f26';
      ctx.beginPath(); ctx.ellipse(hx + 5, hy + 22 + m * 4, 7 + m * 4, 2 + m * 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#d9707e'; ctx.beginPath(); ctx.ellipse(hx + 5, hy + 26 + m * 7, 5 + m * 2, 2 + m * 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const fx of [-3, 13]) { ctx.beginPath(); ctx.moveTo(hx + fx - 2, hy + 18 + m); ctx.lineTo(hx + fx + 2, hy + 18 + m); ctx.lineTo(hx + fx, hy + 23 + m * 5); ctx.closePath(); ctx.fill(); }
    } else {
      ctx.strokeStyle = '#3a2a2e'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(hx + 6, hy + 14); ctx.lineTo(hx + 6, hy + 18);
      ctx.quadraticCurveTo(hx + 1, hy + 22, hx - 3, hy + 19); ctx.moveTo(hx + 6, hy + 18); ctx.quadraticCurveTo(hx + 11, hy + 22, hx + 15, hy + 19); ctx.stroke();
    }
    // whiskers (twitching)
    ctx.strokeStyle = 'rgba(245,245,245,.85)'; ctx.lineWidth = 1;
    const tw = Math.sin(t * 3.1) * 2 - (s.wet > 0.4 ? 6 : 0);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(hx + 18, hy + 16 + i * 3); ctx.quadraticCurveTo(hx + 40, hy + 10 + i * 5 + tw, hx + 58, hy + 8 + i * 8 + tw * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - 8, hy + 16 + i * 3); ctx.quadraticCurveTo(hx - 30, hy + 10 + i * 5 + tw, hx - 48, hy + 8 + i * 8 + tw * 1.5); ctx.stroke();
    }
  }
  ctx.restore();
}

function darken2(c) { return mix(c, '#1d232c', 0.6); }

function limb(ctx, x0, y0, x1, y1, w, fur, sock, claws = false, stripe = null, detail = false) {
  ctx.strokeStyle = fur; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 4, (y0 + y1) / 2, x1, y1); ctx.stroke();
  if (detail && stripe) {
    ctx.strokeStyle = stripe; ctx.lineWidth = 3;
    for (const k of [0.35, 0.55]) {
      const mx = x0 + (x1 - x0) * k, my = y0 + (y1 - y0) * k;
      const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(mx - Math.cos(ang) * 7, my - Math.sin(ang) * 7); ctx.lineTo(mx + Math.cos(ang) * 7, my + Math.sin(ang) * 7); ctx.stroke();
    }
  }
  ctx.fillStyle = sock;
  ctx.beginPath(); ctx.ellipse(x1 + 2, y1, w * 0.8, w * 0.52, 0, 0, 7); ctx.fill();
  if (claws) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x1 + 8, y1 + i * 4); ctx.quadraticCurveTo(x1 + 16, y1 + i * 5, x1 + 15, y1 + i * 5 + 5); ctx.stroke(); }
  }
}

function ear(ctx, x, y, rot, fur, pink, notch, sil) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.moveTo(-13, 6); ctx.lineTo(-2, -24);
  if (notch) { ctx.lineTo(4, -12); ctx.lineTo(7, -15); }
  ctx.lineTo(13, 6); ctx.closePath(); ctx.fill();
  if (!sil) { ctx.fillStyle = pink; ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(-2, -15); ctx.lineTo(7, 4); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

function eyes(ctx, s, hx, hy) {
  const open = Math.max(0, Math.min(1, s.eye ?? 1));
  for (const ex of [hx - 10, hx + 20]) {
    const ey = hy - 4;
    if (s.hurt > 0.4) {
      ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 2.4;
      const d = ex < hx ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(ex - 6 * d, ey - 5); ctx.lineTo(ex + 5 * d, ey); ctx.lineTo(ex - 6 * d, ey + 5); ctx.stroke();
      continue;
    }
    const ry = 7.5 * open;
    if (ry < 0.8) { ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 8, ey); ctx.quadraticCurveTo(ex, ey + 3, ex + 8, ey); ctx.stroke(); continue; }
    ctx.save();
    ctx.beginPath(); ctx.ellipse(ex, ey, 9, ry, 0, 0, 7);
    ctx.fillStyle = grad(ctx, 0, ey - ry, 0, ey + ry, ['#f2d24e', '#a9c94a']);
    ctx.fill();
    ctx.clip();
    // pupil follows the look target
    let lx = 0, ly = 0;
    if (s.look) {
      const wx = s.x + s.f * s.sx * ex, wy = s.y + s.sy * ey;
      const dx = (s.look.x - wx) * s.f, dy = s.look.y - wy, d = Math.hypot(dx, dy) || 1;
      lx = (dx / d) * 3; ly = (dy / d) * 2.5;
    }
    ctx.fillStyle = '#121418';
    ctx.beginPath(); ctx.ellipse(ex + lx, ey + ly, 1.4 + (s.pupil ?? 0.3) * 4.6, ry + 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(ex + lx + 2.5, ey + ly - 2.5, 1.5, 0, 7); ctx.fill();
    ctx.restore();
    // lids / brows: angry slant when ears are flat
    ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = 2;
    const ang = (s.ears || 0) * 0.45 * (ex < hx ? 1 : -1);
    ctx.beginPath(); ctx.moveTo(ex - 10, ey - ry * 0.7 - ang * 10); ctx.lineTo(ex + 10, ey - ry * 0.7 + ang * 10); ctx.stroke();
  }
}

/** Two glowing eyes in the dark (5-1 foreshadowing). */
export function drawEyesInDark(ctx, x, y, open, look, t) {
  for (const dx of [-11, 11]) {
    const ex = x + dx;
    ctx.fillStyle = rgba('#e8d75a', 0.25 * open); ctx.beginPath(); ctx.ellipse(ex, y, 14, 10 * open + 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, y - 6, 0, y + 6, ['#f6e26a', '#b8d24c']);
    ctx.beginPath(); ctx.ellipse(ex, y, 7, 6 * open + 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b0c10';
    ctx.beginPath(); ctx.ellipse(ex + look * 2.5, y, 1.5, 6 * open + 0.3, 0, 0, 7); ctx.fill();
  }
}
