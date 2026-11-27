# Status board (Page Doctor + Creator Match share one plan; see CONTRACT.md)

| Area | Owner now | State |
|---|---|---|
| Data pipeline (both apps' scripts/, data/) | free | Done. 41 tests pass |
| Page Doctor engine (doctor.js) | free | Done. Comparables, scoring, 48 hygiene rules (src/steam-hygiene.json). 25 tests pass |
| Creator Match engine (match.js) | free | Done. 28 tests pass |
| UI for both apps | free | Done |
| Workflows, launcher, READMEs at root | free | Done. Pages rebuilds daily at 05:17 UTC; "Data preview" workflow runs the fetchers on demand |

## Open tasks
- [ ] Verify the live Steam / curator / YouTube fetch output from the "Data preview" or Pages workflow logs, and fix the parsers where needed.

## Log
- 2026-11-27 Claude: contracts written, 4 agents started.
- 2026-11-27 Claude: all four agents done; integration check passed; merged to main.
