#!/usr/bin/env node
// Fast-track: put one or more specific games into the corpus right now, together with a quick set of comparable games.
//
//   node scripts/add-game.mjs --games "<appid or name>,<appid or name>" --out <dir> [--base DATA_DIR]
//
//   1. Resolve each entry: a number is an appid; a name is looked up in the base catalog/corpus, then Steam storesearch
//      (api/storesearch/?term=), then search/suggest.
//   2. Fetch the full details of those games first (store details, SteamSpy tags, followers, reviews).
//   3. For each game's top 3 specific (non-generic) tags, find about 25 comparable games, indies first: upcoming, then small/mid, then hits.
//   4. Write <dir>/corpus.json, <dir>/catalog.json (partial: only what was read here; merge with merge-data.mjs) and
//      <dir>/watchlist-added.json ({"appids": [...]}) with the games to add to watchlist.json.
//
// --base DATA_DIR is a checkout of the data branch (DATA_DIR/page-doctor/{corpus,catalog}.json); it is only READ: games already fresh there
// are not fetched again as comparables. Budget: ADD_DEADLINE_MIN (default 10). The requested games ignore the deadline.
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs, numEnv, Throttle, getJson, getText, writeJsonAtomic, log, warn } from "./lib.mjs";
import { parsePopularTags, parseStoreSearch, parseSuggestHtml, pickBestMatch, specificTags, catalogEntryFromRow, catalogEntryFromGame } from "./parsers.mjs";
import { validateCorpus, validateCatalog } from "./validate.mjs";
import { makeGameFetcher, storeBase } from "./game-fetch.mjs";
import { discoverTag } from "./discover.mjs";
import { catalogFile } from "./catalog.mjs";
import { TAGS } from "./fetch-steam.mjs";

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const DAY = 86400000;
const readLive = (p) => { try { if (!p || !existsSync(p)) return null; const j = JSON.parse(readFileSync(p, "utf8")); return j && j.source === "live" ? j : null; } catch { return null; } };

