// Tests for the Buzz Radar analysis engine. Run: node --test tests/analysis.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, ARCHETYPE_IDS, detectDisclosure } from "../analysis.js";

const H = 3600e3, D = 24 * H;
const GAME = "Starfall Tactics";
const T0 = Date.parse("2026-03-01T00:00:00Z");
const NOW = Date.parse("2026-03-31T12:00:00Z");

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Synthetic fixture: background noise + sponsored wave + organic viral clip + patch update. */
function fixture(seed = 7) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const ri = (a, b) => Math.floor(a + r() * (b - a + 1));
  const posts = [];
  const groups = { wave: [], viral: [], patch: [], bg: [] };
  let n = 0;
  const add = (group, o) => {
    n++;
    const p = {
      id: `${o.source}:fx${n}`, source: o.source, kind: o.kind || "post", url: `https://example.com/demo/${n}`,
      title: o.title || "", text: o.text || "", author: o.author, authorId: o.author.toLowerCase(),
      authorFollowers: o.followers ?? null, publishedAt: new Date(o.t).toISOString(),
      metrics: { views: o.views ?? null, likes: o.likes ?? null, comments: o.comments ?? null, viewers: o.viewers ?? null },
      tags: o.tags || [], lang: "en",
    };
    posts.push(p);
    groups[group].push(p.id);
  };

  // Background: varied, low-energy chatter spread over the month.
  const subjects = ["co-op", "soundtrack", "controller support", "story", "difficulty", "art style", "modding",
    "performance", "crafting", "multiplayer lobby", "boss design", "save system", "voice acting", "map editor",
    "ranked mode", "steam deck", "accessibility", "lore", "economy", "skill tree"];
  const frames = [(s) => `Thoughts on the ${s} in ${GAME}?`, (s) => `${GAME} ${s} is underrated`,
    (s) => `Question about ${s}`, (s) => `My honest take on ${GAME} ${s}`, (s) => `Can we talk about the ${s}`,
    (s) => `${s} guide for newcomers`];
  for (let i = 0; i < 90; i++) {
    const s = pick(subjects), src = pick(["reddit", "reddit", "bluesky", "mastodon", "youtube", "hackernews"]);
    add("bg", { source: src, kind: src === "youtube" ? "video" : "post", t: T0 + r() * 30 * D,
      title: src === "bluesky" || src === "mastodon" ? "" : pick(frames)(s),
      text: src === "bluesky" || src === "mastodon" ? pick(frames)(s) : "",
      author: `Regular${ri(1, 60)}`, followers: ri(200, 20000),
      views: src === "youtube" ? ri(300, 9000) : null, likes: ri(1, 300), comments: ri(0, 60) });
  }

  // Sponsored creator wave: 28 mid-size creators within ~40h, mostly disclosed, templated titles.
  const waveStart = Date.parse("2026-03-10T12:00:00Z");
  const waveTitles = [`I tried the new ${GAME} campaign mode and WOW`, `${GAME} campaign mode first impressions`,
    `Is the ${GAME} campaign mode worth it? First impressions`, `${GAME}: campaign mode first impressions (early access)`];
  const disclosures = ["Thanks to Nebula Interactive for sponsoring this video!", "#ad Sponsored by Nebula Interactive.",
    "This video includes paid promotion. Wishlist now: https://example.com/store", "In partnership with Nebula Interactive. #sponsored",
    "Use code STARFALL10 for 10% off."];
  for (let i = 0; i < 28; i++) {
    const twitch = i % 7 === 6;
    const disc = i % 7 === 5 ? "" : disclosures[i % disclosures.length];
    add("wave", { source: twitch ? "twitch" : "youtube", kind: twitch ? "stream" : "video", t: waveStart + r() * 40 * H,
      title: twitch ? `${GAME} campaign mode first impressions | !sponsor` : pick(waveTitles),
      text: `Playing the brand new campaign mode of ${GAME}. ${disc}`, author: `MidCreator${i}`, followers: ri(40000, 300000),
      views: twitch ? null : ri(20000, 80000), viewers: twitch ? ri(400, 1500) : null, likes: ri(800, 4000), comments: ri(50, 400) });
  }

  // Organic viral moment: one clip with millions of views, then small reactions over ~36h.
  const viralStart = Date.parse("2026-03-18T09:00:00Z");
  add("viral", { source: "reddit", t: viralStart, title: `${GAME} railgun glitch launches my squad into orbit (clip)`,
    author: "LuckyClipper", likes: 52000, comments: 2400, views: 3200000 });
  const reactions = [`That ${GAME} railgun glitch clip is insane`, `Reacting to the railgun glitch clip`,
    `Tried the railgun glitch from the viral clip`, `railgun glitch clip explained`, `the railgun orbit glitch clip lmao`];
  for (let i = 0; i < 19; i++) {
    const src = pick(["reddit", "youtube", "bluesky", "mastodon"]);
    const t = reactions[i % reactions.length];
    add("viral", { source: src, kind: src === "youtube" ? "short" : "post", t: viralStart + (1 + r() * 35) * H,
      title: src === "bluesky" || src === "mastodon" ? "" : t, text: src === "bluesky" || src === "mastodon" ? t : "",
      author: `Fan${i}`, followers: ri(100, 8000), views: ri(2000, 30000), likes: ri(10, 900), comments: ri(1, 80) });
  }

  // Patch / season update: organic coverage across platforms within ~30h.
  const patchStart = Date.parse("2026-03-24T16:00:00Z");
  const patchTitles = [`${GAME} patch 1.4 notes: railgun nerf and Frostline season`, `Frostline season is live, patch 1.4 breakdown`,
    `Patch 1.4 balance changes explained`, `${GAME} 1.4 update: every railgun nerf and buff`, `New season Frostline patch notes discussion`];
  for (let i = 0; i < 18; i++) {
    const src = pick(["reddit", "youtube", "bluesky", "youtube"]);
    const t = patchTitles[i % patchTitles.length];
    add("patch", { source: src, kind: src === "youtube" ? "video" : "post", t: patchStart + r() * 30 * H,
      title: src === "bluesky" ? "" : t, text: src === "bluesky" ? t : "Full patch notes inside.",
      author: i % 3 === 0 ? `Regular${i + 1}` : `PatchWatcher${i}`, followers: ri(1000, 120000),
      views: src === "youtube" ? ri(5000, 60000) : null, likes: ri(20, 2000), comments: ri(5, 300) });
  }
  return { posts, groups };
}

