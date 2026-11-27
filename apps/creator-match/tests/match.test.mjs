import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GUIDE, WEIGHTS, rankCreators, draftPitch, draftFollowUp, countWords, placeholdersIn, STAGES, pipelineSummary,
  exportCsv, exportJson, importJson, csvCell, newEntry, setStage, markFollowedUp, sizeTierOf, normalizeLanguage,
  formatCount, PITCH_WORD_LIMIT, isPrelaunch,
} from "../match.js";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

const TARGET = { name: "Ashen Deck", appid: 999, tags: ["Roguelite", "Deckbuilding", "Pixel Graphics", "Strategy", "Indie"] };

const GAMES = [
  { appid: 1, name: "Gloomcrawl", tags: ["Roguelite", "Deckbuilding", "Dark Fantasy", "Indie"] },
  { appid: 2, name: "Cardspire", tags: ["Deckbuilding", "Card Game", "Strategy", "Roguelite"] },
  { appid: 3, name: "Pixel Dungeon Dash", tags: ["Roguelite", "Pixel Graphics", "Action"] },
  { appid: 4, name: "Turbo Rally 9", tags: ["Racing", "Simulation", "Sports"] },
  { appid: 5, name: "Farm Days", tags: ["Farming Sim", "Cozy", "Relaxing"] },
  { appid: 999, name: "Ashen Deck", tags: TARGET.tags },
];

const cg = (appid, days, views, title) => {
  const g = GAMES.find((x) => x.appid === appid);
  return { appid, name: g.name, url: `https://example.com/v/${appid}-${days}`, date: ago(days), title: title || `${g.name} is brutal | Part 1`, views };
};

const CREATORS = [
  { id: "youtube:best", platform: "youtube", name: "Deckhand Dana", url: "https://youtube.com/@dana", followers: 24000, language: "en",
    lastActive: ago(3), uploadsPerMonth: 10, avgViews: 6100,
    coveredGames: [cg(1, 20, 42000, "Gloomcrawl made me rethink deckbuilders"), cg(2, 40, 18000), cg(3, 55, 9000)],
    tagAffinity: { Roguelite: 0.9, Deckbuilding: 0.8, "Pixel Graphics": 0.4 } },
  { id: "curator:42", platform: "steam-curator", name: "Roguelite Ronin", url: "https://store.steampowered.com/curator/42", followers: 8000, language: "English",
    lastActive: ago(5), uploadsPerMonth: 12, avgViews: null,
    coveredGames: [cg(1, 12, null, "Recommended"), cg(2, 30, null, "Recommended")],
    tagAffinity: { Roguelite: 1, Deckbuilding: 0.6 } },
  { id: "twitch:cardcat", platform: "twitch", name: "CardCat", url: "https://twitch.tv/cardcat", followers: 15000, language: "en",
    lastActive: ago(1), uploadsPerMonth: 20, avgViews: 350,
    coveredGames: [cg(2, 8, 1200, "Cardspire all night"), cg(1, 50, 900)],
    tagAffinity: { Deckbuilding: 1, "Card Game": 0.8 } },
  { id: "youtube:huge", platform: "youtube", name: "MegaPlays", url: "https://youtube.com/@mega", followers: 3000000, language: "en",
    lastActive: ago(1), uploadsPerMonth: 30, avgViews: 300000,
    coveredGames: [cg(1, 10, 2100000)], tagAffinity: { Roguelite: 0.3, Action: 0.6 } },
  { id: "youtube:stale", platform: "youtube", name: "Gone Quiet", followers: 20000, language: "en",
    lastActive: ago(400), uploadsPerMonth: 0, avgViews: 3000,
    coveredGames: [{ ...cg(1, 420, 30000) }], tagAffinity: { Roguelite: 1, Deckbuilding: 1 } },
  { id: "youtube:racer", platform: "youtube", name: "Lap King", followers: 30000, language: "en",
    lastActive: ago(2), uploadsPerMonth: 12, avgViews: 9000,
    coveredGames: [cg(4, 5, 20000)], tagAffinity: { Racing: 1, Simulation: 0.7 } },
  { id: "youtube:german", platform: "youtube", name: "Kartenkönig", followers: 18000, language: "de",
    lastActive: ago(4), uploadsPerMonth: 8, avgViews: 4000,
    coveredGames: [cg(1, 15, 12000), cg(2, 25, 10000)], tagAffinity: { Roguelite: 0.9, Deckbuilding: 0.9 } },
  { id: "youtube:pastfan", platform: "youtube", name: "Old Friend", followers: 12000, language: "en",
    lastActive: ago(6), uploadsPerMonth: 6, avgViews: 2500,
    coveredGames: [{ appid: 999, name: "Ashen Deck", url: "https://example.com/demo", date: ago(90), title: "Ashen Deck demo first look", views: 8000 }, cg(5, 30, 4000)],
    tagAffinity: { Cozy: 0.5 } },
  { id: "youtube:cozy", platform: "youtube", name: "Cozy Corner", followers: 9000, language: "en",
    lastActive: ago(2), uploadsPerMonth: 8, avgViews: 2000, coveredGames: [cg(5, 10, 5000)], tagAffinity: { Cozy: 1 } },
  // Robustness: sparse and junk records.
  { id: "youtube:bare", platform: "youtube", name: "Bare" },
  { id: "curator:affonly", platform: "steam-curator", name: "Tags Only", tagAffinity: { roguelite: 0.5 } },
  null, "garbage", 42, { coveredGames: "nope", tagAffinity: [1, 2], followers: "lots" },
];

