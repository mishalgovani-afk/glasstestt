import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../sources.js";
import { demoPosts } from "../demo-data.js";

const POST_KEYS = ["id", "source", "kind", "url", "title", "text", "author", "authorId", "authorFollowers", "publishedAt", "metrics", "tags", "lang"];
const checkShape = (p) => {
  for (const k of POST_KEYS) assert.ok(k in p, "missing " + k);
  assert.equal(p.id.split(":")[0], p.source);
  assert.ok(!isNaN(Date.parse(p.publishedAt)));
  assert.deepEqual(Object.keys(p.metrics).sort(), ["comments", "likes", "viewers", "views"]);
  assert.ok(p.tags.every((t) => t === t.toLowerCase() && !t.startsWith("#")));
};

test("stripHtml / hashtags / gameTag", () => {
  assert.equal(S.stripHtml("<p>Hi &amp; <a href='x'>bye</a></p><p>2nd&#33;</p>"), "Hi & bye\n2nd!");
  assert.deepEqual(S.extractHashtags("Wow #Ad and #GameName! also #x"), ["ad", "gamename"]);
  assert.equal(S.gameTag("Elden Ring: Nightreign"), "eldenringnightreign");
});

test("youtube normalizer", () => {
  const v = { id: "abc", snippet: { title: "Play &amp; win #ad", description: "Sponsored by X<br>#partner", channelTitle: "Chan", channelId: "UC1", publishedAt: "2026-11-01T10:00:00Z", tags: ["Game"], defaultAudioLanguage: "en-US" },
    statistics: { viewCount: "1000", likeCount: "50" }, contentDetails: { duration: "PT45S" } };
  const p = S.normalizeYouTube(v, { UC1: 12345 });
  checkShape(p);
  assert.equal(p.id, "youtube:abc"); assert.equal(p.kind, "short"); assert.equal(p.authorFollowers, 12345);
  assert.equal(p.metrics.views, 1000); assert.equal(p.metrics.comments, null);
  assert.ok(p.tags.includes("ad") && p.tags.includes("partner") && p.tags.includes("game"));
  assert.equal(p.lang, "en"); assert.ok(p.text.includes("Sponsored by X\n#partner"));
  const live = S.normalizeYouTube({ ...v, id: "l1", liveStreamingDetails: { actualStartTime: "2026-11-02T00:00:00Z", concurrentViewers: "77" }, contentDetails: { duration: "PT2H" } });
  assert.equal(live.kind, "stream"); assert.equal(live.metrics.viewers, 77); assert.equal(live.publishedAt, "2026-11-02T00:00:00.000Z");
  assert.equal(S.parseIsoDuration("PT1H2M3S"), 3723);
});

test("twitch normalizers", () => {
  const s = S.normalizeTwitchStream({ id: "9", user_id: "u1", user_login: "bob", user_name: "Bob", title: "Live", viewer_count: 120, started_at: "2026-11-20T00:00:00Z", language: "en", tags: ["English", "FPS"] });
  checkShape(s); assert.equal(s.kind, "stream"); assert.equal(s.metrics.viewers, 120); assert.equal(s.url, "https://www.twitch.tv/bob");
  const v = S.normalizeTwitchVideo({ id: "5", user_id: "u1", user_name: "Bob", title: "VOD #ad", description: "", url: "https://www.twitch.tv/videos/5", view_count: 900, published_at: "2026-11-19T00:00:00Z", language: "en" });
  checkShape(v); assert.equal(v.id, "twitch:video:5"); assert.deepEqual(v.tags, ["ad"]);
});

test("reddit normalizer", () => {
  const p = S.normalizeReddit({ data: { id: "x1", title: "Hello &amp; welcome", selftext: "body", author: "u", subreddit: "Games", permalink: "/r/Games/comments/x1/hello/", created_utc: 1790000000, ups: 10, num_comments: 3, link_flair_text: "News" } });
  checkShape(p); assert.equal(p.url, "https://www.reddit.com/r/Games/comments/x1/hello/"); assert.deepEqual(p.tags, ["news", "r/games"]); assert.equal(p.metrics.likes, 10);
});

test("bluesky normalizer", () => {
  const p = S.normalizeBluesky({ uri: "at://did:plc:1/app.bsky.feed.post/3kabc", author: { did: "did:plc:1", handle: "a.bsky.social", displayName: "A" }, record: { text: "Loving it #Game", createdAt: "2026-11-20T12:00:00.000Z", langs: ["en"] }, likeCount: 4, replyCount: 1 });
  checkShape(p); assert.equal(p.url, "https://bsky.app/profile/a.bsky.social/post/3kabc"); assert.deepEqual(p.tags, ["game"]); assert.equal(p.lang, "en");
});

