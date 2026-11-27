#!/usr/bin/env bash
# Builds apps/creator-match/dist/: static files + data snapshot, then tries to refresh data/ from Steam curators and YouTube.
# Optional env: YOUTUBE_API_KEY (more channels + subscriber counts), CORPUS_PATH (Page Doctor corpus; build page-doctor first so ../page-doctor/dist/data/corpus.json exists).
# The build NEVER fails because of the network: if the fetch fails or times out, the committed snapshot stays.
#   SKIP_FETCH=1 ./scripts/build.sh      skip the network step (used by tests and offline builds)
#   REUSE_FETCHED=1 ./scripts/build.sh   if dist/data/creators.json already holds LIVE data from an earlier run, keep it and skip the fetch
#                                        (lets a workflow fetch once, then run scripts/build-site.sh without fetching again)
set -euo pipefail
cd "$(dirname "$0")/.."

stash=""
if [ -n "${REUSE_FETCHED:-}" ] && [ -f dist/data/creators.json ] && grep -q '"source":"live"' dist/data/creators.json; then
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

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then timeout 1500 "$@"; else "$@"; fi
}

if run_with_timeout node scripts/fetch-creators.mjs --out dist/data; then
  echo "creator-match: fresh creator data written to dist/data/"
else
  echo "WARNING: creator-match: creator fetch failed or timed out (exit $?); using the committed data snapshot in dist/data/" >&2
fi
exit 0
