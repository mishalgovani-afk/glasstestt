#!/usr/bin/env bash
# Assemble the whole site in _site/: the splash page plus every app in apps/<slug>/.
# An app with scripts/build.sh is built and its dist/ is published; any other app is copied as-is
# (minus src/, tests/ and scripts/, which are only for development).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site && mkdir -p _site/apps
cp index.html _site/
for dir in apps/*/; do
  slug=$(basename "$dir")
  if [ -x "$dir/scripts/build.sh" ]; then
    (cd "$dir" && ./scripts/build.sh)
    cp -r "$dir/dist" "_site/apps/$slug"
  else
    mkdir -p "_site/apps/$slug"
    (cd "$dir" && tar -cf - --exclude=./src --exclude=./tests --exclude=./scripts --exclude=./dist .) | tar -xf - -C "_site/apps/$slug"
  fi
  echo "built apps/$slug"
done
touch _site/.nojekyll
du -sh _site
