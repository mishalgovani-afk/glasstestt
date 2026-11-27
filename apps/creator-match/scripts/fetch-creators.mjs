#!/usr/bin/env node
// Creator Match fetcher: Steam curators (keyless) + YouTube channels (RSS keyless, Data API optional) -> creators.json
//
//   node scripts/fetch-creators.mjs --out dist/data [--corpus ../page-doctor/dist/data/corpus.json]
//
// Sources
//   1. Steam curator directory   store.steampowered.com/curators/ajaxgetcurators/render/?start=&count=   (ranked by followers;
//      each curator carries g_rgTopCurators JSON with follower count, last review date and a few recent reviews)
//   2. Per curator               /curator/<id>/ajaxgetfilteredrecommendations/?...&sort=recent   (reviews: appid, date, blurb)
//                                /curator/<id>/                                                (links the curator publishes)
//   3. YouTube channels          found through the curators' own published links (@handle, /channel/UC..., /c/, /user/),
//                                recent uploads via the public RSS feed youtube.com/feeds/videos.xml?channel_id=UC...
//                                With YOUTUBE_API_KEY: search.list for recent videos of corpus games (plus subscriber counts).
//   4. SteamSpy appdetails       tags for covered games that are not in the Page Doctor corpus.
//   Twitch is skipped (needs an app key). Emails are never read or stored: only https links a creator publishes.
//
// Games: the Page Doctor corpus when it can be found (--corpus, $CORPUS_PATH, ../page-doctor/dist/data/corpus.json, then the
// committed snapshot if it is live data), else a small list from SteamSpy/Steam search. No imports from other apps.
//
// Options: --out DIR  --corpus FILE  --max-curators N (250 crawled in depth)  --directory-pages N (10)  --deadline-min N (20)
//          --yt-games N (40, with API key)  --max-yt-channels N (150)  --max-spy N (2000: games whose tags are looked up on SteamSpy, most-covered first)  --min-output N (20)  --no-youtube
// Env: CM_DEADLINE_MIN (20: total run budget in minutes; build.sh hard timeout is this + 5), CM_MAX_SPY (2000), CM_MAX_CURATORS (250), YOUTUBE_API_KEY (optional), STEAM_STORE_BASE, STEAMSPY_BASE, YOUTUBE_BASE, YOUTUBE_API_BASE, STEAM_DELAY_MS (1100),
//      STEAMSPY_DELAY_MS (1100), YOUTUBE_DELAY_MS (1100), HTTP_RETRIES (3), RATE_LIMIT_WAIT_MS (45000), DEADLINE_MIN
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs, numEnv, sleep, Throttle, getJson, getText, writeJsonAtomic, log, warn } from "./lib.mjs";
import {
  parseCuratorDirectory, parseRecommendations, parseCuratorPage, linksFromText, parseYouTubeUrl, parseChannelIdFromHtml,
  parseYouTubeFeed, uploadsPerMonth, averageViews, parseYtSearch, parseYtChannels, parseYtVideos, buildGameIndex,
  matchGamesInTitle, buildTagAffinity, selectCurators, normTitle, parseStorePageTags, parseCuratorDate,
} from "./parsers.mjs";
import { validateCreators } from "./validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const storeBase = () => process.env.STEAM_STORE_BASE || "https://store.steampowered.com";
const spyBase = () => process.env.STEAMSPY_BASE || "https://steamspy.com";
const ytBase = () => process.env.YOUTUBE_BASE || "https://www.youtube.com";
const ytApiBase = () => process.env.YOUTUBE_API_BASE || "https://www.googleapis.com";
const YT_HEADERS = { Cookie: "CONSENT=PENDING+987; SOCS=CAI", "Accept-Language": "en-US,en;q=0.8" };
const DAY = 86400000;

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  const opts = {
    out: a.out || "dist/data",
    corpus: a.corpus || process.env.CORPUS_PATH || null,
    maxCurators: Number(a["max-curators"] ?? numEnv("CM_MAX_CURATORS", 250)),
    directoryPages: Number(a["directory-pages"] ?? 10),
    deadlineMin: Number(a["deadline-min"] ?? numEnv("CM_DEADLINE_MIN", numEnv("DEADLINE_MIN", 20))),
    ytGames: Number(a["yt-games"] ?? 40),
    maxYtChannels: Number(a["max-yt-channels"] ?? 150),
    maxSpy: Number(a["max-spy"] ?? numEnv("CM_MAX_SPY", 2000)),
    minOutput: Number(a["min-output"] ?? 20),
    noYoutube: !!a["no-youtube"],
    watchlist: a.watchlist || resolve(HERE, "../../page-doctor/watchlist.json"),
  };
  const t0 = Date.now();
  const budget = opts.deadlineMin * 60000;
  const deadline = t0 + budget;
  let stop = false;
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { stop = true; warn(`${sig} received, finishing with what we have`); });
  const before = (frac) => stop || Date.now() > t0 + budget * frac; // true when the phase window `frac` of the budget is used up
  const now = new Date();
  const store = new Throttle("steam", numEnv("STEAM_DELAY_MS", 1100));
  const spyT = new Throttle("steamspy", numEnv("STEAMSPY_DELAY_MS", 1100));
  const ytT = new Throttle("youtube", numEnv("YOUTUBE_DELAY_MS", 1100));
  const apiT = new Throttle("youtube-api", 150);
  const apiKey = process.env.YOUTUBE_API_KEY || "";
  log(`Creator Match fetch: out=${opts.out} deadline=${opts.deadlineMin}min youtubeApiKey=${apiKey ? "yes" : "no"}`);

  // ---- 1. games we care about
  const { games: baseGames, origin } = await loadGames(opts, store, spyT);
  log(`games: ${baseGames.size} from ${origin}`);
  const gameInfo = new Map(baseGames); // appid -> {appid,name,tags[],reviewsTotal,comingSoon,releaseDate}

  // Watchlist games (Page Doctor's watchlist.json) must always be searchable, even if no creator covered them and even
  // without a corpus: take them from the corpus when present, else fetch name + tags directly.
  const watchIds = [];
  try {
    for (const id of JSON.parse(readFileSync(opts.watchlist, "utf8")).appids || []) if (Number.isFinite(Number(id)) && Number(id) > 0) watchIds.push(Number(id));
  } catch (e) { warn(`no readable watchlist at ${opts.watchlist} (${e.message})`); }
  let watchFetched = 0;
  for (const id of watchIds) {
    if (gameInfo.get(id)?.tags?.length) continue;
    try {
      const g = await fetchWatchGame(id, store, spyT, gameInfo.get(id));
      if (g) { gameInfo.set(id, g); watchFetched++; }
    } catch (e) { warn(`watchlist game ${id}: ${e.message}`); }
  }
  log(`watchlist: ${watchIds.length} appids, ${watchIds.filter((id) => gameInfo.has(id)).length} known (${watchFetched} fetched directly)`);

  // ---- 2. curators directory
  const directory = new Map();
  let total = null;
  try {
    const first = await fetchDirectory(0, store);
    total = first.total;
    for (const c of first.curators) directory.set(c.id, c);
    const offsets = [];
    for (let p = 1; p < opts.directoryPages; p++) offsets.push(p * 50);
    if (total && total > 1500) for (const f of [0.06, 0.12, 0.2, 0.3, 0.45, 0.6, 0.8]) offsets.push(Math.floor((total * f) / 50) * 50);
    for (const off of offsets) {
      if (before(0.1)) { warn("directory crawl stopped: time window used"); break; }
      try { for (const c of (await fetchDirectory(off, store)).curators) directory.set(c.id, c); }
      catch (e) { warn(`directory page at ${off}: ${e.message}`); }
    }
  } catch (e) {
    warn(`Steam curator directory unavailable: ${e.message}`);
  }
  log(`curator directory: ${directory.size} curators (total_count ${total ?? "?"})`);

  // ---- 3. deep crawl of selected curators
  const corpusIds = new Set(baseGames.keys());
  const selected = selectCurators([...directory.values()], corpusIds, opts.maxCurators, now);
  log(`crawling ${selected.length} curators in depth (${selected.filter((c) => c.recent.some((r) => corpusIds.has(r.appid))).length} already overlap the game list)`);
  const creators = new Map();
  const ytLinks = new Map(); // key -> {url, curatorName}
  // SteamSpy tag lookups run in the background WHILE the curators are crawled (different host, own rate limit).
  // Games covered by the most creators are looked up first; the worker keeps going until the time window closes.
  const coverCount = new Map();
  const bump = (appid) => coverCount.set(appid, (coverCount.get(appid) || 0) + 1);
  for (const c of selected) for (const r of c.recent) if (r.appid && r.verdict !== "not_recommended") bump(r.appid); // early priorities from the directory
  const spyTried = new Set();
  let workDone = false, spyOk = 0, spyFailsRow = 0;
  const spyWorker = async () => {
    while (!before(0.9) && spyFailsRow < 8 && spyTried.size < opts.maxSpy) {
      let best = null, bestCount = 0;
      for (const [id, n] of coverCount) if (n > bestCount && !spyTried.has(id) && !(gameInfo.get(id)?.tags?.length)) { best = id; bestCount = n; }
      if (best == null) { if (workDone) break; await sleep(300); continue; }
      spyTried.add(best);
      try {
        const sp = await getJson(`${spyBase()}/api.php?request=appdetails&appid=${best}`, spyT);
        const tags = sp?.tags && !Array.isArray(sp.tags) ? Object.entries(sp.tags).sort((x, y) => y[1] - x[1]).map(([n]) => n).slice(0, 12) : [];
        const g = gameInfo.get(best) || { appid: best, name: sp?.name || `App ${best}` };
        g.tags = tags;
        if (sp?.name && /^App \d+$/.test(g.name)) g.name = sp.name;
        if (Number.isFinite(Number(sp?.positive)) && Number.isFinite(Number(sp?.negative))) g.reviewsTotal = Number(sp.positive) + Number(sp.negative);
        gameInfo.set(best, g);
        spyFailsRow = 0; spyOk++;
      } catch (e) { spyFailsRow++; if (spyFailsRow <= 3) warn(`steamspy ${best}: ${e.message}`); if (spyFailsRow >= 8) warn("SteamSpy keeps failing; no more tag lookups"); }
      if (spyTried.size % 200 === 0) log(`steamspy: ${spyTried.size} looked up, ${spyOk} with data, ${Math.round((Date.now() - t0) / 1000)}s`);
    }
    log(`steamspy: finished, ${spyOk} lookups succeeded of ${spyTried.size} tried (limit ${opts.maxSpy})`);
  };
  const spyJob = spyWorker().catch((e) => warn("steamspy worker: " + e.message));
  let crawled = 0, crawlFail = 0;
  for (const c of selected) {
    if (before(0.55)) { warn(`curator crawl stopped after ${crawled}/${selected.length}: time window used`); break; }
    try {
      const recs = await fetchRecommendations(c.id, store, now);
      let page = null;
      try { page = parseCuratorPage((await getText(`${storeBase()}/curator/${c.id}/?l=english`, store)).text); } catch (e) { warn(`curator page ${c.id}: ${e.message}`); }
      const cr = curatorToCreator(c, recs, page, now);
      crawled++;
      if (!cr) continue;
      creators.set(cr.id, cr);
      for (const g of cr.coveredGames) if (g.appid != null) bump(g.appid);
      for (const l of cr.links) if (parseYouTubeUrl(l.url)) ytLinks.set(l.url, { url: l.url, from: cr.name });
      for (const r of recs) if (r.appid && !gameInfo.has(r.appid)) gameInfo.set(r.appid, { appid: r.appid, name: r.name || `App ${r.appid}`, tags: [] });
    } catch (e) {
      crawlFail++;
      warn(`curator ${c.id} (${c.name}): ${e.message}`);
      if (crawlFail >= 15 && crawled === 0) { warn("curator pages keep failing; giving up on curators"); break; }
    }
    if (crawled && crawled % 25 === 0) log(`curators crawled: ${crawled}/${selected.length}, creators kept ${creators.size}, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  log(`curators crawled: ${crawled}, creators kept: ${creators.size}, youtube links found: ${ytLinks.size}`);
  // (the spy worker keeps running; it also picks up games matched through YouTube titles below)

  // ---- 4. YouTube (links from curators, optional API); SteamSpy lookups continue in the background
  const ytCreators = new Map();
  const ytPhase = async () => {
    if (opts.noYoutube) return;
    const index = buildGameIndex([...gameInfo.values()]);
    const channels = new Map(); // channelId -> {name,url,subs,avatar,language,videos:[]}
    const resolveCache = new Map();
    // 4a. API search (optional)
    if (apiKey) {
      try { await youtubeApiSearch(opts, apiKey, apiT, [...baseGames.values()], channels, now, before); }
      catch (e) { warn(`YouTube API phase failed: ${e.message}`); }
    }
    // 4b. channels published by curators
    for (const { url } of ytLinks.values()) {
      if (channels.size >= opts.maxYtChannels || before(0.85)) break;
      const p = parseYouTubeUrl(url);
      if (!p) continue;
      try {
        const id = await resolveChannelId(p, ytT, resolveCache);
        if (id && !channels.has(id)) channels.set(id, { id, name: null, subs: null, avatar: null, language: null, videos: [] });
      } catch (e) { warn(`resolve ${url}: ${e.message}`); }
    }
    log(`youtube: ${channels.size} channels to read`);
    // 4c. RSS feeds
    let ok = 0;
    for (const ch of channels.values()) {
      if (before(0.9)) { warn("youtube feeds stopped: time window used"); break; }
      try {
        const { text, status } = await getText(`${ytBase()}/feeds/videos.xml?channel_id=${ch.id}`, ytT, { headers: YT_HEADERS });
        if (status !== 200) throw new Error(`HTTP ${status}`);
        const feed = parseYouTubeFeed(text);
        if (!feed.entries.length) continue;
        ok++;
        const covered = [];
        for (const e of feed.entries) {
          if (!e.published || now.getTime() - Date.parse(e.published) > 540 * DAY) continue;
          for (const g of matchGamesInTitle(e.title, index)) covered.push({ appid: g.appid, name: g.name, url: e.link, date: e.published, title: e.title, views: e.views });
        }
        const apiCovered = ch.videos.map((v) => ({ appid: v.appid, name: gameInfo.get(v.appid)?.name || v.gameName, url: `https://www.youtube.com/watch?v=${v.videoId}`, date: v.published, title: v.title, views: v.views ?? null }));
        const all = dedupeCovered([...apiCovered, ...covered]);
        if (!all.length) continue;
        for (const g of all) if (g.appid != null) bump(g.appid);
        ytCreators.set(`youtube:${ch.id}`, {
          id: `youtube:${ch.id}`, platform: "youtube", name: ch.name || feed.title || ch.id, url: `https://www.youtube.com/channel/${ch.id}`,
          avatar: ch.avatar, followers: ch.subs, language: ch.language, lastActive: newest(feed.entries.map((e) => e.published)),
          uploadsPerMonth: uploadsPerMonth(feed.entries), avgViews: averageViews(feed.entries),
          coveredGames: all, tagAffinity: {}, links: [{ label: "YouTube", url: `https://www.youtube.com/channel/${ch.id}` }],
        });
      } catch (e) { warn(`feed ${ch.id}: ${e.message}`); }
    }
    log(`youtube: ${ok} feeds read, ${ytCreators.size} channels cover known games`);
  };
  await ytPhase().catch((e) => warn("youtube phase: " + e.message));
  for (const [id, cr] of ytCreators) creators.set(id, cr);
  workDone = true;
  await spyJob;

  // ---- 5. assemble
  const gamesByAppid = new Map([...gameInfo.entries()].map(([id, g]) => [id, { tags: g.tags || [] }]));
  const out = [];
  const referenced = new Set();
  for (const cr of creators.values()) {
    cr.coveredGames = dedupeCovered(cr.coveredGames).slice(0, 40);
    if (!cr.coveredGames.length) continue;
    cr.tagAffinity = buildTagAffinity(cr.coveredGames, gamesByAppid);
    for (const g of cr.coveredGames) if (g.appid != null) referenced.add(g.appid);
    out.push(cr);
  }
  out.sort((x, y) => (y.followers ?? 0) - (x.followers ?? 0) || (Date.parse(y.lastActive || "") || 0) - (Date.parse(x.lastActive || "") || 0));
  // games[]: every game covered by a creator, plus every game we know about (the whole Page Doctor corpus, the watchlist),
  // so the "a game on Steam" search finds them even when nobody covered them yet.
  const allIds = new Set([...referenced, ...gameInfo.keys(), ...watchIds]);
  const gamesOut = [...allIds].filter((id) => gameInfo.has(id)).map((id) => {
    const g = gameInfo.get(id);
    const o = { appid: id, name: g?.name || `App ${id}`, tags: g?.tags || [] };
    if (g?.reviewsTotal !== undefined) o.reviews = { total: g.reviewsTotal };
    if (g?.comingSoon !== undefined) o.comingSoon = g.comingSoon;
    if (g?.releaseDate) o.releaseDate = g.releaseDate;
    return o;
  }).filter((g) => referenced.has(g.appid) || !/^App \d+$/.test(g.name));
  const watchMissing = watchIds.filter((id) => !gamesOut.some((g) => g.appid === id));
  if (watchMissing.length) warn(`watchlist games not available (no name found): ${watchMissing.join(", ")}`);
  const result = {
    generatedAt: new Date().toISOString(), source: "live", creators: out, games: gamesOut,
    meta: { gamesFrom: origin, curatorsInDirectory: directory.size, curatorsCrawled: crawled, youtubeApi: !!apiKey, elapsedSec: Math.round((Date.now() - t0) / 1000) },
  };

  // ---- summary
  const byPlat = {};
  for (const c of out) byPlat[c.platform] = (byPlat[c.platform] || 0) + 1;
  log("---- summary ----");
  log(`creators: ${out.length} ${JSON.stringify(byPlat)}; games referenced: ${gamesOut.length} (with tags: ${gamesOut.filter((g) => g.tags.length).length}, of which uncovered ${gamesOut.filter((g) => !referenced.has(g.appid)).length}, SteamSpy lookups ${spyOk}/${spyTried.size})`);
  log(`followers known for ${out.filter((c) => c.followers != null).length}; with other links: ${out.filter((c) => c.links.length > 1).length}; active in last 90 days: ${out.filter((c) => c.lastActive && now - Date.parse(c.lastActive) < 90 * DAY).length}`);
  log(store.summary()); log(spyT.summary()); log(ytT.summary()); if (apiKey) log(apiT.summary());
  const errs = validateCreators(result, { minCreators: opts.minOutput });
  if (errs.length) {
    for (const e of errs.slice(0, 15)) warn("validation: " + e);
    throw new Error(`creators did not validate (${errs.length} problems); not writing`);
  }
  const file = join(opts.out, "creators.json");
  writeJsonAtomic(file, result);
  log(`wrote ${file}: ${out.length} creators, ${gamesOut.length} games, ${Math.round(JSON.stringify(result).length / 1024)} KB, ${Math.round((Date.now() - t0) / 1000)}s`);
  return result;
}

