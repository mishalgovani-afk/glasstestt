#!/usr/bin/env node
// Generates data/creators.json as clearly marked SAMPLE data (source:"sample"): ~120 fictional creators of all sizes
// (YouTubers, Steam curators, Twitch streamers) covering ~90 fictional games. Seeded and reproducible.
//   node scripts/make-sample.mjs [--out data/creators.json] [--now 2026-11-27]
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs, writeJsonAtomic } from "./lib.mjs";
import { buildTagAffinity } from "./parsers.mjs";
import { validateCreators } from "./validate.mjs";

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
  Roguelike: { a: ["Ember", "Hollow", "Gilded", "Ashen", "Fractured", "Lantern", "Thorn"], b: ["Descent", "Crypt", "Spire", "Delve", "Catacomb"], rel: ["Action Roguelike", "Dungeon Crawler", "Procedural Generation", "Difficult"] },
  Deckbuilding: { a: ["Quill", "Mossy", "Tidal", "Rune", "Candle", "Brass"], b: ["Gambit", "Hands", "Arcanum", "Pact", "Tarot"], rel: ["Card Battler", "Roguelike", "Turn-Based Tactics", "Strategy"] },
  Metroidvania: { a: ["Hollowed", "Lumen", "Rustbound", "Verdant", "Sunken", "Echo"], b: ["Reliquary", "Depths", "Citadel", "Ruins", "Vault"], rel: ["2D Platformer", "Exploration", "Atmospheric", "Hand-drawn"] },
  Cozy: { a: ["Little", "Honey", "Sunday", "Willow", "Pocket", "Dewdrop"], b: ["Hollow", "Cottage", "Meadow", "Corner", "Orchard"], rel: ["Relaxing", "Wholesome", "Cute", "Life Sim"] },
  "Farming Sim": { a: ["Turnip", "Barley", "Harvest", "Clover", "Plum", "Fennel"], b: ["Valley", "Acres", "Ridge", "Furrow", "Homestead"], rel: ["Life Sim", "Cozy", "Crafting", "Pixel Graphics"] },
  Survival: { a: ["Gloam", "Frostbitten", "Stranded", "Salt", "Driftwood", "Bleak"], b: ["Shore", "Expanse", "Outpost", "Wilds", "Reach"], rel: ["Crafting", "Open World Survival Craft", "Base Building", "Co-op"] },
  Horror: { a: ["Pale", "Hush", "Marrow", "Static", "Wretched", "Lull"], b: ["Hallway", "Parish", "Motel", "Lullaby", "Basement"], rel: ["Psychological Horror", "Atmospheric", "First-Person", "Mystery"] },
  "Souls-like": { a: ["Ashbound", "Gravetide", "Ironwake", "Cinderfall", "Dusk", "Pyre"], b: ["Pilgrim", "Knight", "Oath", "Bastion", "Warden"], rel: ["Difficult", "Action RPG", "Dark Fantasy", "Boss Rush"] },
  Puzzle: { a: ["Folded", "Prism", "Clockwork", "Lattice", "Origami", "Tessel"], b: ["Rooms", "Garden", "Engine", "Cipher", "Orbit"], rel: ["Logic", "Relaxing", "Casual", "Minimalist"] },
  "Visual Novel": { a: ["Midnight", "Paper", "Lilac", "Autumn", "Glass", "Wistful"], b: ["Letters", "Cafe", "Season", "Promise", "Academy"], rel: ["Story Rich", "Anime", "Choices Matter", "Romance"] },
  "City Builder": { a: ["Terrace", "Mortar", "Canal", "Granite", "Aqueduct", "Highland"], b: ["Metropolis", "Quarter", "Kingdom", "Foundry", "Town"], rel: ["Management", "Resource Management", "Simulation", "Colony Sim"] },
  Platformer: { a: ["Sprocket", "Leaf", "Pogo", "Marble", "Skylark", "Jelly"], b: ["Jump", "Run", "Hop", "Quest", "Dash"], rel: ["2D Platformer", "Pixel Graphics", "Precision Platformer", "Retro"] },
};
const TAGS = Object.keys(THEMES);
const GENERIC = ["Indie", "Singleplayer", "Great Soundtrack", "Atmospheric", "Pixel Graphics", "2D", "Story Rich", "Cute", "Difficult", "Exploration", "Relaxing", "Funny", "Replay Value", "Colorful"];
const CH_A = ["Pixel", "Lantern", "Moss", "Quiet", "Tiny", "Cobalt", "Wren", "Plum", "Static", "Kettle", "Hollow", "Marrow", "Nimbus", "Gravel", "Fable", "Copper", "Juniper", "Orbit", "Biscuit", "Velvet"];
const CH_B = ["Pilgrim", "Plays", "Gaming", "Corner", "Reviews", "Club", "Arcade", "Diary", "Dispatch", "Hour", "Index", "Crate", "Cast", "Digest", "Lab", "Society"];
const LANGS = [["en", 0.62], ["de", 0.07], ["fr", 0.06], ["es", 0.06], ["pt", 0.05], ["ja", 0.04], ["ru", 0.03], ["zh", 0.03], [null, 0.04]];
const YT_TITLES = ["{g} - first impressions", "I played {g} so you don't have to", "{g} is a hidden gem", "{g} demo: is it worth wishlisting?", "Finishing {g} (full playthrough)", "{g} review: 10 hours later", "Indie spotlight: {g}", "{g} - what nobody tells you", "Why I can't stop playing {g}"];
const TW_TITLES = ["Playing {g} for the first time", "{g} demo day with chat", "Chill {g} run | indie night", "{g} blind playthrough"];
const BLURBS = ["Charming and tight. Recommended for fans of the genre.", "A great demo that shows real promise.", "Rough edges, but the core loop is excellent.", "One of the best indie games this year.", "Atmospheric and stylish; short but sweet.", "Needs balance work, but I could not put it down.", "A cozy gem with a lot of heart."];

