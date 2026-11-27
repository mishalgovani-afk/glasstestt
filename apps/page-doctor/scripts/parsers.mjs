// Pure parsers for Steam / SteamSpy responses. No network, no filesystem.
// Everything here tolerates missing or renamed fields: unknown shapes give nulls/empty arrays, never throws.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', copy: "(c)", reg: "(R)", trade: "(TM)" };

export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChr(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChr(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}
function safeChr(n) {
  try {
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

/** HTML fragment -> readable plain text (paragraph breaks kept as blank lines). */
export function htmlToText(html, maxLen = 8000) {
  let s = String(html ?? "");
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)>/gi, "\n\n").replace(/<li[^>]*>/gi, "\n- ").replace(/<\/li>/gi, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > maxLen ? s.slice(0, maxLen).replace(/\s+\S*$/, "") + "..." : s;
}

/** Parse a Steam release-date string into ISO yyyy-mm-dd, or null when it is not a concrete date. */
export function parseSteamDate(str) {
  if (!str) return null;
  const s = decodeEntities(String(str)).replace(/\s+/g, " ").trim();
  let m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/); // Nov 3, 2024
  if (m) return mk(+m[3], monthIdx(m[1]), +m[2]);
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})$/); // 3 Nov, 2024
  if (m) return mk(+m[3], monthIdx(m[2]), +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?,? (\d{4})$/); // Nov 2024 (month only)
  if (m) return mk(+m[2], monthIdx(m[1]), 1);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return mk(+m[1], +m[2] - 1, +m[3]);
  return null;
}
function monthIdx(name) {
  return MONTHS.indexOf(String(name).slice(0, 3).toLowerCase());
}
function mk(y, mo, d) {
  if (!(y >= 1990 && y <= 2100) || mo < 0 || mo > 11 || !(d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Steam's review-summary label for a given total and positive percentage. */
export function reviewDesc(total, pct) {
  if (!total) return "No user reviews";
  if (total < 10) return `${total} user review${total === 1 ? "" : "s"}`;
  if (pct >= 95 && total >= 500) return "Overwhelmingly Positive";
  if (pct >= 80) return total >= 50 ? "Very Positive" : "Positive";
  if (pct >= 70) return "Mostly Positive";
  if (pct >= 40) return "Mixed";
  if (pct >= 20) return "Mostly Negative";
  if (total >= 500) return "Overwhelmingly Negative";
  return total >= 50 ? "Very Negative" : "Negative";
}

/** Steam `supported_languages` HTML -> { languages, fullAudio }. Full audio languages are starred. */
export function parseLanguages(html) {
  const s = String(html ?? "");
  const main = s.split(/<br\s*\/?>/i)[0];
  const languages = [];
  const fullAudio = [];
  for (const part of main.split(",")) {
    const star = /\*/.test(part);
    const name = decodeEntities(part.replace(/<[^>]+>/g, "").replace(/\*/g, "")).trim();
    if (!name || name.length > 40) continue;
    languages.push(name);
    if (star) fullAudio.push(name);
  }
  return { languages, fullAudio };
}

function stripQuery(u) {
  return typeof u === "string" ? u.replace(/\?.*$/, "") : null;
}
const httpsOnly = (u) => (typeof u === "string" && u.startsWith("https://") ? u : null);

/**
 * Steam appdetails (the inner "data" object) -> the store-derived part of a corpus game.
 * Returns null when the app is not a game (DLC, demo, software, ...) unless allowAnyType is set.
 */
export function parseStoreDetails(data, { allowAnyType = false } = {}) {
  if (!data || typeof data !== "object") return null;
  if (!allowAnyType && data.type && data.type !== "game") return null;
  const appid = Number(data.steam_appid);
  if (!Number.isFinite(appid) || appid <= 0) return null;
  const langs = parseLanguages(data.supported_languages);
  const genres = (Array.isArray(data.genres) ? data.genres : []).map((g) => decodeEntities(g?.description ?? "")).filter(Boolean);
  const earlyAccess = (Array.isArray(data.genres) ? data.genres : []).some((g) => String(g?.id) === "70" || /early access/i.test(g?.description ?? ""));
  const po = data.price_overview;
  let priceUSD = null;
  if (data.is_free) priceUSD = 0;
  else if (po && Number.isFinite(po.initial)) priceUSD = Math.round(po.initial) / 100;
  else if (po && Number.isFinite(po.final)) priceUSD = Math.round(po.final) / 100;
  const rd = data.release_date || {};
  const iso = parseSteamDate(rd.date);
  const about = htmlToText(data.about_the_game || data.detailed_description || "");
  const name = decodeEntities(data.name ?? "").trim();
  return {
    appid,
    name,
    url: `https://store.steampowered.com/app/${appid}/`,
    shortDescription: htmlToText(data.short_description || "", 600),
    aboutText: about,
    genres,
    priceUSD,
    isFree: !!data.is_free,
    releaseDate: iso || (rd.date ? String(rd.date) : ""),
    releaseIso: iso,
    comingSoon: !!rd.coming_soon,
    developers: Array.isArray(data.developers) ? data.developers.map(String) : [],
    publishers: Array.isArray(data.publishers) ? data.publishers.map(String).filter(Boolean) : [],
    headerImage: httpsOnly(data.header_image) || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
    capsuleImage: httpsOnly(data.capsule_imagev5) || httpsOnly(data.capsule_image) || null,
    screenshots: (Array.isArray(data.screenshots) ? data.screenshots : []).map((x) => stripQuery(x?.path_full)).filter(Boolean),
    movies: Array.isArray(data.movies) ? data.movies.length : 0,
    languages: langs.languages,
    fullAudioLanguages: langs.fullAudio,
    hasDemo: Array.isArray(data.demos) ? data.demos.length > 0 : false,
    earlyAccess,
    totalRecommendations: Number.isFinite(data.recommendations?.total) ? data.recommendations.total : null,
  };
}

/** Steam appdetails raw response { "<appid>": { success, data } } -> data or null. */
export function unwrapAppDetails(json, appid) {
  const entry = json?.[String(appid)] ?? (json && typeof json === "object" ? Object.values(json)[0] : null);
  return entry && entry.success && entry.data ? entry.data : null;
}

/** SteamSpy appdetails / tag entry -> normalized stats. `tags` is {} or [] when a game has none. */
export function parseSpy(entry) {
  if (!entry || typeof entry !== "object") return null;
  const appid = Number(entry.appid);
  if (!Number.isFinite(appid) || appid <= 0) return null;
  const tagsRaw = entry.tags && !Array.isArray(entry.tags) && typeof entry.tags === "object" ? entry.tags : {};
  const tags = Object.entries(tagsRaw)
    .map(([name, votes]) => ({ name: decodeEntities(name), votes: Number(votes) || 0 }))
    .sort((a, b) => b.votes - a.votes);
  const positive = toNum(entry.positive);
  const negative = toNum(entry.negative);
  const total = positive != null && negative != null ? positive + negative : null;
  const owners = typeof entry.owners === "string" && entry.owners.trim() ? entry.owners.replace(/\s+/g, " ").trim() : null;
  return {
    appid,
    name: entry.name ? String(entry.name) : null,
    tags,
    owners,
    ownersMid: ownersMidpoint(owners),
    ccu: toNum(entry.ccu),
    positive,
    negative,
    totalReviews: total,
    positivePct: total ? Math.round((positive / total) * 100) : null,
    priceCents: toNum(entry.price),
  };
}
const toNum = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** "1,000,000 .. 2,000,000" -> 1500000 */
export function ownersMidpoint(range) {
  if (!range) return null;
  const nums = String(range).match(/[\d,]+/g)?.map((n) => Number(n.replace(/,/g, ""))) ?? [];
  if (nums.length === 2) return (nums[0] + nums[1]) / 2;
  return nums.length === 1 ? nums[0] : null;
}

/** SteamSpy `request=tag` response: object keyed by appid (or an array) -> parsed entries, best first. */
export function parseSpyTagList(json) {
  const arr = Array.isArray(json) ? json : json && typeof json === "object" ? Object.values(json) : [];
  return arr
    .map(parseSpy)
    .filter(Boolean)
    .sort((a, b) => (b.ownersMid ?? 0) - (a.ownersMid ?? 0) || (b.ccu ?? 0) - (a.ccu ?? 0));
}

/** Steam appreviews JSON -> { total, positivePct, scoreDesc } or null. */
export function parseAppReviews(json) {
  const q = json?.query_summary;
  if (!q || typeof q !== "object") return null;
  const pos = toNum(q.total_positive);
  const neg = toNum(q.total_negative);
  const total = toNum(q.total_reviews) ?? (pos != null && neg != null ? pos + neg : null);
  if (total == null) return null;
  const pct = total > 0 && pos != null ? Math.round((pos / (pos + (neg ?? total - pos))) * 100) : null;
  return { total, positivePct: pct, scoreDesc: q.review_score_desc ? String(q.review_score_desc) : reviewDesc(total, pct ?? 0) };
}

/**
 * Steam store search (infinite=1) `results_html` -> rows. Bundles/packages (no numeric appid) are skipped.
 * Row fields: appid, name, releaseText, releaseIso, reviewTotal, reviewPct, reviewDesc, tagIds, priceCents.
 */
export function parseSearchRows(resultsHtml) {
  const html = String(resultsHtml ?? "");
  const chunks = html.split(/(?=<a\b[^>]*search_result_row)/).filter((c) => /search_result_row/.test(c.slice(0, 2500)));
  const rows = [];
  for (const c of chunks) {
    const m = c.match(/data-ds-appid="(\d+)"/);
    if (!m) continue;
    const title = c.match(/<span class="title">([\s\S]*?)<\/span>/);
    const rel = c.match(/search_released[^>]*>([\s\S]*?)<\/div>/);
    const releaseText = rel ? decodeEntities(rel[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() : "";
    const tip = c.match(/data-tooltip-html="([^"]*)"/);
    let reviewTotal = null, reviewPct = null, reviewDescription = null;
    if (tip) {
      const t = decodeEntities(tip[1]);
      const sm = t.match(/(\d+)% of the ([\d,]+) user reviews/);
      if (sm) {
        reviewPct = Number(sm[1]);
        reviewTotal = Number(sm[2].replace(/,/g, ""));
      }
      reviewDescription = t.split(/<br\s*\/?>/i)[0].trim() || null;
    }
    const tg = c.match(/data-ds-tagids="\[([\d,\s]*)\]"/);
    const price = c.match(/data-price-final="(\d+)"/);
    rows.push({
      appid: Number(m[1]),
      name: title ? decodeEntities(title[1]).trim() : "",
      releaseText,
      releaseIso: parseSteamDate(releaseText),
      reviewTotal,
      reviewPct,
      reviewDesc: reviewDescription,
      tagIds: tg && tg[1].trim() ? tg[1].split(",").map((x) => Number(x.trim())).filter(Boolean) : [],
      priceCents: price ? Number(price[1]) : null,
    });
  }
  return rows;
}

/** Store page HTML -> user tags with votes, from the `InitAppTagModal(appid, [ {tagid,name,count,...} ], ...)` call. */
export function parseStorePageTags(html) {
  const s = String(html ?? "");
  const i = s.indexOf("InitAppTagModal");
  if (i < 0) return [];
  const start = s.indexOf("[", i);
  if (start < 0) return [];
  let depth = 0, end = -1;
  for (let k = start; k < s.length && k < start + 60000; k++) {
    const ch = s[k];
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) {
      end = k;
      break;
    }
  }
  if (end < 0) return [];
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    return arr
      .map((t) => ({ name: decodeEntities(t?.name ?? ""), votes: Number(t?.count) || 0 }))
      .filter((t) => t.name)
      .sort((a, b) => b.votes - a.votes);
  } catch {
    return [];
  }
}

/** populartags JSON -> { "Roguelike": 1716, ... } (tolerates both array and object shapes). */
export function parsePopularTags(json) {
  const arr = Array.isArray(json) ? json : Array.isArray(json?.tags) ? json.tags : [];
  const out = {};
  for (const t of arr) {
    const id = Number(t?.tagid ?? t?.id);
    const name = t?.name;
    if (Number.isFinite(id) && id > 0 && typeof name === "string") out[name] = id;
  }
  return out;
}

/**
 * Merge store details + SteamSpy + search-row + reviews into one corpus game (the contract schema).
 * `fallbackTags` is a list of tag names (no votes known) used only if SteamSpy has none.
 */
export function buildGame({ store, spy = null, row = null, reviews = null, fallbackTags = [], storeTags = [], followers = null, fetchedAt = null }) {
  if (!store) return null;
  const spyTags = spy?.tags?.length ? spy.tags : [];
  let tags = spyTags;
  if (!tags.length && storeTags.length) tags = storeTags;
  if (!tags.length && fallbackTags.length) tags = fallbackTags.map((name) => ({ name, votes: 0 }));
  let rev = reviews;
  if (!rev && row && row.reviewTotal != null) rev = { total: row.reviewTotal, positivePct: row.reviewPct, scoreDesc: row.reviewDesc || reviewDesc(row.reviewTotal, row.reviewPct ?? 0) };
  if (!rev && spy && spy.totalReviews != null) rev = { total: spy.totalReviews, positivePct: spy.positivePct, scoreDesc: reviewDesc(spy.totalReviews, spy.positivePct ?? 0) };
  if (!rev && store.totalRecommendations != null) rev = { total: store.totalRecommendations, positivePct: null, scoreDesc: null };
  if (store.comingSoon) rev = null;
  const { releaseIso, totalRecommendations, ...rest } = store;
  return {
    ...rest,
    tags,
    reviews: rev ? { total: rev.total ?? null, positivePct: rev.positivePct ?? null, scoreDesc: rev.scoreDesc ?? null } : { total: null, positivePct: null, scoreDesc: null },
    followers: Number.isFinite(followers) ? followers : null,
    ownersRange: spy?.owners ?? null,
    ccu: spy?.ccu ?? null,
    fetchedAt: fetchedAt || new Date().toISOString(),
  };
}

/** Steam community group XML (steamcommunity.com/games/<appid>/memberslistxml/?xml=1) -> member (follower) count or null. */
export function parseMemberCount(xml) {
  const s = String(xml ?? "");
  const m = s.match(/<groupDetails>[\s\S]*?<memberCount>\s*(\d+)\s*<\/memberCount>/) || s.match(/<memberCount>\s*(\d+)\s*<\/memberCount>/);
  return m ? Number(m[1]) : null;
}

/** Pick `n` items spread evenly across a list (keeps variety when a list is sorted by popularity). */
export function pickEvenly(list, n) {
  if (n <= 0) return [];
  if (list.length <= n) return list.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]);
  return out;
}

