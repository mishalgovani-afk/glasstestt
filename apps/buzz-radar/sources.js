// Buzz Radar - browser-side search connectors. Every connector returns Post[] (see CONTRACT).
// keys shape: keys[sourceId][fieldName], e.g. keys.youtube.apiKey, keys.twitch.clientId.

const TIMEOUT_MS = 15000;
const DAY = 86400000;

// ---------- helpers ----------
export function stripHtml(html) {
  if (!html) return "";
  let s = String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const ent = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch { return ""; }
    }
    return ent[e.toLowerCase()] ?? m;
  });
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function extractHashtags(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(/(?:^|[\s(])#([\p{L}\p{N}_]{2,50})/gu)) out.add(m[1].toLowerCase());
  return [...out];
}

const uniq = (arr) => [...new Set(arr.filter(Boolean).map((t) => String(t).toLowerCase().replace(/^#/, "")))];
const num = (v) => (typeof v === "number" && isFinite(v) ? v : v != null && v !== "" && isFinite(+v) ? +v : null);
const iso = (v) => { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

/** "Elden Ring: Nightreign" -> "eldenringnightreign" (hashtag form) */
export function gameTag(game) {
  return String(game || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function mkPost(p) {
  return {
    id: p.id, source: p.source, kind: p.kind, url: p.url,
    title: p.title || "", text: p.text || "", author: p.author || "", authorId: String(p.authorId || p.author || ""),
    authorFollowers: num(p.authorFollowers), publishedAt: p.publishedAt,
    metrics: { views: num(p.metrics?.views), likes: num(p.metrics?.likes), comments: num(p.metrics?.comments), viewers: num(p.metrics?.viewers) },
    tags: uniq(p.tags || []), lang: p.lang || null,
  };
}

export function dedupePosts(posts) {
  const seen = new Map();
  for (const p of posts) if (p && p.id && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

export function filterSince(posts, sinceDays, now = Date.now()) {
  if (!sinceDays) return posts;
  const min = now - sinceDays * DAY;
  return posts.filter((p) => { const t = Date.parse(p.publishedAt); return !isNaN(t) && t >= min; });
}

/** fetch JSON with timeout + external abort signal */
async function getJson(url, { signal, headers, method = "GET", body, timeout = TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(signal.reason);
  if (signal) { if (signal.aborted) ctl.abort(signal.reason); else signal.addEventListener("abort", onAbort, { once: true }); }
  const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeout);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctl.signal });
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j?.error?.message || j?.message || (typeof j?.error === "string" ? j.error : ""); } catch { /* ignore */ }
      throw new Error(`HTTP ${res.status}${detail ? ": " + detail : ""}`);
    }
    return await res.json();
  } catch (e) {
    if (signal?.aborted) throw e;
    if (ctl.signal.aborted) throw new Error(`timed out after ${timeout / 1000}s`);
    if (e instanceof TypeError) throw new Error("network/CORS error (blocked by the browser or offline)");
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}

const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

// ---------- normalizers (exported for tests) ----------
export function parseIsoDuration(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
  if (!m) return null;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

/** v = videos.list item (snippet, statistics, contentDetails, liveStreamingDetails); channels = {channelId: subscriberCount|null} */
export function normalizeYouTube(v, channels = {}) {
  const sn = v.snippet || {}, st = v.statistics || {}, ld = v.liveStreamingDetails;
  const id = typeof v.id === "object" ? v.id.videoId : v.id;
  if (!id) return null;
  const dur = parseIsoDuration(v.contentDetails?.duration);
  const kind = ld ? "stream" : dur != null && dur <= 62 ? "short" : "video";
  const text = stripHtml(sn.description);
  const published = ld?.actualStartTime || sn.publishedAt;
  return mkPost({
    id: `youtube:${id}`, source: "youtube", kind,
    url: kind === "short" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    title: stripHtml(sn.title), text, author: sn.channelTitle, authorId: sn.channelId,
    authorFollowers: channels[sn.channelId] ?? null, publishedAt: iso(published || sn.publishedAt),
    metrics: { views: st.viewCount, likes: st.likeCount, comments: st.commentCount, viewers: ld?.concurrentViewers },
    tags: [...(sn.tags || []).slice(0, 10), ...extractHashtags(stripHtml(sn.title) + " " + text)],
    lang: (sn.defaultAudioLanguage || sn.defaultLanguage || "").slice(0, 2) || null,
  });
}

export function normalizeTwitchStream(s) {
  return mkPost({
    id: `twitch:stream:${s.id}`, source: "twitch", kind: "stream",
    url: `https://www.twitch.tv/${s.user_login}`, title: s.title, text: "",
    author: s.user_name, authorId: s.user_id, authorFollowers: null, publishedAt: iso(s.started_at),
    metrics: { viewers: s.viewer_count, views: null, likes: null, comments: null },
    tags: s.tags || [], lang: s.language || null,
  });
}

export function normalizeTwitchVideo(v) {
  return mkPost({
    id: `twitch:video:${v.id}`, source: "twitch", kind: "video", url: v.url,
    title: v.title, text: stripHtml(v.description), author: v.user_name, authorId: v.user_id,
    authorFollowers: null, publishedAt: iso(v.published_at || v.created_at),
    metrics: { views: v.view_count, likes: null, comments: null, viewers: null },
    tags: extractHashtags(v.title + " " + (v.description || "")), lang: v.language || null,
  });
}

export function normalizeReddit(child) {
  const d = child?.data || child;
  if (!d?.id) return null;
  return mkPost({
    id: `reddit:${d.id}`, source: "reddit", kind: "post",
    url: `https://www.reddit.com${d.permalink || "/comments/" + d.id}`,
    title: stripHtml(d.title), text: stripHtml(d.selftext), author: d.author, authorId: d.author,
    authorFollowers: null, publishedAt: iso((d.created_utc || 0) * 1000),
    metrics: { views: null, likes: d.ups ?? d.score, comments: d.num_comments, viewers: null },
    tags: [d.link_flair_text, d.subreddit && "r/" + d.subreddit, ...extractHashtags(d.title)], lang: null,
  });
}

export function normalizeBluesky(p) {
  if (!p?.uri) return null;
  const rec = p.record || {}, a = p.author || {};
  const rkey = p.uri.split("/").pop();
  return mkPost({
    id: `bluesky:${p.uri}`, source: "bluesky", kind: "post",
    url: `https://bsky.app/profile/${a.handle || a.did}/post/${rkey}`,
    title: "", text: stripHtml(rec.text), author: a.displayName || a.handle, authorId: a.handle || a.did,
    authorFollowers: a.followersCount ?? null, publishedAt: iso(rec.createdAt || p.indexedAt),
    metrics: { views: null, likes: p.likeCount, comments: p.replyCount, viewers: null },
    tags: [...(rec.tags || []), ...extractHashtags(rec.text)], lang: rec.langs?.[0]?.slice(0, 2) || null,
  });
}

export function normalizeMastodon(s, instance = "mastodon.social") {
  if (!s?.id) return null;
  const acc = s.account || {};
  const src = s.reblog || s; // boosts: attribute content to the original
  if (s.reblog) return null;
  return mkPost({
    id: `mastodon:${instance}:${s.id}`, source: "mastodon", kind: "post",
    url: s.url || s.uri, title: "", text: stripHtml(src.content), author: acc.display_name || acc.acct,
    authorId: acc.url || acc.acct, authorFollowers: acc.followers_count, publishedAt: iso(s.created_at),
    metrics: { views: null, likes: s.favourites_count, comments: s.replies_count, viewers: null },
    tags: (s.tags || []).map((t) => t.name), lang: s.language || null,
  });
}

export function normalizeHN(h) {
  if (!h?.objectID) return null;
  const title = stripHtml(h.title || h.story_title || "");
  return mkPost({
    id: `hackernews:${h.objectID}`, source: "hackernews", kind: "article",
    url: `https://news.ycombinator.com/item?id=${h.objectID}`, title,
    text: stripHtml(h.story_text || h.comment_text || "") + (h.url ? `\n${h.url}` : ""),
    author: h.author, authorId: h.author, authorFollowers: null,
    publishedAt: iso(h.created_at || (h.created_at_i || 0) * 1000),
    metrics: { views: null, likes: h.points, comments: h.num_comments, viewers: null }, tags: [], lang: "en",
  });
}

// ---------- connectors ----------
async function ytSearch(game, apiKey, sinceDays, signal, limit) {
  const base = "https://www.googleapis.com/youtube/v3";
  const after = new Date(Date.now() - sinceDays * DAY).toISOString();
  const common = { part: "snippet", q: game, type: "video", order: "date", publishedAfter: after, maxResults: 50, key: apiKey };
  const ids = new Set();
  const maxPages = Math.max(1, Math.min(3, Math.ceil(limit / 50)));
  // 1) recent uploads (<= 3 pages x 100 units), 2) live now, 3) completed broadcasts (1 page each)
  const runs = [{ extra: {}, pages: maxPages }, { extra: { eventType: "live" }, pages: 1 }, { extra: { eventType: "completed" }, pages: 1 }];
  for (const r of runs) {
    let token;
    for (let i = 0; i < r.pages; i++) {
      let j;
      try { j = await getJson(`${base}/search?${qs({ ...common, ...r.extra, pageToken: token })}`, { signal }); }
      catch (e) { if (ids.size && !signal?.aborted) break; throw e; } // keep partial results
      (j.items || []).forEach((it) => it.id?.videoId && ids.add(it.id.videoId));
      token = j.nextPageToken;
      if (!token) break;
    }
  }
  const idList = [...ids];
  const vids = [];
  for (const c of chunk(idList, 50)) {
    const j = await getJson(`${base}/videos?${qs({ part: "snippet,statistics,contentDetails,liveStreamingDetails", id: c.join(","), key: apiKey })}`, { signal });
    vids.push(...(j.items || []));
  }
  const channels = {};
  const chIds = [...new Set(vids.map((v) => v.snippet?.channelId).filter(Boolean))];
  try {
    for (const c of chunk(chIds, 50)) {
      const j = await getJson(`${base}/channels?${qs({ part: "statistics", id: c.join(","), key: apiKey })}`, { signal });
      for (const ch of j.items || []) channels[ch.id] = ch.statistics?.hiddenSubscriberCount ? null : num(ch.statistics?.subscriberCount);
    }
  } catch (e) { if (signal?.aborted) throw e; /* followers are optional */ }
  return vids.map((v) => normalizeYouTube(v, channels)).filter(Boolean);
}

async function twitchSearch(game, { clientId, token }, signal) {
  const headers = { "Client-Id": clientId.trim(), Authorization: "Bearer " + token.trim().replace(/^(oauth:|bearer\s+)/i, "") };
  const base = "https://api.twitch.tv/helix";
  const g = await getJson(`${base}/games?${qs({ name: game })}`, { signal, headers });
  const id = g.data?.[0]?.id;
  if (!id) return [];
  const [s, v] = await Promise.allSettled([
    getJson(`${base}/streams?${qs({ game_id: id, first: 100 })}`, { signal, headers }),
    getJson(`${base}/videos?${qs({ game_id: id, sort: "time", first: 100 })}`, { signal, headers }),
  ]);
  if (s.status === "rejected" && v.status === "rejected") throw s.reason;
  return [
    ...(s.status === "fulfilled" ? s.value.data || [] : []).map(normalizeTwitchStream),
    ...(v.status === "fulfilled" ? v.value.data || [] : []).map(normalizeTwitchVideo),
  ];
}

function redditTimeWindow(sinceDays) {
  return sinceDays <= 1 ? "day" : sinceDays <= 7 ? "week" : sinceDays <= 31 ? "month" : sinceDays <= 365 ? "year" : "all";
}

async function getText(url, { signal, timeout = TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(signal.reason);
  if (signal) { if (signal.aborted) ctl.abort(signal.reason); else signal.addEventListener("abort", onAbort, { once: true }); }
  const timer = setTimeout(() => ctl.abort(new Error("timeout")), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (signal?.aborted) throw e;
    if (ctl.signal.aborted) throw new Error(`timed out after ${timeout / 1000}s`);
    if (e instanceof TypeError) throw new Error("network/CORS error (blocked by the browser or offline)");
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener?.("abort", onAbort); }
}

/** Parse Reddit's Atom search feed into reddit-JSON-like {data} children. DOMParser when available, regex otherwise. */
export function parseRedditAtom(xml) {
  const rows = [];
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (!doc.querySelector("parsererror")) {
      for (const e of doc.getElementsByTagName("entry")) {
        const t = (n) => e.getElementsByTagName(n)[0]?.textContent || "";
        const cat = e.getElementsByTagName("category")[0];
        rows.push({ id: t("id"), title: t("title"), author: e.getElementsByTagName("author")[0]?.getElementsByTagName("name")[0]?.textContent || "",
          link: e.getElementsByTagName("link")[0]?.getAttribute("href") || "", date: t("published") || t("updated"), content: t("content"), sub: cat?.getAttribute("term") || "" });
      }
      return rows.map(atomRowToChild).filter(Boolean);
    }
  }
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    const tag = (n) => (new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(b)?.[1] || "").replace(/^<!\[CDATA\[|\]\]>$/g, "");
    rows.push({ id: stripHtml(tag("id")), title: stripHtml(tag("title")), author: stripHtml(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(b)?.[1] || ""),
      link: /<link[^>]*href="([^"]+)"/.exec(b)?.[1] || "", date: stripHtml(tag("published") || tag("updated")), content: tag("content"),
      sub: /<category[^>]*term="([^"]+)"/.exec(b)?.[1] || "" });
  }
  return rows.map(atomRowToChild).filter(Boolean);
}

function atomRowToChild(r) {
  const id = String(r.id || "").replace(/^t\d_/, "");
  if (!id) return null;
  let permalink = "";
  try { permalink = new URL(r.link).pathname; } catch { permalink = r.link; }
  const body = stripHtml(r.content).replace(/\s*submitted by\s*\/u\/\S+\s*\[link\]\s*\[comments\]\s*$/i, "").trim();
  return { data: { id, title: r.title, selftext: body, author: String(r.author).replace(/^\/?u\//, ""), subreddit: r.sub,
    permalink, created_utc: Date.parse(r.date) / 1000, ups: null, num_comments: null, link_flair_text: null } };
}

async function redditSearch(game, sinceDays, signal, limit) {
  const t = redditTimeWindow(sinceDays);
  const out = [];
  let after;
  try {
    for (let i = 0; i < Math.min(3, Math.ceil(limit / 100)); i++) {
      const j = await getJson(`https://www.reddit.com/search.json?${qs({ q: `"${game}"`, sort: "new", t, limit: 100, raw_json: 1, after })}`, { signal });
      out.push(...(j.data?.children || []).map(normalizeReddit));
      after = j.data?.after;
      if (!after) break;
    }
    return out;
  } catch (e) {
    if (signal?.aborted || out.length) { if (out.length) return out; throw e; }
    // JSON blocked (CORS / 403 / 429): fall back to the keyless Atom feed (no scores, ~25-100 items)
    try {
      const xml = await getText(`https://www.reddit.com/search.rss?${qs({ q: `"${game}"`, sort: "new", t, limit: 100 })}`, { signal });
      return parseRedditAtom(xml).map(normalizeReddit);
    } catch (e2) {
      throw new Error(`${e.message}; RSS fallback also failed: ${e2.message}`);
    }
  }
}

async function blueskySearch(game, keys, sinceDays, signal, limit) {
  let base = "https://public.api.bsky.app", headers;
  if (keys?.handle && keys?.appPassword) {
    const s = await getJson("https://bsky.social/xrpc/com.atproto.server.createSession", {
      signal, method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: keys.handle.trim().replace(/^@/, ""), password: keys.appPassword.trim() }),
    });
    base = "https://bsky.social"; // the PDS proxies authenticated appview calls
    headers = { Authorization: "Bearer " + s.accessJwt };
  }
  const since = new Date(Date.now() - sinceDays * DAY).toISOString();
  const out = [];
  let cursor;
  for (let i = 0; i < Math.min(3, Math.ceil(limit / 100)); i++) {
    let j;
    try { j = await getJson(`${base}/xrpc/app.bsky.feed.searchPosts?${qs({ q: `"${game}"`, sort: "latest", since, limit: 100, cursor })}`, { signal, headers }); }
    catch (e) {
      if (!headers && /HTTP 40[13]/.test(e.message)) throw new Error("Bluesky search now requires login: add your handle + an app password in settings");
      throw e;
    }
    out.push(...(j.posts || []).map(normalizeBluesky));
    cursor = j.cursor;
    if (!cursor) break;
  }
  return out;
}

async function mastodonSearch(game, sinceDays, signal, limit) {
  const tag = gameTag(game);
  if (!tag) return [];
  const instance = "mastodon.social", min = Date.now() - sinceDays * DAY;
  const out = [];
  let maxId;
  for (let i = 0; i < Math.min(4, Math.ceil(limit / 40)); i++) {
    const j = await getJson(`https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?${qs({ limit: 40, max_id: maxId })}`, { signal });
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j.map((s) => normalizeMastodon(s, instance)));
    maxId = j[j.length - 1].id;
    if (Date.parse(j[j.length - 1].created_at) < min) break;
  }
  return out;
}

async function hnSearch(game, sinceDays, signal) {
  const from = Math.floor((Date.now() - sinceDays * DAY) / 1000);
  const j = await getJson(`https://hn.algolia.com/api/v1/search_by_date?${qs({ query: `"${game}"`, tags: "story", numericFilters: `created_at_i>${from}`, hitsPerPage: 100 })}`, { signal });
  return (j.hits || []).map(normalizeHN);
}

// ---------- registry ----------
export const SOURCES = [
  {
    id: "youtube", name: "YouTube", kinds: ["video", "short", "stream"], needsKey: true,
    keyFields: [{ name: "apiKey", label: "YouTube Data API key",
      help: "In Google Cloud Console enable \"YouTube Data API v3\", then Credentials > Create credentials > API key (restrict it to your site's referrer). Free quota is 10,000 units/day; one search here costs about 500.",
      url: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" }],
    search: (game, o) => ytSearch(game, o.keys.apiKey.trim(), o.sinceDays, o.signal, o.limit),
  },
  {
    id: "twitch", name: "Twitch", kinds: ["stream", "video"], needsKey: true,
    keyFields: [
      { name: "clientId", label: "Twitch Client ID",
        help: "Register an app at dev.twitch.tv/console/apps (OAuth redirect URL: http://localhost, category: Website Integration) and copy its Client ID.",
        url: "https://dev.twitch.tv/console/apps" },
      { name: "token", label: "Twitch access token",
        help: "Browsers cannot request an app token themselves (the token endpoint blocks CORS). Generate one with: curl -X POST 'https://id.twitch.tv/oauth2/token' -d 'client_id=ID&client_secret=SECRET&grant_type=client_credentials', or use the implicit-grant URL https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=ID&redirect_uri=http://localhost and copy access_token from the redirect URL. Tokens expire (app tokens ~60 days; user tokens ~4h).",
        url: "https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/" },
    ],
    search: (game, o) => twitchSearch(game, o.keys, o.signal),
  },
  {
    id: "reddit", name: "Reddit", kinds: ["post"], needsKey: false, keyFields: [],
    search: (game, o) => redditSearch(game, o.sinceDays, o.signal, o.limit),
  },
  {
    id: "bluesky", name: "Bluesky", kinds: ["post"], needsKey: false,
    keyFields: [
      { name: "handle", label: "Bluesky handle (optional)", help: "Search is only open without login at times; if it fails, enter your handle, e.g. you.bsky.social.", url: "https://bsky.app", optional: true },
      { name: "appPassword", label: "Bluesky app password (optional)", help: "Settings > Privacy and security > App passwords > Add. Never use your main password.", url: "https://bsky.app/settings/app-passwords", optional: true },
    ],
    search: (game, o) => blueskySearch(game, o.keys || {}, o.sinceDays, o.signal, o.limit),
  },
  {
    id: "mastodon", name: "Mastodon", kinds: ["post"], needsKey: false, keyFields: [],
    search: (game, o) => mastodonSearch(game, o.sinceDays, o.signal, o.limit),
  },
  {
    id: "hackernews", name: "Hacker News", kinds: ["article"], needsKey: false, keyFields: [],
    search: (game, o) => hnSearch(game, o.sinceDays, o.signal),
  },
  ...["tiktok", "instagram", "x", "facebook"].map((id) => ({
    id, name: APIFY_ACTORS[id].label, kinds: [id === "tiktok" ? "short" : id === "instagram" ? "post" : "post"], needsKey: true,
    keyGroup: "apify", keyFields: [], search: (game, o) => apifySearch(id, game, o),
  })),
];

/** A source is runnable when it needs no key, or all its non-optional key fields are filled. */
export function isRunnable(src, keys = {}) {
  if (!src.needsKey) return true;
  const k = keys[src.keyGroup || src.id] || {};
  const fields = src.keyGroup ? KEY_GROUPS[src.keyGroup].keyFields : src.keyFields;
  return fields.every((f) => f.optional || (k[f.name] && String(k[f.name]).trim()));
}

export async function searchAll(game, { keys = {}, sinceDays = 30, signal, onProgress, limit = 150, sources = SOURCES } = {}) {
  const notify = (e) => { try { onProgress?.(e); } catch { /* ignore UI errors */ } };
  const errors = [];
  const results = await Promise.all(sources.map(async (src) => {
    if (!isRunnable(src, keys)) { notify({ source: src.id, status: "skipped", count: 0, error: "no API key" }); return []; }
    notify({ source: src.id, status: "loading", count: 0 });
    try {
      let posts = await src.search(game, { keys: keys[src.keyGroup || src.id] || {}, sinceDays, signal, limit });
      posts = filterSince(dedupePosts(posts.filter(Boolean)), sinceDays);
      notify({ source: src.id, status: "done", count: posts.length });
      return posts;
    } catch (e) {
      const message = signal?.aborted ? "cancelled" : e?.message || String(e);
      errors.push({ source: src.id, message });
      notify({ source: src.id, status: "error", count: 0, error: message });
      return [];
    }
  }));
  const posts = dedupePosts(results.flat()).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { posts, errors };
}
