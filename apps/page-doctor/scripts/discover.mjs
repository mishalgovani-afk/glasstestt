// Candidate discovery through Steam store search (rows carry release date, review summary, tag ids and price in one request).
import { numEnv, getJson, warn, log } from "./lib.mjs";
import { parseSearchRows, parseSpyTagList, isRecent, pickEvenly } from "./parsers.mjs";
import { storeBase, spyBase } from "./game-fetch.mjs";

export const INDIE_TAG_ID = 492;

/**
 * Page through Steam search. `tag` may be null (all indie games) or {id}. `filter` e.g. "popularcomingsoon".
 * Paging follows the number of rows actually returned (Steam may return fewer than `count`).
 */
export async function searchPages(tag, { filter = "", sort = "Reviews_DESC", maxPages, enough = () => false, outOfTime = () => false, tagIds = null, category = 998 }, steam) {
  const rows = [];
  const seen = new Set();
  let start = 0;
  const tags = tagIds || (tag ? `${INDIE_TAG_ID},${tag.id}` : String(INDIE_TAG_ID));
  for (let page = 0; page < maxPages && !outOfTime(); page++) {
    const url = `${storeBase()}/search/results/?query=&start=${start}&count=100&dynamic_data=&sort_by=${sort}${filter ? `&filter=${filter}` : ""}&tags=${encodeURIComponent(tags)}&category1=${category}&infinite=1&json=1&cc=us&l=english&ndl=1`;
    const json = await getJson(url, steam);
    const got = parseSearchRows(json?.results_html);
    if (!got.length) break;
    for (const r of got) if (!seen.has(r.appid)) { seen.add(r.appid); rows.push(r); }
    start += got.length;
    const total = Number(json?.total_count);
    if ((Number.isFinite(total) && start >= total) || enough(rows)) break;
  }
  return rows;
}

/**
 * Discover upcoming / mid / hit candidates for one tag (about 30% extra candidates, because some get rejected later).
 * Returns { hit, mid, upcoming, rows } where rows are ALL search rows seen (they feed the catalog for free).
 */
export async function discoverTag(tag, opts, quotas, steam, spyT, now, outOfTime) {
  const midMin = numEnv("MID_MIN_REVIEWS", 30), midMax = numEnv("MID_MAX_REVIEWS", 5000);
  const over = (n) => Math.ceil(n * 1.3) + 1;
  const shape = (r) => ({ appid: r.appid, name: r.name, row: r });
  const recentRows = (rows) => rows.filter((r) => isRecent(r.releaseIso, opts.years, now) && (r.reviewTotal ?? 0) >= 10);
  const inMid = (r) => r.reviewTotal >= midMin && r.reviewTotal <= midMax;
  const seenRows = [];

  let searchErr = null;
  let rows = [];
  try {
    const all = await searchPages(tag, {
      maxPages: opts.maxPages, outOfTime,
      enough: (got) => { const rec = recentRows(got); return rec.length >= over(quotas.hit) && rec.filter(inMid).length >= over(quotas.mid) * 2; },
    }, steam);
    seenRows.push(...all);
    rows = recentRows(all);
  } catch (e) { searchErr = e; warn(`hit/mid search failed for ${tag.name}: ${e.message}`); }
  const hit = rows.slice(0, over(quotas.hit)).map(shape);
  const hitIds = new Set(hit.map((x) => x.appid));
  let mid = pickEvenly(rows.filter((r) => !hitIds.has(r.appid) && inMid(r)), over(quotas.mid)).map(shape);
  if (mid.length < over(quotas.mid) && !opts.noSpy) {
    try {
      const minAppid = numEnv("MIN_APPID", 1_600_000);
      const have = new Set([...hitIds, ...mid.map((x) => x.appid)]);
      const pool = parseSpyTagList(await getJson(`${spyBase()}/api.php?request=tag&tag=${encodeURIComponent(tag.name)}`, spyT))
        .filter((e) => e.appid >= minAppid && !have.has(e.appid) && e.totalReviews != null && e.totalReviews >= midMin && e.totalReviews <= midMax);
      const extra = pickEvenly(pool, over(quotas.mid) * 2 - mid.length).map((e) => ({ appid: e.appid, name: e.name || "", row: null }));
      mid = mid.concat(extra);
      log(`  ${tag.name}: SteamSpy tag list added ${extra.length} mid-size candidates (pool ${pool.length})`);
    } catch (e) {
      warn(`SteamSpy tag list failed for ${tag.name}: ${e.message}`);
    }
  }

  // upcoming: popular "coming soon" titles for the tag (fallback: all coming soon)
  const upcoming = [];
  const want = over(quotas.upcoming);
  for (const filter of ["popularcomingsoon", "comingsoon"]) {
    if (upcoming.length >= want || quotas.upcoming === 0) break;
    try {
      const ups = await searchPages(tag, { filter, sort: "Released_DESC", maxPages: 2, outOfTime, enough: (all) => all.length >= want * 2 }, steam);
      seenRows.push(...ups);
      const have = new Set([...hitIds, ...upcoming.map((x) => x.appid)]);
      for (const r of ups) {
        if (have.has(r.appid)) continue;
        if (r.releaseIso && new Date(r.releaseIso + "T00:00:00Z") < new Date(now.getTime() - 30 * 86400000)) continue; // released a while ago
        upcoming.push(shape(r));
        have.add(r.appid);
        if (upcoming.length >= want) break;
      }
    } catch (e) {
      warn(`upcoming search (${filter}) failed for ${tag.name}: ${e.message}`);
    }
  }
  if (searchErr && !hit.length && !mid.length && !upcoming.length) throw searchErr;
  return { hit, mid, upcoming, rows: seenRows };
}
