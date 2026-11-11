// Table page: one WebSocket per game, a view JSON in, actions out. Nothing is decided here; the server's reducer owns the rules.
import { state, store, cardCache, persistCache } from './state.js';
import { T } from './i18n.js';
import { api } from './api.js';
import { fetchCards } from './engine/scryfall.js';
import { boardHtml, handHtml, lobbyHtml, index, visibleNames, tile, esc, ICON } from './table/board.js';
import { buildSheet } from './table/sheet.js';

const $ = (id) => document.getElementById(id);
const API = '../api/';
const gameId = (new URLSearchParams(location.search).get('game') || '').match(/^\d+$/)?.[0];
const BACKOFF = [500, 1000, 2000, 4000, 8000];

let view = null, lastSeq = -1, sock = null, attempt = 0, timer = null, n = 0;
let gone = gameId ? null : 'tbNoGame'; // message key once the game is unreachable for good
let sheet = null, items = [], handOpen = true, decks = null, lobbyErr = '', toastTimer = null;
const open = () => sock && sock.readyState === WebSocket.OPEN;

// ---- connection ----
function connect() {
  if (gone || sock) return;
  clearTimeout(timer);
  const s = sock = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/pod/api/ws/game/' + gameId);
  s.onopen = () => { attempt = 0; render(); };
  s.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.type === 'state') { if (m.seq < lastSeq) return; lastSeq = m.seq; view = m.view; render(); }
    else if (m.type === 'error') toast({ stale: 'tbStale', rate: 'tbRate', invalid: 'tbInvalid', lobby: 'tbLobbyErr' }[m.code] || 'tbInvalid');
    else if (m.type === 'ended') { gone = 'tbEnded'; render(); }
  };
  s.onclose = (e) => {
    if (sock !== s) return;
    sock = null;
    if (e.code === 4403) gone = 'tbDenied'; else if (e.code === 4000) gone = 'tbEnded';
    if (!gone) timer = setTimeout(connect, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]);
    render();
  };
}
const retryNow = () => { if (!gone && !sock && document.visibilityState !== 'hidden') { attempt = 0; connect(); } };
document.addEventListener('visibilitychange', retryNow);
addEventListener('online', retryNow);

function send(action) {
  if (!open()) return toast('tbNotSent');
  sock.send(JSON.stringify({ n: ++n, action }));
}

function toast(key) {
  $('toast').textContent = T()[key]; $('toast').classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('on'), 3500);
}

// ---- rendering ----
function keepInputs(el, fn) {
  const saved = [...el.querySelectorAll('input[id],select[id]')].map((i) => [i.id, i.value]);
  fn();
  for (const [id, v] of saved) if ($(id)) $(id).value = v;
}

function applyTheme() {
  document.body.classList.toggle('dark', state.theme ? state.theme === 'dark' : state.sysDark);
}

function render() {
  const t = T(), active = view && view.status === 'active' && !gone;
  document.documentElement.lang = state.lang;
  applyTheme();
  document.body.classList.toggle('offline', !open() && !gone);
  const conn = gone ? '' : open() ? `<span class="stat live"><i></i><span>${t.tbLive}</span></span>`
    : `<span class="stat ${sock ? 'wait' : 'off'}"><i></i>${sock ? t.tbConnecting : t.tbOffline}</span>`;
  $('top').innerHTML = `<button class="tbtn ico" data-top="menu" aria-label="${t.tbMenu}" title="${t.tbMenu}">${ICON.menu}</button>` + conn
    + (active ? `<button class="tbtn" data-top="dice" aria-label="${t.tbDice}">${ICON.die}<span class="lbl">${t.tbDice}</span></button><button class="tbtn" data-top="untap">${ICON.untap}${t.tbUntapAll}</button>` : '');
  const roll = active && view.roll;
  $('roll').textContent = roll ? `${view.players[roll.seat].name || '?'}: ` + (roll.sides === 2 ? (roll.result % 2 === 1 ? t.tbHeads : t.tbTails) : `d${roll.sides} → ${roll.result}`) : '';
  const board = $('board');
  if (gone) { board.innerHTML = `<div class="lobby gone"><p>${t[gone]}</p><a class="sb on" href="./">${t.tbBack}</a></div>`; sheet = null; }
  else if (!view) board.textContent = t.tbConnecting;
  else if (view.status === 'lobby') { keepInputs(board, () => { board.innerHTML = lobbyHtml(view, t, decks, lobbyErr); }); if (decks === null) loadDecks(); }
  else board.innerHTML = boardHtml(view, t);
  const hand = $('hand'), row = $('handRow'), sl = row ? row.scrollLeft : 0;
  hand.innerHTML = active ? handHtml(view, t, handOpen) : '';
  if ($('handRow')) $('handRow').scrollLeft = sl;
  renderSheet();
  if (view && view.status === 'active') loadImages();
}

