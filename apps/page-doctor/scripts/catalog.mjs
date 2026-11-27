// The catalog: a big, cheap list of Steam games (name, tags, price, date, reviews) so the apps can recognise almost any title.
// Entries use short keys (see CATALOG_KEYS in parsers.mjs). Built from search rows (no per-game requests).
import { warn, log } from "./lib.mjs";
import { catalogEntryFromRow, catalogEntryFromGame, CATALOG_KEYS } from "./parsers.mjs";
import { searchPages } from "./discover.mjs";
import { validateCatalog } from "./validate.mjs";

/** Wrap entries in the file format. */
export function catalogFile(entries, { source = "live", generatedAt = new Date().toISOString() } = {}) {
  return { generatedAt, source, format: 2, keys: CATALOG_KEYS, games: [...entries].sort((x, y) => x.a - y.a) };
}

/**
 * Indie-first crawl: popular upcoming, long tail by tag (newest first), recent indie releases, then the most-reviewed indies.
 * Adds to `entries` (Map appid -> entry); stops at `maxEntries`, `until` (timestamp) or when outOfTime() says so.
 */
export async function crawlCatalog({ steam, tagDefs, idToName, entries, maxEntries, until, outOfTime, now = new Date(), pages = {} }) {
  const P = { upcoming: 15, perTag: 1, recent: 60, reviews: 40, ...pages };
  const stopped = () => outOfTime() || Date.now() > until || entries.size >= maxEntries;
  const add = (rows) => { let n = 0; for (const r of rows) { const e = catalogEntryFromRow(r, idToName, now); if (e && !entries.has(e.a)) { entries.set(e.a, e); n++; } } return n; };
  const pass = async (label, fn) => {
    if (stopped()) return;
    try { const n = await fn(); log(`catalog pass ${label}: +${n} (total ${entries.size})`); } catch (e) { warn(`catalog pass ${label} failed: ${e.message}`); }
  };
  await pass("upcoming indies", async () => add(await searchPages(null, { filter: "popularcomingsoon", sort: "Released_DESC", maxPages: P.upcoming, outOfTime: stopped }, steam)));
  await pass("long tail by tag", async () => {
    let n = 0;
    for (const t of tagDefs) { if (stopped()) break; try { n += add(await searchPages(t, { sort: "Released_DESC", maxPages: P.perTag, outOfTime: stopped }, steam)); } catch (e) { warn(`catalog tag ${t.name}: ${e.message}`); } }
    return n;
  });
  await pass("recent indie releases", async () => add(await searchPages(null, { sort: "Released_DESC", maxPages: P.recent, outOfTime: stopped }, steam)));
  await pass("most-reviewed indies", async () => add(await searchPages(null, { sort: "Reviews_DESC", maxPages: P.reviews, outOfTime: stopped }, steam)));
  return entries;
}

/** Merge corpus games into the entries (their data is richer: tags by votes, exact price and date). */
export function addGamesToCatalog(entries, games) {
  for (const g of games) entries.set(g.appid, catalogEntryFromGame(g));
  return entries;
}

/** Keep at most `max` entries: drop the ones not seen in this run first, then the least-reviewed. */
export function trimCatalog(entries, max, freshIds = new Set(), keepIds = new Set()) {
  if (entries.size <= max) return entries;
  const rank = (e) => (keepIds.has(e.a) ? 3 : freshIds.has(e.a) ? 2 : 1) * 1e12 + (e.u ? 5e8 : 0) + (e.r?.[0] ?? 0);
  const keep = [...entries.values()].sort((x, y) => rank(y) - rank(x) || x.a - y.a).slice(0, max);
  return new Map(keep.map((e) => [e.a, e]));
}

export function checkCatalog(file, minGames = 1) {
  const errs = validateCatalog(file, { minGames });
  return errs;
}