const DATA = { generatedAt: ago(0), source: "live", creators: CREATORS, games: GAMES };
const rank = (opts = {}, target = TARGET, data = DATA) => rankCreators(target, data, { now: NOW, ...opts });
const ids = (rs) => rs.map((r) => r.creator.id);

// --- GUIDE ----------------------------------------------------------------

test("GUIDE has sourced principles, dos and don'ts", () => {
  assert.ok(GUIDE.principles.length >= 6);
  for (const p of GUIDE.principles) {
    assert.ok(p.title && p.body);
    assert.match(p.sourceUrl, /^https:\/\//);
  }
  for (const d of [...GUIDE.pitchDos, ...GUIDE.pitchDonts]) assert.match(d.sourceUrl, /^https:\/\//);
  assert.ok(GUIDE.pitchDos.length >= 4 && GUIDE.pitchDonts.length >= 4);
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

// --- Ranking --------------------------------------------------------------

test("ranking picks the obvious best fits", () => {
  const rs = rank();
  const top3 = ids(rs).slice(0, 4);
  for (const id of ["youtube:best", "curator:42", "twitch:cardcat"]) assert.ok(top3.includes(id), `${id} in top 4: ${top3}`);
  assert.equal(rs[0].creator.id, "youtube:best");
  for (const r of rs) {
    assert.ok(r.score >= 0 && r.score <= 100 && Number.isInteger(r.score));
    assert.ok(r.reasons.length >= 2 && r.reasons.length <= 4, r.reasons.join(" | "));
    assert.ok(["micro", "small", "mid", "large"].includes(r.sizeTier));
  }
  // sorted
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i - 1].score >= rs[i].score);
  const best = rs[0];
  assert.equal(best.sizeTier, "small");
  assert.equal(best.matchedGames[0].name, "Gloomcrawl");
  assert.match(best.reasons[0], /Covered 3 .* in the last 60 days, incl\. 'Gloomcrawl' \(42K views\)/);
  assert.ok(best.reasons.some((r) => /\d/.test(r)));
  const sum = Object.values(best.breakdown).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - best.score) <= 1);
});

test("irrelevant, stale and junk creators are dropped", () => {
  const got = ids(rank());
  for (const id of ["youtube:racer", "youtube:cozy", "youtube:stale", "youtube:bare"]) assert.ok(!got.includes(id), id);
  assert.ok(got.includes("curator:affonly"), "affinity alone is enough to be listed");
  assert.ok(ids(rank({ activeWithinDays: 0 })).includes("youtube:stale"), "activeWithinDays 0 turns the filter off");
});

