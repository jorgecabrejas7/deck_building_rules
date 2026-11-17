// Mis mazos: the signed-in player's saved decks (F2). Talks to /pod/api/decks; every deck is a list of versions.
import { state } from '../state.js';
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { $, esc, has, announce, coverArt, coverStyle, bindCovers, glide } from './helpers.js';
import { renderHeader } from './header.js';
import { renderAll } from '../main.js';
import { analyze } from '../pipeline.js';
import { deckToText } from '../advice.js';
import { parseDecklist, deckFingerprint, fetchArchidekt, diffCards } from '../engine/index.js';

const API = '../api/';
const LABEL_MS = 3000;
let list = null;           // the summaries, newest first
let status = 'idle';       // idle | loading | done | auth | error
let hist = null;           // {id, versions}: the history unfolded under one deck
let confirmId = null;      // the deck whose Borrar awaits its second press
let openId = null;         // the deck whose Opciones are unfolded
let podMsg = null;         // the deck whose last pod tick was refused
let q = '';                // what is typed in the search
let filter = 'all';        // all | none (in no pod) | a pod id
let byName = false;        // sorted by name instead of newest first
let copiedId = null;
let arrived = false;       // the tiles' entrance has played
let sheetWas = null;       // the deck whose sheet is already on screen: a redraw must not replay its entrance
let archUser = '';         // the Archidekt username kept on the account
let sync = null;           // the Archidekt sync: {ask, err} the username is asked for | {busy, n, m} | {done: counts}

const linkOf = (d) => location.origin + location.pathname + '#deck=' + d.link_token;
const cards = (v) => v.list.entries.map(e => [e.name, e.quantity]);
const fmtDate = (s) => new Date(s).toLocaleDateString(state.lang);

function flash(key) {
  state.saveSt = key; renderHeader(); announce(T()[key]);
  setTimeout(() => { if (state.saveSt === key) { state.saveSt = null; renderHeader(); } }, LABEL_MS);
}

// ---- Guardar (header button) ----
export async function saveDeck() {
  if (!state.result) return;
  if (state.saveSt === 'sdSignIn') { location.assign('account.html'); return; }
  const body = { list: { entries: state.deck.entries, commanders: state.result.commanders, side: state.deck.side || [], maybe: state.deck.maybe || [] }, source: state.deckSource.source,
    ...(state.deckSource.url ? { source_url: state.deckSource.url } : {}) };
  const open = state.openDeck;
  const res = open ? await api(API + 'decks/' + open.id + '/versions', 'POST', body)
    : await api(API + 'decks', 'POST', { ...body, name: state.deck.name || state.result.commanders.join(' / ') || 'Deck' });
  if (res.status === 403) return flash('sdSignIn');
  if (res.status === 404 && open) { state.openDeck = null; return flash('sdFailed'); } // deleted elsewhere: the next press saves a new deck
  if (res.status !== 200 && res.status !== 201) {
    const e = res.data.errors || {};
    return flash(e.decks === 'limit' || e.versions === 'limit' ? 'sdLimit' : 'sdFailed');
  }
  if (!open) state.openDeck = { id: res.data.deck.id, name: res.data.deck.name, commanders: state.result.commanders };
  list = null; status = 'idle'; hist = null;
  flash('sdSaved');
}

// Another tab changed which pods a deck is in: ask for the list again next time.
export function forgetDecks() { list = null; status = 'idle'; }

// ---- opening ----
function fillDeck(version) {
  const text = deckToText(version.list);
  $('deckText').value = text;
  state.arch = 'auto';
  const names = version.list.commanders;
  state.cmdPick = names.length ? { key: deckFingerprint(parseDecklist(text).entries), names } : null;
}

async function openSaved(id) {
  const res = await api(API + 'decks/' + id);
  if (res.status !== 200 || !res.data.versions.length) { announce(T().sdLoadErr); return; }
  fillDeck(res.data.versions[0]);
  state.openDeck = { id, name: res.data.deck.name, commanders: res.data.versions[0].list.commanders };
  state.restoring = false;
  analyze();
}

