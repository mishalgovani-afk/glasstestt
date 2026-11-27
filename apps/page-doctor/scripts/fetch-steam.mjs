#!/usr/bin/env node
// Page Doctor corpus fetcher: indie-relevant Steam games per tag, with store details, user tags and reviews.
// Per tag the corpus mixes about 1/3 hits (most-reviewed recent indies), 1/3 mid indies (200-5,000 reviews) and
// 1/3 upcoming "Coming soon" games (comingSoon:true, reviews null), because small and unreleased games are the users.
//
//   node scripts/fetch-steam.mjs --out dist/data
//
// Sources (all keyless):
//   1. Steam store search   /search/results/?tags=492,<tagid>&sort_by=Reviews_DESC&category1=998&infinite=1&json=1
//      -> ranked candidates per tag with release date + review summary in each result row (1 request = 100 rows)
//      plus the same search with filter=popularcomingsoon (fallback: comingsoon) for upcoming games,
//      plus SteamSpy `request=tag` for mid-size indies when the search pages do not reach them
//   2. Steam appdetails     /api/appdetails?appids=<id>&cc=us&l=en     (descriptions, media, price, languages, demo ...)
//   3. SteamSpy appdetails  steamspy.com/api.php?request=appdetails&appid=<id>   (user tag votes, owners range, ccu)
//   4. Steam appreviews     /appreviews/<id>?json=1&num_per_page=0&purchase_type=all&language=all
//                           (only when a game has no review numbers from 1 or 3, and for every watchlist game)
//   5. Community group XML steamcommunity.com/games/<id>/memberslistxml/?xml=1 -> followers (null when unavailable)
//   Fallbacks: SteamSpy `request=tag` when search gives too little for a tag; store-page tag modal when SteamSpy is down.
//
// Options: --out DIR  --per-tag N (40)  --max-games N (1000)  --years N (3)  --deadline-min N (19)
//          --max-pages N (10)  --tags "Roguelike,Cozy"  --watchlist FILE  --min-output N (60)  --no-spy
// Env: STEAM_STORE_BASE, STEAMSPY_BASE, STEAM_COMMUNITY_BASE (override hosts, used by tests), MIN_APPID, MID_MIN_REVIEWS (200), MID_MAX_REVIEWS (5000), STEAM_DELAY_MS (1100), STEAMSPY_DELAY_MS (1100),
//      HTTP_RETRIES (3), RATE_LIMIT_WAIT_MS (45000), DEADLINE_MIN
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { parseArgs, numEnv, sleep, Throttle, getJson, getText, writeJsonAtomic, log, warn } from "./lib.mjs";
import {
  parseStoreDetails, unwrapAppDetails, parseSpy, parseSpyTagList, parseAppReviews, parseSearchRows,
  parseStorePageTags, parsePopularTags, buildGame, isRecent, parseMemberCount, pickEvenly, bucketQuotas,
} from "./parsers.mjs";
import { validateCorpus } from "./validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDIE_TAG_ID = 492;

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
];

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const storeBase = () => process.env.STEAM_STORE_BASE || "https://store.steampowered.com";
const spyBase = () => process.env.STEAMSPY_BASE || "https://steamspy.com";
const communityBase = () => process.env.STEAM_COMMUNITY_BASE || "https://steamcommunity.com";
const BUCKETS = ["hit", "mid", "upcoming"];

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const opts = {
    out: a.out || "dist/data",
    perTag: Number(a["per-tag"] ?? 40),
    maxGames: Number(a["max-games"] ?? 1000),
    years: Number(a.years ?? 3),
    deadlineMin: Number(a["deadline-min"] ?? numEnv("DEADLINE_MIN", 19)),
    maxPages: Number(a["max-pages"] ?? 10),
    minOutput: Number(a["min-output"] ?? 60),
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

  log(`Page Doctor fetch: out=${opts.out} perTag=${opts.perTag} maxGames=${opts.maxGames} years=${opts.years} deadline=${opts.deadlineMin}min`);
  log(`hosts: store=${storeBase()} steamspy=${spyBase()}`);

  // ---- watchlist
  let watch = [];
  try {
    watch = (JSON.parse(readFileSync(opts.watchlist, "utf8")).appids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  } catch (e) {
    warn(`no readable watchlist at ${opts.watchlist} (${e.message}); continuing without`);
  }
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
  const tagNormToName = new Map(tagDefs.flatMap((t) => [t.name, ...(t.aliases || [])].map((n) => [norm(n), t.name])));

  // ---- phase 1: discovery per tag (hit / mid / upcoming buckets)
  const perTag = new Map(); // tag -> { hit:[], mid:[], upcoming:[] } of {appid,name,row}
  let discoveryFailures = 0;
  for (const tag of tagDefs) {
    if (outOfTime()) { warn("out of time during discovery"); break; }
    let lists;
    try {
      lists = await discoverTag(tag, opts, quotas, steam, spyT, now, outOfTime);
    } catch (e) {
      discoveryFailures++;
      warn(`discovery failed for ${tag.name}: ${e.message}`);
      lists = { hit: [], mid: [], upcoming: [] };
      if (discoveryFailures >= 3 && perTag.size === 0) throw new Error("Steam search is unreachable (3 tags failed, none succeeded)");
    }
    perTag.set(tag.name, lists);
    log(`discovered ${tag.name} (#${tag.id}): hit ${lists.hit.length}, mid ${lists.mid.length}, upcoming ${lists.upcoming.length} candidates`);
  }

  // ---- phase 2: interleave candidates round-robin (tag x bucket) so every tag and bucket is covered if time runs short
  const foundUnder = new Map(); // appid -> Set(tag) for accepted games
  const queue = [];
  const byApp = new Map();
  const rowOf = new Map();
  for (const id of watch) { const it = { appid: id, watch: true, memberships: [] }; byApp.set(id, it); queue.push(it); }
  const maxRank = Math.max(quotas.hit, quotas.mid, quotas.upcoming) * 2 + 4;
  for (let rank = 0; rank < maxRank; rank++) {
    for (const bucket of BUCKETS) {
      for (const [tag, lists] of perTag) {
        const c = lists[bucket][rank];
        if (!c) continue;
        let it = byApp.get(c.appid);
        if (!it) { it = { appid: c.appid, name: c.name, row: c.row, memberships: [] }; byApp.set(c.appid, it); queue.push(it); }
        it.memberships.push({ tag, bucket });
        if (c.row) rowOf.set(c.appid, c.row);
      }
    }
  }
  const cap = opts.maxGames;
  log(`candidate queue: ${queue.length} unique games (watchlist ${watch.length}); quotas per tag ${JSON.stringify(quotas)}; processing up to ${cap}`);

  // ---- phase 3: details
  const games = [];
  const skips = { quotaFull: 0, notGame: 0, notRecent: 0, comingSoon: 0, noStore: 0, error: 0, invalid: 0 };
  const accepted = new Map(); // "tag|bucket" -> n
  const acc = (m) => accepted.get(`${m.tag}|${m.bucket}`) || 0;
  let spyDead = opts.noSpy, spyFails = 0, comDead = false, comFails = 0, storePageFetches = 0, reviewApiCalls = 0, processed = 0;
  const wlSet = new Set(watch);
  for (const item of queue) {
    if (outOfTime()) { warn(`stopping details: ${stopRequested ? "signal" : "deadline"} reached after ${processed}/${queue.length} candidates`); break; }
    if (!item.watch) {
      if (games.length >= cap) continue;
      if (item.memberships.length && item.memberships.every((m) => acc(m) >= quotas[m.bucket])) { skips.quotaFull++; continue; }
    }
    const wantsUpcoming = item.memberships.some((m) => m.bucket === "upcoming");
    processed++;
    try {
      const [store, spy, followers] = await Promise.all([
        fetchStore(item, steam),
        spyDead ? null : fetchSpy(item.appid, spyT).then((r) => { spyFails = 0; return r; }, (e) => {
          if (++spyFails >= 8 && !spyDead) { spyDead = true; warn(`SteamSpy failed ${spyFails} times in a row (${e.message}); disabling it for this run`); }
          return null;
        }),
        comDead ? null : fetchFollowers(item.appid, comT).then((r) => { comFails = 0; return r; }, (e) => {
          if (++comFails >= 8 && !comDead) { comDead = true; warn(`Steam community failed ${comFails} times in a row (${e.message}); followers disabled for this run`); }
          return null;
        }),
      ]);
      if (!store) { skips.noStore++; continue; }
      if (!item.watch) {
        if (store.comingSoon && !wantsUpcoming) { skips.comingSoon++; continue; }
        if (!store.comingSoon && !isRecent(store.releaseIso, opts.years, now)) { skips.notRecent++; continue; }
      }
      let reviews = null;
      const row = rowOf.get(item.appid) || item.row || null;
      const haveNumbers = (row && row.reviewTotal != null) || (spy && spy.totalReviews != null);
      if ((item.watch || !haveNumbers) && !store.comingSoon) {
        try {
          reviews = parseAppReviews(await getJson(`${storeBase()}/appreviews/${item.appid}?json=1&num_per_page=0&purchase_type=all&language=all`, steam));
          reviewApiCalls++;
        } catch (e) { warn(`appreviews ${item.appid}: ${e.message}`); }
      }
      let storeTags = [];
      if ((!spy || !spy.tags.length) && (spyDead || item.watch || store.comingSoon) && storePageFetches < 300) {
        try {
          storePageFetches++;
          const { text } = await getText(`${storeBase()}/app/${item.appid}/?l=english&cc=us`, steam, { headers: { Cookie: "birthtime=568022401; lastagecheckage=1-0-1988; wants_mature_content=1" } });
          storeTags = parseStorePageTags(text);
        } catch (e) { warn(`store page tags ${item.appid}: ${e.message}`); }
      }
      const fallbackTags = [...new Set(item.memberships.map((m) => m.tag))];
      const game = buildGame({ store, spy, row, reviews, storeTags, fallbackTags, followers });
      game.aboutText = game.aboutText.slice(0, 5000);
      game.screenshots = game.screenshots.filter((u) => u.startsWith("https://"));
      const bad = validateCorpus({ generatedAt: now.toISOString(), source: "live", games: [game], tagIndex: {} });
      if (bad.length) { skips.invalid++; warn(`dropping ${item.appid} (${game.name}): ${bad[0]}`); continue; }
      games.push(game);
      for (const m of item.memberships) if (acc(m) < quotas[m.bucket]) accepted.set(`${m.tag}|${m.bucket}`, acc(m) + 1);
      foundUnder.set(item.appid, new Set(item.memberships.map((m) => m.tag)));
    } catch (e) {
      skips.error++;
      warn(`game ${item.appid} failed: ${e.message}`);
    }
    if (processed % 25 === 0) {
      const el = (Date.now() - t0) / 1000;
      log(`progress: ${processed}/${queue.length} processed, ${games.length} kept, ${Math.round(el)}s elapsed`);
    }
  }

  // ---- tagIndex
  const tagIndex = {};
  for (const t of tagNames) tagIndex[t] = [];
  const kept = new Set(games.map((g) => g.appid));
  for (const g of games) {
    const mine = new Set(foundUnder.get(g.appid) || []);
    for (const t of g.tags.slice(0, 12)) {
      const canon = tagNormToName.get(norm(t.name));
      if (canon) mine.add(canon);
    }
    for (const t of mine) if (kept.has(g.appid) && tagIndex[t]) tagIndex[t].push(g.appid);
  }
  for (const t of Object.keys(tagIndex)) { tagIndex[t] = [...new Set(tagIndex[t])]; if (!tagIndex[t].length) delete tagIndex[t]; }

  const corpus = {
    generatedAt: new Date().toISOString(),
    source: "live",
    games,
    tagIndex,
    meta: { perTag: opts.perTag, quotas, years: opts.years, tags: tagNames, watchlist: watch.length, candidates: queue.length, elapsedSec: Math.round((Date.now() - t0) / 1000) },
  };

  // ---- summary
  log("---- summary ----");
  log(`games kept: ${games.length} (of ${processed} processed, ${queue.length} queued); skips ${JSON.stringify(skips)}`);
  log(`appreviews calls: ${reviewApiCalls}; store-page tag fetches: ${storePageFetches}; steamspy ${spyDead ? "DISABLED" : "ok"}`);
  for (const t of tagNames) log(`  tag ${t.padEnd(26)} ${String((tagIndex[t] || []).length).padStart(3)} in index | accepted hit ${accepted.get(t + "|hit") || 0}, mid ${accepted.get(t + "|mid") || 0}, upcoming ${accepted.get(t + "|upcoming") || 0}`);
  log(`mix: ${games.filter((g) => g.comingSoon).length} upcoming, ${games.filter((g) => !g.comingSoon && (g.reviews.total ?? 0) > 5000).length} hits (>5000 reviews), ${games.filter((g) => !g.comingSoon && (g.reviews.total ?? 0) <= 5000).length} mid/small; followers known for ${games.filter((g) => g.followers != null).length}`);
  const noTags = games.filter((g) => !g.tags.length || g.tags.every((t) => t.votes === 0)).length;
  log(`games without real tag votes: ${noTags}; with reviews: ${games.filter((g) => g.reviews.total != null).length}; with owners: ${games.filter((g) => g.ownersRange).length}`);
  log(steam.summary());
  log(spyT.summary());
  log(comT.summary());
  const missingWatch = watch.filter((id) => !kept.has(id));
  if (missingWatch.length) warn(`watchlist appids not in corpus: ${missingWatch.join(", ")}`);

  const errs = validateCorpus(corpus, { minGames: opts.minOutput });
  if (errs.length) {
    for (const e of errs.slice(0, 15)) warn("validation: " + e);
    throw new Error(`corpus did not validate (${errs.length} problems); not writing`);
  }
  const outFile = join(opts.out, "corpus.json");
  writeJsonAtomic(outFile, corpus);
  log(`wrote ${outFile}: ${games.length} games, ${Object.keys(tagIndex).length} tags, ${Math.round(JSON.stringify(corpus).length / 1024)} KB, ${Math.round((Date.now() - t0) / 1000)}s`);
  return corpus;
}

/** One page-through of Steam search for a tag. `filter` e.g. "popularcomingsoon"; sort only applies without a filter. */
async function searchPages(tag, { filter = "", sort = "Reviews_DESC", maxPages, enough, outOfTime }, steam) {
  const rows = [];
  const seen = new Set();
  let start = 0;
  for (let page = 0; page < maxPages && !outOfTime(); page++) {
    const url = `${storeBase()}/search/results/?query=&start=${start}&count=100&dynamic_data=&sort_by=${sort}${filter ? `&filter=${filter}` : ""}&tags=${INDIE_TAG_ID}%2C${tag.id}&category1=998&infinite=1&json=1&cc=us&l=english&ndl=1`;
    const json = await getJson(url, steam);
    const got = parseSearchRows(json?.results_html);
    if (!got.length) break;
    for (const r of got) if (!seen.has(r.appid)) { seen.add(r.appid); rows.push(r); }
    start += got.length;
    const total = Number(json?.total_count);
    if ((Number.isFinite(total) && start >= total) || enough(rows)) break;
  }
  return rows;
}

/** Discover hit / mid / upcoming candidates for one tag (about 30% extra candidates, because some get rejected later). */
export async function discoverTag(tag, opts, quotas, steam, spyT, now, outOfTime) {
  const midMin = numEnv("MID_MIN_REVIEWS", 200), midMax = numEnv("MID_MAX_REVIEWS", 5000);
  const over = (n) => Math.ceil(n * 1.3) + 1;
  const shape = (r) => ({ appid: r.appid, name: r.name, row: r });
  const recentRows = (rows) => rows.filter((r) => isRecent(r.releaseIso, opts.years, now) && (r.reviewTotal ?? 0) >= 10);
  const inMid = (r) => r.reviewTotal >= midMin && r.reviewTotal <= midMax;

  // hits + mid (search by review count, newest-window rows only)
  const rows = recentRows(await searchPages(tag, {
    maxPages: opts.maxPages, outOfTime,
    enough: (all) => { const rec = recentRows(all); return rec.length >= over(quotas.hit) && rec.filter(inMid).length >= over(quotas.mid) * 2; },
  }, steam));
  const hit = rows.slice(0, over(quotas.hit)).map(shape);
  const hitIds = new Set(hit.map((x) => x.appid));
  const searchMid = pickEvenly(rows.filter((r) => !hitIds.has(r.appid) && inMid(r)), over(quotas.mid)).map(shape);
  let mid = searchMid;
  if (mid.length < over(quotas.mid) && !opts.noSpy) {
    try {
      const minAppid = numEnv("MIN_APPID", 1_600_000);
      const have = new Set([...hitIds, ...mid.map((x) => x.appid)]);
      const pool = parseSpyTagList(await getJson(`${spyBase()}/api.php?request=tag&tag=${encodeURIComponent(tag.name)}`, spyT))
        .filter((e) => e.appid >= minAppid && !have.has(e.appid) && e.totalReviews != null && e.totalReviews >= midMin && e.totalReviews <= midMax);
      const extra = pickEvenly(pool, over(quotas.mid) * 2 - mid.length).map((e) => ({ appid: e.appid, name: e.name || "", row: null }));
      mid = mid.concat(extra);
      log(`  ${tag.name}: SteamSpy tag list added ${extra.length} mid-size candidates (pool ${pool.length})`);
    } catch (e) {
      warn(`SteamSpy tag list failed for ${tag.name}: ${e.message}`);
    }
  }

  // upcoming: popular "coming soon" titles for the tag (fallback: all coming soon)
  let upcoming = [];
  const want = over(quotas.upcoming);
  for (const filter of ["popularcomingsoon", "comingsoon"]) {
    if (upcoming.length >= want || quotas.upcoming === 0) break;
    try {
      const ups = await searchPages(tag, { filter, sort: "Released_DESC", maxPages: 2, outOfTime, enough: (all) => all.length >= want * 2 }, steam);
      const have = new Set([...hitIds, ...upcoming.map((x) => x.appid)]);
      for (const r of ups) {
        if (have.has(r.appid)) continue;
        if (r.releaseIso && new Date(r.releaseIso + "T00:00:00Z") < new Date(now.getTime() - 30 * 86400000)) continue; // already released a while ago
        upcoming.push(shape(r));
        have.add(r.appid);
        if (upcoming.length >= want) break;
      }
    } catch (e) {
      warn(`upcoming search (${filter}) failed for ${tag.name}: ${e.message}`);
    }
  }
  return { hit, mid, upcoming };
}

async function fetchStore(item, steam) {
  const json = await getJson(`${storeBase()}/api/appdetails?appids=${item.appid}&cc=us&l=en`, steam);
  return parseStoreDetails(unwrapAppDetails(json, item.appid), { allowAnyType: !!item.watch }) ?? null;
}

async function fetchSpy(appid, spyT) {
  const json = await getJson(`${spyBase()}/api.php?request=appdetails&appid=${appid}`, spyT);
  return parseSpy(json);
}

async function fetchFollowers(appid, comT) {
  const { status, text } = await getText(`${communityBase()}/games/${appid}/memberslistxml/?xml=1`, comT, { retries: 1 });
  if (status >= 400) throw new Error(`HTTP ${status}`);
  return parseMemberCount(text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(
    () => process.exit(0),
    (e) => { console.error("FETCH FAILED:", e?.stack || e); process.exit(1); },
  );
}
