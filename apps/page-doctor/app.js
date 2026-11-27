// Page Doctor UI. Pure engine lives in ./doctor.js; data in ./data/corpus.json.
import { findComparables, diagnose, rewriteRequest } from './doctor.js';

/* ---------- shared helpers (identical in both apps) ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Tiny DOM builder. Text always goes through textContent / text nodes, never innerHTML. */
function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...kids) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  for (const kid of kids.flat()) if (kid) node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return node;
}

/** Only https links are ever rendered as links. */
function safeUrl(u) {
  if (typeof u !== 'string') return null;
  try { const x = new URL(u.trim()); return x.protocol === 'https:' ? x.href : null; } catch { return null; }
}
function link(url, text, cls) {
  const href = safeUrl(url);
  if (!href) return h('span', { class: cls, text });
  return h('a', { href, class: cls, target: '_blank', rel: 'noopener noreferrer', text });
}
/** Image that falls back to a lettered tile when missing, non-https or broken. */
function picture(url, alt, cls, letter) {
  const src = safeUrl(url);
  const fallback = () => h('div', { class: `${cls} thumb-fallback`, 'aria-hidden': 'true', text: (letter || alt || '?').trim().charAt(0).toUpperCase() });
  if (!src) return fallback();
  const img = h('img', { class: cls, src, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

const nf = new Intl.NumberFormat('en-US');
const fmtInt = (n) => (n == null || Number.isNaN(n) ? '–' : nf.format(Math.round(n)));
function fmtCompact(n) {
  if (n == null || Number.isNaN(n)) return '–';
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n));
}
function fmtDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const daysSince = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 864e5); };
const humanize = (key) => String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));

/** localStorage that never throws. */
const store = {
  ok: true,
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { this.ok = false; return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { this.ok = false; return false; } },
  del(key) { try { localStorage.removeItem(key); } catch { this.ok = false; } },
  getJson(key, fallback) { const v = this.get(key); if (v == null) return fallback; try { return JSON.parse(v); } catch { return fallback; } },
  setJson(key, value) { return this.set(key, JSON.stringify(value)); },
};

