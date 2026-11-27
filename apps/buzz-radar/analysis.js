// Buzz Radar analysis engine.
// Pure functions: no DOM, no network, no dependencies. Runs in the browser and in Node 22.
//
// analyze(posts, { game, now, bucketHours }) turns a list of normalized posts (see sources.js)
// into a Report: a timeline, detected bursts (influxes), clusters of related content, per-cluster
// "is this paid media?" signals and scores, and plain-English insights for a learner.
//
// Pipeline
//   1. Clean: drop posts without a readable date, de-duplicate ids, sort by time then id
//      (so the output never depends on input order).
//   2. Timeline: fixed buckets (1h if the data spans <= 3 days, 6h <= 14 days, 24h otherwise,
//      weekly past ~400 days) with counts, per-source counts and summed views.
//   3. Bursts: robust baseline per bucket = rolling median of nearby buckets; spread =
//      max(1.4826 * MAD, sqrt(baseline), 1) (the sqrt term is a Poisson floor so sparse data
//      does not fire on every blip). A bucket with z >= 2.5 and at least 3 posts above baseline
//      seeds a burst, which grows over adjacent buckets with z >= 1.5.
//   4. Clusters: TF-IDF vectors over title (x2), the start of the text, and tags, with
//      stopwords, URLs and the game's own name removed, plus bigrams ("patch notes", "season 2").
//      Two posts are neighbours when cosine * timeDecay >= 0.22 and they are within a time
//      window (span/10, clamped to 12..72h). DBSCAN over that graph (minPts scales with
//      sqrt(n), 3..8) finds dense groups; similar overlapping groups are merged, the largest 12
//      are kept, and every other post goes to one "background chatter" cluster.
//   5. Signals (0..1) per cluster, the campaign score (formula in campaignScore()), an
//      archetype from transparent rules (archetypeFor()), reasons with numbers, top posts.
//   6. Insights: 3-6 game-level takeaways.

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export const ARCHETYPE_IDS = ["sponsored-creator-wave", "launch-blitz", "trailer-reveal",
  "streamer-sponsorship", "update-drop", "event-or-esports", "organic-viral", "controversy",
  "background-chatter"];

const ARCH_NAMES = {
  "sponsored-creator-wave": "Sponsored creator wave",
  "launch-blitz": "Launch blitz",
  "trailer-reveal": "Trailer / reveal spike",
  "streamer-sponsorship": "Sponsored streams",
  "update-drop": "Update drop",
  "event-or-esports": "Event / esports moment",
  "organic-viral": "Organic viral moment",
  "controversy": "Controversy",
  "background-chatter": "Ongoing chatter",
};
const PAID_ARCHETYPES = new Set(["sponsored-creator-wave", "streamer-sponsorship", "launch-blitz"]);

// ---------------------------------------------------------------------------------------------
// Sponsorship disclosure detection

