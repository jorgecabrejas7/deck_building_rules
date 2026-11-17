// The Pod tab (F3): the player's pods, the active pod's decks read in the browser with its own rules, its members and its admin tools.
import * as PodEngine from '../engine/index.js';
import { state, persistCache } from '../state.js';
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { setRules } from '../rules.js';
import { $, esc, has, tierTone, announce, coverThumb, bindCovers, needCovers } from './helpers.js';
import { forgetDecks } from './decks.js';
import { friendList, loadFriends } from './friends.js';
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
let asking = null;          // 'leave' | 'regen' | 'm<userId>' | 'd<deckId>': the action awaiting its second press
let msg = null;             // i18n key of the last answer worth showing
let adding = null;          // {decks}: my saved decks, while the tick list of Mis mazos en este pod is open
let view = 'decks';         // decks | members | settings: one view of the pod at a time
let creating = false;       // the Nuevo pod form is open
let q = '';                 // what is typed in the deck search
let filter = 'all';         // all | in | out | mine
let tableOpen = false;      // the figures table is unfolded
let editing = false;
let editorEl = null;        // kept across renders so a half-edited rule is not lost
let copied = false;
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
const reset = () => { asking = null; adding = null; creating = false; editing = false; editorEl = null; view = 'decks'; q = ''; filter = 'all'; status = 'idle'; };

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
  const todo = state.pod.decks.filter(d => !rows.has(keyOf(d)));
  if (!todo.length) { progress = null; return; }
  progress = { n: 0, m: todo.length };
  paintRows();
  try {
    const deps = await readDeps();
    for (const d of todo) {
      if (mine !== run) return;
      const key = keyOf(d), commanders = d.list.commanders;
      const r = await readDeck({ entries: d.list.entries, commanders }, deps, commanders.length ? commanders : null);
      if (mine !== run) return;
      rows.set(key, figures(r));
      progress.n++;
      paintRows();
    }
    persistCache();
  } catch (e) { console.error(e); failed = true; }
  if (mine === run) { progress = null; paintRows(); }
}

const cell = (v) => '<td class="mono num">' + v + '</td>';
const isOut = (f) => f.tier === 'above';

// The figures of every deck, for comparing side by side: folded, since the list above already says who is in.
function tableRow(d, t) {
  const f = rows.get(keyOf(d));
  const who = d.mine ? t.pdYou : fill(t.pdOwner, { n: d.owner });
  const head = '<th scope="row"><span class="pod-name">' + esc(d.name) + '</span><span class="pod-why pod-who">' + esc(who) + '</span></th>';
  const body = !f ? '<td colspan="6" class="note-sm">…</td>'
    : '<td><span class="tier-pill ' + tierTone(f.tier) + '">' + esc(t['short_' + f.tier]) + '</span></td>' +
      cell(f.points) + cell(f.level.pending ? '—' : esc(f.level.bracket) + ' · ' + f.level.score) + cell(f.level.pending ? '…' : f.checklist) +
      cell(f.salt === null ? '—' : f.salt.toFixed(1)) + cell('€' + Math.round(f.price));
  const acts = state.deck ? '<button class="btn-ghost-sm" id="pd-cmp-' + d.id + '" data-act="compare" data-deck="' + d.id + '" aria-label="' + esc(t.pdCompare + ', ' + d.name) + '">' + esc(t.pdCompare) + '</button>' : '';
  return '<tr>' + head + body + '<td><div class="pod-actions">' + acts + '</div></td></tr>';
}
function deckTable(t) {
  const med = state.study && state.study.medians;
  const ref = (label, m) => '<tr class="pod-ref"><th scope="row">' + esc(label) + '</th><td></td>' +
    cell(Math.round(m.points)) + cell(m.power.toFixed(1)) + cell('') + cell(m.salt_total.toFixed(1)) + cell('€' + Math.round(m.price)) + '<td></td></tr>';
  const th = (label, cls) => '<th scope="col"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(label) + '</th>';
  return '<div class="tbl-scroll pod-scroll"><table class="pod-table"><thead><tr>' + th(t.tmDeck) + th(t.tierWord) + th(t.pts, 'num') +
    th(t.pfPractical, 'num') + th(t.brTileN, 'num') + th(t.pfSalt, 'num') + th(t.price, 'num') + '<td></td></tr></thead><tbody>' +
    state.pod.decks.map(d => tableRow(d, t)).join('') +
    (med ? ref(t.pfRef_precon, med.precon) + ref(t.pfRef_cedh, med.cedh) : '') + '</tbody></table></div>' +
    (med ? '<p class="note-sm">' + esc(t.pdRefNote) + '</p>' : '');
}

