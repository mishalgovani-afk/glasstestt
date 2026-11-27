#!/usr/bin/env node
// Fast-track: make specific games available in Creator Match right now and find the curators who fit them.
//
//   node scripts/add-game.mjs --games "<appid or name>,..." --out <dir> [--corpus <page-doctor corpus.json>] [--base DATA_DIR]
//
//   1. Resolve each entry (appid, or a name through the Page Doctor corpus/catalog, then Steam storesearch).
//   2. Take its name and tags from the corpus, else straight from Steam (appdetails + SteamSpy + store page tags).
//   3. Find curators: (a) a best-effort Steam query for curators of that app (curators/ajaxgetcurators/?appid=), (b) known creators from
//      --base whose tagAffinity fits the game's top 3 specific tags (re-read, stalest first), (c) a directory crawl of Steam curators filtered
//      by tag overlap between their recent reviews and the game's tags (and by having reviewed the game itself).
//   4. Crawl the best ~40 (reviews + published links) and write <dir>/creators.json: a PARTIAL file (new/refreshed creators + games[]
//      including the requested games) to be merged with merge-data.mjs.
// --base DATA_DIR is a checkout of the data branch (DATA_DIR/creator-match/creators.json, DATA_DIR/page-doctor/{corpus,catalog}.json); it is only READ.
// Budget: ADD_DEADLINE_MIN (default 10). Options: --max-curators N (40) --directory-pages N (20) --deadline-min N
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs, numEnv, Throttle, getJson, writeJsonAtomic, log, warn } from "./lib.mjs";
import { parseCuratorDirectory, parseCuratorPage, buildTagAffinity } from "./parsers.mjs";
import { validateCreators, repairCreators } from "./validate.mjs";
import { fetchDirectory, fetchRecommendations, fetchWatchGame, curatorToCreator } from "./fetch-creators.mjs";
import { getText, sleep } from "./lib.mjs";

