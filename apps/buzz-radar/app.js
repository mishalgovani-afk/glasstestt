import * as SRC from "./sources.js";
import { demoPosts } from "./demo-data.js";
import { analyze } from "./analysis.js";
import { ARCHETYPES, GLOSSARY, LESSONS } from "./playbook.js";

const { SOURCES, searchAll } = SRC;
const KEY_GROUPS = SRC.KEY_GROUPS || {};

/* ------------------------------------------------------------------ helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const HOUR = 3600e3;
const DAY = 24 * HOUR;

/** DOM builder. Strings become text nodes, so remote text can never become markup. */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid);
  return n;
}
const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid);
  return n;
}

/** Only https: URLs are ever turned into links. */
function safeHref(u) {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}
function extLink(url, text, props = {}) {
  const href = safeHref(url);
  if (!href) return el("span", { ...props, text });
  return el("a", { ...props, href, target: "_blank", rel: "noopener noreferrer", text });
}

const nf = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const nfFull = new Intl.NumberFormat();
const fmtNum = (n) => (Number.isFinite(n) ? nf.format(n) : "–");
const fmtFull = (n) => (Number.isFinite(n) ? nfFull.format(n) : "–");
const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDayHour = (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
function fmtRange(a, b) {
  const da = fmtDay(a), db = fmtDay(b);
  return da === db ? da : `${da} – ${db}`;
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v) => Math.round(clamp(Number(v) || 0, 0, 1) * 100);
const plural = (n, one, many = one + "s") => `${fmtFull(n)} ${n === 1 ? one : many}`;
const humanize = (id) => String(id).replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/* ------------------------------------------------------------------ storage (always guarded) */
const mem = new Map();
let storageOk = true;
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v; } catch { storageOk = false; return mem.has(k) ? mem.get(k) : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { storageOk = false; mem.set(k, v); } },
  remove(k) { try { localStorage.removeItem(k); } catch { storageOk = false; } mem.delete(k); },
};
const KEYS_STORE = "buzzradar.keys.v1";
const LAST_STORE = "buzzradar.last.v1";