/** Split a per-tag candidate target into upcoming / mid / hit shares. Indies come first: hits get the smallest share. */
export function bucketQuotas(perTag) {
  const hit = Math.max(1, Math.round(perTag * 0.15));
  const mid = Math.round(perTag * 0.4);
  return { hit, mid, upcoming: Math.max(0, perTag - hit - mid) };
}

/** Tags too generic to say what a game is about (used to pick a game's "specific" tags). */
export const GENERIC_TAGS = new Set(["indie", "singleplayer", "single-player", "action", "adventure", "casual", "2d", "3d", "great soundtrack", "atmospheric", "multiplayer", "simulation", "strategy", "rpg", "early access", "free to play", "colorful", "cute", "funny", "story rich", "controller", "first-person", "third person", "difficult", "replay value", "exploration"]);

/** Top `n` non-generic tag names of a game (tags are ordered by votes). */
export function specificTags(game, n = 3) {
  const names = (game?.tags || []).map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean);
  const specific = names.filter((t) => !GENERIC_TAGS.has(t.toLowerCase()));
  return (specific.length >= n ? specific : [...specific, ...names.filter((t) => !specific.includes(t))]).slice(0, n);
}

/** Does a search row describe a game that is not out yet? */
export function isUpcomingRow(row, now = new Date()) {
  if (!row) return false;
  if (!row.releaseIso) return true; // "Coming soon", "Q2 2027", "2027", "To be announced"
  return new Date(row.releaseIso + "T00:00:00Z").getTime() > now.getTime() + 86400000;
}

