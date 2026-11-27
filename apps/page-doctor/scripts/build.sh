#!/usr/bin/env bash
# Builds apps/page-doctor/dist/: static files + data/ snapshot, then tries to refresh data/ from Steam.
# The build NEVER fails because of the network: if the fetch fails or times out, the committed snapshot stays.
#   SKIP_FETCH=1 ./scripts/build.sh     skip the network step (used by tests and offline builds)
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
# everything except scripts/ tests/ src/ dist/ data/ (data is copied below) and internal planning docs
tar -cf - --exclude=./scripts --exclude=./tests --exclude=./src --exclude=./dist --exclude=./data \
  --exclude=./CONTRACT.md --exclude=./STATUS.md . | tar -xf - -C dist
mkdir -p dist/data
if [ -d data ]; then cp -R data/. dist/data/; fi
echo "page-doctor: copied static files and data snapshot into dist/"

if [ -n "${SKIP_FETCH:-}" ]; then
  echo "page-doctor: SKIP_FETCH is set, keeping the committed data snapshot"
  exit 0
fi

run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then timeout 1500 "$@"; else "$@"; fi
}

if run_with_timeout node scripts/fetch-steam.mjs --out dist/data; then
  echo "page-doctor: fresh Steam data written to dist/data/"
else
  echo "WARNING: page-doctor: Steam fetch failed or timed out (exit $?); using the committed data snapshot in dist/data/" >&2
fi
exit 0
