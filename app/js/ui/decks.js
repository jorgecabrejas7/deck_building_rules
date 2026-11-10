// Mis mazos: the signed-in player's saved decks (F2). Talks to /pod/api/decks; every deck is a list of versions.
import { state } from '../state.js';
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { $, esc, announce } from './helpers.js';
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
let renameId = null;
let copiedId = null;
let imp = null;            // Archidekt import: {user, status, items, busy, progress}

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
  const body = { list: { entries: state.deck.entries, commanders: state.result.commanders }, source: state.deckSource.source,
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
  if (res.status === 403) { location.assign('account.html'); return true; } // only signed-in players read links
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
  else if (res.status === 200) { status = 'done'; list = res.data.decks; } else status = 'error';
  if (state.tab === 'decks') renderDecks();
}

async function showHistory(id) {
  if (hist && hist.id === id) { hist = null; return renderDecks(); }
  const res = await api(API + 'decks/' + id);
  if (res.status !== 200) return announce(T().sdLoadErr);
  hist = { id, versions: res.data.versions };
  renderDecks();
}

async function remove(id) {
  const res = await api(API + 'decks/' + id, 'DELETE');
  confirmId = null;
  if (res.status !== 204) announce(T().sdFailed);
  else { if (state.openDeck && state.openDeck.id === id) state.openDeck = null; hist = null; list = list.filter(d => d.id !== id); announce(T().sdDeleted); }
  renderAll();
}

async function patch(row, body) {
  const res = await api(API + 'decks/' + row.id, 'POST', body);
  renameId = null;
  if (res.status !== 200) announce(T().sdFailed);
  else { Object.assign(row, res.data.deck); if (state.openDeck && state.openDeck.id === row.id) state.openDeck.name = row.name; }
  renderDecks();
}

async function copyLink(d) {
  try { await navigator.clipboard.writeText(linkOf(d)); } catch (e) { return; }
  copiedId = d.id; renderDecks(); announce(T().copied);
  setTimeout(() => { if (copiedId === d.id) { copiedId = null; renderDecks(); } }, 1600);
}

// ---- import from Archidekt ----
async function findUser(user) {
  imp = { user, status: 'loading', items: [], busy: false, progress: '' };
  renderDecks();
  const res = await api(API + 'archidekt/user/' + encodeURIComponent(user));
  const results = res.status === 200 && Array.isArray(res.data.results) ? res.data.results.filter(r => !r.private) : null;
  imp.status = res.status === 403 ? 'auth' : !results ? 'error' : results.length ? 'done' : 'none';
  imp.items = results || [];
  renderDecks();
}

