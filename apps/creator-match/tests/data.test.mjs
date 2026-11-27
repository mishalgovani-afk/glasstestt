// Data pipeline tests for Creator Match: parsers on fixtures, snapshot schema, build.sh fallback, end-to-end fetch against a mock server.
// Run: node --test apps/creator-match/tests/data.test.mjs   (Node 22, no network)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCuratorDate, extractJsonArrayAfter, parseCuratorDirectory, parseRecommendations, parseCuratorPage, unwrapLinkfilter, linksFromText,
  parseYouTubeUrl, parseChannelIdFromHtml, parseYouTubeFeed, uploadsPerMonth, averageViews, parseYtSearch, parseYtChannels, parseYtVideos,
  buildGameIndex, matchGamesInTitle, buildTagAffinity, selectCurators, toIso,
} from "../scripts/parsers.mjs";
import { validateCreators } from "../scripts/validate.mjs";
import { makeSample, makeSampleCatalog } from "../scripts/make-sample.mjs";
import { mergeCreators } from "../scripts/merge-data.mjs";
import { curatorToCreator } from "../scripts/fetch-creators.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(APP, p), "utf8"));

// ---------- fixtures (structures taken from real curator pages / documented feeds)
const DIRECTORY_HTML = `<div class="curators_ctn"><script type="text/javascript">
var g_rgTopCurators = [{"clanID":"40153535","name":"Dachi","link":"https:\\/\\/store.steampowered.com\\/curator\\/40153535-Dachi\\/","strAvatarHash":"f99d2107a218b0a76bb4e23a648ca5db99ec8ed1","total_followers":1520,"total_reviews":88,"total_recommended":80,"last_curation_date":1790000000,"curator_description":"Indie fan [brackets ] in text. Videos: https:\\/\\/www.youtube.com\\/@dachiplays mail dachi@example.com","communityLink":"https:\\/\\/steamcommunity.com\\/groups\\/Dach1","m_rgAppRecommendations":[{"appid":1100001,"recommendation_state":0,"time_recommended":1789000000,"blurb":"Great &amp; tight","link_url":"https:\\/\\/store.steampowered.com\\/curator\\/40153535\\/review\\/1"},{"appid":1100002,"recommendation_state":1,"time_recommended":1788000000,"blurb":"Nope"}]},
{"clanID":44856946,"name":"Z_CY","link":"https:\\/\\/store.steampowered.com\\/curator\\/44856946-Z_CY\\/","strAvatarHash":"","total_followers":"310","last_curation_date":"1780000000"}];
</script></div>`;
const RECS_HTML = `<div data-panel="{}" role="button" class="recommendation" ><div><a data-ds-appid="1100001" data-ds-itemkey="App_1100001" class="store_capsule price_inline" href="x"><div class="capsule"><img src="https://img/1.jpg" alt="Lantern &amp; Thorn"></div></a></div>
<a class="recommendation_link" href="https://store.steampowered.com/curator/40153535/review/1?snr=1"><div class="recommendation_midcol"><div class="recommendation_stats"><div class="recommendation_type_ctn"><img src='https://x/ico_curator_up.png'> <span class='color_recommended'>Recommended</span> <span class="curator_review_date">22 September, 2026</span></div></div><div class="recommendation_desc"> You carry a lantern. It is &quot;great&quot;. </div></div></a><a class="recommendation_readmore" href="https://store.steampowered.com/curator/40153535/review/1">Read more</a></div>
<div data-panel="{}" role="button" class="recommendation" ><a data-ds-appid="1100002" href="x"><img src="https://img/2.jpg" alt="Mossgrave"></a><a class="recommendation_link"><div class="recommendation_stats"><span class='color_not_recommended'>Not Recommended</span> <span class="curator_review_date">3 March, 2026</span></div><div class="recommendation_desc">Meh.</div></a></div>
<div data-panel="{}" role="button" class="recommendation" ><a data-ds-appid="1100003" href="x"><img src="https://img/3.jpg" alt="Quiet Orchard"></a><a class="recommendation_link"><div class="recommendation_stats"><span class='color_informational'>Informational</span> <span class="curator_review_date">5 June</span></div><div class="recommendation_desc">A demo.</div></a></div>`;
const CURATOR_PAGE = `<div class="header_area"><a href="x"><img class="curator_avatar" src="https://avatars.akamai.steamstatic.com/f99d_full.jpg"></a><h2 class="pageheader curator_name"><a data-panel="{}" href="https://store.steampowered.com/curator/40153535-Dachi/">Dachi</a></h2>
<div data-panel="{&quot;flow-children&quot;:&quot;row&quot;}" class="socialmedia_accounts">
<span><a class="curator_url ttip" href="https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fwww.youtube.com%2F%40dachiplays" target="_blank">www.youtube.com/@dachiplays</a></span>
<a href="https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fdachi.example%2F"><img src="x" alt="Website: Dachi"></a>
<a href="mailto:dachi@example.com">mail</a>
<a href="https://steamcommunity.com/linkfilter/?u=http%3A%2F%2Fx.com%2Fdachi"><img alt="X: dachi"></a>
<a class="curator_url" href="https://store.steampowered.com/curator/40153535-Dachi/">Dachi</a>
</div>
<div class="follow_btn_stats"><div class="num_followers" id="CuratorNumFollowers_40153535">1,520</div></div></div>
<script>var g_strCuratorCommunityBaseURL = "https:\\/\\/steamcommunity.com\\/groups\\/Dach1";</script>
<div class="footer"><a href="https://steamcommunity.com/linkfilter/?u=http%3A%2F%2Fwww.facebook.com%2FSteam"><img alt="Facebook: Steam"></a></div>`;
const UC1 = "UCabcdefghijklmnopqrstuv"; // UC + 22 chars
const FEED = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom"><link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${UC1}"/><id>yt:channel:${UC1.slice(2)}</id><yt:channelId>${UC1}</yt:channelId><title>Dachi Plays</title><link rel="alternate" href="https://www.youtube.com/channel/${UC1}"/><author><name>Dachi Plays</name><uri>https://www.youtube.com/channel/${UC1}</uri></author><published>2020-01-01T00:00:00+00:00</published>
<entry><id>yt:video:vid00000001</id><yt:videoId>vid00000001</yt:videoId><yt:channelId>${UC1}</yt:channelId><title>Lantern &amp; Thorn - first impressions</title><link rel="alternate" href="https://www.youtube.com/watch?v=vid00000001"/><author><name>Dachi Plays</name></author><published>2026-11-20T10:00:00+00:00</published><updated>2026-11-21T10:00:00+00:00</updated><media:group><media:title>x</media:title><media:community><media:starRating count="12" average="5.00" min="1" max="5"/><media:statistics views="12000"/></media:community></media:group></entry>
<entry><id>yt:video:vid00000002</id><yt:videoId>vid00000002</yt:videoId><title>Hades II vs Hades: which is better?</title><published>2026-11-10T10:00:00+00:00</published><media:group><media:community><media:statistics views="8000"/></media:community></media:group></entry>
<entry><id>yt:video:vid00000003</id><yt:videoId>vid00000003</yt:videoId><title>Unrelated vlog</title><published>2026-10-21T10:00:00+00:00</published><media:group><media:community><media:statistics views="4000"/></media:community></media:group></entry></feed>`;

// ---------- parser tests
test("parseCuratorDate handles full dates, no-year dates and junk", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  assert.equal(parseCuratorDate("22 September, 2014", now), "2014-09-22T00:00:00.000Z");
  assert.equal(parseCuratorDate("Nov 3, 2025", now), "2025-11-03T00:00:00.000Z");
  assert.equal(parseCuratorDate("5 June", now), "2026-06-05T00:00:00.000Z");
  assert.equal(parseCuratorDate("20 December", now), "2025-12-20T00:00:00.000Z"); // would be in the future, so last year
  assert.equal(parseCuratorDate("", now), null);
  assert.equal(parseCuratorDate("yesterday", now), null);
  assert.equal(toIso(1790000000), "2026-09-21T14:13:20.000Z");
});

test("extractJsonArrayAfter survives brackets inside strings and bad input", () => {
  assert.deepEqual(extractJsonArrayAfter('x = [{"a":"]["}, 2]; y=[3]', "x ="), [{ a: "][" }, 2]);
  assert.equal(extractJsonArrayAfter("nothing", "x ="), null);
  assert.equal(extractJsonArrayAfter("x = [1,2", "x ="), null);
});

test("parseCuratorDirectory reads g_rgTopCurators (string and numeric ids, missing fields)", () => {
  const { curators, total } = parseCuratorDirectory({ success: 1, results_html: DIRECTORY_HTML, total_count: 15234 });
  assert.equal(total, 15234);
  assert.equal(curators.length, 2);
  const d = curators[0];
  assert.equal(d.id, "40153535");
  assert.equal(d.name, "Dachi");
  assert.equal(d.followers, 1520);
  assert.equal(d.avatar, "https://avatars.fastly.steamstatic.com/f99d2107a218b0a76bb4e23a648ca5db99ec8ed1_full.jpg");
  assert.equal(d.lastActive, "2026-09-21T14:13:20.000Z");
  assert.equal(d.communityUrl, "https://steamcommunity.com/groups/Dach1");
  assert.equal(d.recent.length, 2);
  assert.deepEqual(d.recent.map((r) => r.verdict), ["recommended", "not_recommended"]);
  assert.equal(d.recent[0].blurb, "Great & tight");
  assert.equal(curators[1].id, "44856946");
  assert.equal(curators[1].followers, 310);
  assert.equal(curators[1].avatar, null);
  assert.deepEqual(parseCuratorDirectory({ results_html: "<div>nothing</div>" }).curators, []);
  assert.deepEqual(parseCuratorDirectory(null).curators, []);
});

test("parseRecommendations extracts appid, name, verdict, date, blurb and link", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const r = parseRecommendations(RECS_HTML, now);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], { appid: 1100001, name: "Lantern & Thorn", verdict: "recommended", date: "2026-09-22T00:00:00.000Z", blurb: 'You carry a lantern. It is "great".', link: "https://store.steampowered.com/curator/40153535/review/1" });
  assert.equal(r[1].verdict, "not_recommended");
  assert.equal(r[2].verdict, "informational");
  assert.equal(r[2].date, "2026-06-05T00:00:00.000Z");
  assert.deepEqual(parseRecommendations("", now), []);
});

test("parseCuratorPage keeps only the curator's own public links (no footer, no mailto, no Steam links)", () => {
  const p = parseCuratorPage(CURATOR_PAGE);
  assert.equal(p.name, "Dachi");
  assert.equal(p.followers, 1520);
  assert.equal(p.avatar, "https://avatars.akamai.steamstatic.com/f99d_full.jpg");
  assert.deepEqual(p.links, [
    { label: "YouTube", url: "https://www.youtube.com/@dachiplays" },
    { label: "Website", url: "https://dachi.example/" },
    { label: "X / Twitter", url: "https://x.com/dachi" },
  ]);
  assert.equal(p.communityUrl, "https://steamcommunity.com/groups/Dach1");
  assert.ok(!JSON.stringify(p).includes("mailto") && !JSON.stringify(p).includes("@example.com"));
  assert.deepEqual(parseCuratorPage("<html></html>").links, []);
});

test("link helpers never return emails, http or Steam-internal links", () => {
  assert.equal(unwrapLinkfilter("https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fa.example%2Fx"), "https://a.example/x");
  assert.equal(unwrapLinkfilter("mailto:me@a.example"), null);
  assert.equal(unwrapLinkfilter("javascript:alert(1)"), null);
  assert.equal(unwrapLinkfilter("https://steamcommunity.com/linkfilter/?u=ftp%3A%2F%2Fa.example"), null);
  const l = linksFromText("Find me https://twitch.tv/dachi, https://store.steampowered.com/x and bob@mail.example plus http://site.example/a.");
  assert.deepEqual(l.map((x) => x.url), ["https://twitch.tv/dachi", "https://site.example/a"]);
  assert.equal(l[0].label, "Twitch");
});

test("YouTube helpers: url kinds, channel id from HTML, feed parsing, stats", () => {
  assert.deepEqual(parseYouTubeUrl(`https://www.youtube.com/channel/${UC1}`), { kind: "channel", value: UC1 });
  assert.deepEqual(parseYouTubeUrl("https://youtube.com/@dachiplays/videos"), { kind: "handle", value: "@dachiplays" });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/user/oldname"), { kind: "user", value: "oldname" });
  assert.deepEqual(parseYouTubeUrl("https://www.youtube.com/c/CustomName"), { kind: "custom", value: "CustomName" });
  assert.equal(parseYouTubeUrl("https://www.youtube.com/watch?v=abc"), null);
  assert.equal(parseYouTubeUrl("https://example.com/@x"), null);
  assert.equal(parseChannelIdFromHtml(`<link rel="canonical" href="https://www.youtube.com/channel/${UC1}">`), UC1);
  assert.equal(parseChannelIdFromHtml(`..."externalId":"${UC1}","x"...`), UC1);
  assert.equal(parseChannelIdFromHtml("<html>consent</html>"), null);
  const f = parseYouTubeFeed(FEED);
  assert.equal(f.channelId, UC1);
  assert.equal(f.title, "Dachi Plays");
  assert.equal(f.entries.length, 3);
  assert.deepEqual(f.entries[0], { videoId: "vid00000001", title: "Lantern & Thorn - first impressions", published: "2026-11-20T10:00:00.000Z", link: "https://www.youtube.com/watch?v=vid00000001", views: 12000 });
  assert.equal(averageViews(f.entries), 8000);
  assert.equal(uploadsPerMonth(f.entries), 2); // 2 gaps over 30 days (~2.03 per 30.4 days)
  assert.equal(uploadsPerMonth([]), null);
  assert.deepEqual(parseYouTubeFeed("garbage").entries, []);
});

