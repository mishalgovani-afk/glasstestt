// Data pipeline tests for Page Doctor: parsers on fixtures, snapshot schema, build.sh fallback, end-to-end fetch against a mock server.
// Run: node --test apps/page-doctor/tests/data.test.mjs   (Node 22, no network)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSteamDate, reviewDesc, parseLanguages, parseStoreDetails, unwrapAppDetails, parseSpy, parseSpyTagList, parseSearchRows,
  parseStorePageTags, parseMemberCount, parsePopularTags, parseAppReviews, buildGame, isRecent, htmlToText, pickEvenly, bucketQuotas, specificTags, catalogEntryFromRow, catalogEntryFromGame, isUpcomingRow, parseStoreSearch, parseSuggestHtml, pickBestMatch,
} from "../scripts/parsers.mjs";
import { validateCorpus, validateCatalog } from "../scripts/validate.mjs";
import { makeSample, makeSampleCatalog } from "../scripts/make-sample.mjs";
import { mergeCorpus, mergeCatalog } from "../scripts/merge-data.mjs";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(APP, p), "utf8"));

// ---------- fixtures (shapes taken from the documented/observed Steam + SteamSpy responses)
const APPDETAILS = {
  "1100001": {
    success: true,
    data: {
      type: "game", name: "Lantern &amp; Thorn", steam_appid: 1100001, required_age: 0, is_free: false,
      detailed_description: "<h2 class=\"bb_tag\">Long</h2><p>Detailed text.</p>",
      about_the_game: "<h2 class=\"bb_tag\">About</h2><p>Fight through <b>procedural</b> floors.<br>Every run differs.</p><ul class=\"bb_ul\"><li>Feature one</li><li>Feature two</li></ul><img src=\"https://x/y.png\">",
      short_description: "A roguelike about carrying a lantern &amp; surviving.",
      supported_languages: "English<strong>*</strong>, French, German<strong>*</strong>, Simplified Chinese<br><strong>*</strong>languages with full audio support",
      header_image: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1100001/header.jpg?t=1700000000",
      capsule_image: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1100001/capsule_231x87.jpg?t=1",
      capsule_imagev5: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1100001/capsule_184x69.jpg?t=1",
      developers: ["Moth Works"], publishers: ["Moth Works"],
      demos: [{ appid: 1100002, description: "" }],
      price_overview: { currency: "USD", initial: 1499, final: 1199, discount_percent: 20, final_formatted: "$11.99" },
      categories: [{ id: 2, description: "Single-player" }],
      genres: [{ id: "23", description: "Indie" }, { id: "70", description: "Early Access" }],
      screenshots: [{ id: 0, path_thumbnail: "https://x/ss_0.600x338.jpg?t=1", path_full: "https://x/ss_0.1920x1080.jpg?t=1" }, { id: 1, path_thumbnail: "https://x/ss_1.600x338.jpg", path_full: "https://x/ss_1.1920x1080.jpg" }],
      movies: [{ id: 1, name: "Trailer", thumbnail: "https://x/t.jpg", highlight: true }],
      recommendations: { total: 4321 },
      release_date: { coming_soon: false, date: "3 Nov, 2025" },
    },
  },
};
const APPDETAILS_UPCOMING = { "1100500": { success: true, data: { type: "game", name: "Mossgrave", steam_appid: 1100500, is_free: false, short_description: "Soon.", about_the_game: "Wishlist!", supported_languages: "English", header_image: "https://x/h.jpg", developers: ["Tiny"], publishers: ["Tiny"], genres: [{ id: "23", description: "Indie" }], screenshots: [], movies: [], release_date: { coming_soon: true, date: "Q2 2027" } } } };
const APPDETAILS_DLC = { "5": { success: true, data: { type: "dlc", name: "Costume Pack", steam_appid: 5 } } };
const SPY = { appid: 1100001, name: "Lantern & Thorn", developer: "Moth Works", publisher: "Moth Works", score_rank: "", positive: 4000, negative: 321, userscore: 0, owners: "200,000 .. 500,000", average_forever: 0, median_forever: 0, price: "1499", initialprice: "1499", discount: "0", ccu: 812, languages: "English", genre: "Indie", tags: { Roguelike: 2400, Indie: 2000, "Dungeon Crawler": 900, "Pixel Graphics": 300 } };
const SPY_NOTAGS = { appid: 7, name: "X", positive: 0, negative: 0, owners: "0 .. 20,000", ccu: 0, tags: [] };
const SEARCH_HTML = `
<a href="https://store.steampowered.com/app/1100001/Lantern_Thorn/?snr=1_7_7_151_150_1" data-ds-appid="1100001" data-ds-tagids="[1716,492,3959]" data-ds-descids="[2,5]" onmouseover="GameHover( this, event, 'global_hover', {&quot;type&quot;:&quot;app&quot;,&quot;id&quot;:1100001,&quot;public&quot;:1,&quot;v6&quot;:1} );" onmouseout="HideGameHover( this, event, 'global_hover' )" class="search_result_row ds_collapse_flag  app_impression_tracked">
<div class="col search_capsule"><img src="https://x/capsule_sm_120.jpg" srcset="https://x/capsule_sm_120.jpg 1x, https://x/capsule_231x87.jpg 2x"></div>
<div class="col search_name ellipsis"><span class="title">Lantern &amp; Thorn</span><div class="search_name_tags"></div></div>
<div class="col search_released responsive_secondrow">Nov 3, 2025</div>
<div class="col search_reviewscore responsive_secondrow"><span class="search_review_summary positive" data-tooltip-html="Very Positive&lt;br&gt;93% of the 4,321 user reviews for this game are positive."></span></div>
<div class="col search_price_discount_combined responsive_secondrow" data-price-final="1199"><div class="discount_pct">-20%</div></div>
</a>
<a href="https://store.steampowered.com/bundle/123/Some_Bundle/" data-ds-bundleid="123" class="search_result_row ds_collapse_flag"><span class="title">A Bundle</span></a>
<a href="https://store.steampowered.com/app/1100500/Mossgrave/?snr=1_7" data-ds-appid="1100500" data-ds-tagids="[1667]" class="search_result_row ds_collapse_flag">
<div class="col search_name ellipsis"><span class="title">Mossgrave</span></div>
<div class="col search_released responsive_secondrow">Q2 2027</div>
<div class="col search_reviewscore responsive_secondrow"></div>
<div class="col search_price_discount_combined responsive_secondrow" data-price-final="0"></div>
</a>`;
const STORE_PAGE = `<script>InitAppTagModal( 1100001, [{"tagid":1716,"name":"Roguelike","count":2400,"browseable":true},{"tagid":492,"name":"Indie","count":2000,"browseable":true}], [{"tagid":1716}] );</script>`;
const MEMBERS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><memberList><groupID64>103582791460000001</groupID64><groupDetails><groupName><![CDATA[Lantern & Thorn]]></groupName><groupURL><![CDATA[lanternthorn]]></groupURL><memberCount>18234</memberCount><membersInChat>3</membersInChat></groupDetails><memberCount>18234</memberCount><totalPages>1</totalPages></memberList>`;

// ---------- parser tests
test("parseSteamDate handles Steam's formats and rejects vague ones", () => {
  assert.equal(parseSteamDate("3 Nov, 2025"), "2025-11-03");
  assert.equal(parseSteamDate("Nov 3, 2025"), "2025-11-03");
  assert.equal(parseSteamDate("Sept 9, 2024"), "2024-09-09");
  assert.equal(parseSteamDate("Mar 2026"), "2026-03-01");
  assert.equal(parseSteamDate("Q2 2027"), null);
  assert.equal(parseSteamDate("Coming soon"), null);
  assert.equal(parseSteamDate("To be announced"), null);
  assert.equal(parseSteamDate(""), null);
  assert.equal(parseSteamDate(undefined), null);
});

test("reviewDesc follows Steam's thresholds", () => {
  assert.equal(reviewDesc(0, 0), "No user reviews");
  assert.equal(reviewDesc(3, 100), "3 user reviews");
  assert.equal(reviewDesc(1200, 97), "Overwhelmingly Positive");
  assert.equal(reviewDesc(200, 88), "Very Positive");
  assert.equal(reviewDesc(30, 88), "Positive");
  assert.equal(reviewDesc(300, 75), "Mostly Positive");
  assert.equal(reviewDesc(300, 55), "Mixed");
  assert.equal(reviewDesc(300, 30), "Mostly Negative");
  assert.equal(reviewDesc(300, 10), "Very Negative");
});

test("parseLanguages separates full-audio languages and drops the footnote", () => {
  const r = parseLanguages(APPDETAILS["1100001"].data.supported_languages);
  assert.deepEqual(r.languages, ["English", "French", "German", "Simplified Chinese"]);
  assert.deepEqual(r.fullAudio, ["English", "German"]);
  assert.deepEqual(parseLanguages(undefined), { languages: [], fullAudio: [] });
});

test("htmlToText strips markup and decodes entities", () => {
  const t = htmlToText(APPDETAILS["1100001"].data.about_the_game);
  assert.match(t, /Fight through procedural floors\.\nEvery run differs\./);
  assert.match(t, /- Feature one\n- Feature two/);
  assert.ok(!/[<>]/.test(t));
  assert.equal(htmlToText("a &amp; b &#39;c&#39; &lt;x&gt;"), "a & b 'c' <x>");
});

test("parseStoreDetails maps appdetails onto the corpus fields", () => {
  const d = parseStoreDetails(unwrapAppDetails(APPDETAILS, 1100001));
  assert.equal(d.appid, 1100001);
  assert.equal(d.name, "Lantern & Thorn");
  assert.equal(d.url, "https://store.steampowered.com/app/1100001/");
  assert.equal(d.priceUSD, 14.99); // list price, not the discounted one
  assert.equal(d.releaseDate, "2025-11-03");
  assert.equal(d.comingSoon, false);
  assert.equal(d.hasDemo, true);
  assert.equal(d.earlyAccess, true);
  assert.equal(d.movies, 1);
  assert.deepEqual(d.screenshots, ["https://x/ss_0.1920x1080.jpg", "https://x/ss_1.1920x1080.jpg"]);
  assert.match(d.capsuleImage, /capsule_184x69/);
  assert.deepEqual(d.genres, ["Indie", "Early Access"]);
  assert.equal(d.shortDescription, "A roguelike about carrying a lantern & surviving.");
});

test("parseStoreDetails: upcoming games, DLC and junk", () => {
  const up = parseStoreDetails(unwrapAppDetails(APPDETAILS_UPCOMING, 1100500));
  assert.equal(up.comingSoon, true);
  assert.equal(up.releaseDate, "Q2 2027"); // vague dates are kept verbatim
  assert.equal(up.priceUSD, null);
  assert.equal(up.hasDemo, false);
  assert.equal(parseStoreDetails(unwrapAppDetails(APPDETAILS_DLC, 5)), null);
  assert.ok(parseStoreDetails(unwrapAppDetails(APPDETAILS_DLC, 5), { allowAnyType: true }));
  assert.equal(unwrapAppDetails({ "9": { success: false } }, 9), null);
  assert.equal(parseStoreDetails(null), null);
  assert.equal(parseStoreDetails({}), null);
  assert.equal(parseStoreDetails({ steam_appid: "x" }), null);
});

test("parseSpy sorts tags by votes and derives review numbers", () => {
  const s = parseSpy(SPY);
  assert.deepEqual(s.tags.map((t) => t.name), ["Roguelike", "Indie", "Dungeon Crawler", "Pixel Graphics"]);
  assert.equal(s.owners, "200,000 .. 500,000");
  assert.equal(s.ownersMid, 350000);
  assert.equal(s.ccu, 812);
  assert.equal(s.totalReviews, 4321);
  assert.equal(s.positivePct, 93);
  assert.deepEqual(parseSpy(SPY_NOTAGS).tags, []);
  assert.equal(parseSpy({}), null);
  assert.equal(parseSpy(null), null);
});

test("parseSpyTagList ranks by owners then ccu and tolerates arrays", () => {
  const list = parseSpyTagList({ "1": { appid: 1, name: "A", owners: "0 .. 20,000", ccu: 5 }, "2": { appid: 2, name: "B", owners: "1,000,000 .. 2,000,000", ccu: 1 }, "3": { appid: 3, name: "C", owners: "0 .. 20,000", ccu: 50 } });
  assert.deepEqual(list.map((e) => e.appid), [2, 3, 1]);
  assert.equal(parseSpyTagList([]).length, 0);
  assert.equal(parseSpyTagList(null).length, 0);
});

test("parseSearchRows reads rows, skips bundles, copes with upcoming rows", () => {
  const rows = parseSearchRows(SEARCH_HTML);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].appid, 1100001);
  assert.equal(rows[0].name, "Lantern & Thorn");
  assert.equal(rows[0].releaseIso, "2025-11-03");
  assert.equal(rows[0].reviewTotal, 4321);
  assert.equal(rows[0].reviewPct, 93);
  assert.equal(rows[0].reviewDesc, "Very Positive");
  assert.deepEqual(rows[0].tagIds, [1716, 492, 3959]);
  assert.equal(rows[0].priceCents, 1199);
  assert.equal(rows[1].appid, 1100500);
  assert.equal(rows[1].releaseIso, null);
  assert.equal(rows[1].releaseText, "Q2 2027");
  assert.equal(rows[1].reviewTotal, null);
  assert.deepEqual(parseSearchRows(""), []);
  assert.deepEqual(parseSearchRows(undefined), []);
});

test("misc parsers: store-page tags, member count, popular tags, appreviews", () => {
  assert.deepEqual(parseStorePageTags(STORE_PAGE), [{ name: "Roguelike", votes: 2400 }, { name: "Indie", votes: 2000 }]);
  assert.deepEqual(parseStorePageTags("<html></html>"), []);
  assert.equal(parseMemberCount(MEMBERS_XML), 18234);
  assert.equal(parseMemberCount("<error>nope</error>"), null);
  assert.deepEqual(parsePopularTags([{ tagid: 1716, name: "Roguelike" }, { tagid: 492, name: "Indie" }, { bad: 1 }]), { Roguelike: 1716, Indie: 492 });
  const r = parseAppReviews({ success: 1, query_summary: { num_reviews: 0, review_score: 8, review_score_desc: "Very Positive", total_positive: 4000, total_negative: 321, total_reviews: 4321 } });
  assert.deepEqual(r, { total: 4321, positivePct: 93, scoreDesc: "Very Positive" });
  assert.equal(parseAppReviews({}), null);
});

test("buildGame merges sources and nulls reviews for unreleased games", () => {
  const store = parseStoreDetails(unwrapAppDetails(APPDETAILS, 1100001));
  const g = buildGame({ store, spy: parseSpy(SPY), row: parseSearchRows(SEARCH_HTML)[0], followers: 18234 });
  assert.equal(g.tags[0].name, "Roguelike");
  assert.deepEqual(g.reviews, { total: 4321, positivePct: 93, scoreDesc: "Very Positive" });
  assert.equal(g.followers, 18234);
  assert.equal(g.ownersRange, "200,000 .. 500,000");
  assert.equal(g.ccu, 812);
  assert.equal("releaseIso" in g, false);
  const up = buildGame({ store: parseStoreDetails(unwrapAppDetails(APPDETAILS_UPCOMING, 1100500)), spy: parseSpy({ appid: 1100500, positive: 5, negative: 1, tags: [] }), fallbackTags: ["Horror"] });
  assert.deepEqual(up.reviews, { total: null, positivePct: null, scoreDesc: null });
  assert.deepEqual(up.tags, [{ name: "Horror", votes: 0 }]);
  assert.equal(up.followers, null);
  assert.deepEqual(validateCorpus({ generatedAt: new Date().toISOString(), source: "live", games: [g, up], tagIndex: { Roguelike: [g.appid] } }), []);
});

test("small helpers", () => {
  assert.equal(isRecent("2026-06-01", 3, new Date("2026-11-27")), true);
  assert.equal(isRecent("2022-06-01", 3, new Date("2026-11-27")), false);
  assert.equal(isRecent(null, 3), false);
  assert.deepEqual(pickEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), [1, 3, 5, 7, 9]);
  assert.deepEqual(pickEvenly([1, 2], 5), [1, 2]);
  assert.deepEqual(bucketQuotas(40), { hit: 6, mid: 16, upcoming: 18 }); // indies first: hits get the smallest share
});

// ---------- snapshot schema
test("committed data/corpus.json is valid and realistic", () => {
  const c = readJson("data/corpus.json");
  assert.deepEqual(validateCorpus(c, { minGames: 100 }), []);
  assert.ok(["sample", "live"].includes(c.source));
  if (c.source === "sample") {
    assert.ok(c.games.length >= 140 && c.games.length <= 200, `sample size ${c.games.length}`);
    assert.ok(Object.keys(c.tagIndex).length >= 12);
    assert.ok(c.games.some((g) => g.comingSoon && g.reviews.total === null), "sample has upcoming games with null reviews");
    assert.ok(c.games.some((g) => !g.comingSoon && g.reviews.total > 5000), "sample has hits");
    assert.ok(c.games.some((g) => !g.comingSoon && g.reviews.total >= 200 && g.reviews.total <= 5000), "sample has mid-size indies");
    assert.ok(c.games.some((g) => g.followers != null), "sample has followers");
  }
  for (const [tag, ids] of Object.entries(c.tagIndex)) assert.ok(ids.length >= 5, `tag ${tag} has few games`);
});

test("committed data/catalog.json is valid, compact and covers the corpus", () => {
  const c = readJson("data/catalog.json");
  assert.deepEqual(validateCatalog(c, { minGames: 100 }), []);
  assert.equal(c.format, 2);
  assert.ok(c.keys && c.keys.a && c.keys.n && c.keys.r, "keys are documented in the file");
  const corpus = readJson("data/corpus.json");
  const ids = new Map(c.games.map((e) => [e.a, e]));
  for (const g of corpus.games) {
    const e = ids.get(g.appid);
    assert.ok(e, `catalog is missing corpus game ${g.appid}`);
    assert.equal(e.n, g.name);
    assert.equal(!!e.u, g.comingSoon);
  }
  assert.ok(c.games.some((e) => e.u === 1) && c.games.some((e) => e.t?.length >= 3 && e.p != null && e.r && e.d), "entries carry tags, price, date, reviews");
  assert.ok(JSON.stringify(c).length / c.games.length < 150, "about 20,000 entries stay under ~3 MB");
});

test("validateCorpus catches broken data", () => {
  const c = makeSample();
  assert.deepEqual(validateCorpus(c), []);
  const bad = structuredClone(c);
  bad.games[0].screenshots = ["http://insecure"];
  bad.games[1].reviews = null;
  bad.tagIndex.Roguelike.push(1);
  bad.source = "maybe";
  const errs = validateCorpus(bad).join("\n");
  assert.match(errs, /screenshots must be https/);
  assert.match(errs, /reviews must be/);
  assert.match(errs, /not in games/);
  assert.match(errs, /source must be/);
  assert.notDeepEqual(validateCatalog({ generatedAt: new Date().toISOString(), source: "live", games: [{ a: 1, n: "a" }, { a: 1, n: "b" }] }), []);
  assert.notDeepEqual(validateCatalog({ generatedAt: new Date().toISOString(), source: "live", games: [[1, "old array format"]] }), []);
});

test("sample generator is deterministic", () => {
  assert.deepEqual(makeSample(), makeSample());
  assert.equal(makeSample().source, "sample");
});

test("watchlist.json has the expected shape", () => {
  const w = readJson("watchlist.json");
  assert.ok(Array.isArray(w.appids) && w.appids.every((n) => Number.isInteger(n) && n > 0));
});

// ---------- build.sh
function tmpCopyOfApp() {
  const dir = mkdtempSync(join(tmpdir(), "pd-build-"));
  const dest = join(dir, "page-doctor");
  cpSync(APP, dest, { recursive: true, filter: (src) => !/[\\/](dist|node_modules)([\\/]|$)/.test(src) });
  return { dir, dest };
}

test("build.sh with SKIP_FETCH produces dist/ with the snapshot and static files, excluding scripts/tests", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, SKIP_FETCH: "1" }, stdio: "pipe" });
    assert.ok(existsSync(join(dest, "dist/data/corpus.json")));
    assert.ok(existsSync(join(dest, "dist/data/catalog.json")));
    assert.equal(readFileSync(join(dest, "dist/data/corpus.json"), "utf8"), readFileSync(join(APP, "data/corpus.json"), "utf8"));
    assert.ok(!existsSync(join(dest, "dist/scripts")) && !existsSync(join(dest, "dist/tests")) && !existsSync(join(dest, "dist/src")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("build.sh keeps the snapshot and exits 0 when the network is unreachable", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    const env = { ...process.env, STEAM_STORE_BASE: "http://127.0.0.1:9", STEAMSPY_BASE: "http://127.0.0.1:9", STEAM_COMMUNITY_BASE: "http://127.0.0.1:9", HTTP_RETRIES: "0", STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0" };
    delete env.SKIP_FETCH;
    const out = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env, stdio: "pipe", timeout: 60000 }).toString();
    assert.match(out, /copied static files/);
    assert.equal(readFileSync(join(dest, "dist/data/corpus.json"), "utf8"), readFileSync(join(APP, "data/corpus.json"), "utf8"));
    assert.ok(!existsSync(join(dest, "dist/data/corpus.json.tmp-")), "no temp files left");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- end-to-end fetch against a mock Steam / SteamSpy / community server
function mockServer(cfg = {}) {
  const TAG_IDS = { 1716: "Roguelike", 97376: "Cozy" };
  const rowHtml = (id, name, date, rev, pct, tagIds) => `<a href="https://store.steampowered.com/app/${id}/x/" data-ds-appid="${id}" data-ds-tagids="[${tagIds}]" class="search_result_row ds_collapse_flag"><span class="title">${name}</span><div class="col search_released responsive_secondrow">${date}</div>${rev ? `<div class="col search_reviewscore"><span class="search_review_summary positive" data-tooltip-html="Very Positive&lt;br&gt;${pct}% of the ${rev.toLocaleString("en-US")} user reviews for this game are positive."></span></div>` : ""}</a>`;
  // app universe: id 2000000+n. n%5==0 old (2021), n%5==1..3 recent released with decreasing reviews, n%5==4 upcoming
  const info = (id) => {
    const n = id - 2000000;
    if (n < 0 || n > 400) return null;
    const k = n % 5;
    if (k === 0) return { id, date: "Jan 5, 2021", rev: 90000 - n, pct: 90, upcoming: false };
    if (k === 4) return { id, date: "Mar 3, 2027", rev: null, pct: null, upcoming: true };
    return { id, date: "Jun 12, 2025", rev: Math.max(40, 9000 - (n % 100) * 90), pct: 70 + (n % 25), upcoming: false };
  };
  const hits = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    hits.push(u.pathname + u.search);
    const send = (body, type = "application/json") => { res.writeHead(200, { "content-type": type }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    if (u.pathname === "/tagdata/populartags/english") return send(Object.entries(TAG_IDS).map(([tagid, name]) => ({ tagid: Number(tagid), name })));
    if (u.pathname === "/search/results/") {
      const start = Number(u.searchParams.get("start") || 0), count = Number(u.searchParams.get("count") || 100);
      const tags = (u.searchParams.get("tags") || "").split(",");
      const tagId = Number(tags[1] || 0);
      const filter = u.searchParams.get("filter");
      const all = [];
      const off = tagId === 97376 ? 100 : 0;
      for (let n = 0; n <= 400; n++) {
        const i = info(2000000 + n);
        if (tagId && Math.floor(n / 100) !== (off ? 1 : 0)) continue;
        if (filter === "popularcomingsoon") { if (i.upcoming) all.push(i); } else if (!i.upcoming || !tagId) all.push(i);
      }
      const page = all.slice(start, start + Math.min(count, 50));
      return send({ success: 1, total_count: all.length, start, results_html: page.map((i) => rowHtml(i.id, `Game ${i.id}`, i.date, i.rev, i.pct, `${tagId || 1716},492`)).join("\n") });
    }
    if (u.pathname === "/api/storesearch/") {
      const term = u.searchParams.get("term") || "";
      const m2 = term.match(/Game (\d+)/);
      return send({ total: m2 ? 1 : 0, items: m2 ? [{ type: "app", name: `Game ${m2[1]}`, id: Number(m2[1]) }, { type: "app", name: "Other", id: 2000099 }] : [] });
    }
    if (u.pathname === "/api/appdetails") {
      const id = Number(u.searchParams.get("appids")); const i = info(id);
      if (!i) return send({ [id]: { success: false } });
      return send({ [id]: { success: true, data: { type: "game", name: `Game ${id}`, steam_appid: id, is_free: false, short_description: "Short.", about_the_game: "<p>About text.</p>", supported_languages: "English<strong>*</strong>, French", header_image: `https://img.test/${id}.jpg`, developers: ["Dev"], publishers: ["Pub"], genres: [{ id: "23", description: "Indie" }], screenshots: [{ id: 0, path_full: `https://img.test/${id}_0.jpg?t=1` }], movies: [], price_overview: { initial: 999, final: 999 }, release_date: { coming_soon: i.upcoming, date: i.date } } } });
    }
    if (u.pathname.startsWith("/appreviews/")) return send({ success: 1, query_summary: { review_score_desc: "Mostly Positive", total_positive: 80, total_negative: 20, total_reviews: 100 } });
    if (u.pathname === "/api.php") {
      const req2 = u.searchParams.get("request");
      if (req2 === "appdetails") { const id = Number(u.searchParams.get("appid")); const i = info(id); return send({ appid: id, name: `Game ${id}`, positive: i?.rev ? Math.round(i.rev * 0.9) : 0, negative: i?.rev ? Math.round(i.rev * 0.1) : 0, owners: "20,000 .. 50,000", ccu: 10, tags: i?.upcoming ? [] : { [TAG_IDS[1716]]: 500, Indie: 400, Cozy: 100 } }); }
      return send({});
    }
    if (u.pathname.startsWith("/games/")) { if (cfg.community429) { res.writeHead(429); return res.end("slow down"); } return send(`<memberList><groupDetails><memberCount>1234</memberCount></groupDetails></memberList>`, "text/xml"); }
    if (u.pathname.startsWith("/app/")) return send(`InitAppTagModal( 1, [{"tagid":1716,"name":"Roguelike","count":50}], []);`, "text/html");
    res.writeHead(404); res.end("nope");
  });
  return { server, hits };
}

