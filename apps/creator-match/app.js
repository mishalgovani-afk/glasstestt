// Creator Match UI. Pure engine lives in ./match.js; data in ./data/creators.json.
import { rankCreators, draftPitch, draftFollowUp, STAGES, GUIDE, WEIGHTS, pipelineSummary, newEntry, setStage, markFollowedUp, exportCsv, exportJson, importJson, PITCH_WORD_LIMIT, countWords, placeholdersIn } from './match.js';

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

/* ---------- Creator Match ---------- */
const STORE_KEY = 'creator-match:v1';
const PLATFORM_LABEL = { youtube: 'YouTube', 'steam-curator': 'Steam curator', twitch: 'Twitch' };
const TIER_LABEL = { micro: 'Micro', small: 'Small', mid: 'Mid', large: 'Large' };
const COMPONENT_LABEL = {
  affinity: 'Tag fit', coverage: 'Covered similar games', activity: 'Active lately',
  engagement: 'Audience engagement', language: 'Language',
};
const ACCESS_OPTIONS = [['key', 'Send a Steam key'], ['demo', 'Link to a demo'], ['playtest', 'Playtest key'], ['none', 'Offer only, no key yet']];
const TONE_LABEL = { friendly: 'Friendly', professional: 'Professional', brief: 'Brief' };
const PAGE = 12;

const state = {
  data: null, creatorsById: new Map(), tagUniverse: [],
  segMode: 'mine', formTags: [], picked: null,
  target: null, ranked: [], shown: PAGE,
  entries: [], keyPool: [], lastBackupAt: null,
  settings: { publisher: '', senderName: '', tone: 'friendly', access: 'key', releaseWindow: '', embargo: '', pressKit: '', trailer: '', steamUrl: '', followUpDays: 7 },
};
const E = {
  dataLine: $('#dataLine'), banners: $('#banners'), results: $('#results'), cards: $('#cards'), moreBtn: $('#moreBtn'),
  goBtn: $('#goBtn'), goHint: $('#goHint'), drawer: $('#drawer'), scrim: $('#scrim'),
};

/* ---------- persistence ---------- */
function load() {
  const saved = store.getJson(STORE_KEY, null);
  if (!saved || typeof saved !== 'object') return;
  if (Array.isArray(saved.entries)) {
    const r = importJson({ entries: saved.entries });
    state.entries = r.entries;
  }
  if (Array.isArray(saved.keyPool)) state.keyPool = saved.keyPool.filter((k) => typeof k === 'string');
  if (saved.settings && typeof saved.settings === 'object') Object.assign(state.settings, saved.settings);
  if (saved.target && typeof saved.target === 'object') state.target = saved.target;
  if (typeof saved.lastBackupAt === 'string') state.lastBackupAt = saved.lastBackupAt;
}
function save() {
  const ok = store.setJson(STORE_KEY, { version: 1, entries: state.entries, keyPool: state.keyPool, settings: state.settings, target: state.target, lastBackupAt: state.lastBackupAt });
  const w = $('#storageWarn');
  clear(w);
  if (!ok) w.append(h('div', { class: 'banner error', role: 'alert' }, h('span', { class: 'ico', 'aria-hidden': 'true', text: '!' }),
    h('div', null, h('strong', { text: 'Saving is blocked in this browser. ' }), 'Your changes will be lost when you close this tab. Export a JSON backup to keep them.')));
  $('#boardCount').textContent = String(state.entries.length);
}

/* ---------- boot ---------- */
(async function boot() {
  load();
  buildStaticUi();
  try {
    state.data = await loadJson('./data/creators.json');
    if (!state.data || !Array.isArray(state.data.creators)) throw new Error('creators.json has no creators array');
    state.data.games = Array.isArray(state.data.games) ? state.data.games : [];
  } catch (err) {
    E.dataLine.textContent = 'Dataset unavailable';
    E.banners.append(h('div', { class: 'banner error', role: 'alert' }, h('span', { class: 'ico', 'aria-hidden': 'true', text: '!' }),
      h('div', null, h('strong', { text: 'Could not load the creator dataset. ' }), `${err.message}. The outreach board still works with your saved data.`)));
    renderBoard(); renderGuide();
    return;
  }
  for (const c of state.data.creators) state.creatorsById.set(c.id, c);
  renderDataStatus(state.data, E.dataLine, E.banners, `${fmtInt(state.data.creators.length)} creators`);
  buildTagUniverse(); buildLanguageFilter();
  if (state.target) restoreTarget();
  renderTagPicker(); updateGo();
  renderBoard(); renderGuide();
  $('#boardCount').textContent = String(state.entries.length);
})();

/* ---------- tabs ---------- */
const TABS = [['tabFind', 'viewFind'], ['tabBoard', 'viewBoard'], ['tabGuide', 'viewGuide']];
function showTab(id) {
  for (const [t, v] of TABS) {
    const on = t === id;
    $('#' + t).setAttribute('aria-selected', String(on)); $('#' + t).tabIndex = on ? 0 : -1; $('#' + v).hidden = !on;
  }
  if (id === 'tabBoard') renderBoard();
}
TABS.forEach(([t], i) => {
  $('#' + t).addEventListener('click', () => showTab(t));
  $('#' + t).addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault(); const n = TABS[(i + d + TABS.length) % TABS.length][0]; showTab(n); $('#' + n).focus();
  });
});
$('#goFind').addEventListener('click', () => showTab('tabFind'));

