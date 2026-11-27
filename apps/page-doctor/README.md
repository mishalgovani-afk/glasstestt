# Page Doctor

A free Steam store-page audit for indie games. Pick a game from Steam, or type in your own game before it has a Steam page. Page Doctor compares the page with the most similar games on Steam and gives you:

- a **score from 0 to 100 and a letter grade**, built from area scores you can check by hand;
- a **checklist** in which every item says what it found, gives the numbers against comparable games ("Comparable games median 9 screenshots; you have 5."), says how to fix it, and links to its source;
- **tag suggestions**: tags to add, remove or move down, a suggested order, and a reason for each;
- **benchmarks** from comparable games: median price, screenshots, languages, short-description length, reviews, followers, and which tags and languages they share;
- a **rewrite prompt**: a ready-to-paste prompt for Claude or ChatGPT that contains your current copy, your comparable games' short descriptions and the copywriting rules, and asks for five short-description options, an About section opening and a top-5 tag order.

It needs no account and no API key. With an optional Anthropic API key, the app can also run the rewrite itself.

## How to use it

1. **Find your game.** Search by name, or choose "My game isn't on Steam yet" and fill in what you have: name, short description, tags, price, languages, screenshot count and whether you have a trailer. A name, a short description and a few tags are enough to start.
2. **Read the grade, then the failing checks.** Each check shows its area (capsule, description, tags, media, price, languages, social proof, timing), what was measured, and a fix. The **manual checklist** below the checks lists what needs your eyes, for example whether the capsule is readable at small size, and it never changes the score.
3. **Apply the tag suggestions** in Steamworks with the tag wizard. Add a suggested tag only if it honestly describes your game.
4. **Copy the rewrite prompt** into Claude or ChatGPT, or add an Anthropic key to run it in the app. Check every factual claim in what comes back.
5. **Re-audit** after the daily data refresh to see the changes.

Unreleased games, and games with no Steam page, get **pre-launch checks** in place of reviews: wishlist momentum (followers x 10-12), whether the Steam page is live early enough, a demo plan, and Next Fest timing. Missing reviews never count against an unreleased game.

## Where the data comes from, refreshed daily

The browser can't read Steam directly, so GitHub Actions does it. The Pages workflow (`.github/workflows/pages.yml`) runs on every push and once a day. It runs `apps/page-doctor/scripts/build.sh`, which copies the app and then runs `scripts/fetch-steam.mjs`. That script collects about 30 indie-relevant tags, using Steam store search and app details, SteamSpy tag votes and owner estimates, the review summary, and community follower counts. For each tag it takes hits, mid-size and small indies released in the last 3 years, plus upcoming games, at no more than one request per second. It also includes every game listed in `watchlist.json`. The result is written to `dist/data/corpus.json`.

If Steam can't be reached, the build still succeeds and uses the committed snapshot in `data/corpus.json`. `corpus.source` is `"live"` or `"sample"`, and the app shows which one it is using. To make sure a particular game is always in the corpus, add its appid to `watchlist.json`.

## Method

**Comparable games** (`findComparables`): every game becomes a weighted tag vector. Each tag's weight comes from:
- **position:** the top 5 count fully, positions 6-15 count 0.6 and 16-20 count 0.3, because Steam says the top 5 describe the game and some filters use the first 15;
- **votes:** relative to the game's most-voted tag;
- **kind:** generic tags such as Indie count 0.35 and broad genres such as Action count 0.6;
- **rarity:** an IDF factor across the corpus, so that sharing "Roguelike Deckbuilder" counts for more than sharing "Singleplayer".

Similarity is the cosine of the two vectors, plus a small bonus for overlapping Steam genres to break ties.

Comparables are then **matched for scale**, so that a game is measured against pages it can realistically copy. The scale measure is log10(reviews), with owners used when there are no reviews. Every target is treated as at least a successful indie, about 1,000 reviews. A comparable within 10x of the target's scale fits fully, and the fit falls off beyond that. As a result:
- **An indie or unreleased game** gets successful indies and upcoming games in its niche. Released games with under 50 reviews count as unproven.
- **A big title** gets big titles.
- **Mega-hits** stay eligible but rank below peers of a similar size.

The final rank is `similarity × (0.6 + 0.4 × scaleFit) + 0.02 × genreOverlap`, so the niche always matters most. Each comparable reports its `tier` (`hit`, `indie`, `small` or `upcoming`), `scaleFit`, review count and owner estimate. The game itself is excluded.

**Checks and sources.** Every rule is in the `RULES` export of `doctor.js`, with https sources:

