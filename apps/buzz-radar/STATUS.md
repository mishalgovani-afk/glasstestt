# Buzz Radar: status board

Shared by Claude Code and Codex. Before you edit a file, check the Owner column. Claim a task by putting your name there, then commit and push. See the root `AGENTS.md`.

**Goal:** type any video game name. The app searches all the big social platforms, finds bursts and clusters of videos, streams and posts, and judges which clusters look like paid media buys. It teaches media buying along the way. **Constraints:** free tier only. The only user setup is one optional Apify token, plus optional YouTube and Twitch keys.

**Branch:** `claude/nice-curie-edh59w`  ·  **Interfaces:** `CONTRACT.md`

## Files

| File | What | Owner now | State |
|---|---|---|---|
| `sources.js`, `demo-data.js`, `tests/sources.test.mjs` | Platform connectors and demo data | Claude agent A | v1 done (10/10 tests). Adding Apify (TikTok/IG/X/FB), Reddit RSS fallback, ad-library links |
| `analysis.js`, `tests/analysis.test.mjs` | Burst detection, clustering, paid-push scoring | Claude agent B | In progress, not landed yet |
| `index.html`, `styles.css`, `app.js` | UI | Claude agent C | v1 done. Adding Apify token group, cost estimate, ad-library panel |
| `playbook.js`, `README.md`, `tests/playbook.test.mjs` | Media-buying teaching content | Claude agent D | In progress |
| Root `index.html`, root `README.md` | Launcher card and table row | Claude (orchestrator) | Done |

## Open tasks (free for anyone to claim)
- [ ] Live-test every connector from a real browser. Claude's sandbox blocks Reddit, Bluesky, Mastodon, Hacker News, Twitch and Apify, so they have not been tested. Record the results here.
- [ ] Integration pass once `analysis.js` lands: demo mode end to end, Playwright screenshots at 375px and 1280px.
- [ ] Finalize the "Data sources" section in the app's `README.md`.

## Known facts
- YouTube Data API allows browser requests from any website (verified). The other platforms are unverified (see the open task).
- Twitch app tokens can't be fetched from a browser, so the user pastes a token.
- Bluesky search may need login (handle plus app password, both optional fields).
- Web search engines do not index TikTok or X content, so a site: search fallback is useless for them.

## Log
- 2026-11-27 Claude: contract written, 4 agents started (A connectors / Sonnet, B engine / Opus, C UI / Sonnet, D research / Opus). Launcher card and README row added.
- 2026-11-27 Claude: A v1 and C v1 landed. Scope expanded to TikTok/IG/X/FB through Apify's free tier, plus ad libraries.
