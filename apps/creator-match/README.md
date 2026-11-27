# Creator Match: find the right creators for your game

Creator Match is a free tool for small game publishers and solo developers. Give it a game, even an unreleased one with no Steam page (a name and a few Steam tags are enough). It finds YouTubers, Steam curators and Twitch streamers who recently covered similar games, ranks them by fit, and drafts a short pitch for each. It also tracks your outreach and the Steam keys you send. It does the job of the paid tiers of key-distribution platforms and a PR agency's influencer list. It needs no account and no API key.

## Use it

1. **Pick or enter your game.** Choose a Steam game, or type a name and tags in order of importance (for example `Roguelite, Deckbuilding, Pixel Graphics`). A one-line pitch helps the drafts.
2. **Filter** by platform, language, size (micro under 10K, small 10K to 50K, mid 50K to 250K, large 250K+; all sizes by default) and how recently creators were active (90 days by default).
3. **Read the list.** Every creator has a 0 to 100 score and two to four plain reasons, for example *"Covered 3 Roguelite games in the last 60 days, incl. 'Gloomcrawl' (42K views)"*, plus the matching videos or reviews.
4. **Draft a pitch.** Pick a tone (friendly, professional, brief). The draft names the creator's own recent coverage, includes a key or a Curator Connect copy, and leaves anything it doesn't know as a `[bracketed placeholder]` for you to fill in. Unreleased games get a pre-launch version with a release window, a preview key or demo, and a wishlist ask.
5. **Track it.** Move each creator through *Shortlist, Pitched, Replied, Key sent, Covered, Declined*, and record which keys went where. The summary shows reply and coverage rates, keys sent, and who is due a follow-up (pitched more than 7 days ago with no reply). Follow up once, then move on.

## How the score works

The score measures relevance only. Follower count never raises or lowers it, so a 2M-subscriber channel that plays games like yours ranks as high as a small one. Use the size filter to choose the audience size you want.

| Points | Component | What it measures |
|---|---|---|
| 40 | Similar coverage | Each covered game's tag overlap with your game (your first tags count most), times recency (half-life 60 days), summed and capped. A creator who already covered *your* game gets a big boost and is flagged. |
| 30 | Tag affinity | The creator's tag weights for your tags, weighted by tag order. Generic tags such as *Indie* or *Singleplayer* count at 30% and can't make a match on their own. |
| 15 | Activity | Days since the last upload or review, and uploads per month. |
| 10 | Language | Matches the language you filter for (full marks for everyone when you don't filter). |
| 5 | Engagement | Average views compared with followers, measured against a typical ratio for each platform. |

Each result also has a `profile`: how many of the creator's games were demos, upcoming games or titles under 5K reviews, and how many were 100K+ review hits. This is information only and is never scored.

## Outreach guide

The app's tips come from published advice: Chris Zukowski (howtomarketagame.com), Steamworks' Curator Connect docs, GDC talk write-ups, press-kit and outreach guides, and the FTC's influencer disclosure guide. Source links are listed in the app. In short:

- Pitch people who recently played games like yours, not the biggest names in general.
- Send the key with the first email; don't make creators ask. Use **Steam Curator Connect** for curators.
- Keep it under about 150 words, with one clear ask, the embargo or release date, and a press kit or trailer link.
- Write to one person at a time. No mass mail, and no fake flattery.
- Follow up once after about a week.
- Creators must disclose free keys (FTC). Ask them to, and never ask for a positive review.

## Where the creator data comes from

GitHub Actions rebuilds the data every day from public sources:

- **Steam curators:** public curator pages and their recent reviews.
- **YouTube channels that curators link to** from their public curator pages, with recent videos. This uses the YouTube Data API only if the optional `YOUTUBE_API_KEY` repo secret is set.
- **Steam store data** for the tags of the games they covered.

If the fetch fails, the site uses the committed snapshot in `data/creators.json`, marked `source: "sample"`. Activity is then measured from the snapshot's date, so the list doesn't empty out as the snapshot ages.

## Privacy

- **No scraped emails.** The data only has publicly listed links (websites, socials) that creators chose to show. You contact people through their own published channels.
- **Your outreach stays in your browser.** Stages, notes and keys are stored locally and never uploaded. Use **Export** (CSV for spreadsheets, JSON for backup) and **Import** to move them between devices. The CSV export neutralises spreadsheet formulas, so a creator name like `=HYPERLINK(...)` can't run in Excel or Sheets.

## Limits

- Coverage comes from public sources only. Creators who never link to their channel from Steam, or who only stream without archives, may be missing or have little history.
- Twitch data is thin without a source the build can reach; the ranking works on whatever coverage exists.
- Follower and view counts are as of the last refresh. `avgViews` means different things on each platform (video views on YouTube, average viewers on Twitch).
- Tags drive similarity. A game with vague tags gets vague matches, so put your most specific tags first.
- A key in a draft is a placeholder. The app doesn't generate or validate Steam keys.
- Reply-rate figures in the guide come from single campaigns and vendors, not studies. Treat them as rough.

## Develop

```sh
node --test tests/*.test.mjs        # engine tests (ranking, pitches, pipeline, CSV/JSON)
./scripts/build.sh                  # → dist/, refreshing data/ when the network allows
../../scripts/build-site.sh         # whole site → _site/
```

`match.js` is the engine. It has pure functions with no DOM and no network, and runs in the browser and in Node 22:

- `rankCreators(target, data, { platform, language, sizes, minFollowers, maxFollowers, activeWithinDays = 90, now, limit, excludeIds })` returns `[{ creator, score, reasons, matchedGames, sizeTier, sizeKnown, coveredTarget, profile, breakdown }]`
- `draftPitch(creator, target, { publisher, senderName, tone, keyOffer, access: "key"|"demo"|"playtest"|"none", prelaunch, releaseWindow, launchDate, embargoDate, pressKitUrl, trailerUrl, pressKit: false, steamKey, hook, matchedGames })` returns `{ subject, body, wordCount, placeholders, prelaunch }`
- `draftFollowUp`, `isPrelaunch`
- `STAGES`, `newEntry`, `setStage`, `markFollowedUp`, `pipelineSummary(entries, { now, followUpDays = 7 })`
- `exportCsv(entries, { creators })`, `exportJson`, `importJson(text)`, which returns `{ entries, errors, warnings }` and never throws
- `GUIDE`, `WEIGHTS`, `SIZE_TIERS`

`app.js`, `index.html` and `styles.css` are the UI. `scripts/` holds the data fetch, which runs only at build time.