test("fetch-steam.mjs end to end against a mock server (two tags, hits + mid + upcoming, catalog, watchlist)", async (t) => {
  const { server, hits } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "pd-fetch-"));
  const wl = join(dir, "watchlist.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(wl, JSON.stringify({ appids: [2000002, 999] }));
  try {
    const out = join(dir, "out");
    const env = { ...process.env, STEAM_STORE_BASE: base, STEAMSPY_BASE: base, STEAM_COMMUNITY_BASE: base, STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", STEAM_COMMUNITY_DELAY_MS: "0", HTTP_RETRIES: "0", MIN_APPID: "1000000" };
    const log = await new Promise((resolve, reject) => {
      let buf = "";
      const p = spawn(process.execPath, [join(APP, "scripts/fetch-steam.mjs"), "--out", out, "--tags", "Roguelike,Cozy", "--per-tag", "18", "--min-output", "10", "--catalog-size", "200", "--watchlist", wl, "--years", "3"], { env });
      p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
      p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`exit ${code}\n${buf}`))));
    });
    t.diagnostic(log.split("\n").slice(-25).join("\n"));
    const corpus = JSON.parse(readFileSync(join(out, "corpus.json"), "utf8"));
    assert.deepEqual(validateCorpus(corpus, { minGames: 10 }), []);
    assert.equal(corpus.source, "live");
    assert.ok(corpus.games.length >= 20, `games ${corpus.games.length}`);
    const upcoming = corpus.games.filter((g) => g.comingSoon);
    assert.ok(upcoming.length >= 3, "has upcoming games");
    assert.ok(upcoming.every((g) => g.reviews.total === null && g.reviews.scoreDesc === null));
    assert.ok(upcoming.every((g) => g.tags.length > 0), "upcoming games get fallback tags");
    assert.ok(corpus.games.some((g) => !g.comingSoon && g.reviews.total > 5000), "has hits");
    assert.ok(corpus.games.some((g) => !g.comingSoon && g.reviews.total < 5000), "has smaller games");
    assert.ok(corpus.games.every((g) => g.followers === 1234));
    assert.ok(corpus.games.every((g) => g.releaseDate !== "2021-01-05"), "old games are filtered out");
    assert.ok(corpus.games.some((g) => g.appid === 2000002), "watchlist game included");
    assert.ok(!corpus.games.some((g) => g.appid === 999), "unknown watchlist id is skipped, not fatal");
    assert.deepEqual(Object.keys(corpus.tagIndex).sort(), ["Cozy", "Roguelike"]);
    const cat = JSON.parse(readFileSync(join(out, "catalog.json"), "utf8"));
    assert.deepEqual(validateCatalog(cat, { minGames: 50 }), []);
    assert.ok(cat.games.some((e) => e.u === 1));
    assert.ok(cat.games.some((e) => e.t && e.t.includes("Roguelike") && e.r), "catalog entries carry tags and reviews from the search rows");
    assert.ok(corpus.games.every((g) => g.fetchedAt && !Number.isNaN(Date.parse(g.fetchedAt))), "every game has fetchedAt");
    assert.match(log, /summary/);
    assert.ok(hits.some((h) => h.includes("filter=popularcomingsoon")));
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fetch-steam.mjs fails cleanly (exit 1, no output files) when Steam is unreachable", () => {
  const dir = mkdtempSync(join(tmpdir(), "pd-fail-"));
  try {
    let code = 0;
    try {
      execFileSync(process.execPath, [join(APP, "scripts/fetch-steam.mjs"), "--out", join(dir, "o"), "--tags", "Roguelike,Cozy,Puzzle"], { env: { ...process.env, STEAM_STORE_BASE: "http://127.0.0.1:9", STEAMSPY_BASE: "http://127.0.0.1:9", STEAM_COMMUNITY_BASE: "http://127.0.0.1:9", HTTP_RETRIES: "0", STEAM_DELAY_MS: "0" }, stdio: "pipe", timeout: 60000 });
    } catch (e) { code = e.status; }
    assert.equal(code, 1);
    assert.ok(!existsSync(join(dir, "o/corpus.json")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function runFetch(args, env) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const p = spawn(process.execPath, [join(APP, "scripts/fetch-steam.mjs"), ...args], { env });
    p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
    p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`exit ${code}\n${buf}`))));
  });
}
const mockEnv = (base) => ({ ...process.env, STEAM_STORE_BASE: base, STEAMSPY_BASE: base, STEAM_COMMUNITY_BASE: base, STEAM_DELAY_MS: "0", STEAMSPY_DELAY_MS: "0", STEAM_COMMUNITY_DELAY_MS: "0", HTTP_RETRIES: "0", MIN_APPID: "1000000" });