// ---- the Mazos view: who is in and who is out, grouped by member; a tap opens the deck ----
const chip = (id, act, value, label, on) => '<button class="chip-dashed gm-chip" id="' + id + '" data-act="' + act + '" data-value="' + value + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
function deckLi(d, t) {
  const f = rows.get(keyOf(d));
  const sub = [d.list.commanders.join(' / '), f && f.banned ? t.podBanned : null].filter(Boolean).join(' · ');
  const pill = f ? '<span class="tier-pill ' + tierTone(f.tier) + '">' + esc(t['short_' + f.tier]) + '</span>' : '<span class="lbl-muted" aria-hidden="true">…</span>';
  const canOut = !d.mine && state.pod.role === 'admin'; // my own decks leave through the tick list above
  const out = !canOut ? ''
    : asking === 'd' + d.id ? ''
    : '<button class="btn-ghost-sm" id="pd-out-' + d.id + '" data-act="deck-out" data-deck="' + d.id + '" aria-label="' + esc(t.pdRemoveDeck + ', ' + d.name) + '">' + esc(t.pdRemoveDeck) + '</button>';
  const ask = asking === 'd' + d.id
    ? '<div class="dk-actions"><span class="dk-confirm">' + esc(fill(t.pdRemoveDeckAsk, { n: d.name })) + '</span><button class="btn-ghost-sm btn-danger" id="pd-outyes-' + d.id + '" data-act="deck-out-yes" data-deck="' + d.id + '">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" id="pd-outno-' + d.id + '" data-act="cancel" data-back="pd-out-' + d.id + '">' + esc(t.pdCancel) + '</button></div>'
    : '';
  return '<li><div class="dk-row"><button class="gm-row" id="pd-open-' + d.id + '" data-act="analyze" data-deck="' + d.id + '">' + coverThumb(d.name, d.list ? d.list.commanders : []) + '<span class="gm-main"><span class="gm-name">' + esc(d.name) + '</span>' +
    (sub ? '<span class="gm-sub">' + esc(sub) + '</span>' : '') + '</span>' + pill + '</button>' + out + '</div>' + ask + '</li>';
}
function rowsHtml(t) {
  const decks = state.pod.decks;
  const read = decks.map(d => rows.get(keyOf(d))).filter(Boolean), out = read.filter(isOut).length;
  const sum = progress ? fill(t.pdCalc, progress)
    : read.length ? fill(t.pdIn, { n: read.length - out }) + ' · ' + fill(t.pdOut, { n: out }) : '';
  const keep = (d) => {
    const f = rows.get(keyOf(d));
    return has(q, d.name, d.owner, ...d.list.commanders) &&
      (filter === 'all' || (filter === 'mine' ? d.mine : !!f && isOut(f) === (filter === 'out')));
  };
  const owners = [...new Set(decks.map(d => d.owner))].sort((a, b) => a.localeCompare(b));
  const mine = decks.find(d => d.mine);
  if (mine) { owners.splice(owners.indexOf(mine.owner), 1); owners.unshift(mine.owner); } // my decks first
  const groups = owners.map(o => {
    const all = decks.filter(d => d.owner === o), shown = all.filter(keep);
    if (!shown.length) return '';
    const title = all[0].mine ? t.pdMine : fill(t.pdOf, { n: o });
    return '<li class="gm-group">' + esc(title) + ' <span class="lbl-muted">' + shown.length + (shown.length < all.length ? ' / ' + all.length : '') + '</span></li>' + shown.map(d => deckLi(d, t)).join('');
  }).join('');
  return (sum ? '<p class="note-sm" role="status">' + esc(sum) + '</p>' : '') +
    (failed ? '<p class="note-bad" role="alert">' + esc(t.pdReadErr) + '</p><div class="dk-actions"><button class="btn-ghost-sm" id="pd-retry" data-act="retry">' + esc(t.pdRetry) + '</button></div>' : '') +
    '<ul class="gm-list">' + (groups || '<li class="note-sm">' + esc(decks.length ? t.gmNoMatch : t.pdEmpty) + '</li>') + '</ul>';
}
// Ticking one of my saved decks puts it in this pod; unticking takes it out.
function mineHtml(t) {
  if (!adding) return '<div class="dk-actions"><button class="btn-primary" id="pd-mine" data-act="add-open">' + esc(t.pdMyDecks) + '</button></div>';
  const inPod = new Set(state.pod.decks.map(d => d.id));
  const picks = adding.decks.map(d => '<label class="dk-pick" data-text="' + esc(d.name + ' ' + d.commanders.join(' ')) + '"><input type="checkbox" id="pd-tick-' + d.id + '" data-act="tick" data-deck="' + d.id + '"' + (inPod.has(d.id) ? ' checked' : '') + '>' +
    '<span>' + esc(d.name) + (d.commanders.length ? ' <span class="lbl-muted">' + esc(d.commanders.join(' / ')) + '</span>' : '') + '</span></label>').join('');
  return '<section class="pod-mine"><h3 class="pod-sub">' + esc(t.pdMyDecks) + '</h3>' +
    (adding.decks.length > 8 ? '<div class="dk-form"><input type="search" id="pdMineQ" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t.sdFind) + '" aria-label="' + esc(t.sdFind) + '"></div>' : '') +
    (picks ? '<div class="pod-picks" id="pdPicks">' + picks + '</div>' : '<p class="note-sm">' + esc(t.pdAddNone) + '</p>') +
    '<div class="dk-actions"><button class="btn-ghost-sm" id="pd-mine-done" data-act="add-close">' + esc(t.pdDone) + '</button></div></section>';
}
function decksView(t) {
  const n = state.pod.decks.length;
  const filters = n > 1 ? '<div class="dk-actions" role="group" aria-label="' + esc(t.pdFilter) + '">' +
    [['all', t.sdAll], ['in', t.pdFIn], ['out', t.pdFOut], ['mine', t.pdFMine]].map(([k, l]) => chip('pd-f-' + k, 'filter', k, l, filter === k)).join('') + '</div>' : '';
  return mineHtml(t) +
    (n > 8 ? '<div class="dk-form"><input type="search" id="pdQ" value="' + esc(q) + '" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t.pdFind) + '" aria-label="' + esc(t.pdFind) + '"></div>' : '') +
    filters + '<div id="pdRows">' + rowsHtml(t) + '</div>' +
    (n ? '<details class="pod-create" id="pdTable"' + (tableOpen ? ' open' : '') + '><summary>' + esc(t.pdTable) + '</summary><div id="pdTableBody">' + deckTable(t) + '</div></details>' : '');
}

function friendsHtml(t) {
  const inPod = new Set(state.pod.members.map(m => m.id));
  const free = friendList().filter(f => !inPod.has(f.id));
  if (!free.length) return '<p class="note-sm">' + esc(t.pdAddFriendNone) + '</p>';
  return '<form class="dk-form" data-addfriendform><select name="user" class="arch-select" aria-label="' + esc(t.pdAddFriend) + '">' +
    free.map(f => '<option value="' + f.id + '">' + esc(f.name) + '</option>').join('') + '</select>' +
    '<button class="btn-primary">' + esc(t.pdAddFriendGo) + '</button></form>';
}

function membersHtml(t) {
  const admin = state.pod.role === 'admin';
  const ask = (text, yes, id, back) => '<span class="dk-confirm">' + esc(text) + '</span><button class="btn-ghost-sm btn-danger" id="pd-' + yes + '-' + id + '" data-act="' + yes + '" data-user="' + id + '">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" data-act="cancel" data-back="' + back + '">' + esc(t.pdCancel) + '</button>';
  const btn = (act, m, label) => '<button class="btn-ghost-sm" id="pd-' + act + '-' + m.id + '" data-act="' + act + '" data-user="' + m.id + '" aria-label="' + esc(label + ', ' + m.name) + '">' + esc(label) + '</button>';
  const li = state.pod.members.map(m => {
    const n = state.pod.decks.filter(d => d.owner === m.name).length;
    let acts = '';
    if (m.me) acts = asking === 'leave' ? ask(fill(t.pdLeaveAsk, { n: state.pod.name }), 'leave-yes', m.id, 'pd-leave-' + m.id) : btn('leave', m, t.pdLeave);
    else if (admin) acts = asking === 'm' + m.id ? ask(fill(t.pdKickAsk, { n: m.name }), 'kick-yes', m.id, 'pd-kick-' + m.id)
      : btn(m.role === 'admin' ? 'demote' : 'promote', m, m.role === 'admin' ? t.pdDemote : t.pdMakeAdmin) + btn('kick', m, t.pdKick);
    return '<li class="pod-member"><span class="gm-main"><span class="gm-name">' + esc(m.name) + (m.me ? ' <span class="lbl-muted">(' + esc(t.pdYou) + ')</span>' : '') + '</span>' +
      '<span class="gm-sub">' + esc((m.role === 'admin' ? t.pdRoleAdmin : t.pdRoleMember) + ' · ' + count(n, t.pdDeck1, t.pdDeckN)) + '</span></span><span class="dk-actions">' + acts + '</span></li>';
  }).join('');
  const invite = admin ? '<h3 class="pod-sub">' + esc(t.pdAddFriend) + '</h3>' + friendsHtml(t) +
    '<div class="pod-invite"><span class="lbl-muted">' + esc(t.pdInvite) + '</span><input readonly class="pod-link-in" value="' + esc(inviteLink(state.pod.invite_code)) + '" aria-label="' + esc(t.pdInvite) + '">' +
    '<div class="dk-actions"><button class="btn-ghost-sm" id="pd-copy" data-act="copy">' + esc(copied ? t.pdCopied : t.pdCopy) + '</button></div></div>' : '';
  return '<ul class="pod-members pod-people">' + li + '</ul>' + invite;
}

function settingsHtml(t) {
  const p = state.pod;
  const regen = asking === 'regen'
    ? '<span class="dk-confirm">' + esc(t.pdRegenNote) + '</span><button class="btn-ghost-sm btn-danger" id="pd-regen-yes" data-act="regen-yes">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" data-act="cancel" data-back="pd-regen">' + esc(t.pdCancel) + '</button>'
    : '<button class="btn-ghost-sm" id="pd-regen" data-act="regen">' + esc(t.pdRegen) + '</button>';
  return '<form class="dk-form" data-renameform><input name="name" id="pdName" value="' + esc(p.name) + '" maxlength="100" required aria-label="' + esc(t.pdName) + '">' +
    '<button class="btn-ghost-sm" id="pd-rename">' + esc(t.pdSave) + '</button></form>' +
    '<div class="dk-actions"><button class="btn-ghost-sm" id="pd-rules" data-act="rules" aria-expanded="' + editing + '">' + esc(editing ? t.pdCloseRules : t.pdEditRules) + '</button></div>' +
    (editing ? '<div id="podRules" class="pod-rules"></div>' : '') +
    '<h3 class="pod-sub">' + esc(t.pdInvite) + '</h3><div class="dk-actions">' + regen + '</div>';
}

// opening the Pod tab asks for the friends an admin may add
export function podOpened() { if (status === 'error') status = 'idle'; loadFriends(); }

function createHtml(t) {
  return '<section class="panel pod-card"><h3 class="pod-sub">' + esc(t.pdCreate) + '</h3><form class="dk-form" data-createform>' +
    '<input name="name" id="pdNewName" maxlength="100" required placeholder="' + esc(t.pdName) + '" aria-label="' + esc(t.pdName) + '">' +
    '<label class="dk-vis"><span class="lbl-muted">' + esc(t.pdCopyFrom) + '</span><select name="from" class="pod-link-in"><option value="">' + esc(t.pdTemplate) + '</option>' +
    state.pods.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select></label>' +
    '<button class="btn-primary">' + esc(t.pdCreateGo) + '</button></form></section>';
}

// Redraws the tab and puts the keyboard back where it was, or on the control named.
function paint(focus) {
  if (state.tab !== 'pod') return;
  const id = focus || (document.activeElement && document.activeElement.id);
  renderPod();
  const el = id && $(id);
  if (el) el.focus({ preventScroll: true });
}
// While decks are being read only the rows change, so a search being typed is left alone.
function paintRows() {
  if (state.tab !== 'pod') return;
  const host = $('pdRows');
  if (!host) return paint();
  host.innerHTML = rowsHtml(T());
  if (tableOpen) $('pdTableBody').innerHTML = deckTable(T());
}
function ensureDetail() {
  if (!state.activeId || state.pod || loadingDetail || status === 'error') return;
  loadingDetail = true;
  loadDetail(state.activeId).then(p => { state.pod = p; status = p ? 'idle' : 'error'; }).finally(() => { loadingDetail = false; paint(); });
}

export function renderPod() {
  const t = T(), el = $('podPanel');
  loadStudy();
  const head = '<div class="part-head"><div><h2 class="part-title">' + esc(state.pod ? state.pod.name : t.tabPod) + '</h2><p class="part-sub">' + esc(t.pdIntro) + '</p></div></div>';
  const note = (k) => '<p class="note-sm">' + esc(t[k]) + '</p>';
  let body;
  if (!state.pods) body = note('pdSignInNote') + '<a class="btn-primary dk-login" href="account.html">' + esc(t.sdSignIn) + '</a>';
  else {
    ensureDetail();
    // every pod is one tap away; the last chip starts a new one
    const pick = '<div class="dk-actions" role="group" aria-label="' + esc(t.pdPicker) + '">' +
      state.pods.map(p => chip('pd-pod-' + p.id, 'pod', p.id, p.name, p.id === state.activeId && !creating)).join('') +
      chip('pd-new', 'new', '', t.pdNew, creating) + '</div>';
    const flash = msg ? '<p class="note-bad" role="alert">' + esc(t[msg]) + '</p>' : '';
    if (creating || !state.pods.length) body = pick + flash + createHtml(t);
    else if (!state.activeId) body = pick + flash + note('pdNoPod');
    else if (!state.pod) body = pick + flash + (status === 'error'
      ? '<p class="note-bad" role="alert">' + esc(t.pdErr) + '</p><div class="dk-actions"><button class="btn-ghost-sm" id="pd-reload" data-act="reload">' + esc(t.pdRetry) + '</button></div>'
      : note('pdLoading'));
    else {
      const p = state.pod, admin = p.role === 'admin';
      if (view === 'settings' && !admin) view = 'decks';
      const tab = (k, label) => '<button class="tab-btn' + (view === k ? ' active' : '') + '" id="pd-view-' + k + '" data-act="view" data-value="' + k + '" aria-pressed="' + (view === k) + '">' + esc(label) + '</button>';
      const views = '<div class="tabbar pod-views" role="group" aria-label="' + esc(t.pdViews) + '">' + tab('decks', t.pdVDecks + ' ' + p.decks.length) + tab('members', t.pdMembers + ' ' + p.members.length) + (admin ? tab('settings', t.pdVSettings) : '') + '</div>';
      body = pick + flash + views + '<div class="panel pod-card">' + (view === 'members' ? membersHtml(t) : view === 'settings' ? settingsHtml(t) : decksView(t)) + '</div>';
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
  const stale = state.pod && view === 'decks' && !creating && !progress && !failed && state.pod.decks.some(d => !rows.has(keyOf(d)));
  if (stale) compute();
  el.onclick = onClick; el.onsubmit = onSubmit; el.onchange = onChange; el.oninput = onInput;
  bindCovers(el);
  if (state.pod) needCovers(state.pod.decks.filter(d => d.list).map(d => d.list.commanders), () => paint());
  const table = $('pdTable');
  if (table) table.ontoggle = () => { tableOpen = table.open; };
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
  if (![ok].flat().includes(res.status)) {
    msg = errs.user === 'invalid' ? 'pdErrFriend' : errs.decks === 'limit' || errs.pods === 'limit' ? 'pdErrLimit' : errs.role === 'last_admin' ? 'pdErrLastAdmin' : 'pdErr';
    paint(); return null;
  }
  msg = null;
  return res;
}
const here = (path) => 'pods/' + state.pod.id + (path ? '/' + path : '');

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
  if (!b || b.tagName === 'INPUT') return;
  const a = b.dataset.act, entry = state.pod && state.pod.decks.find(d => d.id === Number(b.dataset.deck)), user = Number(b.dataset.user);
  if (a === 'cancel') { asking = null; return paint(b.dataset.back); }
  if (a === 'pod') { creating = false; if (Number(b.dataset.value) !== state.activeId || !state.pod) return selectPod(Number(b.dataset.value)); return paint(); }
  if (a === 'new') { creating = !creating; return paint(creating ? 'pdNewName' : 'pd-new'); }
  if (a === 'view') { view = b.dataset.value; asking = null; return paint(); }
  if (a === 'filter') { filter = b.dataset.value; return paint(); }
  if (a === 'retry') { failed = false; msg = null; return paint(); }
  if (a === 'reload') { status = 'idle'; return paint(); }
  if (a === 'analyze') return openDeck(entry);
  if (a === 'compare') {
    state.tableTexts = [deckToText(state.deck), deckToText(entry.list), '', ''];
    state.tableOpen = true; state.tableResults = null; state.tab = 'load';
    renderAll(); return runTableMode();
  }
  if (a === 'add-open') {
    const res = await api(API + 'decks');
    adding = { decks: res.status === 200 ? res.data.decks : [] };
    if (res.status !== 200) msg = 'pdErr';
    return paint(adding.decks.length > 8 ? 'pdMineQ' : 'pd-mine-done');
  }
  if (a === 'add-close') { adding = null; return paint('pd-mine'); }
  if (a === 'deck-out') { asking = 'd' + entry.id; return paint('pd-outyes-' + entry.id); }
  if (a === 'deck-out-yes') { if (await act('DELETE', here('decks/' + entry.id), undefined, 204)) changed(); return; }
  if (a === 'leave') { asking = 'leave'; return paint('pd-leave-yes-' + user); }
  if (a === 'leave-yes') { if (await act('POST', here('leave'), undefined, 204)) { reset(); await reload(); renderAll(); } return; }
  if (a === 'kick') { asking = 'm' + user; return paint('pd-kick-yes-' + user); }
  if (a === 'kick-yes') { if (await act('DELETE', here('members/' + user), undefined, 204)) changed(); return; }
  if (a === 'promote') { if (await act('POST', here('members/' + user), { role: 'admin' }, 204)) changed('pd-demote-' + user); return; }
  if (a === 'demote') { if (await act('POST', here('members/' + user), { role: 'member' }, 204)) changed('pd-promote-' + user); return; }
  if (a === 'rules') { editing = !editing; editorEl = null; return paint(); }
  if (a === 'regen') { asking = 'regen'; return paint('pd-regen-yes'); }
  if (a === 'regen-yes') { const res = await act('POST', here('invite'), undefined, 200); asking = null; if (res) { state.pod.invite_code = res.data.invite_code; announce(T().pdRegenDone); paint('pd-regen'); } return; }
  if (a === 'copy') {
    try { await navigator.clipboard.writeText(inviteLink(state.pod.invite_code)); } catch (err) { return; }
    copied = true; paint(); announce(T().pdCopied);
    setTimeout(() => { copied = false; paint(); }, 1600);
  }
}

// After a change to this pod: read it again, keep the view and what is unfolded, tell Mis mazos its list is old.
async function changed(focus) {
  asking = null;
  forgetDecks();
  await reload();
  renderAll();
  if (focus && $(focus)) $(focus).focus({ preventScroll: true });
}

async function onSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if ('addfriendform' in f.dataset) { if (await act('POST', here('members'), { user: Number(f.user.value) }, [200, 201])) changed(); }
  else if ('renameform' in f.dataset) { if (await act('POST', here(), { name: f.name.value.trim() }, 200)) { announce(T().sdRenamed); changed('pdName'); } }
  else if ('createform' in f.dataset) {
    const res = await act('POST', 'pods', { name: f.name.value.trim(), from: f.from.value ? Number(f.from.value) : null }, 201);
    if (res) { reset(); await reload(); renderAll(); }
  }
}

async function onChange(e) {
  if (e.target.dataset.act !== 'tick') return;
  const id = Number(e.target.dataset.deck), on = e.target.checked;
  const res = on ? await act('POST', here('decks'), { deck: id }, [200, 201]) : await act('DELETE', here('decks/' + id), undefined, [204, 404]);
  if (res) changed(e.target.id);
}

// Typing filters what is under the field without redrawing the field itself.
function onInput(e) {
  if (e.target.id === 'pdQ') { q = e.target.value; $('pdRows').innerHTML = rowsHtml(T()); }
  if (e.target.id === 'pdMineQ') for (const l of $('pdPicks').children) l.hidden = !has(e.target.value, l.dataset.text);
}