// A #deck= link: the latest version of someone else's deck, never saved into the visitor's session. false = unreadable.
export async function openLinked(token) {
  const res = await api(API + 'decks/link/' + encodeURIComponent(token));
  if (res.status === 403) { location.assign('account.html' + location.hash); return true; } // only signed-in players read links
  if (res.status !== 200) return false;
  fillDeck(res.data.version);
  state.openDeck = null; // someone else's deck: saving it makes the visitor's own copy
  analyze(true);
  return true;
}

// ---- the list ----
async function load() {
  status = 'loading';
  const res = await api(API + 'decks');
  if (res.status === 403) status = 'auth';
  else if (res.status === 200) { status = 'done'; list = res.data.decks; archUser = res.data.archidekt_username; } else status = 'error';
  if (state.tab === 'decks') renderDecks();
}

async function showHistory(id) {
  if (hist && hist.id === id) { hist = null; return paint(); }
  const res = await api(API + 'decks/' + id);
  if (res.status !== 200) return announce(T().sdLoadErr);
  hist = { id, versions: res.data.versions };
  paint();
}

async function remove(id) {
  const res = await api(API + 'decks/' + id, 'DELETE');
  confirmId = null;
  if (res.status !== 204) announce(T().sdFailed);
  else { if (state.openDeck && state.openDeck.id === id) state.openDeck = null; hist = null; openId = null; list = list.filter(d => d.id !== id); announce(T().sdDeleted); }
  renderAll();
}

async function patch(row, body) {
  const res = await api(API + 'decks/' + row.id, 'POST', body);
  if (res.status !== 200) announce(T().sdFailed);
  else { Object.assign(row, res.data.deck); if (state.openDeck && state.openDeck.id === row.id) state.openDeck.name = row.name; if (body.name) announce(T().sdRenamed); }
  paint();
}

async function copyLink(d) {
  try { await navigator.clipboard.writeText(linkOf(d)); } catch (e) { return; }
  copiedId = d.id; paint(); announce(T().copied);
  setTimeout(() => { if (copiedId === d.id) { copiedId = null; paint(); } }, 1600);
}

// ---- sync with Archidekt: one press brings every public Commander deck of that user and updates the ones already here ----
const boards = (l) => JSON.stringify([...['entries', 'side', 'maybe'].map(b => (l[b] || []).map(e => e.quantity + ' ' + e.name).sort()), [...l.commanders].sort()]);

async function runSync(user) {
  sync = { busy: true, n: 0, m: 0 };
  paint();
  const stop = (err) => { sync = { ask: true, err }; paint('dkArchUser'); };
  if (user !== archUser) {
    const r = await api(API + 'me', 'POST', { archidekt_username: user });
    if (r.status !== 200) return stop('sdErr');
    archUser = user;
  }
  // shortcut: the proxy route lists the first 50 decks; page it when someone has more Commander decks than that
  const res = await api(API + 'archidekt/user/' + encodeURIComponent(user));
  const items = res.status === 200 && Array.isArray(res.data.results) ? res.data.results.filter(r => !r.private) : null;
  if (!items || !items.length) return stop(items ? 'sdImportNone' : 'sdErr');
  const mine = new Map(list.filter(d => d.archidekt).map(d => [d.archidekt.url, d]));
  const out = { added: 0, updated: 0, same: 0, failed: 0, limit: false };
  sync.m = items.length;
  for (const item of items) {
    sync.n++;
    const st = $('dkSyncSt');
    if (st) st.textContent = fill(T().sdSyncProg, sync);
    const url = 'https://archidekt.com/decks/' + item.id, d = mine.get(url);
    try {
      if (d && item.updatedAt && Date.parse(item.updatedAt) < Date.parse(d.archidekt.at)) { out.same++; continue; }
      const a = await fetchArchidekt(item.id);
      const body = { list: { entries: a.entries, commanders: a.commanders, side: a.side, maybe: a.maybe }, source: 'archidekt', source_url: url };
      if (d) { // a new version only when Archidekt's list differs from the last copy taken from it: edits made here stay on top
        const cur = await api(API + 'decks/' + d.id);
        const last = cur.status === 200 && cur.data.versions.find(v => v.source === 'archidekt');
        if (last && boards(last.list) === boards(body.list)) { out.same++; continue; }
        const r = await api(API + 'decks/' + d.id + '/versions', 'POST', body);
        r.status === 201 ? out.updated++ : out.failed++;
      } else {
        const r = await api(API + 'decks', 'POST', { ...body, name: a.name.slice(0, 100) });
        if (r.status === 201) out.added++;
        else if ((r.data.errors || {}).decks === 'limit') { out.limit = true; out.failed = items.length - out.added - out.updated - out.same; break; }
        else out.failed++;
      }
    } catch (e) { console.error(e); out.failed++; }
  }
  sync = { done: out };
  hist = null;
  announce(fill(T().sdSyncDone, out));
  await load();
}

