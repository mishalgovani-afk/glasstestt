# Buzz Radar — shared build contract (read fully before writing code)

App: `apps/buzz-radar/` in repo /home/user/glasstestt. Read /home/user/glasstestt/CLAUDE.md.
Goal: the user types any video game name; the app searches social platforms for recent
videos / streams / posts about it, detects INFLUXES (bursts over time) and CLUSTERS of
content, and explains whether each cluster looks like a paid media-buying push
(sponsored creator wave, launch blitz…) or organic/event-driven. The user wants to LEARN
media buying as a video-game marketing strategy, so explanations matter.

Hard rules: static site, no server, no build step. Plain ES modules loaded by
`<script type="module" src="./app.js">`. RELATIVE PATHS ONLY. No external libraries
(no CDN). Must work at phone width. Never insert remote text via innerHTML (use
textContent); only make https: links clickable. Wrap every localStorage access in try/catch.
Do NOT git commit or push — the orchestrator does that. Only write the files you own.

## File ownership
| File | Owner |
|---|---|
| `sources.js`, `demo-data.js`, `tests/sources.test.mjs` | Agent A (connectors) |
| `analysis.js`, `tests/analysis.test.mjs` | Agent B (engine) |
| `index.html`, `styles.css`, `app.js` | Agent C (UI) |
| `playbook.js`, `README.md`, `tests/playbook.test.mjs` | Agent D (media-buying research) |
The orchestrator edits root `index.html` / root `README.md` itself.

## Post (normalized item) — produced by sources.js, consumed by analysis.js
```js
{
  id: "youtube:abc123",          // `${source}:${nativeId}`, unique
  source: "youtube",             // one of SOURCE ids below
  kind: "video" | "stream" | "post" | "short" | "article",
  url: "https://…",
  title: "string",               // may be "" for posts
  text: "string",                // description/body, plain text, may be ""
  author: "display name",
  authorId: "stable id or handle",
  authorFollowers: number|null,  // subscribers / followers when known
  publishedAt: "ISO-8601 string",
  metrics: { views: n|null, likes: n|null, comments: n|null, viewers: n|null },
  tags: ["string"],              // hashtags/flairs/game tags, lowercase, no '#'
  lang: "en" | null,
}
```

## sources.js exports
```js
export const SOURCES = [ { id, name, kinds:[…], needsKey:boolean,
   keyFields:[{name:"apiKey", label:"YouTube API key", help:"how to get it (1-2 sentences)", url:"https://…"}],
   search: async (game, { keys, sinceDays, signal, limit }) => Post[] } , … ];
export async function searchAll(game, { keys, sinceDays=30, signal, onProgress }) 
   // runs every source whose keys are present (or that needsKey:false) in parallel;
   // onProgress({source, status:"loading"|"done"|"error"|"skipped", count, error})
   // returns { posts: Post[] (deduped), errors: [{source, message}] }
```
Source ids to use: "youtube", "twitch", "reddit", "bluesky", "mastodon", "hackernews"
(add others if they genuinely work from a browser; drop ones that can't).

## demo-data.js exports
`export function demoPosts(game, now = Date.now()) => Post[]` — clearly synthetic sample
set (~250 posts over 30 days, multiple platforms) that contains: a sponsored creator wave
(many mid-size creators posting within ~48h with "#ad", "sponsored by", "thanks to X for
sponsoring", similar titles), a launch/trailer spike, a patch/season update wave, an
organic viral clip cluster, and steady background chatter. Used for Demo mode and tests.
Mark every demo post's url as "https://example.com/demo/…".

## analysis.js exports (pure, no DOM, no network; must run in Node 22)
```js
export function analyze(posts, { game, now = Date.now(), bucketHours = auto }) => Report
Report = {
  game, range: { start, end }, bucketHours,
  totals: { posts, creators, bySource: {youtube: n, …}, byKind: {video: n, …} },
  timeline: [ { t: ISO bucket start, count, bySource: {…}, views } ],
  bursts: [ { id, start, end, peak, count, baseline, z, sourceMix:{…} } ],
  clusters: [ {
     id, label,                     // human label e.g. "“Sponsored by X” creator wave, Mar 3–5"
     keywords: [string],            // top distinguishing terms
     postIds: [string], start, end, // ISO
     creators: n, sources: {…},
     signals: {                     // all 0..1
       disclosure,      // share of posts with #ad / sponsored / paid partnership / "thanks to … for sponsoring" / "#partner" / "code …" etc.
       synchronicity,   // how tightly posts bunch in time (many creators within hours)
       titleSimilarity, // template-y titles (shared n-grams)
       creatorDiversity,// many distinct creators vs one creator posting a lot
       newCreatorShare, // creators who hadn't covered the game earlier in the window
       platformSpread,  // number of platforms involved, normalized
       engagementSkew   // views concentrated in a few posts (viral) vs evenly spread (bought)
     },
     campaignScore: 0..100,         // likelihood this is a paid media push
     archetype: one of ARCHETYPE_IDS,
     reasons: [string],             // 2-5 plain-English bullet reasons, cite numbers
     topPosts: [postId]             // up to 5 by views/engagement
  } ],
  insights: [string]               // 3-6 headline takeaways for the whole game
}
export const ARCHETYPE_IDS = ["sponsored-creator-wave","launch-blitz","trailer-reveal",
  "streamer-sponsorship","update-drop","event-or-esports","organic-viral","controversy",
  "background-chatter"];
```

## playbook.js exports (content for the Learn view + cluster explanations)
```js
export const ARCHETYPES = { "<archetype id>": { name, oneLiner, whatItIs, howToSpot:[…],
   whyStudiosDoIt, typicalCost, examples:[{game, year, note, sourceUrl}] } , … }  // every ARCHETYPE_ID
export const GLOSSARY = [ { term, definition } ];        // CPM, CPV, flat-fee sponsorship, rev share, UA, wishlist, …
export const LESSONS = [ { id, title, body: [paragraph strings], sources:[{title,url}] } ];
export const DISCLOSURE_PATTERNS = [ { pattern: "regex source string", flags:"i", label } ];
```
analysis.js must not import playbook.js (keep engine self-contained); app.js joins them by archetype id.

## Contract additions (scope change: all big platforms, free tier)
- New SOURCES ids `tiktok`, `instagram`, `x`, `facebook` (if a keyword actor exists) via Apify
  (`https://api.apify.com/v2/acts/<actor>/run-sync-get-dataset-items`). They share one token:
  entries carry `keyGroup: "apify"`; `export const KEY_GROUPS = { apify: { name, keyFields } }`.
  Keys are stored as `keys[keyGroup || sourceId][fieldName]`. Default cap 100 results/platform/search.
- `export function estimateApifyCostUSD(limitPerSource)`.
- Reddit falls back to `https://www.reddit.com/search.rss` when JSON fails.
- `export function adLibraryLinks(game, publisher?) => [{name, url, note}]` — no-login deep links to
  Meta Ad Library, Google Ads Transparency Center, TikTok Ad Library, TikTok Creative Center.
- UI derives its platform list and colours from SOURCES; Settings renders each KEY_GROUP once.
