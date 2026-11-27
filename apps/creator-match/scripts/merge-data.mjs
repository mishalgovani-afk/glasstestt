#!/usr/bin/env node
// Merge a fresh creators.json into the one on the `data` branch, by key. Deterministic: the same inputs give byte-identical output,
// so two workflow runs that merge right before committing cannot clobber each other (each keeps the union, newest entry wins).
//
//   node scripts/merge-data.mjs --base <file on data branch> --new <fresh file> --out <file> [--max N]
//
// creators: keyed by creator id; the entry with the newer `fetchedAt` wins (a tie goes to --new). Over --max (3000) creators the oldest
//           `fetchedAt` are evicted. games: keyed by appid, union; when both files have the game the one with tags wins, --new on a tie.
// generatedAt is the later of the two. Sample data never pollutes live data: a sample --base is ignored, a sample --new is ignored when --base is live.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs, writeJsonAtomic, log, warn } from "./lib.mjs";
import { validateCreators, repairCreators } from "./validate.mjs";

function readJson(p) {
  try { return p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; } catch (e) { warn(`cannot read ${p}: ${e.message}`); return null; }
}
const ts = (v) => { const t = Date.parse(v || ""); return Number.isFinite(t) ? t : 0; };
const maxIso = (a, b) => (ts(a) >= ts(b) ? a : b) || new Date(0).toISOString();

export function mergeCreators(base, next, { max = 3000, warn: say = () => {} } = {}) {
  if (base && base.source !== "live") base = null;
  if (next && next.source !== "live" && base) next = null;
  const creators = new Map();
  const put = (c, fileTime) => {
    const f = c.fetchedAt || fileTime;
    const cur = creators.get(c.id);
    if (!cur || ts(f) >= ts(cur.fetchedAt)) creators.set(c.id, { ...c, fetchedAt: f });
  };
  for (const c of base?.creators || []) put(c, base.generatedAt);
  for (const c of next?.creators || []) put(c, next.generatedAt);
  let list = [...creators.values()];
  if (list.length > max) list = list.sort((x, y) => ts(y.fetchedAt) - ts(x.fetchedAt) || (x.id < y.id ? -1 : 1)).slice(0, max);
  list.sort((x, y) => (y.followers ?? 0) - (x.followers ?? 0) || (x.id < y.id ? -1 : 1));
  const games = new Map();
  for (const g of base?.games || []) games.set(g.appid, g);
  for (const g of next?.games || []) {
    const cur = games.get(g.appid);
    if (!cur || (g.tags?.length ?? 0) >= (cur.tags?.length ?? 0)) games.set(g.appid, g);
  }
  const merged = {
    generatedAt: maxIso(base?.generatedAt, next?.generatedAt),
    source: base?.source === "live" || next?.source === "live" ? "live" : "sample",
    creators: list,
    games: [...games.values()].sort((x, y) => x.appid - y.appid),
  };
  return repairCreators(merged, say).file; // never leaves dangling game references: missing games get a stub
}

export function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (!a.new || !a.out) throw new Error("usage: merge-data.mjs --base <file> --new <file> --out <file> [--max N]");
  const base = readJson(a.base);
  const next = readJson(a.new);
  if (!base && !next) throw new Error("neither --base nor --new could be read");
  const out = mergeCreators(base, next, { max: Number(a.max ?? 3000), warn });
  const errs = validateCreators(out, { minCreators: 0 });
  if (errs.length) throw new Error(`merged creators do not validate: ${errs.slice(0, 5).join("; ")}`);
  writeJsonAtomic(a.out, out);
  log(`merged creators: base ${(base?.creators || []).length} + new ${(next?.creators || []).length} -> ${out.creators.length} creators, ${out.games.length} games, wrote ${a.out}`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (e) { console.error("MERGE FAILED:", e.message); process.exit(1); }
}