let toastTimer = 0;
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
async function copyText(text, okMsg = 'Copied to clipboard') {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; } catch { /* fall through */ }
  const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0' });
  ta.value = text; document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); toast(ok ? okMsg : 'Copy failed: select the text and copy it manually'); return ok;
}
function download(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = h('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
/** Renders the "sample data" banner + "updated" line shared by both apps. */
function renderDataStatus(data, lineEl, bannerEl, countText) {
  const when = data.generatedAt ? fmtDateTime(data.generatedAt) : 'unknown';
  lineEl.textContent = `${countText} · Data updated ${when}`;
  clear(bannerEl);
  if (data.source === 'sample') {
    bannerEl.append(h('div', { class: 'banner sample', role: 'note' },
      h('span', { class: 'ico', 'aria-hidden': 'true', text: '!' }),
      h('div', null, h('strong', { text: 'Sample data. ' }),
        'This is a built-in sample, not live Steam data, so numbers and names are illustrative. The daily refresh replaces it with real data once the site has been published.')));
  }
}

/* ---------- Page Doctor ---------- */
const KEY_STORE = 'page-doctor:anthropic-key';
const AREAS = [
  ['capsule', 'Capsule and first impression'], ['description', 'Description'], ['tags', 'Tags'], ['media', 'Screenshots and trailer'],
  ['price', 'Price'], ['languages', 'Languages'], ['social-proof', 'Social proof'], ['timing', 'Release timing'],
];
const STATUS_LABEL = { pass: 'Pass', warn: 'Warn', fail: 'Fail' };
const STATUS_RANK = { fail: 0, warn: 1, pass: 2 };

let corpus = null;
let current = null; // { game, comps, diag, manual }
let manualTags = [];
let manualLangs = new Set();

const els = {
  dataLine: $('#dataLine'), banners: $('#banners'), form: $('#searchForm'), q: $('#q'), searchBtn: $('#searchBtn'),
  pickList: $('#pickList'), examples: $('#examples'), exampleChips: $('#exampleChips'), notFound: $('#notFound'),
  results: $('#results'), tabManual: $('#tabManual'), tabSearch: $('#tabSearch'), panelManual: $('#panelManual'), panelSearch: $('#panelSearch'),
};

/* ---------- boot ---------- */
(async function boot() {
  try {
    corpus = await loadJson('./data/corpus.json');
    if (!corpus || !Array.isArray(corpus.games)) throw new Error('corpus.json has no games array');
  } catch (err) {
    els.dataLine.textContent = 'Dataset unavailable';
    els.banners.append(h('div', { class: 'banner error', role: 'alert' },
      h('span', { class: 'ico', 'aria-hidden': 'true', text: '!' }),
      h('div', null, h('strong', { text: 'Could not load the game dataset. ' }), `${err.message}. You can still audit your own page with "Paste your page details" once the dataset is back; comparisons need it.`)));
    return;
  }
  renderDataStatus(corpus, els.dataLine, els.banners, `${fmtInt(corpus.games.length)} games`);
  els.q.disabled = false; els.searchBtn.disabled = false; $('#mSubmit').disabled = false;
  buildManualControls();
  buildExamples();
  const m = location.hash.match(/appid=(\d+)/);
  if (m) { selectTab('search'); auditAppid(Number(m[1]), { scroll: false }); }
})();

/* ---------- search ---------- */
function parseAppid(q) {
  const m = q.match(/\/app\/(\d+)/) || q.match(/^\s*(?:appid\s*[:=]?\s*)?(\d{2,9})\s*$/i);
  return m ? Number(m[1]) : null;
}
function searchGames(q, limit = 8) {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  const scored = [];
  for (const g of corpus.games) {
    const name = String(g.name || '').toLowerCase();
    const i = name.indexOf(n);
    if (i < 0) continue;
    scored.push({ g, s: name === n ? 0 : i === 0 ? 1 : /\W/.test(name[i - 1] || ' ') ? 2 : 3 });
  }
  return scored.sort((a, b) => a.s - b.s || String(a.g.name).localeCompare(String(b.g.name))).slice(0, limit).map((x) => x.g);
}
function gameMeta(g) {
  const bits = [];
  if (g.releaseDate) bits.push(g.releaseDate);
  if (g.reviews && g.reviews.positivePct != null) bits.push(`${g.reviews.positivePct}% positive`);
  if (g.developers && g.developers[0]) bits.push(g.developers[0]);
  return bits.join(' · ');
}
function renderPickList(q) {
  clear(els.pickList);
  if (!q.trim() || parseAppid(q) != null) return;
  const hits = searchGames(q);
  if (!hits.length) {
    els.pickList.append(h('li', { class: 'fine', text: 'No game with that name in the dataset. Press Audit to see what to do next.' }));
    return;
  }
  for (const g of hits) {
    els.pickList.append(h('li', null, h('button', { type: 'button', onclick: () => auditGame(g) },
      picture(g.capsuleImage || g.headerImage, '', 'pl-img', g.name),
      h('span', { class: 'pl-name' }, g.name, h('span', { class: 'pl-meta', text: gameMeta(g) })))));
  }
}
els.q.addEventListener('input', () => { els.notFound.hidden = true; renderPickList(els.q.value); });
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = els.q.value.trim();
  if (!q) { els.q.focus(); return; }
  const appid = parseAppid(q);
  if (appid != null) return auditAppid(appid);
  const hits = searchGames(q);
  const exact = hits.find((g) => String(g.name).toLowerCase() === q.toLowerCase());
  if (exact || hits.length === 1) return auditGame(exact || hits[0]);
  if (hits.length > 1) { renderPickList(q); $('button', els.pickList)?.focus(); return; }
  showNotFound(q);
});
function buildExamples() {
  const ex = corpus.games.slice(0, 5);
  if (!ex.length) return;
  for (const g of ex) els.exampleChips.append(h('li', null, h('button', { type: 'button', class: 'chip', onclick: () => auditGame(g), text: g.name })));
  els.examples.hidden = false;
}
function showNotFound(what) {
  clear(els.results); clear(els.notFound);
  els.notFound.append(
    h('h3', { text: "Not in today's dataset" }),
    h('p', null, h('strong', { text: what }), " isn't one of the games in today's dataset, so it can't be compared yet."),
    h('p', null, "Once it's added to the watchlist it will be included in tomorrow's daily refresh. To add it, ask in chat (the watchlist is a small file the assistant edits for you)."),
    h('p', null, 'Want results now? ', h('button', { type: 'button', class: 'linklike', onclick: () => selectTab('manual', true), text: 'Enter your page details' }), ' and audit any game, released or not, right away.'));
  els.notFound.hidden = false;
}
function auditAppid(appid, opts) {
  const g = corpus.games.find((x) => Number(x.appid) === appid);
  if (!g) { history.replaceState(null, '', location.pathname + location.search); return showNotFound(`appid ${appid}`); }
  auditGame(g, opts);
}
function auditGame(game, opts = {}) {
  els.notFound.hidden = true; clear(els.pickList);
  els.q.value = game.name;
  try { history.replaceState(null, '', `#appid=${game.appid}`); } catch { /* ignore */ }
  runAudit(game, false, opts);
}

