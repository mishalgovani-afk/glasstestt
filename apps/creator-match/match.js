// Creator Match engine: ranks creators for a game, drafts pitches, and summarises outreach.
// Pure functions only: no DOM, no network, no globals. Runs in the browser and in Node 22.
// Every input may have missing or malformed fields; nothing here should throw on bad data.

const DAY = 86400000;

// ---------------------------------------------------------------------------
// Outreach guide: what the ranking and pitch rules are based on.
// ---------------------------------------------------------------------------

export const GUIDE = {
  principles: [
    {
      title: "Target creators who already play games like yours",
      body: "List the games most similar to yours, find every creator who covered them, and pitch those people. Firing a generic email at the top 50 streamers yields almost nothing. This is why coverage of similar games is the largest part of the score.",
      sourceUrl: "https://howtomarketagame.com/2021/07/12/how-to-market-your-indie-game-a-10-step-plan/",
    },
    {
      title: "Small, active channels reply far more often",
      body: "One indie campaign to 200 streamers with the same pitch got a 25% reply rate from channels under 20K subscribers that were actively posting, and 0.5% from channels above 50K (a single, vendor-reported case). Small and mid-size tiers score highest by default.",
      sourceUrl: "https://gameoutreach.co/blog/youtuber-outreach-email-template/",
    },
    {
      title: "Recency and activity matter",
      body: "A creator who covered a similar game last month is a much better bet than one who covered it two years ago or has stopped uploading. Coverage counts for less as it ages (half-life 60 days) and inactive creators are filtered out by default (90 days).",
      sourceUrl: "https://gameoutreach.co/blog/how-to-find-youtubers-to-play-your-indie-game/",
    },
    {
      title: "Send the key unprompted, and keep it short",
      body: "Don't make creators ask for a key: send it with the first email. Keep the note short, polite and direct, and say which games yours is most similar to. Ignore unsolicited key requests from unknown 'streamers'; many are key resellers.",
      sourceUrl: "https://howtomarketagame.com/2023/03/28/will-your-games-be-marketed-by-chat-gpt/",
    },
    {
      title: "Use Steam Curator Connect for curators",
      body: "Curator Connect sends a license straight to a verified curator inside Steam, so no key can be resold, and a dashboard shows which copies were accepted. It needs a public 'coming soon' page and the Generate CD Keys permission. Pick 20 to 30 relevant curators rather than hundreds.",
      sourceUrl: "https://partner.steamgames.com/doc/marketing/curators",
    },
    {
      title: "Re-contact people who covered you before",
      body: "A GDC talk reported that re-contacting creators who had already covered a game converted at about seven times the rate of cold outreach, while mass key distribution used 91% of keys for 8% of views. Creators who already covered your game are flagged and boosted.",
      sourceUrl: "https://labs.invenglobal.com/articles/25451/blinded-code-blast-to-streamers-fail-proof-creator-campaign-strategies",
    },
    {
      title: "Follow up once, then move on",
      body: "Guides agree on one follow-up about a week after the first email (or a day or two before the embargo lifts, whichever is sooner), then stop. The pipeline lists contacts pitched more than 7 days ago with no reply.",
      sourceUrl: "https://presskit.gg/field-guides/how-to-write-press-email-indie-game",
    },
    {
      title: "Start early: coverage builds over weeks",
      body: "Don't wait for the week before launch. Coverage tends to snowball as creators see each other play a game, so start with a few pitches a day, months ahead, with a demo if you have one.",
      sourceUrl: "https://howtomarketagame.com/2020/02/09/how-to-talk-to-streamers/",
    },
    {
      title: "Creators must disclose free keys",
      body: "Under FTC guidance a free game is a material connection and must be disclosed, even with no strings attached. In a video the disclosure belongs in the video, not just the description, and in a livestream it should be repeated periodically. Remind creators politely; never ask for positive coverage.",
      sourceUrl: "https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers",
    },
  ],
  pitchDos: [
    { text: "Write to one person. Use their name and mention a specific recent video or review of a similar game.", sourceUrl: "https://howtomarketagame.com/2021/07/12/how-to-market-your-indie-game-a-10-step-plan/" },
    { text: "Keep it under about 150 words: hook, why it suits them, key, dates, one clear ask.", sourceUrl: "https://howtomarketagame.com/2020/02/09/how-to-talk-to-streamers/" },
    { text: "Include the Steam key (or a Curator Connect offer) in the first email. Don't make them ask.", sourceUrl: "https://howtomarketagame.com/2023/03/28/will-your-games-be-marketed-by-chat-gpt/" },
    { text: "Give the embargo or launch date, and ask politely: you can't enforce an embargo.", sourceUrl: "https://indiegamesplus.com/the-indiegamesplus-guide-to-contacting-games-press/" },
    { text: "Link a finished press kit and trailer instead of attaching files.", sourceUrl: "https://presskit.gg/field-guides/how-to-get-press-coverage-indie-game" },
    { text: "Put the game and its genre in the subject line, not a generic call to action.", sourceUrl: "https://presskit.gg/field-guides/how-to-write-press-email-indie-game" },
    { text: "Follow up once, about a week later, then move on.", sourceUrl: "https://presskit.gg/field-guides/how-to-write-press-email-indie-game" },
    { text: "Say there is no obligation, and ask creators to disclose that the key was free.", sourceUrl: "https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers" },
  ],
  pitchDonts: [
    { text: "No mass mail: never put a list of creators in To or CC, and don't blast hundreds of curators.", sourceUrl: "https://www.steampageanalyzer.com/blog/steam-curators-guide-developers" },
    { text: "No fake flattery ('I'm a huge fan!') or invented facts. Reference real coverage or say nothing.", sourceUrl: "https://gameoutreach.co/blog/youtuber-outreach-email-template/" },
    { text: "Don't attach big files; link them.", sourceUrl: "https://presskit.gg/field-guides/how-to-get-press-coverage-indie-game" },
    { text: "Don't chase repeatedly or guilt-trip ('why didn't you cover my game?').", sourceUrl: "https://indiegamesplus.com/the-indiegamesplus-guide-to-contacting-games-press/" },
    { text: "Don't hand keys to anyone who asks; verify the channel first, or use Curator Connect.", sourceUrl: "https://howtomarketagame.com/2023/03/28/will-your-games-be-marketed-by-chat-gpt/" },
    { text: "Don't ask for a positive review, or ask a creator to hide that the key was free.", sourceUrl: "https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers" },
  ],
};

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** Points per component; they add up to 100. */
export const WEIGHTS = Object.freeze({ affinity: 30, coverage: 25, activity: 15, size: 15, engagement: 10, language: 5 });

