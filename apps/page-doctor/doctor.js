// Page Doctor engine: audits a Steam store page against comparable successful games.
// Pure ES module. No DOM, no network, no clock: the same input always gives the same output.
// Works in the browser and in Node 22. See README.md ("Method") for the reasoning behind each rule.

// ---------------------------------------------------------------------------------------------
// Sources. Every rule cites at least one of these. All https.
// ---------------------------------------------------------------------------------------------
export const SOURCES = {
  steamAssets: { title: "Steamworks: Store graphical assets", url: "https://partner.steamgames.com/doc/store/assets/standard" },
  steamAssetRules: { title: "Steamworks: Rules and guidelines for graphical assets", url: "https://partner.steamgames.com/doc/store/assets/rules" },
  steamTags: { title: "Steamworks: Steam Tags", url: "https://partner.steamgames.com/doc/store/tags" },
  steamDescription: { title: "Steamworks: Store page description", url: "https://partner.steamgames.com/doc/store/page/description" },
  steamTrailer: { title: "Steamworks: Trailers", url: "https://partner.steamgames.com/doc/store/trailer" },
  steamLocalization: { title: "Steamworks: Localization and languages", url: "https://partner.steamgames.com/doc/store/localization" },
  steamEarlyAccess: { title: "Steamworks: Early Access", url: "https://partner.steamgames.com/doc/store/earlyaccess" },
  steamNextFest: { title: "Steamworks: Steam Next Fest", url: "https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest" },
  steamUpcomingEvents: { title: "Steamworks: Upcoming events", url: "https://partner.steamgames.com/doc/marketing/upcoming_events" },
  steamComingSoon: { title: "Steamworks: Coming Soon page", url: "https://partner.steamgames.com/doc/store/coming_soon" },
  steamReviews: { title: "Steamworks: User reviews", url: "https://partner.steamgames.com/doc/store/reviews" },
  steamSurvey: { title: "Steam Hardware & Software Survey", url: "https://store.steampowered.com/hwsurvey" },
  surveySep2026: { title: "iXBT: Steam survey, September 2026 (languages)", url: "https://ixbt.games/en/news/2026/10/02/valve-nazvala-samye-populiarnye-videokarty-steam-v-sentiabre-2026-goda-i-podtverdila-vaznost-russkoi-lokalizacii.html" },
  surveyOct2026: { title: "ShiftDelete: Steam survey, October 2026", url: "https://shiftdelete.net/en/steam-hardware-survey" },
  zukowskiChecklist: { title: "Chris Zukowski: Steam Page Checklist (howtomarketagame.com)", url: "https://howtomarketagame.com/wp-content/uploads/2020/03/SteamPageChecklistv1.pdf" },
  zukowskiPricing: { title: "Chris Zukowski: 4 tips to help you price your indie game", url: "https://howtomarketagame.com/2022/08/23/4-tips-to-help-you-price-your-indie-game/" },
  zukowskiNextFest: { title: "Unity blog: 5 pro tips for succeeding at Steam Next Fest (Chris Zukowski)", url: "https://unity.com/blog/steam-next-fest-developer-tips-unity" },
  gdcoFollowers: { title: "GameDiscoverCo: How Steam followers and wishlists relate", url: "https://newsletter.gamediscover.co/p/deep-dive-how-steam-followers-and" },
  gdcoFollowers2023: { title: "Game World Observer: followers x12 = wishlists (GameDiscoverCo, June 2023)", url: "https://gameworldobserver.com/2023/06/22/how-to-count-wishlists-steam-followers-multiplier" },
  reviewThresholds: { title: "Steam review score thresholds (community-documented)", url: "https://www.steampageanalyzer.com/blog/steam-review-score-thresholds" },
  steamWishlist: { title: "Steamworks: Wishlists", url: "https://partner.steamgames.com/doc/marketing/wishlist" },
  pageLiveEarly: { title: "GameDev.net: So you want to have a kick-ass Steam page", url: "https://www.gamedev.net/tutorials/business/business-and-law/so-you-want-to-have-a-kick-ass-steam-page-r5132/" },
};

const S = SOURCES;

// ---------------------------------------------------------------------------------------------
// Rules: what Page Doctor checks, why, and where the rule comes from.
// ---------------------------------------------------------------------------------------------
export const RULES = [
  { id: "capsule-assets", area: "capsule", check: "auto", title: "Capsule images are uploaded",
    rule: "Steam requires a header capsule (920x430), small capsule (462x174) and main capsule (1232x706). Page Doctor can only see whether the image URLs exist.",
    sources: [S.steamAssets] },
  { id: "capsule-legibility", area: "capsule", check: "manual", title: "Capsule is legible at small size",
    rule: "Base capsules may only contain game artwork, the game name and an official subtitle: no review scores, awards or marketing text. The logo must be easily legible against its background, even at the smallest size Steam shows it. Capsule art is, dollar for dollar, the best use of an indie marketing budget.",
    sources: [S.steamAssetRules, S.steamAssets, S.zukowskiChecklist] },
  { id: "desc-length", area: "description", check: "auto", title: "Short description uses its space",
    rule: "The short description is a plain-text pitch of a few hundred characters (about 300) that shoppers skim. Use most of it, measured against comparable games.",
    sources: [S.steamDescription, S.zukowskiChecklist] },
  { id: "desc-genre", area: "description", check: "auto", title: "First sentence states the genre",
    rule: "Shoppers skim short descriptions for keywords that establish the genre. Put your top genre tag (or a clear synonym) in the first sentence.",
    sources: [S.zukowskiChecklist, S.steamDescription] },
  { id: "desc-hook", area: "description", check: "auto", title: "First sentence sells the fantasy and the hook",
    rule: "The short description should identify the game's hook and focus on its unique value. Use specific verbs for the core loop; avoid over-generalised lines such as \"battle evil\" or \"save the world\". (Heuristic check.)",
    sources: [S.zukowskiChecklist, S.steamDescription] },
  { id: "desc-timeless", area: "description", check: "auto", title: "No time-based or call-to-action text",
    rule: "The short description is plain text about the product. Leave out time-based text (\"coming soon\", \"out now\", dates) and calls to action such as \"wishlist now\".",
    sources: [S.steamDescription] },
  { id: "early-access-wording", area: "description", check: "auto", title: "Early Access is explained",
    rule: "Early Access pages must state clearly why the game is in Early Access, how long it will stay there, its current state, and the pricing plan up to launch, and keep that up to date.",
    sources: [S.steamEarlyAccess] },
  { id: "tags-count", area: "tags", check: "auto", title: "All 20 tag slots are used",
    rule: "At least 5 tags are required before launch and Valve recommends up to 20. Only the top 20 are visible and used by Steam for visibility.",
    sources: [S.steamTags, S.zukowskiChecklist] },
  { id: "tags-top-genre", area: "tags", check: "auto", title: "Top tags are specific genre tags",
    rule: "Some store filters prioritise the first 15 tags, so sort them by relevance. The top 5 should describe your sub-genre; generic tags such as \"Indie\" or \"Female Protagonist\" in the top 5 don't help shoppers place the game.",
    sources: [S.steamTags, S.zukowskiChecklist] },
  { id: "tags-missing", area: "tags", check: "auto", title: "Niche-defining tags are present",
    rule: "Tags drive Steam's recommendations. If most comparable games carry a genre tag that you lack, Steam is less likely to show you to their players.",
    sources: [S.steamTags] },
  { id: "tags-order", area: "tags", check: "auto", title: "Tags are ordered by relevance",
    rule: "Sort tags in order of relevance: the most accurate sub-genre tags first.",
    sources: [S.steamTags, S.zukowskiChecklist] },
  { id: "media-screenshots", area: "media", check: "auto", title: "Enough screenshots",
    rule: "Steam requires at least 5 screenshots (1920x1080 or larger, 16:9) that show gameplay. Comparable games usually show more.",
    sources: [S.steamAssets] },
  { id: "media-trailer", area: "media", check: "auto", title: "Has a gameplay trailer",
    rule: "Valve highly recommends that the first trailer on the page is primarily gameplay; Steam also builds the micro trailer from it. Show action in the first seconds, not slow establishing shots.",
    sources: [S.steamTrailer, S.zukowskiChecklist] },
  { id: "media-first-screens", area: "media", check: "manual", title: "First 4 screenshots show the core loop",
    rule: "The first 4 screenshots appear in Steam's hover preview. Make them show the 4 core parts of the gameplay loop, using real in-game images.",
    sources: [S.zukowskiChecklist, S.steamAssets] },
  { id: "price-vs-comps", area: "price", check: "auto", title: "Price fits comparable games",
    rule: "Price against games in the same genre and scale released in the last 3 years, then consider charging about 20% more. If everyone thinks your price is just right, you are probably the cheapest game in your genre.",
    sources: [S.zukowskiPricing] },
  { id: "languages-coverage", area: "languages", check: "auto", title: "Language coverage matches comparable games",
    rule: "Store page and in-game localisation are separate and can be done independently. Supporting both is ideal.",
    sources: [S.steamLocalization] },
  { id: "languages-markets", area: "languages", check: "auto", title: "Biggest Steam languages are covered",
    rule: "Simplified Chinese is Steam's #2 language by users after English (31.4% of survey respondents in September 2026, 22.0% in October 2026); Russian was 9.1% in September 2026. Prioritise the languages that most comparable games support.",
    sources: [S.steamSurvey, S.surveySep2026, S.surveyOct2026, S.steamLocalization] },
  { id: "reviews-count", area: "social-proof", check: "auto", title: "Enough reviews to show a score",
    rule: "Steam shows no review score below 10 reviews. \"Very Positive\" needs 80%+ positive across 50+ reviews; \"Overwhelmingly Positive\" needs 95%+ across 500+ (community-documented thresholds; Valve does not publish exact cut-offs).",
    sources: [S.reviewThresholds, S.steamReviews] },
  { id: "reviews-positive", area: "social-proof", check: "auto", title: "Review score is positive",
    rule: "70-79% positive shows as \"Mostly Positive\", 40-69% as \"Mixed\"; 80%+ is needed for \"Positive\"/\"Very Positive\" (community-documented thresholds).",
    sources: [S.reviewThresholds, S.steamReviews] },
  { id: "followers", area: "social-proof", check: "auto", title: "Follower count against comparable games",
    rule: "For unreleased games, wishlists are typically 5x-14x followers (median 9.6x in 2021; 12x in June 2023, GameDiscoverCo). The multiplier breaks down after release.",
    sources: [S.gdcoFollowers, S.gdcoFollowers2023] },
  { id: "wishlist-readiness", area: "social-proof", check: "auto", title: "Wishlist momentum before launch",
    rule: "Before launch there are no reviews: wishlists are the social proof that matters. Followers are public; wishlists are typically 5x-14x followers for unreleased games (median 9.6x in 2021, 12x in June 2023). Track the real number in Steamworks' wishlist reports.",
    sources: [S.gdcoFollowers, S.gdcoFollowers2023, S.steamWishlist] },
  { id: "page-live", area: "timing", check: "auto", title: "Steam page is live early enough",
    rule: "Wishlists only accumulate once a Coming Soon page is public. Valve asks you to submit the page for review at least 7 business days before you want it live, and the page must be live for at least 2 weeks before release. Put it up as early as you have a strong trailer, screenshots and text.",
    sources: [S.steamComingSoon, S.pageLiveEarly] },
  { id: "timing-demo", area: "timing", check: "auto", title: "Has a demo before launch",
    rule: "Steam Next Fest requires a publicly playable demo by the time the festival begins. Release the demo well before the Fest rather than debuting it there.",
    sources: [S.steamNextFest, S.zukowskiNextFest] },
  { id: "timing-next-fest", area: "timing", check: "auto", title: "Next Fest timing",
    rule: "A game can take part in only one Next Fest, and needs a public store page. Submit the demo for review at least 3 weeks before the Fest; release it about 10 days before if you want press to play it in the Press Preview. A Coming Soon page must be live at least 2 weeks before release.",
    sources: [S.steamNextFest, S.steamUpcomingEvents, S.steamComingSoon, S.zukowskiNextFest] },
];

