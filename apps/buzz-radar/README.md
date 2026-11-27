# Buzz Radar

Type the name of any video game. Buzz Radar pulls recent videos, streams and posts about it from several social platforms, finds the **bursts** (sudden influxes of content) and **clusters** (groups of related posts), and explains whether each cluster looks like a **paid media-buying push** (a sponsored creator wave, a launch blitz, sponsored streams) or something **organic or event-driven** (a viral breakout, a trailer reveal, a patch, a controversy).

It is built for learning media buying as a video game marketing strategy. Every cluster links to a plain-English explainer, and the Learn view walks through how publishers buy creator media, what it costs, how it is timed, how it is disclosed, and how to read a game's content timeline.

Static site: plain HTML, CSS and ES modules. No server, no build step, no external libraries. Your API keys stay in your browser.

## How to use it

1. Open the app and type a game name, for example `Helldivers 2` or `Balatro`.
2. Choose a time window (for example the last 30 days).
3. Optionally add API keys for the sources that need them (see Data sources). Sources without keys are skipped. **Demo mode** loads a synthetic data set with every archetype in it, so you can learn the interface without any keys.
4. Read the result:
   - **Timeline**: posts per time bucket, split by platform, with bursts highlighted.
   - **Clusters**: each has a label, its date range, how many creators and platforms took part, a **campaign score** (0 to 100, how much it looks like a paid push), an **archetype**, the reasons behind the score, and its top posts.
   - **Insights**: a few headline takeaways for the whole game.
   - **Learn**: lessons, a glossary, and a page for each archetype with real, sourced examples.

## Data sources

_Placeholder: the final list of sources, what each returns, and step-by-step key setup are filled in from the connector implementation (`sources.js`)._

| Source | Needs a key? | What it contributes | How to get a key |
|---|---|---|---|
| YouTube | Yes (YouTube Data API key) | Videos, Shorts and streams; views, likes, comments; descriptions with disclosure text | _TBD_ |
| Twitch | Yes (Client ID + access token) | Live streams and VODs; viewer counts; stream titles | _TBD_ |
| Reddit | No | Posts and flairs | n/a |
| Bluesky | Optional (handle + app password) | Posts and hashtags | _TBD_ |
| Mastodon | No | Posts and hashtags | n/a |
| Hacker News | No | Articles and discussion | n/a |

Keys are stored only in your browser's local storage on this device and are sent only to the platform they belong to.

## How clusters and scores are computed (high level)

The analysis engine (`analysis.js`) is pure JavaScript with no network access:

1. **Timeline**: posts are grouped into fixed time buckets (hourly for short windows, up to daily or weekly for long ones).
2. **Bursts**: each bucket is compared with a robust rolling baseline (median of nearby buckets). Buckets well above the baseline seed a burst.
3. **Clusters**: posts are grouped by similar wording in their titles, text and tags, restricted to posts close in time. Posts that do not fit any group form one "background chatter" cluster.
4. **Signals** (each 0 to 1) per cluster:
   - **disclosure**: share of posts with disclosure language (#ad, #sponsored, "sponsored by", "paid partnership", "thanks to ... for sponsoring", creator codes, "key provided by"). The phrase list lives in `playbook.js` as `DISCLOSURE_PATTERNS`.
   - **synchronicity**: how tightly posts from different creators bunch in time.
   - **titleSimilarity**: how template-like the titles are (shared word sequences).
   - **creatorDiversity**: many distinct creators versus one creator posting a lot.
   - **newCreatorShare**: share of creators who had not covered the game earlier in the window.
   - **platformSpread**: how many platforms are involved.
   - **engagementSkew**: whether views are concentrated in a few posts (typical of virality) or spread evenly (typical of a buy).
5. **Campaign score and archetype**: the signals are combined into a 0 to 100 score and matched to one of nine archetypes: sponsored creator wave, launch blitz, trailer or reveal spike, sponsored streams, update or season wave, event or esports moment, organic viral breakout, controversy wave, background chatter. Each cluster lists the reasons, with numbers.

## Limits and caveats

- **Correlation is not proof of payment.** A high campaign score means the content looks like a coordinated paid push. Embargo lifts and showcases also make many creators post at once, and free review copies produce disclosure-like language without any payment. Undisclosed deals exist and will be missed.
- **Disclosure detection is text-only.** It reads titles, descriptions, posts and tags. It cannot see YouTube's "Includes paid promotion" overlay or Twitch's branded content flag unless the API exposes them, and it only knows English phrasing.
- **API coverage is partial.** Each platform's search returns a limited, ranked sample, not every post. Some platforms limit how far back search goes, require keys, or rate-limit requests. TikTok, Instagram and X are not covered.
- **Platform sampling skews results.** Platforms differ in who posts and how search ranks results, so platform mix reflects API access as much as real activity.
- **Metrics are snapshots.** View and viewer counts are as reported at fetch time; live viewer counts change by the minute, and public view counts can include paid ad views.
- **Teaching content is sourced, not audited.** Rate figures in the Learn view come from reporting and agency rate guides, and are given as ranges. Follow the links to check them.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | User interface |
| `sources.js` | Platform connectors and `searchAll()` |
| `demo-data.js` | Synthetic demo data set |
| `analysis.js` | Bursts, clusters, signals, scores, archetypes, insights |
| `playbook.js` | Teaching content: archetypes, glossary, lessons, disclosure patterns |
| `tests/*.test.mjs` | Node tests |

## Develop

Serve the folder with any static server and open it, for example from the repo root:

```sh
./scripts/build-site.sh
npx serve _site      # then open /apps/buzz-radar/
```

Run the tests (Node 22+):

```sh
cd apps/buzz-radar
node --test tests/*.test.mjs
```
