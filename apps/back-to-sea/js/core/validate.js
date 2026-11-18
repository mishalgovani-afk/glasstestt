// Level validator (DOM-free). Used by tests/levels.test.mjs in CI.
//
// 1. Shape: rectangular map, exactly one S and one E, only known chars, sane metadata.
// 2. Reachability: a search from S to E over "stand" cells (air cell with solid/one-way below),
//    water cells and chapter trigger nodes. Jumps, leaps, walking off ledges and swimming out of
//    water are SIMULATED with the game's own stepBody() at the game's fixed STEP, for a fixed set
//    of human-feasible input strategies (hold a direction from a delay, optionally release).
//    Trajectories that touch a hazard or fall out of the level are discarded.
// 3. Dry budget: every out-of-water stretch must stay under DRY_TIME - VALIDATOR_MARGIN.
//    Water, puddles, checkpoints and cells chapters mark `refill` reset it; each droplet gives a
//    one-time credit (DROPLET_MOISTURE% of DRY_TIME). Collected droplets are tracked per search
//    state so no droplet is counted twice.
//
// The search under-approximates a skilled player (no coyote hops, no wall tricks, a coarse
// set of input timings, droplets only if picked up on a simulated path). If it says a level is
// reachable, the game can reach it with those exact inputs.
//
// Chapter `reach` rules (see DESIGN.md "Reach rules") add cell annotations, trigger nodes and
// edges for chapter entities.

import { parseLevel, CORE_CHARS } from './level.js';
import {
  makeBody, stepBody, bodyInWater, forTilesTouched, overlapsTileBox, applyHop, applyLeap,
} from './physics.js';
import * as K from './constants.js';

const { TILE, STEP } = K;

export const STRATEGIES = (() => {
  const s = [{ dir: 0, delay: 0, hold: Infinity }];
  for (const dir of [-1, 1])
    for (const delay of [0, 0.1, 0.2, 0.32])
      for (const hold of [Infinity, 0.12, 0.28]) s.push({ dir, delay, hold });
  return s;
})();
const WALK_OFF_STRATEGIES = (dir) => [
  { dir, delay: 0, hold: Infinity }, { dir, delay: 0, hold: 0.45 }, { dir, delay: 0, hold: 0.6 },
];
const stratDir = (s, t) => (t >= s.delay && t < s.delay + s.hold ? s.dir : 0);

/** Check metadata + map shape for one level def. Returns array of error strings. */
export function checkShape(def, chapter) {
  const errors = [];
  if (!def || typeof def !== 'object') return ['level is not an object'];
  if (typeof def.id !== 'string' || !/^\d+-\d+$/.test(def.id)) errors.push(`bad id ${JSON.stringify(def.id)} (want "N-M")`);
  if (typeof def.name !== 'string' || !def.name) errors.push('missing name');
  if (typeof def.budget !== 'number' || !(def.budget > 0)) errors.push('budget must be a positive number of seconds');
  const ents = (chapter && chapter.entities) || {};
  for (const ch of Object.keys(ents)) {
    if (ch.length !== 1) errors.push(`entity key '${ch}' must be one char`);
    if (CORE_CHARS.has(ch)) errors.push(`entity char '${ch}' redefines a core char`);
    if (typeof ents[ch] !== 'function') errors.push(`entity '${ch}' is not a class`);
  }
  const parsed = parseLevel(def, chapter);
  errors.push(...parsed.errors);
  if (def.props) for (const k of Object.keys(def.props)) {
    const m = /^(\d+),(\d+)$/.exec(k);
    if (!m) errors.push(`bad props key '${k}' (want "x,y")`);
    else if (+m[1] >= parsed.w || +m[2] >= parsed.h) errors.push(`props key '${k}' is outside the map`);
  }
  return errors;
}

