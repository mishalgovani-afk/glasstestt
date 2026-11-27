# AGENTS.md — for Codex and any other coding agent

Read `CLAUDE.md` first: it is this repo's rulebook (launcher + self-contained apps in `apps/<slug>/`,
static files, relative paths, phone width, tests in `apps/<slug>/tests/*.test.mjs`). It applies to you too.

## Working alongside Claude Code
Claude Code and Codex both work on this repo. Active work happens on branch `claude/nice-curie-edh59w`.
1. `git fetch origin && git checkout claude/nice-curie-edh59w && git pull`.
2. Each app under active development has `STATUS.md` (who owns which file right now, what's open)
   and `CONTRACT.md` (module interfaces) in its folder. Some have `CODEX-TASKS.md`: that is your task list.
3. Claim a task by putting your name in the Owner column of `STATUS.md`, commit and push **before** you start.
4. Small commits, pull before you push, never force-push. If a push is rejected, `git pull --no-rebase` and resolve.
5. Before pushing: `for t in apps/*/tests/*.test.mjs; do node --test "$t"; done` and `./scripts/build-site.sh`.
6. Append a line to the Log in `STATUS.md`.

Never commit API keys or tokens.
