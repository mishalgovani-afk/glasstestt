// Persistence in localStorage key 'back-to-sea:v1'. Every access is wrapped in try/catch
// (private mode, blocked storage, quota) — the game works without it.

const KEY = 'back-to-sea:v1';

function store() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export const save = {
  data: { cleared: {}, best: {}, total: 0, mute: false, last: null, runStart: null },
  load() {
    try {
      const s = store();
      const raw = s && s.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') this.data = { ...this.data, ...d, cleared: d.cleared || {}, best: d.best || {} };
      }
    } catch { /* ignore */ }
    return this.data;
  },
  write() {
    try { const s = store(); if (s) s.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  },
  isCleared(id) { return !!this.data.cleared[id]; },
  clear(id, time) {
    this.data.cleared[id] = true;
    const b = this.data.best[id];
    if (!(b > 0) || time < b) this.data.best[id] = Math.round(time * 100) / 100;
    this.data.last = id;
    this.write();
  },
  addTime(dt) { this.data.total = (this.data.total || 0) + dt; },
  setMute(m) { this.data.mute = !!m; this.write(); },
};