/* ---------- target picker ---------- */
function buildStaticUi() {
  $('#segMine').addEventListener('click', () => setSeg('mine'));
  $('#segSteam').addEventListener('click', () => setSeg('steam'));
  $('#tName').addEventListener('input', updateGo);
  $('#tagFilter').addEventListener('input', renderTagPicker);
  $('#tagFilter').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { addFormTag(v); e.target.value = ''; renderTagPicker(); } else if (!E.goBtn.disabled) E.goBtn.click(); }
  });
  $('#gameQ').addEventListener('input', renderGameList);
  E.goBtn.addEventListener('click', onGo);
  for (const id of ['fPlatform', 'fTier', 'fLang', 'fActive']) $('#' + id).addEventListener('change', () => { if (state.target) rerank(); });
  E.moreBtn.addEventListener('click', () => { state.shown += PAGE; renderCards(); });
  $('#expCsv').addEventListener('click', onExportCsv);
  $('#expJson').addEventListener('click', onExportJson);
  $('#impBtn').addEventListener('click', () => $('#impFile').click());
  $('#impFile').addEventListener('change', onImport);
  $('#poolAdd').addEventListener('click', onPoolAdd);
  $('#poolShow').addEventListener('click', () => { const l = $('#poolList'); l.hidden = !l.hidden; $('#poolShow').textContent = l.hidden ? 'Show keys' : 'Hide keys'; $('#poolShow').setAttribute('aria-expanded', String(!l.hidden)); });
  $('#fuDays').value = String(state.settings.followUpDays || 7);
  $('#fuDays').addEventListener('change', (e) => { state.settings.followUpDays = Number(e.target.value); save(); renderBoard(); });
  E.scrim.addEventListener('click', closeDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (E.drawer.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
    if (e.key === 'Tab') trapFocus(e);
  });
}
function setSeg(mode) {
  state.segMode = mode; const mine = mode === 'mine';
  $('#segMine').setAttribute('aria-selected', String(mine)); $('#segMine').tabIndex = mine ? 0 : -1;
  $('#segSteam').setAttribute('aria-selected', String(!mine)); $('#segSteam').tabIndex = mine ? -1 : 0;
  $('#paneMine').hidden = !mine; $('#paneSteam').hidden = mine; updateGo();
}
function buildTagUniverse() {
  const counts = new Map(); const casing = new Map();
  const bump = (t, n) => { const k = String(t).trim().toLowerCase(); if (!k) return; if (!casing.has(k)) casing.set(k, String(t).trim()); counts.set(k, (counts.get(k) || 0) + n); };
  for (const g of state.data.games) for (const t of g.tags || []) bump(typeof t === 'object' ? t.name : t, 2);
  for (const c of state.data.creators) for (const t of Object.keys(c.tagAffinity || {})) bump(t, 1);
  state.tagUniverse = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => casing.get(k));
}
function addFormTag(raw) {
  const k = raw.trim().toLowerCase(); if (!k) return;
  const canon = state.tagUniverse.find((t) => t.toLowerCase() === k) || raw.trim();
  if (state.formTags.length >= 12 || state.formTags.some((t) => t.toLowerCase() === k)) return;
  state.formTags.push(canon);
}
function renderTagPicker() {
  const sel = clear($('#tagSelected'));
  state.formTags.forEach((t, i) => sel.append(h('span', { class: 'chip on' }, h('small', { text: String(i + 1) }), t,
    h('button', { type: 'button', class: 'x', 'aria-label': `Remove tag ${t}`, onclick: () => { state.formTags.splice(i, 1); renderTagPicker(); } , text: '×' }))));
  const q = $('#tagFilter').value.trim().toLowerCase();
  const chosen = new Set(state.formTags.map((t) => t.toLowerCase()));
  const opts = state.tagUniverse.filter((t) => !chosen.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q))).slice(0, q ? 40 : 30);
  const ul = clear($('#tagChoices'));
  for (const t of opts) ul.append(h('li', null, h('button', { type: 'button', class: 'chip', text: t, onclick: () => { addFormTag(t); $('#tagFilter').value = ''; renderTagPicker(); $('#tagFilter').focus(); } })));
  if (!opts.length && q) ul.append(h('li', { class: 'fine', text: `No known tag "${$('#tagFilter').value.trim()}". Press Enter to add it anyway.` }));
  updateGo();
}
function renderGameList() {
  const q = $('#gameQ').value.trim().toLowerCase(); const ul = clear($('#gameList'));
  if (!q) return;
  const hits = state.data.games.filter((g) => String(g.name).toLowerCase().includes(q)).sort((a, b) => (String(a.name).toLowerCase().startsWith(q) ? 0 : 1) - (String(b.name).toLowerCase().startsWith(q) ? 0 : 1) || String(a.name).localeCompare(String(b.name))).slice(0, 8);
  if (!hits.length) { ul.append(h('li', { class: 'fine', text: 'Not in this dataset. Use "My game" and enter the name and tags instead.' })); return; }
  for (const g of hits) ul.append(h('li', null, h('button', { type: 'button', onclick: () => pickGame(g) }, h('strong', { text: g.name }), h('span', { class: 'pl-meta', text: (g.tags || []).slice(0, 6).join(' · ') }))));
}
function pickGame(g) {
  state.picked = { appid: g.appid, name: g.name, tags: (g.tags || []).map((t) => (typeof t === 'object' ? t.name : t)) };
  clear($('#gameList')); $('#gameQ').value = g.name;
  const box = clear($('#gamePicked')); box.hidden = false;
  box.append(h('h3', { text: state.picked.name }),
    h('ul', { class: 'chips', 'aria-label': 'Tags' }, state.picked.tags.map((t) => h('li', { class: 'chip', text: t }))),
    h('p', { class: 'fine', style: 'margin-top:8px' }, 'Creators who already covered this exact game are flagged for re-contact. ',
      h('button', { type: 'button', class: 'linklike', onclick: editPickedAsMine, text: 'Edit as my own game' })));
  updateGo();
}
function editPickedAsMine() {
  const p = state.picked; if (!p) return;
  $('#tName').value = p.name; state.formTags = p.tags.slice(0, 12); $('#tPre').checked = false; setSeg('mine'); renderTagPicker();
}
function updateGo() {
  if (!state.data) { E.goBtn.disabled = true; return; }
  const ok = state.segMode === 'mine' ? state.formTags.length > 0 : !!state.picked;
  E.goBtn.disabled = !ok;
  E.goHint.textContent = ok ? '' : (state.segMode === 'mine' ? 'Add at least one tag to find creators.' : 'Pick a game first.');
}
function restoreTarget() {
  const t = state.target;
  if (t.mode === 'steam' && t.appid != null) { state.picked = { appid: t.appid, name: t.name, tags: t.tags || [] }; setSeg('steam'); pickGame(state.picked); $('#gameQ').value = t.name; }
  else { $('#tName').value = t.name || ''; $('#tHook').value = t.hook || ''; $('#tPre').checked = t.prelaunch !== false; state.formTags = (t.tags || []).slice(); }
}
function onGo() {
  if (state.segMode === 'mine') {
    state.target = { mode: 'mine', name: $('#tName').value.trim() || 'Your game', tags: state.formTags.slice(), hook: $('#tHook').value.trim(), prelaunch: $('#tPre').checked, appid: null };
  } else {
    const p = state.picked;
    state.target = { mode: 'steam', name: p.name, tags: p.tags.slice(), hook: '', prelaunch: false, appid: p.appid };
  }
  state.shown = PAGE; save(); rerank(); E.results.hidden = false;
  $('#results').scrollIntoView({ block: 'start' });
}
const engineTarget = () => {
  const t = state.target || { name: '', tags: [] };
  return { name: t.name, tags: t.tags, appid: t.appid ?? undefined, hook: t.hook || undefined, comingSoon: !!t.prelaunch, released: !t.prelaunch };
};

