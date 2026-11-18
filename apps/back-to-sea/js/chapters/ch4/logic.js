// Chapter 4 pure logic (DOM-free, no engine imports): link states, timers, water fill levels,
// door rows, and a helper that computes the "valves on" tile state for the validator tests.
//
// A *link* is a named on/off switch ('a', 'boiler', ...). Valves toggle links; tanks (T) and
// gates (G) watch links. Water rises and falls through a Fill (a continuous surface row).

/** The set of valve links, their timers (valves that drift back) and checkpoint snapshots. */
export class Plumbing {
  constructor() {
    this.links = new Map();   // id -> { on, t, dur }
    this.saved = [];          // ids that were ON at the last checkpoint (timed links count as OFF)
    this.epoch = 0;           // bumped by restore(): watchers snap to the new state instantly
    this.flip = 0;            // counts changes, for sfx/animation hooks
  }
  _get(id) {
    let l = this.links.get(id);
    if (!l) { l = { on: false, t: 0, dur: 0 }; this.links.set(id, l); }
    return l;
  }
  isOn(id) { const l = this.links.get(id); return !!(l && l.on); }
  /** Seconds left on a timed link (0 when untimed or off). */
  left(id) { const l = this.links.get(id); return l && l.on ? l.t : 0; }
  fraction(id) { const l = this.links.get(id); return l && l.on && l.dur ? l.t / l.dur : 0; }
  set(id, on, dur = 0) {
    const l = this._get(id);
    if (l.on !== on) this.flip++;
    l.on = on; l.dur = on ? dur : 0; l.t = on ? dur : 0;
    return on;
  }
  toggle(id, dur = 0) { return this.set(id, !this.isOn(id), dur); }
  /** Tick timers. Returns the ids that just drifted back to OFF. */
  update(dt) {
    const out = [];
    for (const [id, l] of this.links) {
      if (l.on && l.dur > 0) {
        l.t -= dt;
        if (l.t <= 0) { l.on = false; l.t = 0; l.dur = 0; this.flip++; out.push(id); }
      }
    }
    return out;
  }
  snapshot() { this.saved = [...this.links].filter(([, l]) => l.on && !l.dur).map(([id]) => id); }
  restore() {
    for (const [id, l] of this.links) { l.on = this.saved.includes(id); l.t = 0; l.dur = 0; }
    this.epoch++;
  }
}

/** A water surface that moves toward `off` (link off) or `on` (link on) at rows/second. */
export class Fill {
  /**
   * @param off,on   surface row (float ok) when the link is off / on. Larger row = lower water.
   * @param floor    last row that may hold water (rows below are the tank bottom)
   * @param rise,fall  rows per second
   */
  constructor({ off, on, floor, rise = 2.8, fall = 3 }) {
    this.off = off; this.on = on; this.floor = floor; this.rise = rise; this.fall = fall;
    this.surf = off; this.target = off;
  }
  setTarget(isOn) { this.target = isOn ? this.on : this.off; }
  snap(isOn) { this.setTarget(isOn); this.surf = this.target; }
  get moving() { return Math.abs(this.surf - this.target) > 1e-6; }
  get rising() { return this.target < this.surf - 1e-6; }
  /** First row that is full water (rows >= this, up to floor). */
  get waterRow() { return Math.min(this.floor + 1, Math.ceil(this.surf - 1e-6)); }
  /** Fraction (0..1) of the row above waterRow that is already filled (drawn as a partial rect). */
  get partial() { return Math.max(0, this.waterRow - this.surf); }
  /** 0 (empty) .. 1 (at `on` extreme or `off` extreme) for gauges: share of the tank that is full. */
  get fullness() { return Math.max(0, Math.min(1, (this.floor + 1 - this.surf) / Math.max(1, this.floor + 1 - Math.min(this.on, this.off)))); }
  update(dt) {
    if (!this.moving) return false;
    const up = this.target < this.surf;
    const step = (up ? this.rise : this.fall) * dt;
    if (up) this.surf = Math.max(this.target, this.surf - step);
    else this.surf = Math.min(this.target, this.surf + step);
    return true;
  }
}

/** Is row k (0 = top) of an h-row door still blocked when the door has `ratio` (1 = closed)? */
export function doorRowBlocked(k, h, ratio) { return (k + 0.5) / h < ratio + 1e-9 && ratio > 0; }

/** Number of whole rows blocked by a door at `ratio`. */
export function doorBlockedCount(h, ratio) {
  let n = 0;
  for (let k = 0; k < h; k++) if (doorRowBlocked(k, h, ratio)) n++;
  return n;
}

/**
 * Final tile state of tanks (T) and gates (G) when the links in `onIds` are ON.
 * tile: array of arrays of chars (mutated). ents: [{ ch, tx, ty, props }].
 * Used by the validator tests to check what the valves really make possible.
 */
export function applyLinkState(tile, ents, onIds) {
  const on = (id) => onIds.includes(id);
  for (const e of ents) {
    const p = e.props || {};
    if (e.ch === 'T') {
      const row = on(p.id) ? p.on : p.off;
      const first = Math.min(p.floor + 1, Math.ceil(row - 1e-6));
      for (let y = p.top ?? Math.floor(Math.min(p.on, p.off)); y <= p.floor; y++) for (let x = p.x0; x <= p.x1; x++) {
        const c = tile[y] && tile[y][x];
        if (c === undefined || c === '#' || c === '=' || c === '^') continue;
        tile[y][x] = y >= first ? '~' : '.';
      }
    } else if (e.ch === 'G' && on(p.id)) {
      for (let y = e.ty; y < e.ty + (p.h || 1); y++) for (let x = e.tx; x < e.tx + (p.w || 1); x++) tile[y][x] = '.';
    }
  }
  return tile;
}
