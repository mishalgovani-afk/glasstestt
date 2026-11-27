#!/usr/bin/env node
// Generates data/corpus.json as clearly marked SAMPLE data (source:"sample"): ~150 fictional indie games over 12 tags,
// mixing hits, mid-size indies and upcoming "Coming soon" games. Seeded, so the output is reproducible.
//   node scripts/make-sample.mjs [--out data/corpus.json] [--now 2026-11-27]
// Image URLs point at Steam's CDN pattern but the appids are fictional (9,1xx,xxx), so images 404 in sample mode.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs, writeJsonAtomic } from "./lib.mjs";
import { reviewDesc } from "./parsers.mjs";
import { validateCorpus, validateCatalog } from "./validate.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THEMES = {
  Roguelike: { a: ["Ember", "Hollow", "Gilded", "Ashen", "Fractured", "Lantern", "Thorn", "Wicked"], b: ["Descent", "Crypt", "Spire", "Labyrinth", "Delve", "Catacomb"], verb: "fight through procedurally generated floors", hook: "every run is different and every death teaches you something", related: ["Action Roguelike", "Dungeon Crawler", "Procedural Generation", "Difficult", "Replay Value"] },
  Deckbuilding: { a: ["Quill", "Mossy", "Tidal", "Rune", "Candle", "Brass", "Velvet", "Sable"], b: ["Gambit", "Hands", "Tactician", "Arcanum", "Pact", "Tarot"], verb: "build a deck of synergistic cards", hook: "every card you add changes the shape of your strategy", related: ["Card Battler", "Roguelike", "Turn-Based Tactics", "Strategy", "Fantasy"] },
  Metroidvania: { a: ["Hollowed", "Lumen", "Rustbound", "Verdant", "Sunken", "Echo", "Pale", "Starved"], b: ["Reliquary", "Depths", "Citadel", "Ruins", "Bell", "Vault"], verb: "explore an interconnected world", hook: "new abilities open doors you passed hours ago", related: ["2D Platformer", "Exploration", "Atmospheric", "Hand-drawn", "Action-Adventure"] },
  Cozy: { a: ["Little", "Honey", "Sunday", "Willow", "Pocket", "Dewdrop", "Marmalade", "Tea"], b: ["Hollow", "Cottage", "Meadow", "Corner", "Harbor", "Orchard"], verb: "tend a gentle corner of the world at your own pace", hook: "there are no timers, no fail states and plenty of tea", related: ["Relaxing", "Wholesome", "Cute", "Casual", "Life Sim"] },
  "Farming Sim": { a: ["Turnip", "Barley", "Harvest", "Clover", "Plum", "Fennel", "Marrow", "Haystack"], b: ["Valley", "Acres", "Ridge", "Furrow", "Homestead", "Row"], verb: "plant, harvest and decorate your farm", hook: "the seasons turn and the village slowly becomes your home", related: ["Life Sim", "Cozy", "Crafting", "Relaxing", "Pixel Graphics"] },
  Survival: { a: ["Gloam", "Frostbitten", "Stranded", "Salt", "Hunger", "Driftwood", "Bleak", "Cinder"], b: ["Shore", "Expanse", "Outpost", "Wilds", "Reach", "Hollow"], verb: "gather, craft and endure", hook: "the night is long and your supplies are short", related: ["Crafting", "Open World Survival Craft", "Base Building", "Co-op", "Sandbox"] },
  Horror: { a: ["Pale", "Hush", "Marrow", "Static", "Wretched", "Lull", "Gaunt", "Murmur"], b: ["Hallway", "Parish", "Motel", "Lullaby", "Basement", "Signal"], verb: "survive something you cannot see", hook: "the quiet is worse than the noise", related: ["Psychological Horror", "Atmospheric", "First-Person", "Mystery", "Gore"] },
  "Souls-like": { a: ["Ashbound", "Gravetide", "Ironwake", "Cinderfall", "Dusk", "Hollowed", "Blightmoor", "Pyre"], b: ["Pilgrim", "Knight", "Oath", "Bastion", "Penance", "Warden"], verb: "learn every enemy's pattern", hook: "victory is earned one careful dodge at a time", related: ["Difficult", "Action RPG", "Dark Fantasy", "Third Person", "Boss Rush"] },
  Puzzle: { a: ["Folded", "Prism", "Clockwork", "Lattice", "Origami", "Tessel", "Quiet", "Nimble"], b: ["Rooms", "Garden", "Engine", "Cipher", "Tiles", "Orbit"], verb: "solve handcrafted puzzles", hook: "each solution feels like an idea you had yourself", related: ["Logic", "Relaxing", "Casual", "Minimalist", "Singleplayer"] },
  "Visual Novel": { a: ["Midnight", "Paper", "Lilac", "Autumn", "Glass", "Soft", "Wistful", "Salt"], b: ["Letters", "Cafe", "Season", "Promise", "Academy", "Train"], verb: "shape a story through your choices", hook: "who you trust changes how the story ends", related: ["Story Rich", "Anime", "Choices Matter", "Romance", "2D"] },
  "City Builder": { a: ["Terrace", "Mortar", "Canal", "Granite", "Lantern", "Aqueduct", "Tilework", "Highland"], b: ["Metropolis", "Quarter", "Kingdom", "Foundry", "Commonwealth", "Town"], verb: "plan districts and keep a growing city alive", hook: "every road you lay creates a new problem to solve", related: ["Management", "Resource Management", "Simulation", "Strategy", "Colony Sim"] },
  Platformer: { a: ["Sprocket", "Leaf", "Pogo", "Marble", "Skylark", "Jelly", "Zip", "Moth"], b: ["Jump", "Run", "Hop", "Quest", "Dash", "Trail"], verb: "run, jump and wall-slide", hook: "tight controls make every leap feel fair", related: ["2D Platformer", "Pixel Graphics", "Precision Platformer", "Retro", "Colorful"] },
};
const TAGS = Object.keys(THEMES);
const GENERIC = ["Indie", "Singleplayer", "Great Soundtrack", "Atmospheric", "Pixel Graphics", "2D", "Story Rich", "Cute", "Difficult", "Exploration", "Relaxing", "Funny", "Replay Value", "Colorful", "Controller"];
const STUDIO_A = ["Moth", "Pebble", "Lantern", "Quiet", "Tin", "Marrow", "Orchard", "Fable", "Static", "Kettle", "Plum", "Gravel", "Nimbus", "Fern", "Cobalt", "Wren"];
const STUDIO_B = ["Games", "Studio", "Works", "Interactive", "Collective", "Workshop", "Labs", "Press"];
const PUBLISHERS = ["Lanternlight Publishing", "Northfield Indie Co.", "Cobble & Crown", "Parcel Games", "Evergreen Interactive"];
const LANGS = ["English", "French", "German", "Spanish - Spain", "Simplified Chinese", "Japanese", "Russian", "Portuguese - Brazil", "Korean", "Italian", "Polish", "Turkish", "Traditional Chinese", "Ukrainian", "Dutch", "Czech", "Swedish", "Thai"];