test("small creators beat a huge one by default; configurable", () => {
  const rs = rank();
  const pos = (id, list) => ids(list).indexOf(id);
  assert.ok(pos("youtube:best", rs) < pos("youtube:huge", rs));
  const huge = rs.find((r) => r.creator.id === "youtube:huge");
  assert.equal(huge.sizeTier, "large");
  const bigFirst = rank({ sizeWeights: { large: 1, micro: 0.2, small: 0.2, mid: 0.2 } });
  const h2 = bigFirst.find((r) => r.creator.id === "youtube:huge");
  assert.ok(h2.score > huge.score);
});

test("a creator who already covered the target is flagged", () => {
  const r = rank().find((x) => x.creator.id === "youtube:pastfan");
  assert.ok(r, "listed even with off-genre tags");
  assert.equal(r.coveredTarget, true);
  assert.match(r.reasons[0], /Already covered Ashen Deck 90 days ago \(8K views\)/);
  assert.equal(r.matchedGames[0].isTarget, true);
});

test("filters: platform, followers, language", () => {
  assert.deepEqual([...new Set(rank({ platform: "steam-curator" }).map((r) => r.creator.platform))], ["steam-curator"]);
  assert.deepEqual([...new Set(rank({ platform: "curator" }).map((r) => r.creator.platform))], ["steam-curator"]);
  assert.deepEqual(ids(rank({ platform: "twitch" })), ["twitch:cardcat"]);
  assert.ok(rank({ platform: ["youtube", "twitch"] }).every((r) => r.creator.platform !== "steam-curator"));
  const sized = rank({ minFollowers: 10000, maxFollowers: 50000 });
  assert.ok(sized.every((r) => r.creator.followers == null || (r.creator.followers >= 10000 && r.creator.followers <= 50000)));
  assert.ok(!ids(sized).includes("youtube:huge") && !ids(sized).includes("curator:42"));
  const en = ids(rank({ language: "en" }));
  assert.ok(!en.includes("youtube:german"));
  assert.ok(en.includes("curator:42"), "'English' normalises to en");
  assert.ok(ids(rank({ language: "German" })).includes("youtube:german"));
  assert.ok(ids(rank()).includes("youtube:german"), "no language filter by default");
  assert.equal(rank({ limit: 2 }).length, 2);
  assert.ok(!ids(rank({ excludeIds: ["youtube:best"] })).includes("youtube:best"));
});

test("ranking is deterministic and does not mutate input", () => {
  const before = JSON.stringify(DATA);
  const a = JSON.stringify(rank());
  const b = JSON.stringify(rank());
  assert.equal(a, b);
  assert.equal(JSON.stringify(DATA), before);
});

test("tag order matters: first tag weighs more", () => {
  const deckFirst = { ...TARGET, tags: ["Deckbuilding", "Card Game", "Roguelite"] };
  const rs = rank({}, deckFirst);
  const pos = (id) => ids(rs).indexOf(id);
  const rs2 = rank({}, { ...TARGET, tags: ["Roguelite", "Action", "Deckbuilding"] });
  const score = (list, id) => list.find((r) => r.creator.id === id).score;
  assert.ok(score(rs, "twitch:cardcat") > score(rs2, "twitch:cardcat"));
  assert.ok(pos("twitch:cardcat") >= 0);
});

test("uses sample snapshot time when source is sample", () => {
  const old = { ...DATA, source: "sample", generatedAt: "2026-11-27T12:00:00Z" };
  const rs = rankCreators(TARGET, old, {}); // no now: falls back to generatedAt
  assert.equal(rs[0].creator.id, "youtube:best");
});