/** Static environment for the validator: per-cell kinds plus the physics env interface. */
export function buildEnv(parsed, chapter) {
  const { w, h } = parsed;
  const n = w * h;
  const solid = new Uint8Array(n), oneway = new Uint8Array(n), water = new Uint8Array(n);
  const hazard = new Uint8Array(n), refill = new Uint8Array(n), noSwim = new Uint8Array(n);
  const fullHazard = new Uint8Array(n);
  const droplet = new Int16Array(n).fill(-1), trig = new Int16Array(n).fill(-1);
  const triggers = [];
  const idx = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = parsed.tile[y][x], i = idx(x, y);
    if (c === '#') solid[i] = 1;
    else if (c === '=') oneway[i] = 1;
    else if (c === '~') water[i] = 1;
    else if (c === '^') hazard[i] = 1;
    else if (c === '-') refill[i] = 1;
  }
  for (const c of parsed.checkpoints) refill[idx(c.tx, c.ty)] = 1;
  parsed.droplets.forEach((d, k) => { if (k < K.MAX_TRACKED_DROPLETS) droplet[idx(d.tx, d.ty)] = k; });

  const reach = (chapter && chapter.reach) || {};
  const ruleErrors = [];
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const setKind = (x, y, kind) => {
    if (!inb(x, y)) return;
    const i = idx(x, y);
    solid[i] = oneway[i] = water[i] = 0;
    if (kind === 'solid') solid[i] = 1;
    else if (kind === 'oneway') oneway[i] = 1;
    else if (kind === 'water') water[i] = 1;
    else if (kind === 'hazard') { hazard[i] = 1; fullHazard[i] = 1; }
  };
  const env = {
    w, h, parsed, solid, oneway, water, hazard, fullHazard, refill, noSwim, droplet, trig, triggers,
    solidAt: (x, y) => (x < 0 || x >= w || y < 0 ? true : y >= h ? false : solid[idx(x, y)] === 1),
    oneWayAt: (x, y) => inb(x, y) && oneway[idx(x, y)] === 1,
    waterAt: (x, y) => inb(x, y) && water[idx(x, y)] === 1,
    ruleErrors,
  };
  const ctxFor = (e) => ({ x: e.tx, y: e.ty, props: e.props, level: parsed, env: query(env), K, TILE });

  for (const e of parsed.entities) {
    const rule = reach[e.ch] || {};
    // Probe the class's default flags (class fields). A hazard counts as a hazard cell; a solid,
    // one-way or water entity must say how the validator should treat it (reach[ch].as), because a
    // moving or partial box can't be assumed to be a static tile.
    if (!rule.as) {
      let probe = null;
      try { probe = new e.cls(null, e.tx * TILE, e.ty * TILE, e.props); } catch { /* constructor needs a world */ }
      if (probe && probe.hazard) setKind(e.tx, e.ty, 'hazard');
      else if (probe && (probe.solid || probe.oneWay || probe.water)) {
        const f = probe.solid ? 'solid' : probe.oneWay ? 'oneWay' : 'water';
        ruleErrors.push(`entity '${e.ch}' at ${e.tx},${e.ty} is ${f}: add reach.${e.ch}.as ('air'|'solid'|'oneway'|'water'|'hazard') so the validator knows how to treat it`);
      }
    }
    if (rule.as) setKind(e.tx, e.ty, rule.as);
    if (rule.mark) {
      let marks = [];
      try { marks = rule.mark(ctxFor(e)) || []; } catch (err) { ruleErrors.push(`reach.${e.ch}.mark threw: ${err.message}`); }
      for (const m of marks) {
        if (!inb(m.x, m.y)) continue;
        const i = idx(m.x, m.y);
        if (m.as) setKind(m.x, m.y, m.as);
        if (m.refill) refill[i] = 1;
        if (m.hazard) { hazard[i] = 1; fullHazard[i] = 1; }
        if (m.noSwim) for (const d of m.noSwim) noSwim[i] |= DIRBIT[d] || 0;
      }
    }
    if (rule.trigger) {
      const t = { index: triggers.length, ch: e.ch, tx: e.tx, ty: e.ty, props: e.props, rule,
        box: rule.box || { x: 0, y: 0, w: TILE, h: TILE } };
      triggers.push(t);
      trig[idx(e.tx, e.ty)] = t.index;
    }
  }
  env.ctxFor = ctxFor;
  return env;
}

