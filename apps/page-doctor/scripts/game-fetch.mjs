// Fetches ONE game's full corpus entry (store details + SteamSpy tags/owners + followers + reviews) with per-host rate limits.
// Shared by fetch-steam.mjs (bulk, incremental) and add-game.mjs (fast track).
import { getJson, getText, warn } from "./lib.mjs";
import { parseStoreDetails, unwrapAppDetails, parseSpy, parseAppReviews, parseStorePageTags, parseMemberCount, buildGame, isRecent } from "./parsers.mjs";
import { validateCorpus } from "./validate.mjs";

export const storeBase = () => process.env.STEAM_STORE_BASE || "https://store.steampowered.com";
export const spyBase = () => process.env.STEAMSPY_BASE || "https://steamspy.com";
export const communityBase = () => process.env.STEAM_COMMUNITY_BASE || "https://steamcommunity.com";
const AGE_COOKIE = "birthtime=568022401; lastagecheckage=1-0-1988; wants_mature_content=1";

/**
 * ctx: { steam, spyT, comT, idToName: Map<tagId,name>, noSpy, years, now }
 * item: { appid, mode: "watch"|"candidate"|"refresh", row?, memberships?: [{tag,bucket}] }
 *   watch / refresh: any type or date is accepted. candidate: must be a recent release (or upcoming when it came from an upcoming list).
 * fetchGame(item) -> { game } | { skip: "noStore"|"notRecent"|"comingSoon"|"invalid"|"error", gone?: true }
 */
export function makeGameFetcher(ctx) {
  const st = { spyFails: 0, spyDead: !!ctx.noSpy, comFails: 0, comDead: false, storePageFetches: 0, reviewApiCalls: 0 };
  const now = ctx.now || new Date();

  async function fetchStore(item) {
    const json = await getJson(`${storeBase()}/api/appdetails?appids=${item.appid}&cc=us&l=en`, ctx.steam, { treat403AsLimit: true });
    const entry = json?.[String(item.appid)];
    const gone = !!entry && entry.success === false;
    const store = parseStoreDetails(unwrapAppDetails(json, item.appid), { allowAnyType: item.mode !== "candidate" });
    return { store, gone };
  }
  async function fetchSpy(appid) {
    return parseSpy(await getJson(`${spyBase()}/api.php?request=appdetails&appid=${appid}`, ctx.spyT));
  }
  async function fetchFollowers(appid) {
    const { status, text } = await getText(`${communityBase()}/games/${appid}/memberslistxml/?xml=1`, ctx.comT, { retries: 0 });
    if (status >= 400) throw new Error(`HTTP ${status}`);
    return parseMemberCount(text);
  }

  async function fetchGame(item) {
    const memberships = item.memberships || [];
    const wantsUpcoming = memberships.some((m) => m.bucket === "upcoming");
    try {
      const [storeRes, spy, followers] = await Promise.all([
        fetchStore(item),
        st.spyDead ? null : fetchSpy(item.appid).then((r) => { st.spyFails = 0; return r; }, (e) => {
          if (++st.spyFails >= 8 && !st.spyDead) { st.spyDead = true; warn(`SteamSpy failed ${st.spyFails} times in a row (${e.message}); disabling it for this run`); }
          return null;
        }),
        st.comDead ? null : fetchFollowers(item.appid).then((r) => { st.comFails = 0; return r; }, (e) => {
          // never stall on this host: a 429/403 switches followers off for the whole run at once
          if (!st.comDead && (/HTTP (429|403)/.test(e.message) || ++st.comFails >= 8)) { st.comDead = true; warn(`Steam community unavailable (${e.message}); followers disabled for this run`); }
          return null;
        }),
      ]);
      const store = storeRes.store;
      if (!store) return { skip: "noStore", gone: storeRes.gone };
      if (item.mode === "candidate") {
        if (store.comingSoon && !wantsUpcoming) return { skip: "comingSoon" };
        if (!store.comingSoon && !isRecent(store.releaseIso, ctx.years ?? 3, now)) return { skip: "notRecent" };
      }
      const row = item.row || null;
      let reviews = null;
      const haveNumbers = (row && row.reviewTotal != null) || (spy && spy.totalReviews != null);
      if ((item.mode === "watch" || !haveNumbers) && !store.comingSoon) {
        try {
          reviews = parseAppReviews(await getJson(`${storeBase()}/appreviews/${item.appid}?json=1&num_per_page=0&purchase_type=all&language=all`, ctx.steam));
          st.reviewApiCalls++;
        } catch (e) { warn(`appreviews ${item.appid}: ${e.message}`); }
      }
      // tags: SteamSpy votes first; then the tag ids on the search row; the store page only as a last resort
      const rowTagNames = (row?.tagIds || []).map((id) => ctx.idToName.get(id)).filter(Boolean);
      let storeTags = [];
      if (!(spy && spy.tags.length) && (st.spyDead || item.mode === "watch" || rowTagNames.length < 4) && st.storePageFetches < (ctx.maxStorePageFetches ?? 200)) {
        try {
          st.storePageFetches++;
          const { text } = await getText(`${storeBase()}/app/${item.appid}/?l=english&cc=us`, ctx.steam, { headers: { Cookie: AGE_COOKIE } });
          storeTags = parseStorePageTags(text);
        } catch (e) { warn(`store page tags ${item.appid}: ${e.message}`); }
      }
      const fallbackTags = [...new Set([...rowTagNames, ...memberships.map((m) => m.tag)])];
      const game = buildGame({ store, spy, row, reviews, storeTags, fallbackTags, followers, fetchedAt: new Date().toISOString() });
      game.aboutText = game.aboutText.slice(0, 5000);
      game.screenshots = game.screenshots.filter((u) => u.startsWith("https://"));
      const bad = validateCorpus({ generatedAt: now.toISOString(), source: "live", games: [game], tagIndex: {} });
      if (bad.length) { warn(`dropping ${item.appid} (${game.name}): ${bad[0]}`); return { skip: "invalid" }; }
      return { game };
    } catch (e) {
      warn(`game ${item.appid} failed: ${e.message}`);
      return { skip: "error" };
    }
  }
  return { fetchGame, state: st };
}