export function makeSample(now = new Date("2026-11-27T00:00:00Z")) {
  const R = rng(20261127);
  const ri = (lo, hi) => Math.floor(lo + R() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const shuffle = (arr) => arr.map((x) => [R(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const usedNames = new Set();
  const games = [];
  let next = 9100000;

  const perTag = { hit: 4, mid: 4, upcoming: 4 };
  for (const tag of TAGS) {
    const th = THEMES[tag];
    const buckets = [];
    for (const [bucket, n] of Object.entries(perTag)) for (let i = 0; i < n + (bucket === "mid" && TAGS.indexOf(tag) % 2 === 0 ? 1 : 0); i++) buckets.push(bucket);
    for (const bucket of buckets) {
      let name;
      for (let tries = 0; tries < 50; tries++) {
        name = `${pick(th.a)} ${pick(th.b)}`;
        if (R() < 0.25) name = `${name} ${pick(["of Ash", "Remains", "Unbound", "Tonight", "II", "Reborn", "Chronicle"])}`;
        if (!usedNames.has(name)) break;
        name += " " + ri(2, 9);
      }
      usedNames.add(name);
      const appid = next; next += ri(3, 40);
      const polish = bucket === "hit" ? 0.7 + R() * 0.3 : bucket === "mid" ? 0.25 + R() * 0.65 : 0.15 + R() * 0.75; // page quality 0..1
      const upcoming = bucket === "upcoming";
      let total = null, pct = null, owners = null, ccu = null, followers = null, price;
      const ownersBand = (lo, hi) => { const a = Math.round(ri(lo, hi) / 1000) * 1000; return `${a.toLocaleString("en-US")} .. ${(a * 2).toLocaleString("en-US")}`; };
      if (bucket === "hit") { total = ri(5200, 62000); pct = ri(84, 97); owners = ownersBand(200000, 1500000); ccu = ri(250, 7000); followers = ri(25000, 320000); price = pick([9.99, 12.99, 14.99, 19.99, 24.99]); }
      else if (bucket === "mid") { total = ri(210, 4800); pct = ri(68, 94); owners = ownersBand(20000, 190000); ccu = ri(4, 320); followers = ri(1500, 28000); price = pick([4.99, 7.99, 9.99, 12.99, 14.99, 17.99]); }
      else { followers = R() < 0.9 ? Math.round(Math.pow(R(), 2.2) * 42000 + 250) : null; price = R() < 0.8 ? pick([4.99, 9.99, 12.99, 14.99, 19.99]) : null; }
      let releaseDate, comingSoon = false;
      if (upcoming) {
        comingSoon = true;
        const r = R();
        if (r < 0.55) releaseDate = iso(addDays(now, ri(20, 420)));
        else releaseDate = pick(["Q1 2027", "Q2 2027", "Q3 2027", "2027", "Coming soon"]);
      } else releaseDate = iso(addDays(now, -ri(14, 1060)));
      const hasDemo = upcoming ? R() < 0.4 : R() < (bucket === "hit" ? 0.35 : 0.45);
      const shotN = Math.max(upcoming ? 2 : 4, Math.round((upcoming ? 3 : 5) + polish * (bucket === "hit" ? 18 : 12) + (R() * 3 - 1)));
      const movieN = polish > 0.55 ? ri(1, 4) : R() < 0.4 ? 1 : 0;
      const langN = Math.max(1, Math.round(1 + polish * (bucket === "hit" ? 16 : upcoming ? 6 : 10)));
      const languages = LANGS.slice(0, langN);
      const fullAudio = polish > 0.75 && bucket === "hit" ? LANGS.slice(0, ri(1, 3)) : polish > 0.5 && R() < 0.3 ? ["English"] : [];
      const dev = `${pick(STUDIO_A)}${pick(STUDIO_A).toLowerCase()} ${pick(STUDIO_B)}`;
      const selfPub = R() < 0.55;
      const secondary = shuffle(th.related).slice(0, ri(3, 5));
      const generic = shuffle(GENERIC).slice(0, ri(4, 6));
      const topVotes = bucket === "hit" ? ri(2400, 9000) : bucket === "mid" ? ri(300, 1800) : ri(15, 300);
      const names = [tag, ...secondary, ...generic];
      const tags = names.map((n, i) => ({ name: n, votes: Math.max(1, Math.round(topVotes * Math.pow(0.82, i) * (0.85 + R() * 0.3))) })).sort((a, b) => b.votes - a.votes);
      if (polish < 0.3 && R() < 0.6) tags.splice(0, 1); // a few pages that forgot to get their main tag voted in
      const long = polish > 0.55;
      const shortDescription = long
        ? `${name} is a ${tag.toLowerCase()} game where you ${th.verb}. ${cap(th.hook)}.`
        : `A game about ${tag.toLowerCase()}.`;
      const about = [
        long ? `${name.toUpperCase()}\n\nYou ${th.verb}. ${cap(th.hook)}. Built by a small team, ${name} blends ${secondary[0].toLowerCase()} with ${generic[0].toLowerCase()} touches.` : `${name} is a game. You ${th.verb}.`,
        polish > 0.4 ? `Key features\n- ${cap(th.verb)} across ${ri(3, 9)} handcrafted areas\n- ${ri(20, 80)}+ unique items, enemies and discoveries\n- A warm, hand-tuned soundtrack by an independent composer\n${polish > 0.7 ? `- Supports ${langN} languages and full controller play\n` : ""}` : "",
        polish > 0.6 ? `The story so far\nNobody expects much from the sleepy town of ${pick(["Marrowgate", "Pennywell", "Lowmere", "Ashby Fen"])}, but then something changes. ${cap(th.hook)}. Along the way you will meet characters who remember what you did.` : "",
        upcoming ? "Wishlist now and try the demo when it arrives." : polish > 0.5 ? "Thank you for playing. Join the community Discord to share feedback and fan art." : "",
      ].filter(Boolean).join("\n\n");
      games.push({
        appid, name, url: `https://store.steampowered.com/app/${appid}/`, shortDescription, aboutText: about,
        tags, genres: ["Indie", ...shuffle(["Action", "Adventure", "RPG", "Simulation", "Strategy", "Casual"]).slice(0, ri(1, 2))],
        priceUSD: price, isFree: false, releaseDate, comingSoon,
        developers: [dev], publishers: [selfPub ? dev : pick(PUBLISHERS)],
        headerImage: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
        capsuleImage: polish > 0.2 ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_616x353.jpg` : null,
        screenshots: Array.from({ length: shotN }, (_, i) => `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/ss_sample${String(i + 1).padStart(2, "0")}.1920x1080.jpg`),
        movies: movieN, languages, fullAudioLanguages: fullAudio,
        reviews: { total, positivePct: pct, scoreDesc: total == null ? null : reviewDesc(total, pct) },
        followers, ownersRange: owners, ccu, hasDemo, earlyAccess: !upcoming && R() < 0.12,
        _bucket: bucket, _primary: tag,
      });
    }
  }
  const tagIndex = {};
  for (const t of TAGS) tagIndex[t] = [];
  for (const g of games) {
    for (const t of TAGS) if (g._primary === t || g.tags.slice(0, 5).some((x) => x.name === t)) tagIndex[t].push(g.appid);
  }
  for (const g of games) { delete g._bucket; delete g._primary; }
  return {
    generatedAt: now.toISOString(),
    source: "sample",
    note: "SAMPLE DATA: fictional games, generated by scripts/make-sample.mjs. Replaced by live Steam data when the build can reach Steam.",
    games,
    tagIndex,
  };
}
/** A sample catalog: every corpus game plus ~450 more fictional titles (so search can show "added on the next refresh"). */
export function makeSampleCatalog(corpus) {
  const R = rng(777);
  const A = ["Brindle", "Cask", "Dapple", "Eddy", "Flint", "Gable", "Hazel", "Isle", "Jinx", "Kiln", "Loom", "Mire", "Nettle", "Oak", "Pip", "Quartz", "Rook", "Sedge", "Tarn", "Umber", "Vale", "Wick", "Yarrow", "Zephyr"];
  const B = ["Runners", "Keep", "Tides", "Parade", "Garden", "Signal", "Forge", "Harvest", "Drifters", "Atlas", "Orchard", "Station", "Crossing", "Raiders", "Oath", "Rally"];
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const taken = new Set(corpus.games.map((g) => g.name));
  const out = corpus.games.map((g) => (g.comingSoon ? [g.appid, g.name, "u"] : [g.appid, g.name]));
  let id = 9300000;
  while (out.length < corpus.games.length + 450) {
    const name = `${pick(A)} ${pick(B)}${R() < 0.2 ? " " + pick(["Deluxe", "Origins", "Redux", "Zero"]) : ""}`;
    if (taken.has(name)) continue;
    taken.add(name);
    id += 1 + Math.floor(R() * 30);
    out.push(R() < 0.12 ? [id, name, "u"] : [id, name]);
  }
  return { generatedAt: corpus.generatedAt, source: "sample", games: out };
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const out = a.out || resolve(here, "../data/corpus.json");
  const c = makeSample(a.now ? new Date(a.now + "T00:00:00Z") : undefined);
  const errs = validateCorpus(c);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  writeJsonAtomic(out, c);
  console.log(`wrote ${out}: ${c.games.length} games, ${Object.keys(c.tagIndex).length} tags`);
  const cat = makeSampleCatalog(c);
  const cerrs = validateCatalog(cat);
  if (cerrs.length) { console.error(cerrs.join("\n")); process.exit(1); }
  const catOut = resolve(dirname(out), "catalog.json");
  writeJsonAtomic(catOut, cat);
  console.log(`wrote ${catOut}: ${cat.games.length} entries`);
}