/**
 * Compact catalog entry (short keys, see CATALOG_KEYS): a appid, n name, u 1 = upcoming, t tag names (max 5),
 * p price in USD, d release date (ISO or Steam's text), r [reviews total, positive %].
 */
export const CATALOG_KEYS = { a: "appid", n: "name", u: "1 when the game is not released yet (omitted otherwise)", t: "up to 5 tag names, most voted first", p: "price in USD (omitted when unknown)", d: "release date: ISO yyyy-mm-dd or Steam's own text such as 'Q2 2027'", r: "[review total, positive %] (omitted when unknown)" };
export function catalogEntryFromRow(row, idToName, now = new Date()) {
  if (!row || !row.appid || !row.name) return null;
  const e = { a: row.appid, n: row.name };
  if (isUpcomingRow(row, now)) e.u = 1;
  const t = [...new Set((row.tagIds || []).map((id) => idToName.get(id)).filter(Boolean))].slice(0, 5);
  if (t.length) e.t = t;
  if (row.priceCents != null && row.priceCents >= 0) e.p = Math.round(row.priceCents) / 100;
  const d = row.releaseIso || row.releaseText;
  if (d) e.d = d;
  if (row.reviewTotal != null) e.r = [row.reviewTotal, row.reviewPct ?? null];
  return e;
}
export function catalogEntryFromGame(g) {
  const e = { a: g.appid, n: g.name };
  if (g.comingSoon) e.u = 1;
  const t = (g.tags || []).slice(0, 5).map((x) => x.name);
  if (t.length) e.t = t;
  if (g.priceUSD != null) e.p = g.priceUSD;
  if (g.releaseDate) e.d = g.releaseDate;
  if (g.reviews && g.reviews.total != null) e.r = [g.reviews.total, g.reviews.positivePct ?? null];
  return e;
}