// ------------------------------------------------------------------ helpers

function newest(dates) {
  const t = dates.map((d) => Date.parse(d || "")).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)).toISOString() : null;
}
function dedupeCovered(list) {
  const seen = new Set();
  return list.filter((g) => g && g.name).sort((x, y) => (y.date || "").localeCompare(x.date || "")).filter((g) => {
    const k = `${g.appid ?? g.name}|${g.url}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((g) => ({ appid: g.appid ?? null, name: g.name, url: g.url ?? null, date: g.date ?? null, title: g.title || g.name, views: g.views ?? null }));
}

async function fetchDirectory(start, store) {
  const urls = [
    `${storeBase()}/curators/ajaxgetcurators/render/?start=${start}&count=50&l=english`,
    `${storeBase()}/curators/ajaxgetcurators/?query=&start=${start}&count=50&dynamic_data=&filter=all&appid=0&l=english`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const json = await getJson(u, store);
      const r = parseCuratorDirectory(json);
      if (r.curators.length) return r;
      lastErr = new Error("no curators parsed from response");
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function fetchRecommendations(id, store, now) {
  const q = "query=&start=0&count=100&dynamic_data=&sort=recent&app_types=&reset=false&curations=&tagids=&l=english&cc=us";
  let lastErr;
  for (const u of [`${storeBase()}/curator/${id}/ajaxgetfilteredrecommendations/?${q}`, `${storeBase()}/curator/${id}/ajaxgetfilteredrecommendations/render/?${q}`]) {
    try {
      const json = await getJson(u, store);
      if (json && json.success === 0) throw new Error("success=0");
      return parseRecommendations(json?.results_html, now);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export function curatorToCreator(c, recs, page, now = new Date()) {
  const horizon = 540 * DAY;
  const base = recs.length ? recs : c.recent.map((r) => ({ appid: r.appid, name: "", verdict: r.verdict, date: r.date, blurb: r.blurb, link: r.link }));
  const covered = base
    .filter((r) => r.verdict !== "not_recommended" && r.appid && (!r.date || now.getTime() - Date.parse(r.date) < horizon))
    .map((r) => ({ appid: r.appid, name: r.name || `App ${r.appid}`, url: `https://store.steampowered.com/app/${r.appid}/`, date: r.date, title: r.blurb || (r.name || "Recommended"), views: null }));
  if (!covered.length) return null;
  const links = [{ label: "Steam Curator", url: `https://store.steampowered.com/curator/${c.id}/` }];
  const seen = new Set(links.map((l) => l.url));
  for (const l of [...(page?.links || []), ...linksFromText(c.description)]) if (!seen.has(l.url)) { seen.add(l.url); links.push(l); }
  if ((page?.communityUrl || c.communityUrl) && !seen.has(page?.communityUrl || c.communityUrl)) links.push({ label: "Steam Group", url: page?.communityUrl || c.communityUrl });
  const last = newest([c.lastActive, ...covered.map((g) => g.date)]);
  const recent180 = covered.filter((g) => g.date && now.getTime() - Date.parse(g.date) < 180 * DAY).length;
  return {
    id: `curator:${c.id}`, platform: "steam-curator", name: page?.name || c.name || `Curator ${c.id}`, url: `https://store.steampowered.com/curator/${c.id}/`,
    avatar: c.avatar || page?.avatar || null, followers: page?.followers ?? c.followers ?? null, language: null,
    lastActive: last, uploadsPerMonth: Math.round((recent180 / 6) * 10) / 10, avgViews: null,
    coveredGames: covered.slice(0, 40), tagAffinity: {}, links: links.slice(0, 12),
  };
}

async function resolveChannelId(p, ytT, cache) {
  const key = `${p.kind}:${p.value}`;
  if (cache.has(key)) return cache.get(key);
  let id = null;
  if (p.kind === "channel") id = p.value;
  else if (p.kind === "user") {
    const { text, status } = await getText(`${ytBase()}/feeds/videos.xml?user=${encodeURIComponent(p.value)}`, ytT, { headers: YT_HEADERS });
    if (status === 200) id = parseYouTubeFeed(text).channelId;
  } else {
    const path = p.kind === "handle" ? `/${p.value}` : `/c/${encodeURIComponent(p.value)}`;
    const { text, status } = await getText(`${ytBase()}${path}`, ytT, { headers: YT_HEADERS });
    if (status === 200) id = parseChannelIdFromHtml(text);
  }
  cache.set(key, id);
  return id;
}

async function youtubeApiSearch(opts, key, apiT, games, channels, now, before) {
  const ranked = games.filter((g) => g.name).sort((x, y) => (y.reviewsTotal ?? y.followers ?? 0) - (x.reviewsTotal ?? x.followers ?? 0));
  const step = Math.max(1, Math.floor(ranked.length / Math.max(1, opts.ytGames)));
  const picks = ranked.filter((_, i) => i % step === 0).slice(0, opts.ytGames); // spread over hits, mid and small/upcoming games
  const after = new Date(now.getTime() - 150 * DAY).toISOString();
  const videoIds = [];
  log(`youtube api: searching ${picks.length} games (~${picks.length * 100} quota units)`);
  for (const g of picks) {
    if (before(0.6)) break;
    const url = `${ytApiBase()}/youtube/v3/search?part=snippet&type=video&maxResults=25&order=relevance&relevanceLanguage=en&publishedAfter=${encodeURIComponent(after)}&q=${encodeURIComponent(`"${g.name}" game`)}&key=${key}`;
    let json;
    try { json = await getJson(url, apiT); } catch (e) { warn(`youtube search "${g.name}": ${e.message}`); if (/HTTP 403/.test(e.message)) { warn("YouTube quota or key problem; stopping API search"); break; } continue; }
    const nameNorm = normTitle(g.name);
    for (const v of parseYtSearch(json)) {
      if (!normTitle(v.title).includes(nameNorm)) continue; // keep only videos that actually name the game
      let ch = channels.get(v.channelId);
      if (!ch) { ch = { id: v.channelId, name: v.channelTitle, subs: null, avatar: null, language: null, videos: [] }; channels.set(v.channelId, ch); }
      ch.videos.push({ appid: g.appid, gameName: g.name, videoId: v.videoId, title: v.title, published: v.published, views: null });
      videoIds.push(v.videoId);
    }
  }
  const batches = (arr) => Array.from({ length: Math.ceil(arr.length / 50) }, (_, i) => arr.slice(i * 50, i * 50 + 50));
  const views = {};
  for (const b of batches([...new Set(videoIds)])) {
    try { Object.assign(views, parseYtVideos(await getJson(`${ytApiBase()}/youtube/v3/videos?part=statistics&id=${b.join(",")}&key=${key}`, apiT))); } catch (e) { warn("videos.list: " + e.message); }
  }
  for (const ch of channels.values()) for (const v of ch.videos) v.views = views[v.videoId] ?? null;
  for (const b of batches([...channels.keys()])) {
    try {
      const info = parseYtChannels(await getJson(`${ytApiBase()}/youtube/v3/channels?part=snippet,statistics&id=${b.join(",")}&key=${key}`, apiT));
      for (const [id, i] of Object.entries(info)) { const ch = channels.get(id); if (ch) Object.assign(ch, { name: i.title || ch.name, subs: i.subscribers, avatar: i.avatar, language: i.language }); }
    } catch (e) { warn("channels.list: " + e.message); }
  }
  log(`youtube api: ${channels.size} channels from ${picks.length} searches`);
}

/** Name, release info and tags for one game straight from Steam (appdetails) + SteamSpy, with the store-page tag modal as fallback. */
async function fetchWatchGame(id, store, spyT, existing) {
  const g = { appid: id, name: existing?.name || "", tags: existing?.tags || [] };
  try {
    const json = await getJson(`${storeBase()}/api/appdetails?appids=${id}&cc=us&l=en`, store, { treat403AsLimit: true });
    const d = json?.[String(id)]?.data;
    if (d?.name) g.name = String(d.name).replace(/&amp;/g, "&");
    if (d?.release_date) {
      g.comingSoon = !!d.release_date.coming_soon;
      const iso = parseCuratorDate(d.release_date.date);
      if (iso) g.releaseDate = iso.slice(0, 10); else if (d.release_date.date) g.releaseDate = String(d.release_date.date);
    }
    if (Number.isFinite(d?.recommendations?.total)) g.reviewsTotal = d.recommendations.total;
    else if (g.comingSoon) g.reviewsTotal = null;
  } catch (e) { warn(`appdetails ${id}: ${e.message}`); }
  if (!g.tags.length) {
    try {
      const sp = await getJson(`${spyBase()}/api.php?request=appdetails&appid=${id}`, spyT);
      if (!g.name && sp?.name) g.name = String(sp.name);
      if (sp?.tags && !Array.isArray(sp.tags)) g.tags = Object.entries(sp.tags).sort((x, y) => y[1] - x[1]).map(([n]) => n).slice(0, 12);
      if (g.reviewsTotal === undefined && Number.isFinite(Number(sp?.positive)) && Number.isFinite(Number(sp?.negative))) g.reviewsTotal = Number(sp.positive) + Number(sp.negative);
    } catch (e) { warn(`steamspy ${id}: ${e.message}`); }
  }
  if (!g.tags.length) {
    try {
      const { text } = await getText(`${storeBase()}/app/${id}/?l=english&cc=us`, store, { headers: { Cookie: "birthtime=568022401; lastagecheckage=1-0-1988; wants_mature_content=1" } });
      g.tags = parseStorePageTags(text).slice(0, 12);
    } catch (e) { warn(`store page tags ${id}: ${e.message}`); }
  }
  return g.name ? g : null;
}

async function loadGames(opts, store, spyT) {
  const candidates = [opts.corpus, resolve(HERE, "../../page-doctor/dist/data/corpus.json"), resolve(HERE, "../../page-doctor/data/corpus.json")].filter(Boolean);
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const c = JSON.parse(readFileSync(p, "utf8"));
      if (!Array.isArray(c.games) || !c.games.length) continue;
      if (c.source !== "live" && p !== opts.corpus) { log(`corpus at ${p} is ${c.source} data, not using it`); continue; }
      const games = new Map();
      for (const g of c.games) {
        if (!g.appid || !g.name) continue;
        games.set(g.appid, {
          appid: g.appid, name: g.name, tags: (g.tags || []).slice(0, 12).map((t) => t.name), reviewsTotal: g.reviews?.total ?? null,
          comingSoon: !!g.comingSoon, releaseDate: g.releaseDate || undefined, followers: g.followers ?? null,
        });
      }
      return { games, origin: `corpus ${p} (${c.source})` };
    } catch (e) { warn(`could not read corpus ${p}: ${e.message}`); }
  }
  // own small list: SteamSpy top games of the last two weeks + the most-reviewed recent indie games from Steam search
  const games = new Map();
  try {
    const json = await getJson(`${spyBase()}/api.php?request=top100in2weeks`, spyT);
    for (const e of Object.values(json || {})) if (e?.appid && e?.name) games.set(Number(e.appid), { appid: Number(e.appid), name: String(e.name), tags: [] });
  } catch (e) { warn(`SteamSpy top100: ${e.message}`); }
  try {
    const { parseSearchRows } = await import("./search-rows.mjs");
    const json = await getJson(`${storeBase()}/search/results/?query=&start=0&count=100&dynamic_data=&sort_by=Reviews_DESC&tags=492&category1=998&infinite=1&json=1&cc=us&l=english&ndl=1`, store);
    for (const r of parseSearchRows(json?.results_html)) if (!games.has(r.appid)) games.set(r.appid, { appid: r.appid, name: r.name, tags: [], reviewsTotal: r.reviewTotal });
  } catch (e) { warn(`Steam search for game list: ${e.message}`); }
  return { games, origin: "own list (SteamSpy top100in2weeks + Steam indie search)" };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(
    () => process.exit(0),
    (e) => { console.error("FETCH FAILED:", e?.stack || e); process.exit(1); },
  );
}
