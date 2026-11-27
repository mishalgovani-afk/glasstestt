// Pure parsers for Steam curator pages, YouTube RSS/API and tag-affinity maths. No network, no filesystem.
// Everything tolerates missing or renamed fields (returns empty values instead of throwing).
// Privacy: only public profile links are kept; mailto: links and anything that looks like an email address are dropped.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "...", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };

export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => chr(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => chr(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}
const chr = (n) => { try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; } catch { return ""; } };
export const textOf = (html) => decodeEntities(String(html ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const isoOrNull = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

/** Unix seconds (number or numeric string) or ISO string -> ISO string, else null. */
export function toIso(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d{9,11}$/.test(String(v))) return isoOrNull(new Date(Number(v) * 1000));
  const d = new Date(String(v));
  return isoOrNull(d);
}

/** Curator review dates: "22 September, 2014", "Nov 3, 2024", or "5 June" (no year = this year, or last year if that would be in the future). */
export function parseCuratorDate(str, now = new Date()) {
  const s = decodeEntities(str).replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})$/);
  let d, mo, y;
  if (m) { d = +m[1]; mo = mon(m[2]); y = +m[3]; }
  else if ((m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/))) { mo = mon(m[1]); d = +m[2]; y = +m[3]; }
  else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]{3,9})$/))) { d = +m[1]; mo = mon(m[2]); y = now.getUTCFullYear(); }
  else if ((m = s.match(/^([A-Za-z]{3,9}) (\d{1,2})$/))) { mo = mon(m[1]); d = +m[2]; y = now.getUTCFullYear(); }
  else return null;
  if (mo < 0 || !(d >= 1 && d <= 31)) return null;
  let t = new Date(Date.UTC(y, mo, d));
  if (!/\d{4}/.test(s) && t.getTime() > now.getTime() + 86400000) t = new Date(Date.UTC(y - 1, mo, d));
  return isoOrNull(t);
}
const mon = (n) => MONTHS.indexOf(String(n).slice(0, 3).toLowerCase());

/** Pull a JSON array literal that follows `marker =` out of a script/HTML blob (bracket matching, string aware). */
export function extractJsonArrayAfter(text, marker) {
  const s = String(text ?? "");
  const i = s.indexOf(marker);
  if (i < 0) return null;
  const start = s.indexOf("[", i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = start; k < s.length; k++) {
    const ch = s[k];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) {
      try { return JSON.parse(s.slice(start, k + 1)); } catch { return null; }
    }
  }
  return null;
}

const safeUrl = (u) => {
  try {
    const x = new URL(String(u));
    if (x.protocol !== "https:") return null;
    return x.toString();
  } catch { return null; }
};
const STEAM_HOSTS = /(^|\.)(steampowered\.com|steamcommunity\.com|steamstatic\.com|valvesoftware\.com|steam\.tv)$/i;
const isSteamUrl = (u) => { try { return STEAM_HOSTS.test(new URL(u).hostname); } catch { return false; } };

