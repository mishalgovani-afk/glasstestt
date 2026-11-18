// Tiny level painter (DOM-free): build a tile grid with rectangles, then export row strings.
export function grid(w, h, base = '.') {
  const g = Array.from({ length: h }, () => Array(w).fill(base));
  const api = {
    w, h, g,
    fill(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && x >= 0 && x < w) g[y][x] = c; return api; },
    put(x, y, c) { g[y][x] = c; return api; },
    at(x, y) { return g[y][x]; },
    rows() { return g.map((r) => r.join('')); },
  };
  return api;
}
