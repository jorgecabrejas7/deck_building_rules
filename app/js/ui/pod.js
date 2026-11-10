// The Pod tab (F3): the player's pods, the active pod's decks read in the browser with its own rules, its members and its admin tools.
import * as PodEngine from '../engine/index.js';
import { state, persistCache } from '../state.js';
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { setRules } from '../rules.js';
import { $, esc, tierTone, announce } from './helpers.js';
import { loadStudy } from './profile.js';
import { analyze, readDeck, readDeps, recompute } from '../pipeline.js';
import { deckToText } from '../advice.js';
import { runTableMode } from './table.js';
import { renderAll } from '../main.js';

const API = '../api/';
const rows = new Map();     // deckId|updated_at|rules_updated_at -> the figures read for that deck
let run = 0;                // the latest table computation; an older one stops publishing
let progress = null;        // {n, m} while decks are being read
let loadingDetail = false;
let status = 'idle';        // idle | error: the last detail load
let asking = null;         // 'leave' | 'm<userId>' | 'd<deckId>': the action awaiting its second press
let msg = null;             // i18n key of the last answer worth showing
let adding = null;          // {decks}: my decks that could join, once Añadir mi mazo is pressed
let renaming = false;
let editing = false;
let editorEl = null;        // kept across renders so a half-edited rule is not lost
let copied = false;
let games = null;           // {podId, list, busy}: my games in the active pod; null = to be loaded
let gMsg = null;            // i18n key of the last games answer
let failed = false;         // reading the table failed: not retried until the rules or the pod change

const keyOf = (d) => d.id + '|' + d.updated_at + '|' + state.pod.rules_updated_at;
const inviteLink = (code) => new URL('index.html#join=' + code, location.href).href;

