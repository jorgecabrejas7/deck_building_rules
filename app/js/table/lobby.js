// The game lobby: who is here, your deck, your three boards (main, sideboard, maybeboard) and Ready. The server's lobby view is the truth;
// this module keeps only what is being edited. Moving a card is local, then saved (ready:false) after SAVE_WAIT; Ready sends the boards too.
import { api } from '../api.js';
import { cardCache, persistCache } from '../state.js';
import { fetchCards } from '../engine/scryfall.js';
import { T, fill } from '../i18n.js';
import { PIP } from '../ui/constants.js';
import { esc, ICON } from './board.js';

const API = '../api/';
const BOARDS = ['entries', 'side', 'maybe'];
const TAB = { entries: 'lbTabMain', side: 'lbTabSide', maybe: 'lbTabMaybe' };
const TO = { entries: 'lbToMain', side: 'lbToSide', maybe: 'lbToMaybe' };
const DECK_SIZE = 100, NAME_MAX = 60, SAVE_WAIT = 600, MANY_DECKS = 8, LONG_LIST = 12;

let board = null, gameId = '', say = () => {};
let view = null, prev = null, decks = null, local = null, key = '', timer = 0, busy = false;
let base = null; // the chosen version as saved {key, list, source, source_url}, to tell whether the boards were changed
const ui = { tab: null, dq: '', bq: '', vn: '', naming: false, open: null, err: '' };
const asked = new Set();

export function initLobby(el, id, speak) {
  board = el; gameId = id; say = speak;
  el.addEventListener('click', onClick);
  el.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; ui[k === 'dq' || k === 'vn' ? k : 'bq'] = e.target.value; paint(); });
  el.addEventListener('submit', (e) => { e.preventDefault(); saveVersion(); });
}

export function renderLobby(v) {
  view = v;
  if (ui.tab === null) ui.tab = v.mine.deck ? 'entries' : 'decks';
  sync();
  announce();
  paint();
  if (decks === null) loadDecks();
  loadBase();
}

// take the server's boards unless edits are waiting to be saved
function sync() {
  const m = view.mine, k = JSON.stringify([m.deck, m.entries, m.side, m.maybe]);
  if (!local || (k !== key && !timer && !busy)) { local = structuredClone({ entries: m.entries, side: m.side, maybe: m.maybe }); key = k; }
}

const seats = () => Object.keys(view.players).sort((a, b) => a - b);
const who = (s, t) => view.players[s].name || t.tbOpp;

function announce() {
  const t = T();
  if (prev) for (const s of seats()) {
    const a = prev[s], b = view.players[s];
    if (!a) continue;
    if (b.ready !== a.ready) say(fill(b.ready ? t.lbSayReady : t.lbSayNot, { n: who(s, t) }));
    else if (b.deck && b.deck !== a.deck) say(fill(t.lbSayDeck, { n: who(s, t), d: b.deck }));
  }
  prev = structuredClone(view.players);
}

async function loadDecks() {
  decks = [];
  const r = await api(API + 'decks');
  if (r.status === 200) decks = r.data.decks || []; else { decks = null; ui.err = 'tbDeckErr'; }
  later();
  const need = [...new Set((decks || []).flatMap((d) => d.commanders))].filter((n) => !cardCache[n] && !asked.has(n));
  if (!need.length) return;
  need.forEach((n) => asked.add(n));
  fetchCards(need, cardCache).then(() => { persistCache(); later(); }).catch(() => {});
}
// an async answer repaints only while the lobby is still what the page shows
const later = () => { if (board.querySelector('.lb')) paint(); };

// the chosen version's saved lists, fetched again whenever the deck or the version changes
async function loadBase() {
  const m = view.mine, k = `${m.deck}:${m.version}`;
  if (!m.deck || (base && base.key === k) || (base && base.asking === k)) return;
  base = { asking: k };
  const r = await api(`${API}decks/${m.deck}`);
  const v = r.status === 200 && (r.data.versions.find((x) => x.id === m.version) || r.data.versions[0]);
  base = v ? { key: k, list: v.list, source: v.source, source_url: v.source_url } : null;
  later();
}
const same = (x, y) => JSON.stringify(x.map((e) => [e.name, e.quantity]).sort()) === JSON.stringify(y.map((e) => [e.name, e.quantity]).sort());
const changed = () => {
  const m = view.mine;
  return !!(local && base && base.key === `${m.deck}:${m.version}` && !BOARDS.every((b) => same(local[b], base.list[b])));
};