/* ---------- filters + ranking ---------- */
function buildLanguageFilter() {
  const counts = new Map();
  for (const c of state.data.creators) if (c.language) counts.set(c.language, (counts.get(c.language) || 0) + 1);
  for (const [l] of [...counts.entries()].sort((a, b) => b[1] - a[1])) $('#fLang').append(h('option', { value: l, text: l }));
}
function rerank() {
  if (!state.target || !state.data) return;
  const opts = { activeWithinDays: Number($('#fActive').value) };
  if ($('#fPlatform').value) opts.platform = $('#fPlatform').value;
  if ($('#fLang').value) opts.language = $('#fLang').value;
  let list = [];
  try { list = rankCreators(engineTarget(), state.data, opts) || []; } catch (err) { toast(`Ranking failed: ${err.message}`); }
  const tier = $('#fTier').value;
  state.ranked = tier ? list.filter((r) => r.sizeTier === tier) : list;
  state.shown = PAGE; renderCards();
}

/* ---------- result cards ---------- */
const followersLabel = (c) => (c.followers == null ? 'Followers unknown' : `${fmtCompact(c.followers)} ${c.platform === 'youtube' ? 'subscribers' : 'followers'}`);
function inShortlist(id) { return state.entries.some((e) => e.creatorId === id); }