const overlap = (aStart, aEnd, bStart, bEnd) => Date.parse(aStart) < bEnd && Date.parse(aEnd) > bStart;
function clusterFor(report, ids) {
  const set = new Set(ids);
  let best = null, bestN = -1;
  for (const c of report.clusters) {
    const k = c.postIds.filter((id) => set.has(id)).length;
    if (k > bestN) { best = c; bestN = k; }
  }
  return { cluster: best, hits: bestN };
}

const { posts: FX, groups: G } = fixture();
const REPORT = analyze(FX, { game: GAME, now: NOW });

test("report has the contract shape", () => {
  const r = REPORT;
  assert.equal(r.game, GAME);
  assert.ok(r.range.start && r.range.end);
  assert.equal(r.bucketHours, 24);
  assert.equal(r.totals.posts, FX.length);
  assert.ok(r.totals.creators > 50);
  assert.equal(Object.values(r.totals.bySource).reduce((a, b) => a + b, 0), FX.length);
  assert.equal(r.timeline.reduce((s, b) => s + b.count, 0), FX.length);
  for (const b of r.timeline) {
    assert.equal(typeof b.t, "string");
    assert.equal(Object.values(b.bySource).reduce((a, x) => a + x, 0), b.count);
    assert.ok(b.views >= 0);
  }
  // every post is in exactly one cluster
  const all = r.clusters.flatMap((c) => c.postIds);
  assert.equal(all.length, FX.length);
  assert.equal(new Set(all).size, FX.length);
  assert.ok(r.clusters.length >= 3 && r.clusters.length <= 13);
  for (const c of r.clusters) {
    assert.ok(ARCHETYPE_IDS.includes(c.archetype), c.archetype);
    assert.ok(Number.isInteger(c.campaignScore) && c.campaignScore >= 0 && c.campaignScore <= 100);
    for (const [k, v] of Object.entries(c.signals)) assert.ok(v >= 0 && v <= 1, `${k}=${v}`);
    assert.deepEqual(Object.keys(c.signals).sort(), ["creatorDiversity", "disclosure", "engagementSkew",
      "newCreatorShare", "platformSpread", "synchronicity", "titleSimilarity"]);
    assert.ok(c.reasons.length >= 2 && c.reasons.length <= 5);
    assert.ok(c.topPosts.length >= 1 && c.topPosts.length <= 5);
    assert.ok(c.topPosts.every((id) => c.postIds.includes(id)));
    assert.ok(typeof c.label === "string" && c.label.length > 3);
    assert.ok(Date.parse(c.start) <= Date.parse(c.end));
    // creators are counted per platform account (same handle on two platforms = two accounts)
    assert.equal(c.creators, new Set(c.postIds.map((id) => { const p = FX.find((x) => x.id === id); return `${p.source}|${p.authorId}`; })).size);
  }
  assert.ok(r.insights.length >= 3 && r.insights.length <= 6);
});