// ---- rendering ----
const changes = (v, older, t) => {
  if (!older) return ' <span class="note-sm">' + esc(t.sdFirst) + '</span>';
  const { added, cut } = diffCards(cards(older), cards(v));
  const names = (xs) => xs.slice(0, 10).map(x => (x.n > 1 ? x.n + 'x ' : '') + esc(x.name)).join(', ') + (xs.length > 10 ? ' ' + esc(fill(t.sdMore, { n: xs.length - 10 })) : '');
  if (!added.length && !cut.length) return '<span class="note-sm">' + esc(t.sdNoChange) + '</span>';
  return (added.length ? '<p class="note-sm"><b>' + esc(t.sdAdded) + '</b> ' + names(added) + '</p>' : '') +
    (cut.length ? '<p class="note-sm"><b>' + esc(t.sdCut) + '</b> ' + names(cut) + '</p>' : '');
};

// One deck is one row: tapping it opens the deck, Opciones unfolds everything else.
function optionsHtml(d, t) {
  const n = d.version_count, shared = d.visibility === 'link', showHist = hist && hist.id === d.id;
  const pods = state.pods && state.pods.length
    ? state.pods.map(p => '<label class="dk-pick"><input type="checkbox" id="dk-pod-' + d.id + '-' + p.id + '" data-act="pod" data-pod="' + p.id + '"' + (d.pods.includes(p.id) ? ' checked' : '') + '><span>' + esc(p.name) + '</span></label>').join('')
    : '<p class="note-sm">' + esc(t.sdNoPods) + '</p>';
  const del = confirmId === d.id
    ? '<span class="dk-confirm">' + esc(fill(t.sdDeleteAsk, { n: d.name })) + '</span><button class="btn-ghost-sm btn-danger" id="dk-delyes-' + d.id + '" data-act="delete-yes">' + esc(t.sdDeleteYes) + '</button><button class="btn-ghost-sm" id="dk-delno-' + d.id + '" data-act="cancel">' + esc(t.sdCancel) + '</button>'
    : '<button class="btn-ghost-sm" id="dk-del-' + d.id + '" data-act="delete">' + esc(t.sdDelete) + '</button>';
  return '<div class="dk-more" id="dk-more-' + d.id + '">' +
    '<p class="note-sm">' + esc(fmtDate(d.updated_at) + ' · ' + n + ' ' + (n === 1 ? t.sdVersion1 : t.sdVersionN)) + '</p>' +
    '<form class="dk-form" data-rename="' + d.id + '"><input name="name" id="dk-name-' + d.id + '" value="' + esc(d.name) + '" maxlength="100" required aria-label="' + esc(t.sdRename) + '">' +
    '<button class="btn-ghost-sm" id="dk-rename-' + d.id + '">' + esc(t.sdRenameSave) + '</button></form>' +
    '<fieldset class="dk-set"><legend class="lbl-muted">' + esc(t.sdPods) + '</legend>' + pods + (podMsg === d.id ? '<p class="note-bad" role="alert">' + esc(t.sdPodErr) + '</p>' : '') + '</fieldset>' +
    '<fieldset class="dk-set"><legend class="lbl-muted">' + esc(t.sdShareTitle) + '</legend><label class="dk-pick"><input type="checkbox" id="dk-share-' + d.id + '" data-act="share"' + (shared ? ' checked' : '') + '><span>' + esc(t.sdShare) + '</span></label>' +
    (shared ? '<div class="dk-actions"><button class="btn-ghost-sm" id="dk-copy-' + d.id + '" data-act="copy">' + esc(copiedId === d.id ? t.copied : t.sdCopyLink) + '</button></div>' : '') + '</fieldset>' +
    '<div class="sheet-foot"><button class="btn-ghost-sm" id="dk-hist-' + d.id + '" data-act="history" aria-expanded="' + !!showHist + '">' + esc(showHist ? t.sdHideHistory : t.sdHistory) + '</button>' + del + '</div>' +
    (showHist ? '<ol class="dk-history">' + hist.versions.map((v, i) => '<li><b>' + esc(fmtDate(v.created_at)) + '</b>' + (v.note ? ' · ' + esc(v.note) : '') + changes(v, hist.versions[i + 1], t) + '</li>').join('') + '</ol>' : '') +
    '</div>';
}