function renderCards() {
  const t = state.target; const total = state.ranked.length;
  $('#resultTitle').textContent = `Creators for ${t.name}`;
  $('#resultSub').textContent = total ? `${Math.min(state.shown, total)} of ${total} shown, best fit first. Tags used: ${t.tags.slice(0, 6).join(', ')}${t.tags.length > 6 ? '…' : ''}` : '';
  const root = clear(E.cards);
  if (!total) {
    root.append(h('div', { class: 'card empty' }, h('p', null, h('strong', { text: 'No creators match.' })), h('p', { class: 'fine', text: 'Try "Any time" under Active within, choose All platforms or sizes, or add a more common tag.' })));
    E.moreBtn.hidden = true; return;
  }
  for (const r of state.ranked.slice(0, state.shown)) root.append(creatorCard(r));
  E.moreBtn.hidden = state.shown >= total;
}
function creatorCard(r) {
  const c = r.creator; const url = safeUrl(c.url);
  const links = (c.links || []).filter((l) => safeUrl(l && l.url));
  const mg = r.matchedGames || [];
  const card = h('article', { class: 'cc', 'aria-label': c.name },
    h('div', { class: 'cc-top' },
      picture(c.avatar, `${c.name} avatar`, 'cc-av', c.name),
      h('div', { style: 'min-width:0' },
        h('h3', { class: 'cc-name' }, url ? link(url, c.name) : c.name),
        h('div', { class: 'cc-badges' },
          h('span', { class: `badge plain plat-${c.platform}`, text: PLATFORM_LABEL[c.platform] || c.platform }),
          h('span', { class: 'badge plain', text: `${TIER_LABEL[r.sizeTier] || r.sizeTier} · ${followersLabel(c)}` }),
          c.language ? h('span', { class: 'badge plain', text: c.language }) : null,
          r.coveredTarget ? h('span', { class: 'badge plain recontact', text: 'Covered your game: re-contact' }) : null))),
    h('div', { class: 'cc-score' }, h('span', { class: 'lbl', text: 'Fit score' }),
      h('div', { class: 'meter', role: 'img', 'aria-label': `Fit score ${r.score} out of 100` }, h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${clampPct(r.score)}%` })), h('span', { class: 'val', text: String(r.score) }))),
    h('ul', { class: 'reasons' }, (r.reasons || []).map((x) => h('li', { text: x }))),
    mg.length ? h('div', null, h('h3', { text: 'Matched games' }), h('ul', { class: 'mg-list' }, mg.slice(0, 3).map((m) => h('li', null,
      m.url && safeUrl(m.url) ? link(m.url, m.name || m.title) : (m.name || m.title), m.isTarget ? ' (your game)' : '',
      h('span', { class: 'when', text: [m.daysAgo != null ? ` · ${m.daysAgo}d ago` : '', m.views != null ? ` · ${fmtCompact(m.views)} views` : ''].join('') }))),
      mg.length > 3 ? h('li', { class: 'when', text: `+ ${mg.length - 3} more` }) : null)) : null,
    links.length ? h('ul', { class: 'cc-links', 'aria-label': 'Public links' }, links.map((l) => h('li', null, link(l.url, l.label || 'Link')))) : null,
    r.breakdown ? breakdownDetails(r.breakdown) : null,
    h('div', { class: 'cc-actions' },
      shortlistBtn(c, r),
      h('button', { type: 'button', class: 'btn sm', onclick: (e) => openDrawer(c, { matched: mg, opener: e.currentTarget }), text: 'Draft pitch' })));
  return card;
}
function shortlistBtn(c, r) {
  const on = inShortlist(c.id);
  const b = h('button', { type: 'button', class: `btn sm ${on ? '' : 'primary'}`, 'aria-pressed': String(on), dataset: { sl: c.id }, text: on ? 'In shortlist ✓' : 'Add to shortlist' });
  b.addEventListener('click', () => {
    if (inShortlist(c.id)) { toast('Already on your board'); return; }
    addToShortlist(c); refreshShortlistButtons(); toast(`${c.name} added to your shortlist`);
  });
  return b;
}
function refreshShortlistButtons() {
  $$('[data-sl]').forEach((b) => { const on = inShortlist(b.dataset.sl); b.textContent = on ? 'In shortlist ✓' : 'Add to shortlist'; b.classList.toggle('primary', !on); b.setAttribute('aria-pressed', String(on)); });
}
function breakdownDetails(bd) {
  const rows = Object.entries(bd).filter(([k]) => WEIGHTS[k]).map(([k, v]) => h('tr', null,
    h('td', { text: COMPONENT_LABEL[k] || humanize(k) }),
    h('td', null, h('div', { class: 'meter' }, h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${clampPct((v / WEIGHTS[k]) * 100)}%` })), h('span', { class: 'val', text: `${v} / ${WEIGHTS[k]}` })))));
  return h('details', null, h('summary', { text: 'How the score is built' }), h('table', { class: 'break' }, h('tbody', null, rows)));
}

/* ---------- entries ---------- */
function addToShortlist(c) {
  if (inShortlist(c.id)) return;
  const e = newEntry(c.id);
  e.name = c.name; e.platform = c.platform; if (safeUrl(c.url)) e.url = c.url;
  state.entries.push(e); save();
}
function updateEntry(id, fn) {
  const i = state.entries.findIndex((e) => e.creatorId === id);
  if (i < 0) return null;
  state.entries[i] = fn(state.entries[i]); save(); return state.entries[i];
}
const entryName = (e) => e.name || (state.creatorsById.get(e.creatorId) || {}).name || e.creatorId;
const entryCreator = (e) => state.creatorsById.get(e.creatorId) || { id: e.creatorId, name: e.name || e.creatorId, platform: e.platform || 'youtube', url: e.url, coveredGames: [] };