const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

// Score weights. Area weights sum to 100. See README "Scoring".
export const AREA_WEIGHTS = {
  description: 20, tags: 20, media: 15, capsule: 10, "social-proof": 15, languages: 10, price: 5, timing: 5,
};

export const GRADE_BANDS = [["A", 85], ["B", 70], ["C", 55], ["D", 40], ["F", 0]];

// Next Fest dates confirmed on Steamworks' upcoming-events page. Extend as Valve announces more.
export const NEXT_FESTS = [
  { name: "Steam Next Fest: February 2027", start: "2027-02-22", end: "2027-03-01" },
];

// Large Steam languages, most important first. `fact` only where we verified a number.
export const KEY_LANGUAGES = [
  { name: "Simplified Chinese", aliases: ["simplified chinese", "chinese (simplified)", "schinese", "chinese simplified"],
    fact: "Chinese is Steam's #2 language by users (31.4% of survey respondents in Sept 2026, 22.0% in Oct 2026)." },
  { name: "Russian", aliases: ["russian"], fact: "Russian was 9.1% of Steam survey respondents in Sept 2026." },
  { name: "Spanish", aliases: ["spanish - spain", "spanish - latin america", "spanish", "spanish (spain)", "spanish (latin america)"], fact: null },
  { name: "Portuguese - Brazil", aliases: ["portuguese - brazil", "portuguese (brazil)", "brazilian portuguese", "brazilian"], fact: null },
  { name: "German", aliases: ["german"], fact: null },
  { name: "French", aliases: ["french"], fact: null },
  { name: "Japanese", aliases: ["japanese"], fact: null },
  { name: "Korean", aliases: ["korean"], fact: null },
  { name: "Traditional Chinese", aliases: ["traditional chinese", "chinese (traditional)", "tchinese"], fact: null },
  { name: "Polish", aliases: ["polish"], fact: null },
  { name: "Turkish", aliases: ["turkish"], fact: null },
  { name: "Italian", aliases: ["italian"], fact: null },
];

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export const SHORT_DESC_MAX = 300;

// ---------------------------------------------------------------------------------------------
// Tag vocabulary
// ---------------------------------------------------------------------------------------------
// Broad top-level genres: accurate but not niche-defining.
const BROAD_GENRES = ["action", "adventure", "rpg", "strategy", "simulation", "casual", "puzzle", "sports", "racing", "shooter", "arcade"];
// Sub-genres and genre-defining tags.
const SUB_GENRES = [
  "roguelike", "roguelite", "action roguelike", "roguelike deckbuilder", "deckbuilding", "deckbuilder", "card game", "card battler",
  "trading card game", "metroidvania", "souls-like", "soulslike", "platformer", "2d platformer", "3d platformer", "precision platformer",
  "puzzle platformer", "fps", "third-person shooter", "top-down shooter", "twin stick shooter", "bullet hell", "shoot 'em up",
  "looter shooter", "extraction shooter", "hero shooter", "arena shooter", "survival", "survival horror", "horror", "psychological horror",
  "city builder", "colony sim", "base building", "automation", "factory", "management", "resource management", "farming sim",
  "life sim", "tower defense", "turn-based strategy", "turn-based tactics", "tactical rpg", "real time tactics", "rts",
  "grand strategy", "4x", "auto battler", "visual novel", "dating sim", "walking simulator", "point & click", "hidden object",
  "match 3", "sokoban", "fighting", "2d fighter", "beat 'em up", "hack and slash", "action rpg", "jrpg", "crpg", "party-based rpg",
  "dungeon crawler", "open world survival craft", "crafting", "sandbox", "open world", "immersive sim", "stealth", "rhythm",
  "idler", "clicker", "incremental", "physics", "mmorpg", "moba", "battle royale", "interactive fiction", "mystery", "detective",
  "escape room", "word game", "trivia", "board game", "tabletop", "wargame", "space sim", "flight", "driving", "vehicle combat",
  "programming", "logic", "farming", "fishing", "hunting", "cooking", "god game", "economy", "trading", "political sim",
  "hero shooter", "party game", "social deduction", "co-op campaign", "survivors-like", "bullet heaven", "boomer shooter",
  "creature collector", "monster tamer", "time management", "job simulator", "medieval city builder", "deck building",
  "action-adventure", "puzzle-platformer", "narrative", "choose your own adventure", "real-time with pause", "simulation rpg",
];
// Descriptive but generic: they appear on many games and say nothing about genre.
const FLUFF_TAGS = [
  "indie", "singleplayer", "great soundtrack", "female protagonist", "male protagonist", "atmospheric", "beautiful", "colorful",
  "cute", "funny", "cartoony", "stylized", "difficult", "replay value", "controller", "family friendly", "relaxing", "masterpiece",
  "classic", "addictive", "cinematic", "epic", "emotional", "memes", "multiple endings", "fantasy", "sci-fi", "2d", "3d",
  "pixel graphics", "hand-drawn", "cartoon", "anime", "story rich", "free to play", "early access", "multiplayer", "co-op",
  "online co-op", "local co-op", "first-person", "third person", "top-down", "minimalist", "dark", "violent", "gore", "nudity",
  "wholesome", "cozy", "mature", "sexual content", "realistic", "retro", "old school", "short", "medieval", "space", "historical",
  "exploration", "action-adventure game",
];
// Business-model or state tags: never suggest adding these from comparable games.
const STATE_TAGS = ["early access", "free to play", "massively multiplayer", "vr", "steam workshop", "controller", "sexual content", "nudity", "gore", "violent", "mature"];

const SET_BROAD = new Set(BROAD_GENRES);
const SET_SUB = new Set(SUB_GENRES);
const SET_FLUFF = new Set(FLUFF_TAGS);
const SET_STATE = new Set(STATE_TAGS);

