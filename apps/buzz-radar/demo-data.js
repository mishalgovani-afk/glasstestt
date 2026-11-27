// Synthetic sample data for Demo mode and tests. Deterministic for a given (game, now).
// Every url is https://example.com/demo/... - nothing here is real.

const H = 3600000, D = 24 * H;

function seedFrom(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FIRST = ["Nova", "Pixel", "Salty", "Turbo", "Lunar", "Grim", "Cosmic", "Rusty", "Velvet", "Hyper", "Quiet", "Neon", "Iron", "Tiny", "Mystic", "Sleepy", "Rogue", "Amber", "Frost", "Glitch"];
const SECOND = ["Fox", "Knight", "Panda", "Wizard", "Cat", "Gamer", "Plays", "TV", "Bear", "Ranger", "Owl", "Raccoon", "Dash", "Forge", "Lad", "Pilot"];
const PUBLISHER = "Apex Forge Games";

export function demoPosts(game = "Sample Game", now = Date.now()) {
  const rnd = mulberry32(seedFrom(String(game)));
  const r = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const posts = [];
  let n = 0;
  const creatorPool = [];
  for (let i = 0; i < 90; i++) {
    const name = `${pick(FIRST)}${pick(SECOND)}${i}`;
    creatorPool.push({ name, id: "demo-" + name.toLowerCase(), followers: Math.round(Math.exp(r(6.5, 13))) });
  }
  const creator = (i) => creatorPool[i % creatorPool.length];

  function add(o) {
    n++;
    const slug = o.source + "-" + n;
    const text = o.text || "";
    const tags = o.tags || [];
    posts.push({
      id: `${o.source}:demo${n}`, source: o.source, kind: o.kind, url: `https://example.com/demo/${slug}`,
      title: o.title || "", text, author: o.c.name, authorId: o.c.id,
      authorFollowers: o.source === "reddit" || o.source === "hackernews" ? null : o.c.followers,
      publishedAt: new Date(o.t).toISOString(),
      metrics: { views: o.views ?? null, likes: o.likes ?? null, comments: o.comments ?? null, viewers: o.viewers ?? null },
      tags: tags.map((t) => t.toLowerCase()), lang: "en",
    });
  }
  const viewsFor = (c, k = 0.08) => Math.max(50, Math.round(c.followers * k * Math.exp(r(-0.8, 0.8))));
  const g = game, gt = game.toLowerCase().replace(/[^a-z0-9]+/g, "");

  // 1) steady background chatter (~125 posts over 30 days)
  const bgTitles = [`Anyone else stuck on the second boss in ${g}?`, `${g} build guide for beginners`, `Is ${g} worth it right now?`, `My ${g} run so far`, `${g} settings for low-end PCs`, `Hot take: ${g} has the best soundtrack this year`, `Looking for co-op partners in ${g}`, `${g} tips nobody tells you`, `Finally finished ${g}, thoughts`, `${g} vs the competition`];
  const bgSources = ["reddit", "reddit", "reddit", "bluesky", "bluesky", "mastodon", "youtube", "youtube", "twitch", "hackernews"];
  for (let i = 0; i < 125; i++) {
    const s = pick(bgSources), c = creator(ri(0, 89));
    const t = now - r(0.2, 30) * D;
    const base = { source: s, c, t };
    if (s === "reddit") add({ ...base, kind: "post", title: pick(bgTitles), text: rnd() < 0.5 ? `Been playing ${g} for a while and wanted to share.` : "", likes: ri(1, 400), comments: ri(0, 80), tags: rnd() < 0.3 ? ["discussion"] : ["question"] });
    else if (s === "bluesky" || s === "mastodon") add({ ...base, kind: "post", text: `${pick(bgTitles)} #${gt}${rnd() < 0.3 ? " #gaming" : ""}`, likes: ri(0, 60), comments: ri(0, 10), tags: [gt, ...(rnd() < 0.3 ? ["gaming"] : [])] });
    else if (s === "youtube") add({ ...base, kind: rnd() < 0.2 ? "short" : "video", title: pick(bgTitles), text: `My thoughts on ${g}. Like and subscribe!`, views: viewsFor(c, 0.03), likes: ri(5, 900), comments: ri(0, 120), tags: [gt] });
    else if (s === "twitch") add({ ...base, kind: rnd() < 0.6 ? "stream" : "video", title: `${g} | chill run | !discord`, views: ri(20, 2000), viewers: ri(3, 150) });
    else add({ ...base, kind: "article", title: rnd() < 0.5 ? `${g}: a post-mortem of its netcode` : `Show HN: a modding tool for ${g}`, likes: ri(2, 180), comments: ri(0, 90) });
  }

  // 2) launch / trailer spike ~22 days ago, decaying over ~3 days (35 posts)
  const launch = now - 22 * D;
  const lt = [`${g} - Official Launch Trailer`, `${g} is OUT NOW`, `${g} Release Date Trailer`, `${g} launch day impressions`, `Thread: ${g} launch megathread`, `${g} review in progress`];
  for (let i = 0; i < 35; i++) {
    const s = pick(["youtube", "youtube", "reddit", "reddit", "bluesky", "mastodon", "twitch", "hackernews"]);
    const c = creator(ri(0, 89));
    const t = launch + Math.pow(rnd(), 1.8) * 3 * D;
    const common = { source: s, c, t };
    if (s === "youtube") add({ ...common, kind: "video", title: pick(lt), text: `Wishlist ${g} on Steam now.`, views: viewsFor(c, 0.2), likes: ri(100, 5000), comments: ri(10, 600), tags: [gt, "trailer", "launch"] });
    else if (s === "twitch") add({ ...common, kind: "stream", title: `${g} LAUNCH DAY first playthrough`, viewers: ri(50, 900), views: ri(500, 9000) });
    else if (s === "hackernews") add({ ...common, kind: "article", title: `${g} launches on Steam and consoles`, likes: ri(30, 400), comments: ri(10, 250) });
    else add({ ...common, kind: "post", title: s === "reddit" ? pick(lt) : "", text: s === "reddit" ? "" : `${pick(lt)} #${gt} #launch`, likes: ri(20, 1500), comments: ri(3, 300), tags: s === "reddit" ? ["news"] : [gt, "launch"] });
  }

  // 3) patch / season update wave ~10 days ago (25 posts, 2 days, organic)
  const patch = now - 10 * D;
  const pt = [`${g} Patch 1.4 patch notes breakdown`, `${g} Season 2 is here: everything new`, `${g} update: balance changes explained`, `New ${g} season - best builds`, `${g} patch 1.4 bugs`];
  for (let i = 0; i < 25; i++) {
    const s = pick(["reddit", "reddit", "youtube", "youtube", "bluesky", "mastodon", "twitch"]);
    const c = creator(ri(0, 89)), t = patch + Math.pow(rnd(), 1.5) * 2 * D;
    if (s === "youtube") add({ source: s, c, t, kind: "video", title: pick(pt), text: "Full patch notes inside.", views: viewsFor(c, 0.07), likes: ri(20, 1500), comments: ri(3, 200), tags: [gt, "patchnotes"] });
    else if (s === "twitch") add({ source: s, c, t, kind: "stream", title: `${g} Season 2 first look`, viewers: ri(10, 300), views: ri(100, 3000) });
    else add({ source: s, c, t, kind: "post", title: s === "reddit" ? pick(pt) : "", text: s === "reddit" ? "" : `${pick(pt)} #${gt} #patchnotes`, likes: ri(5, 600), comments: ri(1, 150), tags: s === "reddit" ? ["patch notes"] : [gt, "patchnotes"] });
  }

  // 4) organic viral clip cluster ~14 days ago (15 posts; one huge, rest small)
  const viral = now - 14 * D;
  for (let i = 0; i < 15; i++) {
    const s = i === 0 ? "reddit" : pick(["reddit", "bluesky", "mastodon", "youtube", "youtube"]);
    const c = creator(ri(0, 89)), t = viral + (i === 0 ? 0 : r(1, 40) * H);
    const big = i === 0, tt = big ? `This ${g} clip is unreal (physics bug launches boss across the map)` : pick([`The ${g} boss launch clip, reposted`, `Reacting to the viral ${g} clip`, `That ${g} physics bug is hilarious`]);
    if (s === "youtube") add({ source: s, c, t, kind: rnd() < 0.5 ? "short" : "video", title: tt, text: "", views: ri(2000, 60000), likes: ri(100, 4000), comments: ri(10, 300), tags: [gt, "funny"] });
    else add({ source: s, c, t, kind: "post", title: s === "reddit" ? tt : "", text: s === "reddit" ? "" : `${tt} #${gt}`, likes: big ? 48000 : ri(10, 2500), comments: big ? 2100 : ri(2, 200), tags: s === "reddit" ? ["clip"] : [gt] });
  }

  // 5) sponsored creator wave ~5 days ago, ~26 mid-size creators within ~48h
  const wave = now - 5 * D;
  const disclosures = [
    () => `\n\n#ad`, () => `\n\nSponsored by ${PUBLISHER}.`, () => `\n\nThanks to ${PUBLISHER} for sponsoring this video!`,
    () => `\n\nThis video contains a paid partnership with ${PUBLISHER}.`, () => `\n\n#partner #${gt}`,
    () => `\n\nUse code ${gt.slice(0, 6).toUpperCase()}${ri(10, 99)} for 10% off. #sponsored`, () => `\n\nPaid promotion. Wishlist ${g} on Steam: https://example.com/demo/store`,
    () => `\n\nThanks to ${PUBLISHER} for the early access and for sponsoring today's stream.`,
  ];
  const waveTitles = [
    (x) => `I Played ${g} For 24 Hours (Honest First Impressions)`, (x) => `${g} Is Actually INSANE - First Impressions`,
    (x) => `I Tried ${g} For The First Time (Sponsored)`, (x) => `Why Everyone Is Playing ${g} Right Now`, (x) => `${g} - First Impressions & Gameplay`,
    (x) => `I Can't Stop Playing ${g}`,
  ];
  for (let i = 0; i < 26; i++) {
    const c = creatorPool[60 + (i % 30)];
    const mid = { ...c, followers: ri(25000, 450000), name: c.name + "W", id: c.id + "w" };
    const twitch = i % 4 === 3;
    const t = wave + Math.pow(rnd(), 1.2) * 48 * H;
    const disc = disclosures[i % disclosures.length]();
    const title = pick(waveTitles)(i);
    if (twitch) add({ source: "twitch", kind: "stream", c: mid, t, title: `${g} first look with ${PUBLISHER} | #ad`, text: disc, viewers: ri(300, 2500), views: ri(2000, 15000), tags: ["ad", gt] });
    else add({ source: "youtube", kind: "video", c: mid, t, title, text: `Playing ${g} for the first time.${disc}`, views: Math.round(mid.followers * r(0.12, 0.22)), likes: ri(1500, 9000), comments: ri(100, 900), tags: [gt, ...(disc.includes("#ad") ? ["ad"] : []), ...(disc.includes("#partner") ? ["partner"] : []), ...(disc.includes("#sponsored") ? ["sponsored"] : [])] });
  }
  // a handful of echo posts on social about the wave
  for (let i = 0; i < 6; i++) add({ source: pick(["bluesky", "mastodon"]), kind: "post", c: creator(ri(0, 89)), t: wave + r(2, 60) * H, text: `New video up: ${pick(waveTitles)(0)} #ad #${gt}`, likes: ri(3, 150), comments: ri(0, 20), tags: ["ad", gt] });

  // 6) TikTok / Instagram / X / Facebook coverage. Uses its own PRNG so the clusters above are unchanged.
  const r2 = mulberry32(seedFrom("extra:" + game));
  const q = (a, b) => a + r2() * (b - a), qi = (a, b) => Math.floor(q(a, b + 1)), qp = (a) => a[Math.floor(r2() * a.length)];
  const pool2 = [];
  for (let i = 0; i < 40; i++) { const name = `${qp(FIRST)}${qp(SECOND)}${100 + i}`; pool2.push({ name, id: "demo-" + name.toLowerCase(), followers: Math.round(Math.exp(q(7, 13.5))) }); }
  const c2 = () => qp(pool2);
  const shortDisc = [` #ad`, ` #sponsored`, ` #partner`, ` Paid partnership with ${PUBLISHER}`, ``, ` #ad #${gt}`];
  const wTitle = [`${g} is wild, first time playing`, `POV: you finally try ${g}`, `${g} first impressions in 60 seconds`];
  // sponsored wave echoes (~5 days ago, same 48h window)
  for (let i = 0; i < 10; i++) {
    const c = { ...c2(), followers: qi(30000, 600000) }, d = i < 6 ? shortDisc[i] : ``;
    add({ source: "tiktok", kind: "short", c, t: wave + q(0, 48) * H, text: `${qp(wTitle)}${d} #${gt} #fyp`, views: Math.round(c.followers * q(0.3, 1.2)), likes: qi(2000, 40000), comments: qi(40, 900), tags: [gt, "fyp", ...(d.includes("#ad") ? ["ad"] : []), ...(d.includes("#sponsored") ? ["sponsored"] : [])] });
  }
  for (let i = 0; i < 8; i++) {
    const c = { ...c2(), followers: qi(20000, 300000) }, d = [` #ad`, ` #sponsored`, ` Paid partnership with ${PUBLISHER}`, ``][i % 4];
    add({ source: "instagram", kind: i % 2 ? "short" : "post", c, t: wave + q(0, 50) * H, text: `${qp(wTitle)}${d} #${gt} #gaming`, views: i % 2 ? Math.round(c.followers * q(0.2, 0.8)) : null, likes: Math.round(c.followers * q(0.02, 0.07)), comments: qi(10, 200), tags: [gt, "gaming", ...(d.includes("#ad") ? ["ad"] : []), ...(d.includes("#sponsored") ? ["sponsored"] : [])] });
  }
  for (let i = 0; i < 2; i++) add({ source: "x", kind: "post", c: c2(), t: wave + q(0, 48) * H, text: `New video is live, sponsored by ${PUBLISHER} #ad #${gt}`, views: qi(2000, 30000), likes: qi(10, 400), comments: qi(0, 40), tags: ["ad", gt] });
  // launch spike (~22 days ago): X-heavy
  const xl = [`${g} is out! first hour impressions`, `Just bought ${g}, no regrets so far`, `${g} servers are melting on launch day`, `${g} launch trailer is incredible`];
  for (let i = 0; i < 8; i++) add({ source: "x", kind: "post", c: c2(), t: launch + Math.pow(r2(), 1.8) * 3 * D, text: `${qp(xl)} #${gt}`, views: qi(500, 90000), likes: qi(5, 3000), comments: qi(0, 300), tags: [gt] });
  for (let i = 0; i < 4; i++) add({ source: "tiktok", kind: "short", c: c2(), t: launch + r2() * 3 * D, text: `${g} launch day reaction #${gt} #gaming`, views: qi(5000, 400000), likes: qi(300, 40000), comments: qi(10, 800), tags: [gt, "gaming"] });
  for (let i = 0; i < 3; i++) add({ source: "instagram", kind: "post", c: c2(), t: launch + r2() * 3 * D, text: `${g} is finally here #${gt} #launch`, likes: qi(100, 5000), comments: qi(2, 120), tags: [gt, "launch"] });
  for (let i = 0; i < 3; i++) add({ source: "facebook", kind: "post", c: c2(), t: launch + r2() * 3 * D, text: `${g} is out now! Who is playing tonight?`, likes: qi(20, 1500), comments: qi(2, 200), tags: [] });
  // patch wave (~10 days ago)
  const xp = [`${g} patch 1.4 notes are live`, `The ${g} Season 2 balance changes are huge`, `${g} update broke my save, anyone else?`];
  for (let i = 0; i < 7; i++) add({ source: "x", kind: "post", c: c2(), t: patch + Math.pow(r2(), 1.5) * 2 * D, text: `${qp(xp)} #${gt} #patchnotes`, views: qi(300, 40000), likes: qi(2, 900), comments: qi(0, 120), tags: [gt, "patchnotes"] });
  for (let i = 0; i < 2; i++) add({ source: "facebook", kind: "post", c: c2(), t: patch + r2() * 2 * D, text: `${g} Season 2 patch notes discussion`, likes: qi(10, 600), comments: qi(1, 90), tags: [] });
  // organic viral clip led by TikTok (~14 days ago): the original lands first, then reposts spread
  add({ source: "tiktok", kind: "short", c: { ...c2(), followers: 18000 }, t: viral - 3 * H, text: `bro the ${g} physics bug sent the boss to space #${gt} #funny`, views: 2600000, likes: 410000, comments: 9800, tags: [gt, "funny"] });
  for (let i = 0; i < 5; i++) add({ source: "tiktok", kind: "short", c: c2(), t: viral + q(2, 48) * H, text: `stitching that ${g} boss clip #${gt} #fyp`, views: qi(8000, 250000), likes: qi(500, 30000), comments: qi(10, 600), tags: [gt, "fyp"] });
  add({ source: "x", kind: "post", c: c2(), t: viral + 5 * H, text: `this ${g} clip from TikTok has me crying #${gt}`, views: 900000, likes: 38000, comments: 1200, tags: [gt] });
  add({ source: "instagram", kind: "short", c: c2(), t: viral + 9 * H, text: `Repost of the viral ${g} clip #${gt} #funny`, views: qi(20000, 90000), likes: qi(1000, 9000), comments: qi(20, 300), tags: [gt, "funny"] });
  // steady background
  for (let i = 0; i < 6; i++) add({ source: "tiktok", kind: "short", c: c2(), t: now - q(0.3, 30) * D, text: `${qp(bgTitles)} #${gt}`, views: qi(300, 60000), likes: qi(10, 5000), comments: qi(0, 200), tags: [gt] });
  for (let i = 0; i < 5; i++) add({ source: "instagram", kind: "post", c: c2(), t: now - q(0.3, 30) * D, text: `${qp(bgTitles)} #${gt} #gaming`, likes: qi(5, 900), comments: qi(0, 40), tags: [gt, "gaming"] });
  for (let i = 0; i < 3; i++) add({ source: "x", kind: "post", c: c2(), t: now - q(0.3, 30) * D, text: `${qp(bgTitles)} #${gt}`, views: qi(100, 8000), likes: qi(0, 300), comments: qi(0, 30), tags: [gt] });
  for (let i = 0; i < 3; i++) add({ source: "facebook", kind: "post", c: c2(), t: now - q(0.3, 30) * D, text: qp(bgTitles), likes: qi(2, 300), comments: qi(0, 50), tags: [] });

  return posts.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
}