const podName = (id) => ((state.pods || []).find(p => p.id === id) || {}).name;
function shown() {
  const found = list.filter(d => has(q, d.name, ...d.commanders) && (filter === 'all' || (filter === 'none' ? !d.pods.length : d.pods.includes(filter))));
  return byName ? found.sort((a, b) => a.name.localeCompare(b.name, state.lang)) : found; // the server sends newest first
}
const svg = (d, n = 20) => '<svg width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const I_SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const I_MORE = svg('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>');
const I_SYNC = svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>', 18);
const I_CLOSE = svg('<path d="M6 6l12 12M18 6 6 18"/>');

function rowsHtml(t) {
  const found = shown();
  const li = found.map((d, i) => {
    const n = d.versions.length ? d.versions[0].count : 0;
    const tags = '<span class="dkt-tag">' + esc(fill(t.sdCards, { n })) + '</span>' + d.pods.map(podName).filter(Boolean).map(p => '<span class="dkt-tag pod">' + esc(p) + '</span>').join('');
    return '<li class="dkt" data-id="' + d.id + '" style="--i:' + i + ';view-transition-name:dk-' + d.id + '">' +
      '<button class="dkt-open" id="dk-open-' + d.id + '" data-act="open"><span class="dkt-art" style="' + coverStyle(d.name) + '">' +
      (d.commanders.length ? coverArt(d.commanders) : '<span class="dkt-initial" aria-hidden="true">' + esc(d.name.trim().charAt(0).toUpperCase()) + '</span>') + '</span>' +
      '<span class="dkt-body"><span class="dkt-name">' + esc(d.name) + '</span><span class="dkt-sub">' + esc(d.commanders.join(' / ') || t.sdNoCommander) + '</span><span class="dkt-meta">' + tags + '</span></span></button>' +
      '<button class="dkt-more" id="dk-opt-' + d.id + '" data-act="options" aria-haspopup="dialog" aria-label="' + esc(t.sdOptions + ', ' + d.name) + '">' + I_MORE + '</button></li>';
  }).join('');
  return '<p class="visually-hidden" role="status">' + esc(fill(t.sdCount, { n: found.length, m: list.length })) + '</p>' +
    '<ul class="lib-grid' + (arrived ? '' : ' arrive') + '">' + (li || '<li class="lib-empty">' + esc(t.gmNoMatch) + '</li>') + '</ul>';
}
const chip = (id, act, value, label, on) => '<button class="chip-dashed gm-chip" id="' + id + '" data-act="' + act + '" data-value="' + value + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
function listHtml(t) {
  if (!list.length) return '<p class="lib-empty">' + esc(t.sdEmpty) + '</p>';
  const pods = state.pods || [];
  const filters = pods.length ? '<div class="dk-actions" role="group" aria-label="' + esc(t.sdFilter) + '">' + chip('dk-f-all', 'filter', 'all', t.sdAll, filter === 'all') +
    pods.map(p => chip('dk-f-' + p.id, 'filter', p.id, p.name, filter === p.id)).join('') + chip('dk-f-none', 'filter', 'none', t.sdNoPod, filter === 'none') + '</div>' : '<span></span>';
  const sort = '<div class="dk-actions" role="group" aria-label="' + esc(t.sdSort) + '">' + chip('dk-s-recent', 'sort', '', t.sdSortRecent, !byName) + chip('dk-s-name', 'sort', '1', t.sdSortName, byName) + '</div>';
  return '<div class="lib-bar"><label class="lib-search">' + I_SEARCH + '<input type="search" id="dkQ" value="' + esc(q) + '" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t.sdFind) + '" aria-label="' + esc(t.sdFind) + '"></label>' +
    '<div class="lib-filters">' + filters + (list.length > 1 ? sort : '') + '</div></div><div id="dkRows">' + rowsHtml(t) + '</div>' + sheetHtml(t);
}

