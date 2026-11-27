// Schema check for data/creators.json (see CONTRACT.md). Returns a list of problems ([] = valid).
// games[] entries may carry the optional fields reviews:{total}, comingSoon, releaseDate (same shapes as Page Doctor's corpus).
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v) => v === null || isNum(v);
const https = (v) => isStr(v) && v.startsWith("https://");
const isoOrNull = (v) => v === null || (isStr(v) && !Number.isNaN(Date.parse(v)));
const EMAIL = /[^\s@/:]+@[^\s@/]+\.[a-z]{2,}/i;
const PLATFORMS = ["youtube", "steam-curator", "twitch"];

export function validateCreators(c, { minCreators = 1 } = {}) {
  const errs = [];
  const err = (m) => errs.length < 60 && errs.push(m);
  if (!c || typeof c !== "object") return ["creators file is not an object"];
  if (!isStr(c.generatedAt) || Number.isNaN(Date.parse(c.generatedAt))) err("generatedAt must be an ISO date string");
  if (c.source !== "live" && c.source !== "sample") err('source must be "live" or "sample"');
  if (!Array.isArray(c.creators)) return [...errs, "creators must be an array"];
  if (!Array.isArray(c.games)) return [...errs, "games must be an array"];
  if (c.creators.length < minCreators) err(`expected at least ${minCreators} creators, got ${c.creators.length}`);
  const gameIds = new Set();
  c.games.forEach((g, i) => {
    const p = `games[${i}]`;
    if (!g || !isNum(g.appid) || g.appid <= 0) return err(`${p}.appid must be a positive number`);
    if (gameIds.has(g.appid)) err(`${p} duplicate appid ${g.appid}`);
    gameIds.add(g.appid);
    if (!isStr(g.name) || !g.name) err(`${p}.name must be a non-empty string`);
    if (!Array.isArray(g.tags) || !g.tags.every(isStr)) err(`${p}.tags must be an array of strings`);
    if ("reviews" in g && !(g.reviews && typeof g.reviews === "object" && numOrNull(g.reviews.total))) err(`${p}.reviews must be {total: number|null}`);
    if ("comingSoon" in g && typeof g.comingSoon !== "boolean") err(`${p}.comingSoon must be boolean`);
    if ("releaseDate" in g && !isStr(g.releaseDate)) err(`${p}.releaseDate must be a string`);
  });
  const ids = new Set();
  c.creators.forEach((cr, i) => {
    const p = `creators[${i}]${cr && cr.id ? ` (${cr.id})` : ""}`;
    if (!cr || typeof cr !== "object") return err(`${p} is not an object`);
    if (!isStr(cr.id) || !/^(youtube:UC[\w-]{22}|curator:\d+|twitch:[\w]+)$/.test(cr.id)) err(`${p}.id must look like youtube:UC…, curator:123 or twitch:login`);
    if (ids.has(cr.id)) err(`${p} duplicate id`);
    ids.add(cr.id);
    if (!PLATFORMS.includes(cr.platform)) err(`${p}.platform must be one of ${PLATFORMS.join(", ")}`);
    else if (isStr(cr.id) && !cr.id.startsWith({ youtube: "youtube:", "steam-curator": "curator:", twitch: "twitch:" }[cr.platform])) err(`${p}.id does not match its platform`);
    if (!isStr(cr.name) || !cr.name) err(`${p}.name must be a non-empty string`);
    if (!https(cr.url)) err(`${p}.url must be https`);
    if (!(cr.avatar === null || https(cr.avatar))) err(`${p}.avatar must be https url|null`);
    for (const k of ["followers", "uploadsPerMonth", "avgViews"]) if (!numOrNull(cr[k])) err(`${p}.${k} must be number|null`);
    if (!(cr.language === null || isStr(cr.language))) err(`${p}.language must be string|null`);
    if (!isoOrNull(cr.lastActive)) err(`${p}.lastActive must be ISO|null`);
    if ("fetchedAt" in cr && !(isStr(cr.fetchedAt) && !Number.isNaN(Date.parse(cr.fetchedAt)))) err(`${p}.fetchedAt must be an ISO date string`);
    if (!Array.isArray(cr.coveredGames)) err(`${p}.coveredGames must be an array`);
    else cr.coveredGames.forEach((g, j) => {
      if (!g || !isStr(g.name) || !g.name || !(g.appid === null || isNum(g.appid)) || !isoOrNull(g.date ?? null) || !isStr(g.title) || !numOrNull(g.views ?? null) || !(g.url === null || https(g.url))) err(`${p}.coveredGames[${j}] is malformed`);
      else if (g.appid != null && !gameIds.has(g.appid)) err(`${p}.coveredGames[${j}] references appid ${g.appid} missing from games[]`);
    });
    if (!cr.tagAffinity || typeof cr.tagAffinity !== "object" || Array.isArray(cr.tagAffinity) || !Object.values(cr.tagAffinity).every((w) => isNum(w) && w >= 0 && w <= 1)) err(`${p}.tagAffinity must map tag -> 0..1`);
    if (!Array.isArray(cr.links) || !cr.links.every((l) => l && isStr(l.label) && https(l.url))) err(`${p}.links must be [{label, https url}]`);
    if (JSON.stringify(cr).match(EMAIL)) err(`${p} contains something that looks like an email address`);
  });
  return errs;
}

/**
 * Make a creators file safe to write: add a games[] stub {appid, name, tags: []} for every covered appid that is missing from games[],
 * drop duplicate or invalid games, and drop (with a WARN) any creator that still fails validation. Never throws.
 * Returns { file, stubs, droppedCreators, droppedGames }.
 */
export function repairCreators(file, warn = console.warn) {
  const out = { ...file };
  const games = new Map();
  let droppedGames = 0;
  for (const g of file.games || []) {
    if (!g || !isNum(g.appid) || g.appid <= 0 || !isStr(g.name) || !g.name || games.has(g.appid)) { droppedGames++; warn(`dropping invalid or duplicate games[] entry ${JSON.stringify(g)?.slice(0, 80)}`); continue; }
    const probe = validateCreators({ generatedAt: file.generatedAt, source: file.source, creators: [], games: [g] }, { minCreators: 0 });
    if (probe.length) { droppedGames++; warn(`dropping games[] entry ${g.appid}: ${probe[0]}`); continue; }
    games.set(g.appid, g);
  }
  let stubs = 0;
  for (const c of file.creators || []) for (const cg of c?.coveredGames || []) {
    if (cg && isNum(cg.appid) && cg.appid > 0 && !games.has(cg.appid)) { games.set(cg.appid, { appid: cg.appid, name: isStr(cg.name) && cg.name ? cg.name : `App ${cg.appid}`, tags: [] }); stubs++; }
  }
  const creators = [];
  let droppedCreators = 0;
  for (const c of file.creators || []) {
    const errs = validateCreators({ generatedAt: file.generatedAt, source: file.source, creators: [c], games: [...games.values()] }, { minCreators: 0 });
    if (errs.length) { droppedCreators++; warn(`dropping creator ${c?.id}: ${errs[0]}`); continue; }
    creators.push(c);
  }
  if (stubs) warn(`added ${stubs} games[] stubs for covered games that were missing`);
  out.creators = creators;
  out.games = [...games.values()].sort((x, y) => x.appid - y.appid);
  return { file: out, stubs, droppedCreators, droppedGames };
}
