#!/usr/bin/env node
// Page Doctor corpus fetcher: indie-relevant Steam games per tag, with store details, user tags and reviews.
// INCREMENTAL and GROWING: it loads the previous corpus (out/corpus.json when that is live data), adds new games, refreshes the
// stalest entries within the time budget and writes the union (cap ~5,000 games). `fetchedAt` on each game says when it was read.
//
//   node scripts/fetch-steam.mjs --out dist/data
//
// Priority (indie first, hits get the smallest share): watchlist, then upcoming "Coming soon" games, then small/mid indies, then hits.
//   1. Steam store search   /search/results/?tags=492,<tagid>&sort_by=Reviews_DESC&category1=998&infinite=1&json=1
//      (rows carry release date, review summary, tag ids and price: 1 request = 100 rows; also feeds the catalog)
//      + filter=popularcomingsoon (fallback comingsoon) for upcoming; SteamSpy `request=tag` for mid-size indies the search pages miss
//   2. Steam appdetails     /api/appdetails?appids=<id>&cc=us&l=en
//   3. SteamSpy appdetails  steamspy.com/api.php?request=appdetails&appid=<id>   (tag votes, owners range, ccu)
//   4. Steam appreviews     only for watchlist games / when no other source has review numbers
//   5. Community group XML  steamcommunity.com/games/<id>/memberslistxml/?xml=1 -> followers (switched off at the first 429)
// Also writes catalog.json (up to ~20,000 games, short keys, see CATALOG_KEYS in parsers.mjs): upcoming indies, long tail by tag,
// recent releases, most-reviewed indies, plus every corpus game.
//
// Options: --out DIR  --prev FILE  --per-tag N (60)  --max-games N (5000)  --years N (3)  --deadline-min N (19)  --max-pages N (3)
//          --catalog-size N (20000)  --no-catalog  --tags "Roguelike,Cozy"  --watchlist FILE  --min-output N (60)  --no-spy
//          --fresh-days N (3: entries refreshed more recently are left alone)  --gone-days N (60)  --concurrency N (4)
// Env: PD_DEADLINE_MIN (19; build.sh's hard timeout is this + 5), PD_MAX_GAMES (5000), PD_PER_TAG (60), PD_CATALOG_SIZE (20000),
//      PD_CONCURRENCY (4), PD_FRESH_DAYS, STEAM_STORE_BASE / STEAMSPY_BASE / STEAM_COMMUNITY_BASE (override hosts, used by tests),
//      MIN_APPID, MID_MIN_REVIEWS (30), MID_MAX_REVIEWS (5000), STEAM_DELAY_MS (1100), STEAMSPY_DELAY_MS, STEAM_COMMUNITY_DELAY_MS,
//      HTTP_RETRIES (3), RATE_LIMIT_WAIT_MS (45000)
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs, numEnv, Throttle, getJson, writeJsonAtomic, log, warn } from "./lib.mjs";
import { parsePopularTags, bucketQuotas } from "./parsers.mjs";
import { validateCorpus, validateCatalog } from "./validate.mjs";
import { makeGameFetcher, storeBase } from "./game-fetch.mjs";
import { discoverTag } from "./discover.mjs";
import { crawlCatalog, catalogFile, addGamesToCatalog, trimCatalog } from "./catalog.mjs";
import { catalogEntryFromRow } from "./parsers.mjs";

export { discoverTag };
const HERE = dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;