// ---- the picker, on Cargar and at the top of the tab ----
const pickerOptions = () => {
  const t = T();
  return '<option value="">' + esc(t.pdTemplate) + '</option>' +
    state.pods.map(p => '<option value="' + p.id + '"' + (p.id === state.activeId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
};
const count = (n, one, many) => n === 1 ? one : fill(many, { n });

export function renderPodPicker() {
  const label = $('podSel').closest('label');
  label.hidden = !state.pods;
  if (!state.pods) return;
  $('podLabel').textContent = T().pdPicker;
  $('podSel').innerHTML = pickerOptions();
}

// A pod's rules reach every figure, so switching, saving rules or reading a pod again redoes the open analysis.
function applyRules() {
  run++; progress = null; failed = false;
  setRules(state.pod);
  state.tableResults = null;
  if (state.result) recompute();
}
async function loadDetail(id) {
  const res = await api(API + 'pods/' + id);
  return res.status === 200 ? res.data.pod : null;
}
// Asks the server again for the list and the active pod: after anything that changes either.
async function reload() {
  const res = await api(API + 'pods');
  if (res.status !== 200) { msg = 'pdErr'; return; }
  state.pods = res.data.pods;
  state.activeId = res.data.active ? res.data.active.id : null;
  state.pod = state.activeId ? await loadDetail(state.activeId) : null;
  if (state.activeId && !state.pod) { msg = 'pdErr'; return; }
  applyRules();
}
const reset = () => { games = null; gMsg = null; asking = null; adding = null; renaming = false; editing = false; editorEl = null; };

export async function selectPod(id) {
  const res = await api(API + 'pods/active', 'POST', { pod: id });
  if (res.status !== 204) { msg = 'pdErr'; return renderAll(); }
  reset(); msg = null;
  state.activeId = id;
  state.pod = id ? await loadDetail(id) : null;
  applyRules();
  renderAll();
}

// The #join= link. true: joined; false: the code is no good; null: sent to sign in and back.
export async function joinPod(code) {
  const res = await api(API + 'pods/join', 'POST', { code });
  if (res.status === 403) { location.assign('account.html' + location.hash); return null; }
  if (res.status !== 200) { msg = res.data.errors && res.data.errors.pods === 'limit' ? 'pdErrLimit' : 'pdJoinBad'; return false; }
  reset(); msg = null;
  await reload();
  return true;
}

// ---- the deck table: one deck at a time, never more than the browser can hold ----
const figures = (r) => ({ tier: r.evalRes.tier, banned: r.evalRes.violations.some(v => v.id === 'banned'), points: r.evalRes.points,
  level: r.level, checklist: r.bracket.checklist, salt: r.salt ? r.salt.total : null, price: r.stats.total_price_eur });

async function compute() {
  const mine = ++run;
  const todo = state.pod.decks.filter(d => d.list && !rows.has(keyOf(d)));
  if (!todo.length) { progress = null; return; }
  progress = { n: 0, m: todo.length };
  renderPod();
  try {
    const deps = await readDeps();
    for (const d of todo) {
      if (mine !== run) return;
      const key = keyOf(d), commanders = d.list.commanders;
      const r = await readDeck({ entries: d.list.entries, commanders }, deps, commanders.length ? commanders : null);
      if (mine !== run) return;
      rows.set(key, figures(r));
      progress.n++;
      renderPod();
    }
    persistCache();
  } catch (e) { console.error(e); msg = 'pdErr'; failed = true; }
  if (mine === run) { progress = null; renderPod(); }
}

const cell = (v) => '<td class="mono num">' + v + '</td>';
function deckRow(d, t) {
  const f = d.list ? rows.get(keyOf(d)) : null;
  const who = d.mine ? t.pdYou : fill(t.pdOwner, { n: d.owner });
  const head = '<th scope="row"><span class="pod-name">' + esc(d.name) + '</span><span class="pod-why pod-who">' + esc(who) + '</span></th>';
  let body;
  if (!d.list) body = '<td colspan="6" class="note-sm">' + esc(t.pdPrivate) + '</td>';
  else if (!f) body = '<td colspan="6" class="note-sm">…</td>';
  else body = '<td><span class="tier-pill ' + tierTone(f.tier) + '">' + esc(t['short_' + f.tier]) + '</span>' +
      (f.banned ? '<span class="pod-why">' + esc(t.podBanned) + '</span>' : '') + '</td>' +
    cell(f.points) + cell(f.level.pending ? '—' : esc(f.level.bracket) + ' · ' + f.level.score) + cell(f.level.pending ? '…' : f.checklist) +
    cell(f.salt === null ? '—' : f.salt.toFixed(1)) + cell('€' + Math.round(f.price));
  const ask = asking === 'd' + d.id;
  const out = !(d.mine || state.pod.role === 'admin') ? ''
    : ask ? '<span class="dk-confirm">' + esc(fill(t.pdRemoveDeckAsk, { n: d.name })) + '</span><button class="btn-ghost-sm btn-danger" data-act="deck-out-yes" data-deck="' + d.id + '">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" data-act="cancel">' + esc(t.pdCancel) + '</button>'
    : '<button class="btn-ghost-sm" data-act="deck-out" data-deck="' + d.id + '">' + esc(t.pdRemoveDeck) + '</button>';
  const acts = (d.list ? '<button class="btn-ghost-sm" data-act="analyze" data-deck="' + d.id + '">' + esc(t.pdAnalyze) + '</button>' +
    (state.deck ? '<button class="btn-ghost-sm" data-act="compare" data-deck="' + d.id + '">' + esc(t.pdCompare) + '</button>' : '') : '') + out;
  return '<tr>' + head + body + '<td><div class="pod-actions">' + acts + '</div></td></tr>';
}

function deckTable(t) {
  const med = state.study && state.study.medians;
  const ref = (label, m) => '<tr class="pod-ref"><th scope="row">' + esc(label) + '</th><td></td>' +
    cell(Math.round(m.points)) + cell(m.power.toFixed(1)) + cell('') + cell(m.salt_total.toFixed(1)) + cell('€' + Math.round(m.price)) + '<td></td></tr>';
  const th = (label, cls) => '<th scope="col"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(label) + '</th>';
  const decks = state.pod.decks;
  return '<div class="tbl-scroll pod-scroll"><table class="pod-table"><thead><tr>' + th(t.tmDeck) + th(t.tierWord) + th(t.pts, 'num') +
    th(t.pfPractical, 'num') + th(t.brTileN, 'num') + th(t.pfSalt, 'num') + th(t.price, 'num') + '<td></td></tr></thead><tbody>' +
    decks.map(d => deckRow(d, t)).join('') +
    (med ? ref(t.pfRef_precon, med.precon) + ref(t.pfRef_cedh, med.cedh) : '') + '</tbody></table></div>' +
    (progress ? '<p class="note-sm" role="status">' + esc(fill(t.pdCalc, progress)) + '</p>' : '') +
    (decks.length ? '' : '<p class="note-sm">' + esc(t.pdEmpty) + '</p>') + (med ? '<p class="note-sm">' + esc(t.pdRefNote) + '</p>' : '');
}

// ---- adding a deck, members, admin ----
function addHtml(t) {
  const inPod = new Set(state.pod.decks.map(d => d.id));
  if (!adding) return '<button class="btn-ghost-sm" data-act="add-open">' + esc(t.pdAdd) + '</button>';
  const free = adding.decks.filter(d => !inPod.has(d.id));
  if (!free.length) return '<p class="note-sm">' + esc(t.pdAddNone) + '</p>';
  return '<form class="dk-form" data-addform><select name="deck" aria-label="' + esc(t.pdAdd) + '">' +
    free.map(d => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('') + '</select>' +
    '<button class="btn-primary">' + esc(t.pdAddGo) + '</button><button type="button" class="btn-ghost-sm" data-act="cancel">' + esc(t.pdCancel) + '</button></form>';
}

function membersHtml(t) {
  const admin = state.pod.role === 'admin';
  const ask = (key, text, yes) => '<span class="dk-confirm">' + esc(text) + '</span><button class="btn-ghost-sm btn-danger" data-act="' + yes + '">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" data-act="cancel">' + esc(t.pdCancel) + '</button>';
  const li = state.pod.members.map(m => {
    let acts = '';
    if (m.me) acts = asking === 'leave' ? ask(fill(t.pdLeaveAsk, { n: state.pod.name }), 'leave-yes') : '<button class="btn-ghost-sm" data-act="leave">' + esc(t.pdLeave) + '</button>';
    else if (admin) {
      acts = (m.role === 'admin' ? '' : '<button class="btn-ghost-sm" data-act="promote" data-user="' + m.id + '">' + esc(t.pdMakeAdmin) + '</button>') +
        (asking === 'm' + m.id ? ask(fill(t.pdKickAsk, { n: m.name }), 'kick-yes" data-user="' + m.id) : '<button class="btn-ghost-sm" data-act="kick" data-user="' + m.id + '">' + esc(t.pdKick) + '</button>');
    }
    return '<li class="pod-member"><span class="pod-mname">' + esc(m.name) + (m.me ? ' <span class="lbl-muted">(' + esc(t.pdYou) + ')</span>' : '') +
      ' <span class="lbl-muted">' + esc(m.role === 'admin' ? t.pdRoleAdmin : t.pdRoleMember) + '</span></span><span class="dk-actions">' + acts + '</span></li>';
  }).join('');
  return '<h3 class="pod-sub">' + esc(t.pdMembers) + '</h3><ul class="pod-members">' + li + '</ul>';
}

function adminHtml(t) {
  const p = state.pod;
  const name = renaming
    ? '<form class="dk-form" data-renameform><input name="name" value="' + esc(p.name) + '" maxlength="100" required aria-label="' + esc(t.pdRename) + '">' +
      '<button class="btn-ghost-sm">' + esc(t.pdSave) + '</button><button type="button" class="btn-ghost-sm" data-act="cancel">' + esc(t.pdCancel) + '</button></form>'
    : '<button class="btn-ghost-sm" data-act="rename">' + esc(t.pdRename) + '</button>';
  return '<h3 class="pod-sub">' + esc(t.pdAdmin) + '</h3><div class="dk-actions">' + name +
    '<button class="btn-ghost-sm" data-act="rules" aria-expanded="' + editing + '">' + esc(editing ? t.pdCloseRules : t.pdEditRules) + '</button></div>' +
    (editing ? '<div id="podRules" class="pod-rules"></div>' : '') +
    '<div class="pod-invite"><span class="lbl-muted">' + esc(t.pdInvite) + '</span><input readonly class="pod-link-in" value="' + esc(inviteLink(p.invite_code)) + '" aria-label="' + esc(t.pdInvite) + '">' +
    '<div class="dk-actions"><button class="btn-ghost-sm" data-act="copy">' + esc(copied ? t.pdCopied : t.pdCopy) + '</button>' +
    '<button class="btn-ghost-sm" data-act="regen">' + esc(t.pdRegen) + '</button></div><p class="note-sm">' + esc(t.pdRegenNote) + '</p></div>';
}

// ---- games (F5): invite another member, open or end my games ----
async function loadGames() {
  const id = state.pod.id;
  games = { podId: id, list: [], busy: true };
  const res = await api(API + 'pods/' + id + '/games');
  if (!state.pod || state.pod.id !== id) return;
  if (res.status === 200) games = { podId: id, list: res.data.games, busy: false };
  else { games = { podId: id, list: [], busy: false }; gMsg = 'pdGErr'; }
  if (state.tab === 'pod') renderPod();
}
function gamesHtml(t) {
  const others = state.pod.members.filter(m => !m.me);
  const invite = others.length
    ? '<form class="dk-form" data-gameform><select name="opponent" aria-label="' + esc(t.pdGWho) + '">' +
      others.map(m => '<option value="' + m.id + '">' + esc(m.name) + '</option>').join('') + '</select>' +
      '<button class="btn-primary">' + esc(t.pdGInvite) + '</button></form>'
    : '<p class="note-sm">' + esc(t.pdGNoOthers) + '</p>';
  const li = (games ? games.list : []).map(g => {
    const who = g.opponent === null ? t.pdGDeleted : g.opponent;
    const me = g.picked[g.seat], them = g.picked[3 - g.seat];
    const st = g.status === 'active' ? t.pdGActive
      : fill(t.pdGWait, { a: me ? t.pdGPicked : t.pdGNotPicked, b: them ? t.pdGPicked : t.pdGNotPicked });
    const lobby = g.status === 'lobby';
    const end = asking === 'g' + g.id
      ? '<span class="dk-confirm">' + esc(t.pdGAsk) + '</span><button class="btn-ghost-sm btn-danger" data-act="game-end-yes" data-game="' + g.id + '">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" data-act="cancel">' + esc(t.pdCancel) + '</button>'
      : '<button class="btn-ghost-sm" data-act="game-end" data-game="' + g.id + '">' + esc(lobby ? t.pdGDecline : t.pdGEnd) + '</button>';
    return '<li class="pod-member"><span class="pod-mname">' + esc(who) + ' <span class="lbl-muted">' + esc(st) + '</span></span><span class="dk-actions">' +
      '<a class="btn-ghost-sm" href="table.html?game=' + g.id + '">' + esc(t.pdGOpen) + '</a>' + end + '</span></li>';
  }).join('');
  return '<h3 class="pod-sub">' + esc(t.pdGames) + '</h3>' + invite + (gMsg ? '<p class="note-bad" role="status">' + esc(t[gMsg]) + '</p>' : '') +
    (li ? '<ul class="pod-members">' + li + '</ul>' : games && !games.busy ? '<p class="note-sm">' + esc(t.pdGNone) + '</p>' : '');
}
async function gameAct(method, path, body, ok) {
  const res = await api(API + path, method, body);
  gMsg = res.status === ok ? null : res.data.errors && res.data.errors.games === 'limit' ? 'pdGLimit' : res.status === 0 ? 'pdErr' : 'pdGErr';
  asking = null;
  await loadGames();
  return res.status === ok;
}

function createHtml(t) {
  return '<details class="pod-create"' + (state.pod ? '' : ' open') + '><summary>' + esc(t.pdCreate) + '</summary><form class="dk-form" data-createform>' +
    '<input name="name" maxlength="100" required placeholder="' + esc(t.pdName) + '" aria-label="' + esc(t.pdName) + '">' +
    '<label class="dk-vis"><span class="lbl-muted">' + esc(t.pdCopyFrom) + '</span><select name="from"><option value="">' + esc(t.pdTemplate) + '</option>' +
    state.pods.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select></label>' +
    '<button class="btn-primary">' + esc(t.pdCreateGo) + '</button></form></details>';
}

export function renderPod() {
  const t = T(), el = $('podPanel');
  loadStudy();
  const head = '<div class="part-head"><div><h2 class="part-title">' + esc(state.pod ? state.pod.name : t.tabPod) + '</h2><p class="part-sub">' + esc(t.pdIntro) + '</p></div></div>';
  const note = (k) => '<p class="note-sm">' + esc(t[k]) + '</p>';
  let body;
  if (!state.pods) body = note('pdSignInNote') + '<a class="btn-primary dk-login" href="account.html">' + esc(t.sdSignIn) + '</a>';
  else {
    if (state.activeId && !state.pod && !loadingDetail && status !== 'error') {
      loadingDetail = true;
      loadDetail(state.activeId).then(p => { state.pod = p; status = p ? 'idle' : 'error'; }).finally(() => {
        loadingDetail = false;
        if (state.tab === 'pod') renderPod();
      });
    }
    const pick = '<label class="arch-field"><span class="lbl-muted">' + esc(t.pdPicker) + '</span><select id="podSelTab" class="arch-select">' + pickerOptions() + '</select></label>';
    const flash = msg ? '<p class="note-bad" role="status">' + esc(t[msg]) + '</p>' : '';
    if (!state.activeId) body = pick + flash + note('pdNoPod') + createHtml(t);
    else if (!state.pod) body = pick + flash + note(status === 'error' ? 'pdErr' : 'pdLoading');
    else {
      const p = state.pod;
      body = pick + flash + '<p class="note-sm">' + esc(p.role === 'admin' ? t.pdRoleAdmin : t.pdRoleMember) + ' · ' + esc(count(p.members.length, t.pdMember1, t.pdMemberN) + ' · ' + count(p.decks.length, t.pdDeck1, t.pdDeckN)) + '</p>' +
        '<div class="panel pod-card">' + deckTable(t) + '<div class="dk-actions">' + addHtml(t) + '</div></div>' +
        '<div class="panel pod-card">' + membersHtml(t) + (p.role === 'admin' ? adminHtml(t) : '') + '</div>' +
        '<div class="panel pod-card">' + gamesHtml(t) + '</div>' + createHtml(t);
    }
  }
  el.innerHTML = '<div class="stack-16">' + head + body + '</div>';
  const host = $('podRules');
  if (host) {
    if (!editorEl) {
      editorEl = document.createElement('div');
      import('./podrules.js').then(m => m.renderRulesEditor(editorEl, state.pod, onSaved));
    }
    host.replaceWith(editorEl);
  }
  if (state.pod && (!games || games.podId !== state.pod.id)) loadGames();
  const stale = state.pod && !progress && !failed && state.pod.decks.some(d => d.list && !rows.has(keyOf(d)));
  if (stale) compute();
  el.onclick = onClick; el.onsubmit = onSubmit; el.onchange = onChange;
}

function onSaved(pod) {
  state.pod = pod; editing = false; editorEl = null;
  applyRules();
  renderAll();
 
}

// ---- actions ----
async function act(method, path, body, ok) {
  const res = await api(API + path, method, body);
  const errs = res.data.errors || {};
  if (res.status !== ok) {
    msg = errs.decks === 'limit' || errs.pods === 'limit' ? 'pdErrLimit' : errs.role === 'last_admin' ? 'pdErrLastAdmin' : 'pdErr';
    renderPod(); return null;
  }
  msg = null;
  return res;
}
const here = (path) => 'pods/' + state.pod.id + (path ? '/' + path : '');

async function refresh() { asking = null; adding = null; renaming = false; await reload(); renderAll(); }

function openDeck(entry) {
  const list = entry.list, text = deckToText(list);
  $('deckText').value = text;
  state.arch = 'auto'; state.error = null; state.restoring = false;
  state.cmdPick = list.commanders.length ? { key: PodEngine.deckFingerprint(PodEngine.parseDecklist(text).entries), names: list.commanders } : null;
  state.openDeck = entry.mine ? { id: entry.id, name: entry.name, commanders: list.commanders } : null;
  analyze();
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'SELECT') return;
  const a = b.dataset.act, entry = state.pod && state.pod.decks.find(d => d.id === Number(b.dataset.deck)), user = Number(b.dataset.user);
  if (a === 'cancel') { asking = null; adding = null; renaming = false; return renderPod(); }
  if (a === 'analyze') return openDeck(entry);
  if (a === 'compare') {
    state.tableTexts = [deckToText(state.deck), deckToText(entry.list), '', ''];
    state.tableOpen = true; state.tableResults = null; state.tab = 'load';
    renderAll(); return runTableMode();
  }
  if (a === 'game-end') { asking = 'g' + b.dataset.game; return renderPod(); }
  if (a === 'game-end-yes') { await gameAct('DELETE', 'games/' + b.dataset.game, undefined, 204); return; }
  if (a === 'add-open') {
    const res = await api(API + 'decks');
    adding = { decks: res.status === 200 ? res.data.decks : [] };
    if (res.status !== 200) msg = 'pdErr';
    return renderPod();
  }
  if (a === 'deck-out') { asking = 'd' + entry.id; return renderPod(); }
  if (a === 'deck-out-yes') { if (await act('DELETE', here('decks/' + entry.id), undefined, 204)) refresh(); return; }
  if (a === 'leave') { asking = 'leave'; return renderPod(); }
  if (a === 'leave-yes') { if (await act('POST', here('leave'), undefined, 204)) { reset(); await reload(); renderAll(); } return; }
  if (a === 'kick') { asking = 'm' + user; return renderPod(); }
  if (a === 'kick-yes') { if (await act('DELETE', here('members/' + user), undefined, 204)) refresh(); return; }
  if (a === 'promote') { if (await act('POST', here('members/' + user), { role: 'admin' }, 204)) refresh(); return; }
  if (a === 'rename') { renaming = true; return renderPod(); }
  if (a === 'rules') { editing = !editing; editorEl = null; return renderPod(); }
  if (a === 'regen') { const res = await act('POST', here('invite'), undefined, 200); if (res) { state.pod.invite_code = res.data.invite_code; renderPod(); } return; }
  if (a === 'copy') {
    try { await navigator.clipboard.writeText(inviteLink(state.pod.invite_code)); } catch (err) { return; }
    copied = true; renderPod(); announce(T().pdCopied);
    setTimeout(() => { copied = false; if (state.tab === 'pod') renderPod(); }, 1600);
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if ('gameform' in f.dataset) await gameAct('POST', here('games'), { opponent: Number(f.opponent.value) }, 201);
  else if ('addform' in f.dataset) { if (await act('POST', here('decks'), { deck: Number(f.deck.value) }, 201)) refresh(); }
  else if ('renameform' in f.dataset) { if (await act('POST', here(), { name: f.name.value.trim() }, 200)) refresh(); }
  else if ('createform' in f.dataset) {
    const res = await act('POST', 'pods', { name: f.name.value.trim(), from: f.from.value ? Number(f.from.value) : null }, 201);
    if (res) { reset(); await reload(); renderAll(); }
  }
}

function onChange(e) { if (e.target.id === 'podSelTab') selectPod(Number(e.target.value) || null); }