/** Steam storesearch JSON (api/storesearch/?term=) -> [{appid, name}] (apps only). */
export function parseStoreSearch(json) {
  return (Array.isArray(json?.items) ? json.items : [])
    .filter((i) => i && (i.type === undefined || i.type === "app") && Number.isFinite(Number(i.id)) && i.name)
    .map((i) => ({ appid: Number(i.id), name: decodeEntities(i.name) }));
}
/** Steam search/suggest HTML -> [{appid, name}] */
export function parseSuggestHtml(html) {
  const out = [];
  for (const m of String(html ?? "").matchAll(/data-ds-appid="(\d+)"[\s\S]*?<div class="match_name">([\s\S]*?)<\/div>/g)) out.push({ appid: Number(m[1]), name: decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim() });
  return out;
}
/** Best result for a typed name: exact (normalized) match first, then prefix, then the first result. */
export function pickBestMatch(term, items) {
  const n = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const t = n(term);
  return items.find((i) => n(i.name) === t) || items.find((i) => n(i.name).startsWith(t)) || items[0] || null;
}

/** Is an ISO yyyy-mm-dd date within the last `years` years of `now`? */
export function isRecent(iso, years, now = new Date()) {
  if (!iso) return false;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return d >= cutoff && d <= new Date(now.getTime() + 2 * 86400000);
}
