// Validator reach rules for chapter 3 (see DESIGN.md "Reach rules"). Each current cell gets an
// honest dash edge simulated with the real physics, using the very same dashLaunch() as the game.
import { dirVec, dashLaunch, drumState, DRUM_ORDER, inDrum } from './flow.js';

const isExit = (level, x, y) => !!level.exit && level.exit.tx === x && level.exit.ty === y;
const isSurface = (env, x, y) => env.isWater(x, y) && !env.isWater(x, y - 1) && !env.isSolid(x, y - 1);

function dashEdges(x, y, dirs, TILE) {
  return dirs.map((d) => {
    const [dx, dy] = dirVec(d);
    const l = dashLaunch(dx, dy);
    return { from: { x, y }, launch: { cx: (x + 0.5) * TILE, cy: (y + 0.5) * TILE, vx: l.vx, vy: l.vy, leapT: l.leapT } };
  });
}

function regionRule(dir) {
  return {
    edges({ x, y, props, env, level, TILE }) {
      const out = [];
      for (let yy = y; yy < y + (props.h || 1); yy++) for (let xx = x; xx < x + (props.w || 1); xx++) {
        if (!env.isWater(xx, yy) || isSurface(env, xx, yy) || isExit(level, xx, yy)) continue; // surface cells keep the plain leap
        out.push(...dashEdges(xx, yy, [dir], TILE));
      }
      return out;
    },
  };
}

const drumRule = {
  edges({ x, y, props, env, level, TILE }) {
    const out = [];
    for (let yy = 0; yy < env.h; yy++) for (let xx = 0; xx < env.w; xx++) {
      if (!env.isWater(xx, yy) || isSurface(env, xx, yy) || isExit(level, xx, yy)) continue;
      if (!inDrum(props, (xx + 0.5) * TILE, (yy + 0.5) * TILE)) continue;
      out.push(...dashEdges(xx, yy, DRUM_ORDER, TILE));
    }
    return out;
  },
};

// A cloth drips like ch1's tap: the cell where the drips land counts as a refill spot.
const clothRule = {
  mark({ x, y, env, props }) {
    if ((props.period || 1.3) > 2) return [];
    for (let yy = y + 1; yy < env.h; yy++) {
      if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
      if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];
    }
    return [];
  },
};

export const reach = {
  R: regionRule('R'), L: regionRule('L'), U: regionRule('U'), D: regionRule('D'),
  A: regionRule('UR'), B: regionRule('UL'), Y: regionRule('DR'), Z: regionRule('DL'),
  M: drumRule, W: clothRule,
};
export { drumState };