const DIRBIT = { L: 1, R: 2, U: 4, D: 8 };

function query(env) {
  const { w, h } = env;
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  return {
    w, h,
    isSolid: (x, y) => env.solidAt(x, y),
    isOneWay: (x, y) => env.oneWayAt(x, y),
    isWater: (x, y) => env.waterAt(x, y),
    isStand: (x, y) => isStand(env, x, y),
    isOpen: (x, y) => inb(x, y) && !env.solidAt(x, y),
  };
}

export function isStand(env, x, y) {
  if (x < 0 || y < 0 || x >= env.w || y >= env.h) return false;
  const i = y * env.w + x;
  if (env.solid[i] || env.water[i] || env.oneway[i] || env.hazard[i]) return false;
  if (y + 1 >= env.h) return false;
  const j = i + env.w;
  return env.solid[j] === 1 || env.oneway[j] === 1;
}

function isSurface(env, x, y) {
  return env.waterAt(x, y) && y > 0 && !env.waterAt(x, y - 1) && !env.solidAt(x, y - 1);
}

/**
 * Simulate one trajectory. start: {cx, cy (body centre px), vx, vy, leapT, onGround}
 * mode: 'jump' (ends on landing / water entry), 'walk' (must leave the ground first),
 *       'swim' (must leave the water first).
 * Returns null (fail) or { kind: 'stand'|'water'|'exit'|'trigger', x, y, trigger, time, picks }.
 */
export function simulate(env, start, strat, mode = 'jump') {
  const b = makeBody(start.cx - K.PLAYER_W / 2, start.cy - K.PLAYER_H / 2);
  b.vx = start.vx || 0; b.vy = start.vy || 0; b.leapT = start.leapT || 0; b.onGround = !!start.onGround;
  b.inWater = bodyInWater(b, env);
  let t = 0, dry = 0, wasOut = !b.inWater, leftGround = mode !== 'walk';
  let ignoreTrig = start.ignoreTrigger ?? -1; // a launch from a trigger ignores it until it leaves
  const picks = [];
  const exit = env.parsed.exit;
  const maxT = K.VALIDATOR_MAX_FLIGHT;
  const fail = { v: false };
  while (t < maxT) {
    stepBody(b, stratDir(strat, t), STEP, env);
    t += STEP;
    if (!b.inWater) { dry += STEP; wasOut = true; }
    if (b.y > env.h * TILE + 48) return null;
    // hazards, droplets, exit, triggers
    let hit = null, inIgnored = false;
    fail.v = false;
    forTilesTouched(b, (tx, ty) => {
      if (fail.v || hit || tx < 0 || ty < 0 || tx >= env.w || ty >= env.h) return;
      const i = ty * env.w + tx;
      if (env.hazard[i] && overlapsTileBox(b, tx, ty, env.fullHazard[i] ? FULL : K.HAZARD_BOX)) { fail.v = true; return; }
      if (exit && tx === exit.tx && ty === exit.ty && overlapsTileBox(b, tx, ty, K.EXIT_BOX)) { hit = { kind: 'exit' }; return; }
      if (env.trig[i] >= 0) {
        const tr = env.triggers[env.trig[i]];
        if (overlapsTileBox(b, tx, ty, tr.box)) {
          if (tr.index === ignoreTrig) { inIgnored = true; return; }
          hit = { kind: 'trigger', trigger: tr.index, x: tx, y: ty }; return;
        }
      }
      if (env.droplet[i] >= 0 && overlapsTileBox(b, tx, ty, K.DROPLET_BOX)) {
        const id = env.droplet[i];
        if (!picks.some((p) => p.id === id)) picks.push({ id, t: dry });
      }
    });
    if (fail.v) return null;
    if (hit) return { ...hit, time: dry, picks };
    if (!inIgnored) ignoreTrig = -1;
    if (mode === 'walk' && !b.onGround) leftGround = true;
    if (mode === 'walk' && !leftGround && t > 1.2) return null;
    if (mode === 'swim' && !wasOut && t > 1.5) return null;
    if (b.inWater && wasOut) {
      const tx = Math.floor((b.x + b.w / 2) / TILE), ty = Math.floor((b.y + b.h / 2) / TILE);
      if (!env.waterAt(tx, ty)) return null;
      return { kind: 'water', x: tx, y: ty, time: dry, picks };
    }
    if (!b.inWater && b.onGround && leftGround && wasOut) {
      const cell = standCellUnder(env, b);
      if (!cell) return null;
      // the next move starts from the cell centre: charge the wriggle to get there
      const recenter = Math.abs(b.x + b.w / 2 - (cell.x + 0.5) * TILE) / K.WRIGGLE_SPEED;
      return { kind: 'stand', x: cell.x, y: cell.y, time: dry + recenter, picks };
    }
  }
  return null;
}
const FULL = { x: 0, y: 0, w: TILE, h: TILE };

