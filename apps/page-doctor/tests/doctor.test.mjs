// Tests for doctor.js, using made-up fixture games (and the committed sample corpus when present).
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  RULES, SOURCES, AREA_WEIGHTS, DEFAULT_MODEL, SHORT_DESC_MAX,
  findComparables, diagnose, rewriteRequest, audit, normalizeGame, parseOwners, parseReleaseDate, toTags, tagKind, gradeFor,
} from "../doctor.js";

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------
const LANGS_10 = ["English", "Simplified Chinese", "Russian", "Spanish - Spain", "Portuguese - Brazil", "German", "French", "Japanese", "Korean", "Polish"];
const shots = (n) => Array.from({ length: n }, (_, i) => `https://cdn.example/ss${i}.jpg`);
const tagList = (names) => names.map((name, i) => ({ name, votes: 1000 - i * 40 }));

let nextId = 1000;
function make(over) {
  return {
    appid: nextId++, name: "Game", url: "https://store.steampowered.com/app/1/",
    shortDescription: "", aboutText: "", tags: [], genres: ["Indie"], priceUSD: 19.99, isFree: false,
    releaseDate: "Mar 4, 2025", comingSoon: false, developers: ["Dev"], publishers: ["Pub"],
    headerImage: "https://cdn.example/header.jpg", capsuleImage: "https://cdn.example/capsule.jpg",
    screenshots: shots(10), movies: 2, languages: LANGS_10, fullAudioLanguages: ["English"],
    reviews: { total: 3000, positivePct: 90, scoreDesc: "Very Positive" }, followers: 20000,
    ownersRange: "200,000 .. 500,000", ccu: 300, hasDemo: true, earlyAccess: false,
    ...over,
  };
}

const DECK_TAGS = ["Roguelike Deckbuilder", "Deckbuilding", "Card Battler", "Roguelike", "Strategy", "Turn-Based Combat", "Card Game", "Roguelite", "Indie", "Singleplayer", "Fantasy", "Pixel Graphics", "Replay Value", "Difficult", "Turn-Based Strategy", "Tactical", "2D", "Atmospheric", "Great Soundtrack", "Dark Fantasy"];
const FARM_TAGS = ["Farming Sim", "Life Sim", "Cozy", "Relaxing", "Agriculture", "Crafting", "Cute", "Pixel Graphics", "Simulation", "RPG", "Indie", "Singleplayer", "Multiplayer", "Co-op", "Colorful", "Family Friendly", "Romance", "Dating Sim", "Fishing", "Sandbox"];

const deckDesc = (n) => `A roguelike deckbuilder where you draft cards, chain combos and climb a cursed tower ${n}. Every run reshuffles the map, relics and enemies.`;

const deckGames = [
  // a mega-hit in the niche
  make({ name: "Spire Hit", tags: tagList(DECK_TAGS), genres: ["Indie", "Strategy"], priceUSD: 24.99, shortDescription: deckDesc("of spires"), reviews: { total: 120000, positivePct: 97, scoreDesc: "Overwhelmingly Positive" }, ownersRange: "5,000,000 .. 10,000,000", followers: 400000 }),
  ...Array.from({ length: 10 }, (_, i) => make({
    name: `Deck Indie ${i}`,
    tags: tagList(i % 2 ? DECK_TAGS : [DECK_TAGS[1], DECK_TAGS[0], ...DECK_TAGS.slice(2)]),
    genres: ["Indie", "Strategy"], priceUSD: 14.99 + i, shortDescription: deckDesc(`number ${i}`),
    screenshots: shots(8 + (i % 3)), reviews: { total: 800 + i * 300, positivePct: 85 + (i % 5), scoreDesc: "Very Positive" },
  })),
  // upcoming deckbuilders
  make({ name: "Deck Upcoming A", tags: tagList(DECK_TAGS.slice(0, 15)), comingSoon: true, priceUSD: null, reviews: { total: null, positivePct: null, scoreDesc: null }, followers: 3000, ownersRange: null, shortDescription: deckDesc("upcoming") }),
  make({ name: "Deck Upcoming B", tags: tagList(DECK_TAGS.slice(0, 12)), comingSoon: true, priceUSD: null, reviews: { total: null, positivePct: null, scoreDesc: null }, followers: 5000, ownersRange: null, shortDescription: deckDesc("upcoming b") }),
  make({ name: "Deck Upcoming C", tags: tagList(DECK_TAGS.slice(0, 10)), comingSoon: true, priceUSD: null, reviews: { total: null, positivePct: null, scoreDesc: null }, followers: 2000, ownersRange: null, shortDescription: deckDesc("upcoming c") }),
];
const farmGames = Array.from({ length: 8 }, (_, i) => make({
  name: `Farm ${i}`, tags: tagList(FARM_TAGS), genres: ["Indie", "Simulation", "RPG"], priceUSD: 14.99,
  shortDescription: "A cozy farming sim where you grow crops, befriend villagers and restore your grandmother's farm.",
}));
const corpus = { generatedAt: "2026-11-27T00:00:00.000Z", source: "sample", games: [...deckGames, ...farmGames] };