test("sponsored wave is found, labelled and scored as paid", () => {
  const { cluster: c, hits } = clusterFor(REPORT, G.wave);
  assert.ok(hits >= G.wave.length * 0.8, `only ${hits}/${G.wave.length} wave posts clustered together`);
  assert.equal(c.archetype, "sponsored-creator-wave");
  assert.ok(c.campaignScore > 60, `score ${c.campaignScore}`);
  assert.ok(c.signals.disclosure >= 0.7, `disclosure ${c.signals.disclosure}`);
  assert.ok(c.signals.synchronicity >= 0.5);
  assert.ok(c.signals.engagementSkew < 0.3);
  assert.match(c.label, /Nebula Interactive/);
  assert.ok(c.reasons.some((x) => /\d+ of \d+ posts carry a sponsorship disclosure/.test(x)), c.reasons.join("\n"));
  assert.ok(c.reasons.some((x) => /creators posted \d+ of the \d+ items within/.test(x)), c.reasons.join("\n"));
});

test("organic viral clip scores low", () => {
  const { cluster: c, hits } = clusterFor(REPORT, G.viral);
  const wave = clusterFor(REPORT, G.wave).cluster;
  assert.ok(hits >= G.viral.length * 0.7, `only ${hits}/${G.viral.length}`);
  assert.notEqual(c.id, wave.id);
  assert.equal(c.archetype, "organic-viral");
  assert.ok(c.campaignScore < 40, `score ${c.campaignScore}`);
  assert.ok(c.campaignScore < wave.campaignScore - 30);
  assert.ok(c.signals.engagementSkew > 0.5);
  assert.equal(c.signals.disclosure, 0);
});

test("patch wave is an update drop", () => {
  const { cluster: c, hits } = clusterFor(REPORT, G.patch);
  assert.ok(hits >= G.patch.length * 0.7, `only ${hits}/${G.patch.length}`);
  assert.equal(c.archetype, "update-drop");
  assert.ok(c.campaignScore < 60);
  assert.ok(c.keywords.some((k) => /patch|season|frostline|nerf/.test(k)), c.keywords.join(","));
});

test("background chatter is its own low-score cluster", () => {
  const bg = REPORT.clusters.find((c) => c.archetype === "background-chatter");
  assert.ok(bg, "background cluster exists");
  assert.equal(REPORT.clusters[REPORT.clusters.length - 1], bg);
  assert.ok(bg.campaignScore < 35);
  const bgIds = new Set(bg.postIds);
  assert.ok(G.bg.filter((id) => bgIds.has(id)).length >= G.bg.length * 0.8);
});