export function normalizeTag(name) {
  return String(name ?? "").toLowerCase().replace(/[\u2019`]/g, "'").replace(/\s+/g, " ").trim();
}

/** "sub" (sub-genre), "broad" (top-level genre), "fluff" (generic) or "other" (theme, feature, visuals). */
export function tagKind(name) {
  const t = normalizeTag(name);
  if (SET_SUB.has(t)) return "sub";
  if (SET_BROAD.has(t)) return "broad";
  if (SET_FLUFF.has(t)) return "fluff";
  return "other";
}

// Words that mean a genre in prose. Key is a tag; values are regex sources matched on lowercase text.
const GENRE_WORDS = {
  "roguelike": ["rogue-?\\s?like", "rogue-?\\s?lite", "run-based", "permadeath"],
  "roguelite": ["rogue-?\\s?lite", "rogue-?\\s?like", "run-based"],
  "action roguelike": ["rogue-?\\s?like", "rogue-?\\s?lite"],
  "roguelike deckbuilder": ["rogue-?\\s?like", "rogue-?\\s?lite", "deck-?\\s?build"],
  "deckbuilding": ["deck-?\\s?build", "card game", "card battler", "deck of cards"],
  "deckbuilder": ["deck-?\\s?build"],
  "card game": ["card game", "card battler", "deck-?\\s?build", "cards?\\b"],
  "card battler": ["card battler", "card game", "deck-?\\s?build"],
  "metroidvania": ["metroidvania", "interconnected (world|map)"],
  "souls-like": ["souls-?like", "soulslike"],
  "platformer": ["platform(er|ing)"],
  "2d platformer": ["platform(er|ing)"],
  "3d platformer": ["platform(er|ing)"],
  "precision platformer": ["platform(er|ing)"],
  "puzzle platformer": ["puzzle", "platform(er|ing)"],
  "fps": ["first-person shooter", "\\bfps\\b", "shooter"],
  "shooter": ["shooter", "shoot 'em up", "\\bshmup\\b", "gunfights?"],
  "bullet hell": ["bullet[- ]hell", "shoot 'em up", "\\bshmup\\b"],
  "survival": ["surviv"],
  "survival horror": ["survival horror", "horror"],
  "horror": ["horror", "terrify", "nightmare"],
  "psychological horror": ["horror", "psychological"],
  "city builder": ["city[- ]build", "build (a|your) (city|town|settlement|colony)"],
  "colony sim": ["colony", "settlers"],
  "base building": ["base[- ]build", "build (a|your) base"],
  "automation": ["automat", "factor(y|ies)", "production lines?"],
  "factory": ["factor(y|ies)", "automat"],
  "management": ["manag(e|ement|er)", "tycoon"],
  "farming sim": ["farm"],
  "life sim": ["life sim", "farm", "village life"],
  "tower defense": ["tower defen[cs]e"],
  "turn-based strategy": ["turn-based", "strategy"],
  "turn-based tactics": ["turn-based", "tactic"],
  "tactical rpg": ["tactic", "\\brpg\\b"],
  "rts": ["real-time strategy", "\\brts\\b"],
  "grand strategy": ["grand strategy", "empire"],
  "4x": ["\\b4x\\b", "explore, expand", "empire"],
  "auto battler": ["auto-?\\s?battler"],
  "visual novel": ["visual novel"],
  "dating sim": ["dating", "romance"],
  "walking simulator": ["narrative", "story", "explore"],
  "point & click": ["point[- ]and[- ]click", "point & click"],
  "hidden object": ["hidden object"],
  "match 3": ["match[- ]3", "match[- ]three"],
  "fighting": ["fighting game", "fighter", "combos?"],
  "beat 'em up": ["beat 'em up", "brawler"],
  "hack and slash": ["hack[- ]and[- ]slash", "hack 'n' slash"],
  "action rpg": ["action rpg", "action-rpg", "\\barpg\\b", "\\brpg\\b"],
  "jrpg": ["\\bjrpg\\b", "\\brpg\\b"],
  "crpg": ["\\bcrpg\\b", "\\brpg\\b"],
  "party-based rpg": ["\\brpg\\b", "party"],
  "rpg": ["\\brpg\\b", "role-?playing"],
  "dungeon crawler": ["dungeon"],
  "open world survival craft": ["surviv", "craft"],
  "crafting": ["craft"],
  "sandbox": ["sandbox"],
  "open world": ["open[- ]world"],
  "immersive sim": ["immersive sim"],
  "stealth": ["stealth", "sneak"],
  "rhythm": ["rhythm", "to the beat"],
  "idler": ["idle", "incremental"],
  "clicker": ["clicker", "idle"],
  "incremental": ["incremental", "idle"],
  "puzzle": ["puzzle"],
  "racing": ["rac(e|ing|er)"],
  "sports": ["sports?", "football", "soccer", "basketball", "golf", "tennis"],
  "strategy": ["strateg", "tactic"],
  "simulation": ["simulat", "\\bsim\\b", "tycoon"],
  "adventure": ["adventure"],
  "action": ["action"],
  "detective": ["detective", "investigat", "mystery"],
  "mystery": ["mystery", "detective"],
  "board game": ["board game"],
  "wargame": ["wargame", "war game"],
  "space sim": ["space sim", "starship", "spaceship"],
  "survivors-like": ["survivors-?like", "bullet heaven", "horde"],
  "bullet heaven": ["bullet heaven", "survivors-?like", "horde"],
  "boomer shooter": ["boomer shooter", "retro shooter", "\\bfps\\b"],
  "creature collector": ["creature collect", "monster", "tame"],
  "cooking": ["cook", "kitchen", "restaurant"],
  "fishing": ["fish"],
  "party game": ["party game"],
  "social deduction": ["social deduction", "impostor", "traitor"],
  "interactive fiction": ["interactive fiction", "text adventure", "narrative"],
  "narrative": ["narrative", "story"],
};
// Genre words to look for even when they don't match the game's own tags.
// Excludes broad or everyday words ("adventure", "story") that don't establish a genre on their own.
const GENERIC_GENRE_WORDS = new Set(["adventure", "action", "story", "narrative", "explore", "cards?\\b", "party", "combos?", "monster", "fish", "content", "empire", "psychological", "terrify", "nightmare"]);
const ANY_GENRE_WORDS = Object.values(GENRE_WORDS).flat().filter((v, i, a) => a.indexOf(v) === i && !GENERIC_GENRE_WORDS.has(v));

const VAGUE_PHRASES = [
  "battle evil", "fight evil", "defeat evil", "save the world", "epic adventure", "epic journey", "like never before",
  "unique experience", "immersive experience", "unforgettable", "one of a kind", "a new kind of", "the ultimate",
  "journey of a lifetime", "breathtaking", "an experience like no other", "a game about", "is a game",
];
const FANTASY_RE = /\b(you|your|you're|you'll|yourself|as an?|become|play as|take on the role|step into|lead|command)\b/i;
const VERB_RE = /\b(build|craft|explore|fight|shoot|slash|dodge|parry|draft|deck-?build|combine|merge|manage|grow|farm|cook|hunt|survive|scavenge|loot|sneak|race|drift|solve|match|stack|defend|command|lead|recruit|trade|sail|fly|dig|mine|upgrade|customi[sz]e|investigate|uncover|hack|jump|climb|raid|conquer|design|automate|breed|tame|befriend|date|escape|collect|battle|plan|outsmart|slay|blast|smash|brew|run|rebuild|restore|deliver|steal|rescue|shape|forge|cast|summon|place|route|deduce|wield|master|unlock|discover|defeat|dive|chain|sling)s?\b/i;
const TIME_RE = /\b(coming soon|out now|available now|now available|wishlist|wish-list|pre-?order|kickstarter|launch(es|ing)? (on|in)|release[sd]? (on|in)|demo (is )?(out|available)|20[2-3]\d)\b/i;

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

export function median(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function money(x) {
  if (x == null) return "n/a";
  return x === 0 ? "free" : `$${x.toFixed(2)}`;
}

function fmtInt(x) {
  if (x == null) return "n/a";
  return Math.round(x).toLocaleString("en-US");
}

function plural(n, word, pl = word + "s") {
  return `${n} ${n === 1 ? word : pl}`;
}

function stripHtml(s) {
  return str(s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim();
}

/** Tags as [{name, votes}] in order, whatever shape they came in. */
export function toTags(tags) {
  const list = typeof tags === "string" ? tags.split(",") : arr(tags);
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const tag = typeof t === "string" ? { name: t.trim(), votes: null } : t && typeof t === "object" ? { name: str(t.name || t.tag || t.description).trim(), votes: num(t.votes ?? t.count) } : null;
    if (!tag || !tag.name) continue;
    const k = normalizeTag(tag.name);
    if (seen.has(k)) continue; // first (highest-ranked) occurrence wins
    seen.add(k);
    out.push(tag);
  }
  return out;
}

/** Clean language names: strips markup, asterisks and footnotes. */
export function normalizeLanguages(langs) {
  const list = Array.isArray(langs) ? langs : typeof langs === "string" ? langs.split(",") : [];
  const out = [];
  for (const l of list) {
    const name = stripHtml(l).replace(/\*/g, "").replace(/languages with full audio support/i, "").trim();
    if (name && !out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

function hasLanguage(langs, key) {
  const lower = langs.map((l) => l.toLowerCase());
  return key.aliases.some((a) => lower.includes(a));
}

/** Parses SteamSpy-style ranges ("1,000,000 .. 2,000,000", "50k-100k") to a midpoint (geometric mean). */
export function parseOwners(range) {
  if (num(range) != null) return range;
  const s = str(range).toLowerCase().replace(/,/g, "");
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*([km]?)/g)].map((m) => Number(m[1]) * (m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1));
  if (!nums.length) return null;
  if (nums.length === 1) return nums[0];
  const [a, b] = nums;
  return a <= 0 ? b / 2 : Math.sqrt(a * b);
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Release-date strings ("Mar 4, 2025", "4 Mar, 2025", "Q2 2027", "2027", "2027-05-01") to a UTC Date, or null. */
export function parseReleaseDate(s) {
  const t = str(s).trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && m[1] in MONTHS) return new Date(Date.UTC(+m[3], MONTHS[m[1]], +m[2]));
  m = t.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/);
  if (m && m[2] in MONTHS) return new Date(Date.UTC(+m[3], MONTHS[m[2]], +m[1]));
  m = t.match(/q([1-4])\s*(\d{4})/);
  if (m) return new Date(Date.UTC(+m[2], (+m[1] - 1) * 3 + 1, 15));
  m = t.match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && m[1] in MONTHS) return new Date(Date.UTC(+m[2], MONTHS[m[1]], 15));
  m = t.match(/\b(20\d{2})\b/);
  if (m) return new Date(Date.UTC(+m[1], 6, 1));
  return null;
}

function toDate(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY = 86400000;
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function firstSentence(text) {
  const t = stripHtml(text);
  const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

function textMatchesAny(text, patterns) {
  const lower = text.toLowerCase();
  for (const p of patterns) {
    const re = new RegExp(p, "i");
    const m = lower.match(re);
    if (m) return m[0];
  }
  return null;
}

function genrePatternsForTag(tagName) {
  const t = normalizeTag(tagName);
  if (GENRE_WORDS[t]) return GENRE_WORDS[t];
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[- ]/g, "[- ]?");
  return [escaped];
}

/**
 * Fills in a game from the corpus or from manual fields (a game with no Steam page yet).
 * Manual fields accepted: name, shortDescription, aboutText, tags (strings or {name, votes}), genres,
 * priceUSD, isFree, languages (array or comma string), screenshots (array or count) / screenshotCount,
 * movies (count) / hasTrailer (bool), releaseDate, hasDemo, followers, earlyAccess.
 */
export function normalizeGame(game) {
  const g = game && typeof game === "object" ? game : {};
  const shotsArr = Array.isArray(g.screenshots) ? g.screenshots : null;
  const screenshotCount = shotsArr ? shotsArr.length : num(g.screenshots) ?? num(g.screenshotCount) ?? 0;
  const movies = num(g.movies) ?? (g.hasTrailer === true ? 1 : g.hasTrailer === false ? 0 : null);
  const manual = g.manual === true || (g.appid == null && !str(g.url) && !str(g.headerImage));
  const comingSoon = typeof g.comingSoon === "boolean" ? g.comingSoon : manual ? true : false;
  const price = num(g.priceUSD);
  return {
    ...g,
    name: str(g.name),
    tags: toTags(g.tags),
    genres: arr(g.genres).map(str).filter(Boolean),
    shortDescription: stripHtml(g.shortDescription),
    aboutText: stripHtml(g.aboutText),
    languages: normalizeLanguages(g.languages),
    fullAudioLanguages: normalizeLanguages(g.fullAudioLanguages),
    screenshotCount,
    movies,
    priceUSD: price,
    isFree: g.isFree === true || (price === 0 && g.isFree !== false && !comingSoon),
    comingSoon,
    manual,
    hasDemo: typeof g.hasDemo === "boolean" ? g.hasDemo : null,
    earlyAccess: g.earlyAccess === true,
    reviews: g.reviews && typeof g.reviews === "object" ? g.reviews : { total: null, positivePct: null, scoreDesc: null },
    followers: num(g.followers),
  };
}

function shotCount(g) {
  return Array.isArray(g?.screenshots) ? g.screenshots.length : num(g?.screenshots) ?? num(g?.screenshotCount) ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Comparable games
// ---------------------------------------------------------------------------------------------
function tagVector(game, idf) {
  const tags = toTags(game?.tags);
  const maxVotes = Math.max(0, ...tags.map((t) => t.votes || 0));
  const vec = new Map();
  tags.slice(0, 20).forEach((t, i) => {
    const key = normalizeTag(t.name);
    if (vec.has(key)) return;
    // Steam: the top 5 describe the game, filters use the first 15, only 20 count.
    const rankW = i < 5 ? 1 : i < 15 ? 0.6 : 0.3;
    const voteW = maxVotes > 0 && t.votes != null ? 0.5 + 0.5 * (t.votes / maxVotes) : 1;
    const kind = tagKind(key);
    const kindW = kind === "fluff" ? 0.35 : kind === "broad" ? 0.6 : 1;
    vec.set(key, rankW * voteW * kindW * (idf.get(key) ?? 1));
  });
  return vec;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) dot += v * w; }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 0..1: how proven a game is, from review count and owner estimate (log scale). */
export function successScore(game) {
  const reviews = num(game?.reviews?.total) ?? 0;
  const owners = parseOwners(game?.ownersRange) ?? 0;
  const r = clamp01(Math.log10(1 + reviews) / 5); // 100k reviews = 1
  const o = clamp01(Math.log10(1 + owners) / 7); // 10M owners = 1
  const pct = num(game?.reviews?.positivePct);
  const quality = pct == null ? 1 : pct >= 80 ? 1 : pct >= 70 ? 0.85 : 0.6;
  return round((owners ? 0.6 * r + 0.4 * o : r) * quality, 4);
}

const MEGA_REVIEWS = 50000;
const MEGA_OWNERS = 5e6;

/** "hit" (mega-hit), "indie" (proven: 50+ reviews), "small" (released, under 50 reviews), "upcoming". */
export function scaleTier(game) {
  if (game?.comingSoon) return "upcoming";
  const reviews = num(game?.reviews?.total) ?? 0;
  const owners = parseOwners(game?.ownersRange) ?? 0;
  if (reviews >= MEGA_REVIEWS || owners >= MEGA_OWNERS) return "hit";
  return reviews >= 50 ? "indie" : "small";
}

// Scale on a log10(reviews) axis. Owners stand in when reviews are missing (roughly 1 review per 50 owners).
function scaleLog(game) {
  const reviews = num(game?.reviews?.total);
  if (reviews != null) return Math.log10(1 + reviews);
  const owners = parseOwners(game?.ownersRange);
  return owners ? Math.log10(1 + owners / 50) : null;
}

// Target scale: released games use their own size, but never below a successful indie (~1,000 reviews),
// so a small or unreleased game is benchmarked against indies that made it in its niche.
const INDIE_SUCCESS_LOG = 3;

/**
 * 0..1: how well a comparable matches the target's scale and scope. Indies get successful indies and upcoming
 * games in their niche; big titles get big titles. Mega-hits stay eligible but rank below closer-sized peers.
 */
export function scaleFit(comp, target) {
  const targetReleased = !(target?.comingSoon || target?.manual);
  const tLog = Math.max(INDIE_SUCCESS_LOG, (targetReleased ? scaleLog(target) : null) ?? INDIE_SUCCESS_LOG);
  if (comp?.comingSoon) {
    if (!targetReleased) return 1; // upcoming games in the niche are ideal peers for an unreleased game
    return tLog >= Math.log10(MEGA_REVIEWS) ? 0.3 : 0.6;
  }
  const cLog = scaleLog(comp);
  if (cLog == null) return 0.5;
  const distance = Math.abs(cLog - tLog);
  const fit = clamp01(1 - Math.max(0, distance - 1) / 1.5); // within 10x of the target: full fit
  const proven = num(comp?.reviews?.total) == null || comp.reviews.total >= 50 ? 1 : 0.6; // under 50 reviews: unproven
  return round(fit * proven, 4);
}

function sameGame(a, b) {
  if (a?.appid != null && b?.appid != null) return Number(a.appid) === Number(b.appid);
  return normalizeTag(a?.name) !== "" && normalizeTag(a?.name) === normalizeTag(b?.name);
}

/**
 * Comparable games: same niche (tag-weighted similarity using tag order, votes and rarity; genre overlap as a
 * tiebreak) and similar scale (scaleFit: an indie or unreleased game gets successful indies and upcoming games
 * in its niche, a big title gets big titles). Similarity dominates; scale reorders games of similar relevance.
 * Returns [{ game, similarity, sharedTags, success, tier, scaleFit, genreOverlap, rank }].
 */
export function findComparables(gameIn, corpus, { limit = 20 } = {}) {
  const games = arr(corpus?.games ?? corpus).filter((g) => g && typeof g === "object");
  if (!gameIn || typeof gameIn !== "object" || !games.length) return [];
  const game = normalizeGame(gameIn);
  // Inverse document frequency over the corpus, so rare shared tags count more than "Indie".
  const df = new Map();
  for (const g of games) {
    const seen = new Set(toTags(g.tags).slice(0, 20).map((t) => normalizeTag(t.name)));
    for (const k of seen) df.set(k, (df.get(k) || 0) + 1);
  }
  const N = games.length;
  const idf = new Map([...df].map(([k, n]) => [k, Math.log(1 + N / n)]));
  const target = tagVector(game, idf);
  if (!target.size) return [];
  const targetGenres = new Set(arr(game.genres).map(normalizeTag));

  const scored = [];
  for (const g of games) {
    if (sameGame(g, game)) continue;
    const vec = tagVector(g, idf);
    const sim = cosine(target, vec);
    if (sim <= 0.05) continue;
    const gGenres = arr(g.genres).map(normalizeTag);
    const union = new Set([...targetGenres, ...gGenres]);
    const genreJ = union.size ? gGenres.filter((x) => targetGenres.has(x)).length / union.size : 0;
    const success = successScore(g);
    const theirs = new Set(toTags(g.tags).slice(0, 20).map((t) => normalizeTag(t.name)));
    const sharedTags = toTags(game.tags).filter((t) => theirs.has(normalizeTag(t.name))).map((t) => t.name);
    const fit = scaleFit(g, game);
    const rank = sim * (0.6 + 0.4 * fit) + 0.02 * genreJ;
    scored.push({ game: g, similarity: round(sim, 4), sharedTags, success, tier: scaleTier(g), scaleFit: fit, genreOverlap: round(genreJ, 4), rank: round(rank, 6) });
  }
  scored.sort((a, b) => b.rank - a.rank || b.genreOverlap - a.genreOverlap || (Number(a.game.appid) || 0) - (Number(b.game.appid) || 0) || str(a.game.name).localeCompare(str(b.game.name)));
  return scored.slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------------------------
function comparableGames(comparables) {
  return arr(comparables).map((c) => (c && c.game && typeof c.game === "object" ? c.game : c)).filter((g) => g && typeof g === "object");
}

function tagShares(comps) {
  const n = comps.length;
  const top5 = new Map(), top10 = new Map(), any = new Map(), names = new Map();
  for (const g of comps) {
    const seen = new Set();
    toTags(g.tags).slice(0, 20).forEach((t, i) => {
      const k = normalizeTag(t.name);
      if (seen.has(k)) return;
      seen.add(k);
      if (!names.has(k)) names.set(k, t.name);
      any.set(k, (any.get(k) || 0) + 1);
      if (i < 10) top10.set(k, (top10.get(k) || 0) + 1);
      if (i < 5) top5.set(k, (top5.get(k) || 0) + 1);
    });
  }
  return { n, top5, top10, any, names };
}

export function computeBenchmarks(comparables) {
  const comps = comparableGames(comparables);
  const n = comps.length;
  const paid = comps.filter((g) => !g.isFree && num(g.priceUSD) != null && g.priceUSD > 0);
  const released = comps.filter((g) => !g.comingSoon);
  const shares = tagShares(comps);
  const topTags = [...shares.top10.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([k, c]) => ({ tag: shares.names.get(k), inTop10: c, share: round(c / Math.max(1, n), 3) }));
  const languageShare = KEY_LANGUAGES.map((k) => {
    const c = comps.filter((g) => hasLanguage(normalizeLanguages(g.languages), k)).length;
    return { language: k.name, count: c, share: round(c / Math.max(1, n), 3) };
  });
  const withMovies = comps.filter((g) => num(g.movies) != null);
  const withDemoInfo = comps.filter((g) => typeof g.hasDemo === "boolean");
  return {
    comparableCount: n,
    medianPrice: median(paid.map((g) => g.priceUSD)),
    paidCount: paid.length,
    freeCount: comps.filter((g) => g.isFree).length,
    medianScreenshots: median(comps.map(shotCount)),
    medianMovies: median(withMovies.map((g) => g.movies)),
    trailerShare: withMovies.length ? round(withMovies.filter((g) => g.movies > 0).length / withMovies.length, 3) : null,
    medianLanguages: median(comps.map((g) => normalizeLanguages(g.languages).length).filter((x) => x > 0)),
    medianFullAudioLanguages: median(comps.map((g) => normalizeLanguages(g.fullAudioLanguages).length)),
    medianDescLength: median(comps.map((g) => stripHtml(g.shortDescription).length).filter((x) => x > 0)),
    medianTags: median(comps.map((g) => toTags(g.tags).length)),
    medianReviews: median(released.map((g) => num(g.reviews?.total))),
    medianPositivePct: median(released.map((g) => num(g.reviews?.positivePct))),
    medianFollowers: median(comps.map((g) => num(g.followers))),
    demoShare: withDemoInfo.length ? round(withDemoInfo.filter((g) => g.hasDemo).length / withDemoInfo.length, 3) : null,
    earlyAccessShare: n ? round(comps.filter((g) => g.earlyAccess).length / n, 3) : null,
    topTags,
    languageShare,
  };
}

// ---------------------------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------------------------
const STATUS_SCORE = { pass: 1, warn: 0.5, fail: 0 };

function makeCheck(id, status, detail, fix, { weight = 1, score, manual = false, title } = {}) {
  const rule = RULE_BY_ID[id];
  const scored = !manual && weight > 0;
  return {
    id,
    area: rule.area,
    status,
    title: title || rule.title,
    detail,
    fix,
    weight: scored ? weight : 0,
    score: scored ? round(score ?? STATUS_SCORE[status], 3) : null,
    manual,
    source: rule.sources[0].url,
    sources: rule.sources.map((s) => s.url),
  };
}

function ratioScore(x, med, decades = 1.5) {
  if (med == null || med <= 0) return null;
  return clamp01(1 + Math.log10(Math.max(x, 0.5) / med) / decades);
}

function outOf(count, n) {
  return `${count} of ${n}`;
}

/**
 * Audits one game against its comparables. `comparables` is findComparables() output or a list of games.
 * Options: { now } (Date or ISO string) enables date-based Next Fest advice; without it the advice is undated.
 */
export function diagnose(game, comparables, opts = {}) {
  const g = normalizeGame(game);
  const compEntries = arr(comparables).filter((c) => c && typeof c === "object");
  const comps = comparableGames(comparables).filter((c) => !sameGame(c, g));
  const n = comps.length;
  const b = computeBenchmarks(comps);
  const now = toDate(opts.now);
  const checks = [];
  const name = str(g.name) || "This game";
  const tags = toTags(g.tags);
  const tagKeys = tags.map((t) => normalizeTag(t.name));
  const short = stripHtml(g.shortDescription);
  const about = stripHtml(g.aboutText);
  const shots = g.screenshotCount;
  const movies = num(g.movies);
  const langs = normalizeLanguages(g.languages);
  const released = !g.comingSoon;

  // --- Capsule ---------------------------------------------------------------------------
  {
    const header = /^https:\/\//i.test(str(g.headerImage));
    const capsule = /^https:\/\//i.test(str(g.capsuleImage));
    if (g.manual && !header && !capsule) {
      checks.push(makeCheck("capsule-assets", "warn", "No Steam page data, so Page Doctor can't see your capsule images.", "Before the page goes live you need a header capsule (920x430), small capsule (462x174) and main capsule (1232x706). Budget for a capsule artist.", { manual: true }));
    } else if (header && capsule) {
      checks.push(makeCheck("capsule-assets", "pass", "Header and main capsule images are uploaded. Page Doctor can't judge the art itself; see the manual capsule check.", "Keep them; review legibility with the manual check below."));
    } else if (header || capsule) {
      checks.push(makeCheck("capsule-assets", "warn", `Only the ${header ? "header" : "main"} capsule was found in the store data.`, "Upload every required capsule size in Steamworks (header 920x430, small 462x174, main 1232x706)."));
    } else {
      checks.push(makeCheck("capsule-assets", "fail", "No capsule image was found in the store data.", "Upload the required capsules in Steamworks: header 920x430, small 462x174, main 1232x706."));
    }
    checks.push(makeCheck("capsule-legibility", "warn",
      "Manual check: open your small capsule and shrink it to about 120 px wide (roughly how it appears in lists and search). Can you read the game's name in under a second? Does the art say the genre?",
      "Use only artwork, the game name and an official subtitle (no review scores, awards or taglines). Make the logo large and high-contrast against its background. If you can afford one marketing spend, hire a capsule artist.",
      { manual: true }));
  }

  // --- Description -----------------------------------------------------------------------
  {
    const len = short.length;
    const med = b.medianDescLength;
    const vs = med != null ? ` Comparable games median ${Math.round(med)} characters.` : "";
    let status, score;
    if (!len) { status = "fail"; score = 0; }
    else if (len < 60) { status = "fail"; score = 0.15; }
    else if (len < 120 || (med != null && len < 0.6 * med)) { status = "warn"; score = 0.5; }
    else if (len > SHORT_DESC_MAX + 20) { status = "warn"; score = 0.6; }
    else { status = "pass"; score = 1; }
    checks.push(makeCheck("desc-length", status,
      len ? `Your short description is ${len} characters (Steam allows about ${SHORT_DESC_MAX}).${vs}` : `You have no short description.${vs}`,
      status === "pass" ? "Good length. Keep every word working: genre, fantasy, hook." : `Write 200-${SHORT_DESC_MAX} characters: sentence 1 = genre + player fantasy, sentence 2 = what makes it different, sentence 3 = the loop in concrete verbs.`,
      { weight: 1, score }));

    // Genre in the first sentence.
    const first = firstSentence(short);
    const ownGenreTags = [...tags.slice(0, 7).map((t) => t.name), ...arr(g.genres)].filter((t) => ["sub", "broad"].includes(tagKind(t)));
    let hit = null, hitTag = null;
    for (const t of ownGenreTags) {
      const m = textMatchesAny(first, genrePatternsForTag(t));
      if (m) { hit = m; hitTag = t; break; }
    }
    const anyGenreFirst = hit ? null : textMatchesAny(first, ANY_GENRE_WORDS);
    const genreLater = hit || anyGenreFirst ? null : textMatchesAny(short, ownGenreTags.flatMap(genrePatternsForTag).concat(ANY_GENRE_WORDS));
    const topGenre = ownGenreTags.find((t) => tagKind(t) === "sub") || ownGenreTags[0] || null;
    const compsWithGenreFirst = comps.filter((c) => {
      const f = firstSentence(c.shortDescription);
      return f && textMatchesAny(f, ANY_GENRE_WORDS);
    }).length;
    const compNote = n ? ` ${outOf(compsWithGenreFirst, n)} comparable games name a genre in their first sentence.` : "";
    if (!short) {
      checks.push(makeCheck("desc-genre", "fail", "No short description, so no genre signal." + compNote, `Open with your genre: "${topGenre ? `A ${topGenre.toLowerCase()} where you...` : "A [genre] where you..."}"`, { weight: 1.5 }));
    } else if (hit) {
      checks.push(makeCheck("desc-genre", "pass", `Your first sentence names the genre ("${hit}", matching your tag ${hitTag}).` + compNote, "Keep the genre word up front.", { weight: 1.5 }));
    } else if (anyGenreFirst) {
      checks.push(makeCheck("desc-genre", "warn", `Your first sentence has a genre word ("${anyGenreFirst}") but not one of your own top genre tags${topGenre ? ` (e.g. ${topGenre})` : ""}.` + compNote, `Use the same genre words as your top tags so the copy and the tags tell one story${topGenre ? `, e.g. "${topGenre.toLowerCase()}"` : ""}.`, { weight: 1.5 }));
    } else {
      checks.push(makeCheck("desc-genre", genreLater ? "warn" : "fail",
        (genreLater ? `The genre ("${genreLater}") only appears after the first sentence.` : "Your short description never states a genre.") + compNote,
        `Rewrite the first sentence to start with the genre${topGenre ? ` ("${topGenre}")` : ""} and who the player is, e.g. "A ${topGenre ? topGenre.toLowerCase() : "[genre]"} where you [core verb] [what] to [goal]."`,
        { weight: 1.5, score: genreLater ? 0.4 : 0 }));
    }

    // Hook / fantasy (heuristic).
    const vague = VAGUE_PHRASES.filter((p) => short.toLowerCase().includes(p));
    const fantasy = FANTASY_RE.test(first);
    const verb = (first.match(VERB_RE) || [])[0];
    if (!short) {
      checks.push(makeCheck("desc-hook", "fail", "No short description, so no hook.", "Write one sentence a player could repeat to a friend: who you are, what you do, what makes it different.", { weight: 1 }));
    } else if (vague.length) {
      checks.push(makeCheck("desc-hook", "fail", `Generic phrases: ${vague.map((v) => `"${v}"`).join(", ")}. These could describe any game.`, "Replace them with the specific thing only your game does, using concrete verbs for the core loop.", { weight: 1 }));
    } else if (fantasy && verb) {
      checks.push(makeCheck("desc-hook", "pass", `Your first sentence puts the player in a role and uses a concrete verb ("${verb}"). (Heuristic check.)`, "Make sure the second sentence names what is new about your take on the genre.", { weight: 1 }));
    } else {
      checks.push(makeCheck("desc-hook", "warn",
        `Your first sentence ${!fantasy ? "doesn't put the player in a role (no \"you\", \"as a...\", \"become\")" : ""}${!fantasy && !verb ? " and " : ""}${!verb ? "has no concrete gameplay verb" : ""}. (Heuristic check.)`,
        "State the player fantasy and the core action: \"As a [role], you [verb] [object] to [goal]\" or \"[Genre] where you [verb]...\".",
        { weight: 1 }));
    }

    const timeHit = short.match(TIME_RE);
    checks.push(makeCheck("desc-timeless", timeHit ? "warn" : "pass",
      timeHit ? `Your short description contains time-based or call-to-action text ("${timeHit[0]}").` : "No time-based or call-to-action text.",
      timeHit ? "Remove dates, \"coming soon\", \"wishlist now\" and similar. Use Steam events and announcements for news instead." : "Nothing to change.",
      { weight: 0.5 }));

    if (g.earlyAccess) {
      const text = `${short}\n${about}`.toLowerCase();
      const themes = {
        why: /\bwhy\b|feedback|community|players? help|shape the game|together/,
        howLong: /\b\d+\s*(-\s*\d+\s*)?(months?|years?|weeks?)\b|roadmap|1\.0|full release|leave early access/,
        currentState: /current(ly)?|right now|today|available now|includes?|playable|content/,
        pricing: /price|pricing|cost/,
      };
      const covered = Object.entries(themes).filter(([, re]) => re.test(text)).map(([k]) => k);
      const labels = { why: "why it's in Early Access", howLong: "how long it will stay", currentState: "what's in the build now", pricing: "the pricing plan" };
      const missing = Object.keys(themes).filter((k) => !covered.includes(k)).map((k) => labels[k]);
      const status = missing.length === 0 ? "pass" : missing.length <= 2 ? "warn" : "fail";
      checks.push(makeCheck("early-access-wording", status,
        missing.length ? `Your page copy doesn't clearly cover ${missing.join(", ")}. (Steam's own Early Access Q&A box may; check it too.)` : "Your copy covers why, how long, the current state and pricing.",
        "Answer Valve's four questions plainly in the Early Access section: why Early Access, how long (e.g. \"about 12 months\"), what's playable today, and whether the price will change at 1.0. Update it at least yearly.",
        { weight: 1, score: covered.length / 4 }));
    }
  }

  // --- Tags --------------------------------------------------------------------------------
  const shares = tagShares(comps);
  const tagSuggestions = { add: [], remove: [], reorder: [] };
  {
    const count = tags.length;
    const medTags = b.medianTags;
    const vs = medTags != null ? ` Comparable games median ${Math.round(medTags)}.` : "";
    const status = count >= 15 ? "pass" : count >= 5 ? "warn" : "fail";
    checks.push(makeCheck("tags-count", status,
      `You use ${count} of 20 tag slots.${vs}`,
      count >= 20 ? "All slots used." : `Fill the remaining ${20 - count} slots with accurate tags (see the suggested additions).`,
      { weight: 1, score: count >= 20 ? 1 : count >= 15 ? 0.85 : count >= 5 ? 0.3 + 0.4 * ((count - 5) / 10) : 0 }));

    // Top 5 should be sub-genres.
    const top5 = tags.slice(0, 5);
    const pts = top5.reduce((s, t) => s + (tagKind(t.name) === "sub" ? 1 : tagKind(t.name) === "broad" ? 0.5 : 0), 0);
    const fluffTop = top5.filter((t) => tagKind(t.name) === "fluff").map((t) => t.name);
    const subTop = top5.filter((t) => tagKind(t.name) === "sub").map((t) => t.name);
    const st = pts >= 2.5 ? "pass" : pts >= 1.5 ? "warn" : "fail";
    checks.push(makeCheck("tags-top-genre", count ? st : "fail",
      count
        ? `Your top 5 tags: ${top5.map((t) => t.name).join(", ")}. ${plural(subTop.length, "is a specific sub-genre", "are specific sub-genres")}${fluffTop.length ? `; ${fluffTop.join(", ")} ${fluffTop.length === 1 ? "is" : "are"} generic` : ""}.`
        : "You have no tags.",
      "Put 3-5 accurate sub-genre tags first (the words a fan of your genre would search for), then themes and features. Move generic tags such as Indie or Singleplayer below the top 5.",
      { weight: 1.5, score: count ? clamp01(pts / 3) : 0 }));

    // Missing niche-defining tags.
    const own = new Set(tagKeys);
    const candidates = [];
    if (n) {
      for (const [k, c] of shares.top10) {
        if (own.has(k) || SET_STATE.has(k)) continue;
        const kind = tagKind(k);
        if (kind === "fluff") continue;
        const share = c / n;
        const minShare = kind === "sub" || kind === "broad" ? 0.35 : 0.5;
        if (share >= minShare) candidates.push({ key: k, tag: shares.names.get(k), count: c, share, kind });
      }
      candidates.sort((a, b2) => (b2.kind === "sub") - (a.kind === "sub") || b2.share - a.share || a.key.localeCompare(b2.key));
    }
    const missing = candidates.slice(0, 8);
    for (const m of missing) {
      tagSuggestions.add.push({ tag: m.tag, why: `In the top 10 tags of ${outOf(m.count, n)} comparable games; you don't have it. Add it if it honestly describes your game.` });
    }
    if (!n) {
      checks.push(makeCheck("tags-missing", "warn", "No comparable games found, so missing tags can't be checked.", "Add more tags or check that your tags are spelled as on Steam.", { weight: 0 }));
    } else {
      const genreMissing = missing.filter((m) => m.kind !== "other");
      const st2 = genreMissing.length >= 3 || missing.length >= 5 ? "fail" : missing.length ? "warn" : "pass";
      checks.push(makeCheck("tags-missing", st2,
        missing.length
          ? `Common among comparable games but missing from yours: ${missing.slice(0, 5).map((m) => `${m.tag} (${outOf(m.count, n)})`).join(", ")}.`
          : `You carry every tag that is common in the top 10 of the ${n} comparable games.`,
        missing.length ? "Add the ones that are true of your game in the Steamworks tag wizard and weight them highly if they define your genre." : "Nothing to add.",
        { weight: 1.5, score: clamp01(1 - genreMissing.length * 0.25 - (missing.length - genreMissing.length) * 0.1) }));
    }

    // Removals: generic tags in top 5, then unused-by-comps tags if slots are needed.
    for (const f of fluffTop) {
      tagSuggestions.remove.push({ tag: f, why: `Generic tag in your top 5. "${f}" fits most games on Steam and doesn't tell shoppers your genre; move it below the top 5 or drop it.` });
    }
    const slotsNeeded = Math.max(0, count + tagSuggestions.add.length - 20);
    if (slotsNeeded && n) {
      const removable = tags
        .map((t, i) => ({ t, i, k: normalizeTag(t.name) }))
        .filter(({ i, k }) => i >= 5 && tagKind(k) !== "sub" && tagKind(k) !== "broad" && !shares.any.get(k) && !fluffTop.includes(k))
        .reverse()
        .slice(0, slotsNeeded);
      for (const { t } of removable) {
        tagSuggestions.remove.push({ tag: t.name, why: `Used by 0 of ${n} comparable games; frees a slot for a tag your genre's players look for.` });
      }
    }

    // Suggested order.
    const removed = new Set(tagSuggestions.remove.filter((r) => !fluffTop.includes(r.tag)).map((r) => normalizeTag(r.tag)));
    const relevance = (k, i) => {
      const kind = tagKind(k);
      const s10 = n ? (shares.top10.get(k) || 0) / n : 0;
      return (kind === "sub" ? 1 : 0.5) * (0.5 + s10) - i * 0.01;
    };
    const current = tags.map((t, i) => ({ name: t.name, k: normalizeTag(t.name), i })).filter((x) => !removed.has(x.k));
    const genreCur = current.filter((x) => ["sub", "broad"].includes(tagKind(x.k))).sort((a, c) => relevance(c.k, c.i) - relevance(a.k, a.i) || a.i - c.i);
    const addGenre = missing.filter((m) => m.kind !== "other").map((m) => m.tag);
    const others = current.filter((x) => tagKind(x.k) === "other");
    const fluff = current.filter((x) => tagKind(x.k) === "fluff");
    const addOther = missing.filter((m) => m.kind === "other").map((m) => m.tag);
    const order = [...genreCur.map((x) => x.name), ...addGenre, ...others.map((x) => x.name), ...addOther, ...fluff.map((x) => x.name)];
    tagSuggestions.reorder = order.filter((t, i) => order.indexOf(t) === i).slice(0, 20);

    const curTop = new Set(tagKeys.slice(0, 5));
    const sugTop = tagSuggestions.reorder.slice(0, 5).map(normalizeTag);
    const overlap = sugTop.filter((k) => curTop.has(k)).length;
    if (count) {
      checks.push(makeCheck("tags-order", overlap >= 4 || count < 5 ? "pass" : "warn",
        overlap >= 4 ? "Your top 5 already lead with your most relevant genre tags." : `Suggested top 5: ${tagSuggestions.reorder.slice(0, 5).join(", ")} (shares ${overlap} with your current top 5).`,
        "In the Steamworks tag wizard, weight your most accurate sub-genre tags highest so they appear first.",
        { weight: 0.5, score: overlap >= 4 ? 1 : overlap / 5 }));
    }
  }

  // --- Media -------------------------------------------------------------------------------
  {
    const med = b.medianScreenshots;
    const vs = med != null && n ? `Comparable games median ${Math.round(med)} screenshots; you have ${shots}.` : `You have ${shots} screenshots.`;
    let status, score;
    if (shots < 5) { status = "fail"; score = shots / 10; }
    else if (med != null && shots < med - 1) { status = "warn"; score = 0.5 + 0.5 * (shots / med); }
    else { status = "pass"; score = 1; }
    checks.push(makeCheck("media-screenshots", status, vs,
      status === "pass" ? "Keep the strongest 4 first." : `Add gameplay screenshots up to at least ${Math.max(5, Math.round(med ?? 5))} (1920x1080 or larger, real in-game images).`,
      { weight: 1, score }));

    const trailerComps = n && b.trailerShare != null ? ` ${outOf(Math.round(b.trailerShare * comps.filter((c) => num(c.movies) != null).length), comps.filter((c) => num(c.movies) != null).length)} comparable games have one.` : "";
    if (movies == null) {
      checks.push(makeCheck("media-trailer", "warn", "Trailer count unknown." + trailerComps, "Make sure the first trailer on the page is gameplay.", { weight: 1 }));
    } else if (movies > 0) {
      checks.push(makeCheck("media-trailer", "pass", `You have ${plural(movies, "trailer")}.` + trailerComps, "Check that the first one is primarily gameplay and shows action in the first few seconds; Steam builds the micro trailer from it.", { weight: 1 }));
    } else {
      checks.push(makeCheck("media-trailer", "fail", "You have no trailer." + trailerComps, "Cut a 30-60 second gameplay trailer that opens on action (no logos or slow establishing shots first) and put it first on the page.", { weight: 1 }));
    }
    checks.push(makeCheck("media-first-screens", "warn",
      "Manual check: Steam's hover preview shows your first 4 screenshots. Do they show the 4 core parts of your gameplay loop, clearly, at thumbnail size?",
      "Reorder so screenshots 1-4 each show a different core activity (e.g. explore, fight, build, upgrade). Use real in-game images, no concept art.",
      { manual: true }));
  }

  // --- Price -------------------------------------------------------------------------------
  {
    const price = num(g.priceUSD);
    const med = b.medianPrice;
    const paid = comps.filter((c) => !c.isFree && num(c.priceUSD) != null && c.priceUSD > 0);
    if (!n || med == null) {
      checks.push(makeCheck("price-vs-comps", "warn", "No priced comparable games to compare with.", "Price against same-genre, same-scale games from the last 3 years.", { weight: 0 }));
    } else if (g.isFree || price === 0) {
      const freeComps = b.freeCount;
      const st = freeComps / n >= 0.3 ? "pass" : "warn";
      checks.push(makeCheck("price-vs-comps", st,
        `Your game is free; ${outOf(freeComps, n)} comparable games are free and the paid ones have a median price of ${money(med)}.`,
        st === "pass" ? "Free-to-play is common in your niche." : "If the game isn't designed around free-to-play monetisation, consider a paid price near the comparable median.",
        { weight: 1 }));
    } else if (price == null) {
      checks.push(makeCheck("price-vs-comps", "warn",
        `No price set yet. Comparable paid games median ${money(med)}.`,
        `Plan a price around ${money(med)}-${money(Math.round(med * 1.2) - 0.01)}: comparable median, or up to ~20% more if your game holds up.`,
        { weight: 0 }));
    } else {
      const cheaper = paid.filter((c) => c.priceUSD > price).length;
      const ratio = price / med;
      const st = ratio < 0.5 ? "fail" : ratio < 0.75 || ratio > 1.6 ? "warn" : "pass";
      const sc = ratio < 0.5 ? 0.2 : ratio < 0.75 ? 0.6 : ratio > 1.6 ? 0.6 : 1;
      checks.push(makeCheck("price-vs-comps", st,
        `Comparable paid games median ${money(med)}; you're ${money(price)} (${Math.round(ratio * 100)}% of median; ${outOf(cheaper, paid.length)} comparable paid games cost more).`,
        st === "pass" ? "Your price is in line with the genre." : ratio < 1
          ? `You may be underpricing. Consider ${money(Math.max(price, Math.round(med) - 0.01))} or more; leave room for launch and seasonal discounts.`
          : "You're well above the genre median. Make sure the page shows why (content, scope, polish) or test a lower price.",
        { weight: 1, score: sc }));
    }
  }

  // --- Languages ---------------------------------------------------------------------------
  {
    const count = langs.length;
    const med = b.medianLanguages;
    if (!n || med == null) {
      checks.push(makeCheck("languages-coverage", count >= 5 ? "pass" : "warn", `You support ${plural(count, "language")}. No comparable data.`, "Localise the store page first; it's cheaper than the game.", { weight: 0 }));
    } else {
      const st = count >= med ? "pass" : count >= med * 0.5 ? "warn" : "fail";
      checks.push(makeCheck("languages-coverage", st,
        `Comparable games median ${Math.round(med)} languages; you support ${count}.`,
        st === "pass" ? "Coverage matches the genre." : "Start by localising the store page (description, capsule text, trailer captions) into the missing big languages below, then the game's UI text.",
        { weight: 1, score: clamp01(count / med) }));
    }
    const missingMarkets = [];
    if (n) {
      for (const k of KEY_LANGUAGES) {
        if (hasLanguage(langs, k)) continue;
        const c = comps.filter((cg) => hasLanguage(normalizeLanguages(cg.languages), k)).length;
        if (c / n >= 0.5) missingMarkets.push({ ...k, count: c });
      }
    }
    if (n) {
      const zh = missingMarkets.find((m) => m.name === "Simplified Chinese");
      const st = zh || missingMarkets.length >= 3 ? "fail" : missingMarkets.length ? "warn" : "pass";
      const lines = missingMarkets.slice(0, 4).map((m) => `${outOf(m.count, n)} comparable games support ${m.name}; you don't.${m.fact ? ` ${m.fact}` : ""}`);
      checks.push(makeCheck("languages-markets", st,
        lines.length ? lines.join(" ") : `You cover every big language that at least half of the ${n} comparable games support.`,
        lines.length ? `Prioritise ${missingMarkets.slice(0, 3).map((m) => m.name).join(", ")}. Translate the store page first, then check regional wishlists in Steamworks to see where it pays to localise the game.` : "Nothing to add.",
        { weight: 1.5, score: clamp01(1 - (zh ? 0.6 : 0) - missingMarkets.filter((m) => m !== zh).length * 0.2) }));
    }
  }

  // --- Social proof ------------------------------------------------------------------------
  {
    const total = num(g.reviews?.total);
    const pct = num(g.reviews?.positivePct);
    if (released) {
      const med = b.medianReviews;
      if (total == null) {
        checks.push(makeCheck("reviews-count", "warn", "Review count unknown.", "Check the store page's review summary.", { weight: 0 }));
      } else {
        const r = ratioScore(total, med) ?? (total >= 50 ? 1 : 0.5);
        const st = total < 10 ? "fail" : r >= 0.7 ? "pass" : r >= 0.35 ? "warn" : "fail";
        checks.push(makeCheck("reviews-count", st,
          `You have ${fmtInt(total)} reviews${med != null ? `; comparable games median ${fmtInt(med)}` : ""}.${total < 10 ? " Steam shows no review score below 10 reviews." : total < 50 ? " \"Very Positive\" needs at least 50 reviews." : ""}`,
          total < 50 ? "Ask players for reviews in-game (a gentle end-of-session prompt), in patch notes and on Discord; send keys to creators in your genre." : "Keep the reviews coming with updates; reply to negative reviews that report fixable issues.",
          { weight: 1, score: total < 10 ? 0 : r }));
      }
      if (pct != null && total != null && total >= 10) {
        const st = pct >= 80 ? "pass" : pct >= 70 ? "warn" : "fail";
        const medPct = b.medianPositivePct;
        checks.push(makeCheck("reviews-positive", st,
          `${Math.round(pct)}% positive${g.reviews?.scoreDesc ? ` (${g.reviews.scoreDesc})` : ""}${medPct != null ? `; comparable games median ${Math.round(medPct)}%` : ""}.`,
          st === "pass" ? "Strong score: mention it in announcements, not in the capsule art (Valve bans review scores there)." : "Read the negative reviews for repeated complaints and fix or address them in an update; the score is weighted to recent momentum on the page.",
          { weight: 1, score: pct >= 80 ? 1 : pct >= 70 ? 0.6 : pct >= 40 ? 0.25 : 0 }));
      }
    }
    const followers = num(g.followers);
    if (released && followers != null) {
      const med = b.medianFollowers;
      const r = ratioScore(followers, med);
      if (r == null) {
        checks.push(makeCheck("followers", "warn", `${fmtInt(followers)} followers. No comparable data.`, "Post regular updates and events; followers get notified.", { weight: 0 }));
      } else {
        const st = r >= 0.7 ? "pass" : r >= 0.35 ? "warn" : "fail";
        checks.push(makeCheck("followers", st,
          `${fmtInt(followers)} followers; comparable games median ${fmtInt(med)}.`,
          "Followers get update notifications: post regular updates and events to keep them engaged.",
          { weight: 0.7, score: r }));
      }
    } else if (!released) {
      // Pre-launch: no reviews yet, so wishlists are the social proof. Never a fail: it's early.
      const peers = comps.filter((c) => c.comingSoon && num(c.followers) != null);
      if (followers != null) {
        const est = `roughly ${fmtInt(followers * 10)}-${fmtInt(followers * 12)} wishlists (unreleased games median 10-12x followers, GameDiscoverCo)`;
        const peerMed = peers.length >= 3 ? median(peers.map((c) => c.followers)) : null;
        const r = peerMed != null ? ratioScore(followers, peerMed) : null;
        const st = r == null ? "pass" : r >= 0.7 ? "pass" : "warn";
        checks.push(makeCheck("wishlist-readiness", st,
          `${fmtInt(followers)} followers suggests ${est}.${peerMed != null ? ` Upcoming comparable games median ${fmtInt(peerMed)} followers.` : ""}`,
          "Grow wishlists before launch: release a demo, enter Steam festivals and Next Fest, and get creators in your genre to play it. Check the real count in Steamworks' wishlist reports.",
          { weight: r == null ? 0 : 0.7, score: r == null ? null : Math.max(0.5, r) }));
      } else {
        checks.push(makeCheck("wishlist-readiness", "warn",
          g.manual ? "Pre-launch: no Steam page yet, so no wishlists or followers to measure." : "Pre-launch: follower count unknown, so wishlist momentum can't be estimated.",
          "Wishlists are your social proof before launch. Once the page is live, watch Steamworks' wishlist reports weekly and push them with a demo, festivals and creator coverage.",
          { manual: true }));
      }
    }
  }

  // --- Timing ------------------------------------------------------------------------------
  {
    const demoComps = b.demoShare != null && n ? ` ${Math.round(b.demoShare * 100)}% of comparable games have a demo.` : "";
    if (!released) {
      const relDate = parseReleaseDate(g.releaseDate);
      const daysToRelease = now && relDate ? Math.round((relDate.getTime() - now.getTime()) / DAY) : null;
      if (g.manual) {
        const urgent = daysToRelease != null && daysToRelease < 60;
        checks.push(makeCheck("page-live", urgent ? "fail" : "warn",
          `No Steam page yet, so you are not collecting wishlists.${daysToRelease != null ? ` Your release date is ${daysToRelease} days away.` : ""}`,
          "Submit a Coming Soon page for review at least 7 business days before you want it public; it must be live at least 2 weeks before release, and every week it's live earlier collects more wishlists. Go live as soon as you have a strong trailer, 5+ screenshots and a sharp short description.",
          { weight: 1.5, score: urgent ? 0 : 0.4 }));
      } else {
        const tooLate = daysToRelease != null && daysToRelease < 14;
        checks.push(makeCheck("page-live", tooLate ? "warn" : "pass",
          `Your Coming Soon page is live${daysToRelease != null ? ` and your release date is ${daysToRelease} days away` : ""}.${tooLate ? " Steam requires the page to be live for at least 2 weeks before release." : ""}`,
          tooLate ? "Check in Steamworks that the page has been public for 2+ weeks, or move the release date." : "Keep the page fresh with announcements; every event post notifies followers.",
          { weight: 1 }));
      }
      if (g.hasDemo === true) {
        checks.push(makeCheck("timing-demo", "pass", "You have a demo." + demoComps, "Keep it updated; it's your best wishlist driver before launch.", { weight: 1 }));
      } else {
        checks.push(makeCheck("timing-demo", "warn", (g.hasDemo === false ? "No demo yet." : "Demo status unknown.") + " Steam Next Fest requires a publicly playable demo." + demoComps,
          "Ship a short, polished demo well before your Next Fest, so you go in with wishlists and feedback instead of debuting there.", { weight: 1, score: g.hasDemo === false ? 0.3 : 0.5 }));
      }
      const fest = now ? NEXT_FESTS.map((f) => ({ ...f, s: toDate(f.start), e: toDate(f.end) })).find((f) => f.e && f.e.getTime() >= now.getTime()) : null;
      const rel = relDate;
      if (!now) {
        checks.push(makeCheck("timing-next-fest", "warn",
          "Each game can do only one Steam Next Fest; Zukowski advises the last one before launch.",
          "Pick the last Next Fest before your launch. Submit the demo for review 3+ weeks before it, and release it about 10 days early if you want press to play it.",
          { manual: true }));
      } else if (!fest) {
        checks.push(makeCheck("timing-next-fest", "warn", "Page Doctor doesn't know the dates of the next Next Fest yet.", "Check Steamworks' upcoming events page and register early.", { manual: true }));
      } else {
        const days = Math.round((fest.s.getTime() - now.getTime()) / DAY);
        const submitBy = new Date(fest.s.getTime() - 21 * DAY);
        const pressBy = new Date(fest.s.getTime() - 10 * DAY);
        const when = days > 0 ? `starts ${fest.start} (in ${days} days)` : `is running until ${fest.end}`;
        if (rel && rel.getTime() < fest.s.getTime()) {
          checks.push(makeCheck("timing-next-fest", "warn",
            `${fest.name} ${when}, but your release date (${g.releaseDate}) is before it.`,
            "If you haven't done a Next Fest yet, consider whether moving launch after it is worth the extra wishlists. A game can only take part once.",
            { weight: 0.5 }));
        } else {
          const monthsAfter = rel ? Math.round((rel.getTime() - fest.e.getTime()) / (30.4 * DAY)) : null;
          const later = monthsAfter != null && monthsAfter > 5 ? ` Your launch is about ${monthsAfter} months after it; Valve usually runs Next Fest in February, June and October, so a later one may be your last before launch.` : "";
          checks.push(makeCheck("timing-next-fest", g.hasDemo ? "pass" : "warn",
            `${fest.name} ${when}. To enter it, submit your demo for review by ${fmtDate(submitBy)} and release it by ${fmtDate(pressBy)} for the Press Preview.${later}`,
            "Register in Steamworks, have the store page public, and line up creators to play the demo during the Fest. You get one Next Fest per game: make it the last one before launch.",
            { weight: 0.5, score: g.hasDemo ? 1 : 0.5 }));
        }
      }
    } else if (b.demoShare != null && b.demoShare >= 0.5 && g.hasDemo === false) {
      checks.push(makeCheck("timing-demo", "warn", `No demo.${demoComps}`, "A demo can still help after launch: players try it, then wishlist or buy.", { weight: 0.5 }));
    }
  }

  // --- Score -------------------------------------------------------------------------------
  const areas = {};
  for (const [area, w] of Object.entries(AREA_WEIGHTS)) {
    const scored = checks.filter((c) => c.area === area && c.weight > 0 && c.score != null);
    const sw = scored.reduce((s, c) => s + c.weight, 0);
    areas[area] = { weight: w, score: sw ? Math.round((100 * scored.reduce((s, c) => s + c.weight * c.score, 0)) / sw) : null, checks: scored.length };
  }
  const live = Object.values(areas).filter((a) => a.score != null);
  const totalW = live.reduce((s, a) => s + a.weight, 0);
  const score = totalW ? Math.round(live.reduce((s, a) => s + a.weight * a.score, 0) / totalW) : 0;
  const grade = gradeFor(score);

  const diagnosis = {
    score,
    grade,
    areas,
    formula: "score = sum(areaWeight x areaScore) / sum(areaWeight), over areas with at least one scored check. areaScore = weighted mean of its checks (pass 1, warn 0.5, fail 0, or a graded value). Manual checks are not scored.",
    checks,
    tagSuggestions,
    benchmarks: b,
    comparables: comps.slice(0, 20).map((c) => {
      const entry = compEntries.find((e) => e.game === c);
      return {
        appid: c.appid ?? null, name: str(c.name), url: str(c.url),
        similarity: entry?.similarity ?? null, scaleFit: entry?.scaleFit ?? null, sharedTags: entry?.sharedTags ?? [],
        tier: scaleTier(c), reviews: num(c.reviews?.total), positivePct: num(c.reviews?.positivePct),
        followers: num(c.followers), ownersRange: c.ownersRange ?? null, priceUSD: num(c.priceUSD), comingSoon: !!c.comingSoon,
      };
    }),
    prelaunch: !released,
    manual: g.manual,
    rewritePrompt: "",
  };
  diagnosis.rewritePrompt = buildRewritePrompt(g, diagnosis, comps);
  return diagnosis;
}