test("YouTube Data API parsers", () => {
  const s = parseYtSearch({ items: [{ id: { videoId: "v1" }, snippet: { channelId: UC1, channelTitle: "Dachi &amp; Co", title: "T", publishedAt: "2026-11-01T00:00:00Z" } }, { id: { kind: "youtube#channel" }, snippet: {} }] });
  assert.deepEqual(s, [{ videoId: "v1", channelId: UC1, channelTitle: "Dachi & Co", title: "T", published: "2026-11-01T00:00:00.000Z" }]);
  const c = parseYtChannels({ items: [{ id: UC1, snippet: { title: "Dachi", thumbnails: { default: { url: "https://yt3/x.jpg" } }, defaultLanguage: "en" }, statistics: { subscriberCount: "12345" } }, { id: "UCsecret", snippet: { title: "H" }, statistics: { hiddenSubscriberCount: true, subscriberCount: "0" } }] });
  assert.equal(c[UC1].subscribers, 12345);
  assert.equal(c[UC1].avatar, "https://yt3/x.jpg");
  assert.equal(c.UCsecret.subscribers, null);
  assert.deepEqual(parseYtVideos({ items: [{ id: "v1", statistics: { viewCount: "999" } }] }), { v1: 999 });
  assert.deepEqual(parseYtSearch({}), []);
});