// Phrases that mention sponsorship but are NOT a disclosure. They are removed before matching.
const NOT_DISCLOSURE = [
  /#?\b(not|non|un)[\s-]?sponsored\b/gi,
  /\b(is|was|isn'?t|wasn'?t|are|aren'?t)\s+not\s+(a\s+)?(sponsored|sponsorship|paid|an?\s+ad)\b/gi,
  /\b(isn'?t|wasn'?t|aren'?t|never|no)\s+(a\s+)?(sponsored|sponsorship|paid\s+promotion|paid|ad)\b/gi,
  /\bno\s+(sponsors?|sponsorships?|ads)\b/gi,
  /\b(business|sponsorship|sponsor|brand|partnership|collab(oration)?)\s+(inquiries|enquiries|requests|contact|deals?\s*[:\-])[^\n]*/gi,
  /\bfor\s+(business|sponsorships?|brand\s+deals?)\b[^\n]*/gi,
  /\b(become|want\s+to\s+be)\s+a\s+sponsor\b[^\n]*/gi,
];

/** Each rule: { label, re }. Tested against title + text + tags (as "#tag"). */
export const DISCLOSURE_RULES = [
  { label: "#ad", re: /(^|[^\p{L}\p{N}_])#(ad|ads|advert|advertisement|anzeige|werbung|publicidad|pub)(?![\p{L}\p{N}_])/iu },
  { label: "#sponsored", re: /(^|[^\p{L}\p{N}_])#(sponsored|sponsor|spon|sponsorship|paidpartnership|paidpromotion|paidpartner)(?![\p{L}\p{N}_])/iu },
  { label: "#partner", re: /(^|[^\p{L}\p{N}_])#(partner|partnered|partnership|brandpartner|collab|promo|promotion)(?![\p{L}\p{N}_])/iu },
  { label: "#gifted", re: /(^|[^\p{L}\p{N}_])#gifted(?![\p{L}\p{N}_])|\bgifted\s+by\b/iu },
  { label: "[AD] tag", re: /(^|\s|\|)[[(]\s*ad\s*[\])]|^\s*ad\s*[:|–—-]\s|\|\s*ad\s*$|!(sponsor|ad)\b/i },
  { label: "sponsored by", re: /\bsponsored\s+by\b|\b(this|today'?s)\s+(video|stream|episode|post|content)\s+(is|was)\s+sponsored\b|\bsponsored\s+(video|stream|content|post|segment)\b|\(sponsored\)|\[sponsored\]/i },
  { label: "thanks for sponsoring", re: /\bfor\s+sponsoring\b|\bsponsor(ing)?\s+(of\s+)?(this|today'?s)\s+(video|stream|episode)\b|\btoday'?s\s+sponsor\b/i },
  { label: "paid partnership", re: /\bpaid\s+(partnership|promotion|promo|sponsorship|collab(oration)?|advertisement|placement|post)\b|\bincludes\s+paid\s+promotion\b/i },
  { label: "in partnership with", re: /\bin\s+(paid\s+)?partnership\s+with\b|\b(partnered|teamed\s+up)\s+with\b|\bbrought\s+to\s+you\s+by\b|\bpowered\s+by\b(?=[^\n]{0,40}\b(games|studios?|entertainment|interactive)\b)/i },
  { label: "promo code", re: /\b(promo|discount|creator|affiliate|coupon|support[\s-]?a[\s-]?creator)\s+code\b|\buse\s+(my\s+)?code\b|\bcode\s*[:"']\s*[A-Z0-9]{3,}|\baffiliate\s+link/i },
  { label: "key provided", re: /\b(key|copy|code|access)\s+(was\s+)?(provided|supplied|given|sent)\s+(to\s+me\s+)?(by|courtesy\s+of)\b|\b(review|press|early[\s-]access)\s+(copy|key|code|build)\s+(was\s+)?(provided|supplied|courtesy)\b|\bprovided\s+by\s+the\s+(developer|publisher|studio)s?\b|\bthanks\s+to\s+[^\n.]{1,40}\s+for\s+(the\s+)?(review\s+|early\s+|press\s+)?(key|copy|code|access)\b/i },
];

const CAP_WORDS = "(@?[\\p{Lu}\\p{N}][\\p{L}\\p{N}&'_-]*(?:\\s+(?:of\\s+)?[\\p{Lu}\\p{N}][\\p{L}\\p{N}&'_-]*){0,3})";
const SPONSOR_RES = [
  new RegExp(`\\b[Ss]ponsored\\s+by\\s+(?:the\\s+(?:folks|team)\\s+at\\s+)?${CAP_WORDS}`, "u"),
  new RegExp(`\\b[Tt]hanks?(?:\\s+you)?\\s+(?:so\\s+much\\s+)?to\\s+${CAP_WORDS}\\s+for\\b[^\\n.!]{0,60}\\bsponsor`, "u"),
  new RegExp(`\\b(?:[Ii]n\\s+(?:paid\\s+)?partnership|[Pp]aid\\s+partnership|[Pp]artnered|[Tt]eamed\\s+up)\\s+with\\s+${CAP_WORDS}`, "u"),
  new RegExp(`\\b[Bb]rought\\s+to\\s+you\\s+by\\s+${CAP_WORDS}`, "u"),
  new RegExp(`\\b[Kk]ey\\s+(?:was\\s+)?provided\\s+by\\s+${CAP_WORDS}`, "u"),
];

/**
 * Detect a sponsorship disclosure in a piece of text.
 * @returns {{ disclosed: boolean, labels: string[], sponsor: string|null }}
 */
export function detectDisclosure(text) {
  let s = String(text || "");
  for (const re of NOT_DISCLOSURE) s = s.replace(re, " ");
  const labels = [];
  for (const r of DISCLOSURE_RULES) if (r.re.test(s)) labels.push(r.label);
  let sponsor = null;
  if (labels.length) {
    for (const re of SPONSOR_RES) {
      const m = s.match(re);
      if (m) { sponsor = cleanSponsor(m[1]); if (sponsor) break; }
    }
  }
  return { disclosed: labels.length > 0, labels, sponsor };
}

function cleanSponsor(x) {
  let s = String(x || "").replace(/^@/, "").replace(/[.'’_-]+$/, "").trim();
  if (s.length < 2 || s.length > 48) return null;
  if (/^(The|This|My|Our|Today|Me|Us|You|Them)$/i.test(s)) return null;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Text processing

const STOPWORDS = new Set(`a about above after again against all almost also am an and any are aren as at be because
been before being below between both but by can cant could couldnt did didnt do does doesnt doing dont down during each
few for from further get gets got had hadnt has hasnt have havent having he her here hers herself him himself his how i
id ill im ive if in into is isnt it its itself just lets let me more most my myself no nor not now of off on once only
or other our ours ourselves out over own same she should so some such than that thats the their theirs them themselves
then there theres these they theyre this those through to too under until up very was wasnt we were werent what whats
when where which while who whom why will with wont would wouldnt you youre youve your yours yourself yourselves
yeah yes ok okay oh lol lmao omg gonna wanna really actually literally thing things stuff way much many lot lots one two
im u ur pls please thanks thank via vs etc amp nbsp
game games gaming gamer gamers play played playing plays player players video videos channel channels subscribe
subscribed subscribers like likes liked comment comments share watch watching watched new today first part episode ep
full official link links description below check follow twitter instagram tiktok discord patreon merch social socials
twitch youtube reddit bluesky mastodon stream streams streaming streamer live hd 4k 1080p 60fps pc ps5 xbox switch
https http www com net org html`.split(/\s+/).filter(Boolean));

// Words that carry the disclosure itself; kept for similarity but never shown as cluster keywords.
const KEYWORD_SKIP = new Set(["ad", "ads", "sponsored", "sponsor", "sponsoring", "sponsorship", "partner",
  "partnership", "paid", "promotion", "promo", "code", "gifted", "thanks", "thank"]);

function words(s) {
  return String(s || "").toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/['’]/g, "")
    .match(/[\p{L}\p{N}]+(?:\.\d+)?/gu) || [];
}

function gameTokenSet(game) {
  const ws = words(game);
  const set = new Set(ws);
  if (ws.length > 1) set.add(ws.join(""));
  // possessive / plural forms ("eldens", "rings")
  for (const w of ws) if (w.length > 3) set.add(w + "s");
  return set;
}

// Generic words that are useless alone but meaningful in a phrase ("first impressions",
// "new season", "official trailer", "launch day"). Dropped as unigrams, kept inside bigrams.
const SOFT = new Set(["first", "new", "full", "official", "live", "part", "early", "best", "day", "one", "two",
  "today", "play", "game", "gameplay", "stream", "video", "look", "time"]);

const isNum = (w) => /^\d+(\.\d+)?$/.test(w);
const isContent = (w, game) => w.length >= 2 && !STOPWORDS.has(w) && !SOFT.has(w) && !game.has(w) && !isNum(w);
const isPhrasePart = (w, game) => isContent(w, game) || (SOFT.has(w) && !game.has(w)) || (isNum(w) && w.length <= 4);

/** Token counts for a post: unigrams plus adjacent bigrams, title weighted x2. */
function postTerms(p, game) {
  const tf = new Map();
  const add = (k, w) => tf.set(k, (tf.get(k) || 0) + w);
  const segs = [[p.title, 2], [String(p.text || "").slice(0, 400), 1], [p.tags.join(" "), 1]];
  for (const [txt, w] of segs) {
    const ws = words(txt);
    for (let i = 0; i < ws.length; i++) {
      const a = ws[i];
      if (isContent(a, game)) add(a, w);
      if (i + 1 < ws.length) {
        const b = ws[i + 1];
        if (isPhrasePart(a, game) && isPhrasePart(b, game) && (isContent(a, game) || isContent(b, game))) add(a + " " + b, w);
      }
    }
  }
  return tf;
}

/** Sparse vector: parallel sorted arrays of term ids and weights, L2-normalised. */
function makeVec(entries) {
  entries.sort((x, y) => x[0] - y[0]);
  let norm = 0;
  for (const e of entries) norm += e[1] * e[1];
  norm = Math.sqrt(norm) || 1;
  const ids = new Int32Array(entries.length), w = new Float64Array(entries.length);
  entries.forEach((e, i) => { ids[i] = e[0]; w[i] = e[1] / norm; });
  return { ids, w };
}

function dot(a, b) {
  let i = 0, j = 0, s = 0;
  const ai = a.ids, bi = b.ids;
  while (i < ai.length && j < bi.length) {
    if (ai[i] === bi[j]) { s += a.w[i] * b.w[j]; i++; j++; }
    else if (ai[i] < bi[j]) i++;
    else j++;
  }
  return s;
}

function centroid(members, vecs) {
  const acc = new Map();
  for (const m of members) {
    const v = vecs[m];
    for (let k = 0; k < v.ids.length; k++) acc.set(v.ids[k], (acc.get(v.ids[k]) || 0) + v.w[k]);
  }
  return makeVec([...acc.entries()]);
}

// Keyword families used by the archetype rules (matched on lowercase title + text start + tags).
const FAMILIES = {
  launch: /\b(launch(es|ed|ing)?|release[sd]?|release date|out now|available now|day one|launch day|early access|full release|1\.0|is out|its out|finally out|pre-?orders?|now on steam|now available)\b/,
  trailer: /\b(trailers?|teasers?|reveal(ed|s)?|announce(d|ment|s)?|first look|world premiere|cinematic)\b/,
  update: /\b(patch(es|ed)?|patchnotes|updates?|updated|hotfix(es)?|season\s*\d+|new season|dlc|expansion|nerf(s|ed)?|buff(s|ed)?|roadmap|battle ?pass|balance changes?|new (map|hero|character|weapon|mode|content))\b/,
  event: /\b(tournaments?|esports?|e-sports|championships?|invitational|qualifiers?|brackets?|grand finals?|finals|showcase|nintendo direct|state of play|summer game fest|game awards|gamescom|evo|world cup|majors?\b(?=.*\b(cs|valorant|dota|league)\b)|pro league|lan event)\b/,
  controversy: /\b(refunds?|refunded|boycott(ing)?|drama|review[- ]?bomb(ed|ing)?|backlash|scandal|lawsuit|sued|layoffs?|controvers(y|ial)|outrage|scam(med)?|petition|apolog(y|ise|ize|ises|izes|ized)|pay ?to ?win|p2w|delisted|predatory|greed(y)?)\b/,
};
const FAMILY_WORDS = {
  launch: "launch / release terms",
  trailer: "trailer / reveal terms",
  update: "patch / season / update terms",
  event: "tournament / showcase terms",
  controversy: "controversy terms (refunds, backlash, review bombs…)",
};

// ---------------------------------------------------------------------------------------------
// Small helpers

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const round = (x, d = 3) => { const f = 10 ** d; return Math.round(x * f) / f; };
const iso = (t) => new Date(t).toISOString();
const num = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function countBy(items, f) {
  const o = {};
  for (const it of items) { const k = f(it); o[k] = (o[k] || 0) + 1; }
  return sortedObj(o);
}

function sortedObj(o) {
  const out = {};
  for (const [k, v] of Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) out[k] = v;
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(t) { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; }
function fmtDayTime(t) {
  const d = new Date(t);
  return `${fmtDay(t)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtRange(a, b) {
  const da = new Date(a), db = new Date(b);
  const yr = da.getUTCFullYear() !== db.getUTCFullYear();
  const y = (d) => (yr ? `, ${d.getUTCFullYear()}` : "");
  if (fmtDay(a) === fmtDay(b) && !yr) return fmtDay(a);
  if (da.getUTCMonth() === db.getUTCMonth() && !yr) return `${fmtDay(a)}–${db.getUTCDate()}`;
  return `${fmtDay(a)}${y(da)}–${fmtDay(b)}${y(db)}`;
}
function fmtNum(n) {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}
function fmtHours(h) {
  if (h < 1.5) return "1 hour";
  if (h <= 72) return `${Math.round(h)} hours`;
  return `${Math.round(h / 24)} days`;
}
function quote(s, max = 70) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return `“${t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t}”`;
}
function tierOf(f) {
  if (f < 10e3) return "nano";
  if (f < 100e3) return "micro";
  if (f < 500e3) return "mid";
  if (f < 1e6) return "macro";
  return "mega";
}
const SOURCE_NAMES = { youtube: "YouTube", twitch: "Twitch", reddit: "Reddit", bluesky: "Bluesky",
  mastodon: "Mastodon", hackernews: "Hacker News", tiktok: "TikTok", twitter: "X/Twitter", x: "X/Twitter" };
const srcName = (s) => SOURCE_NAMES[s] || (s ? s[0].toUpperCase() + s.slice(1) : "Unknown");

// ---------------------------------------------------------------------------------------------
// Step 1: clean

function prepare(input, gameSet) {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  let badDates = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p || typeof p !== "object") continue;
    const t = typeof p.publishedAt === "number" ? p.publishedAt : Date.parse(p.publishedAt);
    if (!Number.isFinite(t)) { badDates++; continue; }
    const source = String(p.source || "unknown");
    const id = p.id != null && p.id !== "" ? String(p.id) : `${source}:item${i}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const m = p.metrics && typeof p.metrics === "object" ? p.metrics : {};
    const views = num(m.views), viewers = num(m.viewers), likes = num(m.likes), comments = num(m.comments);
    // Engagement proxy (comparable-ish across platforms): views; else average viewers x 20
    // (a typical stream is watched by ~20x its concurrent average); else (likes + 2*comments) x 20.
    let eng = null;
    if (views != null) eng = views;
    else if (viewers != null) eng = viewers * 20;
    else if (likes != null || comments != null) eng = ((likes || 0) + 2 * (comments || 0)) * 20;
    const title = String(p.title || "");
    const text = String(p.text || "");
    const tags = Array.isArray(p.tags) ? p.tags.map((x) => String(x).toLowerCase().replace(/^#/, "")) : [];
    const author = String(p.author || p.authorId || "unknown");
    const authorKey = `${source}|${String(p.authorId || p.author || "unknown").toLowerCase()}`;
    const disc = detectDisclosure(`${title}\n${text}\n${tags.map((x) => "#" + x.replace(/\s+/g, "")).join(" ")}`);
    out.push({
      id, source, kind: String(p.kind || "post"), title, text, tags, author, authorKey,
      followers: num(p.authorFollowers), t, views, eng, disc,
      lower: `${title}\n${text.slice(0, 600)}\n${tags.join(" ")}`.toLowerCase(),
      displayTitle: title || text.split("\n")[0] || "",
    });
  }
  out.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const p of out) p.terms = postTerms(p, gameSet);
  return { posts: out, badDates };
}

// ---------------------------------------------------------------------------------------------
// Step 2 + 3: timeline and bursts

function chooseBucketHours(spanMs, requested) {
  let bh = Number(requested);
  if (!(bh > 0)) {
    const d = spanMs / DAY;
    bh = d <= 3 ? 1 : d <= 14 ? 6 : d <= 400 ? 24 : 168;
  }
  while (spanMs / (bh * HOUR) > 5000) bh *= 2; // keep the series bounded
  return bh;
}

function buildTimeline(posts, startMs, endMs, bh) {
  const size = bh * HOUR;
  const t0 = Math.floor(startMs / size) * size;
  const nb = Math.floor((endMs - t0) / size) + 1;
  const buckets = [];
  for (let i = 0; i < nb; i++) buckets.push({ t0: t0 + i * size, count: 0, bySource: {}, views: 0, idx: [] });
  posts.forEach((p, k) => {
    const i = Math.min(nb - 1, Math.max(0, Math.floor((p.t - t0) / size)));
    const b = buckets[i];
    b.count++;
    b.bySource[p.source] = (b.bySource[p.source] || 0) + 1;
    b.views += p.views || 0;
    b.idx.push(k);
  });
  return { buckets, size };
}

function detectBursts(buckets, size, posts) {
  const n = buckets.length;
  if (n < 3) return [];
  const counts = buckets.map((b) => b.count);
  const h = Math.max(4, Math.min(48, Math.round(168 / (size / HOUR))));
  const base = new Array(n), z = new Array(n);
  for (let i = 0; i < n; i++) {
    const win = counts.slice(Math.max(0, i - h), Math.min(n, i + h + 1));
    const med = median(win);
    const mad = median(win.map((c) => Math.abs(c - med)));
    const sigma = Math.max(1.4826 * mad, Math.sqrt(Math.max(med, 1)), 1);
    base[i] = med;
    z[i] = (counts[i] - med) / sigma;
  }
  const hot = (i) => z[i] >= 1.5 && counts[i] > base[i];
  const seed = (i) => z[i] >= 2.5 && counts[i] - base[i] >= 3;
  const bursts = [];
  let i = 0;
  while (i < n) {
    if (!hot(i)) { i++; continue; }
    let j = i;
    while (j + 1 < n && hot(j + 1)) j++;
    let hasSeed = false, peak = i;
    for (let k = i; k <= j; k++) { if (seed(k)) hasSeed = true; if (counts[k] > counts[peak]) peak = k; }
    if (hasSeed) {
      let count = 0, baseline = 0, zmax = -Infinity;
      const mix = {};
      for (let k = i; k <= j; k++) {
        count += counts[k]; baseline += base[k]; zmax = Math.max(zmax, z[k]);
        for (const idx of buckets[k].idx) mix[posts[idx].source] = (mix[posts[idx].source] || 0) + 1;
      }
      bursts.push({
        id: `b${bursts.length + 1}`,
        start: iso(buckets[i].t0), end: iso(buckets[j].t0 + size), peak: iso(buckets[peak].t0),
        count, baseline: round(baseline, 1), z: round(zmax, 2), sourceMix: sortedObj(mix),
        _s: buckets[i].t0, _e: buckets[j].t0 + size,
      });
    }
    i = j + 1;
  }
  return bursts;
}

// ---------------------------------------------------------------------------------------------
// Step 4: clustering

const SIM_THRESHOLD = 0.22;
const MERGE_THRESHOLD = 0.45;          // centroid cosine to merge groups within W/2 of each other
const MERGE_THRESHOLD_OVERLAP = 0.25;  // ... or a looser one when their time ranges overlap
const MAX_CLUSTERS = 12;

function vectorize(posts) {
  const N = posts.length;
  const df = new Map();
  for (const p of posts) for (const k of p.terms.keys()) df.set(k, (df.get(k) || 0) + 1);
  // Terms that appear in more than half of all posts behave like the game name: no signal.
  const tooCommon = (d) => N >= 20 && d / N > 0.5;
  const vocab = new Map();
  const termList = [];
  for (const [k, d] of [...df.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (tooCommon(d)) continue;
    vocab.set(k, termList.length);
    termList.push(k);
  }
  const idf = termList.map((k) => Math.log((N + 1) / (df.get(k) + 1)) + 1);
  const vecs = posts.map((p) => {
    const e = [];
    for (const [k, c] of p.terms) {
      const id = vocab.get(k);
      if (id === undefined) continue;
      e.push([id, (1 + Math.log(c)) * idf[id]]);
    }
    return makeVec(e);
  });
  return { vecs, df, termList };
}

function clusterPosts(posts, vecs, spanMs) {
  const N = posts.length;
  const W = Math.max(12 * HOUR, Math.min(72 * HOUR, spanMs / 10));
  const minPts = Math.max(3, Math.min(8, Math.round(Math.sqrt(N) / 4)));
  const minSize = Math.max(minPts, Math.min(8, Math.round(Math.sqrt(N) / 2.5)));
  const nbrs = posts.map(() => []);
  for (let i = 0; i < N; i++) {
    if (!vecs[i].ids.length) continue;
    for (let j = i + 1; j < N; j++) {
      const dt = posts[j].t - posts[i].t;
      if (dt > W) break;
      if (!vecs[j].ids.length) continue;
      const s = dot(vecs[i], vecs[j]) * (1 - 0.3 * (dt / W));
      if (s >= SIM_THRESHOLD) { nbrs[i].push(j); nbrs[j].push(i); }
    }
  }
  // DBSCAN
  const label = new Int32Array(N).fill(-1);
  const core = nbrs.map((l) => l.length + 1 >= minPts);
  let groups = [];
  for (let i = 0; i < N; i++) {
    if (label[i] !== -1 || !core[i]) continue;
    const g = groups.length;
    const members = [];
    const queue = [i];
    label[i] = g;
    while (queue.length) {
      const x = queue.shift();
      members.push(x);
      if (!core[x]) continue;
      for (const y of nbrs[x]) if (label[y] === -1) { label[y] = g; queue.push(y); }
    }
    groups.push(members);
  }
  // Merge groups that talk about the same thing at (nearly) the same time.
  let merged = true;
  while (merged && groups.length > 1) {
    merged = false;
    const cents = groups.map((g) => centroid(g, vecs));
    const ranges = groups.map((g) => [Math.min(...g.map((k) => posts[k].t)), Math.max(...g.map((k) => posts[k].t))]);
    outer: for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const gap = Math.max(0, Math.max(ranges[a][0], ranges[b][0]) - Math.min(ranges[a][1], ranges[b][1]));
        const cos = dot(cents[a], cents[b]);
        const overlap = Math.min(ranges[a][1], ranges[b][1]) - Math.max(ranges[a][0], ranges[b][0]);
        if ((gap <= W / 2 && cos >= MERGE_THRESHOLD) || (overlap >= 0 && cos >= MERGE_THRESHOLD_OVERLAP)) {
          groups[a] = groups[a].concat(groups[b]);
          groups.splice(b, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  groups = groups.filter((g) => g.length >= minSize)
    .sort((a, b) => b.length - a.length || a[0] - b[0])
    .slice(0, MAX_CLUSTERS)
    .map((g) => g.sort((x, y) => x - y));
  const used = new Set(groups.flat());
  const rest = [];
  for (let i = 0; i < N; i++) if (!used.has(i)) rest.push(i);
  // chronological order
  groups.sort((a, b) => posts[a[0]].t - posts[b[0]].t || a[0] - b[0]);
  return { groups, rest, W };
}

// ---------------------------------------------------------------------------------------------
// Step 5: signals, score, archetype, reasons

function titleWords(p, gameSet) {
  return words(p.displayTitle.slice(0, 160)).filter((w) => !gameSet.has(w));
}

function titleStats(members, gameSet) {
  const n = members.length;
  if (n < 2) return { sim: 0, phrase: null, phraseCount: 0 };
  let sample = members;
  if (n > 150) { const step = n / 150; sample = []; for (let k = 0; k < 150; k++) sample.push(members[Math.floor(k * step)]); }
  const sets = sample.map((p) => new Set(titleWords(p, gameSet).filter((w) => w.length >= 2 && !STOPWORDS.has(w))));
  let tot = 0, pairs = 0;
  for (let a = 0; a < sets.length; a++) for (let b = a + 1; b < sets.length; b++) {
    const A = sets[a], B = sets[b];
    if (!A.size && !B.size) continue;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    tot += inter / (A.size + B.size - inter);
    pairs++;
  }
  const meanJ = pairs ? tot / pairs : 0;
  // Most shared phrase (2-4 word n-gram that isn't only stopwords), counted once per title.
  const grams = new Map();
  for (const p of members) {
    const ws = titleWords(p, gameSet);
    const seen = new Set();
    for (let len = 2; len <= 4; len++) for (let i = 0; i + len <= ws.length; i++) {
      const g = ws.slice(i, i + len);
      if (g.every((w) => STOPWORDS.has(w) || isNum(w))) continue;
      if (STOPWORDS.has(g[0]) && STOPWORDS.has(g[g.length - 1]) && len === 2) continue;
      const k = g.join(" ");
      if (!seen.has(k)) { seen.add(k); grams.set(k, (grams.get(k) || 0) + 1); }
    }
  }
  let phrase = null, phraseCount = 0;
  for (const [k, c] of [...grams.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const better = c > phraseCount || (c === phraseCount && phrase && k.split(" ").length > phrase.split(" ").length);
    if (better) { phrase = k; phraseCount = c; }
  }
  if (phraseCount < 3 || phraseCount < 0.25 * n) { phrase = null; phraseCount = 0; }
  // Blend: mean pairwise word overlap, and the share of titles carrying the top shared phrase.
  const sim = clamp01(0.6 * Math.min(1, meanJ / 0.45) + 0.4 * (phraseCount / n));
  return { sim, phrase, phraseCount };
}

function timingStats(members) {
  const n = members.length;
  const ts = members.map((p) => p.t).sort((a, b) => a - b);
  const WIN = 36 * HOUR;
  let best = 0, bi = 0, bj = 0;
  for (let i = 0, j = 0; i < n; i++) {
    while (j + 1 < n && ts[j + 1] - ts[i] <= WIN) j++;
    if (j - i + 1 > best) { best = j - i + 1; bi = i; bj = j; }
  }
  const lo = ts[bi], hi = ts[bj];
  const peakCreators = new Set(members.filter((p) => p.t >= lo && p.t <= hi).map((p) => p.authorKey)).size;
  const iqrH = (quantile(ts, 0.75) - quantile(ts, 0.25)) / HOUR;
  let sync = 0;
  if (n >= 2) {
    const peakShare = best / n;
    const tightness = Math.exp(-iqrH / 48);
    sync = Math.sqrt(peakShare * tightness) * (1 - Math.exp(-peakCreators / 3));
  }
  return { sync: clamp01(sync), peakCount: best, peakCreators, peakStart: lo, peakEnd: hi,
    spanH: (ts[n - 1] - ts[0]) / HOUR, iqrH };
}

function engagementStats(members) {
  const vals = members.filter((p) => p.eng != null).map((p) => ({ p, e: p.eng }))
    .sort((a, b) => b.e - a.e || (a.p.id < b.p.id ? -1 : 1));
  const m = vals.length;
  const total = vals.reduce((s, v) => s + v.e, 0);
  const views = members.reduce((s, p) => s + (p.views || 0), 0);
  if (m < 3 || total <= 0) return { skew: 0.5, known: false, k: 0, topShare: 0, total, views, top: vals[0]?.p || null };
  const k = Math.max(1, Math.round(m * 0.1));
  const topShare = vals.slice(0, k).reduce((s, v) => s + v.e, 0) / total;
  const even = k / m;
  return { skew: clamp01((topShare - even) / (1 - even)), known: true, k, topShare, total, views, top: vals[0].p };
}

function platformSpread(members, nSourcesTotal) {
  if (nSourcesTotal < 2 || !members.length) return 0;
  const c = countBy(members, (p) => p.source);
  let H = 0;
  for (const v of Object.values(c)) { const q = v / members.length; H -= q * Math.log(q); }
  return clamp01((Math.exp(H) - 1) / (Math.min(nSourcesTotal, 6) - 1));
}

/**
 * Campaign score (0..100): how much a cluster looks like a paid media push.
 *
 *   S = 0.35*disclosure + 0.15*synchronicity + 0.15*titleSimilarity + 0.08*creatorDiversity
 *     + 0.10*newCreatorShare + 0.05*platformSpread + 0.12*(1 - engagementSkew)
 *   score = 100 * clamp((S - 0.15) / 0.70)          // ~0.15 is what pure noise scores
 *   score *= min(1, 0.4 + 0.15*creators)              // 1-3 creators can't be a "wave"
 *   if disclosure >= 0.5 and creators >= 3:           // disclosed = paid by definition
 *     score = max(score, 55 + 40*(disclosure - 0.5))  // 55 at half disclosed, 75 at all
 *
 * Disclosure dominates because it is the only direct evidence. Timing, templated titles,
 * many first-time creators and evenly spread views are the circumstantial fingerprints of a
 * bought wave (a brief sent to many creators with a fixed go-live window). A viral moment
 * has the opposite engagement shape: one post holds most of the views.
 */
function campaignScore(sig, creators) {
  const S = 0.35 * sig.disclosure + 0.15 * sig.synchronicity + 0.15 * sig.titleSimilarity
    + 0.08 * sig.creatorDiversity + 0.10 * sig.newCreatorShare + 0.05 * sig.platformSpread
    + 0.12 * (1 - sig.engagementSkew);
  let score = 100 * clamp01((S - 0.15) / 0.7);
  score *= Math.min(1, 0.4 + 0.15 * creators);
  if (sig.disclosure >= 0.5 && creators >= 3) score = Math.max(score, 55 + 40 * (sig.disclosure - 0.5));
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Rules, checked in order. Returns { archetype, family } (family = keyword family that fired). */
function archetypeFor(sig, score, fam, streamShare) {
  const top = Object.entries(fam).filter(([k]) => k !== "controversy").sort((a, b) => b[1] - a[1])[0];
  const paidEvidence = sig.disclosure >= 0.35 || (sig.disclosure >= 0.2 && score >= 60);
  if (fam.controversy >= 0.3 && sig.disclosure < 0.3) return { archetype: "controversy", family: "controversy" };
  if (paidEvidence) {
    if (streamShare >= 0.5) return { archetype: "streamer-sponsorship", family: null };
    if (fam.launch >= 0.3 && sig.platformSpread >= 0.35) return { archetype: "launch-blitz", family: "launch" };
    return { archetype: "sponsored-creator-wave", family: null };
  }
  // One post holding most of the attention, nothing disclosed: virality beats loose keyword matches.
  if (sig.engagementSkew >= 0.6 && sig.disclosure < 0.15 && (!top || top[1] < 0.6)) return { archetype: "organic-viral", family: null };
  if (fam.launch >= 0.3 && sig.platformSpread >= 0.35 && fam.launch >= fam.trailer * 0.8) return { archetype: "launch-blitz", family: "launch" };
  if (top && top[1] >= 0.3) {
    const map = { launch: "trailer-reveal", trailer: "trailer-reveal", update: "update-drop", event: "event-or-esports" };
    // a launch-only cluster that stayed on one or two platforms reads as a reveal/release moment
    return { archetype: map[top[0]], family: top[0] };
  }
  if (score >= 60) return { archetype: streamShare >= 0.5 ? "streamer-sponsorship" : "sponsored-creator-wave", family: null };
  if (sig.engagementSkew >= 0.4 || sig.synchronicity >= 0.35) return { archetype: "organic-viral", family: null };
  return { archetype: "background-chatter", family: null };
}

function keywordsFor(members, df, N, gameSet) {
  const n = members.length;
  const cdf = new Map();
  for (const p of members) for (const k of p.terms.keys()) cdf.set(k, (cdf.get(k) || 0) + 1);
  const minC = Math.max(2, Math.ceil(0.15 * n));
  const scored = [];
  for (const [k, c] of cdf) {
    if (c < minC) continue;
    const parts = k.split(" ");
    if (parts.some((w) => KEYWORD_SKIP.has(w) || gameSet.has(w))) continue;
    if (N >= 20 && df.get(k) / N > 0.5) continue;
    const idf = Math.log((N + 1) / (df.get(k) + 0.5));
    scored.push([k, (c / n) * idf * (parts.length > 1 ? 1.25 : 1)]);
  }
  scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = [];
  for (const [k] of scored) {
    if (out.length >= 6) break;
    const parts = k.split(" ");
    // skip a unigram already covered by a chosen bigram, and a bigram whose words are both chosen
    if (parts.length === 1 && out.some((o) => o.split(" ").includes(k))) continue;
    if (parts.length > 1 && parts.every((w) => out.includes(w))) {
      for (const w of parts) out.splice(out.indexOf(w), 1);
    }
    out.push(k);
  }
  return out;
}

function topSponsor(members) {
  const c = {};
  for (const p of members) if (p.disc.sponsor) c[p.disc.sponsor] = (c[p.disc.sponsor] || 0) + 1;
  const e = Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return e && e[1] >= 2 ? { name: e[0], count: e[1] } : null;
}

function makeLabel(arch, sponsor, keywords, start, end, isBackground) {
  const range = fmtRange(start, end);
  if (isBackground) return `Background chatter, ${range}`;
  const kw = keywords.slice(0, 2).map((k) => `“${k}”`).join(", ");
  let head;
  if (sponsor && arch === "sponsored-creator-wave") head = `“Sponsored by ${sponsor.name}” creator wave`;
  else if (sponsor && arch === "streamer-sponsorship") head = `${sponsor.name}-sponsored streams`;
  else if (sponsor && arch === "launch-blitz") head = `Launch blitz with ${sponsor.name} sponsorships`;
  else head = kw ? `${ARCH_NAMES[arch]}: ${kw}` : ARCH_NAMES[arch];
  return `${head}, ${range}`;
}

function analyzeCluster(id, members, ctx, isBackground) {
  const { gameSet, firstSeen, rangeStart, nSources, df, N, game } = ctx;
  const n = members.length;
  const creatorsSet = new Set(members.map((p) => p.authorKey));
  const creators = creatorsSet.size;
  const start = members.reduce((m, p) => Math.min(m, p.t), Infinity);
  const end = members.reduce((m, p) => Math.max(m, p.t), -Infinity);

  const discCount = members.filter((p) => p.disc.disclosed).length;
  const timing = timingStats(members);
  const titles = titleStats(members, gameSet);
  const eng = engagementStats(members);

  // New creators: creators whose very first post in the dataset falls inside this cluster.
  // Near the start of the dataset we can't see their history, so shrink toward a neutral 0.5
  // in proportion to how much history (up to 7 days) exists before the cluster.
  const firstInCluster = new Map();
  for (const p of members) if (!firstInCluster.has(p.authorKey) || p.t < firstInCluster.get(p.authorKey)) firstInCluster.set(p.authorKey, p.t);
  let newCount = 0;
  for (const [a, t] of firstInCluster) if (firstSeen.get(a) >= t) newCount++;
  const rawNew = creators ? newCount / creators : 0;
  const histConf = Math.min(1, (start - rangeStart) / (7 * DAY));
  const newShare = histConf * rawNew + (1 - histConf) * 0.5;

  const signals = {
    disclosure: round(n ? discCount / n : 0),
    synchronicity: round(timing.sync),
    titleSimilarity: round(titles.sim),
    creatorDiversity: round(n > 1 ? (creators - 1) / (n - 1) : 0),
    newCreatorShare: round(clamp01(newShare)),
    platformSpread: round(platformSpread(members, nSources)),
    engagementSkew: round(eng.skew),
  };
  let score = campaignScore(signals, creators);
  const sources = countBy(members, (p) => p.source);
  const streamShare = members.filter((p) => p.kind === "stream" || p.source === "twitch").length / (n || 1);
  const fam = {};
  for (const [k, re] of Object.entries(FAMILIES)) fam[k] = members.filter((p) => re.test(p.lower)).length / (n || 1);

  let archetype, family;
  if (isBackground) { archetype = "background-chatter"; family = null; score = Math.min(score, 40); }
  else ({ archetype, family } = archetypeFor(signals, score, fam, streamShare));

  const keywords = keywordsFor(members, df, N, gameSet);
  const sponsor = topSponsor(members);
  const label = makeLabel(archetype, sponsor, keywords, start, end, isBackground);

  // ---- reasons (numbers first, written for a learner) ----
  const R = [];
  const paidish = PAID_ARCHETYPES.has(archetype) || score >= 50;
  if (discCount > 0) {
    const lab = countBy(members.flatMap((p) => p.disc.labels), (x) => x);
    const top = Object.keys(lab).slice(0, 3).map((x) => `“${x}”`).join(", ");
    let s = `${discCount} of ${n} posts carry a sponsorship disclosure (${top})`;
    if (sponsor) s += `; ${plural(sponsor.count, "post")} name ${sponsor.name} as the sponsor`;
    R.push({ w: signals.disclosure >= 0.3 ? 10 : 4 + 6 * signals.disclosure, text: s + "." });
  } else {
    R.push({ w: score >= 45 ? 8 : 5, text: score >= 45
      ? `None of the ${n} posts carry a sponsorship disclosure, so if this push was paid it was not labelled.`
      : `None of the ${n} posts carry a sponsorship disclosure (#ad, “sponsored by”, “paid partnership”…).` });
  }
  if (n >= 3 && signals.synchronicity >= 0.3) {
    R.push({ w: 3 + 6 * signals.synchronicity, text: `${plural(timing.peakCreators, "creator")} posted ${timing.peakCount} of the ${n} items within ${fmtHours(Math.max(1, (timing.peakEnd - timing.peakStart) / HOUR))} (${fmtDayTime(timing.peakStart)} to ${fmtDayTime(timing.peakEnd)} UTC)${paidish ? ", the kind of tight go-live window a campaign brief sets" : ""}.` });
  } else if (n >= 3) {
    R.push({ w: isBackground ? 6 : 3, text: `Posts are spread over ${fmtHours(Math.max(1, timing.spanH))} with no tight peak, which is how steady, unpaid interest usually looks.` });
  }
  if (titles.phrase) {
    R.push({ w: 2 + 7 * signals.titleSimilarity, text: `${titles.phraseCount} of ${n} titles share the phrase “${titles.phrase}”${paidish ? " — a sign of a shared brief or talking points" : " — everyone is reacting to the same thing"}.` });
  }
  if (eng.known) {
    const share = Math.round(eng.topShare * 100);
    const topWord = eng.k === 1 ? "post" : `${eng.k} posts`;
    if (signals.engagementSkew >= 0.45) {
      R.push({ w: 3 + 7 * signals.engagementSkew, text: `One post dominates: ${quote(eng.top.displayTitle, 60)} by ${eng.top.author} holds ${share}% of the cluster’s engagement${eng.views ? ` (${fmtNum(eng.views)} views in total)` : ""}, the classic shape of organic virality.` });
    } else if (signals.engagementSkew <= 0.25 && n >= 5) {
      R.push({ w: paidish ? 7 : 3, text: `Engagement is spread evenly: the top ${topWord} hold${eng.k === 1 ? "s" : ""} only ${share}% of the total${eng.views ? ` (${fmtNum(eng.views)} views)` : ""}, typical of many similar-sized creators being booked at once.` });
    }
  }
  if (histConf >= 0.5 && creators >= 3) {
    R.push({ w: paidish ? 2 + 4 * rawNew : 2, text: `${newCount} of ${creators} creators had not posted about ${game || "the game"} earlier in the dataset${paidish && rawNew >= 0.6 ? ", so the coverage was likely prompted rather than habitual" : ""}.` });
  }
  if (creators >= 2 && signals.creatorDiversity < 0.3 && n >= 4) {
    const byA = countBy(members, (p) => p.author);
    const [a, c] = Object.entries(byA)[0];
    R.push({ w: 7, text: `${a} made ${c} of the ${n} posts, so this is mostly one creator’s series rather than a coordinated wave.` });
  }
  if (family && fam[family] > 0) {
    R.push({ w: 9, text: `${pct(fam[family])} of posts use ${FAMILY_WORDS[family]}${keywords[0] ? ` (top keyword “${keywords[0]}”)` : ""}.` });
  }
  if (archetype === "streamer-sponsorship") {
    const k = members.filter((p) => p.kind === "stream" || p.source === "twitch").length;
    R.push({ w: 8.5, text: `${k} of ${n} items are live streams or stream VODs; studios often pay streamers per hour live or per average concurrent viewer.` });
  }
  const fol = members.map((p) => p.followers).filter((x) => x != null);
  if (fol.length >= 3 && (paidish || archetype === "organic-viral")) {
    const med = median(fol);
    R.push({ w: 4, text: `Median creator size is ${fmtNum(med)} followers (${tierOf(med)} tier)${paidish && med >= 10e3 && med < 500e3 ? ", the band studios most often book in bulk" : ""}.` });
  }
  const srcList = Object.entries(sources).map(([s, c]) => `${srcName(s)} (${c})`).join(", ");
  R.push({ w: 2 + 2 * signals.platformSpread, text: `Platforms: ${srcList}.` });

  R.forEach((r, i) => { r.i = i; });
  const reasons = R.sort((a, b) => b.w - a.w || a.i - b.i).slice(0, 5).map((r) => r.text);

  const topPosts = [...members].sort((a, b) => (b.eng ?? -1) - (a.eng ?? -1) || (a.id < b.id ? -1 : 1)).slice(0, 5).map((p) => p.id);

  return {
    id, label, keywords, postIds: members.map((p) => p.id), start: iso(start), end: iso(end),
    creators, sources, signals, campaignScore: score, archetype, reasons, topPosts,
    _n: n, _views: eng.views, _sponsor: sponsor, _bg: isBackground, _s: start, _e: end,
  };
}

// ---------------------------------------------------------------------------------------------
// Step 6: insights

function buildInsights(clusters, bursts, posts, totals, ctx) {
  const out = [];
  const N = posts.length;
  const { game, badDates } = ctx;
  const srcTop = Object.entries(totals.bySource);
  const nSrc = srcTop.length;
  const days = Math.max(1, Math.round((posts[N - 1].t - posts[0].t) / DAY));
  out.push(`${N} posts from ${totals.creators} creators across ${plural(nSrc, "platform")} over ${plural(days, "day")}; ${srcName(srcTop[0][0])} carries ${pct(srcTop[0][1] / N)} of the volume.`);

  const real = clusters.filter((c) => !c._bg);
  const paid = real.filter((c) => c.campaignScore >= 55);
  const organic = real.filter((c) => c.campaignScore < 55);
  const bg = clusters.find((c) => c._bg);
  if (paid.length) {
    const best = [...paid].sort((a, b) => b.campaignScore - a.campaignScore || b._n - a._n)[0];
    const d = Math.round(best.signals.disclosure * best._n);
    out.push(`Strongest paid signal: ${best.label} (campaign score ${best.campaignScore}/100) — ${plural(best._n, "post")} from ${plural(best.creators, "creator")}${d ? `, ${d} with disclosures` : ", none disclosed"}.`);
  } else {
    const dTot = posts.filter((p) => p.disc.disclosed).length;
    out.push(`No cluster looks like a coordinated paid push; only ${pct(dTot / N)} of posts carry a sponsorship disclosure, so most of the conversation about ${game || "this game"} appears organic.`);
  }
  if (real.length) {
    const pN = paid.reduce((s, c) => s + c._n, 0), oN = organic.reduce((s, c) => s + c._n, 0), bN = bg ? bg._n : 0;
    out.push(`Share of volume: ${pct(pN / N)} in likely-paid clusters, ${pct(oN / N)} in organic or event-driven clusters, ${pct(bN / N)} background chatter.`);
  }
  if (paid.length) {
    const ps = {};
    let tot = 0;
    for (const c of paid) for (const [s, v] of Object.entries(c.sources)) { ps[s] = (ps[s] || 0) + v; tot += v; }
    const [s, v] = Object.entries(sortedObj(ps))[0];
    if (tot >= 5) out.push(`Paid activity concentrates on ${srcName(s)} (${pct(v / tot)} of likely-paid posts)${s === srcTop[0][0] ? "" : `, even though ${srcName(srcTop[0][0])} has the most posts overall`}.`);
  }
  if (bursts.length) {
    const b = [...bursts].sort((x, y) => y.count - y.baseline - (x.count - x.baseline) || (x.start < y.start ? -1 : 1))[0];
    const over = real.map((c) => ({ c, o: Math.max(0, Math.min(c._e, b._e) - Math.max(c._s, b._s)) }))
      .filter((x) => x.o > 0 || (x.c._s >= b._s && x.c._s < b._e)).sort((x, y) => y.c._n - x.c._n)[0];
    out.push(`Biggest influx: ${fmtRange(b._s, b._e - 1)} with ${b.count} posts against roughly ${Math.round(b.baseline)} expected (z = ${b.z})${over ? `, driven by ${over.c.label}` : ""}.`);
  }
  if (paid.length && organic.length) {
    const avg = (cs) => { const n = cs.reduce((s, c) => s + c._n, 0); return n ? cs.reduce((s, c) => s + c._views, 0) / n : 0; };
    const a = avg(paid), b = avg(organic);
    if (a > 0 && b > 0) out.push(`Average views per post: ${fmtNum(a)} in likely-paid clusters vs ${fmtNum(b)} in organic ones — ${a >= b ? "the paid push bought reach" : "organic moments out-performed the paid push"}.`);
  }
  if (badDates) out.push(`${plural(badDates, "post")} had no readable date and ${badDates === 1 ? "was" : "were"} skipped.`);
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------------------------
// Entry point

/**
 * @param {Array} posts normalized posts (see CONTRACT / sources.js)
 * @param {{ game?: string, now?: number, bucketHours?: number }} opts
 */
export function analyze(posts, opts = {}) {
  const game = String(opts?.game || "");
  const now = Number.isFinite(opts?.now) ? opts.now : Date.now();
  const gameSet = gameTokenSet(game);
  const { posts: P, badDates } = prepare(posts, gameSet);

  if (!P.length) {
    return {
      game, range: { start: null, end: null }, bucketHours: chooseBucketHours(0, opts?.bucketHours),
      totals: { posts: 0, creators: 0, bySource: {}, byKind: {} },
      timeline: [], bursts: [], clusters: [],
      insights: [badDates
        ? `None of the ${badDates} posts had a readable date, so nothing could be analysed.`
        : `No posts found${game ? ` for ${game}` : ""}. Try another spelling, a longer time window, or add API keys for more platforms.`],
    };
  }

  const startMs = P[0].t;
  let endMs = P[P.length - 1].t;
  // If data stops shortly before "now", extend the timeline so a recent lull is visible.
  if (now > endMs && now - endMs <= Math.min(7 * DAY, Math.max(HOUR, (endMs - startMs) * 0.25))) endMs = now;
  const bh = chooseBucketHours(endMs - startMs, opts?.bucketHours);
  const { buckets, size } = buildTimeline(P, startMs, endMs, bh);
  const bursts = detectBursts(buckets, size, P);

  const totals = {
    posts: P.length,
    creators: new Set(P.map((p) => p.authorKey)).size,
    bySource: countBy(P, (p) => p.source),
    byKind: countBy(P, (p) => p.kind),
  };

  const { vecs, df } = vectorize(P);
  const { groups, rest } = clusterPosts(P, vecs, endMs - startMs);
  const firstSeen = new Map();
  for (const p of P) if (!firstSeen.has(p.authorKey)) firstSeen.set(p.authorKey, p.t);
  const ctx = { gameSet, firstSeen, rangeStart: startMs, nSources: Object.keys(totals.bySource).length, df, N: P.length, game, badDates };

  // A group with no burst-like or campaign-like character (a recurring question, a weekly
  // series) is ongoing chatter, not an influx: fold it into the background cluster.
  let clusters = [];
  const restIdx = [...rest];
  for (const g of groups) {
    const c = analyzeCluster("", g.map((k) => P[k]), ctx, false);
    if (c.archetype === "background-chatter") restIdx.push(...g);
    else clusters.push(c);
  }
  clusters.forEach((c, i) => { c.id = `c${i + 1}`; });
  restIdx.sort((a, b) => a - b);
  if (restIdx.length) clusters.push(analyzeCluster("background", restIdx.map((k) => P[k]), ctx, true));

  const insights = buildInsights(clusters, bursts, P, totals, ctx);

  return {
    game,
    range: { start: iso(startMs), end: iso(endMs) },
    bucketHours: bh,
    totals,
    timeline: buckets.map((b) => ({ t: iso(b.t0), count: b.count, bySource: sortedObj(b.bySource), views: b.views })),
    bursts: bursts.map(({ _s, _e, ...b }) => b),
    clusters: clusters.map(({ _n, _views, _sponsor, _bg, _s, _e, ...c }) => c),
    insights,
  };
}
