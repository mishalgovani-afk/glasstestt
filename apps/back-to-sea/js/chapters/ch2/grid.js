// Tiny map builder so level maps are written as rectangles and points instead of raw strings.
export function grid(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const api = {
    w, h,
    fill(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; return api; },
    set(x, y, c) { g[y][x] = c; return api; },
    puts(y, x0, str) { [...str].forEach((c, i) => { if (c !== '_') g[y][x0 + i] = c; }); return api; },
    floor() { return api.fill(0, h - 2, w - 1, h - 1, '#'); },
    out() { return g.map((r) => r.join('')); },
  };
  return api;
}
