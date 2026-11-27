#!/usr/bin/env bash
# Builds apps/page-doctor/dist/: static files + data/ snapshot, then tries to refresh data/ from Steam.
# The build NEVER fails because of the network: if the fetch fails or times out, the committed snapshot stays.
#   PD_DEADLINE_MIN=<minutes> sets the fetch time budget (default 19); the hard timeout is that + 5.
#   SKIP_FETCH=1 ./scripts/build.sh      skip the network step (used by tests and offline builds)
#   REUSE_FETCHED=1 ./scripts/build.sh   if dist/data/corpus.json already holds LIVE data from an earlier run, keep it and skip the fetch
#                                        (lets a workflow fetch once, then run scripts/build-site.sh without fetching again)
set -euo pipefail
cd "$(dirname "$0")/.."

stash=""
if [ -n "${REUSE_FETCHED:-}" ] && [ -f dist/data/corpus.json ] && grep -q '"source":"live"' dist/data/corpus.json; then
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
echo "page-doctor: copied static files and data snapshot into dist/"

if [ -n "$stash" ]; then
  cp -R "$stash/." dist/data/
  rm -rf "$stash"
  echo "page-doctor: REUSE_FETCHED: keeping the live data already in dist/data/, no fetch"
  exit 0
fi

if [ -n "${SKIP_FETCH:-}" ]; then
  echo "page-doctor: SKIP_FETCH is set, keeping the committed data snapshot"
  exit 0
fi

# The fetcher stops itself after PD_DEADLINE_MIN minutes (default 19); the hard timeout is that plus 5 minutes.
deadline_min="${PD_DEADLINE_MIN:-19}"
hard_timeout_s=$(awk -v m="$deadline_min" 'BEGIN { printf "%d", (m + 5) * 60 }')
run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then timeout "$hard_timeout_s" "$@"; else "$@"; fi
}

if run_with_timeout node scripts/fetch-steam.mjs --out dist/data; then
  echo "page-doctor: fresh Steam data written to dist/data/"
else
  echo "WARNING: page-doctor: Steam fetch failed or timed out (exit $?); using the committed data snapshot in dist/data/" >&2
fi
exit 0