// The options of one deck, in a sheet over the library.
function sheetHtml(t) {
  const d = openId && list.find(x => x.id === openId);
  if (!d) return '';
  return '<dialog class="sheet' + (sheetWas === d.id ? ' still' : '') + '" id="dkSheet" data-id="' + d.id + '" aria-labelledby="dkSheetTitle">' +
    '<div class="sheet-cover" style="' + coverStyle(d.name) + '">' + coverArt(d.commanders).replaceAll('<img ', '<img class="in" ') + '<button class="sheet-close" id="dk-sheet-close" data-act="options" aria-label="' + esc(t.sdClose) + '">' + I_CLOSE + '</button></div>' +
    '<div class="sheet-in"><h3 class="sheet-title" id="dkSheetTitle">' + esc(d.name) + '</h3>' + optionsHtml(d, t) + '</div></dialog>';
}

function syncHtml(t) {
  const note = (cls, text) => '<p class="' + cls + '" role="status">' + esc(text) + '</p>';
  if (sync && sync.busy) return '<section class="lib-sync"><button class="btn-primary busy" disabled>' + I_SYNC + esc(t.sdSync) + '</button><p class="note-sm" id="dkSyncSt" role="status">' + esc(sync.m ? fill(t.sdSyncProg, sync) : t.sdLoading) + '</p></section>';
  if ((sync && sync.ask) || !archUser) return '<section class="lib-sync"><form data-syncform class="dk-form"><input name="user" id="dkArchUser" value="' + esc(archUser) + '" maxlength="40" pattern="[A-Za-z0-9_.\\-]{1,40}" required autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="' + esc(t.sdImportUser) + '" placeholder="' + esc(t.sdImportUser) + '">' +
    '<button class="btn-primary">' + esc(t.sdSyncConnect) + '</button>' + (archUser ? '<button type="button" class="btn-ghost-sm" data-act="sync-keep">' + esc(t.sdCancel) + '</button>' : '') + '</form>' +
    (sync && sync.err ? note('note-bad', t[sync.err]) : note('note-sm', t.sdSyncHow)) + '</section>';
  const o = sync && sync.done;
  return '<section class="lib-sync"><div class="dk-actions"><button class="btn-primary" id="dk-sync" data-act="sync">' + I_SYNC + esc(t.sdSync) + '</button>' +
    '<button class="btn-ghost-sm" id="dk-sync-user" data-act="sync-user" aria-label="' + esc(t.sdSyncChange + ', ' + archUser) + '">@' + esc(archUser) + '</button></div>' +
    (o ? note(o.failed ? 'note-bad' : 'note-sm', fill(t.sdSyncDone, o) + (o.failed ? ' ' + fill(o.limit ? t.sdSyncLimit : t.sdSyncFailed, { n: o.failed }) : '')) : '') + '</section>';
}

