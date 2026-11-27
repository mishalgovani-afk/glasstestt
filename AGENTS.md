# AGENTS.md — for Codex and any other coding agent

Read `CLAUDE.md` first: it is this repo's rulebook (launcher + self-contained apps in `apps/<slug>/`,
static files, relative paths, phone width, tests in `apps/<slug>/tests/*.test.mjs`). It applies to you too.

## Working alongside Claude Code
Claude Code and Codex both work on this repo. To pick up work at any time:
1. `git fetch origin && git checkout claude/nice-curie-edh59w && git pull` (active branch for Buzz Radar).
2. Your task list is `apps/buzz-radar/CODEX-TASKS.md`. Read the app's `STATUS.md` (what's done, in progress, open, and **who owns which file right now**)
   and `CONTRACT.md` (module interfaces — don't change them without updating the contract).
3. Claim a task: edit `STATUS.md` (put your name in the Owner column), commit and push **before** you start,
   so nobody edits the same file at once. Release it when done.
4. Small commits, pull before you push, never force-push, never rewrite history. If a push is rejected,
   `git pull --no-rebase` and resolve.
5. Before pushing: `for t in apps/*/tests/*.test.mjs; do node --test "$t"; done` and `./scripts/build-site.sh`.
6. Append a line to the Log in `STATUS.md` describing what you did.

Never commit API keys or tokens. Users paste keys into the app's Settings; they live in their browser only.
