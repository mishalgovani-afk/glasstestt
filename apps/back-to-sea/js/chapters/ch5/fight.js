// Boss fight state machine and small geometry helpers. Pure and DOM-free (tests import it).
//
// Smudge has 6 hp, 2 per phase. A hit during a phase lowers hp; the hit that reaches the phase's
// floor starts a transition to the next phase. A faint resets ONLY the current phase: hp goes back
// to what it was when the phase began (phaseStartHp), never to full.

export const BOSS_MAX = 6;
export const PHASES = [
  { n: 1, from: 6, to: 4, bpm: 116, name: 'Rain & the watering can' },
  { n: 2, from: 4, to: 2, bpm: 130, name: 'Bubbles & the gutter stream' },
  { n: 3, from: 2, to: 0, bpm: 146, name: 'The valves' },
];

export function createFight(startPhase = 1) {
  const n = Math.max(1, Math.min(3, Math.floor(startPhase) || 1));
  const ph = PHASES[n - 1];
  return { phase: n, hp: ph.from, max: BOSS_MAX, phaseStartHp: ph.from, state: 'intro', hits: 0, invuln: 0 };
}

export function phaseOf(f) { return PHASES[f.phase - 1]; }

/** Apply a hit. Returns 'hit' | 'phase' (phase cleared, transition starts) | 'defeated' | null. */
export function hitBoss(f, dmg = 1) {
  if (f.state !== 'fight' || f.invuln > 0) return null;
  const ph = phaseOf(f);
  f.hp = Math.max(ph.to, f.hp - dmg);
  f.hits++;
  f.invuln = 1.2;
  if (f.hp > ph.to) return 'hit';
  if (f.phase >= PHASES.length) { f.state = 'defeated'; return 'defeated'; }
  f.state = 'transition';
  return 'phase';
}

/** Finish a transition: enter the next phase. */
export function nextPhase(f) {
  if (f.state !== 'transition') return false;
  f.phase = Math.min(PHASES.length, f.phase + 1);
  f.phaseStartHp = f.hp;
  f.state = 'fight';
  f.invuln = 0;
  return true;
}

/** After a faint: restore the hp the current phase started with (not the whole fight). */
export function resetPhase(f) {
  if (f.state === 'defeated') return;
  if (f.state === 'transition') nextPhase(f); // fainting mid-transition: the phase was already won
  f.hp = f.phaseStartHp;
  f.state = 'fight';
  f.invuln = 0;
}

export function tickFight(f, dt) { if (f.invuln > 0) f.invuln = Math.max(0, f.invuln - dt); }

/** Position along a pounce arc at k in 0..1 (parabola peaking `height` px above the higher end). */
export function arcPoint(x0, y0, x1, y1, k, height) {
  k = Math.max(0, Math.min(1, k));
  const x = x0 + (x1 - x0) * k;
  const top = Math.min(y0, y1) - height;
  // quadratic through (0,y0) (0.5,~top) (1,y1)
  const y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * (2 * top - (y0 + y1) / 2) + k * k * y1;
  return { x, y };
}

/** Does a circle (cx,cy,r) overlap the box {x,y,w,h}? */
export function circleHitsBox(cx, cy, r, b) {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h));
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
}

/** Clamp a swipe target to the paw's reach from the shoulder; null if out of reach. */
export function swipeTarget(sx, sy, tx, ty, reach, minX) {
  if (tx < minX) return null;
  const d = Math.hypot(tx - sx, ty - sy);
  if (d > reach) return null;
  return { x: tx, y: ty };
}