/* ---------- manual form ---------- */
function selectTab(which, focus) {
  const manual = which === 'manual';
  els.tabManual.setAttribute('aria-selected', String(manual)); els.tabManual.tabIndex = manual ? 0 : -1;
  els.tabSearch.setAttribute('aria-selected', String(!manual)); els.tabSearch.tabIndex = manual ? -1 : 0;
  els.panelManual.hidden = !manual; els.panelSearch.hidden = manual;
  if (focus) (manual ? $('#mName') : els.q).focus();
}
els.tabManual.addEventListener('click', () => selectTab('manual'));
els.tabSearch.addEventListener('click', () => selectTab('search'));
for (const [from, key, to] of [[els.tabManual, 'ArrowRight', 'search'], [els.tabSearch, 'ArrowLeft', 'manual'], [els.tabManual, 'ArrowLeft', 'search'], [els.tabSearch, 'ArrowRight', 'manual']]) {
  from.addEventListener('keydown', (e) => { if (e.key === key) { e.preventDefault(); selectTab(to, false); (to === 'manual' ? els.tabManual : els.tabSearch).focus(); } });
}
function buildManualControls() {
  const tagList = $('#tagList');
  for (const t of Object.keys(corpus.tagIndex || {}).sort()) tagList.append(h('option', { value: t }));
  const freq = new Map();
  for (const g of corpus.games) for (const l of g.languages || []) freq.set(l, (freq.get(l) || 0) + 1);
  const langs = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([l]) => l);
  if (!langs.includes('English')) langs.unshift('English');
  const box = $('#mLangs');
  for (const l of langs) {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', dataset: { lang: l }, text: l });
    b.addEventListener('click', () => {
      if (manualLangs.has(l)) manualLangs.delete(l); else manualLangs.add(l);
      b.classList.toggle('on', manualLangs.has(l)); b.setAttribute('aria-pressed', String(manualLangs.has(l)));
    });
    box.append(h('li', null, b));
  }
  manualLangs.add('English'); $('[data-lang="English"]', box)?.classList.add('on'); $('[data-lang="English"]', box)?.setAttribute('aria-pressed', 'true');
}
function renderManualTags() {
  const ul = clear($('#mTags'));
  manualTags.forEach((t, i) => ul.append(h('li', { class: 'chip' }, h('small', { text: `${i + 1}` }), t,
    h('button', { type: 'button', class: 'x', 'aria-label': `Remove tag ${t}`, onclick: () => { manualTags.splice(i, 1); renderManualTags(); }, text: '×' }))));
}
function addManualTag() {
  const input = $('#mTagInput');
  for (const raw of input.value.split(',')) {
    const t = raw.trim();
    if (t && manualTags.length < 20 && !manualTags.some((x) => x.toLowerCase() === t.toLowerCase())) manualTags.push(t);
  }
  input.value = ''; renderManualTags();
}
$('#mTagAdd').addEventListener('click', addManualTag);
$('#mTagInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addManualTag(); } });
$('#mDesc').addEventListener('input', (e) => { $('#mDescCount').textContent = `${e.target.value.length} characters`; });
$('#manualForm').addEventListener('reset', () => {
  manualTags = []; manualLangs = new Set(['English']); renderManualTags(); $('#mError').hidden = true;
  $$('#mLangs .chip').forEach((b) => { const on = b.dataset.lang === 'English'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  $('#mDescCount').textContent = '0 characters';
});
$('#manualForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('#mTagInput').value.trim()) addManualTag();
  const desc = $('#mDesc').value.trim();
  const err = $('#mError');
  if (!desc && !manualTags.length) { err.textContent = 'Add at least a short description or some tags so there is something to audit.'; err.hidden = false; return; }
  err.hidden = true;
  const price = Math.max(0, parseFloat($('#mPrice').value) || 0);
  const shots = Math.max(0, parseInt($('#mShots').value, 10) || 0);
  const wishRaw = parseInt($('#mWish').value, 10);
  const wish = Number.isFinite(wishRaw) && wishRaw >= 0 ? wishRaw : null;
  const game = {
    appid: null, name: $('#mName').value.trim() || 'Your game', url: null,
    shortDescription: desc, aboutText: $('#mAbout').value.trim(),
    tags: manualTags.map((name, i) => ({ name, votes: Math.max(1, 1000 - i * 40) })), genres: [],
    priceUSD: price, isFree: price === 0, releaseDate: '', comingSoon: $('#mUnreleased').checked,
    developers: [], publishers: [], headerImage: null, capsuleImage: null,
    screenshots: Array.from({ length: shots }, () => ''), movies: $('#mTrailer').checked ? 1 : 0,
    languages: [...manualLangs], fullAudioLanguages: [],
    reviews: { total: null, positivePct: null, scoreDesc: null }, followers: wish, ownersRange: null, ccu: null, hasDemo: null, earlyAccess: false,
  };
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  els.notFound.hidden = true;
  runAudit(game, true, {});
});

/* ---------- audit + render ---------- */
function runAudit(game, manual, { scroll = true } = {}) {
  let comps; let diag;
  try {
    comps = findComparables(game, corpus, { limit: 20 }) || [];
    diag = diagnose(game, comps);
  } catch (err) {
    clear(els.results).append(h('div', { class: 'banner error', role: 'alert' }, h('span', { class: 'ico', 'aria-hidden': 'true', text: '!' }), h('div', null, h('strong', { text: 'The audit failed. ' }), String(err && err.message || err))));
    return;
  }
  current = { game, comps, diag, manual };
  renderReport();
  if (scroll) els.results.scrollIntoView({ block: 'start' });
}

function statusIcon(status) {
  const s = svg('svg', { class: 'dot', viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (status === 'pass') s.append(svg('circle', { cx: 8, cy: 8, r: 6.5 }), svg('path', { d: 'M5 8.2l2.2 2.2L11 6.2' }));
  else if (status === 'warn') s.append(svg('path', { d: 'M8 2l6.5 11.5h-13z' }), svg('path', { d: 'M8 6.5v3M8 11.6v.1' }));
  else s.append(svg('circle', { cx: 8, cy: 8, r: 6.5 }), svg('path', { d: 'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4' }));
  return s;
}
const badge = (status) => h('span', { class: `badge ${status}` }, statusIcon(status), STATUS_LABEL[status] || status);

function gradeTone(grade) { return { A: 'good', B: 'good', C: 'warn', D: 'serious', F: 'bad' }[String(grade).toUpperCase()] || 'warn'; }
function dial(score, tone) {
  const r = 52; const c = 2 * Math.PI * r; const pct = clampPct(score);
  const colour = { good: 'var(--good)', warn: 'var(--warn)', serious: 'var(--serious)', bad: 'var(--bad)' }[tone];
  const s = svg('svg', { class: 'dial', viewBox: '0 0 124 124', role: 'img', 'aria-label': `Score ${Math.round(pct)} out of 100` });
  s.append(svg('circle', { class: 'track', cx: 62, cy: 62, r, fill: 'none', 'stroke-width': 12 }),
    svg('circle', { class: 'arc', cx: 62, cy: 62, r, fill: 'none', 'stroke-width': 12, 'stroke-linecap': 'round', stroke: colour,
      'stroke-dasharray': c.toFixed(1), 'stroke-dashoffset': (c * (1 - pct / 100)).toFixed(1), transform: 'rotate(-90 62 62)' }),
    svg('text', { class: 'big', x: 62, y: 64, 'text-anchor': 'middle' }, String(Math.round(pct))),
    svg('text', { class: 'of', x: 62, y: 82, 'text-anchor': 'middle' }, 'out of 100'));
  return s;
}
const price$ = (g) => (g.isFree || g.priceUSD === 0 ? 'Free' : g.priceUSD == null ? 'Price unknown' : `$${Number(g.priceUSD).toFixed(2)}`);
const steamUrl = (g) => safeUrl(g.url) || (g.appid ? `https://store.steampowered.com/app/${g.appid}/` : null);

function renderReport() {
  const { game, comps, diag, manual } = current;
  const root = clear(els.results);
  const checks = diag.checks || [];
  const counts = { pass: 0, warn: 0, fail: 0 };
  checks.forEach((c) => { if (counts[c.status] != null) counts[c.status] += 1; });
  const tone = gradeTone(diag.grade);
  const prelaunch = manual || !!game.comingSoon || !(game.reviews && game.reviews.total != null);

  /* header */
  const url = steamUrl(game);
  const meta = h('ul', { class: 'rh-meta' },
    manual ? h('li', { text: 'Pasted page details' }) : null,
    game.developers && game.developers.length ? h('li', { text: game.developers.join(', ') }) : null,
    game.releaseDate ? h('li', { text: game.comingSoon ? `Releases ${game.releaseDate}` : `Released ${game.releaseDate}` }) : (game.comingSoon ? h('li', { text: 'Not released yet' }) : null),
    h('li', { text: price$(game) }),
    game.reviews && game.reviews.total != null ? h('li', { text: `${fmtInt(game.reviews.total)} reviews${game.reviews.positivePct != null ? ` (${game.reviews.positivePct}% positive)` : ''}` }) : null,
    prelaunch && game.followers != null ? h('li', { text: `${fmtInt(game.followers)} ${manual ? 'wishlists' : 'followers'}` }) : null,
    prelaunch && game.followers == null && !(game.reviews && game.reviews.total != null) ? h('li', { text: 'Pre-launch: no reviews yet' }) : null);
  const priorities = checks.filter((c) => c.status !== 'pass').sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]).slice(0, 3);
  const head = h('section', { class: 'card', 'aria-label': 'Summary' },
    h('div', { class: 'report-head' },
      h('div', { class: 'rh-game' },
        picture(game.capsuleImage || game.headerImage, game.capsuleImage || game.headerImage ? `${game.name} Steam capsule image` : '', 'rh-capsule', game.name),
        h('div', { class: 'rh-text' },
          h('h2', null, url ? link(url, game.name) : game.name), meta,
          h('ul', { class: 'summary-line' },
            h('li', null, badge('fail'), ` ${counts.fail}`), h('li', null, badge('warn'), ` ${counts.warn}`), h('li', null, badge('pass'), ` ${counts.pass}`)))),
      h('div', { class: 'rh-score' }, dial(diag.score, tone),
        h('div', { class: 'grade' }, h('span', { class: `letter g-${tone}`, 'aria-label': `Grade ${diag.grade}`, text: diag.grade }), h('span', { class: 'gl', text: 'Grade' })))),
    priorities.length ? h('div', null, h('p', { class: 'fine', style: 'margin-top:12px', text: 'Fix these first' }),
      h('ol', { class: 'priorities' }, priorities.map((c) => h('li', null, h('strong', { text: c.title }), c.fix ? ` ${c.fix}` : '')))) : h('p', { class: 'fine', style: 'margin-top:12px', text: 'No problems found. Nice page.' }),
    h('p', { class: 'fine' }, `Compared with ${comps.length} similar game${comps.length === 1 ? '' : 's'}${comps.length < 5 ? '. Few comparables found, so treat the numbers as rough.' : '.'}`),
    h('div', { class: 'btn-row report-actions' }, h('button', { type: 'button', class: 'btn', onclick: exportMarkdown, text: 'Export report (Markdown)' }),
      !manual && game.appid ? h('button', { type: 'button', class: 'btn ghost', onclick: () => copyText(location.href.split('#')[0] + `#appid=${game.appid}`, 'Link copied'), text: 'Copy link to this audit' }) : null));
  root.append(head);

  root.append(renderChecks(checks, counts), renderTags(game, diag), renderBenchmarks(game, diag), renderComps(comps), renderRewrite(game, diag));
}

function renderChecks(checks, counts) {
  const card = h('section', { class: 'card', 'aria-labelledby': 'checksTitle' });
  const onlyProblems = h('input', { type: 'checkbox', id: 'onlyProblems' });
  const body = h('div');
  const draw = () => {
    clear(body);
    const known = AREAS.map(([id]) => id);
    const order = [...AREAS, ...[...new Set(checks.map((c) => c.area))].filter((a) => !known.includes(a)).map((a) => [a, humanize(a)])];
    for (const [area, label] of order) {
      let items = checks.filter((c) => c.area === area);
      if (!items.length) continue;
      const total = items.length;
      if (onlyProblems.checked) items = items.filter((c) => c.status !== 'pass');
      if (!items.length) continue;
      items = items.slice().sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
      const passN = checks.filter((c) => c.area === area && c.status === 'pass').length;
      body.append(h('div', { class: 'area' },
        h('div', { class: 'area-head' }, h('h3', { text: label }), h('span', { class: 'fine', text: `${passN}/${total} passing` })),
        h('ul', { class: 'checks' }, items.map((c) => h('li', { class: 'check-item' }, badge(c.status),
          h('div', null, h('h4', { text: c.title }), c.detail ? h('p', { text: c.detail }) : null,
            c.fix && c.status !== 'pass' ? h('p', { class: 'fix' }, h('b', { text: 'Fix: ' }), c.fix) : null))))));
    }
    if (!body.firstChild) body.append(h('p', { class: 'fine', text: 'Nothing to show. All checks pass.' }));
  };
  onlyProblems.addEventListener('change', draw);
  card.append(h('div', { class: 'card-head' }, h('h2', { id: 'checksTitle', text: 'Checklist' }),
    h('div', { class: 'filter-row' }, h('label', { class: 'check', for: 'onlyProblems' }, onlyProblems, `Only show problems (${counts.fail + counts.warn})`))), body);
  draw();
  return card;
}

function renderTags(game, diag) {
  const ts = diag.tagSuggestions || { add: [], remove: [], reorder: [] };
  const cur = (game.tags || []).map((t) => (typeof t === 'string' ? { name: t } : t));
  const reorder = ts.reorder || [];
  return h('section', { class: 'card', 'aria-labelledby': 'tagsTitle' },
    h('div', { class: 'card-head' }, h('h2', { id: 'tagsTitle', text: 'Tags' }), h('span', { class: 'fine', text: `${cur.length} of 20 slots used` })),
    h('div', { class: 'tag-cols' },
      h('div', null, h('h3', { text: 'Current tags' }),
        cur.length ? h('ul', { class: 'chips' }, cur.map((t, i) => h('li', { class: 'chip' }, h('small', { text: String(i + 1) }), t.name, t.votes != null && !current.manual ? h('small', { text: fmtCompact(t.votes) }) : null))) : h('p', { class: 'fine', text: 'No tags.' })),
      h('div', null, h('h3', { text: 'Suggested adds' }),
        (ts.add || []).length ? h('ul', { class: 'why-list' }, ts.add.map((s) => h('li', null, h('span', { class: 'chip add', text: `+ ${s.tag}` }), h('span', { class: 'why', text: s.why || '' })))) : h('p', { class: 'fine', text: 'Nothing to add.' })),
      h('div', null, h('h3', { text: 'Suggested removes' }),
        (ts.remove || []).length ? h('ul', { class: 'why-list' }, ts.remove.map((s) => h('li', null, h('span', { class: 'chip rem', text: s.tag }), h('span', { class: 'why', text: s.why || '' })))) : h('p', { class: 'fine', text: 'Nothing to remove.' }))),
    reorder.length ? h('div', { style: 'margin-top:16px' }, h('h3', { text: 'Reordered list (most important first)' }),
      h('ol', { class: 'ordered' }, reorder.map((t) => h('li', { text: typeof t === 'string' ? t : t.tag || t.name }))),
      h('div', { class: 'btn-row', style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn sm', onclick: () => copyText(reorder.map((t) => (typeof t === 'string' ? t : t.tag || t.name)).join('\n'), 'Tag list copied'), text: 'Copy tag order' }))) : null);
}

/* benchmarks: the engine returns medianX keys; we label them and pair them with this game's own value */
const BENCH_DEFS = {
  price: { label: 'Price (USD)', mine: (g) => (g.isFree ? 0 : g.priceUSD), fmt: (v) => (v === 0 ? 'Free' : `$${Number(v).toFixed(2)}`) },
  screenshots: { label: 'Screenshots', mine: (g) => (g.screenshots || []).length },
  languages: { label: 'Languages', mine: (g) => (g.languages || []).length },
  desclength: { label: 'Short description (characters)', mine: (g) => (g.shortDescription || '').length },
  aboutlength: { label: 'About text (characters)', mine: (g) => (g.aboutText || '').length },
  tags: { label: 'Tags used', mine: (g) => (g.tags || []).length },
  tagcount: { label: 'Tags used', mine: (g) => (g.tags || []).length },
  movies: { label: 'Trailers', mine: (g) => g.movies },
  trailers: { label: 'Trailers', mine: (g) => g.movies },
  reviews: { label: 'Reviews', mine: (g) => g.reviews && g.reviews.total },
  positivepct: { label: 'Positive reviews (%)', mine: (g) => g.reviews && g.reviews.positivePct },
  followers: { label: 'Followers', mine: (g) => g.followers },
  ccu: { label: 'Peak concurrent players', mine: (g) => g.ccu },
};
function renderBenchmarks(game, diag) {
  const pre = current.manual || !!game.comingSoon;
  const rows = [];
  for (const [key, raw] of Object.entries(diag.benchmarks || {})) {
    const median = raw && typeof raw === 'object' ? raw.median : raw;
    if (typeof median !== 'number' || Number.isNaN(median)) continue;
    const id = key.replace(/^median/i, '').toLowerCase();
    const def = { ...(BENCH_DEFS[id] || { label: humanize(key.replace(/^median/i, '')), mine: () => null }) };
    if (pre && id === 'followers') def.label = 'Wishlists / followers';
    if (pre && id === 'reviews') { def.label = 'Reviews (comparables, after launch)'; def.mine = () => null; }
    const fmt = def.fmt || ((v) => (Number.isInteger(v) ? fmtInt(v) : v.toFixed(1)));
    let mine = null;
    try { mine = def.mine(game); } catch { mine = null; }
    if (typeof mine !== 'number' || Number.isNaN(mine)) mine = null;
    let verdict = '';
    if (mine != null) { const d = mine - median; verdict = Math.abs(d) < 1e-9 ? 'In line' : `${d > 0 ? 'Above' : 'Below'} by ${def.fmt ? fmt(Math.abs(d)).replace('Free', '$0.00') : fmt(Math.abs(Math.round(d * 10) / 10))}`; }
    rows.push(h('tr', null, h('td', { text: def.label }), h('td', { class: 'num', text: mine == null ? 'n/a' : fmt(mine) }), h('td', { class: 'num', text: fmt(median) }), h('td', { class: 'delta same', text: verdict })));
  }
  return h('section', { class: 'card', 'aria-labelledby': 'benchTitle' },
    h('div', { class: 'card-head' }, h('h2', { id: 'benchTitle', text: 'Benchmarks' }), h('span', { class: 'fine', text: 'This game against the median of its comparables' })),
    rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'bench' }, h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Measure' }), h('th', { scope: 'col', class: 'num', text: 'This game' }), h('th', { scope: 'col', class: 'num', text: 'Median' }), h('th', { scope: 'col', text: 'Difference' }))), h('tbody', null, rows)))
      : h('p', { class: 'fine', text: 'No benchmarks available. There were too few comparable games.' }));
}

function renderComps(comps) {
  const card = h('section', { class: 'card', 'aria-labelledby': 'compTitle' });
  const list = h('ul', { class: 'comp-list' });
  let showAll = false;
  const draw = () => {
    clear(list);
    const items = showAll ? comps : comps.slice(0, 8);
    for (const c of items) {
      const g = c.game; const pct = Math.round(clampPct(c.similarity <= 1 ? c.similarity * 100 : c.similarity));
      const u = steamUrl(g);
      list.append(h('li', { class: 'comp' },
        picture(g.capsuleImage || g.headerImage, `${g.name} capsule image`, 'comp-img', g.name),
        h('div', { style: 'min-width:0' }, h('div', { class: 'comp-name' }, u ? link(u, g.name) : g.name),
          h('p', { class: 'comp-meta', text: [price$(g), g.reviews && g.reviews.positivePct != null ? `${g.reviews.positivePct}% positive` : null, g.reviews && g.reviews.total != null ? `${fmtCompact(g.reviews.total)} reviews` : null, g.followers != null ? `${fmtCompact(g.followers)} followers` : null, g.ownersRange ? `${g.ownersRange} owners` : null].filter(Boolean).join(' · ') }),
          (c.sharedTags || []).length ? h('ul', { class: 'chips', 'aria-label': 'Shared tags' }, c.sharedTags.slice(0, 8).map((t) => h('li', { class: 'chip', text: t }))) : null),
        h('div', { class: 'meter', title: 'Similarity' }, h('span', { class: 'sr-only', text: 'Similarity' }), h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${pct}%` })), h('span', { class: 'val', text: `${pct}%` }))));
    }
  };
  card.append(h('div', { class: 'card-head' }, h('h2', { id: 'compTitle', text: 'Comparables' }), h('span', { class: 'fine', text: 'Similar games on Steam, by shared tags' })));
  if (!comps.length) { card.append(h('p', { class: 'fine', text: 'No similar games found in the dataset. Add more tags to get comparisons.' })); return card; }
  card.append(list);
  if (comps.length > 8) {
    const btn = h('button', { type: 'button', class: 'btn sm', style: 'margin-top:10px', text: `Show all ${comps.length}` });
    btn.addEventListener('click', () => { showAll = !showAll; btn.textContent = showAll ? 'Show fewer' : `Show all ${comps.length}`; draw(); });
    card.append(btn);
  }
  draw();
  return card;
}

/* ---------- rewrite ---------- */
function renderRewrite(game, diag) {
  const ta = h('textarea', { id: 'rewritePrompt', class: 'rewrite-box', rows: 10, 'aria-label': 'Rewrite prompt' });
  ta.value = diag.rewritePrompt || '';
  const apiKey = h('input', { id: 'apiKey', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…' });
  apiKey.value = store.get(KEY_STORE, '') || '';
  const out = h('pre', { class: 'ai-out', id: 'aiOut', hidden: true });
  const status = h('p', { class: 'ai-status', role: 'status', hidden: true });
  const goBtn = h('button', { type: 'button', class: 'btn primary', text: 'Rewrite here' });
  const setStatus = (msg, err) => { status.hidden = !msg; status.textContent = msg || ''; status.classList.toggle('err', !!err); };
  goBtn.addEventListener('click', async () => {
    const key = apiKey.value.trim();
    if (!key) { setStatus('Enter your API key first.', true); apiKey.focus(); return; }
    store.set(KEY_STORE, key);
    goBtn.disabled = true; out.hidden = true; setStatus('Asking Claude… this takes 10 to 30 seconds.');
    try {
      const req = rewriteRequest(game, diag);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 2000, system: req.system, messages: [{ role: 'user', content: req.user }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!text) throw new Error('The reply was empty.');
      out.textContent = text; out.hidden = false; setStatus('');
      copyBtn.hidden = false;
    } catch (err) { setStatus(`Rewrite failed: ${err.message}`, true); } finally { goBtn.disabled = false; }
  });
  const copyBtn = h('button', { type: 'button', class: 'btn', hidden: true, text: 'Copy result', onclick: () => copyText(out.textContent, 'Rewrite copied') });
  const forget = h('button', { type: 'button', class: 'btn ghost', text: 'Forget key', onclick: () => { store.del(KEY_STORE); apiKey.value = ''; setStatus('Key removed from this browser.'); } });
  return h('section', { class: 'card', 'aria-labelledby': 'rewriteTitle' },
    h('div', { class: 'card-head' }, h('h2', { id: 'rewriteTitle', text: 'Rewrite my copy' }), h('span', { class: 'fine', text: 'Free: paste into Claude or ChatGPT' })),
    h('label', { for: 'rewritePrompt', text: 'Prompt (edit it if you like)' }), ta,
    h('div', { class: 'btn-row', style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn primary', onclick: () => copyText(ta.value, 'Prompt copied. Paste it into Claude or ChatGPT.'), text: 'Copy prompt' }),
      h('span', { class: 'fine', text: 'then paste into Claude or ChatGPT' })),
    h('details', { class: 'ai-details' }, h('summary', { text: 'Use my Anthropic API key to rewrite here' }),
      h('div', { class: 'body' },
        h('p', { class: 'fine', text: 'Optional. Your key is saved only in this browser and sent only to api.anthropic.com. Anyone who can open this browser profile could read it, so use a key with a spending limit.' }),
        h('label', { for: 'apiKey', text: 'Anthropic API key' }), apiKey,
        h('div', { class: 'btn-row', style: 'margin-top:10px' }, goBtn, forget, copyBtn), status, out)));
}

/* ---------- Markdown export ---------- */
function exportMarkdown() {
  if (!current) return;
  const { game, comps, diag } = current;
  const L = [];
  L.push(`# Page Doctor report: ${game.name}`, '');
  L.push(`- Score: **${Math.round(diag.score)}/100 (grade ${diag.grade})**`);
  const u = steamUrl(game); if (u) L.push(`- Steam page: ${u}`);
  L.push(`- Price: ${price$(game)}`, `- Compared with ${comps.length} similar games`, `- Generated: ${new Date().toISOString().slice(0, 10)}${corpus && corpus.source === 'sample' ? ' (sample dataset)' : ''}`, '');
  L.push('## Checklist', '');
  const known = AREAS.map(([id]) => id);
  const areas = [...AREAS, ...[...new Set(diag.checks.map((c) => c.area))].filter((a) => !known.includes(a)).map((a) => [a, humanize(a)])];
  for (const [area, label] of areas) {
    const items = diag.checks.filter((c) => c.area === area);
    if (!items.length) continue;
    L.push(`### ${label}`, '');
    for (const c of items.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])) {
      L.push(`- **[${(STATUS_LABEL[c.status] || c.status).toUpperCase()}] ${c.title}**${c.detail ? `: ${c.detail}` : ''}`);
      if (c.fix && c.status !== 'pass') L.push(`  - Fix: ${c.fix}`);
    }
    L.push('');
  }
  const ts = diag.tagSuggestions || {};
  L.push('## Tags', '', `Current: ${(game.tags || []).map((t) => t.name).join(', ') || 'none'}`, '');
  if ((ts.add || []).length) { L.push('Add:'); ts.add.forEach((s) => L.push(`- ${s.tag}: ${s.why || ''}`)); L.push(''); }
  if ((ts.remove || []).length) { L.push('Remove:'); ts.remove.forEach((s) => L.push(`- ${s.tag}: ${s.why || ''}`)); L.push(''); }
  if ((ts.reorder || []).length) { L.push('Suggested order:'); ts.reorder.forEach((t, i) => L.push(`${i + 1}. ${typeof t === 'string' ? t : t.tag || t.name}`)); L.push(''); }
  L.push('## Benchmarks (median of comparables)', '');
  for (const [k, v] of Object.entries(diag.benchmarks || {})) { const m = v && typeof v === 'object' ? v.median : v; if (typeof m === 'number') L.push(`- ${humanize(k.replace(/^median/i, ''))}: ${Number.isInteger(m) ? m : m.toFixed(2)}`); }
  L.push('', '## Comparables', '');
  comps.forEach((c) => { const cu = steamUrl(c.game); const p = Math.round(c.similarity <= 1 ? c.similarity * 100 : c.similarity); L.push(`- ${cu ? `[${c.game.name}](${cu})` : c.game.name} (${p}% similar; shared: ${(c.sharedTags || []).join(', ')})`); });
  L.push('', '## Rewrite prompt', '', '```text', diag.rewritePrompt || '', '```', '');
  const slug = String(game.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
  download(`page-doctor-${slug}.md`, L.join('\n'), 'text/markdown');
}