test("fast for 5,000 creators", () => {
  const many = [];
  for (let i = 0; i < 5000; i++) {
    const base = CREATORS[i % 9];
    many.push({ ...base, id: `${base.id}-${i}`, followers: (base.followers || 1000) + i });
  }
  const t0 = performance.now();
  const rs = rankCreators(TARGET, { creators: many, games: GAMES }, { now: NOW });
  const ms = performance.now() - t0;
  assert.ok(rs.length > 1000);
  assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`);
});

test("edge cases don't throw", () => {
  for (const [t, d, o] of [
    [undefined, undefined, undefined], [null, null, null], [{}, {}, {}], [TARGET, { creators: "x" }, {}],
    [{ tags: "Roguelite" }, DATA, { platform: 5, minFollowers: "a", language: 7, sizeWeights: "x" }],
    [{ tags: [null, 3, { name: "Roguelite" }] }, DATA, { now: "not a date" }],
  ]) {
    assert.doesNotThrow(() => rankCreators(t, d, o));
  }
  assert.deepEqual(rankCreators(TARGET, {}, {}), []);
  const objTags = rankCreators({ name: "X", tags: [{ name: "Roguelite", votes: 3 }] }, DATA, { now: NOW });
  assert.ok(objTags.length > 0);
});

test("helpers", () => {
  assert.equal(sizeTierOf(9999), "micro");
  assert.equal(sizeTierOf(10000), "small");
  assert.equal(sizeTierOf(60000), "mid");
  assert.equal(sizeTierOf(3e6), "large");
  assert.equal(sizeTierOf(null), null);
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage("Deutsch"), "de");
  assert.equal(formatCount(42300), "42K");
  assert.equal(formatCount(1250000), "1.3M");
  assert.equal(formatCount(6100), "6.1K");
});

// --- Pitches --------------------------------------------------------------

const BRACKET = /\[[^\]]+\]/g;
const ALLOWED_PLACEHOLDERS = new Set(["[your name]", "[publisher]", "[launch date]", "[embargo date]", "[press kit link]",
  "[Steam page link]", "[one-line hook: what makes it different]", "[Steam key]", "[genre]", "[game name]", "[similar game you covered]",
  "[release window]", "[embargo date, if any]", "[press kit or trailer link]", "[playtest key]", "[demo link]"]);

function checkPitch(p) {
  assert.ok(p.subject && p.body);
  assert.ok(countWords(p.body) < PITCH_WORD_LIMIT, `${countWords(p.body)} words:\n${p.body}`);
  assert.ok(p.subject.length <= 90, p.subject);
  const all = `${p.subject}\n${p.body}`;
  assert.doesNotMatch(all, /\{\{|\}\}|\$\{|undefined|null|NaN|\[object/);
  for (const ph of all.match(BRACKET) || []) assert.ok(ALLOWED_PLACEHOLDERS.has(ph), `unexpected placeholder ${ph}`);
  assert.doesNotMatch(all, /huge fan|love your (channel|content)|amazing/i, "no fake flattery");
}

test("pitches: short, specific, platform-specific, no stray tokens", () => {
  const rs = rank();
  for (const id of ["youtube:best", "curator:42", "twitch:cardcat"]) {
    const r = rs.find((x) => x.creator.id === id);
    for (const tone of ["friendly", "professional", "brief"]) {
      const p = draftPitch(r.creator, TARGET, { publisher: "Tiny Lantern", tone, matchedGames: r.matchedGames });
      checkPitch(p);
      assert.ok(p.body.includes(r.matchedGames[0].name), `mentions matched game:\n${p.body}`);
      assert.equal(p.prelaunch, true, "no release date: treated as pre-launch");
      assert.match(p.body, /\[release window\]/);
      assert.match(p.body, /\[press kit or trailer link\]/);
      assert.match(p.body, /wishlist/i);
      assert.match(p.body, /\?/, "has a question / ask");
      assert.deepEqual(p.placeholders, placeholdersIn(`${p.subject}\n${p.body}`));
    }
  }
  const yt = draftPitch(rs[0].creator, TARGET, { publisher: "Tiny Lantern", matchedGames: rs[0].matchedGames });
  assert.match(yt.body, /Steam key for the preview build/);
  assert.match(yt.body, /Gloomcrawl made me rethink deckbuilders/, "references the video by title");
  assert.match(yt.body, /https:\/\/store\.steampowered\.com\/app\/999\//);
  const cur = draftPitch(rs.find((x) => x.creator.id === "curator:42").creator, TARGET, { publisher: "Tiny Lantern", data: DATA, now: NOW });
  assert.doesNotMatch(cur.body, /"Recommended"/, "generic curator titles aren't quoted");
  assert.match(cur.body, /Curator Connect/);
  assert.match(cur.body, /curator page/);
  assert.doesNotMatch(cur.body, /\[Steam key\]/);
  const tw = draftPitch(rs.find((x) => x.creator.id === "twitch:cardcat").creator, TARGET, {});
  assert.match(tw.body, /stream/i);
  assert.notEqual(yt.body, cur.body);
});

test("pitch finds matches itself when given data; fills known values", () => {
  const dana = CREATORS[0];
  const p = draftPitch(dana, TARGET, { data: DATA, now: NOW, publisher: "Tiny Lantern", senderName: "Sam", launchDate: "March 3, 2027",
    embargoDate: "Feb 24, 2027", pressKitUrl: "https://tinylantern.games/press", steamKey: "AAAAA-BBBBB-CCCCC", hook: "A deckbuilder where cards burn." });
  checkPitch(p);
  assert.equal(p.prelaunch, false, "launch date given and in the past? no: a string date in the future");
  assert.match(p.body, /Gloomcrawl/);
  assert.match(p.body, /AAAAA-BBBBB-CCCCC/);
  assert.match(p.body, /Feb 24, 2027/);
  assert.deepEqual(p.placeholders, []);
  const noKey = draftPitch(dana, TARGET, { data: DATA, now: NOW, keyOffer: false });
  assert.doesNotMatch(noKey.body, /\[Steam key\]/);
  assert.match(noKey.body, /if you'd like one/);
});

test("pitch with no known coverage invents nothing", () => {
  const p = draftPitch({ name: "Stranger", platform: "youtube" }, TARGET, {});
  checkPitch(p);
  assert.match(p.body, /\[similar game you covered\]/);
  const past = draftPitch(CREATORS[7], TARGET, { data: DATA, now: NOW });
  checkPitch(past);
  assert.match(past.body, /You covered Ashen Deck before/);
});

test("pitch strips brackets and markup from remote text, caps length", () => {
  const evil = { name: "<b>[x]</b> {{name}}", platform: "youtube",
    coveredGames: [{ appid: 1, name: "Gloomcrawl", title: "[LIVE] ".repeat(30) + "{{title}}", date: ago(3), views: 10 }] };
  const p = draftPitch(evil, { ...TARGET, shortDescription: "word ".repeat(200) }, { data: DATA, now: NOW });
  checkPitch(p);
  assert.doesNotMatch(p.body, /<b>|\[x\]|\[LIVE\]/);
});

test("pitch edge cases don't throw", () => {
  for (const args of [[], [null, null, null], [{}, {}, {}], [{ platform: "twitch" }, { tags: "x" }, { tone: "angry" }], [CREATORS[0], TARGET, { matchedGames: "x" }]]) {
    assert.doesNotThrow(() => checkPitch(draftPitch(...args)));
  }
  const f = draftFollowUp(CREATORS[1], TARGET, {});
  assert.ok(f.wordCount < 80);
  assert.match(f.body, /Curator Connect/);
  assert.doesNotThrow(() => draftFollowUp());
});

// --- Pipeline -------------------------------------------------------------

const ENTRIES = [
  { creatorId: "a", stage: "shortlist", notes: "", keys: [], history: [{ stage: "shortlist", at: ago(20) }] },
  { creatorId: "b", stage: "pitched", notes: "", keys: [], history: [{ stage: "shortlist", at: ago(20) }, { stage: "pitched", at: ago(10) }] },
  { creatorId: "c", stage: "pitched", notes: "", keys: [], history: [{ stage: "pitched", at: ago(3) }] },
  { creatorId: "d", stage: "key-sent", notes: "", keys: ["K1"], history: [{ stage: "pitched", at: ago(12) }, { stage: "key-sent", at: ago(12) }] },
  { creatorId: "e", stage: "covered", notes: "great vid", keys: ["K2", "K2", "K3"], history: [{ stage: "pitched", at: ago(30) }, { stage: "replied", at: ago(28) }, { stage: "key-sent", at: ago(27) }, { stage: "covered", at: ago(20) }] },
  { creatorId: "f", stage: "declined", notes: "", keys: [], history: [{ stage: "pitched", at: ago(30) }, { stage: "declined", at: ago(29) }] },
  { creatorId: "g", stage: "replied", notes: "", keys: [], history: [{ stage: "pitched", at: ago(30) }, { stage: "replied", at: ago(25) }] },
  { creatorId: "h", stage: "pitched", notes: "", keys: [], followedUpAt: ago(9), history: [{ stage: "pitched", at: ago(20) }] },
  { creatorId: "i", stage: "key-sent", notes: "", keys: ["K4"], history: [{ stage: "pitched", at: ago(30) }, { stage: "replied", at: ago(28) }, { stage: "key-sent", at: ago(27) }] },
];

test("STAGES matches the contract", () => {
  assert.deepEqual(STAGES, ["shortlist", "pitched", "replied", "key-sent", "covered", "declined"]);
});

test("pipeline math", () => {
  const s = pipelineSummary(ENTRIES, { now: NOW });
  assert.equal(s.total, 9);
  assert.deepEqual(s.byStage, { shortlist: 1, pitched: 3, replied: 1, "key-sent": 2, covered: 1, declined: 1 });
  assert.equal(s.contacted, 8);
  assert.equal(s.replied, 4); // e, f, g, i
  assert.equal(s.covered, 1);
  assert.equal(s.replyRate, 0.5);
  assert.equal(s.coverageRate, 0.125);
  assert.equal(s.keysSent, 4); // K1, K2, K3, K4 (K2 deduped)
  assert.equal(s.creatorsWithKeys, 3);
  assert.equal(s.keysRedeemedUnknown, 2); // K1 (d), K4 (i)
  assert.deepEqual(s.followUpDue.map((x) => x.creatorId), ["d", "b"]); // c too recent, h already followed up, i replied
  assert.equal(s.followUpDue[1].daysSince, 10);
  assert.deepEqual(s.followedUpNoReply.map((x) => x.creatorId), ["h"]);
  const s2 = pipelineSummary(ENTRIES, { now: NOW, followUpDays: 2 });
  assert.ok(s2.followUpDue.some((x) => x.creatorId === "c"));
});

test("pipeline edge cases", () => {
  const empty = pipelineSummary([]);
  assert.equal(empty.coverageRate, 0);
  assert.equal(empty.total, 0);
  for (const v of [undefined, null, "x", [null, 1, "y", {}, { stage: "weird", keys: "notarray", history: "no" }]]) {
    assert.doesNotThrow(() => pipelineSummary(v, { now: "bad" }));
  }
  const s = pipelineSummary([{}, { stage: "pitched" }], { now: NOW });
  assert.equal(s.byStage.shortlist, 1);
  assert.equal(s.followUpDue.length, 0, "no date, no follow-up claim");
});

test("entry helpers", () => {
  let e = newEntry("youtube:best", NOW);
  assert.equal(e.stage, "shortlist");
  e = setStage(e, "Key sent", NOW + 1000);
  assert.equal(e.stage, "key-sent");
  assert.equal(e.history.length, 2);
  assert.equal(setStage(e, "bogus").stage, "key-sent");
  e = setStage(newEntry("x", NOW - 10 * 86400000), "pitched", NOW - 10 * 86400000);
  assert.equal(pipelineSummary([e], { now: NOW }).followUpDue.length, 1);
  assert.equal(pipelineSummary([markFollowedUp(e, NOW)], { now: NOW }).followUpDue.length, 0);
});

// --- CSV / JSON -----------------------------------------------------------

test("CSV neutralises formula injection and quotes properly", () => {
  for (const bad of ["=HYPERLINK(\"http://x\",\"y\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1", "＝1"]) {
    const c = csvCell(bad);
    const inner = c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c;
    assert.equal(inner[0], "'", `${JSON.stringify(bad)} → ${c}`);
  }
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
  const csv = exportCsv([{ creatorId: "=cmd|' /C calc'!A0", stage: "pitched", notes: "line1\nline2, \"q\"", keys: ["-KEY1", "K2"],
    history: [{ stage: "pitched", at: ago(3) }] }, null, "x"], { creators: [{ id: "=cmd|' /C calc'!A0", name: "@evil", platform: "youtube" }] });
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "creatorId,name,platform,url,stage,keys,notes,lastContact,followedUpAt,history");
  assert.doesNotMatch(csv, /(^|,|\r\n)[=+\-@]/m, "no cell starts with a formula character");
  assert.match(csv, /"'=cmd/);
  assert.match(csv, /'@evil/);
  assert.match(csv, /"line1\nline2, ""q"""/);
  assert.doesNotThrow(() => exportCsv(undefined));
  assert.equal(exportCsv([]).trim().split("\r\n").length, 1);
});

test("importJson round-trips and is tolerant", () => {
  const back = importJson(exportJson(ENTRIES, NOW));
  assert.deepEqual(back.errors, []);
  assert.equal(back.entries.length, ENTRIES.length);
  assert.deepEqual(pipelineSummary(back.entries, { now: NOW }), pipelineSummary(ENTRIES, { now: NOW }));

  const messy = importJson(JSON.stringify([
    { creatorId: " youtube:a ", stage: "Key Sent", keys: "K1, K2 K1", history: [{ stage: "pitched", at: ago(2) }, { stage: "nope", at: "x" }] },
    { id: "curator:1", stage: "teleported", notes: 5 },
    { stage: "pitched" },
    "junk",
    { creatorId: "youtube:a", stage: "covered", keys: ["K3"], history: [{ stage: "covered", at: ago(1) }], url: "javascript:alert(1)" },
  ]));
  assert.equal(messy.entries.length, 2);
  assert.equal(messy.errors.length, 2);
  const a = messy.entries.find((e) => e.creatorId === "youtube:a");
  assert.equal(a.stage, "covered");
  assert.deepEqual(a.keys, ["K1", "K2", "K3"]);
  assert.equal(a.history.length, 2);
  assert.equal(a.url, undefined);
  const c = messy.entries.find((e) => e.creatorId === "curator:1");
  assert.equal(c.stage, "shortlist");
  assert.equal(c.notes, "5");
  assert.ok(messy.warnings.some((w) => /unknown stage/.test(w)));

  const map = importJson(JSON.stringify({ "twitch:x": { stage: "pitched" }, "__proto__": { stage: "pitched" } }));
  assert.ok(map.entries.some((e) => e.creatorId === "twitch:x"));
  assert.equal({}.stage, undefined, "no prototype pollution");

  for (const bad of ["", "not json", "null", "42", "\"str\"", "{}", "[]", undefined]) {
    const r = importJson(bad);
    assert.ok(Array.isArray(r.entries) && Array.isArray(r.errors));
  }
  assert.match(importJson("{oops").errors[0], /Not valid JSON/);
  assert.equal(importJson("﻿" + JSON.stringify([{ creatorId: "x" }])).entries.length, 1);
});

// --- Snapshot -------------------------------------------------------------

const SNAPSHOT = fileURLToPath(new URL("../data/creators.json", import.meta.url));

test("works on the committed data snapshot", { skip: !existsSync(SNAPSHOT) && "data/creators.json not present yet" }, () => {
  const data = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  assert.ok(Array.isArray(data.creators) && data.creators.length > 0);
  const tagCounts = new Map();
  for (const g of data.games || []) for (const t of g.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const common = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
  const target = { name: "Snapshot Test Game", tags: common.length ? common : ["Roguelite", "Indie"] };
  const t0 = performance.now();
  const rs = rankCreators(target, data, { activeWithinDays: 0 });
  assert.ok(performance.now() - t0 < 1000);
  assert.ok(rs.length > 0, "some creators match the snapshot's most common tags");
  for (const r of rs.slice(0, 25)) {
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.ok(r.reasons.length >= 2 && r.reasons.length <= 4);
    const p = draftPitch(r.creator, target, { matchedGames: r.matchedGames, publisher: "Tiny Lantern" });
    checkPitch(p);
    if (r.matchedGames[0] && !r.matchedGames[0].isTarget) assert.ok(p.body.includes(r.matchedGames[0].name.replace(/[\[\]{}<>]/g, "").split(" ")[0]));
  }
  for (const platform of ["youtube", "steam-curator", "twitch"]) {
    assert.ok(rankCreators(target, data, { platform, activeWithinDays: 0 }).every((r) => r.creator.platform === platform));
  }
  // Default options (90-day activity window, sample-time reference) still return something.
  assert.ok(rankCreators(target, data).length > 0, "default activity filter keeps some snapshot creators");
});