// name -> fallback Steam tag id (resolved live from /tagdata/populartags/english when possible). aliases: older spellings.
export const TAGS = [
  { name: "Roguelike", id: 1716, aliases: ["Rogue-like"] },
  { name: "Roguelite", id: 3959, aliases: ["Rogue-lite"] },
  { name: "Deckbuilding", id: 32322 },
  { name: "Metroidvania", id: 1628 },
  { name: "Cozy", id: 97376 },
  { name: "Farming Sim", id: 87918 },
  { name: "Survival", id: 1662 },
  { name: "Horror", id: 1667 },
  { name: "Psychological Horror", id: 1721 },
  { name: "Souls-like", id: 29482 },
  { name: "Puzzle", id: 1664 },
  { name: "Visual Novel", id: 3799 },
  { name: "City Builder", id: 4328 },
  { name: "Automation", id: 255534 },
  { name: "Platformer", id: 1625 },
  { name: "Pixel Graphics", id: 3964 },
  { name: "Co-op", id: 1685 },
  { name: "Bullet Hell", id: 4885 },
  { name: "Tower Defense", id: 1645 },
  { name: "Life Sim", id: 10235 },
  { name: "Strategy", id: 9 },
  { name: "Turn-Based Strategy", id: 1741 },
  { name: "Tactical RPG", id: 21725 },
  { name: "Simulation", id: 599 },
  { name: "Open World Survival Craft", id: 1100689 },
  { name: "Narrative", id: 7702 },
  { name: "Colony Sim", id: 220585 },
  { name: "Wholesome", id: 552282 },
  { name: "Walking Simulator", id: 5900 },
  { name: "Dating Sim", id: 9551 },
  { name: "Auto Battler", id: 1084988 },
  { name: "Fishing", id: 15564 },
  { name: "Base Building", id: 7332 },
  { name: "Management", id: 12472 },
  { name: "Resource Management", id: 8945 },
  { name: "Crafting", id: 1702 },
  { name: "Sandbox", id: 3810 },
  { name: "Action RPG", id: 4231 },
  { name: "JRPG", id: 4434 },
  { name: "Hack and Slash", id: 1646 },
  { name: "Shoot 'Em Up", id: 4255 },
  { name: "Looter Shooter", id: 353880 },
  { name: "Extraction Shooter", id: 1199779 },
  { name: "Point & Click", id: 1698 },
  { name: "Detective", id: 5613 },
  { name: "Mystery", id: 5716 },
  { name: "Rhythm", id: 1752 },
  { name: "Exploration", id: 3834 },
  { name: "Relaxing", id: 1654 },
  { name: "Cyberpunk", id: 4115 },
  { name: "Choices Matter", id: 6426 },
  { name: "Cooking", id: 3920 },
];


const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function readLive(path) {
  try {
    if (!path || !existsSync(path)) return null;
    const j = JSON.parse(readFileSync(path, "utf8"));
    return j && j.source === "live" ? j : null; // never build on sample data
  } catch (e) { warn(`could not read previous data ${path}: ${e.message}`); return null; }
}

