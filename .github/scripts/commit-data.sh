#!/usr/bin/env bash
# Merge freshly fetched data from $NEW_DIR (same layout as the data branch) into the `data` branch and push.
# Re-reads the branch on every attempt, so concurrent runs never overwrite each other.
set -euo pipefail
msg="$1"; NEW_DIR="${NEW_DIR:?}"
repo_url="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
merge() { # app file max
  local new="$NEW_DIR/$1/$2" out="_commit/$1/$2"
  [ -s "$new" ] || return 0
  local extra=(); [ "$2" = corpus.json ] && extra=(--watchlist apps/page-doctor/watchlist.json)
  node "apps/$1/scripts/merge-data.mjs" --base "$out" --new "$new" --out "$out" --max "$3" "${extra[@]}"
}
for attempt in 1 2 3 4 5 6; do
  rm -rf _commit
  if git ls-remote --exit-code --heads "$repo_url" data >/dev/null 2>&1; then
    git clone --quiet --depth 1 --branch data "$repo_url" _commit
  else
    mkdir _commit && git -C _commit init -q -b data && git -C _commit remote add origin "$repo_url"
  fi
  mkdir -p _commit/page-doctor _commit/creator-match
  merge page-doctor corpus.json 5000
  merge page-doctor catalog.json 20000
  merge creator-match creators.json 3000
  node -e '
const fs=require("fs"); const r=p=>{try{return JSON.parse(fs.readFileSync(p,"utf8")).appids||[]}catch{return []}};
const ids=[...new Set([...r(process.argv[1]),...r(process.argv[2]),...r("apps/page-doctor/watchlist.json")].map(Number).filter(Boolean))].sort((a,b)=>a-b);
fs.writeFileSync(process.argv[1], JSON.stringify({appids:ids})+"\n");' _commit/page-doctor/watchlist.json "$NEW_DIR/page-doctor/watchlist-added.json"
  cd _commit
  git add -A
  if git diff --cached --quiet; then echo "commit-data: nothing new"; exit 0; fi
  git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "$msg"
  if git push -q origin data; then echo "commit-data: pushed"; exit 0; fi
  cd ..; echo "commit-data: push raced, retrying"; sleep $((attempt * 15))
done
echo "commit-data: gave up"; exit 1
