// Validator reach rules for chapter 2 (see DESIGN.md "Reach rules"). Every claim comes from
// logic.js: a bubble touched at its cell carries you up to RISE_TILES, steerable sideways, and
// you may pop (JUMP) at any point of that path into a POP_VY jump.
import { B, popPoints, streamEnd } from './logic.js';

const tileOf = (level, x, y) => (x < 0 || y < 0 || x >= level.w ? '#' : y >= level.h ? '.' : level.tile[y][x]);

/** Cells a bubble cannot pass: solid, hazard, or under any shower head (pulsing or not: be safe). */
function bubbleBlocker(level) {
  const streams = new Set();
  for (const e of level.entities) {
    if (e.ch !== 'H') continue;
    const end = streamEnd(e.tx, e.ty, (x, y) => tileOf(level, x, y), level.h);
    for (let y = e.ty; y <= end; y++) streams.add(`${e.tx},${y}`);
  }
  return (x, y) => {
    const c = tileOf(level, x, y);
    return c === '#' || c === '^' || streams.has(`${x},${y}`);
  };
}

function bubbleEdges({ x, y, level, TILE }, waitTime) {
  const blocked = bubbleBlocker(level);
  return popPoints(x, y, blocked).map((p) => ({
    launch: { cx: (p.x + 0.5) * TILE, cy: (p.y + 0.5) * TILE, vy: B.POP_VY },
    refill: true, time: waitTime,
  }));
}

export const reach = {
  // B: fixed bubble. Touching it captures you (and the bubble keeps you moist).
  B: { trigger: true, refill: true, edges: (ctx) => bubbleEdges(ctx, 0) },
  // M: bubble maker. The nozzle cell is wet; a bubble is blown at most every `period` s.
  M: { trigger: true, refill: true, edges: (ctx) => bubbleEdges(ctx, ctx.props.period || 2.6) },
  // H: an always-on shower refills you where it lands. (Pulsing showers get no credit.)
  H: {
    mark({ x, y, props, env, level }) {
      if (props.period) return [];
      const end = streamEnd(x, y, (a, b) => tileOf(level, a, b), level.h);
      return env.isStand(x, end) ? [{ x, y: end, refill: true }] : [];
    },
  },
  // D: dripping tap, same rule as the kitchen tap.
  D: {
    mark({ x, y, env, props }) {
      if ((props.period || 1.3) > 2) return [];
      for (let yy = y + 1; yy < env.h; yy++) {
        if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
        if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];
      }
      return [];
    },
  },
};
