// Table page: one WebSocket per game, a view JSON in, actions out. Nothing is decided here; the server's reducer owns the rules.
import { state, store, cardCache, persistCache } from './state.js';
import { T } from './i18n.js';
import { api } from './api.js';
import { fetchCards } from './engine/scryfall.js';
import { boardHtml, handHtml, lobbyHtml, index, visibleNames, tile, art, esc, ICON } from './table/board.js';
import { buildSheet } from './table/sheet.js';

const $ = (id) => document.getElementById(id);
const API = '../api/';
const gameId = (new URLSearchParams(location.search).get('game') || '').match(/^\d+$/)?.[0];
const BACKOFF = [500, 1000, 2000, 4000, 8000];

let view = null, lastSeq = -1, sock = null, attempt = 0, timer = null, n = 0;
let gone = gameId ? null : 'tbNoGame'; // message key once the game is unreachable for good
let sheet = null, items = [], handOpen = true, decks = null, lobbyErr = '', toastTimer = null, opener = null, rollSeen;
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
    else if (m.type === 'error') toast(T()[{ stale: 'tbStale', rate: 'tbRate', invalid: 'tbInvalid', lobby: 'tbLobbyErr' }[m.code] || 'tbInvalid']);
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
  if (!open()) return toast(T().tbNotSent);
  sock.send(JSON.stringify({ n: ++n, action }));
}

function toast(text, info = false) {
  $('toast').textContent = text; $('toast').classList.toggle('info', info); $('toast').classList.add('on');
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
  const conn = gone ? '' : open() ? 'live' : sock ? 'wait' : 'off';
  document.body.classList.toggle('offline', conn === 'wait' || conn === 'off');
  document.body.dataset.conn = conn;
  $('stat').textContent = conn === 'wait' ? t.tbConnecting : conn === 'off' ? t.tbOffline : '';
  const roll = active && view.roll;
  if (roll && rollSeen !== undefined && roll.seq !== rollSeen) toast(`${view.players[roll.seat].name || '?'}: ` + (roll.sides === 2 ? (roll.result % 2 === 1 ? t.tbHeads : t.tbTails) : `d${roll.sides} → ${roll.result}`), true);
  if (view && view.status === 'active') rollSeen = roll ? roll.seq : null;
  const board = $('board');
  if (gone) { board.innerHTML = `<div class="lobby gone"><p>${t[gone]}</p><a class="sb on" href="./">${t.tbBack}</a></div>`; sheet = null; }
  else if (!view) board.textContent = t.tbConnecting;
  else if (view.status === 'lobby') { keepInputs(board, () => { board.innerHTML = `<button class="chip ico menu-btn lobby-menu" data-top="menu" aria-label="${t.tbMenu}">${ICON.menu}</button>` + lobbyHtml(view, t, decks, lobbyErr); }); if (decks === null) loadDecks(); }
  else board.innerHTML = boardHtml(view, t);
  const hand = $('hand'), row = $('handRow'), sl = row ? row.scrollLeft : 0;
  hand.innerHTML = active ? handHtml(view, t, handOpen) : '';
  if (active) hand.dataset.drop = view.you + ':hand'; else delete hand.dataset.drop;
  if ($('handRow')) $('handRow').scrollLeft = sl;
  renderSheet();
  if (view && view.status === 'active') loadImages();
}