export function gradeFor(score) {
  for (const [g, min] of GRADE_BANDS) if (score >= min) return g;
  return "F";
}

/** Convenience: comparables + diagnosis in one call. */
export function audit(game, corpus, { limit = 20, now } = {}) {
  const comparables = findComparables(game, corpus, { limit });
  return { comparables, diagnosis: diagnose(game, comparables, { now }) };
}

// ---------------------------------------------------------------------------------------------
// Rewrite prompt
// ---------------------------------------------------------------------------------------------
const ABOUT_MAX = 6000;

const COPY_RULES = [
  `The short description is plain text, at most ${SHORT_DESC_MAX} characters including spaces. Count them.`,
  "Sentence 1 states the genre in words a fan of the genre would search for (use the game's own top genre tags) and the player fantasy: who the player is and what they do.",
  "Sentence 2 says what is different about this game compared with others in its genre: the hook.",
  "Use specific verbs for the core loop (build, parry, draft, route, brew...). Avoid generic lines that could describe any game: \"battle evil\", \"save the world\", \"epic adventure\", \"unique experience\", \"like never before\".",
  "No time-based text or calls to action: no dates, \"coming soon\", \"out now\", \"wishlist now\", no awards or review quotes.",
  "Only use facts that are in the current copy or the game facts below. Never invent features, modes, numbers, platforms, awards or quotes. If a good line needs a fact you don't have, write it with a [placeholder] and list it at the end.",
  "The comparable games show the genre's conventions and vocabulary. Don't copy their sentences or name them in the copy.",
  "Write for skimmers: short sentences, concrete nouns, no marketing filler. Keep the game's own tone (funny, dark, cosy...).",
];