test("game matching in video titles prefers the longest name and skips ambiguous names", () => {
  const idx = buildGameIndex([{ appid: 1, name: "Hades" }, { appid: 2, name: "Hades II" }, { appid: 3, name: "Rust" }, { appid: 4, name: "Lantern & Thorn" }, { appid: 5, name: "Sky" }]);
  assert.deepEqual(matchGamesInTitle("Hades II first look", idx).map((g) => g.appid), [2]);
  assert.deepEqual(matchGamesInTitle("Hades II vs Hades", idx).map((g) => g.appid).sort(), [1, 2]);
  assert.deepEqual(matchGamesInTitle("Lantern and Thorn review", idx).map((g) => g.appid), [4]); // "&" == "and"
  assert.deepEqual(matchGamesInTitle("I trust my rustic Sky", idx), []);
});

test("buildTagAffinity: 0..1, strongest tag is 1, generic tags are damped, unknown games ignored", () => {
  const games = new Map([[1, { tags: ["Roguelike", "Indie", "Deckbuilding"] }], [2, { tags: ["Roguelike", "Horror"] }], [3, { tags: [] }]]);
  const a = buildTagAffinity([{ appid: 1 }, { appid: 2 }, { appid: 3 }, { appid: 99 }, { appid: null }, { appid: 1 }], games);
  assert.equal(a.Roguelike, 1);
  assert.ok(a.Indie < a.Deckbuilding, "Indie is generic and damped");
  assert.ok(Object.values(a).every((w) => w >= 0 && w <= 1));
  assert.ok(a.Horror > 0 && a.Horror < 1);
  assert.deepEqual(buildTagAffinity([], games), {});
});

test("selectCurators mixes big and small curators and prefers corpus overlap", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const list = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), name: "c" + i, followers: i < 20 ? 100000 - i : 50 + i, lastActive: "2026-10-01T00:00:00.000Z", recent: i === 77 ? [{ appid: 5 }] : [] }));
  list.push({ id: "999", name: "dead", followers: 5, lastActive: "2020-01-01T00:00:00.000Z", recent: [] });
  const sel = selectCurators(list, new Set([5]), 20, now);
  assert.equal(sel.length, 20);
  assert.ok(sel.some((c) => c.id === "78"), "overlapping curator is chosen");
  assert.ok(!sel.some((c) => c.id === "999"), "inactive curator is dropped");
  assert.ok(sel.some((c) => c.followers < 200) && sel.some((c) => c.followers > 90000), "all sizes represented");
});

