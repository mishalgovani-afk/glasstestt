# My Webapps

A splash page (`index.html`) that links to each small web app built so far. Every app lives in its own folder under `apps/` and works on its own.

| App | Folder | What it is |
|---|---|---|
| Hush | `apps/hush/` | Silent speech: mouth words at the camera, get text. On-device lip reading. |
| P5R Fusion Calc | `apps/p5r-fusion/` | Persona 5 Royal reverse fusion calculator. |
| Trump Tweets | `apps/trump-tweets/` | Running feed of @realDonaldTrump's Truth Social posts. |
| Page Doctor | `apps/page-doctor/` | Audits a Steam store page against comparable successful games. |
| Creator Match | `apps/creator-match/` | Finds creators who cover similar games, drafts pitches, tracks outreach and keys. |
| Back to Sea | `apps/back-to-sea/` | Mobile platformer: a fish hops between water sources through a house, back to the sea. |

## Run it locally

```sh
./scripts/build-site.sh       # builds everything into _site/
npx serve _site               # then open the printed URL
```

Opening `index.html` straight from disk also works for the splash page, P5R and Trump Tweets. Hush needs HTTPS (or localhost) for camera access.

## Publish

`.github/workflows/pages.yml` deploys `_site/` to GitHub Pages on every push to `main`. Turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Add an app

See `CLAUDE.md`. In short: new folder in `apps/<slug>/` with an `index.html`, plus one entry in the `APPS` list in `index.html`.

The native Hush apps (macOS AirPods version, Windows webcam version) stay on the `claude/hush-subvocal-decoder` branch.
