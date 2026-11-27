#!/usr/bin/env bash
# Builds apps/creator-match/dist/: static files + data snapshot, then tries to refresh data/ from Steam curators and YouTube.
# Optional env: YOUTUBE_API_KEY (more channels + subscriber counts), CORPUS_PATH (Page Doctor corpus; build page-doctor first so ../page-doctor/dist/data/corpus.json exists).
# The build NEVER fails because of the network: if the fetch fails or times out, the committed snapshot stays.
#   CM_DEADLINE_MIN=<minutes> sets the fetch time budget (default 20); the hard timeout is that + 5.
#   DATA_DIR=<data branch checkout>      seed dist/data from creator-match/ (the persistent, growing live data)
#                                        instead of the committed sample; the fetcher then ADDS to it and refreshes the stalest entries.
#   SKIP_FETCH=1 ./scripts/build.sh      skip the network step (used by tests and offline builds)
#   REUSE_FETCHED=1 ./scripts/build.sh   if dist/data/creators.json already holds LIVE data from an earlier run, keep it and skip the fetch
#                                        (lets a workflow fetch once, then run scripts/build-site.sh without fetching again)
set -euo pipefail
# DATA_DIR: a checkout of the orphan `data` branch (page-doctor/{corpus,catalog}.json, creator-match/creators.json/...). Resolve it before we change directory.
if [ -n "${DATA_DIR:-}" ]; then
  DATA_DIR="$(cd "$DATA_DIR" 2>/dev/null && pwd)" || { echo "WARNING: DATA_DIR is not a directory, ignoring it" >&2; DATA_DIR=""; }
fi
cd "$(dirname "$0")/.."

stash=""
if [ -n "${REUSE_FETCHED:-}" ] && [ -f dist/data/creators.json ] && grep -Eq '"source": ?"live"' dist/data/creators.json; then
  stash=$(mktemp -d)
  cp -R dist/data/. "$stash/"
fi
rm -rf dist
mkdir -p dist
# everything except scripts/ tests/ src/ dist/ data/ (data is copied below) and internal planning docs
tar -cf - --exclude=./scripts --exclude=./tests --exclude=./src --exclude=./dist --exclude=./data \
  --exclude=./CONTRACT.md --exclude=./STATUS.md . | tar -xf - -C dist
mkdir -p dist/data
if [ -d data ]; then cp -R data/. dist/data/; fi
if [ -n "${DATA_DIR:-}" ] && [ -d "$DATA_DIR/creator-match" ]; then
  for f in creators.json; do
    if [ -f "$DATA_DIR/creator-match/$f" ]; then cp "$DATA_DIR/creator-match/$f" "dist/data/$f"; echo "creator-match: seeded dist/data/$f from the data branch"; fi
  done
fi
# The catalog of Steam games is built by page-doctor; copy it so the app can search it (a file copy, no cross-app import).
for src in "${DATA_DIR:-/nonexistent}/page-doctor/catalog.json" "../page-doctor/dist/data/catalog.json"; do
  if [ -f "$src" ] && grep -Eq '"source": ?"live"' "$src"; then cp "$src" dist/data/catalog.json; echo "creator-match: copied live catalog from $src"; break; fi
done
echo "creator-match: copied static files and data snapshot into dist/"

if [ -n "$stash" ]; then
  cp -R "$stash/." dist/data/
  rm -rf "$stash"
  echo "creator-match: REUSE_FETCHED: keeping the live data already in dist/data/, no fetch"
  exit 0
fi

if [ -n "${SKIP_FETCH:-}" ]; then
  echo "creator-match: SKIP_FETCH is set, keeping the committed data snapshot"
  exit 0
fi

# The fetcher stops itself after CM_DEADLINE_MIN minutes (default 20); the hard timeout is that plus 5 minutes.
deadline_min="${CM_DEADLINE_MIN:-20}"
hard_timeout_s=$(awk -v m="$deadline_min" 'BEGIN { printf "%d", (m + 5) * 60 }')
run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then timeout "$hard_timeout_s" "$@"; else "$@"; fi
}

if run_with_timeout node scripts/fetch-creators.mjs --out dist/data; then
  echo "creator-match: fresh creator data written to dist/data/"
else
  echo "WARNING: creator-match: creator fetch failed or timed out (exit $?); using the committed data snapshot in dist/data/" >&2
fi
exit 0