/** Mix two lists, `na` items of a then `nb` of b, until both are used up. */
function interleave(a, b, na, nb) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    for (let k = 0; k < na && i < a.length; k++) out.push(a[i++]);
    for (let k = 0; k < nb && j < b.length; k++) out.push(b[j++]);
  }
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const opts = {
    out: a.out || "dist/data",
    prev: a.prev || null,
    perTag: Number(a["per-tag"] ?? numEnv("PD_PER_TAG", 60)),
    maxGames: Number(a["max-games"] ?? numEnv("PD_MAX_GAMES", 5000)),
    years: Number(a.years ?? 3),
    deadlineMin: Number(a["deadline-min"] ?? numEnv("PD_DEADLINE_MIN", numEnv("DEADLINE_MIN", 19))),
    concurrency: Math.max(1, Number(a.concurrency ?? numEnv("PD_CONCURRENCY", 4))),
    maxPages: Number(a["max-pages"] ?? 3),
    catalogSize: Number(a["catalog-size"] ?? numEnv("PD_CATALOG_SIZE", 20000)),
    noCatalog: !!a["no-catalog"],
    minOutput: Number(a["min-output"] ?? 60),
    freshDays: Number(a["fresh-days"] ?? numEnv("PD_FRESH_DAYS", 3)),
    goneDays: Number(a["gone-days"] ?? 60),
    watchlist: a.watchlist || resolve(HERE, "../watchlist.json"),
    noSpy: !!a["no-spy"],
    tags: a.tags ? String(a.tags).split(",").map((s) => s.trim()).filter(Boolean) : null,
  };
  const t0 = Date.now();
  const deadline = t0 + opts.deadlineMin * 60000;
  let stopRequested = false;
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { stopRequested = true; warn(`${sig} received, finishing with what we have`); });
  const outOfTime = () => stopRequested || Date.now() > deadline;
  const steam = new Throttle("steam", numEnv("STEAM_DELAY_MS", 1100));
  const spyT = new Throttle("steamspy", numEnv("STEAMSPY_DELAY_MS", 1100));
  const comT = new Throttle("steamcommunity", numEnv("STEAM_COMMUNITY_DELAY_MS", 1100));
  const quotas = bucketQuotas(opts.perTag);
  const now = new Date();
  const idToName = new Map();
  const fetcher = makeGameFetcher({ steam, spyT, comT, idToName, noSpy: opts.noSpy, years: opts.years, now });
  const st = fetcher.state;

  log(`Page Doctor fetch: out=${opts.out} perTag=${opts.perTag} maxGames=${opts.maxGames} years=${opts.years} deadline=${opts.deadlineMin}min concurrency=${opts.concurrency}`);
  log(`hosts: store=${storeBase()}`);

  // ---- previous data (the corpus grows from run to run)
  const prevCorpus = readLive(opts.prev || join(opts.out, "corpus.json"));
  const prev = new Map();
  for (const g of prevCorpus?.games || []) prev.set(g.appid, { ...g, fetchedAt: g.fetchedAt || prevCorpus.generatedAt });
  const prevCatalog = readLive(join(opts.out, "catalog.json"));
  log(`previous corpus: ${prev.size} games${prevCorpus ? "" : " (none, or sample data: starting fresh)"}; previous catalog: ${prevCatalog?.games?.length ?? 0} entries`);

  // ---- watchlist
  let watch = [];
  try {
    watch = (JSON.parse(readFileSync(opts.watchlist, "utf8")).appids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  } catch (e) {
    warn(`no readable watchlist at ${opts.watchlist} (${e.message}); continuing without`);
  }
  const watchSet = new Set(watch);
  log(`watchlist: ${watch.length} appids`);

  // ---- tag ids
  let tagDefs = TAGS.filter((t) => !opts.tags || opts.tags.some((n) => norm(n) === norm(t.name)));
  let live = {};
  try {
    live = parsePopularTags(await getJson(`${storeBase()}/tagdata/populartags/english`, steam));
    log(`populartags: ${Object.keys(live).length} tags known live`);
  } catch (e) {
    warn(`populartags unavailable (${e.message}); using built-in tag ids`);
  }
  const liveByNorm = Object.fromEntries(Object.entries(live).map(([n, id]) => [norm(n), id]));
  tagDefs = tagDefs.map((t) => {
    const liveId = [t.name, ...(t.aliases || [])].map((n) => liveByNorm[norm(n)]).find(Boolean);
    if (liveId && liveId !== t.id) log(`tag id for "${t.name}": using live ${liveId} instead of built-in ${t.id}`);
    return { ...t, id: liveId || t.id };
  });
  const tagNames = tagDefs.map((t) => t.name);
  // tagIndex covers ALL known tags (not only the ones discovered in this run), so earlier runs' games keep their memberships
  const tagNormToName = new Map(TAGS.flatMap((t) => [t.name, ...(t.aliases || [])].map((n) => [norm(n), t.name])));
  for (const t of TAGS) idToName.set(t.id, t.name);
  for (const [n, id] of Object.entries(live)) idToName.set(id, n);

  // ---- state for this run
  const fresh = new Map(); // appid -> game read in this run
  const dropped = new Set();
  const foundUnder = new Map(); // appid -> Set(tag name)
  const skips = { notRecent: 0, comingSoon: 0, noStore: 0, error: 0, invalid: 0, freshSkipped: 0 };
  let processed = 0, newAdded = 0, refreshed = 0;
  const unionSize = () => prev.size - [...dropped].filter((id) => prev.has(id)).length + newAdded;

  async function processItem(item) {
    processed++;
    const res = await fetcher.fetchGame(item);
    if (res.game) {
      const wasKnown = prev.has(item.appid);
      fresh.set(item.appid, res.game);
      if (wasKnown) refreshed++; else newAdded++;
      const tagsOf = foundUnder.get(item.appid) || new Set();
      for (const m of item.memberships || []) tagsOf.add(m.tag);
      foundUnder.set(item.appid, tagsOf);
    } else if (res.skip === "noStore" && item.mode === "refresh" && res.gone) {
      const age = Date.now() - Date.parse(prev.get(item.appid)?.fetchedAt || 0);
      if (age > opts.goneDays * DAY && !watchSet.has(item.appid)) { dropped.add(item.appid); log(`dropping ${item.appid} (${prev.get(item.appid)?.name}): gone from Steam and last read ${Math.round(age / DAY)} days ago`); }
      else skips.noStore++;
    } else if (res.skip && skips[res.skip] !== undefined) skips[res.skip]++;
    if (processed % 25 === 0) log(`progress: ${processed} processed, ${fresh.size} read (${newAdded} new), ${Math.round((Date.now() - t0) / 1000)}s elapsed`);
  }
  async function runPool(items, { ignoreDeadline = false } = {}) {
    let idx = 0, warned = false;
    await Promise.all(Array.from({ length: opts.concurrency }, async () => {
      while (idx < items.length) {
        if (ignoreDeadline ? stopRequested : outOfTime()) {
          if (!warned) { warned = true; warn(`stopping details: ${stopRequested ? "signal" : "deadline"} reached after ${processed} games processed (${items.length - idx} candidates left)`); }
          return;
        }
        const item = items[idx++];
        if (item.mode === "candidate" && unionSize() >= opts.maxGames) continue;
        await processItem(item);
      }
    }));
  }

  // ---- phase 0: the watchlist goes first and ignores the deadline, so it is never cut off
  if (watch.length) {
    await runPool(watch.map((id) => ({ appid: id, mode: "watch", memberships: [] })), { ignoreDeadline: true });
    log(`watchlist: ${watch.filter((id) => fresh.has(id)).length}/${watch.length} kept`);
  }

  // ---- phase 1: discovery per tag (upcoming / mid / hit candidates), at most 30% of the budget
  const perTag = new Map();
  const seenRows = new Map(); // appid -> search row (for the catalog)
  let discoveryFailures = 0;
  const discoveryUntil = t0 + (deadline - t0) * 0.3;
  for (const tag of tagDefs) {
    if (outOfTime()) { warn("out of time during discovery"); break; }
    if (Date.now() > discoveryUntil) { warn(`discovery budget used up; tags not discovered: ${tagDefs.slice(perTag.size).map((t) => t.name).join(", ")}`); break; }
    let lists;
    try {
      lists = await discoverTag(tag, opts, quotas, steam, spyT, now, outOfTime);
      for (const r of lists.rows) seenRows.set(r.appid, r);
    } catch (e) {
      discoveryFailures++;
      warn(`discovery failed for ${tag.name}: ${e.message}`);
      lists = { hit: [], mid: [], upcoming: [], rows: [] };
      if (discoveryFailures >= 3 && perTag.size === 0) throw new Error("Steam search is unreachable (3 tags failed, none succeeded)");
    }
    perTag.set(tag.name, lists);
    log(`discovered ${tag.name} (#${tag.id}): upcoming ${lists.upcoming.length}, mid ${lists.mid.length}, hit ${lists.hit.length} candidates`);
  }

  // ---- catalog: search rows seen so far + extra indie-first crawls (budget: until 45% of the run)
  let catalogEntries = null;
  if (!opts.noCatalog) {
    try {
      const entries = new Map();
      for (const r of seenRows.values()) { const e = catalogEntryFromRow(r, idToName, now); if (e) entries.set(e.a, e); }
      await crawlCatalog({ steam, tagDefs, idToName, entries, maxEntries: opts.catalogSize, until: t0 + (deadline - t0) * 0.45, outOfTime, now, pages: { recent: Math.ceil(opts.catalogSize / 100 * 0.3), reviews: Math.ceil(opts.catalogSize / 100 * 0.2) } });
      catalogEntries = entries;
      log(`catalog: ${entries.size} entries gathered this run`);
    } catch (e) { warn(`catalog failed: ${e.message}`); }
  }

  // ---- phase 2: queue. New candidates in indie-first order (upcoming, mid, with hits at a third of the rate), then stale refreshes
  const newItems = [];
  const byApp = new Map();
  const freshCut = Date.now() - opts.freshDays * DAY;
  const pushCand = (c, tag, bucket) => {
    if (!c || watchSet.has(c.appid)) { if (c) { const t = foundUnder.get(c.appid) || new Set(); t.add(tag); foundUnder.set(c.appid, t); } return; }
    const known = prev.get(c.appid);
    let it = byApp.get(c.appid);
    if (!it) {
      if (known && Date.parse(known.fetchedAt || 0) > freshCut) { skips.freshSkipped++; const t = foundUnder.get(c.appid) || new Set(); t.add(tag); foundUnder.set(c.appid, t); byApp.set(c.appid, { skip: true }); return; }
      it = { appid: c.appid, name: c.name, row: c.row, mode: known ? "refresh" : "candidate", memberships: [] };
      byApp.set(c.appid, it); newItems.push(it);
    }
    if (it.skip) { const t = foundUnder.get(c.appid) || new Set(); t.add(tag); foundUnder.set(c.appid, t); return; }
    it.memberships.push({ tag, bucket });
  };
  const maxLen = Math.max(0, ...[...perTag.values()].map((l) => Math.max(l.upcoming.length, l.mid.length, l.hit.length * 3)));
  for (let r = 0; r < maxLen; r++) {
    for (const [tag, lists] of perTag) {
      pushCand(lists.upcoming[r], tag, "upcoming");
      pushCand(lists.mid[r], tag, "mid");
      if (r % 3 === 0) pushCand(lists.hit[r / 3], tag, "hit");
    }
  }
  const queuedIds = new Set(newItems.map((i) => i.appid));
  const refreshItems = [...prev.values()]
    .filter((g) => !queuedIds.has(g.appid) && !watchSet.has(g.appid) && !fresh.has(g.appid) && Date.parse(g.fetchedAt || 0) <= freshCut)
    .sort((x, y) => (Date.parse(x.fetchedAt || 0) - (x.comingSoon ? 30 * DAY : 0)) - (Date.parse(y.fetchedAt || 0) - (y.comingSoon ? 30 * DAY : 0)))
    .map((g) => ({ appid: g.appid, mode: "refresh", memberships: [] }));
  const queue = interleave(newItems, refreshItems, 4, 1);
  log(`queue: ${newItems.length} candidates (new ${newItems.filter((i) => i.mode === "candidate").length}, stale ${newItems.filter((i) => i.mode === "refresh").length}) + ${refreshItems.length} stale refreshes; candidate targets per tag ${JSON.stringify(quotas)}; ${skips.freshSkipped} fresh skipped`);

  // ---- phase 3: details (deadline applies)
  await runPool(queue);

  // ---- union of previous and fresh data
  const final = new Map();
  for (const [id, g] of prev) if (!dropped.has(id)) final.set(id, g);
  for (const [id, g] of fresh) final.set(id, g);
  if (final.size > opts.maxGames) {
    const evict = [...final.values()].filter((g) => !watchSet.has(g.appid) && !fresh.has(g.appid)).sort((x, y) => Date.parse(x.fetchedAt || 0) - Date.parse(y.fetchedAt || 0));
    for (const g of evict) { if (final.size <= opts.maxGames) break; final.delete(g.appid); }
    log(`cap ${opts.maxGames} reached: evicted the oldest entries, ${final.size} left`);
  }
  const games = [...final.values()].sort((x, y) => x.appid - y.appid);

  // ---- tagIndex (from every game's own top tags plus the tags it was found under in this run)
  const tagIndex = {};
  for (const t of TAGS) tagIndex[t.name] = [];
  for (const g of games) {
    const mine = new Set(foundUnder.get(g.appid) || []);
    for (const t of g.tags.slice(0, 12)) { const canon = tagNormToName.get(norm(t.name)); if (canon) mine.add(canon); }
    for (const t of mine) if (tagIndex[t]) tagIndex[t].push(g.appid);
  }
  for (const t of Object.keys(tagIndex)) { tagIndex[t] = [...new Set(tagIndex[t])]; if (!tagIndex[t].length) delete tagIndex[t]; }

  const corpus = {
    generatedAt: new Date().toISOString(), source: "live", games, tagIndex,
    meta: { perTag: opts.perTag, candidatesPerBucket: quotas, years: opts.years, tags: tagNames, watchlist: watch.length, previous: prev.size, new: newAdded, refreshed, dropped: dropped.size, elapsedSec: Math.round((Date.now() - t0) / 1000) },
  };

  // ---- summary
  log("---- summary ----");
  log(`corpus: ${games.length} games (previous ${prev.size}; new ${newAdded}, refreshed ${refreshed}, dropped ${dropped.size}); ${processed} processed this run; skips ${JSON.stringify(skips)}`);
  log(`watchlist: ${watch.filter((id) => final.has(id)).length}/${watch.length} kept`);
  log(`appreviews calls: ${st.reviewApiCalls}; store-page tag fetches: ${st.storePageFetches}; steamspy ${st.spyDead ? "DISABLED" : "ok"}; followers ${st.comDead ? "DISABLED" : "ok"}`);
  for (const t of tagNames) log(`  tag ${t.padEnd(26)} ${String((tagIndex[t] || []).length).padStart(4)} in index (candidates: upcoming ${perTag.get(t)?.upcoming.length ?? 0}, mid ${perTag.get(t)?.mid.length ?? 0}, hit ${perTag.get(t)?.hit.length ?? 0})`);
  log(`mix: ${games.filter((g) => g.comingSoon).length} upcoming, ${games.filter((g) => !g.comingSoon && (g.reviews.total ?? 0) > 5000).length} hits (>5000 reviews), ${games.filter((g) => !g.comingSoon && (g.reviews.total ?? 0) <= 5000).length} mid/small; followers known for ${games.filter((g) => g.followers != null).length}`);
  log(steam.summary()); log(spyT.summary()); log(comT.summary());
  const missingWatch = watch.filter((id) => !final.has(id));
  if (missingWatch.length) warn(`watchlist appids not in corpus: ${missingWatch.join(", ")}`);

  const errs = validateCorpus(corpus, { minGames: opts.minOutput });
  if (errs.length) {
    for (const e of errs.slice(0, 15)) warn("validation: " + e);
    throw new Error(`corpus did not validate (${errs.length} problems); not writing`);
  }
  writeJsonAtomic(join(opts.out, "corpus.json"), corpus);
  log(`wrote ${join(opts.out, "corpus.json")}: ${games.length} games, ${Object.keys(tagIndex).length} tags, ${Math.round(JSON.stringify(corpus).length / 1024)} KB`);

  // ---- catalog: this run's rows over the previous catalog, plus every corpus game (richer data), capped
  if (catalogEntries && catalogEntries.size >= Math.min(300, opts.catalogSize / 2) || (catalogEntries && prevCatalog)) {
    const all = new Map((prevCatalog?.games || []).map((e) => [e.a, e]));
    for (const [id, e] of catalogEntries) all.set(id, e);
    addGamesToCatalog(all, games);
    const trimmed = trimCatalog(all, opts.catalogSize, new Set(catalogEntries.keys()), new Set(games.map((g) => g.appid)));
    const file = catalogFile(trimmed.values(), { generatedAt: corpus.generatedAt });
    const cerrs = validateCatalog(file);
    if (cerrs.length) warn("catalog invalid, not written: " + cerrs.slice(0, 3).join("; "));
    else { writeJsonAtomic(join(opts.out, "catalog.json"), file); log(`wrote ${join(opts.out, "catalog.json")}: ${file.games.length} entries, ${Math.round(JSON.stringify(file).length / 1024)} KB`); }
  } else warn("no usable catalog this run (the previous or committed catalog stays)");
  return corpus;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(
    () => process.exit(0),
    (e) => { console.error("FETCH FAILED:", e?.stack || e); process.exit(1); },
  );
}