function standCellUnder(env, b) {
  const ty = Math.floor((b.y + b.h - 1) / TILE);
  const cx = b.x + b.w / 2;
  const txc = Math.floor(cx / TILE);
  const cands = [];
  for (let tx = Math.floor(b.x / TILE); tx <= Math.floor((b.x + b.w - 0.001) / TILE); tx++) {
    if (isStand(env, tx, ty)) cands.push(tx);
  }
  if (!cands.length) return null;
  cands.sort((a, c) => Math.abs(a - txc) - Math.abs(c - txc));
  return { x: cands[0], y: ty };
}

/** Full validation: shape + reachability. Returns { ok, errors[], stats }. */
export function validateLevel(def, chapter) {
  const errors = checkShape(def, chapter);
  if (errors.length) return { ok: false, errors, stats: null };
  const parsed = parseLevel(def, chapter);
  const env = buildEnv(parsed, chapter);
  if (env.ruleErrors.length) return { ok: false, errors: env.ruleErrors, stats: null };
  const r = searchReach(env, (chapter && chapter.reach) || {});
  if (!r.ok) errors.push(r.reason);
  if (r.ruleErrors.length) errors.push(...r.ruleErrors);
  return { ok: errors.length === 0, errors, stats: r.stats };
}

/** The reachability search over a buildEnv() result. Exported for tests. */
export function searchReach(env, reach = {}) {
  const { w, h, parsed } = env;
  const N = w * h;
  const BUDGET = K.DRY_TIME - K.VALIDATOR_MARGIN;
  const CREDIT = (K.DROPLET_MOISTURE / K.MOISTURE_MAX) * K.DRY_TIME;
  const exit = parsed.exit;
  const exitIdx = exit.ty * w + exit.tx;
  const ruleErrors = [];
  // node ids: cell index for stand/water cells; N + trigger index for trigger nodes; -1 = exit
  const EXIT = -1;
  const isRefillNode = (id) => {
    if (id >= N) return !!env.triggers[id - N].rule.refill;
    return env.water[id] === 1 || env.refill[id] === 1;
  };
  const nodeOfCell = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const i = y * w + x;
    if (env.trig[i] >= 0) return N + env.trig[i];
    if (i === exitIdx && (env.water[i] || isStand(env, x, y))) return EXIT;
    if (env.water[i]) return i;
    if (isStand(env, x, y)) return i;
    return null;
  };
  const resultNode = (r) => {
    if (!r) return null;
    if (r.kind === 'exit') return EXIT;
    if (r.kind === 'trigger') return N + r.trigger;
    return nodeOfCell(r.x, r.y);
  };

  const edgeCache = new Map();
  // jobs: [{ start, strat, mode }] -> deduped edges (fastest per target + droplet set)
  const addSims = (out, from, jobs) => {
    const seen = new Set();
    for (const { start, strat: s, mode } of jobs) {
      const r = simulate(env, start, s, mode);
      const to = resultNode(r);
      if (to === null || to === from) continue;
      const key = `${to}|${r.picks.map((p) => p.id).join(',')}`;
      // keep the fastest trajectory per (target, droplet set)
      const prev = seen.has(key) ? out.find((e) => e.key === key) : null;
      const how = { mode, start, strat: s };
      if (prev) { if (r.time < prev.time) { prev.time = r.time; prev.picks = r.picks; prev.how = how; } continue; }
      seen.add(key);
      out.push({ key, to, time: r.time, picks: r.picks, refillBefore: false, how });
    }
  };

  const edgesOf = (id) => {
    if (edgeCache.has(id)) return edgeCache.get(id);
    const out = [];
    if (id >= N) {
      ruleEdges(id - N, out);
    } else {
      const x = id % w, y = (id / w) | 0;
      const cx = (x + 0.5) * TILE;
      if (env.water[id]) {
        // swim within connected water
        for (const [dx, dy, bit] of [[-1, 0, 1], [1, 0, 2], [0, -1, 4], [0, 1, 8]]) {
          if (env.noSwim[id] & bit) continue;
          const nx = x + dx, ny = y + dy;
          if (!env.waterAt(nx, ny)) continue;
          const to = nodeOfCell(nx, ny);
          if (to !== null) out.push({ to, time: 0, picks: [], refillBefore: false, how: { mode: 'swim', dx, dy } });
        }
        const jobs = [];
        if (isSurface(env, x, y)) {
          // leap: body centre 10px under the surface (inside LEAP_ZONE), as the game requires
          const cy = y * TILE + 10;
          for (const s of STRATEGIES) {
            jobs.push({ start: { cx, cy, vx: 0, vy: K.LEAP_VY, leapT: K.LEAP_BALLISTIC }, strat: s, mode: 'jump' });
            if (s.dir && s.delay === 0 && isSurface(env, x - s.dir, y))
              jobs.push({ start: { cx, cy, vx: s.dir * K.SWIM_SPEED, vy: K.LEAP_VY, leapT: K.LEAP_BALLISTIC }, strat: s, mode: 'jump' });
          }
        }
        for (const dir of [-1, 1]) {
          if (env.solidAt(x + dir, y) || env.waterAt(x + dir, y)) continue;
          for (const s of WALK_OFF_STRATEGIES(dir)) jobs.push({ start: { cx, cy: (y + 0.5) * TILE, vx: 0, vy: 0 }, strat: s, mode: 'swim' });
        }
        addSims(out, id, jobs);
      } else {
        // standing
        const bottom = (y + 1) * TILE;
        const cy = bottom - K.PLAYER_H / 2;
        const jobs = [];
        for (const dir of [-1, 1]) {
          const nx = x + dir;
          const to = nodeOfCell(nx, y);
          if (to !== null && !env.water[y * w + nx] && (to === EXIT || to >= N || isStand(env, nx, y))) {
            const time = (TILE / K.WRIGGLE_SPEED) * K.WALK_TIME_FACTOR;
            const di = env.droplet[y * w + nx];
            out.push({ to, time, picks: di >= 0 ? [{ id: di, t: time }] : [], refillBefore: false, how: { mode: 'walk', dir } });
          } else if (!env.solidAt(nx, y)) {
            for (const s of WALK_OFF_STRATEGIES(dir)) jobs.push({ start: { cx, cy, vx: 0, vy: 0, onGround: true }, strat: s, mode: 'walk' });
          }
        }
        const splash = parsed.tile[y][x] === '-';
        const vy = splash ? K.SPLASH_HOP_VY : K.HOP_VY;
        for (const s of STRATEGIES) {
          jobs.push({ start: { cx, cy, vx: 0, vy }, strat: s, mode: 'jump' });
          if (s.dir && s.delay === 0 && isStand(env, x - s.dir, y))
            jobs.push({ start: { cx, cy, vx: s.dir * K.WRIGGLE_SPEED, vy }, strat: s, mode: 'jump' });
        }
        addSims(out, id, jobs);
      }
      // rule edges that start from this cell
      if (env.cellRuleEdges && env.cellRuleEdges.has(id)) for (const e of env.cellRuleEdges.get(id)) pushRuleEdge(e, id, out);
    }
    edgeCache.set(id, out);
    return out;
  };

  // Rule edges: collect per trigger (from the trigger node) and per cell (edges with `from`).
  const triggerEdges = new Map();
  env.cellRuleEdges = new Map();
  for (const e of parsed.entities) {
    const tIdx = env.trig[e.ty * w + e.tx];
    const rule = reach[e.ch];
    if (!rule || !rule.edges) continue;
    let list = [];
    try { list = rule.edges(env.ctxFor(e)) || []; } catch (err) { ruleErrors.push(`reach.${e.ch}.edges threw: ${err.message}`); continue; }
    for (const ed of list) {
      if (ed.from) {
        const fid = nodeOfCell(ed.from.x, ed.from.y);
        if (fid === null || fid === EXIT) { ruleErrors.push(`reach.${e.ch}: edge from ${ed.from.x},${ed.from.y} is not a stand/water cell`); continue; }
        if (!env.cellRuleEdges.has(fid)) env.cellRuleEdges.set(fid, []);
        env.cellRuleEdges.get(fid).push(ed);
      } else if (tIdx >= 0) {
        if (!triggerEdges.has(tIdx)) triggerEdges.set(tIdx, []);
        triggerEdges.get(tIdx).push(ed);
      } else ruleErrors.push(`reach.${e.ch}: edge without 'from' needs trigger: true`);
    }
  }
  function pushRuleEdge(ed, from, out) {
    const refillBefore = !!ed.refill;
    if (ed.to) {
      const to = nodeOfCell(ed.to.x, ed.to.y);
      if (to === null) { ruleErrors.push(`reach: edge to ${ed.to.x},${ed.to.y} is not a stand/water/trigger cell`); return; }
      out.push({ to, time: ed.time || 0, picks: [], refillBefore, how: { mode: 'rule', ed } });
    } else if (ed.launch) {
      const L = ed.launch;
      const strats = ed.steer === false ? [STRATEGIES[0]] : STRATEGIES;
      const tmp = [];
      const start = { cx: L.cx, cy: L.cy, vx: L.vx || 0, vy: L.vy || 0, leapT: L.leapT || 0, ignoreTrigger: from >= N ? from - N : -1 };
      addSims(tmp, from, strats.map((s) => ({ start, strat: s, mode: 'jump' })));
      for (const t of tmp) { t.refillBefore = refillBefore; t.time += ed.time || 0; t.how = { ...t.how, rule: ed }; out.push(t); }
    }
  }
  function ruleEdges(tIdx, out) {
    for (const ed of triggerEdges.get(tIdx) || []) pushRuleEdge(ed, N + tIdx, out);
  }

  // Start node: S is water, or a stand cell, or we fall from it.
  const S = parsed.spawn;
  let starts = [];
  const sNode = nodeOfCell(S.tx, S.ty);
  if (sNode !== null) starts.push({ to: sNode, time: 0, picks: [] });
  else {
    const r = simulate(env, { cx: (S.tx + 0.5) * TILE, cy: (S.ty + 0.5) * TILE, vx: 0, vy: 0 }, STRATEGIES[0], 'jump');
    const to = resultNode(r);
    if (to !== null) starts.push({ to, time: r.time, picks: r.picks });
  }
  if (!starts.length) return { ok: false, reason: 'S does not come to rest anywhere (falls out or into a hazard)', ruleErrors };

  // Label-correcting search over (node, droplet mask) with dominance on (mask subset, dry time).
  const labels = new Map(); // node -> [{mask, d}]
  const queue = [];
  let explored = 0, bestX = S.tx;
  const parent = new Map();
  const parentHow = new Map(); // node -> how the search first got there (for stats.steps)
  const describe = (n) => (n >= N ? `${env.triggers[n - N].ch}@${env.triggers[n - N].tx},${env.triggers[n - N].ty}` : `${env.water[n] ? '~' : ''}${n % w},${(n / w) | 0}`);
  // the route as moves: [{ to: 'x,y' | '~x,y' | 'B@x,y' | 'E', how: { mode, start?, strat?, dir?, ed? } }]
  const stepsTo = (n, lastHow) => {
    const out = [{ to: 'E', how: lastHow }]; let k = n, guard = 0;
    while (k !== null && k !== undefined && guard++ < 999) { out.push({ to: describe(k), how: parentHow.get(k) || null }); k = parent.get(k); }
    return out.reverse();
  };
  const pathTo = (n) => { const out = []; let k = n, guard = 0; while (k !== null && k !== undefined && guard++ < 999) { out.push(describe(k)); k = parent.get(k); } return out.reverse(); };
  let goalFrom = null;
  let goalHow = null;
  const tryAdd = (node, mask, d, from, how = null) => {
    if (node === EXIT) { goalFrom = from; goalHow = how; return true; }
    if (isRefillNode(node)) d = 0;
    const list = labels.get(node) || [];
    for (const L of list) if ((L.mask & mask) === L.mask && L.d <= d + 1e-9) return false;
    const kept = list.filter((L) => !((mask & L.mask) === mask && d <= L.d + 1e-9));
    kept.push({ mask, d });
    labels.set(node, kept);
    if (!parent.has(node)) { parent.set(node, from); parentHow.set(node, how); }
    queue.push({ node, mask, d });
    return false;
  };
  const travel = (d0, mask0, edge) => {
    let d = edge.refillBefore ? 0 : d0, mask = mask0, last = 0;
    for (const p of edge.picks) {
      d += p.t - last; last = p.t;
      if (d >= BUDGET) return null;
      const bit = 1 << p.id;
      if (!(mask & bit)) { mask |= bit; d = Math.max(0, d - CREDIT); }
    }
    d += edge.time - last;
    if (d >= BUDGET) return null;
    return { d, mask };
  };
  for (const s of starts) {
    const r = travel(0, 0, s);
    if (r && tryAdd(s.to, r.mask, r.d, null)) return { ok: true, stats: { explored: 0, path: ['S', 'E'] }, ruleErrors };
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const list = labels.get(cur.node);
    if (!list || !list.some((L) => L.mask === cur.mask && L.d === cur.d)) continue; // superseded
    explored++;
    if (cur.node < N) bestX = Math.max(bestX, cur.node % w);
    for (const e of edgesOf(cur.node)) {
      const r = travel(cur.d, cur.mask, e);
      if (!r) continue;
      if (tryAdd(e.to, r.mask, r.d, cur.node, e.how || null)) {
        return { ok: true, stats: { explored, nodes: labels.size, path: [...pathTo(goalFrom), 'E'], steps: stepsTo(goalFrom, goalHow) }, ruleErrors };
      }
    }
  }
  const reached = [...labels.keys()].filter((n) => n < N).map((n) => `${n % w},${(n / w) | 0}`);
  return {
    ok: false,
    reason: `E (${exit.tx},${exit.ty}) is not reachable from S (${S.tx},${S.ty}) within the dry budget; ` +
      `furthest column reached: ${bestX}; ${reached.length} cells reachable`,
    stats: { explored, reached },
    ruleErrors,
  };
}

/** Validate every level in a chapter module. Returns [{ id, ok, errors, stats }]. */
export function validateChapter(chapter) {
  const out = [];
  const ids = new Set();
  for (const def of chapter.levels || []) {
    const r = validateLevel(def, chapter);
    if (ids.has(def.id)) r.errors.push(`duplicate level id ${def.id}`);
    ids.add(def.id);
    out.push({ id: def && def.id, ok: r.errors.length === 0, errors: r.errors, stats: r.stats });
  }
  return out;
}
