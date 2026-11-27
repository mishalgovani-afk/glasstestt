# Buzz Radar: status board

Shared by Claude Code and Codex. Before you edit a file, check the Owner column. Claim a task by putting your name there, then commit and push. See the root `AGENTS.md`.

**Goal:** type any video game name. The app searches all the big social platforms, finds bursts and clusters of videos, streams and posts, and judges which clusters look like paid media buys. It teaches media buying along the way. **Constraints:** free tier only. The only user setup is one optional Apify token, plus optional YouTube and Twitch keys.

**Branch:** `claude/nice-curie-edh59w`  ·  **Interfaces:** `CONTRACT.md`

## Files

| File | What | Owner now | State |
|---|---|---|---|
| `sources.js`, `demo-data.js`, `tests/sources.test.mjs` | Platform connectors and demo data | free | Done (14/14 tests) |
| `analysis.js`, `tests/analysis.test.mjs` | Burst detection, clustering, paid-push scoring | free | Done (14/14 tests) |
| `index.html`, `styles.css`, `app.js` | UI | free | v2 done: Apify token group, cost estimate, ad-library panel |
| `playbook.js`, `README.md`, `tests/playbook.test.mjs` | Media-buying teaching content | free | Done: 9 archetypes, 31 terms, 9 lessons, 20 disclosure patterns (8/8 tests). Sources were read through search excerpts only, because page fetches were blocked |
| `MEDIA-BUYING-BRIEF.md` | ~1,300-word sourced learning brief for the user | free | Done |
| Root `index.html`, root `README.md` | Launcher card and table row | Claude (orchestrator) | Done |

## Open tasks (free for anyone to claim)
- [ ] See `CODEX-TASKS.md`.

## Log
- 2026-11-27 Claude: contract written, 4 agents started (A connectors / Sonnet, B engine / Opus, C UI / Sonnet, D research / Opus). Launcher card and README row added.
- 2026-11-27 Claude: A v1 and C v1 landed. Scope expanded to TikTok/IG/X/FB through Apify's free tier, plus ad libraries.
- 2026-11-27 Claude: D done (playbook, README draft, brief). A's tests at 14/14. B's analysis.js landed.
- 2026-11-27 Claude: integration check passed. Sent B the burst-detection fix, and A the request for TikTok/IG/X/FB demo posts.
- 2026-11-27 Claude: B done. All 36 Buzz Radar tests pass, integration check passed. Merged to main.
