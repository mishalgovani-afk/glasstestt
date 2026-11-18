// Tiny ASCII level builder (DOM-free) so levels can be composed from rectangles and stamps.
export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.g = Array.from({ length: h }, () => Array(w).fill('.')); this.props = {}; }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; return this; }
  get(x, y) { return this.g[y] && this.g[y][x]; }
  rect(x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c); return this; }
  put(x, y, s) { [...s].forEach((c, i) => { if (c !== ' ') this.set(x + i, y, c); }); return this; }
  /** Solid box with a water interior: outer rect (x,y,w,h), walls 1 thick, water from row `top` (default y+1). */
  tank(x, y, w, h, top = y + 1) { this.rect(x, y, w, h, '#'); this.rect(x + 1, top, w - 2, y + h - top - 1, '~'); return this; }
  /** Place a current region; letter at its top-left, plain water elsewhere. */
  flow(ch, x, y, w, h, extra = {}) { this.set(x, y, ch); this.props[`${x},${y}`] = { w, h, ...extra }; return this; }
  prop(x, y, p) { this.props[`${x},${y}`] = p; return this; }
  /** Filled disc interior of water with a solid ring (centre cx,cy, interior radius r in tiles). */
  drum(cx, cy, r, ring = 1.2) {
    for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) this.set(x, y, '~'); else if (d <= r + ring) this.set(x, y, '#');
    }
    return this;
  }
  floor() { this.rect(0, this.h - 2, this.w, 2, '#'); return this; }
  rows() { return this.g.map((r) => r.join('')); }
  text() { return this.rows().map((r, i) => String(i).padStart(2) + ' ' + r).join('\n'); }
}