const OUTPUT_FORMAT = [
  "1. **What's not working**: 3 bullets on the current short description, each tied to a rule.",
  `2. **Short description options**: 5 options, each at most ${SHORT_DESC_MAX} characters, each followed by its character count in brackets. Use a different angle for each: (a) genre + fantasy, (b) hook first, (c) the core loop in verbs, (d) the stakes or story, (e) tone and personality.`,
  "3. **Pick**: which option you recommend and why, in 2 sentences.",
  "4. **About This Game opening**: a 2-sentence pitch paragraph, then 4-6 feature bullets that each start with a concrete verb and name a real feature from the current copy.",
  "5. **Top 5 tags**: the 5 tags you'd put first, chosen only from the candidate tags given, most specific genre tag first, with one line on why.",
  "6. **Placeholders**: every [placeholder] you used and the fact the developer needs to fill in. Write \"none\" if there are none.",
];

function factsBlock(game, diagnosis) {
  const tags = toTags(game.tags).map((t) => t.name);
  const lines = [
    `Name: ${str(game.name) || "(unknown)"}`,
    `Genres: ${arr(game.genres).join(", ") || "(none listed)"}`,
    `Current tags in order: ${tags.join(", ") || "(none)"}`,
    `Status: ${game.comingSoon ? `coming soon${game.releaseDate ? ` (release: ${game.releaseDate})` : ""}` : `released${game.releaseDate ? ` ${game.releaseDate}` : ""}`}${game.earlyAccess ? ", Early Access" : ""}`,
    `Price: ${game.isFree ? "free" : num(game.priceUSD) != null ? money(game.priceUSD) : "not set"}`,
    `Developer: ${arr(game.developers).join(", ") || "(unknown)"}`,
  ];
  const reviews = game.reviews && num(game.reviews.total) != null ? `${fmtInt(game.reviews.total)} reviews${num(game.reviews.positivePct) != null ? `, ${Math.round(game.reviews.positivePct)}% positive` : ""}` : null;
  if (reviews) lines.push(`Reviews: ${reviews}`);
  const cand = diagnosis?.tagSuggestions ? [...new Set([...(diagnosis.tagSuggestions.reorder || []), ...(diagnosis.tagSuggestions.add || []).map((a) => a.tag)])] : tags;
  lines.push(`Candidate tags for the top 5: ${cand.join(", ") || "(none)"}`);
  const med = diagnosis?.benchmarks?.medianDescLength;
  if (med != null) lines.push(`Comparable games' short descriptions: median ${Math.round(med)} characters`);
  return lines.join("\n");
}