export async function resolveGame(term, { steam, catalogByName, log: say = log }) {
  const t = String(term).trim();
  if (/^\d+$/.test(t)) return { appid: Number(t), name: null, via: "appid" };
  const hit = catalogByName.get(norm(t));
  if (hit) return { appid: hit.appid, name: hit.name, via: "known" };
  try {
    const items = parseStoreSearch(await getJson(`${storeBase()}/api/storesearch/?term=${encodeURIComponent(t)}&l=english&cc=US`, steam));
    const best = pickBestMatch(t, items);
    if (best) return { ...best, via: "storesearch" };
  } catch (e) { warn(`storesearch "${t}": ${e.message}`); }
  try {
    const { text } = await getText(`${storeBase()}/search/suggest?term=${encodeURIComponent(t)}&f=games&cc=US&l=english&require_type=game,software`, steam);
    const best = pickBestMatch(t, parseSuggestHtml(text));
    if (best) return { ...best, via: "suggest" };
  } catch (e) { warn(`suggest "${t}": ${e.message}`); }
  say(`could not resolve "${t}"`);
  return null;
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (!a.games || !a.out) throw new Error('usage: add-game.mjs --games "<appid or name>,..." --out <dir> [--base DATA_DIR]');
  const terms = String(a.games).split(",").map((s) => s.trim()).filter(Boolean);
  const deadlineMin = Number(a["deadline-min"] ?? numEnv("ADD_DEADLINE_MIN", 10));
  const perTagTarget = Number(a["per-tag"] ?? 25);
  const t0 = Date.now();
  const deadline = t0 + deadlineMin * 60000;
  const outOfTime = () => Date.now() > deadline;
  const steam = new Throttle("steam", numEnv("STEAM_DELAY_MS", 1100));
  const spyT = new Throttle("steamspy", numEnv("STEAMSPY_DELAY_MS", 1100));
  const comT = new Throttle("steamcommunity", numEnv("STEAM_COMMUNITY_DELAY_MS", 1100));
  const now = new Date();
  const idToName = new Map();
  const fetcher = makeGameFetcher({ steam, spyT, comT, idToName, years: 3, now });
  log(`add-game: ${terms.length} requested (${terms.join(" | ")}), out=${a.out}, deadline=${deadlineMin}min`);

  // ---- base data (read only)
  const baseDir = a.base ? join(a.base, "page-doctor") : null;
  const baseCorpus = readLive(baseDir && join(baseDir, "corpus.json"));
  const baseCatalog = readLive(baseDir && join(baseDir, "catalog.json"));
  const known = new Map((baseCorpus?.games || []).map((g) => [g.appid, g]));
  const catalogByName = new Map();
  for (const e of baseCatalog?.games || []) catalogByName.set(norm(e.n), { appid: e.a, name: e.n });
  for (const g of baseCorpus?.games || []) catalogByName.set(norm(g.name), { appid: g.appid, name: g.name });

  // ---- tag ids
  let live = {};
  try { live = parsePopularTags(await getJson(`${storeBase()}/tagdata/populartags/english`, steam)); } catch (e) { warn(`populartags unavailable (${e.message}); using built-in tag ids`); }
  const idByName = new Map();
  for (const t of TAGS) for (const n of [t.name, ...(t.aliases || [])]) { idByName.set(norm(n), t.id); idToName.set(t.id, t.name); }
  for (const [n, id] of Object.entries(live)) { idByName.set(norm(n), id); idToName.set(id, n); }

  // ---- 1. resolve
  const resolved = [];
  for (const term of terms) {
    const r = await resolveGame(term, { steam, catalogByName });
    if (r && !resolved.some((x) => x.appid === r.appid)) { resolved.push(r); log(`resolved "${term}" -> ${r.appid}${r.name ? ` (${r.name})` : ""} via ${r.via}`); }
  }
  if (!resolved.length) throw new Error("none of the requested games could be resolved");

  // ---- 2. the requested games first (they ignore the deadline)
  const fresh = new Map();
  const failed = [];
  for (const r of resolved) {
    const res = await fetcher.fetchGame({ appid: r.appid, mode: "watch", memberships: [] });
    if (res.game) { fresh.set(r.appid, res.game); log(`fetched ${r.appid} "${res.game.name}": ${res.game.tags.length} tags, ${res.game.comingSoon ? "upcoming" : `${res.game.reviews.total ?? "?"} reviews`}`); }
    else { failed.push(r.appid); warn(`could not fetch ${r.appid} (${res.skip})`); }
  }
  const targetIds = [...fresh.keys()];

  // ---- 3. comparables: top 3 specific tags of each requested game, ~25 games each, indies first
  const perTagSeen = {};
  const rowsSeen = new Map();
  const queue = [];
  const queued = new Set(targetIds);
  const comparableTags = new Map(); // tag name -> {name,id}
  for (const g of fresh.values()) for (const name of specificTags(g, 3)) {
    const id = idByName.get(norm(name));
    if (!id) { warn(`no Steam tag id known for "${name}", skipping it`); continue; }
    comparableTags.set(norm(name), { name, id });
  }
  const share = { upcoming: Math.round(perTagTarget * 0.4), mid: Math.round(perTagTarget * 0.4) };
  const quotas = { upcoming: share.upcoming, mid: share.mid, hit: Math.max(1, perTagTarget - share.upcoming - share.mid) };
  const freshCut = Date.now() - 3 * DAY;
  const lists = [];
  for (const tag of comparableTags.values()) {
    if (outOfTime()) { warn("out of time while looking for comparables"); break; }
    try {
      const d = await discoverTag(tag, { years: 3, maxPages: 2, noSpy: false }, quotas, steam, spyT, now, outOfTime);
      for (const r of d.rows) rowsSeen.set(r.appid, r);
      lists.push({ tag: tag.name, d });
      perTagSeen[tag.name] = { upcoming: d.upcoming.length, mid: d.mid.length, hit: d.hit.length };
    } catch (e) { warn(`comparables for tag ${tag.name}: ${e.message}`); }
  }
  const push = (c, tag, bucket) => {
    if (!c || queued.has(c.appid)) return;
    const k = known.get(c.appid);
    if (k && Date.parse(k.fetchedAt || 0) > freshCut) return;
    queued.add(c.appid);
    queue.push({ appid: c.appid, name: c.name, row: c.row, mode: "candidate", memberships: [{ tag, bucket }] });
  };
  const maxLen = Math.max(0, ...lists.map((l) => Math.max(l.d.upcoming.length, l.d.mid.length, l.d.hit.length)));
  for (const bucket of ["upcoming", "mid", "hit"]) for (let r = 0; r < maxLen; r++) for (const l of lists) push(l.d[bucket][r], l.tag, bucket);
  log(`comparables: ${queue.length} candidates from ${lists.length} tags ${JSON.stringify(perTagSeen)}`);

  let idx = 0, got = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (idx < queue.length && !outOfTime()) {
      const item = queue[idx++];
      const res = await fetcher.fetchGame(item);
      if (res.game) { fresh.set(item.appid, res.game); got++; }
    }
  }));
  if (idx < queue.length) warn(`deadline reached: ${queue.length - idx} comparable candidates not read`);

  // ---- 4. write
  const games = [...fresh.values()].sort((x, y) => x.appid - y.appid);
  const tagIndex = {};
  for (const [tagKey, tag] of comparableTags) for (const g of games) if (g.tags.slice(0, 12).some((t) => norm(t.name) === tagKey)) (tagIndex[tag.name] ||= []).push(g.appid);
  const corpus = { generatedAt: new Date().toISOString(), source: "live", games, tagIndex, meta: { addedGames: targetIds, comparables: got } };
  const errs = validateCorpus(corpus, { minGames: 1 });
  if (errs.length) throw new Error(`corpus did not validate: ${errs.slice(0, 3).join("; ")}`);
  writeJsonAtomic(join(a.out, "corpus.json"), corpus);
  const entries = new Map();
  for (const r of rowsSeen.values()) { const e = catalogEntryFromRow(r, idToName, now); if (e) entries.set(e.a, e); }
  for (const g of games) entries.set(g.appid, catalogEntryFromGame(g));
  const cat = catalogFile(entries.values(), { generatedAt: corpus.generatedAt });
  if (validateCatalog(cat).length) warn("partial catalog invalid, not written"); else writeJsonAtomic(join(a.out, "catalog.json"), cat);
  writeJsonAtomic(join(a.out, "watchlist-added.json"), { appids: targetIds }, true);

  log("---- summary ----");
  log(`requested ${terms.length}, resolved ${resolved.length}, fetched ${targetIds.length}${failed.length ? ` (failed: ${failed.join(", ")})` : ""}`);
  for (const id of targetIds) { const g = fresh.get(id); log(`  ${id} ${g.name}: tags ${g.tags.slice(0, 5).map((t) => t.name).join(", ")}; specific ${specificTags(g, 3).join(", ")}`); }
  log(`comparables read: ${got} (candidates ${queue.length}); corpus file ${games.length} games, catalog file ${cat.games.length} entries`);
  log(`wrote ${join(a.out, "corpus.json")}, catalog.json, watchlist-added.json (${targetIds.join(", ")}) in ${Math.round((Date.now() - t0) / 1000)}s`);
  if (failed.length && !targetIds.length) throw new Error("no requested game could be fetched");
  return corpus;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(() => process.exit(0), (e) => { console.error("ADD-GAME FAILED:", e?.stack || e); process.exit(1); });
}