export function renderDecks() {
  const t = T(), el = $('decksPanel');
  if (status === 'idle') load();
  const body = status === 'auth' ? '<p>' + esc(t.sdNeedLogin) + '</p><a class="btn-primary dk-login" href="account.html">' + esc(t.sdSignIn) + '</a>'
    : status === 'error' ? '<p>' + esc(t.sdErr) + '</p>'
    : status !== 'done' ? '<p class="note-sm">' + esc(t.sdLoading) + '</p>'
    : listHtml(t);
  el.innerHTML = '<div class="lib-head"><div><h2 class="part-title">' + esc(t.tabDecks) + '</h2><p class="part-sub">' + esc(t.sdIntro) + '</p></div>' + (status === 'done' ? syncHtml(t) : '') + '</div><div class="dk-list">' + body + '</div>';
  el.onclick = onClick; el.onchange = onChange; el.onsubmit = onSubmit; el.oninput = onInput;
  bindCovers(el);
  const sheet = $('dkSheet');
  sheetWas = sheet ? openId : null;
  if (sheet) {
    sheet.showModal();
    sheet.onclose = () => closeSheet();
    sheet.onmousedown = (e) => { if (e.target === sheet) closeSheet(); }; // a press on the backdrop
  }
  if (status === 'done' && list.length && !arrived) setTimeout(() => { arrived = true; }, 900);
}
function closeSheet() {
  const id = openId;
  if (id === null) return;
  openId = null; confirmId = null; podMsg = null; hist = null;
  paint('dk-opt-' + id);
}
// Redraws the tab and puts the keyboard back where it was, or on the control named.
function paint(focus) {
  if (state.tab !== 'decks') return;
  const id = focus || (document.activeElement && document.activeElement.id);
  renderDecks();
  const el = id && $(id);
  if (el) el.focus({ preventScroll: true });
}

const rowOf = (el) => { const c = el.closest('[data-id]'); return c && list.find(x => x.id === Number(c.dataset.id)); };

// Typing filters the rows under the field without redrawing the field itself.
function onInput(e) { if (e.target.id === 'dkQ') { q = e.target.value; arrived = true; glide(() => { $('dkRows').innerHTML = rowsHtml(T()); }); } }

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act, d = rowOf(b);
  if (act === 'sync') return runSync(archUser);
  if (act === 'sync-user') { sync = { ask: true }; return paint('dkArchUser'); }
  if (act === 'sync-keep') { sync = null; return paint('dk-sync-user'); }
  if (act === 'filter') { filter = Number(b.dataset.value) || b.dataset.value; arrived = true; return glide(() => paint()); }
  if (act === 'sort') { byName = !!b.dataset.value; arrived = true; return glide(() => paint()); }
  if (!d) return;
  if (act === 'open') openSaved(d.id);
  else if (act === 'options') { if (openId === d.id) closeSheet(); else { openId = d.id; arrived = true; paint('dk-sheet-close'); } }
  else if (act === 'history') showHistory(d.id);
  else if (act === 'copy') copyLink(d);
  else if (act === 'delete') { confirmId = d.id; paint('dk-delyes-' + d.id); }
  else if (act === 'cancel') { confirmId = null; paint('dk-del-' + d.id); }
  else if (act === 'delete-yes') remove(d.id);
}

// A tick puts the deck in that pod or takes it out; the Pod tab reads the pod again when it is the active one.
async function togglePod(d, podId, on) {
  const res = on ? await api(API + 'pods/' + podId + '/decks', 'POST', { deck: d.id }) : await api(API + 'pods/' + podId + '/decks/' + d.id, 'DELETE');
  const ok = on ? res.status === 200 || res.status === 201 : res.status === 204 || res.status === 404;
  podMsg = ok ? null : d.id;
  if (ok) {
    d.pods = on ? [...d.pods, podId] : d.pods.filter(x => x !== podId);
    const p = state.pods.find(x => x.id === podId);
    if (p) p.decks += on ? 1 : -1;
    if (podId === state.activeId) state.pod = null;
    announce(fill(on ? T().sdPodIn : T().sdPodOut, { n: podName(podId) }));
  }
  paint();
}

function onChange(e) {
  const act = e.target.dataset.act, d = rowOf(e.target);
  if (act === 'share') patch(d, { visibility: e.target.checked ? 'link' : 'private' });
  else if (act === 'pod') togglePod(d, Number(e.target.dataset.pod), e.target.checked);
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.rename) patch(list.find(x => x.id === Number(f.dataset.rename)), { name: f.name.value.trim() });
  else if ('syncform' in f.dataset) runSync(f.user.value.trim());
}
