// Schema check for data/corpus.json (see CONTRACT.md). Returns a list of human-readable problems ([] = valid).
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v) => v === null || isNum(v);
const strArr = (v) => Array.isArray(v) && v.every(isStr);
const httpsUrl = (v) => isStr(v) && v.startsWith("https://");

export function validateCorpus(c, { minGames = 1 } = {}) {
  const errs = [];
  const err = (m) => errs.length < 60 && errs.push(m);
  if (!c || typeof c !== "object") return ["corpus is not an object"];
  if (!isStr(c.generatedAt) || Number.isNaN(Date.parse(c.generatedAt))) err("generatedAt must be an ISO date string");
  if (c.source !== "live" && c.source !== "sample") err('source must be "live" or "sample"');
  if (!Array.isArray(c.games)) return [...errs, "games must be an array"];
  if (c.games.length < minGames) err(`expected at least ${minGames} games, got ${c.games.length}`);
  const ids = new Set();
  c.games.forEach((g, i) => {
    const p = `games[${i}]${g && g.appid ? ` (appid ${g.appid})` : ""}`;
    if (!g || typeof g !== "object") return err(`${p} is not an object`);
    if (!isNum(g.appid) || g.appid <= 0) err(`${p}.appid must be a positive number`);
    if (ids.has(g.appid)) err(`${p} duplicate appid`);
    ids.add(g.appid);
    for (const k of ["name", "url", "shortDescription", "aboutText", "releaseDate"]) if (!isStr(g[k])) err(`${p}.${k} must be a string`);
    if (!g.name) err(`${p}.name is empty`);
    if (isStr(g.url) && !httpsUrl(g.url)) err(`${p}.url must be https`);
    if (!Array.isArray(g.tags) || !g.tags.every((t) => t && isStr(t.name) && t.name && isNum(t.votes))) err(`${p}.tags must be [{name, votes}]`);
    for (const k of ["genres", "developers", "publishers", "screenshots", "languages", "fullAudioLanguages"]) if (!strArr(g[k])) err(`${p}.${k} must be an array of strings`);
    if (Array.isArray(g.screenshots) && !g.screenshots.every(httpsUrl)) err(`${p}.screenshots must be https urls`);
    if (!numOrNull(g.priceUSD)) err(`${p}.priceUSD must be number|null`);
    if (typeof g.isFree !== "boolean") err(`${p}.isFree must be boolean`);
    if (typeof g.comingSoon !== "boolean") err(`${p}.comingSoon must be boolean`);
    if (typeof g.earlyAccess !== "boolean") err(`${p}.earlyAccess must be boolean`);
    if (!(g.hasDemo === null || typeof g.hasDemo === "boolean")) err(`${p}.hasDemo must be boolean|null`);
    if (!httpsUrl(g.headerImage)) err(`${p}.headerImage must be an https url`);
    if (!(g.capsuleImage === null || httpsUrl(g.capsuleImage))) err(`${p}.capsuleImage must be https url|null`);
    if (!isNum(g.movies)) err(`${p}.movies must be a number`);
    const r = g.reviews;
    if (!r || typeof r !== "object" || !numOrNull(r.total) || !numOrNull(r.positivePct) || !(r.scoreDesc === null || isStr(r.scoreDesc))) err(`${p}.reviews must be {total, positivePct, scoreDesc}`);
    if (!numOrNull(g.followers)) err(`${p}.followers must be number|null`);
    if (!(g.ownersRange === null || isStr(g.ownersRange))) err(`${p}.ownersRange must be string|null`);
    if (!numOrNull(g.ccu)) err(`${p}.ccu must be number|null`);
  });
  if (!c.tagIndex || typeof c.tagIndex !== "object" || Array.isArray(c.tagIndex)) err("tagIndex must be an object");
  else {
    for (const [tag, list] of Object.entries(c.tagIndex)) {
      if (!Array.isArray(list) || !list.every(isNum)) err(`tagIndex["${tag}"] must be an array of appids`);
      else for (const id of list) if (!ids.has(id)) err(`tagIndex["${tag}"] references appid ${id} that is not in games`);
    }
  }
  return errs;
}

/** data/catalog.json: { generatedAt, source, games: [[appid, name, "u"?], ...] } (compact: appid + name only). */
export function validateCatalog(c, { minGames = 1 } = {}) {
  const errs = [];
  if (!c || typeof c !== "object") return ["catalog is not an object"];
  if (typeof c.generatedAt !== "string" || Number.isNaN(Date.parse(c.generatedAt))) errs.push("generatedAt must be an ISO date string");
  if (c.source !== "live" && c.source !== "sample") errs.push('source must be "live" or "sample"');
  if (!Array.isArray(c.games)) return [...errs, "games must be an array"];
  if (c.games.length < minGames) errs.push(`expected at least ${minGames} entries`);
  const ids = new Set();
  for (const [i, e] of c.games.entries()) {
    if (errs.length > 20) break;
    if (!Array.isArray(e) || !Number.isFinite(e[0]) || e[0] <= 0 || typeof e[1] !== "string" || !e[1] || (e.length > 2 && e[2] !== "u")) errs.push(`games[${i}] must be [appid, name, "u"?]`);
    else if (ids.has(e[0])) errs.push(`games[${i}] duplicate appid ${e[0]}`);
    else ids.add(e[0]);
  }
  return errs;
}