| Area | What's checked | Sources |
|---|---|---|
| Capsule | Images uploaded (auto). Logo legible at small size, and only art, name and subtitle on it (manual) | Steamworks graphical assets and asset rules; Zukowski's Steam Page Checklist |
| Description | Length against comparable games (Steam allows about 300 characters); genre named in the first sentence; player fantasy and a concrete verb in the first sentence, with no "save the world" clichés (heuristic); no time-based text or calls to action; a features list in the About section; for Early Access, why, how long, current state and pricing | Steamworks description and Early Access docs; Zukowski's checklist |
| Tags | 20 slots used (at least 5 required); top 5 are sub-genre tags, not Indie or Female Protagonist; genre tags that most comparable games have and you lack; order by relevance | Steamworks Steam Tags; Zukowski |
| Media | At least 5 screenshots, compared with the comparable median; a gameplay trailer first; the first 4 screenshots show the core loop (manual) | Steamworks assets and trailers; Zukowski |
| Price | Against the median of comparable paid games. Under 75% of the median is flagged as likely underpriced | Zukowski, "4 tips to help you price your indie game" |
| Languages | Count against the comparable median; big languages that half or more of comparable games support and you don't. Simplified Chinese is Steam's #2 language (31.4% of survey respondents in Sept 2026, 22.0% in Oct 2026); Russian was 9.1% in Sept 2026 | Steam Hardware & Software Survey (reported by iXBT and ShiftDelete); Steamworks localisation |
| Social proof | Released games: review count (no score is shown under 10 reviews; Very Positive needs 80%+ and 50+ reviews), percent positive, followers, and, in the first 60 days, progress towards Zukowski's benchmark of about 250 reviews in the first month. Unreleased games: wishlists (yours, or estimated as followers x 10-12) | Community-documented review thresholds; Steamworks reviews; GameDiscoverCo follower-to-wishlist data; Zukowski via GamesRadar |
| Timing | Demo before launch; dated Next Fest advice (one Next Fest per game, submit the demo 3+ weeks ahead, release it about 10 days ahead for the Press Preview); Steam page live early, and at least 2 weeks before release; release-date precision, and the date lock 14 days before release | Steamworks Next Fest, upcoming events, Coming Soon and release-date docs; Zukowski on Next Fest and page timing |

**Scoring.** Each scored check gets a score from 0 to 1: pass is 1, warn is 0.5, fail is 0, and some checks use a graded value in between. Each check also has a weight. An area's score is the weighted mean of its checks. The total is

```
score = Σ(areaWeight × areaScore) / Σ(areaWeight)   over areas that have at least one scored check
```

| Area | Weight |
|---|---|
| description | 20 |
| tags | 20 |
| media | 15 |
| social proof | 15 |
| capsule | 10 |
| languages | 10 |
| price | 5 |
| timing | 5 |

Grades: A is 85 or more, B 70, C 55, D 40, and F is below 40. Checks without enough data (no price yet, no comparable games) are shown with weight 0. `diagnosis.areas` gives every area's score, so the total can be recomputed by hand.

**Manual checklist.** Rules that need human eyes, or that data can't verify, go in `diagnosis.manualChecklist` (`{id, area, title, detail, fix, sourceUrl}`) and are never scored. Each item also has a `severity`. Examples are capsule legibility, the first 4 screenshots, 4+ screenshots marked suitable for all ages, and the first trailer being gameplay. The list also includes general Steamworks hygiene from `HYGIENE_RULES`: library assets, About subheads and GIFs, regional pricing, the launch discount and the price-increase cooldown, demo notifications, events, the content survey, system requirements and the Steam Deck review.

The research behind these rules is in `src/steam-hygiene.json`. Every researched rule is either an automatic check (mapped in `HYGIENE_AUTOMATED`) or a manual checklist item, and a test enforces that. Items are shown only when they apply, so pre-launch items appear only for unreleased games and Early Access items only for Early Access games. The list is sorted by area, then by severity.

## Limits

- Page Doctor can't see images or video, so capsule quality, screenshot order and trailer pacing are manual checks.
- The "hook" check is a heuristic that looks for a player role, a concrete gameplay verb and clichés. Good copy can fail it, and weak copy can pass it.
- Comparable games are judged by tags, so a game with few or wrong tags gets weak comparables. Tags are also where most pages go wrong.
- Benchmarks describe the corpus, which is at most a few thousand games, not all of Steam. Owner figures are SteamSpy estimates. Follower and wishlist figures are rough rules of thumb that stop applying after launch.
- Review-score thresholds are community-documented; Valve doesn't publish the exact cut-offs. Steam survey language shares move from month to month.
- Next Fest dates are those Valve had announced when this was written (`NEXT_FESTS` in `doctor.js`). Update them as new editions are announced.
- The AI rewrite can be wrong. Check every factual claim before you publish.

## Develop

```sh
node --test apps/page-doctor/tests/*.test.mjs      # engine tests (fixtures + the committed snapshot)
SKIP_FETCH=1 apps/page-doctor/scripts/build.sh     # build dist/ without the network
./scripts/build-site.sh && npx serve _site         # whole site, then open /apps/page-doctor/
```

`doctor.js` is a pure ES module, with no DOM, no network and no clock, so it runs the same in the browser and in Node 22:

```js
import { audit, findComparables, diagnose, rewriteRequest } from "./doctor.js";
const comparables = findComparables(game, corpus, { limit: 20 });
const diagnosis = diagnose(game, comparables, { now: new Date() }); // `now` enables dated Next Fest and page-live advice
const { system, user, model, max_tokens } = rewriteRequest(game, diagnosis); // for the optional Anthropic call
```

A game can be a corpus entry (see `CONTRACT.md`) or a manual object with only some fields. `normalizeGame` accepts tags as strings or `{name, votes}`, languages as an array or a comma-separated string, `screenshots` as an array or a count, `hasTrailer` in place of `movies`, and `wishlists` for the developer's own wishlist count. A game with no appid, URL or header image is treated as a manual, unreleased game.
