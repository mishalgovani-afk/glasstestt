#!/usr/bin/env bash
# Make sure $1 (default _data) holds the latest saved live data, laid out as on the `data` branch:
#   page-doctor/{corpus,catalog,watchlist}.json, creator-match/creators.json
# Source: the `data` branch; for any file still missing, the copy currently published on GitHub Pages.
set -uo pipefail
dir="${1:-_data}"
repo_url="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
rm -rf "$dir"
if git ls-remote --exit-code --heads "$repo_url" data >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch data "$repo_url" "$dir"
else
  mkdir -p "$dir"
fi
mkdir -p "$dir/page-doctor" "$dir/creator-match"
owner="${GITHUB_REPOSITORY%%/*}"; name="${GITHUB_REPOSITORY#*/}"
site="https://${owner}.github.io/${name}"
for f in page-doctor/corpus.json page-doctor/catalog.json creator-match/creators.json; do
  if [ ! -s "$dir/$f" ]; then
    if curl -fsSL --max-time 60 "$site/apps/$f" -o "$dir/$f.tmp" && grep -qE '"source": ?"live"' "$dir/$f.tmp"; then
      mv "$dir/$f.tmp" "$dir/$f"; echo "seed-data: $f taken from the published site"
    else
      rm -f "$dir/$f.tmp"; echo "seed-data: no live $f yet"
    fi
  fi
done
# Watchlist = repo watchlist ∪ games fast-tracked earlier (saved on the data branch).
node -e '
const fs=require("fs"); const r=p=>{try{return JSON.parse(fs.readFileSync(p,"utf8")).appids||[]}catch{return []}};
const ids=[...new Set([...r("apps/page-doctor/watchlist.json"),...r(process.argv[1])].map(Number).filter(Boolean))];
fs.writeFileSync("apps/page-doctor/watchlist.json", JSON.stringify({appids:ids})+"\n");
console.log("seed-data: watchlist has "+ids.length+" games");' "$dir/page-doctor/watchlist.json"
exit 0