async function runImport(ids) {
  const t = T(), picked = imp.items.filter(i => ids.includes(String(i.id)));
  let ok = 0;
  imp.busy = true;
  for (const [n, item] of picked.entries()) {
    imp.progress = fill(t.sdImportProg, { n: n + 1, m: picked.length }); renderDecks();
    try {
      const d = await fetchArchidekt(item.id);
      const res = await api(API + 'decks', 'POST', { name: d.name.slice(0, 100), list: { entries: d.entries, commanders: d.commanders }, source: 'archidekt', source_url: 'https://archidekt.com/decks/' + item.id });
      if (res.status === 201) ok++;
      else if (res.data.errors && res.data.errors.decks === 'limit') break;
    } catch (e) { console.error(e); }
  }
  imp = null; status = 'idle';
  announce(fill(t.sdImportDone, { n: ok, m: picked.length }));
  renderDecks();
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

function cardHtml(d, t) {
  const n = d.version_count, vis = d.visibility === 'link' ? 'link' : 'private';
  const head = renameId === d.id
    ? '<form class="dk-form" data-rename="' + d.id + '"><input name="name" value="' + esc(d.name) + '" maxlength="100" required aria-label="' + esc(t.sdRename) + '">' +
      '<button class="btn-ghost-sm">' + esc(t.sdRenameSave) + '</button><button type="button" class="btn-ghost-sm" data-act="cancel">' + esc(t.sdCancel) + '</button></form>'
    : '<h3 class="dk-name">' + esc(d.name) + '</h3>';
  const meta = [d.commanders.join(' / '), fmtDate(d.updated_at), n + ' ' + (n === 1 ? t.sdVersion1 : t.sdVersionN)].filter(Boolean).map(esc).join(' · ');
  const del = confirmId === d.id
    ? '<span class="dk-confirm">' + esc(fill(t.sdDeleteAsk, { n: d.name })) + '</span><button class="btn-ghost-sm btn-danger" data-act="delete-yes">' + esc(t.sdDeleteYes) + '</button><button class="btn-ghost-sm" data-act="cancel">' + esc(t.sdCancel) + '</button>'
    : '<button class="btn-ghost-sm" data-act="delete">' + esc(t.sdDelete) + '</button>';
  const open = hist && hist.id === d.id;
  return '<article class="panel dk-card" data-id="' + d.id + '">' + head + '<p class="note-sm">' + meta + '</p>' +
    '<div class="dk-actions"><button class="btn-primary" data-act="open">' + esc(t.sdOpen) + '</button>' +
    '<button class="btn-ghost-sm" data-act="rename">' + esc(t.sdRename) + '</button>' +
    '<button class="btn-ghost-sm" data-act="history" aria-expanded="' + !!open + '">' + esc(open ? t.sdHideHistory : t.sdHistory) + '</button></div>' +
    '<div class="dk-actions"><label class="dk-vis"><span class="lbl-muted">' + esc(t.sdVis) + '</span><select data-act="vis"><option value="private"' + (vis === 'private' ? ' selected' : '') + '>' + esc(t.sdVisPrivate) + '</option><option value="link"' + (vis === 'link' ? ' selected' : '') + '>' + esc(t.sdVisLink) + '</option></select></label>' +
    (vis === 'link' ? '<button class="btn-ghost-sm" data-act="copy">' + esc(copiedId === d.id ? t.copied : t.sdCopyLink) + '</button>' : '') + '</div>' +
    (open ? '<ol class="dk-history">' + hist.versions.map((v, i) => '<li><b>' + esc(fmtDate(v.created_at)) + '</b>' + (v.note ? ' · ' + esc(v.note) : '') + changes(v, hist.versions[i + 1], t) + '</li>').join('') + '</ol>' : '') +
    '<div class="dk-actions">' + del + '</div></article>';
}

function importHtml(t) {
  if (!imp) return '<button class="btn-ghost-sm" data-act="imp-open">' + esc(t.sdImport) + '</button>';
  const note = (k) => '<p class="note-sm">' + esc(t[k]) + '</p>';
  const body = imp.status === 'loading' ? note('sdLoading') : imp.status === 'auth' ? note('sdNeedLogin') : imp.status === 'error' ? note('sdErr') : imp.status === 'none' ? note('sdImportNone')
    : imp.status === 'done' ? '<form data-importform class="dk-import-list">' + imp.items.map(i => '<label class="dk-pick"><input type="checkbox" value="' + i.id + '"' + (imp.busy ? ' disabled' : '') + '><span>' + esc(i.name) + ' <span class="lbl-muted">' + esc(i.size) + '</span></span></label>').join('') +
      '<button class="btn-primary"' + (imp.busy ? ' disabled' : '') + '>' + esc(imp.busy ? imp.progress : t.sdImportGo) + '</button></form>' : '';
  return '<section class="panel dk-import"><form data-userform class="dk-form"><input name="user" value="' + esc(imp.user) + '" maxlength="40" pattern="[A-Za-z0-9_.\\-]{1,40}" required aria-label="' + esc(t.sdImportUser) + '" placeholder="' + esc(t.sdImportUser) + '">' +
    '<button class="btn-ghost-sm">' + esc(t.sdImportFind) + '</button><button type="button" class="btn-ghost-sm" data-act="imp-close">' + esc(t.sdCancel) + '</button></form>' + body + '</section>';
}

export function renderDecks() {
  const t = T(), el = $('decksPanel');
  if (status === 'idle') load();
  const body = status === 'auth' ? '<p>' + esc(t.sdNeedLogin) + '</p><a class="btn-primary dk-login" href="account.html">' + esc(t.sdSignIn) + '</a>'
    : status === 'error' ? '<p>' + esc(t.sdErr) + '</p>'
    : status !== 'done' ? '<p class="note-sm">' + esc(t.sdLoading) + '</p>'
    : (list.length ? list.map(d => cardHtml(d, t)).join('') : '<p class="note-sm">' + esc(t.sdEmpty) + '</p>') + importHtml(t);
  el.innerHTML = '<div class="part-head"><div><h2 class="part-title">' + esc(t.tabDecks) + '</h2><p class="part-sub">' + esc(t.sdIntro) + '</p></div></div><div class="dk-list">' + body + '</div>';
  el.onclick = onClick; el.onchange = onChange; el.onsubmit = onSubmit;
}

const rowOf = (el) => { const c = el.closest('[data-id]'); return c && list.find(x => x.id === Number(c.dataset.id)); };

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'SELECT') return;
  const act = b.dataset.act, d = rowOf(b);
  if (act === 'imp-open') { imp = { user: '', status: 'idle', items: [], busy: false, progress: '' }; return renderDecks(); }
  if (act === 'imp-close') { imp = null; return renderDecks(); }
  if (act === 'cancel') { renameId = null; confirmId = null; return renderDecks(); }
  if (!d) return;
  if (act === 'open') openSaved(d.id);
  else if (act === 'rename') { renameId = d.id; renderDecks(); }
  else if (act === 'history') showHistory(d.id);
  else if (act === 'copy') copyLink(d);
  else if (act === 'delete') { confirmId = d.id; renderDecks(); }
  else if (act === 'delete-yes') remove(d.id);
}

function onChange(e) {
  if (e.target.dataset.act === 'vis') patch(rowOf(e.target), { visibility: e.target.value });
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.rename) patch(list.find(x => x.id === Number(f.dataset.rename)), { name: f.name.value.trim() });
  else if ('userform' in f.dataset) findUser(f.user.value.trim());
  else if ('importform' in f.dataset && !imp.busy) {
    const ids = [...f.querySelectorAll('input:checked')].map(i => i.value);
    if (ids.length) runImport(ids);
  }
}
