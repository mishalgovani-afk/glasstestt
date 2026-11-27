#!/usr/bin/env node
// Merge a fresh data file into the one on the `data` branch, by key. Deterministic: the same inputs give byte-identical output,
// so two workflow runs that merge right before committing cannot clobber each other (each keeps the union, newest entry wins).
//
//   node scripts/merge-data.mjs --base <file on data branch> --new <fresh file> --out <file> [--type corpus|catalog] [--max N] [--watchlist FILE]
//
// corpus.json : games keyed by appid; the entry with the newer `fetchedAt` wins (a tie goes to --new). tagIndex is the union of both
//               (restricted to appids that still exist), generatedAt the later one. Over --max (5000) games the oldest `fetchedAt` go first;
//               watchlist games are never evicted.
// catalog.json: entries keyed by `a` (appid); --new wins; over --max (20000) the least useful are evicted (see trimCatalog).
// Sample data never overwrites or pollutes live data: a sample --base is ignored, a sample --new is ignored when --base is live.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs, writeJsonAtomic, log, warn } from "./lib.mjs";
import { validateCorpus, validateCatalog } from "./validate.mjs";
import { trimCatalog, catalogFile } from "./catalog.mjs";

function readJson(p) {
  try { return p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; } catch (e) { warn(`cannot read ${p}: ${e.message}`); return null; }
}
const ts = (v) => { const t = Date.parse(v || ""); return Number.isFinite(t) ? t : 0; };
const maxIso = (a, b) => (ts(a) >= ts(b) ? a : b) || new Date(0).toISOString();

export function mergeCorpus(base, next, { max = 5000, keep = new Set() } = {}) {
  if (base && base.source !== "live") base = null;
  if (next && next.source !== "live" && base) next = null;
  const games = new Map();
  const put = (g, fileTime) => {
    const f = g.fetchedAt || fileTime;
    const cur = games.get(g.appid);
    if (!cur || ts(f) >= ts(cur.fetchedAt)) games.set(g.appid, { ...g, fetchedAt: f });
  };
  for (const g of base?.games || []) put(g, base.generatedAt);
  for (const g of next?.games || []) put(g, next.generatedAt);
  if (games.size > max) {
    const evict = [...games.values()].filter((g) => !keep.has(g.appid)).sort((x, y) => ts(x.fetchedAt) - ts(y.fetchedAt) || x.appid - y.appid);
    for (const g of evict) { if (games.size <= max) break; games.delete(g.appid); }
  }
  const tagIndex = {};
  for (const idx of [base?.tagIndex, next?.tagIndex]) for (const [tag, ids] of Object.entries(idx || {})) for (const id of ids) if (games.has(id)) (tagIndex[tag] ||= new Set()).add(id);
  const sortedTags = Object.keys(tagIndex).sort();
  return {
    generatedAt: maxIso(base?.generatedAt, next?.generatedAt),
    source: base?.source === "live" || next?.source === "live" ? "live" : "sample",
    games: [...games.values()].sort((x, y) => x.appid - y.appid),
    tagIndex: Object.fromEntries(sortedTags.map((t) => [t, [...tagIndex[t]].sort((x, y) => x - y)])),
  };
}

export function mergeCatalog(base, next, { max = 20000, keep = new Set() } = {}) {
  if (base && base.source !== "live") base = null;
  if (next && next.source !== "live" && base) next = null;
  const entries = new Map();
  for (const e of base?.games || []) entries.set(e.a, e);
  const fresh = new Set();
  for (const e of next?.games || []) { entries.set(e.a, e); fresh.add(e.a); }
  const trimmed = trimCatalog(entries, max, fresh, keep);
  return catalogFile(trimmed.values(), { source: base?.source === "live" || next?.source === "live" ? "live" : "sample", generatedAt: maxIso(base?.generatedAt, next?.generatedAt) });
}

export function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (!a.new || !a.out) throw new Error("usage: merge-data.mjs --base <file> --new <file> --out <file> [--type corpus|catalog] [--max N] [--watchlist FILE]");
  const base = readJson(a.base);
  const next = readJson(a.new);
  if (!base && !next) throw new Error("neither --base nor --new could be read");
  const sample = next || base;
  const type = a.type || (sample.tagIndex ? "corpus" : "catalog");
  const keep = new Set((readJson(a.watchlist)?.appids || []).map(Number));
  let out, errs;
  if (type === "corpus") {
    out = mergeCorpus(base, next, { max: Number(a.max ?? 5000), keep });
    errs = validateCorpus(out, { minGames: 1 });
  } else {
    out = mergeCatalog(base, next, { max: Number(a.max ?? 20000), keep });
    errs = validateCatalog(out, { minGames: 1 });
  }
  if (errs.length) throw new Error(`merged ${type} does not validate: ${errs.slice(0, 5).join("; ")}`);
  writeJsonAtomic(a.out, out);
  log(`merged ${type}: base ${(base?.games || []).length} + new ${(next?.games || []).length} -> ${out.games.length} entries, wrote ${a.out}`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (e) { console.error("MERGE FAILED:", e.message); process.exit(1); }
}
