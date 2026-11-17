// Trump Tweets: a running feed of @realDonaldTrump's Truth Social posts.
//
// Truth Social doesn't let other websites read its posts from the browser, so a scheduled GitHub
// workflow in the public mishalgovani-afk/hush-web repo runs scripts/fetch-feed.mjs every ~5 min and
// force-pushes feed.json to that repo's `feed-data` branch. This page reads that file from
// raw.githubusercontent.com, which allows cross-site reads. Post text is only ever set as text.

const FEED_URL = "https://raw.githubusercontent.com/mishalgovani-afk/hush-web/feed-data/feed.json";
const LAST_SEEN = "trumpTweets.lastSeen";
const BASE_TITLE = document.title;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

const feed = { posts: [], loadedAt: 0, timer: null, loading: false, error: null, meta: null, seen: null };
const lastSeen = () => { try { return localStorage.getItem(LAST_SEEN) || ""; } catch { return ""; } };
const setLastSeen = (id) => { try { localStorage.setItem(LAST_SEEN, id); } catch { /* private mode */ } };
// Post ids are numeric strings of varying length; compare as numbers without losing precision.
const newerId = (a, b) => (a.length !== b.length ? a.length > b.length : a > b);

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Plain text -> DOM with clickable https links. Never uses innerHTML with feed content. */
function linkify(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'”’]/g)) {
    frag.append(text.slice(last, m.index));
    const url = m[0];
    if (/^https:\/\//i.test(url)) {
      frag.append(el("a", { href: url, target: "_blank", rel: "noopener noreferrer nofollow", textContent: url.replace(/^https:\/\/(www\.)?/, "").slice(0, 60) + (url.length > 68 ? "…" : "") }));
    } else frag.append(url);
    last = m.index + url.length;
  }
  frag.append(text.slice(last));
  return frag;
}

function renderPost(p, seen) {
  const fmt = (n) => (n == null ? null : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));
  const time = el("time", { dateTime: p.createdAt, textContent: ago(p.createdAt), title: new Date(p.createdAt).toLocaleString() });
  const card = el("article", { className: `post${seen && newerId(p.id, seen) ? " new" : ""}` },
    el("div", { className: "post-meta" }, el("span", { className: "avatar", textContent: "DT" }),
      el("span", {}, el("strong", { textContent: "Donald J. Trump" }), " @realDonaldTrump"), time));
  if (p.repost) card.append(el("p", { className: "post-repost", textContent: `↻ Reposted${p.repostOf ? ` from ${p.repostOf}` : ""}` }));
  const body = el("p", { className: `post-text${p.text ? "" : " empty"}` });
  if (p.text) body.append(linkify(p.text)); else body.textContent = p.media?.length ? "(media only)" : "(no text, open on Truth Social)";
  card.append(body);
  if (p.media?.length) {
    const grid = el("div", { className: "post-media" });
    for (const m of p.media) {
      const src = m.preview || (m.type === "image" ? m.url : null);
      const a = el("a", { href: m.url || p.url, target: "_blank", rel: "noopener noreferrer" });
      if (src) {
        const img = el("img", { src, alt: m.type === "video" ? "Video preview" : "Attached image", loading: "lazy", referrerPolicy: "no-referrer" });
        img.onerror = () => a.remove();
        a.append(img);
      }
      if (m.type === "video") a.append(el("span", { className: "play", textContent: "▶" }));
      grid.append(a);
    }
    card.append(grid);
  }
  const foot = el("div", { className: "post-foot" });
  for (const [icon, n] of [["💬", p.replies], ["↻", p.reposts], ["♥", p.likes]]) if (n != null) foot.append(el("span", { textContent: `${icon} ${fmt(n)}` }));
  foot.append(el("a", { href: p.url, target: "_blank", rel: "noopener noreferrer", textContent: "Open ↗" }));
  card.append(foot);
  return card;
}

function renderFeed() {
  const list = $("feedList");
  if (!feed.posts.length) {
    list.replaceChildren(el("div", { className: "feed-empty", textContent: feed.error ? `Couldn't load the feed (${feed.error}).` : feed.loading ? "Loading posts…" : "No posts yet. The first update can take a few minutes." }));
  } else {
    list.replaceChildren(...feed.posts.map((p) => renderPost(p, feed.seen)));
  }
  const n = unseenCount();
  $("newBanner").hidden = !n;
  $("newBanner").textContent = `${n} new post${n === 1 ? "" : "s"} since your last visit`;
  renderStatus();
}

function renderStatus() {
  const m = feed.meta;
  let t = feed.loading && !feed.posts.length ? "Loading…" : "";
  if (m?.updatedAt) t = `Updated ${ago(m.updatedAt)}${ago(m.updatedAt) === "just now" ? "" : " ago"} · ${feed.posts.length} posts${m.source ? ` · via ${m.source}` : ""}`;
  if (feed.error) t = `${t ? `${t} · ` : ""}offline (${feed.error})`;
  if (m?.checkedAt && m.updatedAt && new Date(m.checkedAt) - new Date(m.updatedAt) > 30 * 60e3) t += " · sources unreachable, showing last saved posts";
  $("feedStatus").textContent = t;
  for (const tEl of document.querySelectorAll("#feedList time")) tEl.textContent = ago(tEl.dateTime);
}

const unseenCount = () => (feed.seen ? feed.posts.filter((p) => newerId(p.id, feed.seen)).length : 0);

function updateTitle() {
  // While the tab is in the background, count posts that arrived since it was last looked at.
  const n = document.hidden ? feed.posts.filter((p) => newerId(p.id, lastSeen())).length : 0;
  document.title = n ? `(${n > 9 ? "9+" : n}) ${BASE_TITLE}` : BASE_TITLE;
}

async function loadFeed() {
  if (feed.loading) return;
  feed.loading = true;
  if (!feed.posts.length) renderFeed();
  try {
    const res = await fetch(`${FEED_URL}?t=${Math.floor(Date.now() / 30000)}`, { cache: "no-store" });
    if (res.status === 404) throw new Error("feed not published yet");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const before = feed.posts[0]?.id;
    feed.posts = Array.isArray(data.posts) ? data.posts.filter((p) => p && p.id && p.createdAt) : [];
    feed.meta = data;
    feed.error = null;
    feed.loadedAt = Date.now();
    if (before !== feed.posts[0]?.id || $("feedList").querySelector(".feed-empty")) renderFeed();
    if (!document.hidden && feed.posts[0]) setLastSeen(feed.posts[0].id);
  } catch (e) {
    feed.error = e.message === "Failed to fetch" ? "no connection" : e.message;
    renderFeed();
  } finally {
    feed.loading = false;
    renderStatus();
    updateTitle();
  }
}

function scheduleFeed() {
  clearTimeout(feed.timer);
  feed.timer = setTimeout(async () => { await loadFeed(); scheduleFeed(); }, document.hidden ? 180e3 : 60e3);
}

feed.seen = lastSeen();          // posts newer than the last visit are highlighted
$("feedRefresh").onclick = () => loadFeed();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (feed.posts[0]) setLastSeen(feed.posts[0].id);
    if (Date.now() - feed.loadedAt > 20e3) loadFeed();
  }
  updateTitle();
  scheduleFeed();
});
setInterval(renderStatus, 30e3);
loadFeed();
scheduleFeed();