test("bursts land on the wave and the viral clip", () => {
  const b = REPORT.bursts;
  assert.ok(b.length >= 2 && b.length <= 6, `bursts: ${b.length}`);
  const waveS = Date.parse("2026-03-10T12:00:00Z"), viralS = Date.parse("2026-03-18T09:00:00Z");
  assert.ok(b.some((x) => overlap(x.start, x.end, waveS, waveS + 40 * H)), "wave burst");
  assert.ok(b.some((x) => overlap(x.start, x.end, viralS, viralS + 36 * H)), "viral burst");
  for (const x of b) {
    assert.match(x.id, /^b\d+$/);
    assert.ok(x.count > x.baseline);
    assert.ok(x.z > 0);
    assert.ok(Date.parse(x.start) <= Date.parse(x.peak) && Date.parse(x.peak) < Date.parse(x.end));
    assert.equal(Object.values(x.sourceMix).reduce((a, v) => a + v, 0), x.count);
  }
});

test("insights name the paid push and the volume split", () => {
  const txt = REPORT.insights.join("\n");
  assert.match(txt, /Strongest paid signal/);
  assert.match(txt, /Share of volume/);
  assert.match(txt, /Biggest influx/);
});

test("deterministic, independent of input order", () => {
  const a = analyze(FX, { game: GAME, now: NOW });
  const shuffled = [...FX];
  const r = rng(99);
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  const b = analyze(shuffled, { game: GAME, now: NOW });
  assert.deepEqual(a, REPORT);
  assert.deepEqual(b, REPORT);
});

test("flat noise produces no influx and no paid clusters", () => {
  const r = rng(3);
  const posts = [];
  for (let i = 0; i < 300; i++) posts.push({ id: `reddit:n${i}`, source: i % 2 ? "reddit" : "bluesky", kind: "post",
    title: `post ${i} about ${["builds", "lore", "music", "co-op", "bugs", "maps"][i % 6]} topic${i % 37}`, text: "",
    author: `u${i % 120}`, authorId: `u${i % 120}`, publishedAt: new Date(T0 + r() * 30 * D).toISOString(),
    metrics: { views: null, likes: Math.floor(r() * 50), comments: 1, viewers: null }, tags: [] });
  const rep = analyze(posts, { game: GAME, now: NOW });
  assert.ok(rep.bursts.length <= 1, `bursts ${rep.bursts.length}`);
  assert.ok(rep.clusters.every((c) => c.campaignScore < 55));
});

test("edge cases don't throw", () => {
  for (const input of [[], undefined, null, "nope", [null, 3, "x"]]) {
    const r = analyze(input, { game: GAME });
    assert.equal(r.totals.posts, 0);
    assert.deepEqual(r.timeline, []);
    assert.deepEqual(r.clusters, []);
    assert.ok(r.insights.length >= 1);
  }
  const one = analyze([FX[0]], { game: GAME, now: NOW });
  assert.equal(one.totals.posts, 1);
  assert.equal(one.clusters.length, 1);
  assert.equal(one.clusters[0].archetype, "background-chatter");
  for (const v of Object.values(one.clusters[0].signals)) assert.ok(v >= 0 && v <= 1);

  const bad = analyze([{ ...FX[0], publishedAt: "not a date" }, { ...FX[1], publishedAt: undefined }, FX[2]], { game: GAME, now: NOW });
  assert.equal(bad.totals.posts, 1);
  assert.ok(bad.insights.some((x) => /2 posts had no readable date/.test(x)));
  const allBad = analyze([{ ...FX[0], publishedAt: "" }], { game: GAME });
  assert.equal(allBad.totals.posts, 0);

  const sameTs = FX.slice(0, 60).map((p) => ({ ...p, publishedAt: "2026-03-05T10:00:00Z" }));
  const s = analyze(sameTs, { game: GAME, now: NOW });
  assert.equal(s.timeline.length >= 1, true);
  assert.equal(s.clusters.flatMap((c) => c.postIds).length, 60);

  const sparse = [{ id: "x:1", publishedAt: "2026-03-01T00:00:00Z" }, { source: "reddit", publishedAt: "2026-03-02T00:00:00Z", metrics: null, tags: null },
    { id: "x:1", source: "x", publishedAt: "2026-03-03T00:00:00Z" }];
  const sp = analyze(sparse, {});
  assert.equal(sp.totals.posts, 2, "duplicate id dropped");
  assert.equal(sp.game, "");

  const custom = analyze(FX, { game: GAME, now: NOW, bucketHours: 6 });
  assert.equal(custom.bucketHours, 6);
  assert.equal(custom.timeline.reduce((a, b) => a + b.count, 0), FX.length);
});