function loadKeys() {
  try {
    const o = JSON.parse(store.get(KEYS_STORE) || "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}
function readLast() {
  try {
    const o = JSON.parse(store.get(LAST_STORE) || "null");
    return o && typeof o === "object" ? o : null;
  } catch { return null; }
}

/* ------------------------------------------------------------------ state */
const state = {
  game: "", days: 30, demo: false,
  posts: [], postsById: new Map(), report: null, ranked: [], rankOf: new Map(),
  selected: null, runId: 0, ctrl: null, loading: false,
  keys: loadKeys(),
  chips: {},          // sourceId -> {status, count, error}
  chart: null,
};

/* One fixed colour per platform id (never cycled, never by rank). The first eight take the
   validated categorical slots in order; the rest use extra tones defined in styles.css.
   Anything not listed is appended after the SOURCES list, so the platform list stays data-driven. */
const PLATFORM_COLORS = ["youtube", "twitch", "reddit", "tiktok", "instagram", "x", "bluesky", "mastodon",
  "facebook", "hackernews", "kick"];
const colorOrder = [...new Set([...PLATFORM_COLORS, ...SOURCES.map((s) => s.id)])];
function srcIndex(id) {
  let i = colorOrder.indexOf(id);
  if (i < 0) i = colorOrder.push(id) - 1;
  return i;
}
const srcColor = (id) => { const i = srcIndex(id); return i < 11 ? `var(--s${i + 1})` : "var(--s-other)"; };
const srcName = (id) => SOURCES.find((s) => s.id === id)?.name || humanize(id);

/* Sources that share a credential (e.g. Apify) point at a key group; keys live at keys[group || sourceId]. */
const keyOwner = (src) => src.keyGroup || src.id;
const keyFieldsOf = (src) => (src.keyGroup ? KEY_GROUPS[src.keyGroup]?.keyFields : src.keyFields) || [];
function isRunnable(src) {
  if (!src.needsKey) return true;
  const k = state.keys[keyOwner(src)] || {};
  return keyFieldsOf(src).every((f) => f.optional || (k[f.name] && String(k[f.name]).trim()));
}
function needKeyLabel(src) {
  if (!src?.keyGroup) return "needs key";
  const g = String(KEY_GROUPS[src.keyGroup]?.name || src.keyGroup).replace(/\s+(token|key)$/i, "");
  return `needs ${g} token`;
}

/* ------------------------------------------------------------------ routing */
const TABS = ["radar", "learn", "settings"];
function showTab() {
  const raw = location.hash.replace(/^#/, "");
  const tab = TABS.includes(raw) ? raw : "radar";
  document.querySelectorAll("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== tab; });
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (tab === "settings") renderSettings();
  if (tab === "radar" && state.chart) state.chart.draw();
}

/* ------------------------------------------------------------------ source chips */
function resetChips(mode) {
  state.chips = {};
  for (const s of SOURCES) state.chips[s.id] = { status: mode === "idle" ? (isRunnable(s) ? "ready" : "needkey") : (isRunnable(s) ? "loading" : "needkey"), count: 0 };
}
function renderChips() {
  const host = $("#chips");
  const ids = [...SOURCES.map((s) => s.id), ...Object.keys(state.chips).filter((id) => !SOURCES.some((s) => s.id === id))];
  host.replaceChildren(...ids.map((id) => {
    const c = state.chips[id] || { status: "ready", count: 0 };
    const name = srcName(id);
    const src = SOURCES.find((s) => s.id === id);
    let status = c.status;
    if (status === "skipped" && src?.needsKey && !isRunnable(src)) status = "needkey";
    const dot = el("span", { class: "dot", "aria-hidden": "true" });
    switch (status) {
      case "needkey":
        return el("a", { class: "chip needkey", href: "#settings", role: "listitem", title: `${name} needs ${src?.keyGroup ? "a token" : "an API key"}. Open settings to add one.` }, dot, el("span", { text: name }), el("b", { text: needKeyLabel(src) }));
      case "loading":
        return el("span", { class: "chip loading", role: "listitem" }, dot, el("span", { text: name }), el("b", { text: "searching…" }));
      case "done":
        return el("span", { class: "chip done", role: "listitem" }, dot, el("span", { text: name }), el("b", { text: `✓ ${fmtFull(c.count)}` }));
      case "error":
        return el("span", { class: "chip error", role: "listitem", title: c.error || "Search failed" }, dot, el("span", { text: name }), el("b", { text: "error" }));
      case "skipped":
        return el("span", { class: "chip", role: "listitem", title: c.error || "Skipped" }, dot, el("span", { text: name }), el("b", { text: "skipped" }));
      default:
        return el("span", { class: "chip", role: "listitem" }, dot, el("span", { text: name }), el("b", { text: "ready" }));
    }
  }));
}
const setStatus = (msg) => { $("#status").textContent = msg || ""; };

/* ------------------------------------------------------------------ search flow */
function getDays() {
  const r = document.querySelector('input[name="days"]:checked');
  return r ? Number(r.value) : 30;
}
function setDays(d) {
  const r = document.querySelector(`input[name="days"][value="${d}"]`);
  if (r) r.checked = true;
}
function setLoading(on) {
  state.loading = on;
  $("#searchBtn").disabled = on;
  $("#demoBtn").disabled = on;
  $("#cancelBtn").hidden = !on;
  $("#results").classList.toggle("stale", on && !!state.report);
}
function updateUrl() {
  try {
    const p = new URLSearchParams();
    p.set("game", state.game);
    p.set("days", String(state.days));
    if (state.demo) p.set("demo", "1");
    history.replaceState(null, "", `?${p}${location.hash}`);
  } catch { /* ignore */ }
}

async function runSearch(demo) {
  const game = $("#gameInput").value.trim().replace(/\s+/g, " ");
  if (!game) {
    setStatus("Type a game name first.");
    $("#gameInput").focus();
    return;
  }
  if (location.hash !== "#radar") { try { history.replaceState(null, "", `${location.pathname}${location.search}#radar`); } catch { /* ignore */ } showTab(); }
  state.ctrl?.abort();
  const ctrl = new AbortController();
  state.ctrl = ctrl;
  const runId = ++state.runId;
  state.game = game; state.days = getDays(); state.demo = demo;
  store.set(LAST_STORE, JSON.stringify({ game, days: state.days }));
  updateUrl();

  resetChips("run");
  renderChips();
  setLoading(true);
  if (!state.report) renderLoading(game);
  setStatus(demo ? "Loading demo data…" : `Searching for “${game}”…`);
  const t0 = performance.now();

  try {
    let posts = [];
    let errors = [];
    const now = Date.now();
    if (demo) {
      await new Promise((r) => setTimeout(r, 250));
      posts = demoPosts(game, now).filter((p) => +new Date(p.publishedAt) >= now - state.days * DAY);
      const counts = {};
      for (const p of posts) counts[p.source] = (counts[p.source] || 0) + 1;
      for (const id of new Set([...SOURCES.map((s) => s.id), ...Object.keys(counts)])) state.chips[id] = { status: "done", count: counts[id] || 0 };
      renderChips();
    } else {
      const res = await searchAll(game, {
        keys: state.keys, sinceDays: state.days, signal: ctrl.signal,
        onProgress: (e) => {
          if (runId !== state.runId || !e) return;
          state.chips[e.source] = { status: e.status, count: e.count || 0, error: e.error };
          renderChips();
        },
      });
      posts = res.posts || [];
      errors = res.errors || [];
    }
    if (runId !== state.runId) return;
    if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");

    const report = posts.length ? analyze(posts, { game, now }) : null;
    if (runId !== state.runId) return;
    state.posts = posts;
    state.postsById = new Map(posts.map((p) => [p.id, p]));
    state.report = report;
    state.ranked = [...(report?.clusters || [])].sort((a, b) => b.campaignScore - a.campaignScore);
    state.rankOf = new Map(state.ranked.map((c, i) => [c.id, i + 1]));
    state.selected = null;
    state.errors = errors;
    renderResults();
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus(posts.length
      ? `${plural(posts.length, "post")} analysed in ${secs}s, ${plural(state.ranked.length, "cluster")} found.`
      : "No posts found.");
  } catch (err) {
    if (runId !== state.runId) return;
    if (err?.name === "AbortError" || ctrl.signal.aborted) {
      setStatus("Search cancelled.");
      for (const c of Object.values(state.chips)) if (c.status === "loading") c.status = "skipped";
      renderChips();
      if (!state.report) renderIdle();
    } else {
      setStatus("Search failed.");
      renderError(err);
    }
  } finally {
    if (runId === state.runId) { setLoading(false); state.ctrl = null; }
  }
}

function cancelSearch() {
  state.ctrl?.abort();
  state.runId++;               // ignore any late callbacks from the cancelled run
  setLoading(false);
  setStatus("Search cancelled.");
  for (const c of Object.values(state.chips)) if (c.status === "loading") c.status = "skipped";
  renderChips();
  if (!state.report) renderIdle();
  state.ctrl = null;
}

/* ------------------------------------------------------------------ result states */
function disposeChart() { state.chart?.dispose(); state.chart = null; }

function renderIdle() {
  disposeChart();
  $("#results").replaceChildren();
}
function renderLoading(game) {
  disposeChart();
  $("#results").replaceChildren(el("div", { class: "card state" },
    el("div", { class: "spinner", "aria-hidden": "true" }),
    el("h2", { text: `Scanning for “${game}”` }),
    el("p", { text: "Asking each platform for recent videos, streams and posts. Slow or failing sources won't block the rest." })));
}
function renderError(err) {
  disposeChart();
  state.report = null;
  $("#results").replaceChildren(el("div", { class: "card state" },
    el("h2", { text: "Something went wrong" }),
    el("p", { text: String(err?.message || err || "Unknown error") }),
    el("button", { class: "btn", type: "button", text: "Try demo data", onclick: () => runSearch(true) })));
}
function renderEmpty(errors) {
  disposeChart();
  const allFailed = errors.length && errors.length >= Object.values(state.chips).filter((c) => c.status !== "needkey" && c.status !== "skipped").length;
  const needKey = SOURCES.filter((s) => !isRunnable(s));
  const kids = [
    el("h2", { text: allFailed ? "Every source failed" : "No posts found" }),
    el("p", { text: allFailed
      ? "None of the platforms returned results. This is usually a network, CORS or rate-limit problem rather than a lack of buzz."
      : `Nothing matched “${state.game}” in the last ${state.days} days.` }),
  ];
  const tips = [];
  if (!allFailed) tips.push("Check the spelling or try the full official title.", "Widen the time range to 90 days.");
  if (needKey.length) tips.push(`Add API keys or tokens for ${needKey.map((s) => s.name).join(", ")} in Settings for far better coverage.`);
  if (tips.length) kids.push(el("ul", {}, tips.map((t) => el("li", { text: t }))));
  if (errors.length) kids.push(el("ul", {}, errors.map((e) => el("li", { text: `${srcName(e.source)}: ${e.message}` }))));
  kids.push(el("button", { class: "btn primary", type: "button", text: "Try demo data", onclick: () => runSearch(true) }));
  $("#results").replaceChildren(el("div", { class: "card state" }, ...kids));
}

/* ------------------------------------------------------------------ results */
function levelOf(score) { return score >= 65 ? "hi" : score >= 35 ? "mid" : "lo"; }
const LEVEL_TEXT = { hi: "Likely a paid push", mid: "Mixed signals", lo: "Looks organic" };

function renderResults() {
  const { report } = state;
  const errors = state.errors || [];
  if (!report || !report.totals || report.totals.posts === 0) { state.report = null; renderEmpty(errors); return; }
  disposeChart();

  const out = [];
  out.push(el("div", { class: "res-head" },
    el("div", {},
      el("h2", { text: report.game || state.game }),
      el("p", { class: "sub", text: `${fmtRange(report.range.start, report.range.end)} · last ${state.days} days` })),
    el("div", { class: "exports" },
      el("button", { class: "btn small", type: "button", text: "Download report (JSON)", onclick: exportJson }),
      el("button", { class: "btn small", type: "button", text: "Download posts (CSV)", onclick: exportCsv }))));

  if (state.demo) out.push(el("div", { class: "banner", role: "note", text: "You are looking at synthetic demo data. Nothing here describes a real game. Search a real title to see live results." }));
  if (errors.length) out.push(el("div", { class: "banner warn", role: "note", text: `Some sources failed: ${errors.map((e) => `${srcName(e.source)} (${e.message})`).join("; ")}` }));

  const top = state.ranked[0];
  out.push(el("div", { class: "stats" },
    stat(fmtFull(report.totals.posts), "posts found"),
    stat(fmtFull(report.totals.creators), "distinct creators"),
    stat(fmtFull(state.ranked.length), "clusters"),
    stat(top ? `${Math.round(top.campaignScore)}/100` : "–", "highest paid-push likelihood")));

  out.push(buildTimelineCard(report));

  if (report.insights?.length) {
    out.push(el("section", { class: "card insights", "aria-labelledby": "insH" },
      el("h2", { class: "sec", id: "insH", text: "Headline insights" }),
      el("ul", {}, report.insights.map((t) => el("li", { text: t })))));
  }

  out.push(el("section", { "aria-labelledby": "clH" },
    el("h2", { class: "sec", id: "clH", text: "Clusters, ranked by paid-push likelihood" }),
    el("p", { class: "sec-note", text: "A cluster is a group of similar posts that appeared close together in time. The score blends seven signals, and a high score means the pattern resembles a bought campaign. It is an estimate, not proof." }),
    state.ranked.length
      ? el("div", { class: "clusters" }, state.ranked.map((c) => clusterCard(c)))
      : el("div", { class: "card state" }, el("p", { text: "No distinct clusters stood out. The chatter looks like steady background activity." }))));

  $("#results").replaceChildren(...out);
  $("#results").classList.remove("stale");
  state.chart?.draw();
}

function stat(value, label) {
  return el("div", { class: "card stat" }, el("div", { class: "v", text: value }), el("div", { class: "l", text: label }));
}

/* ------------------------------------------------------------------ timeline chart */
const SIGNALS = [
  ["disclosure", "Ad disclosures", "Share of posts saying #ad, sponsored, paid partnership, discount codes."],
  ["synchronicity", "Posted in sync", "How tightly the posts bunch together in time."],
  ["titleSimilarity", "Template-like titles", "Titles that reuse the same phrases, as briefs often dictate."],
  ["creatorDiversity", "Many different creators", "Lots of distinct creators rather than one person posting a lot."],
  ["newCreatorShare", "New to the game", "Creators who had not covered this game earlier in the window."],
  ["platformSpread", "Cross-platform spread", "How many platforms the wave touches."],
  ["engagementSkew", "Views in a few hits", "High means a few posts took most views (viral). Low means evenly spread, typical of bought coverage."],
];

function niceScale(max) {
  const m = Math.max(1, max);
  const raw = m / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((f) => f * pow).find((s) => s >= raw) || pow * 10;
  const top = Math.ceil(m / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

function buildTimelineCard(report) {
  const tl = report.timeline || [];
  const sources = colorOrder.filter((id) => tl.some((b) => b.bySource?.[id] > 0));
  const totalBy = (id) => tl.reduce((s, b) => s + (b.bySource?.[id] || 0), 0);

  const host = el("div", {
    class: "chart-wrap", tabindex: "0", role: "group",
    "aria-label": "Timeline of posts per time bucket, stacked by platform. Use left and right arrow keys to read each bucket; a data table follows.",
  });
  const tip = el("div", { class: "tip", hidden: true, "aria-hidden": "true" });

  const legend = el("div", { class: "legend" },
    sources.map((id) => el("span", { class: "it" },
      el("span", { class: "sw", style: `background:${srcColor(id)}` }),
      `${srcName(id)} ${fmtFull(totalBy(id))}`)),
    report.bursts?.length ? el("span", { class: "it" }, el("span", { class: "sw burst" }), "Burst window (unusual spike)") : null,
    state.ranked.length ? el("span", { class: "it" }, el("span", { class: "sw bandkey" }), "Numbered bands are clusters (red = likelier paid push), tap to select") : null);

  const bucketMs = (report.bucketHours || (tl.length > 1 ? (new Date(tl[1].t) - new Date(tl[0].t)) / HOUR : 24)) * HOUR;

  const table = el("details", { class: "tbl" },
    el("summary", { text: "Show data as a table" }),
    el("div", { class: "tbl-scroll", tabindex: "0", role: "region", "aria-label": "Timeline data table" },
      el("table", {},
        el("thead", {}, el("tr", {},
          el("th", { scope: "col", text: "Bucket start" }),
          sources.map((id) => el("th", { scope: "col", text: srcName(id) })),
          el("th", { scope: "col", text: "Total" }),
          el("th", { scope: "col", text: "Views" }))),
        el("tbody", {}, tl.map((b) => el("tr", {},
          el("th", { scope: "row", text: fmtDayHour(b.t) }),
          sources.map((id) => el("td", { text: fmtFull(b.bySource?.[id] || 0) })),
          el("td", { text: fmtFull(b.count) }),
          el("td", { text: fmtNum(b.views) })))))));

  const card = el("section", { class: "card chart-card", "aria-labelledby": "tlH" },
    el("h2", { id: "tlH", text: "Buzz over time" }),
    el("p", { class: "sec-note", text: `Posts per ${bucketMs / HOUR >= 24 ? Math.round(bucketMs / DAY) + "-day" : Math.round(bucketMs / HOUR) + "-hour"} bucket, stacked by platform.` }),
    legend, host, table);

  /* chart state */
  let hover = -1;
  let lastW = 0;
  let geo = null;

  function draw() {
    const W = Math.floor(host.clientWidth);
    if (!W) return;
    lastW = W;
    const narrow = W < 480;
    const m = { l: 36, r: 10, t: 10, b: 24 };
    const plotH = narrow ? 150 : 200;
    const pw = W - m.l - m.r;
    const b0 = +new Date(tl[0].t);
    const t0 = Math.min(+new Date(report.range.start), b0);
    const t1 = Math.max(+new Date(report.range.end), +new Date(tl[tl.length - 1].t) + bucketMs);
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * pw;
    const maxCount = Math.max(1, ...tl.map((b) => b.count || 0));
    const { top, ticks } = niceScale(maxCount);
    const y = (v) => m.t + plotH - (v / top) * plotH;

    const s = svg("svg", { viewBox: `0 0 ${W} 10`, width: W, role: "img", "aria-hidden": "true", focusable: "false" });

    // gridlines + y labels
    for (const v of ticks) {
      s.append(svg("line", { class: v === 0 ? "axis" : "grid", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      s.append(svg("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, document.createTextNode(fmtNum(v))));
    }
    // x ticks
    const nt = Math.max(2, Math.floor(pw / 90));
    for (let i = 0; i <= nt; i++) {
      const t = t0 + ((t1 - t0) * i) / nt;
      s.append(svg("text", { x: x(t), y: m.t + plotH + 16, "text-anchor": i === nt ? "end" : i === 0 ? "start" : "middle" }, document.createTextNode(fmtDay(t))));
    }
    // selected cluster span
    const sel = state.ranked.find((c) => c.id === state.selected);
    if (sel) {
      const xa = x(+new Date(sel.start)), xb = Math.max(x(+new Date(sel.end)), xa + 4);
      s.append(svg("rect", { class: "selspan", x: xa, y: m.t, width: xb - xa, height: plotH }));
    }
    // bursts
    for (const b of report.bursts || []) {
      const xa = x(+new Date(b.start));
      const xb = Math.max(x(Math.max(+new Date(b.end), +new Date(b.start) + bucketMs)), xa + 3);
      s.append(svg("rect", { class: "burst", x: xa, y: m.t, width: xb - xa, height: plotH }));
    }
    // stacked bars
    const bw = (bucketMs / (t1 - t0)) * pw;
    const gap = bw > 6 ? 2 : bw > 3 ? 1 : 0;
    const bars = svg("g");
    tl.forEach((b) => {
      const bx = x(+new Date(b.t)) + gap / 2;
      let acc = 0;
      for (const id of colorOrder) {
        const v = b.bySource?.[id] || 0;
        if (!v) continue;
        const yTop = y(acc + v), yBot = y(acc);
        const h = yBot - yTop;
        const sp = h > 3 ? 1 : 0;      // 1px surface gap between stacked segments
        bars.append(svg("rect", { x: bx, y: yTop + sp, width: Math.max(1, bw - gap), height: Math.max(1, h - sp), fill: srcColor(id) }));
        acc += v;
      }
    });
    s.append(bars);

    const cross = svg("line", { class: "cross", y1: m.t, y2: m.t + plotH, visibility: "hidden" });
    s.append(cross);

    // hit layer
    const hit = svg("rect", { x: m.l, y: m.t, width: pw, height: plotH, fill: "transparent", style: "cursor:crosshair" });
    s.append(hit);

    // cluster lanes
    const laneTop = m.t + plotH + 26;
    const laneH = 20, laneGap = 4;
    const lanesEnd = [];
    const placed = [...state.ranked].sort((a, b) => +new Date(a.start) - +new Date(b.start)).map((c) => {
      const xa = x(+new Date(c.start)), xb = x(+new Date(c.end));
      const w = Math.max(24, xb - xa);
      const cx = clamp((xa + xb) / 2, m.l + w / 2, W - m.r - w / 2);
      const x0 = cx - w / 2;
      let lane = lanesEnd.findIndex((e) => e + 3 <= x0);
      if (lane < 0) { lane = lanesEnd.length; lanesEnd.push(0); }
      lanesEnd[lane] = x0 + w;
      return { c, x0, w, lane };
    });
    placed.forEach(({ c, x0, w, lane }) => {
      const rank = state.rankOf.get(c.id);
      const lvl = levelOf(c.campaignScore);
      const g = svg("g", {
        class: `band ${lvl}${c.id === state.selected ? " sel" : ""}`, tabindex: 0, role: "button",
        "aria-pressed": c.id === state.selected ? "true" : "false",
        "aria-label": `Cluster ${rank}: ${c.label}. Paid-push likelihood ${Math.round(c.campaignScore)} out of 100. Press to select.`,
      },
        svg("rect", { x: x0, y: laneTop + lane * (laneH + laneGap), width: w, height: laneH, rx: 5 }),
        svg("text", { x: x0 + w / 2, y: laneTop + lane * (laneH + laneGap) + 14 }, document.createTextNode(String(rank))));
      g.addEventListener("click", () => selectCluster(c.id, { scroll: true }));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCluster(c.id, { scroll: true }); } });
      s.append(g);
    });
    const H = lanesEnd.length ? laneTop + lanesEnd.length * (laneH + laneGap) : m.t + plotH + m.b;
    s.setAttribute("viewBox", `0 0 ${W} ${H}`);
    s.setAttribute("height", H);

    geo = { m, W, pw, t0, t1, x, cross };
    host.replaceChildren(s, tip);
    tip.hidden = true;

    const idxAt = (clientX) => {
      const r = hit.getBoundingClientRect();
      const t = t0 + ((clientX - r.left) / r.width) * pw * ((t1 - t0) / pw);
      return clamp(Math.floor((t - b0) / bucketMs), 0, tl.length - 1);
    };
    const onMove = (e) => showTip(idxAt(e.clientX));
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerdown", onMove);
    hit.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && document.activeElement !== host) hideTip(); });
    if (hover >= 0 && document.activeElement === host) showTip(Math.min(hover, tl.length - 1));
  }

  function hideTip() { hover = -1; tip.hidden = true; geo?.cross.setAttribute("visibility", "hidden"); }

  function showTip(idx) {
    if (!geo) return;
    hover = idx;
    const b = tl[idx];
    const bs = +new Date(b.t);
    const be = bs + bucketMs;
    const cx = geo.x(bs + bucketMs / 2);
    geo.cross.setAttribute("x1", cx); geo.cross.setAttribute("x2", cx); geo.cross.setAttribute("visibility", "visible");

    const rows = colorOrder.filter((id) => b.bySource?.[id] > 0).reverse().map((id) =>
      el("div", { class: "t-row" }, el("i", { style: `background:${srcColor(id)}` }), el("span", { text: srcName(id) }), el("b", { text: fmtFull(b.bySource[id]) })));
    const notes = [];
    for (const bu of report.bursts || []) {
      if (+new Date(bu.start) < be && Math.max(+new Date(bu.end), +new Date(bu.start) + bucketMs) > bs) {
        notes.push(`Burst window: about ${Number.isFinite(bu.z) ? bu.z.toFixed(1) : "?"}σ above the usual ${Number.isFinite(bu.baseline) ? Math.round(bu.baseline * 10) / 10 : "?"} posts per bucket.`);
      }
    }
    for (const c of state.ranked) {
      if (+new Date(c.start) < be && +new Date(c.end) >= bs) notes.push(`Cluster ${state.rankOf.get(c.id)}: ${Math.round(c.campaignScore)}/100 paid-push likelihood.`);
    }
    tip.replaceChildren(
      el("div", { class: "t-date", text: fmtRange(bs, be - 1) + (bucketMs < DAY ? ` · ${new Date(bs).toLocaleTimeString(undefined, { hour: "numeric" })}` : "") }),
      el("div", { class: "t-total", text: `${fmtFull(b.count)} ${b.count === 1 ? "post" : "posts"}` }),
      ...rows,
      Number.isFinite(b.views) && b.views > 0 ? el("div", { class: "t-row" }, el("span", { text: "Total views" }), el("b", { text: fmtNum(b.views) })) : null,
      ...notes.slice(0, 3).map((n) => el("div", { class: "t-note", text: n })));
    tip.hidden = false;
    const w = tip.offsetWidth;
    let left = cx + 12;
    if (left + w > geo.W) left = cx - w - 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${geo.m.t + 4}px`;
  }

  host.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
    if (e.key === "Escape") { hideTip(); return; }
    e.preventDefault();
    let i = hover < 0 ? tl.reduce((best, b, k) => (b.count > tl[best].count ? k : best), 0) : hover;
    if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
    if (e.key === "ArrowRight") i = Math.min(tl.length - 1, i + 1);
    if (e.key === "Home") i = 0;
    if (e.key === "End") i = tl.length - 1;
    showTip(i);
  });
  host.addEventListener("focus", () => { if (hover < 0 && tl.length) { hover = tl.reduce((best, b, k) => (b.count > tl[best].count ? k : best), 0); showTip(hover); } });
  host.addEventListener("blur", () => hideTip());

  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { if (Math.floor(host.clientWidth) !== lastW) draw(); }) : null;
  ro?.observe(host);
  state.chart = { draw, dispose: () => ro?.disconnect(), host: card };
  return card;
}

/* ------------------------------------------------------------------ clusters */
function selectCluster(id, { scroll = false } = {}) {
  state.selected = state.selected === id && !scroll ? null : id;
  document.querySelectorAll(".cluster").forEach((n) => n.classList.toggle("sel", n.dataset.id === state.selected));
  state.chart?.draw();
  if (state.selected && scroll) {
    const card = document.querySelector(`.cluster[data-id="${CSS.escape(state.selected)}"]`);
    if (card) {
      const sig = card.querySelector("details.sig-box");
      if (sig) sig.open = true;
      card.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }
  }
}

function clusterPosts(c) {
  return (c.postIds || []).map((id) => state.postsById.get(id)).filter(Boolean);
}
function postItem(p) {
  const title = (p.title && p.title.trim()) || (p.text && p.text.trim().slice(0, 140)) || "(untitled post)";
  const m = p.metrics || {};
  const meta = [
    p.author ? el("span", { text: p.author }) : null,
    el("span", { text: srcName(p.source) }),
    Number.isFinite(m.views) ? el("span", { text: `${fmtNum(m.views)} views` }) : Number.isFinite(m.viewers) ? el("span", { text: `${fmtNum(m.viewers)} viewers` }) : null,
    Number.isFinite(+new Date(p.publishedAt)) ? el("span", { text: fmtDay(p.publishedAt) }) : null,
  ];
  return el("li", { class: "post" }, extLink(p.url, title, { class: "pt" }), el("div", { class: "pm" }, meta));
}

function clusterCard(c) {
  const rank = state.rankOf.get(c.id);
  const lvl = levelOf(c.campaignScore);
  const arch = ARCHETYPES[c.archetype];
  const archName = arch?.name || humanize(c.archetype || "unknown");
  const posts = clusterPosts(c);
  const srcList = Object.keys(c.sources || {}).filter((k) => c.sources[k] > 0).map(srcName);
  const score = Math.round(c.campaignScore);
  const meterColor = lvl === "hi" ? "var(--meter-hi)" : lvl === "mid" ? "var(--meter-mid)" : "var(--meter-lo)";

  const top = (c.topPosts || []).map((id) => state.postsById.get(id)).filter(Boolean).slice(0, 5);
  const allBox = el("div", { class: "allposts", hidden: true });
  const toggle = el("button", { class: "link-btn", type: "button", "aria-expanded": "false" , text: `Show all ${fmtFull(posts.length)} posts in this cluster` });
  let filled = false;
  toggle.addEventListener("click", () => {
    const open = allBox.hidden;
    if (open && !filled) {
      const sorted = [...posts].sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0) || +new Date(b.publishedAt) - +new Date(a.publishedAt));
      allBox.replaceChildren(el("ul", { class: "posts" }, sorted.map(postItem)));
      filled = true;
    }
    allBox.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide all posts" : `Show all ${fmtFull(posts.length)} posts in this cluster`;
  });

  const card = el("article", { class: `card cluster${c.id === state.selected ? " sel" : ""}`, "data-id": c.id, "aria-label": `Cluster ${rank}: ${c.label}` },
    el("div", { class: "c-head" },
      el("span", { class: `rank ${lvl}`, "aria-hidden": "true", text: `#${rank}` }),
      el("div", { class: "c-title" },
        el("h3", { text: c.label }),
        el("p", { class: "c-meta", text: `${fmtRange(c.start, c.end)} · ${plural(posts.length || (c.postIds || []).length, "post")} · ${plural(c.creators || 0, "creator")}${srcList.length ? " · " + srcList.join(", ") : ""}` }),
        el("div", { class: "badge-row" },
          el("span", { class: "badge", text: archName }),
          el("button", { class: "link-btn", type: "button", text: "What is this?", onclick: (e) => openExplainer(c.archetype, e.currentTarget) }),
          el("button", { class: "link-btn", type: "button", text: "Show on timeline", onclick: () => { selectCluster(c.id); state.chart?.host.scrollIntoView({ block: "nearest", behavior: "smooth" }); } })))),
    el("div", { class: "c-top" },
      el("div", { class: "score" },
        el("div", { class: "num" }, el("b", { text: String(score) }), el("span", { text: "/ 100 paid-push likelihood" })),
        el("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(score), "aria-label": "Paid-push likelihood" },
          el("i", { style: `width:${clamp(score, 0, 100)}%;background:${meterColor}` })),
        el("div", { class: `verdict ${lvl}`, text: LEVEL_TEXT[lvl] }),
        c.reasons?.length ? el("ul", { class: "reasons" }, c.reasons.map((r) => el("li", { text: r }))) : null),
      el("details", { class: "sig-box", open: rank <= 3 },
        el("summary", { text: "Signal breakdown" }),
        el("div", { class: "signals" }, SIGNALS.map(([key, label, hint]) => {
          const v = pct(c.signals?.[key]);
          return el("div", { class: "sig", title: hint },
            el("span", { class: "n", text: label }),
            el("span", { class: "p", text: `${v}%` }),
            el("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(v), "aria-label": label }, el("i", { style: `width:${v}%` })));
        })))),
    c.keywords?.length ? el("div", { class: "chipset", "aria-label": "Keywords" }, c.keywords.slice(0, 12).map((k) => el("span", { class: "kw", text: k }))) : null,
    top.length ? el("h4", { class: "sub", text: "Top posts" }) : null,
    top.length ? el("ul", { class: "posts" }, top.map(postItem)) : null,
    posts.length > top.length ? toggle : null,
    allBox);
  card.addEventListener("click", (e) => {
    if (e.target.closest("a, button, summary, input")) return;
    selectCluster(c.id);
  });
  return card;
}

/* ------------------------------------------------------------------ explainer dialog */
function openExplainer(id, opener) {
  const dlg = $("#explainer");
  const a = ARCHETYPES[id];
  $("#explainerTitle").textContent = a?.name || humanize(id || "unknown");
  const body = $("#explainerBody");
  if (!a) {
    body.replaceChildren(el("p", { text: "No explainer is available for this pattern yet." }));
  } else {
    const list = (arr) => el("ul", {}, (arr || []).map((t) => el("li", { text: t })));
    body.replaceChildren(el("div", { class: "prose" },
      a.oneLiner ? el("p", { class: "one", text: a.oneLiner }) : null,
      a.whatItIs ? [el("h3", { text: "What it is" }), el("p", { text: a.whatItIs })] : null,
      a.howToSpot?.length ? [el("h3", { text: "How to spot it" }), list(a.howToSpot)] : null,
      a.whyStudiosDoIt ? [el("h3", { text: "Why studios do it" }), el("p", { text: a.whyStudiosDoIt })] : null,
      a.typicalCost ? [el("h3", { text: "Typical cost" }), el("p", { text: a.typicalCost })] : null,
      a.examples?.length ? [el("h3", { text: "Examples" }), el("ul", {}, a.examples.map((x) =>
        el("li", { class: "ex" },
          el("b", { text: `${x.game}${x.year ? ` (${x.year})` : ""}` }), x.note ? ` — ${x.note} ` : " ",
          safeHref(x.sourceUrl) ? extLink(x.sourceUrl, "Source ↗") : null)))] : null,
      el("p", {}, el("a", { href: "#learn", text: "Learn more about media buying", onclick: () => dlg.close() }))));
  }
  try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
  $("#explainerClose").focus();
  dlg._opener = opener;
}

/* ------------------------------------------------------------------ learn */
let learnBuilt = false;
function renderLearn() {
  if (learnBuilt) return;
  learnBuilt = true;
  const host = $("#view-learn");
  const lessons = el("div", {}, (LESSONS || []).map((l) =>
    el("article", { class: "card lesson", id: `lesson-${l.id}` },
      el("h3", { text: l.title }),
      (l.body || []).map((p) => el("p", { text: p })),
      l.sources?.length ? el("div", { class: "srcs" }, "Sources", el("ul", {}, l.sources.map((s) => el("li", {}, extLink(s.url, s.title || s.url))))) : null)));

  const terms = (GLOSSARY || []).map((g) => ({ g, node: el("div", { class: "term" }, el("dt", { text: g.term }), el("dd", { text: g.definition })) }));
  const filter = el("input", { type: "search", id: "glossFilter", placeholder: "Filter terms…", autocomplete: "off" });
  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    for (const t of terms) t.node.hidden = !!q && !(t.g.term + " " + t.g.definition).toLowerCase().includes(q);
  });

  const arch = el("div", { class: "arch-grid" }, Object.entries(ARCHETYPES || {}).map(([id, a]) =>
    el("button", { class: "arch-btn", type: "button", onclick: (e) => openExplainer(id, e.currentTarget) }, el("b", { text: a.name }), el("span", { text: a.oneLiner || "" }))));

  host.replaceChildren(
    el("h2", { class: "page-title", text: "Learn media buying" }),
    el("p", { class: "lede", text: "Media buying is how studios pay for attention: creator sponsorships, ads, launch campaigns. Knowing the vocabulary and the patterns makes the clusters in Radar much easier to read." }),
    el("section", { "aria-labelledby": "archH" }, el("h2", { class: "sec", id: "archH", text: "Patterns Buzz Radar looks for" }), arch),
    el("div", { class: "cols" },
      el("section", { "aria-label": "Lessons" }, lessons),
      el("section", { class: "card gloss", "aria-labelledby": "glH" },
        el("h2", { class: "sec", id: "glH", text: "Glossary" }),
        el("label", { for: "glossFilter", class: "sec-note", text: "Filter the glossary" }), filter,
        el("dl", {}, terms.map((t) => t.node)))));
}

/* ------------------------------------------------------------------ settings */
function renderSettings() {
  const host = $("#view-settings");
  const wasOpen = host.childElementCount > 0;
  const status = el("p", { class: "status", role: "status", "aria-live": "polite", id: "setStatus" });
  const reveal = el("input", { type: "checkbox", id: "revealKeys" });
  const form = el("form", { autocomplete: "off" },
    SOURCES.map((s) => {
      const fields = s.keyFields || [];
      const k = state.keys[s.id] || {};
      return el("section", { class: "card set-src" },
        el("fieldset", {},
          el("legend", { text: s.name }),
          !fields.length ? el("p", { class: "sec-note", text: "No key needed. This source works out of the box." }) : null,
          s.needsKey ? null : fields.length ? el("p", { class: "sec-note", text: "Works without a key; adding one is optional and improves results." }) : null,
          fields.map((f) => {
            const id = `key-${s.id}-${f.name}`;
            const secret = /key|secret|token|password/i.test(f.name);
            return el("div", { class: "set-f" },
              el("label", { for: id }, f.label || f.name, f.optional && !/optional/i.test(f.label || "") ? el("span", { class: "opt", text: " (optional)" }) : null),
              el("input", { id, type: secret ? "password" : "text", "data-src": s.id, "data-field": f.name, value: k[f.name] || "", autocomplete: "off", spellcheck: "false", autocapitalize: "off", "data-secret": secret ? "1" : null }),
              el("p", { class: "help" }, f.help ? `${f.help} ` : "", f.url ? extLink(f.url, "Get one ↗") : null));
          })));
    }),
    el("div", { class: "set-bar" },
      el("button", { class: "btn primary", type: "submit", text: "Save keys" }),
      el("button", { class: "btn", type: "button", text: "Clear all keys", onclick: () => { store.remove(KEYS_STORE); state.keys = {}; renderSettings(); resetChips("idle"); renderChips(); $("#setStatus").textContent = "All keys cleared."; } }),
      el("label", { class: "chk" }, reveal, "Show keys")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const keys = {};
    form.querySelectorAll("input[data-src]").forEach((inp) => {
      const v = inp.value.trim();
      if (!v) return;
      (keys[inp.dataset.src] ||= {})[inp.dataset.field] = v;
    });
    state.keys = keys;
    store.set(KEYS_STORE, JSON.stringify(keys));
    if (!state.loading) { resetChips("idle"); renderChips(); }
    $("#setStatus").textContent = storageOk ? "Saved in this browser." : "Saved for this tab only. Your browser is blocking storage, so keys will be forgotten when you leave.";
  });
  reveal.addEventListener("change", () => form.querySelectorAll("input[data-secret]").forEach((i) => { i.type = reveal.checked ? "text" : "password"; }));

  host.replaceChildren(
    el("h2", { class: "page-title", text: "Settings" }),
    el("p", { class: "lede", text: "API keys unlock more platforms. Free sources work without any setup." }),
    el("div", { class: "banner privacy", role: "note", text: "Keys stay in this browser. They are stored in localStorage on this device and sent only to the platform they belong to, directly from your browser. There is no Buzz Radar server. Anyone with access to this browser profile could read them, so use restricted, read-only keys." }),
    form, status);
  if (wasOpen) { /* re-render keeps scroll since host is replaced in place */ }
}

/* ------------------------------------------------------------------ export */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const slug = () => (state.game || "game").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "game";
const stamp = () => new Date().toISOString().slice(0, 10);

function exportJson() {
  if (!state.report) return;
  const payload = { generatedAt: new Date().toISOString(), tool: "Buzz Radar", demo: state.demo, game: state.game, sinceDays: state.days, report: state.report };
  download(`buzz-radar-${slug()}-${stamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
}
function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv() {
  if (!state.report) return;
  const clusterOf = new Map();
  for (const c of state.ranked) for (const id of c.postIds || []) if (!clusterOf.has(id)) clusterOf.set(id, c);
  const head = ["id", "source", "kind", "url", "title", "text", "author", "author_followers", "published_at", "views", "likes", "comments", "viewers", "tags", "cluster_rank", "cluster_label", "cluster_score", "cluster_archetype"];
  const rows = state.posts.map((p) => {
    const c = clusterOf.get(p.id);
    return [p.id, p.source, p.kind, p.url, p.title, (p.text || "").slice(0, 500), p.author, p.authorFollowers, p.publishedAt,
      p.metrics?.views, p.metrics?.likes, p.metrics?.comments, p.metrics?.viewers, (p.tags || []).join(" "),
      c ? state.rankOf.get(c.id) : "", c?.label, c ? Math.round(c.campaignScore) : "", c?.archetype];
  });
  download(`buzz-radar-${slug()}-${stamp()}.csv`, [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
}

/* ------------------------------------------------------------------ init */
function init() {
  // Remember last game / range, then let ?game= override.
  const last = readLast();
  const params = new URLSearchParams(location.search);
  const qGame = (params.get("game") || "").trim();
  const qDays = Number(params.get("days"));
  const input = $("#gameInput");
  input.value = qGame || last?.game || "";
  setDays([7, 14, 30, 90].includes(qDays) ? qDays : [7, 14, 30, 90].includes(last?.days) ? last.days : 30);

  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); runSearch(false); });
  $("#demoBtn").addEventListener("click", () => {
    if (!input.value.trim()) input.value = "Demo Quest";
    runSearch(true);
  });
  $("#cancelBtn").addEventListener("click", cancelSearch);

  const dlg = $("#explainer");
  $("#explainerClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { try { dlg._opener?.focus(); } catch { /* ignore */ } });

  $(".skip").addEventListener("click", (e) => { e.preventDefault(); $("#main").focus(); });
  window.addEventListener("hashchange", () => { showTab(); window.scrollTo(0, 0); });

  renderLearn();
  resetChips("idle");
  renderChips();
  showTab();

  if (qGame) runSearch(params.get("demo") === "1");
}
init();