/* ---------- pitch drawer ---------- */
let drawerCtx = null;
function trapFocus(e) {
  const f = $$('button, input, select, textarea, a[href], summary', E.drawer).filter((x) => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0]; const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function closeDrawer() {
  E.drawer.hidden = true; E.scrim.hidden = true; document.body.style.overflow = '';
  const o = drawerCtx && drawerCtx.opener; drawerCtx = null;
  if (o && document.contains(o)) o.focus();
}
function openDrawer(creator, { matched = [], opener = null, kind = 'pitch' } = {}) {
  drawerCtx = { creator, matched, opener, kind };
  E.drawer.hidden = false; E.scrim.hidden = false; document.body.style.overflow = 'hidden';
  buildDrawer();
  E.drawer.focus();
}
function buildDrawer() {
  const { creator } = drawerCtx; const s = state.settings;
  const target = state.target || { name: '', tags: [], prelaunch: true };
  $('#drawerTitle').textContent = drawerCtx.kind === 'follow' ? `Follow-up to ${creator.name}` : `Pitch to ${creator.name}`;
  $('#drawerSub').textContent = `${PLATFORM_LABEL[creator.platform] || creator.platform} · ${followersLabel(creator)}`;
  const body = clear($('#drawerBody'));
  const entry = state.entries.find((e) => e.creatorId === creator.id);
  const f = {
    sender: h('input', { type: 'text', id: 'pSender', maxlength: 60, autocomplete: 'name', value: s.senderName }),
    publisher: h('input', { type: 'text', id: 'pPub', maxlength: 60, autocomplete: 'organization', value: s.publisher }),
    tone: h('select', { id: 'pTone' }, Object.entries(TONE_LABEL).map(([v, l]) => h('option', { value: v, text: l, selected: s.tone === v }))),
    access: h('select', { id: 'pAccess' }, ACCESS_OPTIONS.map(([v, l]) => h('option', { value: v, text: l, selected: s.access === v }))),
    pre: h('select', { id: 'pPre' }, h('option', { value: '1', text: 'Not released yet', selected: !!target.prelaunch }), h('option', { value: '0', text: 'Already released', selected: !target.prelaunch })),
    key: h('input', { type: 'text', id: 'pKey', maxlength: 60, spellcheck: 'false', placeholder: 'XXXXX-XXXXX-XXXXX' }),
    window: h('input', { type: 'text', id: 'pWin', maxlength: 40, placeholder: 'e.g. Spring 2027 or 14 May', value: s.releaseWindow }),
    embargo: h('input', { type: 'text', id: 'pEmb', maxlength: 40, placeholder: 'optional', value: s.embargo }),
    press: h('input', { type: 'url', id: 'pPress', placeholder: 'https://…', value: s.pressKit }),
    trailer: h('input', { type: 'url', id: 'pTrailer', placeholder: 'https://…', value: s.trailer }),
    steam: h('input', { type: 'url', id: 'pSteam', placeholder: 'https://store.steampowered.com/app/…', value: s.steamUrl }),
  };
  const subject = h('input', { type: 'text', id: 'pSubject' });
  const text = h('textarea', { id: 'pBody', class: 'pitch-body', rows: 14 });
  const wc = h('span', { class: 'wc' });
  const ph = h('div', { class: 'ph-list' });
  const field = (label, id, el, extra) => h('div', { class: 'field' }, h('label', { for: id, text: label }), el, extra);
  const poolBtn = h('button', { type: 'button', class: 'btn sm', style: 'margin-top:6px', text: 'Use next key from pool', onclick: () => { if (!state.keyPool.length) return toast('The key pool is empty. Add keys on the Outreach board.'); f.key.value = state.keyPool[0]; regen(); } });
  const keyField = field('Steam key to include', 'pKey', f.key, poolBtn);

  const seg = entry ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Message type' },
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(drawerCtx.kind === 'pitch'), onclick: () => { drawerCtx.kind = 'pitch'; buildDrawer(); }, text: 'First pitch' }),
    h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(drawerCtx.kind === 'follow'), onclick: () => { drawerCtx.kind = 'follow'; buildDrawer(); }, text: 'Follow-up' })) : null;

  const collect = () => ({
    senderName: f.sender.value.trim(), publisher: f.publisher.value.trim(), tone: f.tone.value, access: f.access.value, prelaunch: f.pre.value === '1',
    steamKey: f.key.value.trim(), releaseWindow: f.window.value.trim(), launchDate: f.window.value.trim(), embargoDate: f.embargo.value.trim(),
    pressKitUrl: f.press.value.trim(), trailerUrl: f.trailer.value.trim(), steamUrl: f.steam.value.trim(),
  });
  const regen = () => {
    const o = collect();
    Object.assign(state.settings, { senderName: o.senderName, publisher: o.publisher, tone: o.tone, access: o.access, releaseWindow: o.releaseWindow, embargo: o.embargoDate, pressKit: o.pressKitUrl, trailer: o.trailerUrl, steamUrl: o.steamUrl });
    save();
    const t = engineTarget();
    let d;
    try {
      d = drawerCtx.kind === 'follow' ? draftFollowUp(drawerCtx.creator, t, o) : draftPitch(drawerCtx.creator, t, { ...o, matchedGames: drawerCtx.matched.length ? drawerCtx.matched : undefined, data: state.data });
    } catch (err) { d = { subject: '', body: `Could not draft: ${err.message}`, placeholders: [] }; }
    subject.value = d.subject; text.value = d.body; showMeta(d.placeholders);
    keyField.hidden = drawerCtx.kind === 'follow' || !['key', 'playtest'].includes(o.access);
  };
  const count = () => { const n = countWords(text.value); wc.textContent = `${n} words (aim for under ${PITCH_WORD_LIMIT})`; wc.classList.toggle('over', n >= PITCH_WORD_LIMIT && drawerCtx.kind !== 'follow'); };
  const showMeta = (placeholders) => {
    count(); clear(ph);
    const list = placeholdersIn(`${subject.value}\n${text.value}`);
    void placeholders;
    if (list.length) ph.append(h('p', { class: 'fine', text: 'Fill these in before you send:' }), h('ul', { class: 'chips' }, list.map((p) => h('li', { class: 'chip', text: p }))));
  };
  for (const el of Object.values(f)) el.addEventListener('input', regen);
  text.addEventListener('input', () => showMeta()); subject.addEventListener('input', () => showMeta());

  const parts = [seg,
    !state.target ? h('p', { class: 'msg', text: 'Tip: choose your game under Find creators first, so the pitch can name it and its genre.' }) : null,
    h('div', { class: 'pitch-fields' }, field('Your name', 'pSender', f.sender), field('Publisher or studio', 'pPub', f.publisher), field('Tone', 'pTone', f.tone), field('Key offer', 'pAccess', f.access)),
    drawerCtx.kind === 'follow' ? null : h('div', { class: 'pitch-fields' }, field('Launch status', 'pPre', f.pre), field('Release window or date', 'pWin', f.window)),
    keyField,
    h('details', null, h('summary', { text: 'More details: embargo, press kit, trailer, Steam page' }),
      field('Embargo date', 'pEmb', f.embargo), field('Press kit link', 'pPress', f.press), field('Trailer link', 'pTrailer', f.trailer), field('Steam page link', 'pSteam', f.steam)),
    h('p', { class: 'fine', text: 'Changing a field above rewrites the text below. Edit the text last.' }),
    field('Subject', 'pSubject', subject),
    field('Message', 'pBody', text), h('p', { class: 'fine' }, wc), ph,
    h('div', { class: 'btn-row', style: 'margin-top:12px' },
      h('button', { type: 'button', class: 'btn primary', text: 'Copy message', onclick: () => copyText(text.value, 'Message copied') }),
      h('button', { type: 'button', class: 'btn', text: 'Copy subject', onclick: () => copyText(subject.value, 'Subject copied') }),
      h('button', { type: 'button', class: 'btn', text: 'Copy all', onclick: () => copyText(`Subject: ${subject.value}\n\n${text.value}`, 'Subject and message copied') })),
    h('div', { class: 'btn-row', style: 'margin-top:10px' },
      drawerCtx.kind === 'follow'
        ? h('button', { type: 'button', class: 'btn', text: 'Mark as followed up', onclick: () => { updateEntry(creator.id, (e) => markFollowedUp(e)); toast('Marked as followed up'); renderBoard(); closeDrawer(); } })
        : h('button', { type: 'button', class: 'btn', text: entry && entry.stage !== 'shortlist' ? 'Already pitched' : 'Mark as pitched', disabled: !!(entry && entry.stage !== 'shortlist'), onclick: () => {
          addToShortlist(creator);
          const k = f.key.value.trim();
          if (k && ['key', 'playtest'].includes(f.access.value)) {
            const idx = state.keyPool.findIndex((x) => x.toLowerCase() === k.toLowerCase());
            if (idx >= 0) state.keyPool.splice(idx, 1);
            updateEntry(creator.id, (e) => ({ ...e, keys: [...new Set([...(e.keys || []), k])] }));
          }
          updateEntry(creator.id, (e) => setStage(e, 'pitched')); refreshShortlistButtons(); renderBoard(); toast('Moved to Pitched on your board'); closeDrawer();
        } }))];
  body.append(...parts.filter(Boolean));
  regen();
}