/** `https://steamcommunity.com/linkfilter/?u=<encoded>` -> the target https url (or the url itself). */
export function unwrapLinkfilter(href) {
  const h = decodeEntities(href).trim();
  const m = h.match(/linkfilter\/\?(?:url|u)=([^&"']+)/i);
  let target = h;
  if (m) { try { target = decodeURIComponent(m[1]); } catch { return null; } }
  if (/^mailto:/i.test(target) || /@[^/\s]+\.[a-z]{2,}$/i.test(target)) return null;
  if (/^http:\/\//i.test(target)) target = "https://" + target.slice(7); // most sites redirect http->https; we only keep https
  return safeUrl(target);
}

/** Friendly label for a public link. */
export function linkLabel(url, hint = "") {
  const h = String(hint).replace(/:.*$/, "").trim();
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  if (/youtube\.com|youtu\.be/.test(host)) return "YouTube";
  if (/twitch\.tv/.test(host)) return "Twitch";
  if (/(^|\.)x\.com$|twitter\.com/.test(host)) return "X / Twitter";
  if (/bsky\.app/.test(host)) return "Bluesky";
  if (/discord\.(gg|com)/.test(host)) return "Discord";
  if (/tiktok\.com/.test(host)) return "TikTok";
  if (/instagram\.com/.test(host)) return "Instagram";
  if (/facebook\.com/.test(host)) return "Facebook";
  if (/reddit\.com/.test(host)) return "Reddit";
  if (/patreon\.com/.test(host)) return "Patreon";
  if (/mastodon|\.social$/.test(host)) return "Mastodon";
  if (/kick\.com/.test(host)) return "Kick";
  return h && h.length < 24 ? h : host || "Website";
}

/** Links found in free text (curator descriptions): https URLs only, max 8, no Steam-internal links. */
export function linksFromText(text) {
  const out = [];
  const seen = new Set();
  const re = /https?:\/\/[^\s"'<>)\]]+/gi;
  for (const m of String(decodeEntities(text ?? "")).matchAll(re)) {
    const u = unwrapLinkfilter(m[0].replace(/[.,;!?]+$/, ""));
    if (!u || isSteamUrl(u) || seen.has(u)) continue;
    seen.add(u);
    out.push({ label: linkLabel(u), url: u });
    if (out.length >= 8) break;
  }
  return out;
}

const avatarUrl = (hash) => (typeof hash === "string" && /^[0-9a-f]{20,64}$/i.test(hash) ? `https://avatars.fastly.steamstatic.com/${hash}_full.jpg` : null);

/**
 * Steam curators directory (curators/ajaxgetcurators/render/ -> { results_html, total_count }) -> curator summaries.
 * The page carries its curators as `g_rgTopCurators = [ {clanID, name, link, total_followers, total_reviews, last_curation_date,
 * m_rgAppRecommendations:[{appid, recommendation_state, time_recommended, blurb, link_url}], ...} ]`.
 * Fallback: HTML rows with data-clanid.
 */
export function parseCuratorDirectory(body) {
  const html = typeof body === "string" ? body : String(body?.results_html ?? "");
  const arr = extractJsonArrayAfter(html, "g_rgTopCurators");
  let list = [];
  if (Array.isArray(arr)) {
    list = arr.map((c) => {
      const id = String(c?.clanID ?? c?.clanid ?? "").replace(/\D/g, "");
      if (!id) return null;
      const recent = (Array.isArray(c.m_rgAppRecommendations) ? c.m_rgAppRecommendations : [])
        .map((r) => ({ appid: num(r?.appid), verdict: [ "recommended", "not_recommended", "informational" ][r?.recommendation_state] || "recommended", date: toIso(r?.time_recommended), blurb: textOf(r?.blurb).slice(0, 200), link: safeUrl(r?.link_url) }))
        .filter((r) => r.appid);
      return {
        id,
        name: textOf(c.name),
        url: safeUrl(c.link) || `https://store.steampowered.com/curator/${id}/`,
        avatar: avatarUrl(c.strAvatarHash),
        followers: num(c.total_followers),
        reviews: num(c.total_reviews),
        lastActive: toIso(c.last_curation_date),
        description: textOf(c.curator_description).slice(0, 600),
        communityUrl: safeUrl(c.communityLink),
        recent,
      };
    }).filter(Boolean);
  }
  if (!list.length) {
    for (const m of html.matchAll(/data-clanid="(\d+)"[\s\S]{0,1500}?(?:<div class="name"[^>]*>|class="[^"]*curator_name[^"]*"[^>]*>)\s*([\s\S]*?)</g)) {
      list.push({ id: m[1], name: textOf(m[2]), url: `https://store.steampowered.com/curator/${m[1]}/`, avatar: null, followers: null, reviews: null, lastActive: null, description: "", communityUrl: null, recent: [] });
    }
  }
  const total = num(typeof body === "object" ? body?.total_count : null);
  return { curators: list, total };
}

/** Curator recommendations fragment (ajaxgetfilteredrecommendations) -> [{appid, name, verdict, date, blurb, link}] newest first. */
export function parseRecommendations(resultsHtml, now = new Date()) {
  const html = String(resultsHtml ?? "");
  const blocks = html.split(/(?=<div[^>]*class="recommendation"[^>]*>)/).filter((b) => /class="recommendation"/.test(b.slice(0, 300)));
  const out = [];
  for (const b of blocks) {
    const id = b.match(/data-ds-appid="(\d+)"/);
    if (!id) continue;
    const verdict = /color_not_recommended|ico_curator_down/.test(b) ? "not_recommended" : /color_informational|ico_curator_info/.test(b) ? "informational" : "recommended";
    const dateText = (b.match(/curator_review_date"?>([\s\S]*?)<\/span>/) || [])[1];
    const desc = (b.match(/recommendation_desc"?>([\s\S]*?)<\/div>/) || [])[1];
    const name = (b.match(/<img[^>]*\balt="([^"]*)"/) || [])[1];
    const link = (b.match(/recommendation_readmore[^>]*href="([^"]+)"/) || b.match(/href="([^"]+)"[^>]*recommendation_readmore/) || b.match(/class="recommendation_link"[^>]*href="([^"]+)"/) || b.match(/href="([^"]+)"[^>]*class="recommendation_link"/) || [])[1];
    out.push({
      appid: Number(id[1]),
      name: name ? decodeEntities(name).trim() : "",
      verdict,
      date: dateText ? parseCuratorDate(textOf(dateText), now) : null,
      blurb: textOf(desc).slice(0, 300),
      link: link ? safeUrl(decodeEntities(link).replace(/\?.*$/, "")) : null,
    });
  }
  return out;
}

/** Curator store page -> { name, followers, avatar, links } where links are only those the curator publishes in their header. */
export function parseCuratorPage(html) {
  const s = String(html ?? "");
  const name = textOf((s.match(/class="pageheader curator_name"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || s.match(/curator_name[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
  const fol = s.match(/CuratorNumFollowers_\d+"[^>]*>\s*([\d,.\s]+)\s*</);
  const avatar = safeUrl((s.match(/class="curator_avatar"[^>]*\ssrc="([^"]+)"/) || s.match(/class="curator_avatar" src="([^"]+)"/) || [])[1]);
  const links = [];
  const seen = new Set();
  for (const blk of s.matchAll(/<div[^>]*class="[^"]*socialmedia_accounts[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
    for (const a of blk[1].matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const u = unwrapLinkfilter(a[1]);
      if (!u || isSteamUrl(u) || seen.has(u)) continue;
      seen.add(u);
      const alt = (a[2].match(/alt="([^"]*)"/) || [])[1] || textOf(a[2]);
      links.push({ label: linkLabel(u, decodeEntities(alt || "")), url: u });
    }
  }
  const group = (s.match(/g_strCuratorCommunityBaseURL = "([^"]+)"/) || [])[1];
  return { name, followers: fol ? num(fol[1].replace(/[^\d]/g, "")) : null, avatar, links: links.slice(0, 10), communityUrl: group ? safeUrl(group.replace(/\\\//g, "/")) : null };
}

// ---------------------------------------------------------------- YouTube

/** A YouTube URL -> { kind: "channel"|"handle"|"user"|"custom", value } or null. */
export function parseYouTubeUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] || "")) return { kind: "channel", value: parts[1] };
  if (parts[0].startsWith("@") && parts[0].length > 1) return { kind: "handle", value: parts[0] };
  if (parts[0] === "user" && parts[1]) return { kind: "user", value: parts[1] };
  if (parts[0] === "c" && parts[1]) return { kind: "custom", value: parts[1] };
  return null;
}

/** Channel page HTML -> UC… channel id, or null. */
export function parseChannelIdFromHtml(html) {
  const s = String(html ?? "");
  const m = s.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
    s.match(/"externalId":"(UC[\w-]{22})"/) || s.match(/"channelId":"(UC[\w-]{22})"/) ||
    s.match(/youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/) || s.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

/** YouTube channel RSS feed XML -> { channelId, title, url, entries:[{videoId, title, published, link, views}] }. */
export function parseYouTubeFeed(xml) {
  const s = String(xml ?? "");
  const head = s.split(/<entry>/)[0];
  const channelId = (s.match(/<yt:channelId>(UC[\w-]{22})<\/yt:channelId>/) || s.match(/<id>yt:channel:(UC[\w-]{22})<\/id>/) || [])[1] || null;
  const title = textOf((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  const entries = [];
  for (const m of s.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = (e.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
    if (!videoId) continue;
    entries.push({
      videoId,
      title: textOf((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
      published: toIso((e.match(/<published>([^<]+)<\/published>/) || [])[1]),
      link: `https://www.youtube.com/watch?v=${videoId}`,
      views: num((e.match(/<media:statistics[^>]*\sviews="(\d+)"/) || [])[1]),
    });
  }
  return { channelId, title, url: channelId ? `https://www.youtube.com/channel/${channelId}` : null, entries };
}

/** Uploads per month from feed entries (needs two or more entries). */
export function uploadsPerMonth(entries) {
  const ts = entries.map((e) => Date.parse(e.published || "")).filter(Number.isFinite).sort((a, b) => b - a);
  if (ts.length < 2) return null;
  const spanDays = Math.max(7, (ts[0] - ts[ts.length - 1]) / 86400000);
  return Math.round(((ts.length - 1) / spanDays) * 30.4 * 10) / 10;
}

export function averageViews(entries) {
  const v = entries.map((e) => e.views).filter((x) => Number.isFinite(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** YouTube Data API v3 search.list response -> [{videoId, channelId, channelTitle, title, published}]. */
export function parseYtSearch(json) {
  return (Array.isArray(json?.items) ? json.items : []).map((i) => ({
    videoId: i?.id?.videoId, channelId: i?.snippet?.channelId, channelTitle: textOf(i?.snippet?.channelTitle),
    title: textOf(i?.snippet?.title), published: toIso(i?.snippet?.publishedAt),
  })).filter((x) => x.videoId && /^UC[\w-]{22}$/.test(x.channelId || ""));
}
/** channels.list (part=snippet,statistics) -> { [channelId]: {title, avatar, subscribers, language, customUrl} }. */
export function parseYtChannels(json) {
  const out = {};
  for (const i of Array.isArray(json?.items) ? json.items : []) {
    if (!i?.id) continue;
    const th = i.snippet?.thumbnails;
    out[i.id] = {
      title: textOf(i.snippet?.title),
      avatar: safeUrl(th?.medium?.url || th?.default?.url),
      subscribers: i.statistics?.hiddenSubscriberCount ? null : num(i.statistics?.subscriberCount),
      language: i.snippet?.defaultLanguage || null,
      customUrl: typeof i.snippet?.customUrl === "string" ? i.snippet.customUrl : null,
    };
  }
  return out;
}
/** videos.list (part=statistics) -> { [videoId]: views }. */
export function parseYtVideos(json) {
  const out = {};
  for (const i of Array.isArray(json?.items) ? json.items : []) if (i?.id) out[i.id] = num(i.statistics?.viewCount);
  return out;
}

// ---------------------------------------------------------------- game matching + tag affinity

export const normTitle = (s) => ` ${String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Index of games for matching video titles. Names that are too short or generic are skipped to avoid false hits. */
export function buildGameIndex(games) {
  const list = [];
  for (const g of games) {
    const n = normTitle(g.name);
    const t = n.trim();
    if (t.length < 5 && !/\s/.test(t)) continue; // "Sky", "Rust" are too ambiguous
    if (t.length < 4) continue;
    list.push({ appid: g.appid, name: g.name, norm: n, len: t.length });
  }
  list.sort((a, b) => b.len - a.len); // longest name first, so "Hades II" wins over "Hades"
  return list;
}

/** Games mentioned in a video title (whole-phrase match on normalized text), longest names first, max 2. */
export function matchGamesInTitle(title, index) {
  const t = normTitle(title);
  const found = [];
  let rest = t;
  for (const g of index) {
    if (rest.includes(g.norm)) {
      found.push(g);
      rest = rest.replace(g.norm, " ");
      if (found.length >= 2) break;
    }
  }
  return found;
}

/**
 * Tag affinity 0..1: for each covered game that has tags, its top-N tags get a weight falling with rank; weights are
 * averaged over covered games (so breadth of coverage matters) and scaled so the strongest tag is 1.
 * `gamesByAppid` maps appid -> { tags: [string] } (ordered by votes). Generic tags are damped.
 */
const GENERIC_TAGS = new Set(["indie", "singleplayer", "action", "adventure", "casual", "2d", "3d", "great soundtrack", "atmospheric", "funny", "colorful", "cute", "controller", "early access", "free to play", "multiplayer", "simulation", "strategy", "rpg"]);
export function buildTagAffinity(coveredGames, gamesByAppid, { topN = 10, keep = 25 } = {}) {
  const acc = new Map();
  let counted = 0;
  const seen = new Set();
  for (const c of coveredGames) {
    if (c.appid == null || seen.has(c.appid)) continue;
    seen.add(c.appid);
    const g = gamesByAppid.get ? gamesByAppid.get(c.appid) : gamesByAppid[c.appid];
    if (!g || !Array.isArray(g.tags) || !g.tags.length) continue;
    counted++;
    g.tags.slice(0, topN).forEach((tag, i) => {
      const w = (1 - i / (topN + 2)) * (GENERIC_TAGS.has(String(tag).toLowerCase()) ? 0.35 : 1);
      acc.set(tag, (acc.get(tag) || 0) + w);
    });
  }
  if (!counted) return {};
  const arr = [...acc.entries()].map(([t, w]) => [t, w / counted]).sort((a, b) => b[1] - a[1]).slice(0, keep);
  const max = arr[0]?.[1] || 1;
  return Object.fromEntries(arr.map(([t, w]) => [t, Math.round((w / max) * 100) / 100]));
}

/** Choose which curators to crawl in depth: those covering corpus games first, recent ones next, with room kept for small ones. */
export function selectCurators(list, corpusIds, max, now = new Date()) {
  const recentMs = 365 * 86400000;
  const scored = list.filter((c) => c.id).map((c) => {
    const last = Date.parse(c.lastActive || "") || 0;
    const active = last && now.getTime() - last < recentMs;
    const overlap = c.recent.filter((r) => corpusIds.has(r.appid)).length;
    return { c, active, overlap, score: overlap * 6 + (active ? 3 : 0) + Math.min(2, Math.log10((c.followers || 0) + 1) / 3) };
  }).filter((x) => x.active || x.overlap > 0);
  scored.sort((a, b) => b.score - a.score);
  const pickedBig = scored.slice(0, Math.ceil(max * 0.6));
  const chosen = new Set(pickedBig.map((x) => x.c.id));
  // reserve the rest for small/long-tail curators (lowest follower counts among the active ones), still best score first
  const rest = scored.filter((x) => !chosen.has(x.c.id)).sort((a, b) => (a.c.followers || 0) - (b.c.followers || 0) || b.score - a.score);
  const small = pickEvenlyList(rest, max - pickedBig.length);
  return [...pickedBig, ...small].map((x) => x.c);
}
function pickEvenlyList(list, n) {
  if (n <= 0) return [];
  if (list.length <= n) return list.slice();
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}