test("auto bucket size follows the span", () => {
  const mk = (days) => [0, 1].map((k) => ({ ...FX[k], publishedAt: new Date(T0 + k * days * D).toISOString() }));
  assert.equal(analyze(mk(2), { now: T0 }).bucketHours, 1);
  assert.equal(analyze(mk(10), { now: T0 }).bucketHours, 6);
  assert.equal(analyze(mk(30), { now: T0 }).bucketHours, 24);
});

test("disclosure detection", () => {
  const yes = ["Huge thanks to Razer for sponsoring today's video", "#ad", "Check it out #Sponsored", "This video is sponsored by NordVPN",
    "Includes paid promotion", "paid partnership with Ubisoft", "In partnership with Xbox", "use code NOVA for 10% off",
    "Key provided by Devolver", "Review copy provided by the publisher", "#gifted", "[AD] new game", "#partner", "Sponsored by Nebula Interactive."];
  const no = ["#adventure time", "This is not sponsored, I just love it", "#notsponsored", "For business or sponsorship inquiries: mail@x.com",
    "Ad blockers are great", "Partner up with friends in co-op", "I paid for this game myself", "the source code is on github", "launches the boss into orbit"];
  for (const s of yes) assert.ok(detectDisclosure(s).disclosed, `should detect: ${s}`);
  for (const s of no) assert.ok(!detectDisclosure(s).disclosed, `false positive: ${s}`);
  assert.equal(detectDisclosure("Thanks to Nebula Interactive for sponsoring this video!").sponsor, "Nebula Interactive");
  assert.equal(detectDisclosure("#ad Sponsored by Apex Forge Games.").sponsor, "Apex Forge Games");
});

test("fast enough for ~2,000 posts", () => {
  let big = [];
  for (let k = 0; k < 8; k++) big = big.concat(fixture(100 + k).posts.map((p) => ({ ...p, id: `${p.id}_${k}`, authorId: `${p.authorId}_${k}` })));
  assert.ok(big.length >= 1200);
  big = big.concat(big.slice(0, 2000 - big.length > 0 ? 2000 - big.length : 0).map((p) => ({ ...p, id: p.id + "_dup" })));
  const t = performance.now();
  const r = analyze(big, { game: GAME, now: NOW });
  const ms = performance.now() - t;
  assert.ok(ms < 3000, `${ms.toFixed(0)}ms`);
  assert.ok(r.clusters.length >= 3 && r.clusters.length <= 13);
  assert.ok(r.clusters.some((c) => c.archetype === "sponsored-creator-wave" && c.campaignScore > 60));
});

test("demo data (if present): bursts and archetypes", async (t) => {
  let demoPosts;
  try { ({ demoPosts } = await import("../demo-data.js")); } catch { t.skip("demo-data.js not available"); return; }
  const now = Date.parse("2026-11-27T12:00:00Z");
  for (const game of ["Hades II", "Elden Ring", "Hollow Knight Silksong", "Stardew Valley"]) {
    const posts = demoPosts(game, now);
    const r = analyze(posts, { game, now });
    assert.ok(r.bursts.length >= 3, `${game}: ${r.bursts.length} bursts`);
    const waveS = now - 5 * D;
    assert.ok(r.bursts.some((b) => overlap(b.start, b.end, waveS, waveS + 48 * H)), `${game}: no burst on the sponsored wave`);
    const wave = r.clusters.find((c) => c.archetype === "sponsored-creator-wave");
    assert.ok(wave && wave.campaignScore > 60, `${game}: sponsored wave`);
    const viral = r.clusters.find((c) => c.archetype === "organic-viral");
    const launch = r.clusters.find((c) => c.archetype === "launch-blitz");
    assert.ok(viral && launch, `${game}: viral + launch clusters`);
    assert.ok(viral.campaignScore + 10 <= launch.campaignScore, `${game}: viral ${viral.campaignScore} vs launch ${launch.campaignScore}`);
    assert.ok(r.clusters.some((c) => c.archetype === "update-drop"), `${game}: update drop`);
  }
});