/** Follower thresholds: a creator is in the first tier whose `max` exceeds their followers. */
export const SIZE_TIERS = Object.freeze([
  { tier: "micro", max: 10000, label: "Micro (under 10K)" },
  { tier: "small", max: 50000, label: "Small (10K to 50K)" },
  { tier: "mid", max: 250000, label: "Mid (50K to 250K)" },
  { tier: "large", max: Infinity, label: "Large (250K+)" },
]);

/** Default size fit for a small publisher: reachable tiers score higher. 0..1. */
export const DEFAULT_SIZE_WEIGHTS = Object.freeze({ micro: 0.8, small: 1, mid: 0.65, large: 0.25, unknown: 0.5 });

// avgViews / followers that counts as "full marks" engagement, per platform.
// Twitch avgViews is usually average concurrent viewers, so its healthy ratio is much lower.
const ENGAGEMENT_BENCHMARK = { youtube: 0.15, twitch: 0.03, "steam-curator": 0.05 };

const PLATFORM_ALIASES = {
  youtube: "youtube", youtuber: "youtube", yt: "youtube",
  "steam-curator": "steam-curator", curator: "steam-curator", steam: "steam-curator", "steam curator": "steam-curator",
  twitch: "twitch", streamer: "twitch",
};

const LANG_NAMES = {
  english: "en", german: "de", deutsch: "de", french: "fr", "français": "fr", francais: "fr", spanish: "es", "español": "es",
  espanol: "es", portuguese: "pt", "português": "pt", "brazilian portuguese": "pt", "portuguese - brazil": "pt",
  russian: "ru", italian: "it", polish: "pl", japanese: "ja", korean: "ko", chinese: "zh", "simplified chinese": "zh",
  "traditional chinese": "zh", turkish: "tr", dutch: "nl", swedish: "sv", ukrainian: "uk", czech: "cs", thai: "th",
  vietnamese: "vi", indonesian: "id", arabic: "ar", finnish: "fi", danish: "da", norwegian: "no", hungarian: "hu",
};

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lc = (s) => str(s).trim().toLowerCase();