test("mastodon normalizer", () => {
  const st = { id: "1", created_at: "2026-11-20T12:00:00.000Z", url: "https://mastodon.social/@a/1", content: "<p>Hi <a>#<span>game</span></a></p>", account: { acct: "a", display_name: "Aa", url: "https://mastodon.social/@a", followers_count: 99 }, favourites_count: 2, replies_count: 0, tags: [{ name: "Game" }], language: "en" };
  const p = S.normalizeMastodon(st);
  checkShape(p); assert.equal(p.authorFollowers, 99); assert.equal(p.text, "Hi #game"); assert.deepEqual(p.tags, ["game"]);
  assert.equal(S.normalizeMastodon({ ...st, reblog: { ...st } }), null);
});

test("hackernews normalizer", () => {
  const p = S.normalizeHN({ objectID: "42", title: "Show HN: mod", url: "https://e.com/x", author: "pg", points: 10, num_comments: 4, created_at: "2026-11-10T00:00:00.000Z" });
  checkShape(p); assert.equal(p.kind, "article"); assert.equal(p.url, "https://news.ycombinator.com/item?id=42"); assert.equal(p.metrics.comments, 4);
});

test("dedupe and sinceDays filter", () => {
  const now = Date.parse("2026-11-27T00:00:00Z");
  const mk = (id, d) => ({ id, publishedAt: new Date(now - d * 86400000).toISOString() });
  assert.equal(S.dedupePosts([mk("a:1", 1), mk("a:1", 2), mk("a:2", 1)]).length, 2);
  assert.deepEqual(S.filterSince([mk("a:1", 1), mk("a:2", 40)], 30, now).map((p) => p.id), ["a:1"]);
});

test("searchAll: skips keyless, isolates errors, dedupes", async () => {
  const mkP = (id, source) => ({ id, source, publishedAt: new Date().toISOString() });
  const sources = [
    { id: "a", needsKey: false, keyFields: [], search: async () => [mkP("a:1", "a"), mkP("a:1", "a")] },
    { id: "b", needsKey: true, keyFields: [{ name: "apiKey" }], search: async () => [mkP("b:1", "b")] },
    { id: "c", needsKey: false, keyFields: [], search: async () => { throw new Error("boom"); } },
    { id: "d", needsKey: true, keyFields: [{ name: "apiKey" }], search: async () => [mkP("d:1", "d")] },
  ];
  const events = [];
  const res = await S.searchAll("G", { sources, keys: { d: { apiKey: "k" } }, onProgress: (e) => events.push(e) });
  assert.deepEqual(res.posts.map((p) => p.id).sort(), ["a:1", "d:1"]);
  assert.deepEqual(res.errors, [{ source: "c", message: "boom" }]);
  assert.ok(events.some((e) => e.source === "b" && e.status === "skipped"));
});

test("demoPosts shape, count, determinism", () => {
  const now = Date.parse("2026-11-27T00:00:00Z");
  const a = demoPosts("Starfall Odyssey", now), b = demoPosts("Starfall Odyssey", now);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((p) => p.id + p.author), demoPosts("Other Game", now).map((p) => p.id + p.author));
  assert.ok(a.length >= 200 && a.length <= 300, "count " + a.length);
  assert.equal(new Set(a.map((p) => p.id)).size, a.length);
  a.forEach((p) => { checkShape(p); assert.ok(p.url.startsWith("https://example.com/demo/")); assert.ok(Date.parse(p.publishedAt) <= now && Date.parse(p.publishedAt) >= now - 31 * 86400000); });
  assert.ok(new Set(a.map((p) => p.source)).size >= 5);
  const ad = a.filter((p) => /#ad|sponsor|paid partnership|#partner|use code/i.test(p.title + p.text));
  assert.ok(ad.length >= 25);
  const span = Math.max(...ad.map((p) => Date.parse(p.publishedAt))) - Math.min(...ad.map((p) => Date.parse(p.publishedAt)));
  assert.ok(span <= 62 * 3600000, "wave span h " + span / 3600000);
  assert.ok(new Set(ad.map((p) => p.authorId)).size >= 20);
  assert.ok(a.every((p) => !p.text.includes("<") ));
  assert.ok(a.some((p) => p.title.includes("Starfall Odyssey")));
});
