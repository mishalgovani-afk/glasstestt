# My Webapps: how this repo works

This repo is a launcher. `index.html` at the root is the splash page. Every app is a separate, self-contained web app in `apps/<slug>/`.

## When the user says "in a new app"

Everything after "in a new app" is the prompt for a brand-new app. Build it as its own app, not as a change to an existing one:

1. Pick a short kebab-case slug, e.g. `apps/recipe-scaler/`.
2. Build the app inside that folder only. It must have `apps/<slug>/index.html` and must work when served from `/apps/<slug>/`, so use **relative paths only** (`./app.js`, never `/app.js`). Start the page with `<!doctype html>`, a charset meta and a viewport meta, and make it work at phone width.
3. Keep it static (HTML/CSS/JS, no server). Plain files are copied as-is. If it needs a build step, add an executable `apps/<slug>/scripts/build.sh` that writes `apps/<slug>/dist/`, and `scripts/build-site.sh` publishes that instead. `src/`, `tests/` and `scripts/` folders are not published. Node tests in `apps/<slug>/tests/*.test.mjs` run in CI.
4. Add one entry to the `APPS` array in the root `index.html`: `slug`, `name`, `blurb` (one sentence), `tag`, `accent` (a hex color that suits the app and contrasts with white text), `icon` (`mic`, `chat`, `spark`, `grid`, or add a new 24×24 stroke icon to `ICONS`), and `status: "live"`.
5. Add the app to the table in `README.md`, and give the app its own `apps/<slug>/README.md`.
6. Run `./scripts/build-site.sh`, serve `_site/`, and check that the splash card opens the app and the app works.
7. Don't change other apps unless the user asks.

If the user asks to change an existing app ("in the Hush app ..."), work only in that app's folder.
