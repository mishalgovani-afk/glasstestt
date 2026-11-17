# Trump Tweets

A running feed of @realDonaldTrump's Truth Social posts, newest first. It refreshes every minute while open (every 3 minutes in the background). Posts newer than your last visit are highlighted, and the tab title shows a count of new posts while the tab is in the background.

## Where the posts come from

Truth Social doesn't let other websites read its posts from the browser. A scheduled workflow in the public **mishalgovani-afk/hush-web** repo (`.github/workflows/feed.yml`) runs `scripts/fetch-feed.mjs` every ~5 minutes. That script queries public sources (Truth Social's API, CNN's Truth Social archive, trumpstruth.org), merges them, converts posts to plain text, and force-pushes a single `feed.json` to hush-web's `feed-data` branch. This app reads that file from raw.githubusercontent.com.

The feed job stays in hush-web because that repo is public. raw.githubusercontent.com only serves public repos, and this one is private. `scripts/fetch-feed.mjs` here is a copy of hush-web's script, with its parser tests in `tests/`.

GitHub pauses scheduled workflows in repos with no activity for 60 days. If the feed stops updating, re-enable it in hush-web under **Actions → Refresh Truth Social feed**.

## Develop

```sh
node --test tests/*.test.mjs
```

Post text is only ever inserted as text (never `innerHTML`), and only `https:` links are made clickable.