// Weak: short vague copy, generic top tags, few tags, 3 screenshots, no trailer, English only, cheap, few reviews.
const weak = make({
  name: "Weak Cards", shortDescription: "An epic adventure to save the world.",
  tags: tagList(["Indie", "Singleplayer", "Card Game", "Great Soundtrack", "Cute", "Roguelike"]),
  genres: ["Indie"], screenshots: shots(3), movies: 0, languages: ["English"], priceUSD: 4.99,
  reviews: { total: 8, positivePct: 62, scoreDesc: "Mixed" }, followers: 120, hasDemo: false,
});
// Strong: everything done well.
const strong = make({
  name: "Strong Cards",
  shortDescription: "A roguelike deckbuilder where you play as an exiled alchemist, brewing volatile potion cards to blast through a shifting tower. Mix ingredients mid-fight to forge combos no other run will repeat.",
  tags: tagList(DECK_TAGS), genres: ["Indie", "Strategy"], screenshots: shots(12), movies: 2, languages: LANGS_10,
  priceUSD: 19.99, reviews: { total: 6000, positivePct: 93, scoreDesc: "Very Positive" }, followers: 40000,
});

const byId = (d) => Object.fromEntries(d.checks.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------
test("every RULES source is https, and every rule has a title, area and rule text", () => {
  assert.ok(RULES.length >= 15);
  for (const r of RULES) {
    assert.ok(r.id && r.title && r.rule, r.id);
    assert.ok(Object.keys(AREA_WEIGHTS).includes(r.area), `${r.id} area ${r.area}`);
    assert.ok(r.sources.length >= 1, r.id);
    for (const s of r.sources) assert.match(s.url, /^https:\/\/[^\s]+$/, `${r.id}: ${s.url}`);
  }
  for (const s of Object.values(SOURCES)) assert.match(s.url, /^https:\/\//);
  assert.equal(Object.values(AREA_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test("rules cover the required areas", () => {
  const areas = new Set(RULES.map((r) => r.area));
  for (const a of ["capsule", "description", "tags", "media", "price", "languages", "social-proof", "timing"]) assert.ok(areas.has(a), a);
  for (const id of ["capsule-legibility", "desc-genre", "tags-missing", "media-trailer", "languages-markets", "early-access-wording", "timing-next-fest", "page-live", "wishlist-readiness"]) {
    assert.ok(RULES.some((r) => r.id === id), id);
  }
});

// ---------------------------------------------------------------------------------------------
// Comparables
// ---------------------------------------------------------------------------------------------
test("findComparables: same-niche games, excludes the game itself, hits not excluded", () => {
  const target = deckGames[3];
  const comps = findComparables(target, corpus, { limit: 10 });
  assert.equal(comps.length, 10);
  assert.ok(comps.every((c) => c.game.appid !== target.appid), "excludes itself");
  assert.ok(comps.every((c) => !c.game.name.startsWith("Farm")), "no farming games in a deckbuilder's top 10");
  assert.ok(comps.some((c) => c.game.name === "Spire Hit"), "mega-hit in the niche is a fair comparable");
  for (const c of comps) {
    assert.ok(c.similarity > 0 && c.similarity <= 1.0001);
    assert.ok(c.sharedTags.includes("Roguelike Deckbuilder"));
    assert.ok(["hit", "indie", "small", "upcoming"].includes(c.tier));
  }
  for (let i = 1; i < comps.length; i++) assert.ok(comps[i - 1].rank >= comps[i].rank, "sorted by rank");
});

test("findComparables ranks by relevance only, not size", () => {
  // Two games with identical tags: one tiny, one huge. Same similarity, same rank.
  const tiny = make({ name: "Tiny", tags: tagList(FARM_TAGS), genres: ["Indie"], reviews: { total: 3, positivePct: 100 }, ownersRange: "0 .. 20,000" });
  const huge = make({ name: "Huge", tags: tagList(FARM_TAGS), genres: ["Indie"], reviews: { total: 500000, positivePct: 98 }, ownersRange: "20,000,000 .. 50,000,000" });
  const comps = findComparables({ name: "Q", tags: FARM_TAGS }, { games: [tiny, huge, ...deckGames] }, { limit: 5 });
  const a = comps.find((c) => c.game.name === "Tiny"), b = comps.find((c) => c.game.name === "Huge");
  assert.equal(a.rank, b.rank);
  assert.equal(a.tier, "small");
  assert.equal(b.tier, "hit");
});

test("findComparables: tag order matters (top tags weigh more)", () => {
  const front = make({ name: "Front", tags: tagList(["Metroidvania", "Souls-like", "Indie", "Singleplayer", "2D", "Atmospheric"]) });
  const back = make({ name: "Back", tags: tagList(["Indie", "Singleplayer", "2D", "Atmospheric", "Pixel Graphics", "Cute", "Funny", "Colorful", "Relaxing", "Story Rich", "Short", "Retro", "Female Protagonist", "Exploration", "Fantasy", "Metroidvania", "Souls-like"]) });
  const comps = findComparables({ name: "T", tags: ["Metroidvania", "Souls-like", "Action"] }, { games: [back, front] });
  assert.equal(comps[0].game.name, "Front");
});

test("findComparables works from tags alone (manual game) and is deterministic", () => {
  const manual = { name: "My Deck Game", tags: ["Deckbuilding", "Roguelike Deckbuilder", "Card Battler", "Fantasy"] };
  const a = findComparables(manual, corpus);
  const b = findComparables(manual, corpus);
  assert.deepEqual(a.map((c) => c.game.appid), b.map((c) => c.game.appid));
  assert.ok(a.length >= 10);
  assert.ok(a.slice(0, 10).every((c) => c.game.name.startsWith("Deck") || c.game.name === "Spire Hit"));
  assert.ok(a.some((c) => c.tier === "upcoming"), "upcoming games are fair comparables");
});

// ---------------------------------------------------------------------------------------------
// Diagnose
// ---------------------------------------------------------------------------------------------
test("weak game fails the checks it should, with numbers against comparables", () => {
  const comps = findComparables(weak, corpus);
  const d = diagnose(weak, comps);
  const c = byId(d);
  for (const id of ["desc-length", "desc-genre", "desc-hook", "tags-top-genre", "tags-missing", "media-screenshots", "media-trailer", "languages-markets", "price-vs-comps", "reviews-count", "reviews-positive"]) {
    assert.equal(c[id]?.status, "fail", `${id}: ${c[id]?.status} ${c[id]?.detail}`);
  }
  assert.match(c["media-screenshots"].detail, /Comparable games median \d+ screenshots; you have 3\./);
  assert.match(c["languages-markets"].detail, /\d+ of \d+ comparable games support Simplified Chinese; you don't\. Chinese is Steam's #2 language/);
  assert.match(c["price-vs-comps"].detail, /Comparable paid games median \$\d+\.\d\d; you're \$4\.99/);
  assert.match(c["desc-hook"].detail, /save the world/);
  assert.ok(["D", "F"].includes(d.grade), `grade ${d.grade} score ${d.score}`);
  assert.ok(d.score < 45);
  // Tag suggestions
  assert.ok(d.tagSuggestions.add.some((a) => a.tag === "Roguelike Deckbuilder"));
  assert.ok(d.tagSuggestions.remove.some((r) => r.tag === "Indie"));
  assert.ok(d.tagSuggestions.reorder.indexOf("Card Game") < d.tagSuggestions.reorder.indexOf("Indie"));
  for (const x of [...d.tagSuggestions.add, ...d.tagSuggestions.remove]) assert.ok(x.why.length > 20);
  // Every check has an actionable fix and a known shape
  for (const ch of d.checks) {
    assert.ok(ch.fix && ch.fix.length > 10, ch.id);
    assert.ok(["pass", "warn", "fail"].includes(ch.status));
    assert.ok(RULES.some((r) => r.id === ch.id));
    assert.match(ch.source, /^https:\/\//);
  }
});

test("strong game gets a high grade", () => {
  const d = diagnose(strong, findComparables(strong, corpus));
  assert.equal(d.grade, "A", `score ${d.score}: ${d.checks.filter((c) => c.status !== "pass").map((c) => c.id + ":" + c.detail).join(" | ")}`);
  assert.ok(d.score >= 85);
  const c = byId(d);
  for (const id of ["desc-length", "desc-genre", "desc-hook", "tags-count", "tags-top-genre", "media-screenshots", "media-trailer", "languages-markets", "reviews-count", "reviews-positive"]) {
    assert.equal(c[id].status, "pass", `${id}: ${c[id].detail}`);
  }
});

test("score formula is transparent: area scores combine with AREA_WEIGHTS", () => {
  const d = diagnose(weak, findComparables(weak, corpus));
  const live = Object.values(d.areas).filter((a) => a.score != null);
  const expect = Math.round(live.reduce((s, a) => s + a.weight * a.score, 0) / live.reduce((s, a) => s + a.weight, 0));
  assert.equal(d.score, expect);
  assert.equal(d.grade, gradeFor(d.score));
  assert.ok(d.formula.includes("areaWeight"));
  // manual checks never count
  for (const ch of d.checks.filter((x) => x.manual)) assert.equal(ch.score, null);
});

test("benchmarks are computed from comparables", () => {
  const d = diagnose(weak, findComparables(weak, corpus));
  const b = d.benchmarks;
  for (const k of ["medianPrice", "medianScreenshots", "medianLanguages", "medianDescLength", "medianTags", "medianReviews", "trailerShare"]) {
    assert.equal(typeof b[k], "number", k);
  }
  assert.ok(b.topTags.length > 0 && b.topTags[0].tag);
  assert.ok(b.languageShare.find((l) => l.language === "Simplified Chinese").share > 0.5);
});

test("coming-soon game gets pre-launch checks, not review failures", () => {
  const upcoming = make({
    name: "Soon Cards", comingSoon: true, releaseDate: "Q3 2027", priceUSD: null, hasDemo: false,
    reviews: { total: null, positivePct: null, scoreDesc: null }, followers: 900, ownersRange: null,
    tags: tagList(DECK_TAGS), shortDescription: strong.shortDescription,
  });
  const d = diagnose(upcoming, findComparables(upcoming, corpus), { now: "2026-11-27T00:00:00Z" });
  const c = byId(d);
  assert.equal(d.prelaunch, true);
  assert.equal(c["reviews-count"], undefined);
  assert.equal(c["reviews-positive"], undefined);
  assert.equal(c["followers"], undefined);
  assert.ok(c["wishlist-readiness"]);
  assert.notEqual(c["wishlist-readiness"].status, "fail");
  assert.match(c["wishlist-readiness"].detail, /9,000-10,800 wishlists/);
  assert.equal(c["page-live"].status, "pass");
  assert.equal(c["timing-demo"].status, "warn");
  assert.match(c["timing-next-fest"].detail, /February 2027 starts 2027-02-22.*submit your demo for review by 2027-02-01/);
  assert.equal(c["price-vs-comps"].weight, 0, "no price yet is advice, not a penalty");
  assert.ok(d.checks.every((x) => x.status !== "fail" || !["social-proof"].includes(x.area)));
});

test("manual unreleased game with only tags and a description", () => {
  const manual = {
    name: "Garden of Cards",
    shortDescription: "A roguelike deckbuilder where you grow a garden of living cards and battle the blight one season at a time.",
    tags: ["Roguelike Deckbuilder", "Deckbuilding", "Card Battler", "Cozy"],
  };
  const comps = findComparables(manual, corpus);
  assert.ok(comps.length > 0 && comps[0].sharedTags.includes("Roguelike Deckbuilder"));
  const d = diagnose(manual, comps, { now: "2026-11-27T00:00:00Z" });
  const c = byId(d);
  assert.equal(d.manual, true);
  assert.equal(d.prelaunch, true);
  assert.ok(d.score >= 0 && d.score <= 100);
  assert.ok(["A", "B", "C", "D", "F"].includes(d.grade));
  assert.equal(c["capsule-assets"].manual, true, "no images known: manual, not a fail");
  assert.equal(c["wishlist-readiness"].manual, true);
  assert.equal(c["page-live"].status, "warn");
  assert.match(c["page-live"].detail, /No Steam page yet/);
  assert.equal(c["desc-genre"].status, "pass");
  assert.equal(c["tags-count"].status, "fail", "4 tags is below Steam's minimum of 5");
  assert.equal(c["media-screenshots"].status, "fail");
  assert.equal(d.areas.capsule.score, null);
  assert.ok(!d.checks.some((x) => /review/i.test(x.id)));
  // manual screenshot count and trailer flag are understood
  const d2 = diagnose({ ...manual, screenshots: 9, hasTrailer: true, languages: "English, Simplified Chinese" }, comps);
  assert.equal(byId(d2)["media-trailer"].status, "pass");
  assert.match(byId(d2)["media-screenshots"].detail, /you have 9/);
});

test("manual game with a close release date and no page fails page-live", () => {
  const d = diagnose({ name: "Late", tags: DECK_TAGS, releaseDate: "2026-12-20" }, findComparables({ tags: DECK_TAGS }, corpus), { now: "2026-11-27" });
  assert.equal(byId(d)["page-live"].status, "fail");
});

test("early access wording is checked", () => {
  const ea = make({ name: "EA", earlyAccess: true, tags: tagList(DECK_TAGS), aboutText: "We are in Early Access to build the game with community feedback. We plan to leave Early Access in about 12 months. Currently includes 3 acts. The price will rise at 1.0." });
  assert.equal(byId(diagnose(ea, findComparables(ea, corpus)))["early-access-wording"].status, "pass");
  const ea2 = make({ name: "EA2", earlyAccess: true, tags: tagList(DECK_TAGS), aboutText: "Fun cards." });
  assert.equal(byId(diagnose(ea2, findComparables(ea2, corpus)))["early-access-wording"].status, "fail");
  assert.equal(byId(diagnose(strong, []))["early-access-wording"], undefined);
});

test("edge cases don't throw", () => {
  const weird = [
    null, undefined, {}, { name: "x" }, { tags: null, reviews: null, languages: null, screenshots: null },
    { tags: "Roguelike, Indie", languages: "English<strong>*</strong>, French", screenshots: 4 },
    { tags: [null, 3, { name: "" }, { name: "Puzzle" }], reviews: { total: null }, followers: "many", priceUSD: "free" },
    { comingSoon: true, releaseDate: "To be announced", hasDemo: null },
    make({ shortDescription: "<b>HTML</b> &amp; stuff", aboutText: null, genres: null }),
  ];
  for (const g of weird) {
    for (const cs of [null, undefined, [], findComparables(g, corpus), findComparables(g, null), [null, {}, { game: null }]]) {
      const d = diagnose(g, cs);
      assert.ok(d.score >= 0 && d.score <= 100);
      assert.equal(typeof d.rewritePrompt, "string");
      const r = rewriteRequest(g, d);
      assert.equal(typeof r.system, "string");
      assert.equal(typeof r.user, "string");
    }
  }
  assert.deepEqual(findComparables(null, corpus), []);
  assert.deepEqual(findComparables({ tags: [] }, corpus), []);
  assert.deepEqual(findComparables(weak, { games: [] }), []);
  assert.doesNotThrow(() => rewriteRequest(null, null));
  assert.doesNotThrow(() => audit({ name: "a" }, null));
});

test("diagnose is deterministic", () => {
  const a = diagnose(weak, findComparables(weak, corpus), { now: "2026-11-27" });
  const b = diagnose(weak, findComparables(weak, corpus), { now: "2026-11-27" });
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------------------------
// Rewrite prompt and request
// ---------------------------------------------------------------------------------------------
test("rewritePrompt contains current copy, comparables' descriptions and the rules", () => {
  const d = diagnose(weak, findComparables(weak, corpus));
  const p = d.rewritePrompt;
  assert.ok(p.includes(weak.shortDescription));
  assert.ok(p.includes(deckDesc("of spires")) || p.includes("Deck Indie"), "comparable short descriptions included");
  assert.ok(p.includes(`at most ${SHORT_DESC_MAX} characters`));
  assert.ok(p.includes("<rules>") && p.includes("<current_copy>") && p.includes("<comparable_games") && p.includes("<output_format>"));
  assert.ok(p.includes("Never invent features"));
  assert.ok(p.includes("[fail] First sentence states the genre"));
  assert.ok(p.includes("Candidate tags for the top 5"));
});

test("rewriteRequest returns system and user for the Messages API", () => {
  const d = diagnose(strong, findComparables(strong, corpus));
  const r = rewriteRequest(strong, d);
  assert.equal(r.model, DEFAULT_MODEL);
  assert.equal(r.model, "claude-sonnet-5-5");
  assert.ok(r.max_tokens >= 2000);
  assert.ok(r.system.includes("<rules>") && r.system.includes("<output_format>"));
  assert.ok(r.user.includes(strong.shortDescription));
  assert.ok(r.user.includes("<comparable_games"));
  assert.ok(!r.user.includes("<rules>"), "rules live in the system prompt");
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
test("parsers and helpers", () => {
  assert.equal(Math.round(parseOwners("1,000,000 .. 4,000,000")), 2000000);
  assert.equal(parseOwners("50k-200k"), 100000);
  assert.equal(parseOwners(null), null);
  assert.equal(parseReleaseDate("Mar 4, 2025").toISOString().slice(0, 10), "2025-03-04");
  assert.equal(parseReleaseDate("4 Mar, 2025").toISOString().slice(0, 10), "2025-03-04");
  assert.equal(parseReleaseDate("2027-05-01").toISOString().slice(0, 10), "2027-05-01");
  assert.equal(parseReleaseDate("Q2 2027").getUTCMonth(), 4);
  assert.equal(parseReleaseDate("Coming soon"), null);
  assert.deepEqual(toTags(["A", "a", { name: "B", votes: 3 }]).map((t) => t.name), ["A", "B"]);
  assert.equal(tagKind("Indie"), "fluff");
  assert.equal(tagKind("Roguelike Deckbuilder"), "sub");
  assert.equal(tagKind("Strategy"), "broad");
  assert.equal(normalizeGame({ name: "m", tags: ["X"] }).comingSoon, true);
  assert.equal(normalizeGame({ appid: 5, url: "https://store.steampowered.com/app/5/" }).manual, false);
});

// ---------------------------------------------------------------------------------------------
// Committed snapshot (written by the data pipeline). Skipped if not present.
// ---------------------------------------------------------------------------------------------
const corpusPath = fileURLToPath(new URL("../data/corpus.json", import.meta.url));
test("works on every game in the committed corpus snapshot", { skip: !existsSync(corpusPath) }, () => {
  const snap = JSON.parse(readFileSync(corpusPath, "utf8"));
  assert.ok(Array.isArray(snap.games) && snap.games.length > 0);
  const now = snap.generatedAt;
  let withComps = 0;
  for (const g of snap.games) {
    const { comparables, diagnosis } = audit(g, snap, { now });
    assert.ok(comparables.every((c) => c.game.appid !== g.appid), `${g.name} excludes itself`);
    if (comparables.length) {
      withComps++;
      const top = comparables[0];
      assert.ok(top.sharedTags.length > 0, `${g.name}: top comparable shares tags`);
    }
    assert.ok(diagnosis.score >= 0 && diagnosis.score <= 100);
    assert.ok(diagnosis.checks.length >= 10, `${g.name}: ${diagnosis.checks.length} checks`);
    if (g.comingSoon) assert.ok(!diagnosis.checks.some((c) => c.id.startsWith("reviews-")), `${g.name}: no review checks pre-launch`);
    for (const c of diagnosis.checks) assert.ok(c.detail && c.fix, `${g.name} ${c.id}`);
  }
  assert.ok(withComps >= snap.games.length * 0.9, "almost every game finds comparables");
  // A game's best comparables share its top tag most of the time.
  let topTagHits = 0;
  for (const g of snap.games) {
    const top = toTags(g.tags)[0]?.name;
    const comps = findComparables(g, snap, { limit: 5 });
    if (top && comps.length && comps.filter((c) => c.sharedTags.includes(top)).length >= 3) topTagHits++;
  }
  assert.ok(topTagHits >= snap.games.length * 0.7, `top tag shared for ${topTagHits}/${snap.games.length}`);
});