const storeBase = () => process.env.STEAM_STORE_BASE || "https://store.steampowered.com";
const spyBase = () => process.env.STEAMSPY_BASE || "https://steamspy.com";
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const DAY = 86400000;
const GENERIC = new Set(["indie", "singleplayer", "single-player", "action", "adventure", "casual", "2d", "3d", "great soundtrack", "atmospheric", "multiplayer", "simulation", "strategy", "rpg", "early access", "free to play", "colorful", "cute", "funny", "story rich", "controller", "first-person", "third person", "difficult", "replay value", "exploration"]);
const readLive = (p) => { try { if (!p || !existsSync(p)) return null; const j = JSON.parse(readFileSync(p, "utf8")); return j && j.source === "live" ? j : null; } catch { return null; } };
export function specificTags(tags, n = 3) {
  const specific = tags.filter((t) => !GENERIC.has(String(t).toLowerCase()));
  return (specific.length >= n ? specific : [...specific, ...tags.filter((t) => !specific.includes(t))]).slice(0, n);
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (!a.games || !a.out) throw new Error('usage: add-game.mjs --games "<appid or name>,..." --out <dir> [--corpus FILE] [--base DATA_DIR]');
  const terms = String(a.games).split(",").map((s) => s.trim()).filter(Boolean);
  const maxCurators = Number(a["max-curators"] ?? 40);
  const dirPages = Number(a["directory-pages"] ?? 20);
  const deadlineMin = Number(a["deadline-min"] ?? numEnv("ADD_DEADLINE_MIN", 10));
  const t0 = Date.now();
  const budget = deadlineMin * 60000;
  const before = (frac) => Date.now() > t0 + budget * frac;
  const now = new Date();
  const store = new Throttle("steam", numEnv("STEAM_DELAY_MS", 1100));
  const spyT = new Throttle("steamspy", numEnv("STEAMSPY_DELAY_MS", 1100));
  log(`add-game (creator-match): ${terms.length} requested (${terms.join(" | ")}), deadline=${deadlineMin}min`);

  // ---- data we can read
  const corpus = readLive(a.corpus) || (a.base ? readLive(join(a.base, "page-doctor/corpus.json")) : null) || readLive(process.env.CORPUS_PATH);
  const catalog = a.base ? readLive(join(a.base, "page-doctor/catalog.json")) : null;
  const baseCreators = a.base ? readLive(join(a.base, "creator-match/creators.json")) : null;
  const known = new Map(); // appid -> {appid,name,tags[], ...}
  for (const g of corpus?.games || []) known.set(g.appid, { appid: g.appid, name: g.name, tags: (g.tags || []).slice(0, 12).map((t) => t.name), reviewsTotal: g.reviews?.total ?? null, comingSoon: !!g.comingSoon, releaseDate: g.releaseDate || undefined });
  for (const g of baseCreators?.games || []) if (!known.has(g.appid) || !(known.get(g.appid).tags || []).length) known.set(g.appid, { appid: g.appid, name: g.name, tags: g.tags || [], ...(g.reviews ? { reviewsTotal: g.reviews.total } : {}), ...(g.comingSoon !== undefined ? { comingSoon: g.comingSoon } : {}), ...(g.releaseDate ? { releaseDate: g.releaseDate } : {}) });
  const byName = new Map([...known.values()].map((g) => [norm(g.name), g.appid]));
  for (const e of catalog?.games || []) if (!byName.has(norm(e.n))) byName.set(norm(e.n), e.a);
  log(`known: ${known.size} games with tags${corpus ? " (corpus)" : ""}, ${catalog?.games?.length ?? 0} catalog entries, ${baseCreators?.creators?.length ?? 0} existing creators`);

  // ---- 1+2. resolve and describe the requested games
  const targets = [];
  for (const term of terms) {
    let appid = null;
    if (/^\d+$/.test(term)) appid = Number(term);
    else if (byName.has(norm(term))) appid = byName.get(norm(term));
    else {
      try {
        const items = (await getJson(`${storeBase()}/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`, store))?.items || [];
        const apps = items.filter((i) => (i.type === undefined || i.type === "app") && i.id && i.name);
        const best = apps.find((i) => norm(i.name) === norm(term)) || apps.find((i) => norm(i.name).startsWith(norm(term))) || apps[0];
        if (best) appid = Number(best.id);
      } catch (e) { warn(`storesearch "${term}": ${e.message}`); }
    }
    if (!appid) { warn(`could not resolve "${term}"`); continue; }
    let g = known.get(appid);
    if (!g || !g.tags.length) {
      try { g = (await fetchWatchGame(appid, store, spyT, g)) || g; } catch (e) { warn(`details for ${appid}: ${e.message}`); }
    }
    if (!g) { warn(`no data for ${appid}`); continue; }
    known.set(appid, g);
    if (!targets.some((t) => t.appid === appid)) { targets.push(g); log(`target ${appid} "${g.name}": tags ${g.tags.slice(0, 6).join(", ") || "(none found)"}`); }
  }
  if (!targets.length) throw new Error("none of the requested games could be resolved");
  const targetIds = new Set(targets.map((t) => t.appid));
  const wantTags = new Set(targets.flatMap((t) => specificTags(t.tags, 3)).map((t) => t.toLowerCase()));
  log(`matching on tags: ${[...wantTags].join(", ") || "(none)"}`);

  // ---- 3a. best-effort: curators Steam lists for the app itself
  const candidates = new Map(); // curator id -> {c, score, why}
  const consider = (c, score, why) => { const cur = candidates.get(c.id); if (!cur || score > cur.score) candidates.set(c.id, { c, score, why }); };
  let appCurators = 0;
  for (const t of targets) {
    try {
      const json = await getJson(`${storeBase()}/curators/ajaxgetcurators/render/?query=&start=0&count=50&dynamic_data=&filter=all&appid=${t.appid}&l=english`, store);
      const r = parseCuratorDirectory(json);
      for (const c of r.curators) { consider(c, 20, `listed for app ${t.appid}`); appCurators++; }
    } catch (e) { warn(`curators for app ${t.appid} (endpoint is best effort): ${e.message}`); }
  }
  log(`per-app curator query returned ${appCurators} curators (unverified; they are crawled and checked below)`);

  // ---- 3b. known creators that fit the tags (re-read so a fresh review of the game shows up)
  let knownFit = 0;
  for (const c of baseCreators?.creators || []) {
    if (c.platform !== "steam-curator") continue;
    const fit = [...wantTags].reduce((s, t) => s + Math.max(0, ...Object.entries(c.tagAffinity || {}).filter(([k]) => k.toLowerCase() === t).map(([, w]) => w)), 0);
    if (fit > 0.5) { consider({ id: c.id.slice(8), name: c.name, followers: c.followers, lastActive: c.lastActive, recent: [], description: "", avatar: c.avatar, communityUrl: null }, 5 + fit, `known creator, tag fit ${fit.toFixed(2)}`); knownFit++; }
  }
  log(`known curators with a tag fit: ${knownFit}`);

  // ---- 3c. directory crawl, scored by tag overlap of recent reviews
  const directory = new Map();
  for (let p = 0; p < dirPages && !before(0.3); p++) {
    try { for (const c of (await fetchDirectory(p * 50, store)).curators) directory.set(c.id, c); } catch (e) { warn(`directory page ${p}: ${e.message}`); if (p === 0) break; }
  }
  const unknownApps = new Map();
  for (const c of directory.values()) for (const r of c.recent) if (!known.has(r.appid)) unknownApps.set(r.appid, (unknownApps.get(r.appid) || 0) + 1);
  let looked = 0;
  for (const [id] of [...unknownApps.entries()].sort((x, y) => y[1] - x[1]).slice(0, 150)) { // tags for the most common unknown reviewed games
    if (before(0.5)) break;
    try {
      const sp = await getJson(`${spyBase()}/api.php?request=appdetails&appid=${id}`, spyT);
      const tags = sp?.tags && !Array.isArray(sp.tags) ? Object.entries(sp.tags).sort((x, y) => y[1] - x[1]).map(([n]) => n).slice(0, 12) : [];
      known.set(id, { appid: id, name: sp?.name || `App ${id}`, tags });
      looked++;
    } catch { break; }
  }
  for (const c of directory.values()) {
    let score = 0;
    for (const r of c.recent) {
      if (targetIds.has(r.appid)) { score += 25; continue; }
      const tg = (known.get(r.appid)?.tags || []).slice(0, 8).map((x) => x.toLowerCase());
      if (tg.some((x) => wantTags.has(x))) score += 2;
    }
    if (score > 0) consider(c, score, "directory: reviews overlap the game's tags");
  }
  log(`directory: ${directory.size} curators scanned, tags looked up for ${looked} reviewed games; ${candidates.size} candidates`);

  // ---- 4. crawl the best candidates. SteamSpy tag lookups for the games they covered run in the background meanwhile
  // (different host, own rate limit), most-covered first, so tagAffinity is meaningful by the time we write.
  const cover = new Map();
  const tried = new Set();
  let crawlDone = false, tagged = 0, tfails = 0;
  const tagWorker = async () => {
    while (!before(0.97) && tfails < 8) {
      let best = null, bc = 0;
      for (const [id, n] of cover) if (n > bc && !tried.has(id) && !(known.get(id)?.tags?.length)) { best = id; bc = n; }
      if (best == null) { if (crawlDone) break; await sleep(300); continue; }
      tried.add(best);
      try {
        const sp = await getJson(`${spyBase()}/api.php?request=appdetails&appid=${best}`, spyT);
        const g = known.get(best) || { appid: best, name: sp?.name || `App ${best}` };
        g.tags = sp?.tags && !Array.isArray(sp.tags) ? Object.entries(sp.tags).sort((x, y) => y[1] - x[1]).map(([n]) => n).slice(0, 12) : [];
        if (sp?.name && /^App \d+$/.test(g.name)) g.name = sp.name;
        known.set(best, g);
        tagged++; tfails = 0;
      } catch { tfails++; }
    }
  };
  const tagJob = tagWorker().catch((e) => warn("tag worker: " + e.message));
  const ranked = [...candidates.values()].sort((x, y) => y.score - x.score || (x.c.id < y.c.id ? -1 : 1)).slice(0, maxCurators);
  const creators = new Map();
  const direct = [];
  let crawled = 0;
  for (const { c, why } of ranked) {
    if (before(0.9)) { warn(`stopping the crawl after ${crawled}/${ranked.length}: time window used`); break; }
    try {
      const recs = await fetchRecommendations(c.id, store, now);
      let page = null;
      try { page = parseCuratorPage((await getText(`${storeBase()}/curator/${c.id}/?l=english`, store)).text); } catch (e) { warn(`curator page ${c.id}: ${e.message}`); }
      const cr = curatorToCreator(c, recs, page, now);
      crawled++;
      if (!cr) continue;
      cr.fetchedAt = new Date().toISOString();
      creators.set(cr.id, cr);
      for (const g of cr.coveredGames) if (g.appid != null) cover.set(g.appid, (cover.get(g.appid) || 0) + 1);
      if (cr.coveredGames.some((g) => targetIds.has(g.appid))) direct.push(`${cr.name} (${cr.id})`);
      for (const r of recs) if (r.appid && !known.has(r.appid)) known.set(r.appid, { appid: r.appid, name: r.name || `App ${r.appid}`, tags: [] });
      log(`  crawled ${cr.id} "${cr.name}" [${why}]: ${cr.coveredGames.length} covered games`);
    } catch (e) { warn(`curator ${c.id}: ${e.message}`); }
  }
  crawlDone = true;
  await tagJob;

  // ---- 5. write the partial file
  const gamesByAppid = new Map([...known.entries()].map(([id, g]) => [id, { tags: g.tags || [] }]));
  const out = [...creators.values()].map((cr) => ({ ...cr, tagAffinity: buildTagAffinity(cr.coveredGames, gamesByAppid) })).filter((c) => c.coveredGames.length);
  const ids = new Set([...targetIds]);
  for (const cr of out) for (const g of cr.coveredGames) if (g.appid != null) ids.add(g.appid);
  const games = [...ids].filter((id) => known.has(id)).map((id) => {
    const g = known.get(id);
    const o = { appid: id, name: g.name || `App ${id}`, tags: g.tags || [] };
    if (g.reviewsTotal !== undefined) o.reviews = { total: g.reviewsTotal };
    if (g.comingSoon !== undefined) o.comingSoon = g.comingSoon;
    if (g.releaseDate) o.releaseDate = g.releaseDate;
    return o;
  }).sort((x, y) => x.appid - y.appid);
  // every covered game must be in games[]: missing ones get a stub; broken records are dropped with a WARN instead of failing the run
  const repaired = repairCreators({ generatedAt: new Date().toISOString(), source: "live", creators: out, games }, warn);
  const result = { ...repaired.file, meta: { addedGames: [...targetIds], directCurators: direct } };
  const errs = validateCreators(result, { minCreators: 0 });
  if (errs.length) throw new Error(`creators did not validate: ${errs.slice(0, 3).join("; ")}`);
  writeJsonAtomic(join(a.out, "creators.json"), result);

  log("---- summary ----");
  log(`requested ${terms.length}, resolved ${targets.length}: ${targets.map((t) => `${t.appid} ${t.name}`).join("; ")}`);
  log(`curators: ${directory.size} scanned, ${candidates.size} candidates, ${crawled} crawled, ${out.length} written (${out.filter((c) => baseCreators?.creators?.some((b) => b.id === c.id)).length} refreshed, rest new)`);
  log(`curators that reviewed a requested game: ${direct.length ? direct.join(", ") : "none found"}`);
  log(`games[] in file: ${result.games.length} (${repaired.stubs} stubs; tags looked up for ${tagged} covered games); wrote ${join(a.out, "creators.json")} in ${Math.round((Date.now() - t0) / 1000)}s`);
  log(store.summary()); log(spyT.summary());
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(() => process.exit(0), (e) => { console.error("ADD-GAME FAILED:", e?.stack || e); process.exit(1); });
}