function renderSheet() {
  const el = $('sheet');
  if (sheet && el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // do not steal the keyboard
  let built = sheet && buildSheet(sheet, view, ctx());
  while (!built && sheet && sheet.back) { sheet = sheet.back; built = buildSheet(sheet, view, ctx()); } // the card moved: back to where it was picked
  if (!built) {
    sheet = null;
    if (!el.hidden) { el.hidden = true; el.innerHTML = ''; if (opener && opener.isConnected) opener.focus(); }
    return;
  }
  items = built.items;
  const entering = el.hidden;
  if (entering) { opener = document.activeElement; hov.hidden = true; }
  const t = T(), pane = el.querySelector('.sh-pane'), top = pane ? pane.scrollTop : 0;
  const body = built.art ? `<div class="sh-card"><button class="sh-art" data-zoom="${sheet.id}" aria-label="${t.tbZoom}"><img src="${esc(built.art)}" alt=""></button><div class="sh-acts">${built.body}</div></div>` : built.body;
  keepInputs(el, () => {
    el.innerHTML = `<div class="sh-back" data-close></div><div class="sh-pane" role="dialog" aria-modal="true" aria-labelledby="shTitle" tabindex="-1"><div class="sh-grab" aria-hidden="true"></div>`
      + `<div class="sh-head">${sheet.back ? `<button class="sb ico" data-back aria-label="${t.tbBackSheet}">${ICON.up}</button>` : ''}<h2 id="shTitle"${built.art ? ' class="vh"' : ''}>${built.title}</h2><button class="sb ico" data-close aria-label="${t.tbClose}">${ICON.close}</button></div>${body}</div>`;
  });
  el.hidden = false;
  filterSearch();
  if (entering) { el.classList.add('enter'); setTimeout(() => el.classList.remove('enter'), 400); el.querySelector('.sh-pane').focus({ preventScroll: true }); }
  else el.querySelector('.sh-pane').scrollTop = top;
}

function filterSearch() {
  const q = ($('sq') || {}).value;
  if (q === undefined) return;
  for (const c of $('sheet').querySelectorAll('.sgrid .tc')) c.hidden = !c.getAttribute('aria-label').toLowerCase().includes(q.trim().toLowerCase());
}

const setSheet = (s) => { sheet = s; renderSheet(); };
const ctx = () => ({
  t: T(), send, setSheet, closeSheet: () => setSheet(sheet && sheet.back ? sheet.back : null), endGame, fullscreen,
  lang: state.lang, dark: document.body.classList.contains('dark'),
  setLang: (l) => { state.lang = store.lang = l; render(); },
  setTheme: (m) => { state.theme = store.theme = m; render(); },
});

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
}

async function endGame() {
  const r = await api(API + 'games/' + gameId, 'DELETE');
  if (r.status === 204 || r.status === 404) location.assign('./'); else toast(T().tbEndErr);
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

// ---- gestures ----
// A card: tap one of yours on the battlefield to tap or untap it; tap any other card to open it.
// Touch: hold still to pick it up, then drag it onto a zone; let go without moving to open it.
// Mouse: drag it straight away; right-click opens it; resting on it shows it large.
const HOLD = 320, SLOP = 8;
let press = null, swallow = false;
const hov = $('hover');

function cardAt(id) { return view && view.zones && index(view).get(id); }

function lift(p) {
  p.lifted = true;
  p.el.classList.add('lifted');
  if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(12);
}

function startDrag(p, e) {
  p.drag = true; hov.hidden = true;
  const r = p.el.getBoundingClientRect(), src = art(p.hit.card);
  const g = p.ghost = document.createElement('div');
  g.className = 'ghost';
  g.style.width = Math.max(r.width, 72) + 'px';
  g.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '';
  if (!src) g.classList.add('blank');
  document.body.append(g);
  document.body.classList.add('dragging');
  p.el.classList.add('lifted');
  moveDrag(p, e);
}

function dropAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest('[data-drop]');
}

function moveDrag(p, e) {
  p.ghost.style.transform = `translate(${e.clientX - p.ghost.offsetWidth / 2}px,${e.clientY - p.ghost.offsetHeight * 0.6}px) rotate(-3deg)`;
  const tgt = dropAt(e.clientX, e.clientY);
  if (tgt !== p.over) { if (p.over) p.over.classList.remove('drop-on'); p.over = tgt; if (tgt) tgt.classList.add('drop-on'); }
}

function endPress(e) {
  const p = press;
  press = null;
  if (!p) return;
  clearTimeout(p.timer);
  p.el.classList.remove('lifted');
  if (p.drag) {
    p.ghost.remove(); document.body.classList.remove('dragging');
    if (p.over) p.over.classList.remove('drop-on');
    swallow = true;
    if (e && e.type === 'pointerup' && p.over) {
      const [s, zone] = p.over.dataset.drop.split(':'), seat = Number(s);
      const { card } = p.hit, from = p.hit;
      if (!(from.seat === seat && from.zone === zone)) send({ type: 'move', cards: [card.id], to: { seat, zone }, ...(zone === 'library' ? { pos: 'top' } : {}) });
    }
  } else if (p.lifted && e && e.type === 'pointerup') { swallow = true; openCard(p.id); }
  if (swallow) setTimeout(() => { swallow = false; }, 400);
}

function openCard(id) {
  const inSheet = !$('sheet').hidden;
  setSheet({ k: 'card', id, back: inSheet ? sheet : undefined });
}