async function pickDeck(id, version) {
  clearTimeout(timer); timer = 0; local = null; ui.err = ''; ui.naming = false; busy = true;
  const r = await api(`${API}games/${gameId}/deck`, 'POST', version ? { deck: id, version } : { deck: id });
  busy = false;
  if (r.status === 200) { if (!version) ui.tab = 'entries'; ui.open = null; } else ui.err = fail(r, 'lbErrDeck');
  sync(); later();
  return r.status === 200;
}

// the boards as they are become a new version of the chosen deck, and this game points at it
async function saveVersion() {
  const name = ui.vn.trim(), m = view.mine;
  if (!name || !changed() || busy) return;
  if (timer) { clearTimeout(timer); await save(false); }
  busy = true;
  const r = await api(`${API}decks/${m.deck}/versions`, 'POST', { name, source: base.source, ...(base.source_url ? { source_url: base.source_url } : {}),
    list: { entries: local.entries, commanders: m.commanders, side: local.side, maybe: local.maybe } });
  busy = false;
  if (r.status !== 201) { ui.err = r.status === 0 ? 'tbNotSent' : r.data.errors && r.data.errors.versions === 'limit' ? 'lbErrVerLimit' : 'lbErrVer'; return later(); }
  if (decks) decks = decks.map((d) => (d.id === m.deck ? r.data.deck : d));
  ui.naming = false; ui.vn = ''; ui.err = '';
  if (await pickDeck(m.deck, r.data.deck.versions[0].id)) say(fill(T().lbSayVer, { n: name }));
}

async function save(ready) {
  timer = 0; busy = true;
  const r = await api(`${API}games/${gameId}/ready`, 'POST', { ready, entries: local.entries, side: local.side, maybe: local.maybe });
  busy = false;
  if (r.status === 200) ui.err = ''; else { ui.err = fail(r, 'lbErr'); local = null; } // the server's boards win
  sync(); later();
}
const fail = (r, key) => r.status === 0 ? 'tbNotSent' : !r.data.errors ? key : r.data.errors.list === 'invalid' ? 'lbErrList' : r.data.errors.list === 'count' ? 'lbErrCount' : key;

function move(name, from, to) {
  if (!local) return;
  const f = local[from].find((e) => e.name === name);
  if (!f) return;
  if (--f.quantity <= 0) { local[from] = local[from].filter((e) => e !== f); ui.open = null; }
  const g = local[to].find((e) => e.name === name);
  if (g) g.quantity++; else local[to].push({ name, quantity: 1 });
  const n = count(local.entries);
  say(fill(T().lbMoved, { n: name, b: T()[TAB[to]] }) + (n === DECK_SIZE ? '' : '. ' + fill(T().lbNeed100, { n })));
  clearTimeout(timer); timer = setTimeout(() => save(false), SAVE_WAIT);
  paint();
}

function onClick(e) {
  const el = e.target.closest('[data-lb]');
  if (!el) return;
  const a = el.dataset.lb;
  if (a === 'tab') { ui.tab = el.dataset.v; ui.open = null; }
  else if (a === 'deck') return pickDeck(Number(el.dataset.id));
  else if (a === 'ver') return pickDeck(Number(el.dataset.id), Number(el.dataset.v));
  else if (a === 'name') { ui.naming = true; paint(); const f = board.querySelector('[data-k="vn"]'); return f && f.focus(); }
  else if (a === 'unname') ui.naming = false;
  else if (a === 'reset') return pickDeck(view.mine.deck);
  else if (a === 'row') ui.open = ui.open === el.dataset.n ? null : el.dataset.n;
  else if (a === 'mv') return move(el.dataset.n, ui.tab, el.dataset.to);
  else if (a === 'ready') { clearTimeout(timer); return save(!view.players[view.you].ready); }
  paint();
}

// ---- drawing ----
const count = (list) => list.reduce((n, e) => n + e.quantity, 0);
const norm = (s) => s.toLowerCase();

function playersHtml(t) {
  return seats().map((s) => {
    const p = view.players[s], me = s === String(view.you);
    const deck = p.deck ? esc([p.deck, p.version, ...p.commanders].filter(Boolean).join(' · ')) : t.lbChoosing;
    return `<li class="lb-p${p.ready ? ' ready' : ''}"><span class="lb-pn"><b>${esc(who(s, t))}${me ? ` <i>(${t.tbYou})</i>` : ''}</b><small>${deck}</small></span>`
      + `<span class="lb-st">${p.ready ? t.lbReady : t.lbNotReady}${p.deck ? `<small${p.count === DECK_SIZE ? '' : ' class="lb-bad"'}>${fill(t.lbCards, { n: p.count, m: DECK_SIZE })}</small>` : ''}</span></li>`;
  }).join('');
}

