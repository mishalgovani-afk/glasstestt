import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { ARCHETYPES, GLOSSARY, LESSONS, DISCLOSURE_PATTERNS } from "../playbook.js";

// Mirrors ARCHETYPE_IDS in the shared contract (analysis.js).
const CONTRACT_IDS = [
  "sponsored-creator-wave", "launch-blitz", "trailer-reveal", "streamer-sponsorship",
  "update-drop", "event-or-esports", "organic-viral", "controversy", "background-chatter",
];

const isHttps = (u) => {
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};
const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

test("every contract archetype id has a complete entry", () => {
  for (const id of CONTRACT_IDS) {
    const a = ARCHETYPES[id];
    assert.ok(a, `missing archetype ${id}`);
    for (const f of ["name", "oneLiner", "whatItIs", "whyStudiosDoIt", "typicalCost"]) {
      assert.ok(nonEmpty(a[f]), `${id}.${f} empty`);
    }
    assert.ok(Array.isArray(a.howToSpot) && a.howToSpot.length >= 3, `${id}.howToSpot too short`);
    a.howToSpot.forEach((h) => assert.ok(nonEmpty(h)));
    assert.ok(Array.isArray(a.examples) && a.examples.length >= 1, `${id} needs an example`);
    for (const ex of a.examples) {
      assert.ok(nonEmpty(ex.game) && nonEmpty(ex.note), `${id} example missing text`);
      assert.equal(typeof ex.year, "number");
      assert.ok(isHttps(ex.sourceUrl), `${id} example url not https: ${ex.sourceUrl}`);
    }
  }
  assert.deepEqual(Object.keys(ARCHETYPES).sort(), [...CONTRACT_IDS].sort(), "no extra or missing ids");
});

test("archetype ids match analysis.js when it exists", async () => {
  const p = new URL("../analysis.js", import.meta.url);
  if (!existsSync(p)) return;
  const { ARCHETYPE_IDS } = await import(p.href);
  if (!ARCHETYPE_IDS) return;
  for (const id of ARCHETYPE_IDS) assert.ok(ARCHETYPES[id], `playbook missing ${id} from analysis.js`);
});

test("howToSpot covers the engine's signals across archetypes", () => {
  const text = Object.values(ARCHETYPES).flatMap((a) => a.howToSpot).join(" ").toLowerCase();
  for (const s of ["disclosure", "synchronicity", "title similarity", "creator diversity", "new-creator share", "platform spread", "engagement skew"]) {
    assert.ok(text.includes(s), `signal not described: ${s}`);
  }
});

test("glossary and lessons are well formed with https sources", () => {
  assert.ok(GLOSSARY.length >= 20);
  const terms = new Set();
  for (const g of GLOSSARY) {
    assert.ok(nonEmpty(g.term) && nonEmpty(g.definition));
    assert.ok(!terms.has(g.term), `duplicate term ${g.term}`);
    terms.add(g.term);
  }
  for (const t of ["CPM", "CPV", "Flat-fee sponsorship", "UA (user acquisition)", "Wishlist"]) assert.ok(terms.has(t), t);

  assert.ok(LESSONS.length >= 6 && LESSONS.length <= 9);
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(nonEmpty(l.id) && nonEmpty(l.title));
    assert.ok(!ids.has(l.id));
    ids.add(l.id);
    assert.ok(Array.isArray(l.body) && l.body.length >= 2);
    l.body.forEach((p) => assert.ok(nonEmpty(p)));
    assert.ok(l.sources.length >= 1, `${l.id} has no sources`);
    for (const s of l.sources) {
      assert.ok(nonEmpty(s.title));
      assert.ok(isHttps(s.url), `${l.id} source not https: ${s.url}`);
    }
  }
});

test("content is plain text (no HTML)", () => {
  const all = JSON.stringify({ ARCHETYPES, GLOSSARY, LESSONS });
  assert.ok(!/<[a-z/][^>]*>/i.test(all), "HTML tag found in content");
});

const regexes = DISCLOSURE_PATTERNS.map((p) => {
  assert.ok(nonEmpty(p.pattern) && nonEmpty(p.label));
  assert.ok(p.flags.includes("i"));
  return new RegExp(p.pattern, p.flags);
});
const disclosed = (s) => regexes.some((r) => r.test(s));

test("disclosure patterns compile", () => {
  assert.ok(regexes.length >= 10);
  regexes.forEach((r) => assert.ok(r instanceof RegExp));
});

test("disclosure patterns catch real disclosure phrasing", () => {
  const positives = [
    "#ad",
    "Great run today #ad #gaming",
    "New video up! #AD",
    "Loving this game #sponsored",
    "#Spon thanks Acme",
    "Check it out #AcmePartner",
    "#paidpartnership with Acme",
    "[AD] I tried Starfall for the first time",
    "(Sponsored) Starfall first look",
    "Ad: Starfall is out now",
    "Starfall first look with Acme | AD | !wishlist",
    "This video is sponsored by Acme Games.",
    "Sponsored by Acme.",
    "Today's stream is sponsored",
    "Thanks to Acme Games for sponsoring this video!",
    "Huge thanks to the team at Acme for sponsoring today's stream",
    "This video contains a paid partnership with Acme.",
    "Includes paid promotion",
    "Paid promotion. Wishlist Starfall on Steam",
    "Made in partnership with Acme Games",
    "This episode is brought to you by Acme",
    "Use code STAR10 for 10% off",
    "use my code NINJA at checkout for a free skin",
    "Support my creator code in the item shop",
    "Support-A-Creator code: BUZZ",
    "Links below are affiliate links",
    "I'm a brand ambassador for Acme",
    "Key provided by the publisher.",
    "Game was provided by Acme for review",
    "Played on a review copy",
    "Thanks to Acme for the early access and for sponsoring today's stream.",
    "Thanks to Acme for the key!",
    "#gifted",
  ];
  for (const s of positives) assert.ok(disclosed(s), `should match: ${s}`);
});

test("disclosure patterns avoid common false positives", () => {
  const negatives = [
    "add this to your wishlist",
    "Just added Starfall to my library",
    "#adventure #indiegame",
    "#AdventureTime vibes",
    "#adhd gamer here",
    "my dad loves this game",
    "Ad astra per aspera",
    "Adding mods to Starfall",
    "head-to-head ranked matches",
    "#speedrun #sp00ky",
    "#SP meetup tonight",
    "I just became a Twitch affiliate!",
    "Finally hit #TwitchPartner",
    "Looking for co-op partners in Starfall",
    "#lookingforpartners",
    "I paid for this game with my own money",
    "This video is not sponsored",
    "Not sponsored by anyone, I just love it",
    "No paid promotion here",
    "Use the source code from GitHub",
    "using code blocks for formatting",
    "I review code at work all day",
    "The code was provided by the author on GitHub",
    "The ad was annoying",
    "Watching ads to unlock rewards sucks",
    "Bad: the controls are clunky",
    "Thanks to everyone for watching",
    "The sponsor of the tournament",
    "Starfall patch 1.2 notes",
  ];
  for (const s of negatives) assert.ok(!disclosed(s), `should not match: ${s}`);
});