document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const life = e.target.closest('[data-life]');
  if (life) { // hold a life button to step by 5
    const [s, d] = life.dataset.life.split(':').map(Number);
    const tm = setTimeout(() => { swallow = true; send({ type: 'life', seat: s, delta: 5 * d }); setTimeout(() => { swallow = false; }, 400); }, 450);
    life.addEventListener('pointerup', () => clearTimeout(tm), { once: true });
    life.addEventListener('pointerleave', () => clearTimeout(tm), { once: true });
    return;
  }
  const el = e.target.closest('[data-card]');
  const hit = el && cardAt(el.dataset.card);
  if (!hit) return;
  press = { el, id: el.dataset.card, hit, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
  if (!press.mouse) press.timer = setTimeout(() => lift(press), HOLD);
});

document.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !press) hoverCard(e);
  const p = press;
  if (!p) return;
  if (p.drag) return moveDrag(p, e);
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < SLOP) return;
  if (p.mouse || p.lifted) startDrag(p, e);
  else { clearTimeout(p.timer); press = null; } // a finger that moves before the hold is a scroll
});
document.addEventListener('pointerup', endPress);
document.addEventListener('pointercancel', endPress);
// once a card is picked up, the finger drags it instead of scrolling the page
document.addEventListener('touchmove', (e) => { if (press && (press.lifted || press.drag)) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-card]');
  if (!el) return;
  e.preventDefault();
  if (e.pointerType !== 'touch' && !(press && !press.mouse) && cardAt(el.dataset.card)) openCard(el.dataset.card);
});

// a mouse resting on a card shows it large beside the card
function hoverCard(e) {
  const el = e.target.closest && e.target.closest('[data-card]');
  const hit = el && cardAt(el.dataset.card), src = hit && art(hit.card, true);
  if (!src || document.body.classList.contains('dragging')) { hov.hidden = true; return; }
  if (hov.dataset.id !== el.dataset.card) { hov.dataset.id = el.dataset.card; hov.innerHTML = `<img src="${esc(src)}" alt="">`; }
  hov.hidden = false;
  const r = el.getBoundingClientRect(), w = hov.offsetWidth, h = hov.offsetHeight;
  hov.style.left = (r.right + 12 + w < innerWidth ? r.right + 12 : Math.max(8, r.left - 12 - w)) + 'px';
  hov.style.top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, innerHeight - h - 8)) + 'px';
}
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) hov.hidden = true; });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-i],[data-close],[data-back],[data-zoom],[data-card],[data-pile],[data-life],[data-cmd],[data-token],[data-hand],[data-top],[data-pick],[data-preview-close]');
  if (!el) return;
  if (swallow) { swallow = false; return; }
  hov.hidden = true;
  const d = el.dataset;
  if ('i' in d) items[d.i]();
  else if ('close' in d) setSheet(null);
  else if ('back' in d) setSheet(sheet && sheet.back);
  else if ('zoom' in d) preview(d.zoom);
  else if ('previewClose' in d) $('preview').hidden = true;
  else if ('card' in d) {
    const hit = cardAt(d.card);
    if (!hit) return;
    // your own battlefield card: a tap taps it (a keyboard press opens it instead)
    if (e.detail && $('sheet').hidden && hit.zone === 'battlefield' && hit.seat === view.you) {
      el.classList.toggle('tapped');
      send({ type: 'tap', cards: [hit.card.id], tapped: !hit.card.tapped });
    } else openCard(d.card);
  }
  else if ('pile' in d) { const [s, zone] = d.pile.split(':'); setSheet({ k: zone === 'library' ? 'pile' : 'list', seat: Number(s), zone }); }
  else if ('life' in d) { const [s, dl] = d.life.split(':').map(Number); send({ type: 'life', seat: s, delta: dl }); }
  else if ('cmd' in d) { const [s, i] = d.cmd.split(':').map(Number); setSheet({ k: 'cmd', seat: s, i }); }
  else if ('token' in d) setSheet({ k: 'token' });
  else if ('hand' in d) { handOpen = !handOpen; render(); }
  else if ('pick' in d) pickDeck();
  else if (d.top === 'menu') setSheet({ k: 'menu' });
  else if (d.top === 'full') fullscreen();
  else if (d.top === 'untap') send({ type: 'untap_all', seat: view.you });
});
document.addEventListener('input', (e) => { if (e.target.id === 'sq') filterSearch(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (press) { endPress(null); return; }
  if (!$('preview').hidden) $('preview').hidden = true; else setSheet(null);
});
document.addEventListener('fullscreenchange', () => { if (sheet && sheet.k === 'menu') renderSheet(); });

render();
connect();