test("a 429 from steamcommunity switches followers off at once and never stalls the run", async () => {
  const { server } = mockServer({ community429: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "pd-429-"));
  try {
    const t = Date.now();
    const log = await runFetch(["--out", join(dir, "o"), "--tags", "Roguelike", "--per-tag", "12", "--min-output", "5", "--no-catalog", "--watchlist", join(dir, "none.json")], { ...mockEnv(base), RATE_LIMIT_WAIT_MS: "45000", PD_DEADLINE_MIN: "8" });
    assert.match(log, /deadline=8min/, "PD_DEADLINE_MIN is honoured");
    assert.ok(Date.now() - t < 20000, "did not wait out any back-off");
    assert.match(log, /followers disabled/);
    const corpus = JSON.parse(readFileSync(join(dir, "o/corpus.json"), "utf8"));
    assert.ok(corpus.games.length >= 10);
    assert.ok(corpus.games.every((g) => g.followers === null));
    assert.deepEqual(validateCorpus(corpus, { minGames: 5 }), []);
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("watchlist games are processed first and survive an already-expired deadline", async () => {
  const { server } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "pd-wl-"));
  try {
    const wl = join(dir, "wl.json");
    writeFileSync(wl, JSON.stringify({ appids: [2000001, 2000002, 2000003] }));
    const log = await runFetch(["--out", join(dir, "o"), "--tags", "Roguelike,Cozy", "--min-output", "1", "--watchlist", wl, "--deadline-min", "0.0001"], mockEnv(base));
    assert.match(log, /watchlist: 3\/3 kept/);
    const corpus = JSON.parse(readFileSync(join(dir, "o/corpus.json"), "utf8"));
    assert.deepEqual(corpus.games.map((g) => g.appid).sort(), [2000001, 2000002, 2000003]);
    assert.ok(corpus.games.every((g) => g.tags.length > 0 && g.reviews.total != null));
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("Throttle: a pause only holds back its own host, and delay creeps back after good responses", async () => {
  const { Throttle } = await import("../scripts/lib.mjs");
  const a = new Throttle("a", 0), b = new Throttle("b", 0);
  a.pause(300);
  const t = Date.now();
  await b.wait();
  assert.ok(Date.now() - t < 100, "other host not delayed");
  await a.wait();
  assert.ok(Date.now() - t >= 250, "paused host waited");
  a.delayMs = 1000; a.baseDelayMs = 100;
  for (let i = 0; i < 30; i++) a.note(200, true);
  assert.ok(a.delayMs < 1000 && a.delayMs >= 100);
});

test("parsers for add-game and the catalog", () => {
  assert.deepEqual(specificTags({ tags: [{ name: "Indie" }, { name: "Roguelike" }, { name: "Singleplayer" }, { name: "Deckbuilding" }, { name: "Card Game" }, { name: "Cozy" }] }, 3), ["Roguelike", "Deckbuilding", "Card Game"]);
  assert.deepEqual(specificTags({ tags: [{ name: "Indie" }, { name: "Roguelike" }] }, 3), ["Roguelike", "Indie"]);
  const idToName = new Map([[1716, "Roguelike"], [492, "Indie"]]);
  const rows = parseSearchRows(SEARCH_HTML);
  assert.deepEqual(catalogEntryFromRow(rows[0], idToName, new Date("2026-11-27")), { a: 1100001, n: "Lantern & Thorn", t: ["Roguelike", "Indie"], p: 11.99, d: "2025-11-03", r: [4321, 93] });
  const up = catalogEntryFromRow(rows[1], idToName, new Date("2026-11-27"));
  assert.equal(up.u, 1);
  assert.equal(up.d, "Q2 2027");
  assert.equal(isUpcomingRow({ releaseIso: "2027-01-01" }, new Date("2026-11-27")), true);
  assert.equal(isUpcomingRow({ releaseIso: "2025-01-01" }, new Date("2026-11-27")), false);
  assert.deepEqual(catalogEntryFromGame({ appid: 5, name: "X", comingSoon: true, tags: [{ name: "A" }], priceUSD: null, releaseDate: "2027", reviews: { total: null, positivePct: null } }), { a: 5, n: "X", u: 1, t: ["A"], d: "2027" });
  assert.deepEqual(parseStoreSearch({ total: 2, items: [{ type: "app", name: "Hades &amp; Co", id: 1 }, { type: "bundle", name: "B", id: 2 }, { name: "no id" }] }), [{ appid: 1, name: "Hades & Co" }]);
  assert.deepEqual(parseSuggestHtml('<a class="match" data-ds-appid="620"><div class="match_name">Portal 2</div></a>'), [{ appid: 620, name: "Portal 2" }]);
  assert.equal(pickBestMatch("portal 2", [{ appid: 1, name: "Portal" }, { appid: 620, name: "Portal 2" }]).appid, 620);
  assert.equal(pickBestMatch("zzz", []), null);
});

// ---------- persistent, growing data: incremental fetch, merge, DATA_DIR
const mkGame = (appid, fetchedAt, extra = {}) => ({ ...makeSample().games[0], appid, name: `G${appid}`, fetchedAt, tags: [{ name: "Roguelike", votes: 5 }], ...extra });
const liveFile = (games, tagIndex = {}, generatedAt = "2026-11-01T00:00:00.000Z") => ({ generatedAt, source: "live", games, tagIndex });

test("merge-data: newest fetchedAt wins, union of games and tagIndex, deterministic, sample never pollutes", () => {
  const base = liveFile([mkGame(1, "2026-10-01T00:00:00.000Z", { name: "old" }), mkGame(2, "2026-10-01T00:00:00.000Z")], { Roguelike: [1, 2] });
  const next = liveFile([mkGame(1, "2026-11-01T00:00:00.000Z", { name: "new" }), mkGame(3, "2026-11-01T00:00:00.000Z"), mkGame(2, "2026-09-01T00:00:00.000Z", { name: "stale-copy" })], { Roguelike: [1, 3], Cozy: [3] }, "2026-11-20T00:00:00.000Z");
  const m = mergeCorpus(base, next);
  assert.deepEqual(m.games.map((g) => g.appid), [1, 2, 3]);
  assert.equal(m.games[0].name, "new");
  assert.equal(m.games[1].name, "G2", "an older copy does not overwrite a newer entry");
  assert.deepEqual(m.tagIndex, { Cozy: [3], Roguelike: [1, 2, 3] });
  assert.equal(m.generatedAt, "2026-11-20T00:00:00.000Z");
  assert.equal(JSON.stringify(mergeCorpus(base, next)), JSON.stringify(m));
  assert.deepEqual(validateCorpus(m), []);
  // order of runs does not matter for the winner
  assert.equal(JSON.stringify(mergeCorpus(next, base).games.map((g) => [g.appid, g.name])), JSON.stringify(m.games.map((g) => [g.appid, g.name])));
  // sample data is ignored when live data exists, and a sample base is ignored
  assert.equal(mergeCorpus(base, makeSample()).games.length, 2);
  assert.equal(mergeCorpus(makeSample(), next).games.length, 3);
  assert.equal(mergeCorpus(null, next).games.length, 3);
});

test("merge-data: cap evicts the oldest entries but never the watchlist", () => {
  const games = [1, 2, 3, 4].map((id) => mkGame(id, `2026-0${id}-01T00:00:00.000Z`));
  const m = mergeCorpus(null, liveFile(games), { max: 2, keep: new Set([1]) });
  assert.deepEqual(m.games.map((g) => g.appid), [1, 4]);
  assert.deepEqual(validateCorpus(m), []);
});

test("merge-data: catalog union, newer file wins, capped", () => {
  const f = (games, g = "2026-11-01T00:00:00.000Z") => ({ generatedAt: g, source: "live", format: 2, games });
  const m = mergeCatalog(f([{ a: 1, n: "old" }, { a: 2, n: "two" }]), f([{ a: 1, n: "new", u: 1 }, { a: 3, n: "three" }], "2026-11-05T00:00:00.000Z"));
  assert.deepEqual(m.games.map((e) => [e.a, e.n]), [[1, "new"], [2, "two"], [3, "three"]]);
  assert.deepEqual(validateCatalog(m), []);
  assert.equal(mergeCatalog(null, f([{ a: 1, n: "a" }, { a: 2, n: "b", r: [10, 90] }, { a: 3, n: "c" }]), { max: 2 }).games.length, 2);
  assert.equal(mergeCatalog(null, makeSampleCatalog(makeSample())).games.length, 2150);
});

test("merge-data.mjs CLI writes the merged file and is repeatable", () => {
  const dir = mkdtempSync(join(tmpdir(), "pd-merge-"));
  try {
    const b = join(dir, "base.json"), n = join(dir, "new.json"), o1 = join(dir, "o1.json"), o2 = join(dir, "o2.json");
    writeFileSync(b, JSON.stringify(liveFile([mkGame(1, "2026-10-01T00:00:00.000Z")], { Roguelike: [1] })));
    writeFileSync(n, JSON.stringify(liveFile([mkGame(2, "2026-11-01T00:00:00.000Z")], { Roguelike: [2] })));
    execFileSync(process.execPath, [join(APP, "scripts/merge-data.mjs"), "--base", b, "--new", n, "--out", o1]);
    execFileSync(process.execPath, [join(APP, "scripts/merge-data.mjs"), "--base", b, "--new", n, "--out", o2]);
    assert.equal(readFileSync(o1, "utf8"), readFileSync(o2, "utf8"));
    assert.deepEqual(JSON.parse(readFileSync(o1, "utf8")).games.map((g) => g.appid), [1, 2]);
    execFileSync(process.execPath, [join(APP, "scripts/merge-data.mjs"), "--base", join(dir, "missing.json"), "--new", n, "--out", o2]); // first run: no base yet
    assert.deepEqual(JSON.parse(readFileSync(o2, "utf8")).games.map((g) => g.appid), [2]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("build.sh seeds dist/data from DATA_DIR (the data branch) instead of the committed sample", () => {
  const { dir, dest } = tmpCopyOfApp();
  try {
    const dd = join(dir, "databranch");
    const live = { ...readJson("data/corpus.json"), source: "live" };
    execFileSync("mkdir", ["-p", join(dd, "page-doctor")]);
    writeFileSync(join(dd, "page-doctor/corpus.json"), JSON.stringify(live, null, 2)); // pretty printed is fine too
    const out = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, SKIP_FETCH: "1", DATA_DIR: dd }, stdio: "pipe" }).toString();
    assert.match(out, /seeded dist\/data\/corpus.json from the data branch/);
    assert.equal(JSON.parse(readFileSync(join(dest, "dist/data/corpus.json"), "utf8")).source, "live");
    assert.equal(JSON.parse(readFileSync(join(dest, "dist/data/catalog.json"), "utf8")).source, "sample", "files missing on the data branch fall back to the committed sample");
    // REUSE_FETCHED recognises pretty-printed live data too
    const out2 = execFileSync("bash", ["scripts/build.sh"], { cwd: dest, env: { ...process.env, REUSE_FETCHED: "1", DATA_DIR: dd } , stdio: "pipe" }).toString();
    assert.match(out2, /REUSE_FETCHED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the fetcher is incremental: it keeps and refreshes the previous corpus, adds new games, drops games that are gone", async () => {
  const { server } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "pd-inc-"));
  const out = join(dir, "out");
  try {
    const common = ["--out", out, "--min-output", "5", "--catalog-size", "200", "--per-tag", "12", "--watchlist", join(dir, "none.json")];
    await runFetch([...common, "--tags", "Roguelike"], mockEnv(base));
    const run1 = JSON.parse(readFileSync(join(out, "corpus.json"), "utf8"));
    const rogueIds = new Set(run1.games.map((g) => g.appid));
    assert.ok(rogueIds.size >= 10);
    // doctor the file: one very old game that no longer exists on Steam, one recently read game that no longer exists, and age everything else
    const longAgo = new Date(Date.now() - 100 * 86400000).toISOString(), weekAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    run1.games = run1.games.map((g) => ({ ...g, fetchedAt: weekAgo }));
    run1.games.push({ ...run1.games[0], appid: 5, name: "Gone and old", fetchedAt: longAgo }, { ...run1.games[0], appid: 6, name: "Gone but recent", fetchedAt: weekAgo });
    run1.tagIndex.Roguelike.push(5, 6);
    writeFileSync(join(out, "corpus.json"), JSON.stringify(run1));
    const log2 = await runFetch([...common, "--tags", "Cozy"], mockEnv(base));
    const run2 = JSON.parse(readFileSync(join(out, "corpus.json"), "utf8"));
    const ids2 = new Set(run2.games.map((g) => g.appid));
    for (const id of rogueIds) assert.ok(ids2.has(id), `previous game ${id} survived a run that only looked at another tag`);
    assert.ok(run2.games.some((g) => !rogueIds.has(g.appid)), "new games were added");
    assert.ok(!ids2.has(5), "old game that vanished from Steam was dropped");
    assert.ok(ids2.has(6), "recently read game that vanished is kept for now");
    assert.match(log2, /dropping 5 /);
    assert.ok(run2.games.filter((g) => rogueIds.has(g.appid) && g.fetchedAt !== weekAgo).length > 0, "stale previous games were refreshed");
    assert.ok(run2.games.every((g) => g.fetchedAt));
    assert.deepEqual(validateCorpus(run2, { minGames: 5 }), []);
    assert.ok(run2.tagIndex.Roguelike.length >= 10 && run2.tagIndex.Cozy.length >= 5, "tagIndex covers both runs");
    assert.equal(JSON.stringify(run2.games.map((g) => g.appid)), JSON.stringify([...ids2].sort((x, y) => x - y)), "games are sorted by appid");
    // sample data is never built upon
    writeFileSync(join(out, "corpus.json"), JSON.stringify(makeSample()));
    await runFetch([...common, "--tags", "Cozy"], mockEnv(base));
    assert.ok(JSON.parse(readFileSync(join(out, "corpus.json"), "utf8")).games.every((g) => g.appid < 9000000), "a sample previous file is ignored");
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("add-game.mjs: resolves names and appids, fetches them first, then indie comparables; writes partial files and watchlist-added.json", async () => {
  const { server, hits } = mockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = mkdtempSync(join(tmpdir(), "pd-add-"));
  try {
    const out = join(dir, "out");
    const log = await new Promise((resolve, reject) => {
      let buf = "";
      const p = spawn(process.execPath, [join(APP, "scripts/add-game.mjs"), "--games", "2000003,Game 2000007", "--out", out, "--per-tag", "12"], { env: { ...mockEnv(base), ADD_DEADLINE_MIN: "3" } });
      p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
      p.on("close", (code) => (code === 0 ? resolve(buf) : reject(new Error(`exit ${code}\n${buf}`))));
    });
    assert.match(log, /resolved "Game 2000007" -> 2000007/);
    assert.match(log, /deadline=3min/);
    assert.match(log, /summary/);
    const corpus = JSON.parse(readFileSync(join(out, "corpus.json"), "utf8"));
    assert.deepEqual(validateCorpus(corpus, { minGames: 3 }), []);
    const ids = corpus.games.map((g) => g.appid);
    assert.ok(ids.includes(2000003) && ids.includes(2000007), "requested games are in the file");
    assert.ok(corpus.games.length >= 8, `comparables fetched: ${corpus.games.length}`);
    assert.ok(corpus.games.every((g) => g.fetchedAt));
    assert.deepEqual(JSON.parse(readFileSync(join(out, "watchlist-added.json"), "utf8")), { appids: [2000003, 2000007] });
    const cat = JSON.parse(readFileSync(join(out, "catalog.json"), "utf8"));
    assert.deepEqual(validateCatalog(cat), []);
    assert.ok(cat.games.some((e) => e.a === 2000007));
    // the requested games are fetched before any search for comparables
    const firstDetail = hits.findIndex((h) => h.startsWith("/api/appdetails?appids=2000003"));
    const firstCompSearch = hits.findIndex((h) => h.startsWith("/search/results/"));
    assert.ok(firstDetail >= 0 && firstCompSearch > firstDetail, "details of the requested games come first");
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
});
