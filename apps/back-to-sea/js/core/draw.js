// Drawing helpers for chapter art. DOM-free at import time: nothing here touches `document`
// until a function is called from the game, so chapter modules can import it under Node.

/** Parse '#rgb' / '#rrggbb' / 'rgb(...)' into [r,g,b]. */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}
export const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r | 0},${g | 0},${b | 0},${a})`; };
/** Mix two colors, t in 0..1. Returns 'rgb(...)'. */
export function mix(c1, c2, t) {
  const a = rgb(c1), b = rgb(c2);
  return `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Linear gradient helper. stops: [[0,'#fff'],[1,'#000']] or ['#fff','#000'] (evenly spaced). */
export function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => (Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), s)));
  return g;
}
export function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((s, i) => (Array.isArray(s) ? g.addColorStop(s[0], s[1]) : g.addColorStop(i / (stops.length - 1), s)));
  return g;
}

/** Soft radial glow (additive-looking light blob). */
export function glow(ctx, x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = radial(ctx, x, y, 0, r, [rgba(color, 1), rgba(color, 0.35), rgba(color, 0)]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Soft drop shadow ellipse (contact shadow under objects). */
export function contactShadow(ctx, cx, cy, rx, ry, alpha = 0.25) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = radial(ctx, 0, 0, 0, rx, [`rgba(0,0,0,${alpha})`, 'rgba(0,0,0,0)']);
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** Create an offscreen canvas (call-time only). */
export function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch { /* fall through */ }
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Current device-pixel scale of a context (logical px -> backing px). */
export function ctxScale(ctx) {
  try { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch { return 1; }
}

const layerCache = new Map();
/**
 * Render something expensive once and reuse it. Returns a canvas of logical size w x h rendered
 * at `scale` backing px per logical px. Blit with ctx.drawImage(c, x, y, w, h).
 *   const img = cached('kitchen-wall', 800, 360, ctxScale(ctx), (c) => { ...draw in logical px... });
 */
export function cached(key, w, h, scale, paint) {
  const k = `${key}|${w}|${h}|${scale.toFixed(2)}`;
  let c = layerCache.get(k);
  if (!c) {
    if (layerCache.size > 48) layerCache.clear();
    c = makeCanvas(w * scale, h * scale);
    const cx = c.getContext('2d');
    cx.scale(scale, scale);
    paint(cx, w, h);
    layerCache.set(k, c);
  }
  return c;
}

/**
 * Blit a pre-rendered canvas (made with cached()/makeCanvas at the context's scale) at logical
 * (x, y), 1:1 on whole device pixels. Much faster than a scaled drawImage, and crisper.
 * Assumes the current transform is a scale + translate (no rotation).
 */
export function blit(ctx, img, x, y) {
  const m = ctx.getTransform();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(img, Math.round(m.a * x + m.e), Math.round(m.d * y + m.f));
  ctx.restore();
}

/**
 * Draw a horizontally repeating layer with parallax.
 * img: canvas of logical width tileW, view: {w,h}, camX: camera x, factor: 0 (fixed) .. 1 (world)
 */
export function parallaxStrip(ctx, img, tileW, tileH, view, camX, factor, y = 0) {
  const off = -((camX * factor) % tileW + tileW) % tileW;
  for (let x = off; x < view.w; x += tileW) blit(ctx, img, x, y);
}

/** Deterministic pseudo-random sequence for art (seeded). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