function versionsHtml(d, t, version) {
  const chips = d.versions.map((v) => {
    const label = v.name || new Date(v.created_at).toLocaleDateString();
    return `<button class="lb-ver" data-lb="ver" data-id="${d.id}" data-v="${v.id}" data-k="ver:${v.id}" aria-pressed="${v.id === version}">${esc(label)} <small>${fill(t.lbVerCards, { n: v.count })}</small></button>`;
  }).join('');
  return `<div class="lb-vers" role="group" aria-label="${t.lbVersions}">${chips}</div>`;
}

function deckCard(d, chosen, t, version) {
  const src = (cardCache[d.commanders[0]] || {}).img_art;
  const ci = [...new Set(d.commanders.flatMap((n) => (cardCache[n] || {}).color_identity || []))];
  const pips = 'WUBRG'.split('').filter((k) => ci.includes(k)).map((k) => `<span class="ci-pip" style="--pip:${PIP[k]}"></span>`).join('');
  return `<li><button class="lb-deck" data-lb="deck" data-id="${d.id}" data-k="deck:${d.id}" aria-pressed="${chosen}">`
    + `<span class="lb-art">${src ? `<img src="${esc(src)}" alt="" draggable="false">` : ''}</span>`
    + `<span class="lb-dn"><b>${esc(d.name)}</b><small>${esc(d.commanders.join(' / '))}</small><span class="ci-pips" aria-hidden="true">${pips}</span></span></button>${chosen && d.versions.length > 1 ? versionsHtml(d, t, version) : ''}</li>`;
}

function decksHtml(t, chosen, version) {
  if (decks === null) return `<p class="lb-note">${t.tbConnecting}</p>`;
  if (!decks.length) return `<p class="lb-note">${t.tbDeckNone}</p><a class="sb on" href="./">${t.tbBack}</a>`;
  const q = norm(ui.dq), list = decks.filter((d) => !q || norm([d.name, ...d.commanders].join(' ')).includes(q));
  return (decks.length > MANY_DECKS ? `<input class="f-in" type="search" data-k="dq" value="${esc(ui.dq)}" aria-label="${t.lbFindDeck}" placeholder="${t.lbFindDeck}">` : '')
    + `<ul class="lb-decks" data-sc="decks">${list.map((d) => deckCard(d, d.id === chosen, t, version)).join('')}</ul>${list.length ? '' : `<p class="lb-note">${t.lbNoMatch}</p>`}`;
}

function rowHtml(e, b, t, cmd, locked) {
  const inner = `<span class="lb-q">${e.quantity}×</span><span class="lb-nm">${esc(e.name)}</span>${cmd ? `<em class="lb-cmd">${t.lbCmdr}</em>` : ''}`;
  if (cmd || locked) return `<li class="lb-row"><div class="lb-card">${inner}</div></li>`;
  const open = ui.open === e.name;
  const moves = open ? `<div class="lb-mv">${BOARDS.filter((x) => x !== b).map((x) =>
    `<button class="sb" data-lb="mv" data-n="${esc(e.name)}" data-to="${x}" data-k="mv:${esc(e.name)}:${x}" aria-label="${esc(e.name)}: ${t[TO[x]]}">${t[TO[x]]}</button>`).join('')}</div>` : '';
  return `<li class="lb-row${open ? ' open' : ''}"><button class="lb-card" data-lb="row" data-n="${esc(e.name)}" data-k="row:${esc(e.name)}" aria-expanded="${open}">${inner}</button>${moves}</li>`;
}

function boardHtml(t, b, ready) {
  const lst = local || view.mine, mine = view.mine, cmds = new Set(mine.commanders);
  const q = norm(ui.bq), all = lst[b];
  const rows = all.filter((e) => !q || norm(e.name).includes(q)).sort((x, y) => (cmds.has(y.name) - cmds.has(x.name)) || x.name.localeCompare(y.name));
  const empty = !all.length ? `<p class="lb-note">${b === 'entries' ? t.lbEmptyMain : t.lbEmptySide}</p>` : !rows.length ? `<p class="lb-note">${t.lbNoMatch}</p>` : '';
  return (ready ? `<p class="lb-note">${t.lbLocked}</p>` : '')
    + (all.length > LONG_LIST ? `<input class="f-in" type="search" data-k="bq" value="${esc(ui.bq)}" aria-label="${t.lbFindCard}" placeholder="${t.lbFindCard}">` : '')
    + `<ul class="lb-rows" data-sc="rows">${rows.map((e) => rowHtml(e, b, t, cmds.has(e.name), ready)).join('')}</ul>${empty}`
    + (b === 'entries' ? `<button class="sb quiet lb-reset" data-lb="reset" data-k="reset">${t.lbReset}</button>` : '');
}