test("curatorToCreator builds a contract-shaped curator entry", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const d = parseCuratorDirectory({ results_html: DIRECTORY_HTML }).curators[0];
  const cr = curatorToCreator(d, parseRecommendations(RECS_HTML, now), parseCuratorPage(CURATOR_PAGE), now);
  assert.equal(cr.id, "curator:40153535");
  assert.equal(cr.platform, "steam-curator");
  assert.equal(cr.followers, 1520);
  assert.deepEqual(cr.coveredGames.map((g) => g.appid), [1100001, 1100003], "not-recommended reviews are dropped");
  assert.equal(cr.links[0].label, "Steam Curator");
  assert.ok(cr.links.some((l) => l.url === "https://www.youtube.com/@dachiplays"));
  assert.ok(cr.links.some((l) => l.url === "https://steamcommunity.com/groups/Dach1"));
  assert.equal(curatorToCreator({ ...d, recent: [] }, [], null, now), null);
  const out = { generatedAt: now.toISOString(), source: "live", creators: [cr], games: cr.coveredGames.map((g) => ({ appid: g.appid, name: g.name, tags: [] })) };
  assert.deepEqual(validateCreators(out), []);
});

// ---------- snapshot schema
test("committed data/creators.json is valid and realistic", () => {
  const c = readJson("data/creators.json");
  assert.deepEqual(validateCreators(c, { minCreators: 100 }), []);
  if (c.source === "sample") {
    assert.ok(c.creators.length >= 110 && c.creators.length <= 140, `sample size ${c.creators.length}`);
    const plat = new Set(c.creators.map((x) => x.platform));
    assert.deepEqual([...plat].sort(), ["steam-curator", "twitch", "youtube"]);
    const f = c.creators.map((x) => x.followers).sort((a, b) => a - b);
    assert.ok(f[0] < 1000 && f.at(-1) > 500000, "all sizes");
    assert.ok(c.games.some((g) => g.comingSoon === true && g.reviews.total === null) && c.games.some((g) => g.reviews.total > 5000), "games carry reviews/comingSoon/releaseDate");
    assert.ok(c.games.every((g) => g.releaseDate && typeof g.comingSoon === "boolean" && g.reviews));
    assert.ok(c.creators.some((x) => x.links.length >= 3));
    assert.ok(c.creators.every((x) => x.fetchedAt));
    assert.ok(c.creators.filter((x) => Date.now() - Date.parse(x.lastActive) < 0).length === 0);
  }
  for (const cr of c.creators) assert.ok(Object.keys(cr.tagAffinity).length > 0, `${cr.id} has tagAffinity`);
});

test("validateCreators rejects emails, bad ids and dangling game references", () => {
  const c = makeSample();
  assert.deepEqual(validateCreators(c), []);
  const bad = structuredClone(c);
  bad.creators[0].links.push({ label: "Mail", url: "https://x.example/?to=someone@mail.example" });
  bad.creators[1].id = "nope";
  bad.creators[2].coveredGames[0].appid = 5;
  bad.creators[3].tagAffinity = { A: 2 };
  bad.games[0].comingSoon = "yes";
  const errs = validateCreators(bad).join("\n");
  assert.match(errs, /email/);
  assert.match(errs, /id must look like/);
  assert.match(errs, /missing from games/);
  assert.match(errs, /tagAffinity/);
  assert.match(errs, /comingSoon/);
});

test("sample generator is deterministic and marked as sample", () => {
  assert.deepEqual(makeSample(), makeSample());
  assert.equal(makeSample().source, "sample");
});