function currentCopyBlock(game) {
  const short = stripHtml(game.shortDescription);
  let about = stripHtml(game.aboutText);
  let note = "";
  if (about.length > ABOUT_MAX) {
    note = ` truncated="true" original_chars="${about.length}"`;
    about = about.slice(0, ABOUT_MAX) + " [...]";
  }
  return `<short_description chars="${short.length}">\n${short || "(empty)"}\n</short_description>\n<about_this_game${note}>\n${about || "(empty)"}\n</about_this_game>`;
}

function comparablesBlock(comps) {
  // Examples: comparables with real copy (60+ chars), duplicates removed, released games with reviews first
  // (their copy has met real shoppers), keeping relevance order within each group.
  const seen = new Set();
  const withCopy = comps.filter((c) => {
    const t = stripHtml(c.shortDescription);
    const key = t.toLowerCase().split(str(c.name).toLowerCase()).join("").replace(/\s+/g, " ");
    if (t.length < 60 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const proven = withCopy.filter((c) => !c.comingSoon && (num(c.reviews?.total) ?? 0) >= 10);
  const list = [...proven, ...withCopy.filter((c) => !proven.includes(c))].slice(0, 8);
  if (!list.length) return "(no comparable games available)";
  return list.map((c) => {
    const r = c.reviews && num(c.reviews.total) != null ? `${fmtInt(c.reviews.total)} reviews${num(c.reviews.positivePct) != null ? `, ${Math.round(c.reviews.positivePct)}% positive` : ""}` : "reviews n/a";
    const t = toTags(c.tags).slice(0, 5).map((x) => x.name).join(", ");
    return `<game name="${str(c.name).replace(/"/g, "'")}" top_tags="${t}" reviews="${r}">\n${stripHtml(c.shortDescription)}\n</game>`;
  }).join("\n");
}

function findingsBlock(diagnosis) {
  const rel = (diagnosis?.checks || []).filter((c) => ["description", "tags"].includes(c.area) && c.status !== "pass" && !c.manual);
  if (!rel.length) return "(the audit found no problems with the copy or tags; aim to sharpen, not overhaul)";
  return rel.map((c) => `- [${c.status}] ${c.title}: ${c.detail}`).join("\n");
}

const ROLE = "You are a senior Steam store-page copywriter who specialises in indie games. You know how Steam shoppers behave: they glance at the capsule, skim the short description for genre words, look at the first screenshots, and decide in seconds whether to wishlist.";

function buildRewritePrompt(game, diagnosis, comps) {
  const name = str(game.name) || "this game";
  return [
    ROLE,
    "",
    `<task>\nRewrite the Steam short description and the opening of "About This Game" for ${name}, so a shopper who skims for five seconds knows the genre, the player fantasy and the hook, and wishlists it.\n</task>`,
    "",
    `<rules>\n${COPY_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n</rules>`,
    "",
    `<game_facts>\n${factsBlock(game, diagnosis)}\n</game_facts>`,
    "",
    `<current_copy>\n${currentCopyBlock(game)}\n</current_copy>`,
    "",
    `<comparable_games note="Games with similar tags, released and reviewed ones first. Their short descriptions show the genre's conventions.">\n${comparablesBlock(comps)}\n</comparable_games>`,
    "",
    `<audit_findings>\n${findingsBlock(diagnosis)}\n</audit_findings>`,
    "",
    `<output_format>\nAnswer in this order, using these headings:\n${OUTPUT_FORMAT.join("\n")}\nWrite the copy in the same language as the current copy.\nBefore you answer, count the characters of every short-description option and rewrite any that go over ${SHORT_DESC_MAX}.\n</output_format>`,
  ].join("\n");
}

/**
 * Request body pieces for an optional Anthropic Messages API call (the UI does the HTTP).
 * Returns { system, user, model, max_tokens }.
 */
export function rewriteRequest(game, diagnosis) {
  const g = normalizeGame(game);
  const d = diagnosis && typeof diagnosis === "object" ? diagnosis : diagnose(g, []);
  const system = [
    ROLE,
    "",
    `<rules>\n${COPY_RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n</rules>`,
    "",
    `<output_format>\nAnswer in this order, using these headings:\n${OUTPUT_FORMAT.join("\n")}\nWrite the copy in the same language as the current copy. Use Markdown headings and lists only; no preamble.\nBefore you answer, count the characters of every short-description option and rewrite any that go over ${SHORT_DESC_MAX}.\n</output_format>`,
  ].join("\n");
  // Reuse the comparable block that diagnose() embedded in rewritePrompt.
  const compMatch = str(d.rewritePrompt).match(/<comparable_games[\s\S]*?<\/comparable_games>/);
  const user = [
    `Rewrite the Steam short description and the opening of "About This Game" for ${str(g.name) || "this game"}.`,
    "",
    `<game_facts>\n${factsBlock(g, d)}\n</game_facts>`,
    "",
    `<current_copy>\n${currentCopyBlock(g)}\n</current_copy>`,
    "",
    compMatch ? compMatch[0] : "<comparable_games>\n(no comparable games available)\n</comparable_games>",
    "",
    `<audit_findings>\n${findingsBlock(d)}\n</audit_findings>`,
  ].join("\n");
  return { system, user, model: DEFAULT_MODEL, max_tokens: 4000 };
}