function toTime(v) {
  if (v == null || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** "en", "en-US", "English" → "en". Unknown → lowercased input, empty → null. */
export function normalizeLanguage(v) {
  const s = lc(v);
  if (!s) return null;
  if (LANG_NAMES[s]) return LANG_NAMES[s];
  const m = /^([a-z]{2,3})(?:[-_][a-z0-9]+)*$/.exec(s);
  return m ? m[1] : s;
}

/** "curator", "YouTuber", "Twitch" → contract platform ids. Unknown → null. */
export function normalizePlatform(v) {
  return PLATFORM_ALIASES[lc(v)] || null;
}

/** Size tier from followers; "unknown" (not in the contract's list) only via `sizeKnown: false`. */
export function sizeTierOf(followers, tiers = SIZE_TIERS) {
  const f = num(followers);
  if (f == null || f < 0) return null;
  for (const t of tiers) if (f < t.max) return t.tier;
  return tiers[tiers.length - 1].tier;
}

/** 42300 → "42K", 1250000 → "1.3M", 950 → "950". */
export function formatCount(n) {
  const v = num(n);
  if (v == null) return "?";
  const a = Math.abs(v);
  if (a >= 1e6) return `${trimNum(v / 1e6)}M`;
  if (a >= 1e3) return `${trimNum(v / 1e3)}K`;
  return String(Math.round(v));
}
function trimNum(x) {
  const r = Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
  return String(r);
}

// Tag weights by position: first tag 1.0, then -0.1 per place, floor 0.2.
function tagWeights(tags) {
  const out = new Map();
  arr(tags).forEach((t, i) => {
    const k = lc(typeof t === "object" && t ? t.name : t);
    if (k && !out.has(k)) out.set(k, Math.max(0.2, 1 - 0.1 * out.size));
  });
  return out;
}

function gameTagsOf(g) {
  return arr(g && g.tags).map((t) => lc(typeof t === "object" && t ? t.name : t)).filter(Boolean);
}

// Index of data.games by appid and by lowercased name.
function buildGameIndex(data) {
  const byId = new Map();
  const byName = new Map();
  for (const g of arr(data && data.games)) {
    if (!g || typeof g !== "object") continue;
    const tags = gameTagsOf(g);
    if (num(g.appid) != null) byId.set(g.appid, tags);
    const n = lc(g.name);
    if (n && !byName.has(n)) byName.set(n, tags);
  }
  return { byId, byName };
}

function prepareTarget(target) {
  const t = target && typeof target === "object" ? target : {};
  const weights = tagWeights(t.tags);
  let total = 0;
  for (const w of weights.values()) total += w;
  return {
    name: str(t.name).trim(),
    appid: num(t.appid),
    nameKey: lc(t.name),
    weights,
    total,
    tagNames: arr(t.tags).map((x) => str(typeof x === "object" && x ? x.name : x).trim()).filter(Boolean),
    language: normalizeLanguage(t.language),
  };
}

function similarity(tags, tgt) {
  if (!tgt.total || !tags.length) return { sim: 0, shared: [] };
  let s = 0;
  const shared = [];
  const seen = new Set();
  for (const k of tags) {
    if (seen.has(k)) continue;
    seen.add(k);
    const w = tgt.weights.get(k);
    if (w) { s += w; shared.push(k); }
  }
  shared.sort((a, b) => tgt.weights.get(b) - tgt.weights.get(a));
  return { sim: s / tgt.total, shared };
}

const MATCH_THRESHOLD = 0.25; // a covered game counts as "similar" at ≥ 25% weighted tag overlap
const COVERAGE_HALF_LIFE = 60; // days
const COVERAGE_CAP = 2; // Σ similarity × recency is capped here, then divided by it

function matchGames(creator, tgt, index, now) {
  const out = [];
  let coveredTarget = null;
  for (const g of arr(creator.coveredGames)) {
    if (!g || typeof g !== "object") continue;
    const appid = num(g.appid);
    const isTarget = (tgt.appid != null && appid === tgt.appid) || (!!tgt.nameKey && lc(g.name) === tgt.nameKey);
    const tags = g.tags ? gameTagsOf(g) : (appid != null && index.byId.get(appid)) || index.byName.get(lc(g.name)) || [];
    const { sim, shared } = similarity(tags, tgt);
    const t = toTime(g.date);
    const daysAgo = t == null ? null : Math.max(0, Math.floor((now - t) / DAY));
    const recency = daysAgo == null ? 0.3 : Math.pow(0.5, daysAgo / COVERAGE_HALF_LIFE);
    const m = {
      appid, name: str(g.name), title: str(g.title), url: str(g.url), date: g.date || null,
      views: num(g.views), daysAgo, similarity: Math.round(sim * 100) / 100, sharedTags: shared, isTarget,
      weight: (isTarget ? 1 : sim) * recency,
    };
    if (isTarget) { if (!coveredTarget || m.weight > coveredTarget.weight) coveredTarget = m; continue; }
    if (sim >= MATCH_THRESHOLD) out.push(m);
  }
  out.sort((a, b) => b.weight - a.weight || (b.views || 0) - (a.views || 0) || a.name.localeCompare(b.name));
  return { matched: out, coveredTarget };
}

function lastActiveTime(creator, matchedAll) {
  const t = toTime(creator.lastActive);
  if (t != null) return t;
  let best = null;
  for (const g of arr(creator.coveredGames)) {
    const d = toTime(g && g.date);
    if (d != null && (best == null || d > best)) best = d;
  }
  return best;
}

function affinityScore(creator, tgt, matched) {
  // Explicit tagAffinity first; fall back to how often the tag shows up in similar coverage.
  const aff = creator.tagAffinity && typeof creator.tagAffinity === "object" ? creator.tagAffinity : {};
  const affLc = new Map();
  for (const [k, v] of Object.entries(aff)) { const n = num(v); if (n != null) affLc.set(lc(k), clamp01(n)); }
  const tagCounts = new Map();
  for (const g of matched) for (const k of g.sharedTags) tagCounts.set(k, (tagCounts.get(k) || 0) + 1);
  const covered = Math.max(1, arr(creator.coveredGames).length);
  let s = 0;
  const parts = [];
  for (const [k, w] of tgt.weights) {
    const a = Math.max(affLc.get(k) || 0, clamp01((tagCounts.get(k) || 0) / covered));
    if (a > 0) { s += w * a; parts.push({ tag: k, value: a, contrib: w * a }); }
  }
  parts.sort((x, y) => y.contrib - x.contrib);
  return { value: tgt.total ? clamp01(s / tgt.total) : 0, parts };
}

function platformList(p) {
  if (p == null || p === "" || p === "all" || p === "any") return null;
  const list = (Array.isArray(p) ? p : [p]).map(normalizePlatform).filter(Boolean);
  return list.length ? new Set(list) : null;
}

/**
 * Rank creators for a target game.
 * Score (0..100) = 30 × tag affinity + 25 × similar coverage + 15 × activity + 15 × size fit
 *                 + 10 × engagement + 5 × language, each component 0..1 (see `breakdown`).
 * Options: platform (string or array), minFollowers, maxFollowers, language, activeWithinDays = 90 (0/null = off),
 *   sizeWeights {micro, small, mid, large, unknown}, now (ms or ISO), limit, excludeIds (array/Set), includeIrrelevant.
 */
export function rankCreators(target, data, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const tgt = prepareTarget(target);
  const index = buildGameIndex(data);
  const now = referenceTime(data, opts.now);
  const platforms = platformList(opts.platform);
  const minF = num(opts.minFollowers);
  const maxF = num(opts.maxFollowers);
  const wantLang = normalizeLanguage(opts.language) || null;
  const activeDays = opts.activeWithinDays === undefined ? 90 : num(opts.activeWithinDays);
  const sizeW = { ...DEFAULT_SIZE_WEIGHTS, ...(opts.sizeWeights && typeof opts.sizeWeights === "object" ? opts.sizeWeights : {}) };
  const exclude = opts.excludeIds instanceof Set ? opts.excludeIds : new Set(arr(opts.excludeIds));
  const results = [];

  for (const creator of arr(data && data.creators)) {
    if (!creator || typeof creator !== "object") continue;
    if (exclude.has(creator.id)) continue;
    const platform = normalizePlatform(creator.platform) || lc(creator.platform) || null;
    if (platforms && !platforms.has(platform)) continue;
    const followers = num(creator.followers);
    if (followers != null && minF != null && followers < minF) continue;
    if (followers != null && maxF != null && followers > maxF) continue;
    const lang = normalizeLanguage(creator.language);
    if (wantLang && lang && lang !== wantLang) continue;
    const lastT = lastActiveTime(creator);
    const inactiveDays = lastT == null ? null : Math.max(0, Math.floor((now - lastT) / DAY));
    if (activeDays && inactiveDays != null && inactiveDays > activeDays) continue;

    const { matched, coveredTarget } = matchGames(creator, tgt, index, now);
    const affinity = affinityScore(creator, tgt, matched);
    if (!opts.includeIrrelevant && affinity.value === 0 && !matched.length && !coveredTarget) continue;

    // Components, each 0..1.
    let covSum = 0;
    for (const m of matched) covSum += m.weight;
    if (coveredTarget) covSum += coveredTarget.weight + 0.5; // past coverers convert best
    const coverage = clamp01(covSum / COVERAGE_CAP);

    const upm = num(creator.uploadsPerMonth);
    const recentPart = inactiveDays == null ? 0.4 : Math.pow(0.5, inactiveDays / 45);
    const uploadPart = upm == null ? 0.4 : clamp01(upm / 8);
    const activity = 0.6 * recentPart + 0.4 * uploadPart;

    const tier = sizeTierOf(followers);
    const size = clamp01(num(sizeW[tier || "unknown"]) ?? 0.5);

    const avgViews = num(creator.avgViews);
    const ratio = avgViews != null && followers ? avgViews / followers : null;
    const bench = ENGAGEMENT_BENCHMARK[platform] || 0.1;
    const engagement = ratio == null ? 0.5 : clamp01(ratio / bench);

    const wantL = wantLang || tgt.language;
    const language = !wantL ? 1 : !lang ? 0.5 : lang === wantL ? 1 : 0;

    const breakdown = {
      affinity: round1(WEIGHTS.affinity * affinity.value),
      coverage: round1(WEIGHTS.coverage * coverage),
      activity: round1(WEIGHTS.activity * activity),
      size: round1(WEIGHTS.size * size),
      engagement: round1(WEIGHTS.engagement * engagement),
      language: round1(WEIGHTS.language * language),
    };
    const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    const matchedGames = (coveredTarget ? [coveredTarget, ...matched] : matched).map(publicMatch);
    results.push({
      creator,
      score,
      reasons: buildReasons({ creator, tgt, matched, coveredTarget, affinity, followers, avgViews, ratio, tier, inactiveDays, upm, platform, lang, wantL }),
      matchedGames,
      sizeTier: tier || "micro",
      sizeKnown: tier != null,
      coveredTarget: !!coveredTarget,
      breakdown,
      _raw: raw,
    });
  }

  results.sort((a, b) => b._raw - a._raw || (num(b.creator.followers) || 0) - (num(a.creator.followers) || 0)
    || str(a.creator.id).localeCompare(str(b.creator.id)));
  const limit = num(opts.limit);
  const out = limit != null && limit >= 0 ? results.slice(0, limit) : results;
  for (const r of out) delete r._raw;
  return out;
}

function round1(x) { return Math.round(x * 10) / 10; }

function referenceTime(data, now) {
  const t = toTime(now);
  if (t != null) return t;
  // A sample snapshot is frozen in time: measure "recent" against when it was made.
  if (data && data.source === "sample") { const g = toTime(data.generatedAt); if (g != null) return g; }
  return Date.now();
}

function publicMatch(m) {
  return { appid: m.appid, name: m.name, title: m.title, url: m.url, date: m.date, views: m.views, daysAgo: m.daysAgo,
    similarity: m.isTarget ? 1 : m.similarity, sharedTags: m.sharedTags, isTarget: m.isTarget };
}

function displayTag(tgt, key) {
  return tgt.tagNames.find((n) => lc(n) === key) || key;
}

function plural(n, one, many) { return n === 1 ? one : many; }

function buildReasons(c) {
  const { tgt, matched, coveredTarget, affinity, followers, avgViews, ratio, tier, inactiveDays, upm, platform, lang, wantL } = c;
  const reasons = [];
  const verb = platform === "steam-curator" ? "Reviewed" : platform === "twitch" ? "Streamed" : "Covered";

  if (coveredTarget) {
    const when = coveredTarget.daysAgo == null ? "" : ` ${coveredTarget.daysAgo} days ago`;
    reasons.push(`Already covered ${tgt.name || coveredTarget.name}${when}${coveredTarget.views != null ? ` (${formatCount(coveredTarget.views)} views)` : ""}: re-contact first`);
  }
  if (matched.length) {
    let windowDays = 60;
    let inWindow = matched.filter((m) => m.daysAgo != null && m.daysAgo <= 60);
    if (!inWindow.length) { windowDays = 180; inWindow = matched.filter((m) => m.daysAgo != null && m.daysAgo <= 180); }
    const list = inWindow.length ? inWindow : matched;
    const top = list[0];
    // Name the shared genre if every listed game shares the target's top shared tag.
    const firstTag = top.sharedTags[0];
    const allShare = firstTag && list.every((m) => m.sharedTags.includes(firstTag));
    const label = allShare ? `${displayTag(tgt, firstTag)} ${plural(list.length, "game", "games")}` : `similar ${plural(list.length, "game", "games")}`;
    const span = inWindow.length ? ` in the last ${windowDays} days` : top.daysAgo != null ? `, latest ${top.daysAgo} days ago` : "";
    const views = top.views != null ? ` (${formatCount(top.views)} views)` : "";
    reasons.push(`${verb} ${list.length} ${label}${span}, incl. '${top.name || top.title}'${views}`);
  }
  if (affinity.parts.length) {
    const tags = affinity.parts.slice(0, 2).map((p) => `${displayTag(tgt, p.tag)} ${Math.round(p.value * 100)}%`).join(", ");
    reasons.push(`Tag fit ${Math.round(affinity.value * 100)}%: ${tags}`);
  }
  if (followers != null) {
    const tierName = tier ? tier[0].toUpperCase() + tier.slice(1) : "";
    const unit = platform === "youtube" ? "subscribers" : "followers";
    let s = `${tierName} ${platform === "steam-curator" ? "curator" : "channel"}: ${formatCount(followers)} ${unit}`;
    if (avgViews != null) s += `, avg ${formatCount(avgViews)} ${platform === "twitch" ? "viewers" : "views"}${ratio != null ? ` (${Math.round(ratio * 100)}% of ${unit})` : ""}`;
    reasons.push(s);
  } else {
    reasons.push("Follower count unknown");
  }
  if (reasons.length < 4) {
    const bits = [];
    if (inactiveDays != null) bits.push(inactiveDays === 0 ? "Active today" : `Active ${inactiveDays} ${plural(inactiveDays, "day", "days")} ago`);
    if (upm != null) bits.push(`~${Math.round(upm * 10) / 10} uploads/month`);
    if (bits.length) reasons.push(bits.join(", "));
  }
  if (reasons.length < 4 && wantL && lang && lang !== wantL) reasons.push(`Language: ${lang} (target ${wantL})`);
  if (reasons.length < 2) reasons.push("No similar coverage found");
  return reasons.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Pitches
// ---------------------------------------------------------------------------

export const PITCH_WORD_LIMIT = 150;
export const TONES = ["friendly", "professional", "brief"];

// Remote strings go into the pitch as plain text. Brackets are reserved for our placeholders.
function clean(s, maxWords = 14) {
  const t = str(s).replace(/[\[\]{}<>]/g, "").replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : t;
}

function joinAnd(list) {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function firstName(name) {
  const n = clean(name, 4);
  return n || "there";
}

/**
 * Draft a short, specific pitch. Unknowns stay as [bracketed placeholders] for the user to fill in.
 * options: publisher, keyOffer = true, tone = "friendly"|"professional"|"brief", senderName, steamKey,
 *   launchDate, embargoDate, pressKitUrl, steamUrl, hook, matchedGames (from rankCreators), data (to find matches).
 * Returns { subject, body, wordCount, placeholders }.
 */
export function draftPitch(creator, target, options = {}) {
  const o = options && typeof options === "object" ? options : {};
  const c = creator && typeof creator === "object" ? creator : {};
  const t = target && typeof target === "object" ? target : {};
  const tone = TONES.includes(o.tone) ? o.tone : "friendly";
  const platform = normalizePlatform(c.platform) || "youtube";
  const game = clean(t.name, 8) || "[game name]";
  const publisher = clean(o.publisher, 6) || "[publisher]";
  const sender = clean(o.senderName, 4) || "[your name]";
  const launch = clean(o.launchDate || t.launchDate || t.releaseDate, 6) || "[launch date]";
  const embargo = clean(o.embargoDate || t.embargoDate, 6) || "[embargo date]";
  const pressKit = httpsOrNull(o.pressKitUrl || t.pressKitUrl) || "[press kit link]";
  const steamUrl = httpsOrNull(o.steamUrl || t.url) || (num(t.appid) != null ? `https://store.steampowered.com/app/${t.appid}/` : "[Steam page link]");
  const hook = clean(o.hook || t.hook || t.shortDescription, 28) || "[one-line hook: what makes it different]";
  const keyText = clean(o.steamKey, 3) || "[Steam key]";

  // Which of the creator's recent games to mention: the best match.
  let matches = arr(o.matchedGames);
  if (!matches.length) {
    const tgt = prepareTarget(t);
    const r = matchGames(c, tgt, buildGameIndex(o.data), referenceTime(o.data, o.now));
    matches = r.coveredTarget ? [r.coveredTarget, ...r.matched] : r.matched;
  }
  const best = matches.find((m) => m && !m.isTarget) || null;
  const pastTarget = matches.find((m) => m && m.isTarget) || null;
  const refGame = best ? clean(best.name || best.title, 8) : "";
  const refTitle = best && best.title && clean(best.title, 12) !== refGame ? clean(best.title, 12) : "";
  const tagList = arr(t.tags).slice(0, 3).map((x) => clean(typeof x === "object" && x ? x.name : x, 3)).filter(Boolean);
  const shared = best && arr(best.sharedTags).length
    ? arr(best.sharedTags).slice(0, 2).map((k) => clean(tagList.find((n) => lc(n) === lc(k)) || k, 3))
    : [];
  const genre = shared.length ? joinAnd(shared) : tagList.length ? joinAnd(tagList.slice(0, 2)) : "[genre]";

  const name = firstName(c.name);
  const greet = tone === "professional" ? `Hello ${name},` : tone === "brief" ? `Hi ${name},` : `Hi ${name}!`;
  const lines = [greet, ""];

  const what = platform === "steam-curator" ? "review" : platform === "twitch" ? "stream" : "video";
  let ref;
  if (pastTarget) {
    ref = `You covered ${game} before, so here is an update: ${game} launches ${launch}.`;
  } else if (refGame) {
    ref = `You recently ${platform === "steam-curator" ? "reviewed" : platform === "twitch" ? "streamed" : "covered"} ${refGame}${refTitle ? ` ("${refTitle}")` : ""}. ${game} is also a ${genre} game, so it might suit your ${platform === "steam-curator" ? "curator page" : "channel"}.`;
  } else {
    ref = `I think ${game} might suit your ${platform === "steam-curator" ? "curator page" : "channel"}: it's a ${genre} game, like [similar game you covered].`;
  }
  lines.push(tone === "brief" ? ref : `I'm ${sender} from ${publisher}. ${ref}`);
  lines.push("");
  lines.push(`${game}: ${hook}`);
  lines.push("");

  if (platform === "steam-curator") {
    lines.push(o.keyOffer === false
      ? "Happy to send a copy through Steam Curator Connect if you'd like one."
      : "I've sent you a copy through Steam Curator Connect, so it's waiting in your Steam library.");
  } else if (o.keyOffer === false) {
    lines.push("Happy to send a Steam key if you'd like one.");
  } else {
    lines.push(`Here's a Steam key, no strings attached: ${keyText}`);
  }
  lines.push(`Embargo: ${embargo}. Launch: ${launch}.`);
  lines.push(`Press kit: ${pressKit}`);
  lines.push(`Steam page: ${steamUrl}`);
  lines.push("");

  const ask = platform === "steam-curator"
    ? `Would you consider ${game} for a review on your curator page?`
    : platform === "twitch"
      ? `Would you be up for streaming ${game} during launch week?`
      : `Would ${game} fit a ${what} on your channel after the embargo lifts?`;
  lines.push(ask);
  if (platform !== "steam-curator" && o.keyOffer !== false && tone !== "brief") {
    lines.push("If you do cover it, please mention the key was free.");
  }
  lines.push("");
  lines.push(tone === "professional" ? "Best regards," : tone === "brief" ? "Thanks," : "Thanks for reading,");
  lines.push(`${sender}${publisher !== "[publisher]" || tone !== "brief" ? `, ${publisher}` : ""}`);

  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const subjectGenre = shared[0] || tagList[0] || "";
  const subject = platform === "steam-curator"
    ? `Curator copy: ${game}${subjectGenre ? `, a ${subjectGenre} game` : ""}`
    : refGame
      ? `${game}: a ${subjectGenre || "new"} game for fans of ${refGame}`
      : `Steam key for ${game}${subjectGenre ? `, a ${subjectGenre} game` : ""}`;
  return { subject, body, wordCount: countWords(body), placeholders: placeholdersIn(`${subject}\n${body}`) };
}

/** One short follow-up for a creator who hasn't replied. Send it once, then move on. */
export function draftFollowUp(creator, target, options = {}) {
  const o = options && typeof options === "object" ? options : {};
  const c = creator && typeof creator === "object" ? creator : {};
  const game = clean(target && target.name, 8) || "[game name]";
  const sender = clean(o.senderName, 4) || "[your name]";
  const launch = clean(o.launchDate || (target && target.launchDate), 6) || "[launch date]";
  const curator = normalizePlatform(c.platform) === "steam-curator";
  const body = [
    `Hi ${firstName(c.name)},`,
    "",
    `Just a quick follow-up on ${game} in case my last email got buried. ${curator ? "The Curator Connect copy is still waiting in your Steam library." : "The key in that email still works."} Launch is ${launch}.`,
    "",
    "No worries if it's not for you; I won't chase again.",
    "",
    "Thanks,",
    sender,
  ].join("\n");
  const subject = `Re: ${game}`;
  return { subject, body, wordCount: countWords(body), placeholders: placeholdersIn(`${subject}\n${body}`) };
}

export function countWords(text) {
  const m = str(text).match(/[^\s]+/g);
  return m ? m.filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

/** Bracketed placeholders still to fill, e.g. ["[launch date]", "[press kit link]"]. */
export function placeholdersIn(text) {
  return [...new Set(str(text).match(/\[[^\[\]\n]{1,60}\]/g) || [])];
}

function httpsOrNull(u) {
  const s = str(u).trim();
  return /^https:\/\/[^\s<>"']+$/i.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export const STAGES = ["shortlist", "pitched", "replied", "key-sent", "covered", "declined"];
export const STAGE_LABELS = { shortlist: "Shortlist", pitched: "Pitched", replied: "Replied", "key-sent": "Key sent", covered: "Covered", declined: "Declined" };

const STAGE_ALIASES = { "key sent": "key-sent", keysent: "key-sent", key_sent: "key-sent", keys: "key-sent", "short-list": "shortlist",
  contacted: "pitched", emailed: "pitched", sent: "pitched", reply: "replied", responded: "replied", done: "covered",
  published: "covered", rejected: "declined", "no": "declined" };

export function normalizeStage(s) {
  const k = lc(s);
  if (STAGES.includes(k)) return k;
  return STAGE_ALIASES[k] || null;
}

/** A fresh outreach entry. */
export function newEntry(creatorId, at = Date.now()) {
  const iso = isoOrNow(at);
  return { creatorId: str(creatorId), stage: "shortlist", notes: "", keys: [], history: [{ stage: "shortlist", at: iso }] };
}

/** Returns a copy of `entry` moved to `stage`, with the move recorded in history. */
export function setStage(entry, stage, at = Date.now()) {
  const s = normalizeStage(stage);
  const e = entry && typeof entry === "object" ? entry : {};
  if (!s) return { ...e };
  return { ...e, stage: s, history: [...arr(e.history), { stage: s, at: isoOrNow(at) }] };
}

/** Returns a copy of `entry` marked as followed up (so it leaves the follow-up list). */
export function markFollowedUp(entry, at = Date.now()) {
  const e = entry && typeof entry === "object" ? entry : {};
  return { ...e, followedUpAt: isoOrNow(at) };
}

function isoOrNow(at) {
  const t = toTime(at);
  return new Date(t == null ? Date.now() : t).toISOString();
}

function reachedStages(e) {
  const set = new Set();
  const cur = normalizeStage(e.stage);
  if (cur) set.add(cur);
  for (const h of arr(e.history)) { const s = normalizeStage(h && h.stage); if (s) set.add(s); }
  return set;
}

function lastAt(e, stages) {
  let best = null;
  for (const h of arr(e.history)) {
    if (!h || !stages.includes(normalizeStage(h.stage))) continue;
    const t = toTime(h.at);
    if (t != null && (best == null || t > best)) best = t;
  }
  return best;
}

function keysOf(e) {
  return [...new Set(arr(e && e.keys).map((k) => str(k).trim()).filter(Boolean))];
}

/**
 * Outreach summary.
 * contacted = entries that got past "shortlist"; replyRate and coverageRate are fractions (0..1) of contacted.
 * keysSent counts distinct keys recorded; keysRedeemedUnknown counts keys whose creator hasn't covered or declined yet.
 * followUpDue: currently "pitched" or "key-sent", never replied, not yet followed up, last contact > followUpDays ago.
 */
export function pipelineSummary(entries, options = {}) {
  const o = options && typeof options === "object" ? options : {};
  const now = toTime(o.now) ?? Date.now();
  const followUpDays = num(o.followUpDays) ?? 7;
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  let total = 0, contacted = 0, replied = 0, covered = 0, declined = 0, keysSent = 0, keysRedeemedUnknown = 0, creatorsWithKeys = 0;
  const followUpDue = [];
  const followedUpNoReply = [];

  for (const e of arr(entries)) {
    if (!e || typeof e !== "object") continue;
    total++;
    const stage = normalizeStage(e.stage) || "shortlist";
    byStage[stage]++;
    const reached = reachedStages(e);
    const isContacted = [...reached].some((s) => s !== "shortlist");
    const hasReplied = reached.has("replied") || reached.has("covered") || reached.has("declined");
    if (isContacted) contacted++;
    if (hasReplied) replied++;
    if (stage === "covered" || reached.has("covered")) covered++;
    if (stage === "declined") declined++;
    const keys = keysOf(e);
    keysSent += keys.length;
    if (keys.length) creatorsWithKeys++;
    if (stage !== "covered" && stage !== "declined") keysRedeemedUnknown += keys.length;

    if ((stage === "pitched" || stage === "key-sent") && !hasReplied) {
      const contactAt = lastAt(e, ["pitched", "key-sent"]) ?? toTime(e.pitchedAt);
      if (contactAt != null) {
        const days = Math.floor((now - contactAt) / DAY);
        const fu = toTime(e.followedUpAt);
        const item = { creatorId: str(e.creatorId), stage, contactedAt: new Date(contactAt).toISOString(), daysSince: days };
        if (fu == null && days > followUpDays) followUpDue.push(item);
        else if (fu != null && Math.floor((now - fu) / DAY) > followUpDays) followedUpNoReply.push({ ...item, followedUpAt: new Date(fu).toISOString() });
      }
    }
  }
  followUpDue.sort((a, b) => b.daysSince - a.daysSince || a.creatorId.localeCompare(b.creatorId));
  followedUpNoReply.sort((a, b) => b.daysSince - a.daysSince || a.creatorId.localeCompare(b.creatorId));
  const rate = (n) => (contacted ? Math.round((n / contacted) * 1000) / 1000 : 0);
  return {
    total, byStage, contacted, replied, covered, declined,
    replyRate: rate(replied), coverageRate: rate(covered),
    keysSent, creatorsWithKeys, keysRedeemedUnknown,
    followUpDue, followedUpNoReply,
  };
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = ["creatorId", "name", "platform", "url", "stage", "keys", "notes", "lastContact", "followedUpAt", "history"];

/** Neutralise spreadsheet formula injection (OWASP): prefix risky leading characters with an apostrophe. */
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r＝＋－＠]/.test(s)) s = `'${s}`;
  return /[",\r\n']/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV of outreach entries. Pass `creators` (array or {id: creator} map) to fill in name, platform and url.
 */
export function exportCsv(entries, options = {}) {
  const o = options && typeof options === "object" ? options : {};
  const lookup = new Map();
  if (Array.isArray(o.creators)) for (const c of o.creators) { if (c && c.id != null) lookup.set(str(c.id), c); }
  else if (o.creators && typeof o.creators === "object") for (const [k, c] of Object.entries(o.creators)) lookup.set(k, c);
  const rows = [CSV_COLUMNS.join(",")];
  for (const e of arr(entries)) {
    if (!e || typeof e !== "object") continue;
    const c = lookup.get(str(e.creatorId)) || {};
    const last = lastAt(e, STAGES.filter((s) => s !== "shortlist"));
    const history = arr(e.history).filter((h) => h && typeof h === "object").map((h) => `${str(h.stage)}@${str(h.at)}`).join("; ");
    rows.push([
      e.creatorId, e.name ?? c.name, e.platform ?? c.platform, e.url ?? c.url, normalizeStage(e.stage) || str(e.stage),
      keysOf(e).join(" "), e.notes, last == null ? "" : new Date(last).toISOString(), e.followedUpAt, history,
    ].map(csvCell).join(","));
  }
  return rows.join("\r\n") + "\r\n";
}

/** JSON backup that importJson reads back. */
export function exportJson(entries, at = Date.now()) {
  return JSON.stringify({ app: "creator-match", version: 1, exportedAt: isoOrNow(at), entries: arr(entries).filter((e) => e && typeof e === "object") }, null, 2);
}

const MAX_ENTRIES = 20000;

/**
 * Parse a backup. Accepts {entries:[…]}, a bare array, or a {creatorId: entry} map.
 * Never throws. Returns { entries, errors: [string], warnings: [string] }.
 * Bad entries are skipped with an error; fixable problems (unknown stage, bad dates) become warnings.
 * Duplicate creatorIds are merged: the later entry wins for stage and notes; keys and history are combined.
 */
export function importJson(text) {
  const errors = [];
  const warnings = [];
  let parsed;
  try {
    parsed = typeof text === "string" ? JSON.parse(text.replace(/^﻿/, "")) : text;
  } catch (err) {
    return { entries: [], errors: [`Not valid JSON: ${err && err.message ? err.message : "parse error"}`], warnings };
  }
  let list;
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) list = parsed.entries;
  else if (parsed && typeof parsed === "object" && Array.isArray(parsed.outreach)) list = parsed.outreach;
  else if (parsed && typeof parsed === "object") {
    list = Object.entries(parsed).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v)).map(([k, v]) => ({ creatorId: k, ...v }));
    if (!list.length) return { entries: [], errors: ["No outreach entries found"], warnings };
  } else {
    return { entries: [], errors: ["No outreach entries found"], warnings };
  }
  if (list.length > MAX_ENTRIES) { warnings.push(`Only the first ${MAX_ENTRIES} entries were imported`); list = list.slice(0, MAX_ENTRIES); }

  const byId = new Map();
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { errors.push(`Entry ${i + 1}: not an object, skipped`); return; }
    const id = str(raw.creatorId ?? raw.id).trim().slice(0, 200);
    if (!id) { errors.push(`Entry ${i + 1}: missing creatorId, skipped`); return; }
    let stage = normalizeStage(raw.stage);
    if (!stage) { if (raw.stage != null && raw.stage !== "") warnings.push(`${id}: unknown stage "${str(raw.stage).slice(0, 40)}", set to shortlist`); stage = "shortlist"; }
    let keys = raw.keys;
    if (typeof keys === "string") keys = keys.split(/[\s,;]+/);
    keys = [...new Set(arr(keys).map((k) => str(k).trim().slice(0, 100)).filter(Boolean))].slice(0, 500);
    const history = [];
    for (const h of arr(raw.history)) {
      const s = normalizeStage(h && h.stage);
      const t = toTime(h && h.at);
      if (!s || t == null) { warnings.push(`${id}: dropped a history item with a bad stage or date`); continue; }
      history.push({ stage: s, at: new Date(t).toISOString() });
    }
    history.sort((a, b) => a.at.localeCompare(b.at));
    const entry = { creatorId: id, stage, notes: str(raw.notes).slice(0, 10000), keys, history };
    const fu = toTime(raw.followedUpAt);
    if (fu != null) entry.followedUpAt = new Date(fu).toISOString();
    for (const f of ["name", "platform"]) if (typeof raw[f] === "string" && raw[f].trim()) entry[f] = raw[f].trim().slice(0, 200);
    const url = httpsOrNull(raw.url);
    if (url) entry.url = url;

    const prev = byId.get(id);
    if (prev) {
      warnings.push(`${id}: duplicate entry merged`);
      const merged = { ...prev, ...entry, keys: [...new Set([...prev.keys, ...entry.keys])] };
      const seen = new Set();
      merged.history = [...prev.history, ...entry.history].filter((h) => { const k = `${h.stage}@${h.at}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.at.localeCompare(b.at));
      if (!entry.notes && prev.notes) merged.notes = prev.notes;
      byId.set(id, merged);
    } else byId.set(id, entry);
  });
  return { entries: [...byId.values()], errors, warnings };
}