// ---------- build.sh
function tmpCopyOfApp() {
  const dir = mkdtempSync(join(tmpdir(), "cm-build-"));
  const dest = join(dir, "creator-match");
  cpSync(APP, dest, { recursive: true, filter: (src) => !/[\\/](dist|node_modules)([\\/]|$)/.test(src) });
  return { dir, dest };
}
test("build.sh with SKIP_FETCH produces dist/ with the snapshot and static files, excluding scripts/tests", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, SKIP_FETCH: "1" }, stdio: "pipe" });
    assert.equal(readFileSync(join(dest, "dist/data/creators.json"), "utf8"), readFileSync(join(APP, "data/creators.json"), "utf8"));
    assert.ok(!existsSync(join(dest, "dist/scripts")) && !existsSync(join(dest, "dist/tests")) && !existsSync(join(dest, "dist/src")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("build.sh keeps the snapshot and exits 0 when the network is unreachable", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    const dead = "http://127.0.0.1:9";
    const env = { ...process.env, STEAM_STORE_BASE: dead, STEAMSPY_BASE: dead, YOUTUBE_BASE: dead, YOUTUBE_API_BASE: dead, HTTP_RETRIES: "0", STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", YOUTUBE_DELAY_MS: "0" };
    delete env.SKIP_FETCH;
    const out = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env, stdio: "pipe", timeout: 60000 }).toString();
    assert.match(out, /copied static files/);
    assert.equal(readFileSync(join(dest, "dist/data/creators.json"), "utf8"), readFileSync(join(APP, "data/creators.json"), "utf8"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("build.sh REUSE_FETCHED keeps live data already in dist/data and skips the fetch", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, SKIP_FETCH: "1" }, stdio: "pipe" });
    const live = { ...readJson("data/creators.json"), source: "live" };
    writeFileSync(join(dest, "dist/data/creators.json"), JSON.stringify(live));
    const out = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, REUSE_FETCHED: "1" }, stdio: "pipe" }).toString();
    assert.match(out, /REUSE_FETCHED/);
    assert.equal(JSON.parse(readFileSync(join(dest, "dist/data/creators.json"), "utf8")).source, "live");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- end-to-end against a mock Steam / SteamSpy / YouTube server
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (d) => `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
const ucId = (n) => "UC" + String(n).padStart(22, "x");
const WATCH = [2876290, 3154150];
const GAME_NAMES = { 3000001: "Lantern Thorn", 3000002: "Mossgrave Depths", 3000003: "Quiet Orchard", 3000004: "Hollow Delve", 3000005: "Tidal Gambit", 3000006: "Willow Cottage", 3000007: "Salt Reach", 3000008: "Prism Garden" };

function mockServer() {
  const hits = [];
  const daysAgo = (n) => new Date(Date.now() - n * 86400000);
  const recsFor = (n) => [0, 1, 2, 3].map((k) => 3000001 + ((n + k * 2) % 8));
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname);
    const json = (b) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
    const text = (b, type = "text/html") => { res.writeHead(200, { "content-type": type }); res.end(b); };
    let m;
    if (u.pathname === "/curators/ajaxgetcurators/render/") {
      const start = Number(u.searchParams.get("start") || 0);
      const list = Array.from({ length: 50 }, (_, i) => {
        const n = start + i;
        return { clanID: String(40000000 + n), name: `Curator ${n}`, link: `https://store.steampowered.com/curator/${40000000 + n}-C/`, strAvatarHash: "", total_followers: Math.max(20, 90000 - n * 300), total_reviews: 50, last_curation_date: Math.floor((Date.now() - (n % 30) * 86400000) / 1000), curator_description: "", m_rgAppRecommendations: recsFor(n).map((a) => ({ appid: a, recommendation_state: 0, time_recommended: Math.floor(Date.now() / 1000) - 86400 * 5, blurb: "ok" })) };
      });
      return json({ success: 1, total_count: 300, start, pagesize: 50, results_html: `<script>var g_rgTopCurators = ${JSON.stringify(list)};\n</script>` });
    }
    if ((m = u.pathname.match(/^\/curator\/(\d+)\/ajaxgetfilteredrecommendations\/$/))) {
      const n = Number(m[1]) - 40000000;
      if (n > 50000000) return json({ success: 1, total_count: 0, results_html: "" }); // a curator that no longer has reviews
      const html = recsFor(n).map((a, k) => `<div class="recommendation" ><a data-ds-appid="${a}"><img alt="${GAME_NAMES[a]}"></a><div class="recommendation_stats"><span class='color_recommended'>Recommended</span> <span class="curator_review_date">${fmt(daysAgo(3 + k * 20))}</span></div><div class="recommendation_desc">Nice game ${k}</div></div>`).join("");
      return json({ success: 1, total_count: 4, results_html: html });
    }
    if ((m = u.pathname.match(/^\/curator\/(\d+)\/$/))) {
      const n = Number(m[1]) - 40000000;
      const yt = n % 3 === 0 ? `<a href="https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fwww.youtube.com%2F%40handle${n}"><img alt="YouTube: h"></a>` : "";
      return text(`<h2 class="pageheader curator_name"><a href="x">Curator ${n}</a></h2><div class="socialmedia_accounts">${yt}<a href="mailto:a@b.example">m</a></div><div class="num_followers" id="CuratorNumFollowers_${m[1]}">${Math.max(20, 90000 - n * 300)}</div>`);
    }
    if ((m = u.pathname.match(/^\/@handle(\d+)$/))) return text(`<link rel="canonical" href="https://www.youtube.com/channel/${ucId(Number(m[1]))}">`);
    if (u.pathname === "/feeds/videos.xml") {
      const id = u.searchParams.get("channel_id");
      const n = Number(id.replace(/^UCx+/, ""));
      const entries = [0, 1, 2, 3].map((k) => `<entry><yt:videoId>v${n}k${k}</yt:videoId><title>${GAME_NAMES[3000001 + ((n + k) % 8)]} - review</title><published>${daysAgo(2 + k * 9).toISOString()}</published><media:group><media:community><media:statistics views="${1000 + k * 100}"/></media:community></media:group></entry>`).join("");
      return text(`<feed xmlns:yt="y" xmlns:media="m"><yt:channelId>${id}</yt:channelId><title>Channel ${n}</title>${entries}</feed>`, "application/atom+xml");
    }
    if (u.pathname === "/api/storesearch/") {
      const term = (u.searchParams.get("term") || "").toLowerCase();
      const hit = Object.entries(GAME_NAMES).find(([, n]) => n.toLowerCase() === term);
      return json({ total: hit ? 1 : 0, items: hit ? [{ type: "app", id: Number(hit[0]), name: hit[1] }] : [] });
    }
    if (u.pathname === "/api/appdetails") {
      const id = Number(u.searchParams.get("appids"));
      const names = { 2876290: "Sojourn Past", 3154150: "SpookABoo" };
      return json({ [id]: { success: true, data: { name: names[id] || GAME_NAMES[id] || `Watch ${id}`, release_date: { coming_soon: false, date: "5 Jun, 2025" }, recommendations: { total: 50 } } } });
    }
    if (u.pathname === "/api.php") {
      if (u.searchParams.get("request") === "appdetails") { const id = Number(u.searchParams.get("appid")); return json({ appid: id, name: GAME_NAMES[id] || `Spy ${id}`, positive: 90, negative: 10, tags: { Indie: 10, Roguelike: 50, Cozy: 5 } }); }
      return json({});
    }
    if (u.pathname === "/youtube/v3/search") {
      const q = u.searchParams.get("q");
      const name = q.replace(/^"|" game$/g, "").replace(/"/g, "");
      return json({ items: [0, 1].map((k) => ({ id: { videoId: `api${k}${name.length}` }, snippet: { channelId: ucId(900 + k), channelTitle: `Api Channel ${k}`, title: `${name} gameplay`, publishedAt: daysAgo(5).toISOString() } })) });
    }
    if (u.pathname === "/youtube/v3/videos") return json({ items: u.searchParams.get("id").split(",").map((id) => ({ id, statistics: { viewCount: "4321" } })) });
    if (u.pathname === "/youtube/v3/channels") return json({ items: u.searchParams.get("id").split(",").map((id) => ({ id, snippet: { title: `Api ${id.slice(-3)}`, thumbnails: { default: { url: "https://yt3.example/a.jpg" } } }, statistics: { subscriberCount: "777" } })) });
    res.writeHead(404); res.end("nope");
  });
  return { server, hits };
}

async function runFetch(env, args) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const p = spawn(process.execPath, [join(APP, "scripts/fetch-creators.mjs"), ...args], { env });
    p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
    p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`exit ${code}\n${buf}`))));
  });
}