export function makeSample(now = new Date("2026-11-27T00:00:00Z")) {
  const R = rng(4242);
  const ri = (lo, hi) => Math.floor(lo + R() * (hi - lo + 1));
  const pick = (a) => a[Math.floor(R() * a.length)];
  const shuffle = (a) => a.map((x) => [R(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
  const lognorm = (lo, hi) => Math.round(Math.exp(Math.log(lo) + R() * (Math.log(hi) - Math.log(lo))));
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
  const iso = (d) => d.toISOString();
  const day = (d) => d.toISOString().slice(0, 10);

  // ---- ~90 fictional games
  const games = [];
  const used = new Set();
  let next = 9400000;
  for (const tag of TAGS) {
    const n = tag === "Roguelike" || tag === "Cozy" ? 9 : 7;
    for (let i = 0; i < n; i++) {
      const th = THEMES[tag];
      let name;
      do { name = `${pick(th.a)} ${pick(th.b)}`; } while (used.has(name));
      used.add(name);
      const r = R();
      const bucket = r < 0.34 ? "hit" : r < 0.72 ? "mid" : "upcoming";
      const appid = (next += ri(3, 40));
      const tags = [tag, ...shuffle(th.rel).slice(0, ri(2, 4)), ...shuffle(GENERIC).slice(0, ri(3, 5))];
      const g = { appid, name, tags };
      if (bucket === "upcoming") { g.reviews = { total: null }; g.comingSoon = true; g.releaseDate = R() < 0.5 ? day(addDays(now, ri(15, 380))) : pick(["Q1 2027", "Q2 2027", "2027", "Coming soon"]); }
      else { g.reviews = { total: bucket === "hit" ? ri(5200, 60000) : ri(60, 4800) }; g.comingSoon = false; g.releaseDate = day(addDays(now, -ri(20, 1000))); }
      games.push(g);
    }
  }
  const byTag = Object.fromEntries(TAGS.map((t) => [t, games.filter((g) => g.tags[0] === t)]));
  const gamesByAppid = new Map(games.map((g) => [g.appid, g]));

  // ---- ~120 creators of all sizes
  const platforms = [...Array(56).fill("youtube"), ...Array(48).fill("steam-curator"), ...Array(16).fill("twitch")];
  const usedNames = new Set();
  const creators = [];
  const referenced = new Set();
  const rid = (alpha, n) => Array.from({ length: n }, () => alpha[Math.floor(R() * alpha.length)]).join("");
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    let name;
    do { name = `${pick(CH_A)} ${pick(CH_B)}`; } while (usedNames.has(name));
    usedNames.add(name);
    const slug = name.toLowerCase().replace(/\s+/g, "");
    const big = R() < 0.1, small = R() < 0.45;
    const followers = platform === "steam-curator"
      ? (big ? lognorm(60000, 600000) : small ? lognorm(15, 800) : lognorm(800, 40000))
      : platform === "youtube"
        ? (big ? lognorm(400000, 3000000) : small ? lognorm(300, 8000) : lognorm(8000, 300000))
        : (big ? lognorm(100000, 600000) : small ? lognorm(80, 2000) : lognorm(2000, 80000));
    const focus = shuffle(TAGS).slice(0, ri(1, 3));
    const inactive = R() < 0.14;
    const coveredN = platform === "youtube" ? ri(5, 24) : platform === "steam-curator" ? ri(8, 40) : ri(4, 16);
    const pool = focus.flatMap((t) => byTag[t]);
    const picks = new Set();
    for (let k = 0; k < coveredN * 3 && picks.size < coveredN; k++) picks.add(R() < 0.82 ? pick(pool) : pick(games));
    const newestAgo = inactive ? ri(130, 420) : ri(0, 40);
    const spreadDays = platform === "steam-curator" ? 300 : 220;
    const covered = [...picks].map((g) => {
      const d = addDays(now, -(newestAgo + Math.floor(Math.pow(R(), 1.6) * spreadDays)));
      const base = { appid: g.appid, name: g.name, date: iso(d) };
      referenced.add(g.appid);
      if (platform === "youtube") return { ...base, url: `https://www.youtube.com/watch?v=SAMPLE${rid("abcdefghijklmnopqrstuvwxyz0123456789", 5)}`, title: pick(YT_TITLES).replace("{g}", g.name), views: Math.max(40, Math.round(followers * (0.01 + R() * 0.12))) };
      if (platform === "twitch") return { ...base, url: `https://www.twitch.tv/videos/9${rid("0123456789", 9)}`, title: pick(TW_TITLES).replace("{g}", g.name), views: R() < 0.7 ? Math.max(5, Math.round(followers * (0.005 + R() * 0.05))) : null };
      return { ...base, url: `https://store.steampowered.com/app/${g.appid}/`, title: pick(BLURBS), views: null };
    }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
    const id = platform === "youtube" ? `youtube:UC${rid("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-", 22)}` : platform === "twitch" ? `twitch:${slug}` : `curator:${ri(10000000, 49999999)}`;
    const url = platform === "youtube" ? `https://www.youtube.com/channel/${id.slice(8)}` : platform === "twitch" ? `https://www.twitch.tv/${slug}` : `https://store.steampowered.com/curator/${id.slice(8)}/`;
    const links = [{ label: platform === "youtube" ? "YouTube" : platform === "twitch" ? "Twitch" : "Steam Curator", url }];
    if (R() < 0.55) links.push({ label: "Website", url: `https://${slug}.example/` });
    if (R() < 0.5) links.push({ label: "Discord", url: `https://discord.gg/sample${rid("abcdefghij", 5)}` });
    if (R() < 0.45) links.push({ label: "X / Twitter", url: `https://x.com/${slug}` });
    if (platform === "steam-curator" && R() < 0.5) links.push({ label: "YouTube", url: `https://www.youtube.com/@${slug}` });
    let lang = null; { let x = R(); for (const [l, p] of LANGS) { if ((x -= p) <= 0) { lang = l; break; } if (l === LANGS.at(-1)[0]) lang = l; } }
    creators.push({
      id, platform, name, url, avatar: null, followers, language: lang,
      lastActive: covered.length ? covered[0].date : null,
      uploadsPerMonth: platform === "steam-curator" ? Math.round((0.5 + R() * 18) * 10) / 10 : platform === "youtube" ? Math.round((0.8 + R() * 14) * 10) / 10 : Math.round((2 + R() * 25) * 10) / 10,
      avgViews: platform === "steam-curator" ? null : Math.max(30, Math.round(followers * (platform === "twitch" ? 0.012 + R() * 0.03 : 0.02 + R() * 0.1))),
      coveredGames: covered,
      tagAffinity: buildTagAffinity(covered, gamesByAppid),
      fetchedAt: iso(now),
      links,
    });
  }
  creators.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
  return {
    generatedAt: iso(now),
    source: "sample",
    note: "SAMPLE DATA: fictional creators and games, generated by scripts/make-sample.mjs. Replaced by live Steam/YouTube data when the build can reach them.",
    creators,
    games: games.filter((g) => referenced.has(g.appid)),
  };
}

/** Sample catalog in the shared compact format (a appid, n name, u upcoming, t tags, p price, d date, r [reviews, positive %]). */
export function makeSampleCatalog(data) {
  const R = rng(777);
  const A = ["Brindle", "Cask", "Dapple", "Eddy", "Flint", "Gable", "Hazel", "Isle", "Jinx", "Kiln", "Loom", "Mire", "Nettle", "Oak", "Pip", "Quartz", "Rook", "Sedge", "Tarn", "Umber", "Vale", "Wick", "Yarrow", "Zephyr"];
  const B = ["Runners", "Keep", "Tides", "Parade", "Garden", "Signal", "Forge", "Harvest", "Drifters", "Atlas", "Orchard", "Station", "Crossing", "Raiders", "Oath", "Rally"];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const day = (n) => new Date(Date.parse("2026-11-27T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const taken = new Set(data.games.map((g) => g.name));
  const entries = new Map(data.games.map((g) => {
    const e = { a: g.appid, n: g.name };
    if (g.comingSoon) e.u = 1;
    if (g.tags?.length) e.t = g.tags.slice(0, 5);
    if (g.releaseDate) e.d = g.releaseDate;
    if (g.reviews?.total != null) e.r = [g.reviews.total, 70 + Math.floor(R() * 27)];
    return [g.appid, e];
  }));
  const tagPool = [...TAGS, "Indie", "Singleplayer", "Pixel Graphics", "Atmospheric", "Relaxing", "Story Rich"];
  let id = 9500000;
  while (entries.size < data.games.length + 1500) {
    const name = `${pick(A)} ${pick(B)}${R() < 0.2 ? " " + pick(["Deluxe", "Origins", "Redux", "Zero"]) : ""}${R() < 0.3 ? " " + Math.floor(2 + R() * 7) : ""}`;
    if (taken.has(name)) continue;
    taken.add(name);
    id += 1 + Math.floor(R() * 30);
    const e = { a: id, n: name, t: [...new Set([pick(TAGS), ...Array.from({ length: 2 + Math.floor(R() * 3) }, () => pick(tagPool))])] };
    if (R() < 0.2) { e.u = 1; e.d = R() < 0.5 ? day(10 + Math.floor(R() * 400)) : pick(["Q1 2027", "Q2 2027", "2027", "Coming soon"]); }
    else { e.d = day(-Math.floor(20 + R() * 1000)); e.p = pick([0, 2.99, 4.99, 9.99, 14.99, 19.99]); e.r = [Math.floor(Math.exp(2 + R() * 9)), Math.floor(55 + R() * 43)]; }
    entries.set(id, e);
  }
  return { generatedAt: data.generatedAt, source: "sample", format: 2, keys: { a: "appid", n: "name", u: "1 when the game is not released yet (omitted otherwise)", t: "up to 5 tag names, most voted first", p: "price in USD (omitted when unknown)", d: "release date: ISO yyyy-mm-dd or Steam's own text such as 'Q2 2027'", r: "[review total, positive %] (omitted when unknown)" }, games: [...entries.values()].sort((x, y) => x.a - y.a) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));
  const out = a.out || resolve(here, "../data/creators.json");
  const c = makeSample(a.now ? new Date(a.now + "T00:00:00Z") : undefined);
  const errs = validateCreators(c);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  writeJsonAtomic(out, c);
  console.log(`wrote ${out}: ${c.creators.length} creators, ${c.games.length} games`);
  const catOut = resolve(dirname(out), "catalog.json");
  writeJsonAtomic(catOut, makeSampleCatalog(c));
  console.log(`wrote ${catOut}`);
}
