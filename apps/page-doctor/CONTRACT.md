# Page Doctor + Creator Match: shared build contract

Two new apps for a small indie video-game publisher with little money for agencies or SaaS.
- **Page Doctor** (`apps/page-doctor/`): pick or paste a Steam game. The app compares its store page
  with similar successful games and gives a scored checklist, tag suggestions, and rewritten copy.
- **Creator Match** (`apps/creator-match/`): pick a game. The app finds creators (YouTubers, Steam
  curators, streamers) who recently covered similar games, ranks them by fit, drafts personal pitches,
  and tracks outreach and Steam keys.

Read `/CLAUDE.md`. Rules: static site, relative paths, phone width, no external libraries or CDNs, plain ES modules.
Remote text only via `textContent`; links only if https. Wrap all localStorage in try/catch.
**Least possible effort for the user**: everything works with zero keys and zero accounts.
Optional keys only unlock extras. Don't commit or push; the orchestrator does that. Write only the files you own.

## Data pipeline (the user's browser cannot reach Steam; GitHub Actions can)
Each app has an executable `scripts/build.sh` that writes `dist/`: it copies the app's static files
(everything except `scripts/`, `tests/`, `src/`, `dist/`) and then runs a Node 22 fetch script that writes
fresh JSON into `dist/data/`. **If the fetch fails or there's no network, the build still succeeds**,
using the committed snapshot in `data/`. Fetch scripts use only built-in `fetch` with polite rate limits
(≤ 1 request/second to Steam), a descriptive User-Agent, and retries. The GitHub Pages workflow runs these
builds on push and on a daily schedule. Optional repo secret `YOUTUBE_API_KEY` is exposed as env; it must work without it.

### Page Doctor data: `data/corpus.json`
```js
{ generatedAt: ISO, source: "live" | "sample",
  games: [ { appid: number, name, url, shortDescription, aboutText /* plain text */, 
    tags: [ { name, votes } ],    // user-defined Steam tags, in order
    genres: [string], priceUSD: number|null, isFree: bool, releaseDate: string, comingSoon: bool,
    developers: [string], publishers: [string],
    headerImage: url, capsuleImage: url|null, screenshots: [url], movies: number,
    languages: [string], fullAudioLanguages: [string],
    reviews: { total: n|null, positivePct: n|null, scoreDesc: string|null },
    followers: n|null, ownersRange: string|null, ccu: n|null,
    hasDemo: bool|null, earlyAccess: bool } ],
  tagIndex: { "<tag>": [appid, …] } }   // which games are in the corpus for each tag
```
The corpus covers the top ~40 games for ~30 indie-relevant tags (by owners or CCU, released in the last 3 years),
plus every game in `apps/page-doctor/watchlist.json` (`{ "appids": [..] }`, which the user edits through chat).

### Creator Match data: `data/creators.json`
```js
{ generatedAt: ISO, source: "live" | "sample",
  creators: [ { id: "youtube:UC…" | "curator:123" | "twitch:login",
    platform: "youtube" | "steam-curator" | "twitch",
    name, url, avatar: url|null, followers: n|null, language: string|null,
    lastActive: ISO|null, uploadsPerMonth: n|null, avgViews: n|null,
    coveredGames: [ { appid: n|null, name, url, date: ISO|null, title, views: n|null } ],
    tagAffinity: { "<steam tag>": weight 0..1 },
    links: [ { label, url } ]          // only publicly listed links (website, socials). NO scraped emails.
  } ],
  games: [ { appid, name, tags: [string] } ] }  // games referenced by coveredGames, with tags
```

## Module interfaces (pure, no DOM, no network; run in browser and in Node 22)
`apps/page-doctor/doctor.js`:
```js
export function findComparables(game, corpus, { limit = 20 }) => [{ game, similarity, sharedTags }]
export function diagnose(game, comparables) => {
  score: 0..100, grade: "A".."F",
  checks: [ { id, area: "capsule"|"description"|"tags"|"media"|"price"|"languages"|"social-proof"|"timing",
              status: "pass"|"warn"|"fail", title, detail /* cites numbers vs comps */, fix } ],
  tagSuggestions: { add: [{tag, why}], remove: [{tag, why}], reorder: [tag] },
  benchmarks: { medianPrice, medianScreenshots, medianLanguages, medianDescLength, … },
  rewritePrompt: string   // a ready prompt the user can paste into Claude/ChatGPT for rewrites
}
export function rewriteRequest(game, diagnosis) => { system, user }  // used only if the user adds an optional Anthropic key
```
`apps/creator-match/match.js`:
```js
export function rankCreators(target /* {name, tags:[string], appid?} */, data, { platform?, minFollowers?, maxFollowers?, language?, activeWithinDays = 90 })
  => [ { creator, score: 0..100, reasons: [string], matchedGames: [...] , sizeTier: "micro"|"small"|"mid"|"large" } ]
export function draftPitch(creator, target, { publisher, keyOffer = true, tone = "friendly" }) => { subject, body }
export const STAGES = ["shortlist","pitched","replied","key-sent","covered","declined"];
export function pipelineSummary(entries) => { byStage, coverageRate, keysSent, keysRedeemedUnknown, … }
export function exportCsv(entries) / importJson(text)
```
Outreach entries (stored in the browser and exportable): `{ creatorId, stage, notes, keys: [string], history: [{stage, at}] }`.

## File ownership
| Files | Owner |
|---|---|
| both apps' `scripts/*`, `data/*.json`, `watchlist.json`, `tests/data.test.mjs` | Agent DATA |
| `page-doctor/doctor.js`, `page-doctor/tests/doctor.test.mjs`, `page-doctor/README.md` | Agent DOCTOR |
| `creator-match/match.js`, `creator-match/tests/match.test.mjs`, `creator-match/README.md` | Agent MATCH |
| both apps' `index.html`, `styles.css`, `app.js` | Agent UI |
| `.github/workflows/*`, root `index.html`, root `README.md`, `STATUS.md`, `CONTRACT.md` | Orchestrator |
