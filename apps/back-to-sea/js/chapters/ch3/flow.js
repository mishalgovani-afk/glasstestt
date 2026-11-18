// Chapter 3 — pure current logic (DOM-free, shared by the game entities, the validator's reach
// rules and tests/ch3.test.mjs). Everything the dash does is derived here so the validator and
// the game can't disagree.
import { TILE, LEAP_BALLISTIC } from '../../core/constants.js';

/** Dash tuning. */
export const DASH_SPEED = 700;      // px/s along the flow
export const DASH_UP = 1.15;        // upward dashes are a bit stronger (they fight gravity)
export const DASH_LIFT = 120;       // a mostly-horizontal dash leaves with this much upward speed
export const DASH_T = LEAP_BALLISTIC; // seconds of ballistic flight (same as a leap)
export const DASH_COOLDOWN = 0.32;  // s between dashes
export const DRIFT_SPEED = 80;      // default current push (px/s), always below SWIM_SPEED (170)

const S = Math.SQRT1_2;
/** Flow directions. */
export const DIRS = {
  R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1],
  UR: [S, -S], UL: [-S, -S], DR: [S, S], DL: [-S, S],
};
export const dirVec = (d) => DIRS[d] || DIRS.R;

/** Launch velocity of a dash along unit vector (dx, dy). */
export function dashLaunch(dx, dy) {
  const vx = dx * DASH_SPEED;
  const vy = (dy < 0 ? dy * DASH_SPEED * DASH_UP : dy * DASH_SPEED) - DASH_LIFT * (1 - Math.abs(dy));
  return { vx, vy, leapT: DASH_T };
}

/** The drum's current direction steps clockwise through these, one per `step` seconds. */
export const DRUM_ORDER = ['U', 'UR', 'R', 'DR', 'D', 'DL', 'L', 'UL'];
export const DRUM_STEP = 1.0;

/** Drum state at time t. props: { step, ccw, start } -> { index, dir, phase (0..1 inside the step), ticks } */
export function drumState(t, props = {}) {
  const step = props.step || DRUM_STEP;
  const ticks = Math.floor(Math.max(0, t) / step) + (props.start || 0);
  const n = DRUM_ORDER.length;
  const i = ((props.ccw ? -ticks : ticks) % n + n) % n;
  return { index: i, dir: DRUM_ORDER[i], phase: (Math.max(0, t) % step) / step, ticks };
}

/** Is the world point (px, py) inside the drum's round interior? props: { cx, cy (tiles, centre), r (tiles) } */
export function inDrum(props, px, py) {
  const dx = px - props.cx * TILE, dy = py - props.cy * TILE;
  return dx * dx + dy * dy <= (props.r * TILE) * (props.r * TILE);
}

/** Cell list of a region rectangle (tile coords) filtered by pred(x, y). */
export function regionCells(x, y, w, h, pred = () => true) {
  const out = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (pred(xx, yy)) out.push({ x: xx, y: yy });
  return out;
}