function renderSheet() {
  const el = $('sheet');
  if (sheet && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // do not steal the keyboard
  const built = sheet && buildSheet(sheet, view, ctx());
  if (!built) {
    sheet = null;
    if (!el.hidden) { el.hidden = true; el.innerHTML = ''; if (opener && opener.isConnected) opener.focus(); }
    return;
  }
  items = built.items;
  const entering = el.hidden;
  if (entering) { opener = document.activeElement; hov.hidden = true; }
  keepInputs(el, () => {
    el.innerHTML = `<div class="sh-back" data-close></div><div class="sh-pane" role="dialog" aria-modal="true" aria-labelledby="shTitle" tabindex="-1"><div class="sh-grab" aria-hidden="true"></div><div class="sh-head"><h2 id="shTitle">${built.title}</h2><button class="sb ico" data-close aria-label="${T().tbClose}">${ICON.close}</button></div>${built.body}</div>`;
  });
  el.hidden = false;
  if (entering) { el.classList.add('enter'); setTimeout(() => el.classList.remove('enter'), 400); el.querySelector('.sh-pane').focus({ preventScroll: true }); }
}
let opener = null;

const setSheet = (s) => { sheet = s; renderSheet(); };
const ctx = () => ({
  t: T(), send, setSheet, closeSheet: () => setSheet(null), endGame,
  lang: state.lang, dark: document.body.classList.contains('dark'),
  setLang: (l) => { state.lang = store.lang = l; render(); },
  setTheme: (m) => { state.theme = store.theme = m; render(); },
});

async function endGame() {
  const r = await api(API + 'games/' + gameId, 'DELETE');
  if (r.status === 204 || r.status === 404) location.assign('./'); else toast('tbEndErr');
}

async function loadDecks() {
  decks = [];
  const r = await api(API + 'decks');
  if (r.status === 200) decks = r.data.decks || []; else { decks = null; lobbyErr = 'tbDeckErr'; }
  render();
}

async function pickDeck() {
  const r = await api(API + 'games/' + gameId + '/deck', 'POST', { deck: Number($('deckSel').value) });
  lobbyErr = r.status === 200 ? '' : 'tbPickErr';
  if (r.status === 200 && view && view.status === 'lobby' && r.data.picked) view.picked = r.data.picked;
  render();
}

// card images: one Scryfall batch for the names on the table that are not cached yet
const asked = new Set();
function loadImages() {
  const need = visibleNames(view).filter((x) => !cardCache[x] && !asked.has(x));
  if (!need.length) return;
  need.forEach((x) => asked.add(x));
  fetchCards(need, cardCache).then(() => { persistCache(); render(); }).catch(() => {});
}

function preview(id) {
  const hit = index(view).get(id);
  if (!hit) return;
  $('preview').innerHTML = tile(hit.card, T(), true).replace('data-card', 'data-x');
  $('preview').hidden = false;
  $('preview').focus();
}

// ---- events ----
// a mouse resting on a card shows it large beside the card; touch uses the long press below
const hov = $('hover');
document.addEventListener('pointerover', (e) => {
  const el = e.pointerType === 'mouse' && view && view.zones && e.target.closest('[data-card]');
  const hit = el && index(view).get(el.dataset.card);
  const info = hit && hit.card.name && !hit.card.face_down && cardCache[hit.card.name];
  if (!info || !info.img_normal) { hov.hidden = true; return; }
  if (hov.dataset.id !== el.dataset.card) { hov.dataset.id = el.dataset.card; hov.innerHTML = `<img src="${esc(info.img_normal)}" alt="">`; }
  hov.hidden = false;
  const r = el.getBoundingClientRect(), w = hov.offsetWidth, h = hov.offsetHeight;
  hov.style.left = (r.right + 12 + w < innerWidth ? r.right + 12 : Math.max(8, r.left - 12 - w)) + 'px';
  hov.style.top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8)) + 'px';
});
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) hov.hidden = true; });

let pressTimer = null, swallow = false;
const LONG = 450;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-card],[data-life]');
  if (!el) return;
  pressTimer = setTimeout(() => {
    pressTimer = null; swallow = true;
    if (el.dataset.card) preview(el.dataset.card);
    else { const [s, d] = el.dataset.life.split(':').map(Number); send({ type: 'life', seat: s, delta: 5 * d }); }
  }, LONG);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) document.addEventListener(ev, () => {
  clearTimeout(pressTimer);
  if (swallow) setTimeout(() => { swallow = false; }, 350);
});
document.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-card]')) e.preventDefault(); });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-i],[data-close],[data-zoom],[data-card],[data-pile],[data-life],[data-cmd],[data-token],[data-hand],[data-top],[data-pick],[data-preview-close]');
  if (!el) return;
  if (swallow) { swallow = false; return; }
  hov.hidden = true;
  const d = el.dataset;
  if ('i' in d) items[d.i]();
  else if ('close' in d) setSheet(null);
  else if ('zoom' in d) preview(d.zoom);
  else if ('previewClose' in d) $('preview').hidden = true;
  else if ('card' in d) setSheet({ k: 'card', id: d.card });
  else if ('pile' in d) { const [s, zone] = d.pile.split(':'); setSheet({ k: zone === 'library' ? 'pile' : 'list', seat: Number(s), zone }); }
  else if ('life' in d) { const [s, dl] = d.life.split(':').map(Number); send({ type: 'life', seat: s, delta: dl }); }
  else if ('cmd' in d) { const [s, i] = d.cmd.split(':').map(Number); setSheet({ k: 'cmd', seat: s, i }); }
  else if ('token' in d) setSheet({ k: 'token' });
  else if ('hand' in d) { handOpen = !handOpen; render(); }
  else if ('pick' in d) pickDeck();
  else if (d.top === 'dice') setSheet({ k: 'dice' });
  else if (d.top === 'menu') setSheet({ k: 'menu' });
  else if (d.top === 'mull') send({ type: 'mulligan' });
  else if (d.top === 'untap') send({ type: 'untap_all', seat: view.you });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('preview').hidden = true; setSheet(null); } });

render();
connect();