function saveHtml(t) {
  if (!ui.naming) return `<button class="sb quiet lb-save" data-lb="name" data-k="name">${t.lbSaveVer}</button>`;
  return `<form class="lb-name"><input class="f-in" data-k="vn" value="${esc(ui.vn)}" maxlength="${NAME_MAX}" required aria-label="${t.lbVerName}" placeholder="${t.lbVerPh}" autocomplete="off">`
    + `<button class="sb on" type="submit" data-k="vs">${t.lbVerSave}</button><button class="sb quiet" type="button" data-lb="unname" data-k="vc">${t.tbCancel}</button></form>`;
}

function paint() {
  const t = T(), me = String(view.you), p = view.players[me], mine = view.mine, ready = p.ready, lst = local || mine;
  const tabs = ['decks', ...(mine.deck ? BOARDS : [])];
  const tab = tabs.includes(ui.tab) ? ui.tab : 'decks';
  const n = count(lst.entries), short = mine.deck && n !== DECK_SIZE, canSave = changed() && !ready;
  const bar = tabs.map((x) => `<button class="lb-tab" data-lb="tab" data-v="${x}" data-k="tab:${x}" aria-pressed="${x === tab}">${x === 'decks' ? t.lbTabDecks : `${t[TAB[x]]} <b${x === 'entries' && short ? ' class="lb-bad"' : ''}>${count(lst[x])}</b>`}</button>`).join('');
  const panel = tab === 'decks' ? decksHtml(t, mine.deck, mine.version) : boardHtml(t, tab, ready);
  const waiting = seats().filter((s) => s !== me && !view.players[s].ready).map((s) => who(s, t));
  const note = !mine.deck ? t.lbNeedDeck : waiting.length ? fill(t.lbWaitFor, { n: waiting.join(', ') }) : ready ? t.lbStarting : '';
  const html = `<div class="lb"><header class="lb-head"><button class="chip ico menu-btn" data-top="menu" aria-label="${t.tbMenu}">${ICON.menu}</button><h2>${t.tbLobbyT}</h2></header>`
    + `<ul class="lb-players" aria-label="${t.lbPlayers}" data-sc="players">${playersHtml(t)}</ul>`
    + `<section class="lb-main"><div class="lb-tabs" role="group" aria-label="${t.lbLists}">${bar}</div><div class="lb-panel" data-sc="panel">${panel}</div></section>`
    + `<div class="lb-go"><p class="f-err" role="alert">${ui.err ? t[ui.err] : ''}</p><p class="lb-wait">${esc(note)}</p>`
    + (short ? `<p class="lb-warn" id="lb-short">${fill(t.lbNeed100, { n })}</p>` : '') + (canSave ? saveHtml(t) : '')
    + `<button class="sb ${ready ? 'quiet' : 'on'} lb-ready" data-lb="ready" data-k="ready"${ready || (mine.deck && !short) ? '' : ' disabled'}${short ? ' aria-describedby="lb-short"' : ''}>${ready ? t.tbCancel : t.lbReady}</button></div></div>`;

  // a repaint keeps the focused control, its caret and the scroll positions
  const a = document.activeElement, fk = board.contains(a) && a.dataset.k, at = fk && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  const sc = [...board.querySelectorAll('[data-sc]')].map((el) => [el.dataset.sc, el.scrollTop, el.scrollLeft]);
  board.innerHTML = html;
  for (const [k, top, left] of sc) { const el = board.querySelector(`[data-sc="${k}"]`); if (el) { el.scrollTop = top; el.scrollLeft = left; } }
  if (fk) {
    const f = [...board.querySelectorAll('[data-k]')].find((x) => x.dataset.k === fk) || board.querySelector('button.lb-card') || board.querySelector(`[data-k="tab:${tab}"]`);
    if (f) { f.focus({ preventScroll: true }); if (at && f.dataset.k === fk) f.setSelectionRange(...at); }
  }
}