/* ---------- outreach board ---------- */
const stageLabel = (s) => STAGE_LABELS_SAFE[s] || humanize(s);
const STAGE_LABELS_SAFE = { shortlist: 'Shortlist', pitched: 'Pitched', replied: 'Replied', 'key-sent': 'Key sent', covered: 'Covered', declined: 'Declined' };
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

function renderBoard() {
  $('#boardCount').textContent = String(state.entries.length);
  const sum = pipelineSummary(state.entries, { followUpDays: state.settings.followUpDays });
  // stats
  const tiles = h('div', { class: 'tiles' },
    tile(sum.total, 'On board'), tile(sum.contacted, 'Contacted'), tile(pct(sum.replyRate), 'Reply rate'), tile(pct(sum.coverageRate), 'Coverage rate'),
    tile(sum.keysSent, 'Keys sent'), tile(sum.keysRedeemedUnknown, 'Keys, outcome unknown'), tile(state.keyPool.length, 'Keys in pool'));
  const max = Math.max(1, ...STAGES.map((s) => (sum.byStage && sum.byStage[s]) || 0));
  const bars = h('div', { class: 'stat-bars', role: 'list', 'aria-label': 'Creators per stage' }, STAGES.map((s) => {
    const n = (sum.byStage && sum.byStage[s]) || 0;
    return h('div', { class: 'sb', role: 'listitem' }, h('span', { text: stageLabel(s) }), h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${(n / max) * 100}%` })), h('span', { class: 'n', text: String(n) }));
  }));
  clear($('#stats')).append(tiles, bars);
  // backup note
  const bn = $('#backupNote');
  const d = state.lastBackupAt ? daysSince(state.lastBackupAt) : null;
  bn.textContent = !state.entries.length && !state.keyPool.length ? '' : d == null ? 'You have not exported a backup yet.' : d > 7 ? `Your last backup was ${d} days ago.` : `Last backup: ${fmtDate(state.lastBackupAt)}.`;
  // follow-ups
  const fu = clear($('#fuList'));
  if (!sum.followUpDue.length) fu.append(h('p', { class: 'fine', text: `Nothing due. Creators pitched more than ${state.settings.followUpDays} days ago with no reply show up here, once.` }));
  for (const item of sum.followUpDue) {
    const e = state.entries.find((x) => x.creatorId === item.creatorId); if (!e) continue;
    fu.append(h('div', { class: 'fu-item' },
      h('div', { class: 'who' }, entryName(e), h('small', { text: `${stageLabel(item.stage)} ${item.daysSince} days ago` })),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn sm primary', text: 'Draft follow-up', onclick: (ev) => openDrawer(entryCreator(e), { kind: 'follow', opener: ev.currentTarget }) }),
        h('button', { type: 'button', class: 'btn sm ghost', text: 'Mark done', 'aria-label': `Mark ${entryName(e)} as followed up`, onclick: () => { updateEntry(e.creatorId, (x) => markFollowedUp(x)); renderBoard(); } }))));
  }
  renderPool();
  // columns
  $('#boardEmpty').hidden = state.entries.length > 0;
  const board = clear($('#board')); board.hidden = !state.entries.length;
  for (const stage of STAGES) {
    const list = state.entries.filter((e) => e.stage === stage);
    const col = h('div', { class: 'col', role: 'group', 'aria-label': `${stageLabel(stage)} column`, dataset: { stage } }, h('h3', null, h('span', { text: stageLabel(stage) }), h('span', { class: 'n', text: String(list.length) })));
    col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('over'); const id = ev.dataTransfer.getData('text/plain'); if (id) moveEntry(id, stage); });
    if (!list.length) col.append(h('p', { class: 'col-empty', text: 'Empty' }));
    for (const e of list) col.append(entryCard(e));
    board.append(col);
  }
}
const tile = (n, l) => h('div', { class: 'tile' }, h('span', { class: 'num', text: String(n) }), h('span', { class: 'lbl', text: l }));

function moveEntry(id, stage) {
  const cur = state.entries.find((e) => e.creatorId === id);
  if (!cur || cur.stage === stage) return;
  updateEntry(id, (e) => setStage(e, stage)); renderBoard(); toast(`Moved to ${stageLabel(stage)}`);
}
function entryCard(e) {
  const c = state.creatorsById.get(e.creatorId);
  const idx = STAGES.indexOf(e.stage);
  const last = e.history && e.history.length ? e.history[e.history.length - 1] : null;
  const ld = last ? daysSince(last.at) : null;
  const url = safeUrl(e.url || (c && c.url));
  const stageSel = h('select', { 'aria-label': `Stage for ${entryName(e)}` }, STAGES.map((s) => h('option', { value: s, text: stageLabel(s), selected: s === e.stage })));
  stageSel.addEventListener('change', () => moveEntry(e.creatorId, stageSel.value));
  const notes = h('textarea', { rows: 2, 'aria-label': `Notes for ${entryName(e)}`, placeholder: 'Notes', maxlength: 5000 });
  notes.value = e.notes || '';
  let t = 0;
  const saveNotes = () => { clearTimeout(t); updateEntry(e.creatorId, (x) => ({ ...x, notes: notes.value })); };
  notes.addEventListener('input', () => { clearTimeout(t); t = setTimeout(saveNotes, 350); });
  notes.addEventListener('blur', saveNotes);
  const keys = e.keys || [];
  const card = h('article', { class: 'ec', draggable: 'true', dataset: { id: e.creatorId } },
    h('div', null, h('p', { class: 'ec-name' }, url ? link(url, entryName(e)) : entryName(e)),
      h('p', { class: 'ec-meta', text: [PLATFORM_LABEL[e.platform || (c && c.platform)] || '', c ? followersLabel(c) : '', ld != null ? `${stageLabel(e.stage)} ${ld === 0 ? 'today' : `${ld}d ago`}` : ''].filter(Boolean).join(' · ') })),
    h('div', { class: 'mv' },
      h('button', { type: 'button', class: 'btn sm', disabled: idx <= 0, 'aria-label': `Move ${entryName(e)} to ${stageLabel(STAGES[idx - 1] || '')}`, onclick: () => moveEntry(e.creatorId, STAGES[idx - 1]), text: '←' }),
      h('button', { type: 'button', class: 'btn sm', disabled: idx >= STAGES.length - 1, 'aria-label': `Move ${entryName(e)} to ${stageLabel(STAGES[idx + 1] || '')}`, onclick: () => moveEntry(e.creatorId, STAGES[idx + 1]), text: '→' })),
    stageSel, notes,
    keys.length ? h('div', { class: 'keys' }, keys.map((k) => h('span', { class: 'chip' }, h('button', { type: 'button', class: 'x', style: 'color:var(--text)', title: 'Copy key', 'aria-label': `Copy key ${k}`, onclick: () => copyText(k, 'Key copied'), text: k }),
      h('button', { type: 'button', class: 'x', 'aria-label': `Return key ${k} to the pool`, title: 'Return to pool', onclick: () => { updateEntry(e.creatorId, (x) => ({ ...x, keys: x.keys.filter((y) => y !== k) })); state.keyPool.push(k); save(); renderBoard(); }, text: '×' }))) ) : null,
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', text: 'Give key', onclick: () => giveKey(e.creatorId) }),
      h('button', { type: 'button', class: 'btn', text: e.stage === 'shortlist' ? 'Draft pitch' : 'Message', onclick: (ev) => openDrawer(entryCreator(e), { opener: ev.currentTarget, kind: e.stage === 'shortlist' ? 'pitch' : 'follow' }) }),
      removeBtn(e)));
  card.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', e.creatorId); ev.dataTransfer.effectAllowed = 'move'; });
  return card;
}
function removeBtn(e) {
  const b = h('button', { type: 'button', class: 'btn ghost', text: 'Remove', 'aria-label': `Remove ${entryName(e)} from the board` });
  let armed = 0;
  b.addEventListener('click', () => {
    if (!armed) { armed = 1; b.textContent = 'Sure?'; setTimeout(() => { armed = 0; if (b.isConnected) b.textContent = 'Remove'; }, 3000); return; }
    state.keyPool.push(...(e.keys || []));
    state.entries = state.entries.filter((x) => x.creatorId !== e.creatorId); save(); refreshShortlistButtons(); renderBoard();
  });
  return b;
}
function giveKey(id) {
  if (!state.keyPool.length) { toast('No keys in the pool. Paste some under "Steam key pool".'); return; }
  const k = state.keyPool.shift();
  updateEntry(id, (e) => ({ ...e, keys: [...(e.keys || []), k] })); renderBoard(); toast(`Key assigned. ${state.keyPool.length} left in the pool.`);
}

/* key pool */
const KEY_RE = /^[A-Z0-9-]{8,40}$/;
function renderPool() {
  $('#poolCount').textContent = `${state.keyPool.length} unassigned`;
  const ul = clear($('#poolList'));
  state.keyPool.forEach((k, i) => ul.append(h('li', null, h('span', { text: k }), h('button', { type: 'button', 'aria-label': `Delete key ${k}`, onclick: () => { state.keyPool.splice(i, 1); save(); renderBoard(); }, text: '×' }))));
}
function onPoolAdd() {
  const raw = $('#poolInput').value.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const assigned = new Set(state.entries.flatMap((e) => e.keys || []).map((k) => k.toUpperCase()));
  const have = new Set(state.keyPool.map((k) => k.toUpperCase()));
  let added = 0, dup = 0, bad = 0;
  for (const k of raw) {
    if (!KEY_RE.test(k)) { bad++; continue; }
    if (have.has(k) || assigned.has(k)) { dup++; continue; }
    state.keyPool.push(k); have.add(k); added++;
  }
  $('#poolMsg').textContent = `${added} added${dup ? `, ${dup} duplicate${dup === 1 ? '' : 's'} skipped` : ''}${bad ? `, ${bad} not recognised as a key` : ''}.`;
  if (added) $('#poolInput').value = '';
  save(); renderBoard();
}

/* export / import */
const today = () => new Date().toISOString().slice(0, 10);
function onExportCsv() {
  if (!state.entries.length) return toast('Nothing to export yet');
  download(`creator-match-outreach-${today()}.csv`, '﻿' + exportCsv(state.entries, { creators: state.data ? state.data.creators : [] }), 'text/csv');
}
function onExportJson() {
  const base = JSON.parse(exportJson(state.entries));
  base.keyPool = state.keyPool; base.settings = state.settings; base.target = state.target;
  download(`creator-match-backup-${today()}.json`, JSON.stringify(base, null, 2), 'application/json');
  state.lastBackupAt = new Date().toISOString(); save(); renderBoard(); toast('Backup downloaded. Keep it somewhere safe.');
}
async function onImport(ev) {
  const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  const msg = clear($('#importMsg'));
  if (file.size > 5e6) { msg.append(h('p', { class: 'msg err', text: 'That file is too large to be a backup.' })); return; }
  const text = await file.text();
  const r = importJson(text);
  if (!r.entries.length) { msg.append(h('div', { class: 'msg err' }, h('strong', { text: 'Nothing imported. ' }), (r.errors || []).join(' ') || 'No entries found.')); return; }
  const byId = new Map(state.entries.map((e) => [e.creatorId, e]));
  let fresh = 0;
  for (const e of r.entries) { if (!byId.has(e.creatorId)) fresh++; byId.set(e.creatorId, e); }
  state.entries = [...byId.values()];
  let extra = {};
  try { extra = JSON.parse(text.replace(/^﻿/, '')) || {}; } catch { extra = {}; }
  let keysAdded = 0;
  if (extra && Array.isArray(extra.keyPool)) {
    const taken = new Set([...state.keyPool, ...state.entries.flatMap((e) => e.keys || [])].map((k) => k.toUpperCase()));
    for (const k of extra.keyPool) if (typeof k === 'string' && KEY_RE.test(k.trim().toUpperCase()) && !taken.has(k.trim().toUpperCase())) { state.keyPool.push(k.trim().toUpperCase()); taken.add(k.trim().toUpperCase()); keysAdded++; }
  }
  if (extra && extra.settings && typeof extra.settings === 'object') for (const [k, v] of Object.entries(extra.settings)) if (k in state.settings && typeof v === typeof state.settings[k] && !state.settings[k]) state.settings[k] = v;
  if (!state.target && extra && extra.target && typeof extra.target === 'object' && Array.isArray(extra.target.tags)) state.target = extra.target;
  save(); renderBoard(); refreshShortlistButtons();
  const items = [...(r.errors || []).map((x) => `Error: ${x}`), ...(r.warnings || [])].slice(0, 8);
  msg.append(h('div', { class: 'msg' }, h('strong', { text: `Imported ${r.entries.length} creator${r.entries.length === 1 ? '' : 's'}` }), ` (${fresh} new, ${r.entries.length - fresh} updated)${keysAdded ? `, ${keysAdded} pool keys added` : ''}. Imported data is merged into your board.`,
    items.length ? h('ul', { class: 'msg-list' }, items.map((x) => h('li', { text: x }))) : null));
}

/* ---------- how to pitch ---------- */
function renderGuide() {
  const root = clear($('#guide'));
  const g = GUIDE;
  const src = (u) => (safeUrl(u) ? h('p', { class: 'src' }, link(u, 'Source')) : null);
  const principles = Array.isArray(g) ? g : (g && g.principles) || [];
  root.append(h('div', { class: 'guide-grid' }, principles.map((p) => {
    const o = typeof p === 'string' ? { body: p } : p || {};
    return h('article', { class: 'gp' }, o.title ? h('h3', { text: o.title }) : null, h('p', { text: o.body || o.text || '' }),
      Array.isArray(o.points) ? h('ul', null, o.points.map((x) => h('li', { text: String(x) }))) : null, src(o.sourceUrl));
  })));
  const list = (items) => h('ul', null, (items || []).map((i) => { const o = typeof i === 'string' ? { text: i } : i || {}; return h('li', null, o.text || '', ' ', safeUrl(o.sourceUrl) ? link(o.sourceUrl, '(source)') : null); }));
  if (g && !Array.isArray(g) && (g.pitchDos || g.pitchDonts)) root.append(h('div', { class: 'dd' },
    h('div', null, h('h3', null, h('span', { class: 'badge pass' }, statusIconCM('pass'), 'Do')), list(g.pitchDos)),
    h('div', null, h('h3', null, h('span', { class: 'badge fail' }, statusIconCM('fail'), 'Don\'t')), list(g.pitchDonts))));
}
function statusIconCM(status) {
  const s = svg('svg', { class: 'dot', viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (status === 'pass') s.append(svg('circle', { cx: 8, cy: 8, r: 6.5 }), svg('path', { d: 'M5 8.2l2.2 2.2L11 6.2' }));
  else s.append(svg('circle', { cx: 8, cy: 8, r: 6.5 }), svg('path', { d: 'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4' }));
  return s;
}