test("fetch-creators.mjs end to end against a mock server (curators, youtube links + RSS, spy tags, optional API key)", async (t) => {
  const { server } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "cm-fetch-"));
  try {
    const corpusFile = join(dir, "corpus.json");
    const watchFile = join(dir, "watchlist.json");
    writeFileSync(watchFile, JSON.stringify({ appids: WATCH }));
    writeFileSync(corpusFile, JSON.stringify({ generatedAt: new Date().toISOString(), source: "live", tagIndex: {}, games: [...Object.entries(GAME_NAMES), [3999999, "Uncovered Gem"], [2876290, "Sojourn Past"]].slice(0, 5).concat([[3999999, "Uncovered Gem"], [2876290, "Sojourn Past"]]).map(([id, name], i) => ({ appid: Number(id), name, tags: [{ name: "Roguelike", votes: 9 }, { name: "Indie", votes: 5 }], reviews: { total: i === 0 ? null : 1000 * i }, comingSoon: i === 0, releaseDate: i === 0 ? "Q2 2027" : "2025-05-05", followers: 10 })) }));
    const baseEnv = { ...process.env, STEAM_STORE_BASE: base, STEAMSPY_BASE: base, YOUTUBE_BASE: base, YOUTUBE_API_BASE: base, STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", YOUTUBE_DELAY_MS: "0", HTTP_RETRIES: "0" };
    delete baseEnv.YOUTUBE_API_KEY;
    baseEnv.CM_DEADLINE_MIN = "7";
    // keyless
    const out1 = join(dir, "out1");
    const log1 = await runFetch(baseEnv, ["--out", out1, "--corpus", corpusFile, "--max-curators", "40", "--directory-pages", "3", "--min-output", "10", "--max-yt-channels", "30", "--watchlist", watchFile]);
    t.diagnostic(log1.split("\n").slice(-14).join("\n"));
    assert.match(log1, /deadline=7min/, "CM_DEADLINE_MIN is honoured");
    assert.match(log1, /steamspy: finished/);
    const r1 = JSON.parse(readFileSync(join(out1, "creators.json"), "utf8"));
    assert.deepEqual(validateCreators(r1, { minCreators: 10 }), []);
    assert.equal(r1.source, "live");
    const cur = r1.creators.filter((c) => c.platform === "steam-curator");
    const yt = r1.creators.filter((c) => c.platform === "youtube");
    assert.ok(cur.length >= 20, `curators ${cur.length}`);
    assert.ok(yt.length >= 5, `youtube ${yt.length}`);
    assert.ok(cur.some((c) => c.links.some((l) => l.url.startsWith("https://www.youtube.com/@handle"))), "curator links kept");
    assert.ok(yt.every((c) => c.followers === null && c.avgViews > 0 && c.uploadsPerMonth > 0 && c.coveredGames.length >= 1));
    assert.ok(cur.every((c) => Object.keys(c.tagAffinity).length > 0), "every creator gets a tagAffinity (spy tags for non-corpus games)");
    assert.ok(r1.games.every((g) => g.tags.length > 0));
    const g1 = r1.games.find((g) => g.appid === 3000001);
    assert.equal(g1.comingSoon, true);
    assert.equal(g1.reviews.total, null);
    assert.equal(g1.releaseDate, "Q2 2027");
    assert.ok(!JSON.stringify(r1).includes("@b.example"), "no emails");
    // every corpus game and every watchlist game is in games[], even with zero coverage
    const covered = new Set(r1.creators.flatMap((c) => c.coveredGames.map((g) => g.appid)));
    const unc = r1.games.find((g) => g.appid === 3999999);
    assert.ok(unc && unc.name === "Uncovered Gem" && !covered.has(3999999), "uncovered corpus game is listed");
    const sojourn = r1.games.find((g) => g.appid === 2876290);
    assert.ok(sojourn && sojourn.name === "Sojourn Past" && sojourn.tags.length > 0, "watchlist game in corpus is listed with tags");
    const spook = r1.games.find((g) => g.appid === 3154150);
    assert.ok(spook && spook.name === "SpookABoo" && spook.tags.length > 0 && spook.releaseDate === "2025-06-05" && spook.comingSoon === false, "watchlist game outside the corpus is fetched directly");
    assert.ok(!covered.has(3154150));
    // with an API key: extra channels with subscriber counts
    const out2 = join(dir, "out2");
    await runFetch({ ...baseEnv, YOUTUBE_API_KEY: "test-key" }, ["--out", out2, "--corpus", corpusFile, "--max-curators", "20", "--directory-pages", "2", "--min-output", "10", "--yt-games", "4", "--watchlist", watchFile]);
    const r2 = JSON.parse(readFileSync(join(out2, "creators.json"), "utf8"));
    assert.deepEqual(validateCreators(r2, { minCreators: 10 }), []);
    const api = r2.creators.filter((c) => c.platform === "youtube" && c.followers === 777);
    assert.ok(api.length >= 1, "API channels carry subscriber counts");
    assert.ok(api[0].coveredGames.length >= 1 && api[0].coveredGames[0].appid != null);
    // no corpus at all: watchlist games are still fetched directly and listed
    const out3 = join(dir, "out3");
    await runFetch({ ...baseEnv }, ["--out", out3, "--corpus", join(dir, "missing-corpus.json"), "--max-curators", "10", "--directory-pages", "1", "--min-output", "3", "--no-youtube", "--watchlist", watchFile]);
    const r3 = JSON.parse(readFileSync(join(out3, "creators.json"), "utf8"));
    assert.deepEqual(validateCreators(r3, { minCreators: 3 }), []);
    assert.ok(r3.games.some((g) => g.appid === 2876290 && g.name === "Sojourn Past" && g.tags.length > 0) && r3.games.some((g) => g.appid === 3154150 && g.tags.length > 0), "watchlist games listed even when the corpus does not exist");
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fetch-creators.mjs fails cleanly (exit 1, no output) when nothing is reachable", () => {
  const dir = mkdtempSync(join(tmpdir(), "cm-fail-"));
  try {
    const dead = "http://127.0.0.1:9";
    let code = 0;
    try {
      execFileSync(process.execPath, [join(APP, "scripts/fetch-creators.mjs"), "--out", join(dir, "o")], { env: { ...process.env, STEAM_STORE_BASE: dead, STEAMSPY_BASE: dead, YOUTUBE_BASE: dead, YOUTUBE_API_BASE: dead, HTTP_RETRIES: "0", STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", YOUTUBE_DELAY_MS: "0" }, stdio: "pipe", timeout: 60000 });
    } catch (e) { code = e.status; }
    assert.equal(code, 1);
    assert.ok(!existsSync(join(dir, "o/creators.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("committed data/catalog.json (copy for the search box) is in the compact shared format", () => {
  const c = readJson("data/catalog.json");
  assert.equal(c.format, 2);
  assert.ok(c.keys && c.keys.a && c.keys.n);
  assert.ok(c.games.length >= 1000 && c.games.every((e) => Number.isFinite(e.a) && typeof e.n === "string" && e.n));
  assert.equal(new Set(c.games.map((e) => e.a)).size, c.games.length);
  assert.ok(c.games.some((e) => e.u === 1) && c.games.some((e) => e.t?.length >= 3 && e.r));
  const games = readJson("data/creators.json").games;
  const ids = new Set(c.games.map((e) => e.a));
  for (const g of games) assert.ok(ids.has(g.appid), `catalog is missing creators.json game ${g.appid}`);
  assert.deepEqual(makeSampleCatalog(makeSample()), makeSampleCatalog(makeSample()));
});

// ---------- persistent, growing data
const cr = (id, fetchedAt, extra = {}) => ({ ...makeSample().creators.find((c) => c.platform === "youtube"), id, name: id, fetchedAt, coveredGames: [], tagAffinity: {}, ...extra });
const live = (creators, games = [], generatedAt = "2026-11-01T00:00:00.000Z") => ({ generatedAt, source: "live", creators, games });
const UCa = "youtube:UC" + "a".repeat(22), UCb = "youtube:UC" + "b".repeat(22), UCc = "youtube:UC" + "c".repeat(22);

test("merge-data: newest fetchedAt wins per creator, union of creators and games, deterministic, sample never pollutes", () => {
  const g = (appid, tags) => ({ appid, name: "G" + appid, tags });
  const base = live([cr(UCa, "2026-10-01T00:00:00.000Z", { name: "old" }), cr(UCb, "2026-10-01T00:00:00.000Z")], [g(1, []), g(2, ["Cozy"])]);
  const next = live([cr(UCa, "2026-11-01T00:00:00.000Z", { name: "new" }), cr(UCc, "2026-11-01T00:00:00.000Z"), cr(UCb, "2026-09-01T00:00:00.000Z", { name: "stale-copy" })], [g(1, ["Roguelike"]), g(3, ["Horror"]), g(2, [])], "2026-11-20T00:00:00.000Z");
  const m = mergeCreators(base, next);
  assert.deepEqual(m.creators.map((c) => c.id).sort(), [UCa, UCb, UCc].sort());
  assert.equal(m.creators.find((c) => c.id === UCa).name, "new");
  assert.equal(m.creators.find((c) => c.id === UCb).name, UCb, "an older copy does not overwrite a newer entry");
  assert.deepEqual(m.games.map((x) => [x.appid, x.tags.length]), [[1, 1], [2, 1], [3, 1]], "the copy that has tags wins");
  assert.equal(m.generatedAt, "2026-11-20T00:00:00.000Z");
  assert.equal(JSON.stringify(mergeCreators(base, next)), JSON.stringify(m));
  assert.equal(JSON.stringify(mergeCreators(next, base).creators.map((c) => [c.id, c.name])), JSON.stringify(m.creators.map((c) => [c.id, c.name])));
  assert.deepEqual(validateCreators(m, { minCreators: 3 }), []);
  assert.equal(mergeCreators(base, makeSample()).creators.length, 2);
  assert.equal(mergeCreators(makeSample(), next).creators.length, 3);
  assert.equal(mergeCreators(base, next, { max: 2 }).creators.length, 2);
  assert.ok(!mergeCreators(base, next, { max: 2 }).creators.some((c) => c.id === UCb), "oldest fetchedAt is evicted first");
});

test("merge-data.mjs CLI is repeatable and works when the data branch has no file yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "cm-merge-"));
  try {
    const b = join(dir, "b.json"), n = join(dir, "n.json"), o1 = join(dir, "o1.json"), o2 = join(dir, "o2.json");
    writeFileSync(b, JSON.stringify(live([cr(UCa, "2026-10-01T00:00:00.000Z")])));
    writeFileSync(n, JSON.stringify(live([cr(UCb, "2026-11-01T00:00:00.000Z")])));
    const run = (base, out) => execFileSync(process.execPath, [join(APP, "scripts/merge-data.mjs"), "--base", base, "--new", n, "--out", out]);
    run(b, o1); run(b, o2);
    assert.equal(readFileSync(o1, "utf8"), readFileSync(o2, "utf8"));
    assert.equal(JSON.parse(readFileSync(o1, "utf8")).creators.length, 2);
    run(join(dir, "missing.json"), o2);
    assert.equal(JSON.parse(readFileSync(o2, "utf8")).creators.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("build.sh seeds from DATA_DIR and copies the live Page Doctor catalog next to the creators", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    const dd = join(dir, "databranch");
    execFileSync("mkdir", ["-p", join(dd, "creator-match"), join(dd, "page-doctor")]);
    writeFileSync(join(dd, "creator-match/creators.json"), JSON.stringify({ ...readJson("data/creators.json"), source: "live" }, null, 2));
    writeFileSync(join(dd, "page-doctor/catalog.json"), JSON.stringify({ ...readJson("data/catalog.json"), source: "live", games: [{ a: 1, n: "Only Live Game" }] }));
    const out = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, SKIP_FETCH: "1", DATA_DIR: dd }, stdio: "pipe" }).toString();
    assert.match(out, /seeded dist\/data\/creators.json/);
    assert.match(out, /copied live catalog/);
    assert.equal(JSON.parse(readFileSync(join(dest, "dist/data/creators.json"), "utf8")).source, "live");
    assert.deepEqual(JSON.parse(readFileSync(join(dest, "dist/data/catalog.json"), "utf8")).games, [{ a: 1, n: "Only Live Game" }]);
    // without a live catalog anywhere the committed sample catalog stays
    const out2 = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, SKIP_FETCH: "1" }, stdio: "pipe" }).toString();
    assert.ok(!/copied live catalog/.test(out2));
    assert.equal(JSON.parse(readFileSync(join(dest, "dist/data/catalog.json"), "utf8")).source, "sample");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the creators fetcher is incremental: keeps previous creators, adds new ones, refreshes stale ones, drops gone ones", async () => {
  const { server } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "cm-inc-"));
  try {
    const env = { ...process.env, STEAM_STORE_BASE: base, STEAMSPY_BASE: base, YOUTUBE_BASE: base, YOUTUBE_API_BASE: base, STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", YOUTUBE_DELAY_MS: "0", HTTP_RETRIES: "0", CM_DEADLINE_MIN: "5" };
    delete env.YOUTUBE_API_KEY;
    const out = join(dir, "out");
    const corpusFile = join(dir, "corpus.json");
    writeFileSync(corpusFile, JSON.stringify({ generatedAt: new Date().toISOString(), source: "live", tagIndex: {}, games: Object.entries(GAME_NAMES).map(([id, name]) => ({ appid: Number(id), name, tags: [{ name: "Roguelike", votes: 9 }], reviews: { total: 10 }, comingSoon: false, releaseDate: "2025-01-01" })) }));
    const args = (n) => ["--out", out, "--corpus", corpusFile, "--max-curators", String(n), "--directory-pages", "2", "--min-output", "5", "--no-youtube", "--watchlist", join(dir, "none.json")];
    await runFetch(env, args(15));
    const r1 = JSON.parse(readFileSync(join(out, "creators.json"), "utf8"));
    const ids1 = new Set(r1.creators.map((c) => c.id));
    assert.ok(ids1.size >= 10 && r1.creators.every((c) => c.fetchedAt));
    // age everything; add one curator that vanished long ago and one that vanished recently
    const longAgo = new Date(Date.now() - 100 * 86400000).toISOString(), weekAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    r1.creators = r1.creators.map((c) => ({ ...c, fetchedAt: weekAgo }));
    const base0 = r1.creators.find((c) => c.platform === "steam-curator");
    r1.creators.push({ ...base0, id: "curator:99999991", name: "Gone and old", fetchedAt: longAgo, url: "https://store.steampowered.com/curator/99999991/" }, { ...base0, id: "curator:99999992", name: "Gone but recent", fetchedAt: weekAgo, url: "https://store.steampowered.com/curator/99999992/" });
    writeFileSync(join(out, "creators.json"), JSON.stringify(r1));
    const log2 = await runFetch(env, args(30));
    const r2 = JSON.parse(readFileSync(join(out, "creators.json"), "utf8"));
    const ids2 = new Set(r2.creators.map((c) => c.id));
    for (const id of ids1) assert.ok(ids2.has(id), `previous creator ${id} survived`);
    assert.ok(r2.creators.length > ids1.size, "new creators were added");
    assert.ok(r2.creators.some((c) => c.fetchedAt !== weekAgo && ids1.has(c.id)), "stale creators were re-read");
    assert.ok(!ids2.has("curator:99999991"), "old creator with no reviews left was dropped");
    assert.ok(ids2.has("curator:99999992"), "recently read creator is kept");
    assert.match(log2, /dropping curator:99999991/);
    assert.deepEqual(validateCreators(r2, { minCreators: 5 }), []);
    // sample data is never built upon
    writeFileSync(join(out, "creators.json"), JSON.stringify(makeSample()));
    await runFetch(env, args(10));
    assert.ok(!JSON.parse(readFileSync(join(out, "creators.json"), "utf8")).games.some((g) => g.appid >= 9400000), "no sample games leaked in");
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("add-game.mjs finds curators for requested games and writes a partial creators.json", async () => {
  const { server } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "cm-add-"));
  try {
    const corpusFile = join(dir, "corpus.json");
    writeFileSync(corpusFile, JSON.stringify({ generatedAt: new Date().toISOString(), source: "live", tagIndex: {}, games: Object.entries(GAME_NAMES).map(([id, name]) => ({ appid: Number(id), name, tags: [{ name: "Roguelike", votes: 9 }, { name: "Indie", votes: 5 }], reviews: { total: 10 }, comingSoon: false, releaseDate: "2025-01-01" })) }));
    const out = join(dir, "out");
    const env = { ...process.env, STEAM_STORE_BASE: base, STEAMSPY_BASE: base, STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", HTTP_RETRIES: "0", ADD_DEADLINE_MIN: "4" };
    const log = await new Promise((resolve, reject) => {
      let buf = "";
      const p = spawn(process.execPath, [join(APP, "scripts/add-game.mjs"), "--games", "Quiet Orchard,3000002,2876290", "--corpus", corpusFile, "--out", out, "--max-curators", "12", "--directory-pages", "2"], { env });
      p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
      p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`exit ${code}\n${buf}`))));
    });
    assert.match(log, /summary/);
    assert.match(log, /resolved 3/);
    const r = JSON.parse(readFileSync(join(out, "creators.json"), "utf8"));
    assert.deepEqual(validateCreators(r, { minCreators: 3 }), []);
    assert.ok(r.creators.length >= 3 && r.creators.length <= 12);
    assert.ok(r.creators.every((c) => c.fetchedAt && Object.keys(c.tagAffinity).length > 0));
    const targets = r.games.filter((g) => [3000003, 3000002, 2876290].includes(g.appid));
    assert.equal(targets.length, 3, "requested games are in games[]");
    assert.ok(targets.every((g) => g.tags.length > 0));
    assert.ok(r.creators.some((c) => c.coveredGames.some((g) => g.appid === 3000003)), "curators who reviewed a requested game were found");
    assert.deepEqual(r.meta.addedGames.sort(), [2876290, 3000002, 3000003]);
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});
