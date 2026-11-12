// Table page: one WebSocket per game, a view JSON in, actions out. Nothing is decided here; the server's reducer owns the rules.
import { state, store, cardCache, persistCache } from './state.js';
import { T } from './i18n.js';
import { api } from './api.js';
import { fetchCards } from './engine/scryfall.js';
import { boardHtml, lobbyHtml, index, visibleNames, tile, art, attachable, esc, ICON, other } from './table/board.js';
import { fill } from './i18n.js';
import { buildSheet } from './table/sheet.js';
import { buildBar } from './table/bar.js';
import { handHtml, layoutHand, cardAtX, raise } from './table/hand.js';
import { firstRun, startHints, placeCoach, explainFs } from './table/coach.js';
import { showZoom, hideZoom } from './table/zoom.js';
import { showTray, hideTray } from './table/tray.js';
import { line } from './table/log.js';
import { patch, snapshot, play } from './table/motion.js';
import { predict } from './table/predict.js';
import { changed, glowOn, applyGlow, lifeMoved } from './table/cues.js';

const $ = (id) => document.getElementById(id);
const API = '../api/';
const gameId = (new URLSearchParams(location.search).get('game') || '').match(/^\d+$/)?.[0];
const BACKOFF = [500, 1000, 2000, 4000, 8000];

// base: the last view the server sent; pending: actions sent and not yet answered; view (what is shown) is pending predicted over base
let view = null, base = null, pending = [], lastSeq = -1, sock = null, attempt = 0, timer = null, n = 0;
let gone = gameId ? null : 'tbNoGame'; // message key once the game is unreachable for good
let sheet = null, items = [], handOpen = true, picking = null, decks = null, lobbyErr = '', toastTimer = null, opener = null, logSeq = null;
// the active board: one at a time on phones, highlighted where both fit. Yours unless you look at theirs
let focus = 0, focusTimer = null;
// card size, per viewer: a multiplier on the fitted card width
const SIZES = { s: 0.8, m: 1, l: 1.25 };
let size = 'm';
try { size = SIZES[localStorage.getItem('pdc_table_size')] ? localStorage.getItem('pdc_table_size') : 'm'; } catch (err) { /* storage blocked: normal size */ }
// keep in sync with the table.css media queries that show both boards
const BOTH = matchMedia('(min-width:900px), (orientation:landscape) and (min-width:640px) and (max-height:560px)');
const SHORT = matchMedia('(orientation:landscape) and (min-width:640px) and (max-height:560px)');
const open = () => sock && sock.readyState === WebSocket.OPEN;

// ---- connection ----
function connect() {
  if (gone || sock) return;
  clearTimeout(timer);
  const s = sock = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/pod/api/ws/game/' + gameId);
  s.onopen = () => { attempt = 0; render(); };
  s.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.type === 'state') {
      if (m.seq < lastSeq) return;
      lastSeq = m.seq;
      const prev = view;
      base = m.view;
      if (m.ack != null) pending = pending.filter((p) => p.n > m.ack);
      replay(); render(); news(prev);
    } else if (m.type === 'error') {
      pending = pending.filter((p) => p.n !== m.ack);
      replay(); render();
      toast(T()[{ stale: 'tbStale', rate: 'tbRate', invalid: 'tbInvalid', lobby: 'tbLobbyErr', undo: 'tbUndoErr' }[m.code] || 'tbInvalid']);
    } else if (m.type === 'ended') { gone = 'tbEnded'; render(); }
  };
  s.onclose = (e) => {
    if (sock !== s) return;
    sock = null; pending = []; disarmPass(); replay(); // the server sends a fresh state on connect
    if (e.code === 4403) gone = 'tbDenied'; else if (e.code === 4000) gone = 'tbEnded';
    if (!gone) timer = setTimeout(connect, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]);
    render();
  };
}
const retryNow = () => { if (!gone && !sock && document.visibilityState !== 'hidden') { attempt = 0; connect(); } };
document.addEventListener('visibilitychange', retryNow);
addEventListener('online', retryNow);

// an action the server has not answered yet stays in pending; a not predictable one (predict returns null) just waits
const replay = () => { view = pending.reduce((v, p) => predict(v, p.action) || v, base); };
function send(action) {
  if (!open()) return toast(T().tbNotSent);
  pending.push({ n: ++n, action });
  sock.send(JSON.stringify({ n, action }));
  const next = view && view.status === 'active' && predict(view, action), prev = view;
  if (!next) return;
  view = next;
  render();
  lifeMoved(prev, view, lifeSay);
}

// Pass turn draws a card, which cannot be undone: the button arms for PASS_WAIT and a second tap, Escape or a closing socket cancels
const PASS_WAIT = 1500;
let passAt = 0, passTimer = null;
function disarmPass() { clearTimeout(passTimer); const was = passAt; passAt = 0; return !!was; }
function tapPass() {
  if (disarmPass()) return render();
  passAt = performance.now();
  passTimer = setTimeout(() => { disarmPass(); send({ type: 'pass_turn', draw: true }); render(); }, PASS_WAIT);
  say(T().tbPassArmed);
  render();
}

// the page's one live region: errors, rolls, turns and settled life totals are spoken through it, nothing else
const say = (text) => { $('live').textContent = text; };

// a pill above the hand and your rail. Errors are red; info is neutral.
// html: dictionary text, or a log line (names already escaped)
function toast(html, info = false) {
  const el = $('toast');
  el.innerHTML = `<span>${html}</span>`;
  el.classList.toggle('info', info);
  // above whatever is docked at the bottom: the hand, the docked bar, your rail on phones
  const top = Math.min(innerHeight, ...[...document.querySelectorAll('#hand,#bar.dock,.seat.me>.strip,.seat.me>.peek')]
    .map((x) => x.getBoundingClientRect()).filter((r) => r.height && r.top > innerHeight / 2).map((r) => r.top));
  el.style.bottom = Math.round(innerHeight - top + 10) + 'px';
  el.classList.add('on');
  say(el.firstChild.textContent);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 3500);
}

// what the log says happened since the last state: your own undo is spoken, a roll shows its result,
// the opponent's move glows, a turn passed to you is announced once, and life changes float from their number
const lifeSay = (s, d) => say(fill(T().tbLifeSay, { n: view.players[s].name || '?', d, l: view.players[s].life }));
function news(prev) {
  if (!view || view.status !== 'active' || !view.log) return;
  const fresh = logSeq === null ? [] : view.log.filter((e) => e.seq > logSeq), t = T(), last = fresh[fresh.length - 1];
  logSeq = view.log.length ? view.log[view.log.length - 1].seq : logSeq === null ? 0 : logSeq;
  if (!prev || !prev.zones || !fresh.length) return;
  lifeMoved(prev, view, lifeSay);
  if (fresh.every((e) => e.seat !== view.you)) glowOn(changed(prev, view));
  const roll = fresh.filter((e) => e.type === 'roll').pop();
  if (view.turn.seat === view.you && prev.turn.seat !== view.you && fresh.some((e) => e.type === 'pass_turn')) {
    if ((focus || view.you) !== view.you && $('sheet').hidden && !press && !picking && !sel.size) setFocus(view.you);
    toast(fill(t.tbYourTurn, { n: view.turn.number }), true);
    glowOn([`.seat[data-seat="${view.you}"]>.strip`, `.seat[data-seat="${view.you}"]>.peek`]);
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([18, 80, 18]);
  } else if (roll) toast(line(roll, view, t), true);
  else if (last.type === 'undo' && last.seat === view.you) say(new DOMParser().parseFromString(line(last, view, t), 'text/html').body.textContent);
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

let shown = null; // the view the last render drew: what motion animates from
function render() {
  const before = snapshot(); // before any DOM change
  const t = T(), active = view && view.status === 'active' && !gone;
  document.documentElement.lang = state.lang;
  applyTheme();
  const conn = gone ? '' : open() ? 'live' : sock ? 'wait' : 'off';
  document.body.classList.toggle('offline', conn === 'wait' || conn === 'off');
  document.body.dataset.conn = conn;
  $('stat').textContent = conn === 'wait' ? t.tbConnecting : conn === 'off' ? t.tbOffline : '';
  const board = $('board');
  if (gone) { board.innerHTML = `<div class="lobby gone"><p>${t[gone]}</p><a class="sb on" href="./">${t.tbBack}</a></div>`; sheet = null; }
  else if (!view) board.textContent = t.tbConnecting;
  else if (view.status === 'lobby') { keepInputs(board, () => { board.innerHTML = `<button class="chip ico menu-btn lobby-menu" data-top="menu" aria-label="${t.tbMenu}">${ICON.menu}</button>` + lobbyHtml(view, t, decks, lobbyErr); }); if (decks === null) loadDecks(); }
  else patch(board, boardHtml(view, t));
  const hand = $('hand'), hf = hand.contains(document.activeElement) && document.activeElement.dataset.top; // the head is re-templated: keep focus on its button
  if (!(active && view.turn && view.turn.seat === view.you)) disarmPass();
  if (active) patch(hand, handHtml(view, t, handOpen || SHORT.matches, passAt && performance.now() - passAt)); else hand.innerHTML = '';
  if (hf) { const f = hand.querySelector(`[data-top="${hf}"]`); if (f) f.focus({ preventScroll: true }); }
  if (active) hand.dataset.drop = view.you + ':hand'; else delete hand.dataset.drop;
  layoutHand(handRow());
  if (active) applyFocus(false);
  const pc = picking && active && cardAt(picking);
  if (!pc) picking = null;
  document.body.classList.toggle('picking', !!pc);
  $('pick').hidden = !pc;
  if (pc) $('pick').innerHTML = `<span>${fill(t.tbAttachPick, { n: pc.card.name ? esc(pc.card.name) : t.tbHiddenCard })}</span><button class="sb" data-unpick>${t.tbCancel}</button>`;
  renderSheet();
  applySel();
  if (view && view.status === 'active') loadImages();
  if (active) firstRun(T, fullscreen);
  applyGlow();
  placeCoach();
  play(before, shown, active ? view : null);
  shown = active ? view : null;
}
const handRow = () => $('hand').querySelector('.hand-row');
new ResizeObserver(() => layoutHand(handRow())).observe($('hand'));

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
  if (entering) { opener = document.activeElement; hideZoom(); }
  const t = T(), pane = el.querySelector('.sh-pane'), top = pane ? pane.scrollTop : 0;
  const had = !entering && el.contains(document.activeElement), fi = had && document.activeElement.dataset.i; // a kept sheet keeps the focused button
  const body = built.art ? `<div class="sh-card"><button class="sh-art" data-zoom="${sheet.id}" aria-label="${t.tbZoom}"><img src="${esc(built.art)}" alt=""></button><div class="sh-acts">${built.body}</div></div>` : built.body;
  keepInputs(el, () => {
    el.innerHTML = `<div class="sh-back" data-close></div><div class="sh-pane" role="dialog" aria-modal="true" aria-labelledby="shTitle" tabindex="-1"><div class="sh-grab" aria-hidden="true"></div>`
      + `<div class="sh-head">${sheet.back ? `<button class="sb ico" data-back aria-label="${t.tbBackSheet}">${ICON.up}</button>` : ''}<h2 id="shTitle"${built.art ? ' class="vh"' : ''}>${built.title}</h2><button class="sb ico" data-close aria-label="${t.tbClose}">${ICON.close}</button></div>${body}</div>`;
  });
  el.hidden = false;
  filterSearch();
  if (entering) { el.classList.add('enter'); setTimeout(() => el.classList.remove('enter'), 400); el.querySelector('.sh-pane').focus({ preventScroll: true }); }
  else {
    el.querySelector('.sh-pane').scrollTop = top;
    const f = fi && el.querySelector(`[data-i="${fi}"]:not(:disabled)`);
    if (f) f.focus({ preventScroll: true }); else if (had) el.querySelector('.sh-pane').focus({ preventScroll: true });
  }
}

function filterSearch() {
  const q = ($('sq') || {}).value;
  if (q === undefined) return;
  for (const c of $('sheet').querySelectorAll('.sgrid .tc')) c.hidden = !c.getAttribute('aria-label').toLowerCase().includes(q.trim().toLowerCase());
}

const setSheet = (s) => { sheet = s; renderSheet(); };
const ctx = () => ({
  t: T(), send, setSheet, pickHost: (id) => { picking = id; render(); }, closeSheet: () => setSheet(sheet && sheet.back ? sheet.back : null), endGame, fullscreen,
  hints: () => { setSheet(null); startHints(); },
  lang: state.lang, dark: document.body.classList.contains('dark'),
  setLang: (l) => { state.lang = store.lang = l; render(); },
  setTheme: (m) => { state.theme = store.theme = m; render(); },
  size, setSize: (k) => { size = k; try { localStorage.setItem('pdc_table_size', k); } catch (err) { /* kept for this visit only */ } render(); },
});

// ---- the active board ----
const RETURN = 10000;
function setFocus(s) {
  if (!view || !view.zones) return;
  clearTimeout(focusTimer);
  const was = focus || view.you;
  focus = s;
  if (s !== view.you) focusTimer = setTimeout(comeBack, RETURN);
  applyFocus(s !== was);
}
// yours comes back after a while without touching theirs, but never from under a sheet, a held card or a host pick
function comeBack() {
  if (!$('sheet').hidden || press || picking || sel.size) focusTimer = setTimeout(comeBack, RETURN);
  else setFocus(view.you);
}
// classes only, no re-render: a press that started on a card keeps its element
function applyFocus(swap) {
  if (!view || !view.zones) return;
  const f = focus || view.you, away = f !== view.you;
  for (const el of document.querySelectorAll('.seat')) {
    const on = Number(el.dataset.seat) === f;
    el.classList.toggle('on', on);
    el.classList.toggle('swap', on && swap);
  }
  const tuck = away && !BOTH.matches; // on phones the hand tucks away while theirs is open
  document.body.classList.toggle('away', tuck);
  const hb = document.querySelector('.hand-bar');
  if (hb) hb.setAttribute('aria-expanded', String(handOpen && !tuck));
  fit();
}

// ---- card size: the largest width at which every card of a battlefield fits without scrolling ----
// Where both boards show (desktop, phone landscape) they share one size and split the height by what each holds, so a crowded
// side never squeezes the other. Past the smallest size a battlefield scrolls inside itself.
// shortcut: the gaps are table.css constants (card gap 6, section gap 8 + 8 padding + 1 rule; short landscape: 4 + 3 + 1, groups 16 apart); change both together
const GAP = 6, SEC = 17, SEC_SHORT = 8, GROUP = 16;
const OPP = 0.88; // short landscape: their cards a little smaller, so yours (which you tap) can be bigger
function heightAt(cw, rows, W, sec = SEC) {
  const ch = cw * 1.4;
  let h = 0;
  for (const row of rows) {
    let x = 0, line = 0;
    for (const it of row) {
      const w = it.tapped ? ch : cw, ih = ch + it.n * cw * 0.28;
      if (x && x + GAP + w > W) { h += line + GAP; x = 0; line = 0; }
      x += (x ? GAP : 0) + w; line = Math.max(line, ih);
    }
    h += line;
  }
  return h + Math.max(0, rows.length - 1) * sec;
}
// short landscape: creatures in front; lands and other behind them on one line when both groups fit, else one under the other
function stackedAt(cw, { front, back }, W) {
  const line = (r) => r.reduce((x, it) => x + (x ? GAP : 0) + (it.tapped ? cw * 1.4 : cw), 0);
  const one = back.length < 2 || line(back[0]) + GROUP + line(back[1]) <= W;
  return heightAt(cw, [...front, ...(one ? [back.flat()] : back)], W, SEC_SHORT);
}
function fit() {
  const m = SIZES[size];
  document.body.style.setProperty('--size', m);
  const [lo, hi] = (SHORT.matches ? [32, 84] : BOTH.matches ? [36, 128] : [44, 96]).map((x) => Math.round(x * m));
  const shared = BOTH.matches;
  if (!shared) for (const s of document.querySelectorAll('.seat')) s.style.flex = s.style.minHeight = '';
  const boards = [...document.querySelectorAll('.seat .bf')].filter((bf) => bf.offsetParent).map((bf) => {
    const cs = getComputedStyle(bf), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), area = bf.parentElement, seat = area.parentElement, H = bf.clientHeight - padY;
    // fixed: the seat's height besides its battlefield's cards (rails, paddings), summed from its parts; a short landscape rail stands beside the area
    const rails = SHORT.matches ? 0 : [...seat.children].reduce((x, c) => x + (c === area ? 0 : c.offsetHeight), 0);
    const groups = [...bf.querySelectorAll('.bfr')].map((r) => ({ front: r.classList.contains('creatures'), items: [...r.children].map((it) => ({
      tapped: (it.matches('.stk') ? it.lastElementChild : it).classList.contains('tapped'), n: it.matches('.stk') ? it.childElementCount - 1 : 0 })) }));
    return { bf, seat, H, W: bf.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), fixed: rails + area.offsetHeight - H,
      min: parseFloat(getComputedStyle(area).minHeight) - padY || 0, rows: groups.map((g) => g.items),
      stack: { front: groups.filter((g) => g.front).map((g) => g.items), back: groups.filter((g) => !g.front).map((g) => g.items) },
      scale: SHORT.matches && seat.classList.contains('opp') ? OPP : 1 };
  });
  const tall = (b, cw) => SHORT.matches ? stackedAt(cw, b.stack, b.W) : heightAt(cw, b.rows, b.W);
  if (shared && boards.length === 2) {
    const free = boards[0].seat.parentElement.clientHeight - boards[0].fixed - boards[1].fixed;
    const need = (cw) => boards.map((b) => { const c = Math.round(cw * b.scale); return Math.max(tall(b, c), b.min, c * 1.4); });
    let cw = hi;
    while (cw > lo && need(cw).reduce((x, y) => x + y) > free) cw--;
    // each seat keeps its rails and takes the free height in proportion to what its battlefield needs, never less than
    // its piles need: on a screen too short for both, the board scrolls instead of one side covering the other
    need(cw).forEach((n, i) => {
      const b = boards[i];
      b.seat.style.flex = `${n} 1 ${b.fixed}px`; b.seat.style.minHeight = b.fixed + b.min + 'px'; b.bf.style.setProperty('--cw', Math.round(cw * b.scale) + 'px');
    });
  } else {
    for (const b of boards) {
      let cw = hi;
      while (cw > lo && tall(b, cw) > b.H) cw--;
      b.bf.style.setProperty('--cw', cw + 'px');
    }
  }
  // a battlefield scrolls under a vertical pan only while it overflows; otherwise the browser must not take a slide for a scroll (table.css .bf)
  for (const bf of document.querySelectorAll('.seat .bf')) bf.classList.toggle('over', bf.scrollHeight > bf.clientHeight + 1);
  placeBar();
  placeCoach();
}
new ResizeObserver(() => fit()).observe($('board'));
BOTH.addEventListener('change', () => applyFocus(false));
SHORT.addEventListener('change', render); // the hand's toggle exists only outside it

function fullscreen() {
  if (!document.fullscreenEnabled) explainFs();
  else if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
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

let previewFrom = null;
function preview(id) {
  const hit = index(view).get(id);
  if (!hit) return;
  previewFrom = document.activeElement;
  $('preview').innerHTML = tile(hit.card, T(), true).replace('data-card', 'data-x');
  $('preview').hidden = false;
  $('preview').focus();
}
function closePreview() {
  $('preview').hidden = true;
  if (previewFrom && previewFrom.isConnected) previewFrom.focus();
}

// ---- selection and the action bar ----
// sel: the selected cards, as lead card id -> every id it stands for (a stack is selected whole).
// One card selected by a tap: the bar floats beside it. selMode (entered by holding a card still): taps add and remove
// cards, the bar docks above the hand with the count, and its actions take every selected card.
let sel = new Map(), selMode = false, barItems = [], barKey = '', said = '';
const BOARD_CARD = '#board [data-card],#hand [data-card]';
const CONTROL = '[data-b],[data-focus],[data-unpick],[data-i],[data-close],[data-back],[data-zoom],[data-card],[data-pile],[data-life],[data-cmd],[data-token],[data-hand],[data-top],[data-pick],[data-pad],[data-preview-close]';
const idsOf = (el) => el.dataset.ids ? el.dataset.ids.split(' ') : [el.dataset.card];
const selIds = () => [...new Set([...sel.values()].flat())];
const elFor = (id) => document.querySelector(`#board [data-card="${id}"],#hand [data-card="${id}"]`) || document.querySelector(`#board [data-ids~="${id}"]`);

function select(el, multi) {
  const ids = idsOf(el);
  if (!multi) { sel = new Map([[el.dataset.card, ids]]); selMode = false; }
  else { // a single card's selection carries over into selection mode
    const all = new Set(selIds());
    if (selMode && ids.some((id) => all.has(id))) { for (const [k, v] of sel) if (v.some((id) => ids.includes(id))) sel.delete(k); }
    else sel.set(el.dataset.card, ids);
    selMode = true;
  }
  hideZoom();
  applySel();
}

function clearSel() {
  if (!sel.size) return;
  const back = $('bar').contains(document.activeElement) && [...sel.values()][0][0];
  sel = new Map(); selMode = false;
  applySel();
  const el = back && elFor(back);
  if (el) el.focus({ preventScroll: true });
}

// classes only: marks the selected cards after every render, drops the ones that left the table
function applySel() {
  const idx = view && view.zones ? index(view) : new Map();
  for (const [k, v] of sel) { const live = v.filter((id) => idx.has(id)); if (live.length) sel.set(k, live); else sel.delete(k); }
  if (!sel.size) selMode = false;
  const all = new Set(selIds()), t = T();
  document.body.classList.toggle('selecting', selMode);
  for (const el of document.querySelectorAll(BOARD_CARD)) {
    const on = idsOf(el).some((id) => all.has(id));
    el.classList.toggle('sel', on);
    if (selMode) el.setAttribute('aria-pressed', String(on)); else el.removeAttribute('aria-pressed');
  }
  const say = selMode ? (all.size === 1 ? t.tbSel1 : fill(t.tbSelN, { n: all.size })) : '';
  if (say !== said) $('live').textContent = said = say;
  renderBar();
}

function renderBar() {
  const bar = $('bar'), units = [...sel.values()], lead = units.length === 1 ? units[0][0] : null;
  const built = units.length && view && view.zones && buildBar(selIds(), view, {
    t: T(), send, multi: selMode, lead, done: clearSel, preview, openSheet: openCard, pickHost: (id) => { picking = id; render(); } });
  if (!built) { bar.hidden = true; bar.innerHTML = ''; barItems = []; barKey = ''; return; }
  const f = bar.contains(document.activeElement) ? document.activeElement.dataset.b : null;
  barItems = built.items;
  bar.innerHTML = built.html;
  bar.hidden = false;
  bar.classList.toggle('dock', selMode);
  const bas = bar.querySelector('.bas'); // two rows when one does not fit the screen
  if (bas.scrollWidth > bas.clientWidth + 1) bas.style.setProperty('--cols', Math.ceil(bas.childElementCount / 2));
  const hit = lead && cardAt(lead);
  bar.setAttribute('aria-label', hit ? (hit.card.name || T().tbHiddenCard) : said);
  // a new card or a change of mode plays the entrance again
  const key = selMode + ':' + (selMode || lead);
  if (key !== barKey) { barKey = key; bar.classList.remove('enter'); void bar.offsetWidth; bar.classList.add('enter'); }
  if (f !== null) (bar.querySelector(`[data-b="${f}"]:not(:disabled)`) || bar.querySelector('button')).focus();
  placeBar();
}

// beside its card: above it when there is room, else below, always on screen. Docked, it is in the page flow
function placeBar() {
  const bar = $('bar');
  if (bar.hidden || selMode) { bar.style.left = bar.style.top = ''; return; }
  const a = elFor([...sel.values()][0][0]), r = a && a.getBoundingClientRect();
  if (!r || !r.width) { clearSel(); return; } // its board was turned away
  const w = bar.offsetWidth, h = bar.offsetHeight, m = 8, gap = 10;
  const edge = a.closest('#hand') ? $('hand').getBoundingClientRect().top : r.top; // over a hand card, above the whole hand: its head keeps Undo and Pass reachable
  const above = edge - gap - h >= m, top = above ? edge - gap - h : Math.min(r.bottom + gap, innerHeight - m - h);
  bar.style.left = Math.round(Math.min(Math.max(m, r.left + r.width / 2 - w / 2), innerWidth - m - w)) + 'px';
  bar.style.top = Math.round(Math.max(m, top)) + 'px';
  bar.dataset.side = above ? 'above' : 'below';
}
addEventListener('scroll', () => { placeBar(); placeCoach(); }, true);
addEventListener('resize', () => { placeBar(); placeCoach(); });

// ---- gestures ----
// A card on the table or in the hand:
//   tap: one of yours on the battlefield taps or untaps; any other card is selected and its bar opens. Double tap: full view
//   hold still: selection mode (taps then add or remove cards). Hold and move: drag it, with the rest of the selection
// Touch (a finger or a pen) on a battlefield card: move past the slop and the drag starts at once, no hold needed.
// Touch on anything else of the board (empty battlefield, the gaps, a seat's background): slide to see cards large. Once the
// finger has been down ZOOM_WAIT ms, the card under it is shown large, sliding onto another card switches to it, sliding off all
// of them hides it, and lifting ends it with nothing else done (no tap, no selection). A quick sideways swipe never reaches that
// and turns to the other board (phones); once a card was shown, lifting does not switch boards. When the browser takes the
// gesture to scroll an overflowing battlefield (pointercancel), the zoom closes.
// The hand (touch): the card under the finger rises and is shown large at once. Slide along the fan to move both; let go after
// sliding to select that card, as a tap would. Moving up out of the hand closes the zoom and drags the card at once: drop it on
// your battlefield to play it, or flick it up to play it from the hand. Holding still on a card still enters selection mode.
// Dragging (touch or mouse) shows the quick zones (tray.js) for the card's owner; they are drop targets like any [data-drop].
// A pile: tap opens it; hold and move drags its top card. Mouse: click is a tap, drag straight away, right-click
// selects, shift/ctrl/cmd-click adds to a selection, resting on a card shows it large. Keyboard: Enter opens the bar.
const HOLD = 320, SLOP = 8, DOUBLE = 350, ZOOM_WAIT = 150;
let press = null, swallow = false, lastTap = null, zb = null; // zb: a finger sliding over the board to see cards large

function cardAt(id) { return view && view.zones && index(view).get(id); }
const tick = (ms) => { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(ms); };

function lift(p) {
  p.lifted = true;
  p.el.classList.add('lifted');
  tick(12);
}

function startDrag(p, e) {
  p.drag = true; hideZoom();
  if (!p.mouse) tick(8);
  // a selected card takes the whole selection along; any other card goes alone and ends a single card's bar
  p.ids = !p.pile && idsOf(p.el).some((id) => selIds().includes(id)) ? selIds() : [p.id];
  if (p.ids.length === 1 && !selMode) clearSel();
  const r = p.el.getBoundingClientRect(), src = art(p.hit.card);
  const g = p.ghost = document.createElement('div');
  g.className = 'ghost' + (p.ids.length > 1 ? ' many' : '');
  g.style.width = Math.max(r.width, 72) + 'px';
  g.innerHTML = (src ? `<img src="${esc(src)}" alt="">` : '') + (p.ids.length > 1 ? `<b class="nx">×${p.ids.length}</b>` : '');
  if (!src) g.classList.add('blank');
  document.body.append(g);
  document.body.classList.add('dragging');
  p.el.classList.add('lifted');
  // shortcut: the tray serves the owner of the card under the finger, not of every card in a multi-selection; split it if mixed drags matter
  showTray(p.hit.card.owner, p.hit.zone, SHORT.matches || p.y0 > innerHeight / 2, T()); // short landscape: always the top, the hand peeks at the bottom
  moveDrag(p, e);
}

// an aura or equipment let go over a battlefield card attaches to it; anything else lands on the zone under it
function dropAt(p, x, y) {
  const el = document.elementFromPoint(x, y), host = el && el.closest('.bf [data-card]');
  const h = host && p.ids.length === 1 && host.dataset.card !== p.id && attachable(p.hit.card) && cardAt(host.dataset.card);
  if (h && h.zone === 'battlefield') return host;
  return el && el.closest('[data-drop]');
}

function moveDrag(p, e) {
  p.ghost.style.transform = `translate(${e.clientX - p.ghost.offsetWidth / 2}px,${e.clientY - p.ghost.offsetHeight * 0.6}px) rotate(-3deg)`;
  const tgt = dropAt(p, e.clientX, e.clientY);
  if (tgt !== p.over) { if (p.over) p.over.classList.remove('drop-on'); p.over = tgt; if (tgt) tgt.classList.add('drop-on'); }
}

function endPress(e) {
  const p = press, up = e && e.type === 'pointerup';
  press = null;
  if (!p) return;
  clearTimeout(p.timer);
  p.el.classList.remove('lifted');
  if (p.hand) { raise(handRow(), null); hideZoom(); }
  if (p.drag) {
    p.ghost.remove(); document.body.classList.remove('dragging');
    if (p.over) p.over.classList.remove('drop-on');
    swallow = true;
    // a short quick flick up out of the hand, let go before it reaches a zone (the tray's targets count as none): played
    const flick = up && p.hand && (!p.over || p.over.id === 'hand' || p.over.closest('#tray')) && p.y0 - e.clientY > 2 * OUT && e.timeStamp - p.t0 < 400;
    if (up && p.over && p.over.dataset.card) send({ type: 'attach', card: p.id, to: p.over.dataset.card });
    else if (up && (p.over || flick)) {
      const [s, zone] = flick ? [view.you, 'battlefield'] : p.over.dataset.drop.split(':'), seat = Number(s), idx = index(view);
      const ids = p.ids.filter((id) => { const h = idx.get(id); return h && !(h.seat === seat && h.zone === zone); });
      const pos = !flick && zone === 'library' ? { pos: p.over.dataset.pos || 'top' } : {};
      for (let i = 0; i < ids.length; i += 100) send({ type: 'move', cards: ids.slice(i, i + 100), to: { seat, zone }, ...pos });
      if (p.ids.length > 1) clearSel();
    }
    hideTray(); // after the flick test above: it asks whether the target was in the tray
  } else if (p.scrub && !p.lifted && up) { // slid along the hand and let go: that card, as a tap
    swallow = true;
    select(p.el, selMode);
  } else if (p.lifted && up) { // held still and let go
    swallow = true;
    if (p.pile) openPile(p.pile);
    else if (p.el.closest('#sheet')) openCard(p.id);
    else select(p.el, true);
  }
  if (swallow) setTimeout(() => { swallow = false; }, 400);
}

function openCard(id) {
  const inSheet = !$('sheet').hidden;
  setSheet({ k: 'card', id, back: inSheet ? sheet : undefined });
}
function openPile(pile) {
  const [s, zone] = pile.split(':');
  setSheet({ k: zone === 'library' ? 'pile' : 'list', seat: Number(s), zone });
}

document.addEventListener('pointerdown', (e) => {
  swallow = false; // a swallowed click belongs to the gesture before; a new press is a new gesture
  zb = null;
  if (e.button !== 0) return;
  noteBoard(e);
  const life = e.target.closest('[data-life]');
  if (life) { // hold a life button to step by 5
    const [s, d] = life.dataset.life.split(':').map(Number);
    const tm = setTimeout(() => { swallow = true; send({ type: 'life', seat: s, delta: 5 * d }); setTimeout(() => { swallow = false; }, 400); }, 450);
    life.addEventListener('pointerup', () => clearTimeout(tm), { once: true });
    life.addEventListener('pointerleave', () => clearTimeout(tm), { once: true });
    return;
  }
  // a card, or a pile's top card (data-lift)
  const el = e.target.closest('[data-card],[data-lift]');
  const hit = el && cardAt(el.dataset.card || el.dataset.lift);
  if (!hit) {
    if (!el && e.pointerType !== 'mouse' && e.isPrimary && e.target.closest('.sides') && !e.target.closest(CONTROL)) zb = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, on: false, shown: false };
    return;
  }
  const p = press = { el, id: hit.card.id, hit, pile: el.dataset.card ? null : el.dataset.pile, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse',
    y0: e.clientY, t0: e.timeStamp };
  p.hand = !p.mouse && !!el.closest('#hand .hand-row');
  p.now = !p.mouse && !p.hand && !!el.closest('.bf'); // a finger drags a battlefield card at once; piles and sheets scroll, so they wait for the hold
  p.side = e.clientX < innerWidth / 2 ? 'right' : 'left';
  if (p.hand) { raise(el.parentElement, el); showZoom(hit.card, T(), { x: e.clientX, y: e.clientY, side: p.side }); }
  if (!p.mouse) p.timer = setTimeout(() => lift(p), HOLD);
});

// a finger in the hand: up drags the card out; sideways moves the raised card, and the hold starts over on it
const OUT = 24;
function handMove(p, e) {
  if (p.y0 - e.clientY > OUT) { clearTimeout(p.timer); return startDrag(p, e); }
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < SLOP) return;
  const row = p.el.parentElement, el = cardAtX(row, e.clientX), hit = el && cardAt(el.dataset.card);
  p.x = e.clientX; p.y = e.clientY; p.scrub = true;
  clearTimeout(p.timer); p.timer = setTimeout(() => lift(p), HOLD);
  if (hit && el !== p.el) { p.el = el; p.id = hit.card.id; p.hit = hit; raise(row, el); }
  showZoom(p.hit.card, T(), { x: e.clientX, y: e.clientY, side: p.side });
}

// a finger sliding over empty board: the card under it, large
function browse(e) {
  const z = zb;
  if (!z.on) { if (e.timeStamp - z.t0 < ZOOM_WAIT || Math.hypot(e.clientX - z.x0, e.clientY - z.y0) < SLOP) return; z.on = true; z.side = z.x0 < innerWidth / 2 ? 'right' : 'left'; }
  const el = document.elementFromPoint(e.clientX, e.clientY), hit = el && el.closest('#board [data-card]') && cardAt(el.closest('[data-card]').dataset.card);
  if (hit && showZoom(hit.card, T(), { x: e.clientX, y: e.clientY, side: z.side })) z.shown = true; else hideZoom();
}
function endBrowse(e) {
  if (!zb || e.pointerId !== zb.id) return;
  if (zb.shown) { swallow = true; setTimeout(() => { swallow = false; }, 400); }
  zb = null; hideZoom();
}

document.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !press) { hoverCard(e); const r = handRow(); if (r) raise(r, e.target.closest && e.target.closest('.hand-row') ? cardAtX(r, e.clientX) : null); }
  if (zb && e.pointerId === zb.id) return browse(e);
  const p = press;
  if (!p) return;
  if (p.drag) return moveDrag(p, e);
  if (p.hand && !p.lifted) return handMove(p, e);
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < SLOP) return;
  if (p.mouse || p.lifted || p.now) startDrag(p, e);
  else { clearTimeout(p.timer); press = null; } // a finger that moves on a pile or in a sheet before the hold is a scroll
});
document.addEventListener('pointerup', endPress);
document.addEventListener('pointerup', endBrowse); // after the swipe handler below has read zb
document.addEventListener('pointercancel', endPress);
document.addEventListener('pointercancel', endBrowse);
// once a card is picked up, the finger drags it instead of scrolling the page
document.addEventListener('touchmove', (e) => { if (press && (press.lifted || press.drag)) e.preventDefault(); }, { passive: false });
// a long press must not open the browser's menu; a right-click selects
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-card],[data-lift]');
  if (!el) return;
  e.preventDefault();
  if (e.pointerType === 'touch' || (press && !press.mouse) || !el.dataset.card || !cardAt(el.dataset.card)) return;
  if (el.closest('#sheet')) openCard(el.dataset.card); else select(el, selMode);
});

// touching theirs keeps it open; touching your hand brings yours back; where both show, touching one makes it active
function noteBoard(e) {
  if (!view || !view.zones || view.status !== 'active') return;
  const f = focus || view.you, st = e.target.closest('.seat');
  if (e.target.closest('#hand') && !e.target.closest('.hand-bar')) { if (f !== view.you) setFocus(view.you); }
  else if (st && st.classList.contains('on') && f !== view.you) setFocus(f);
  else if (st && BOTH.matches && !st.classList.contains('on')) setFocus(Number(st.dataset.seat));
  if (!BOTH.matches && e.pointerType !== 'mouse' && e.target.closest('.sides')) swipe = { x: e.clientX, y: e.clientY, t: e.timeStamp };
}

// a sideways swipe across the board (not a card being dragged) turns to the other board
let swipe = null;
document.addEventListener('pointerup', (e) => {
  const w = swipe;
  swipe = null;
  if (!w || BOTH.matches || document.body.classList.contains('dragging') || (zb && zb.shown)) return;
  const dx = e.clientX - w.x, dy = e.clientY - w.y;
  if (Math.abs(dx) < 56 || Math.abs(dx) < 1.5 * Math.abs(dy) || e.timeStamp - w.t > 800) return;
  swallow = true; setTimeout(() => { swallow = false; }, 400);
  setFocus(other(focus || view.you));
}, true);
document.addEventListener('pointercancel', () => { swipe = null; });

// a mouse resting on a card shows it large beside the card
function hoverCard(e) {
  const el = e.target.closest && e.target.closest('[data-card]');
  const hit = el && cardAt(el.dataset.card);
  if (!hit || document.body.classList.contains('dragging')) hideZoom();
  else showZoom(hit.card, T(), { rect: el.getBoundingClientRect() });
}
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget && !zb && !(press && press.hand)) hideZoom(); });

document.addEventListener('click', (e) => {
  const el = e.target.closest(CONTROL);
  // a single card's bar closes on a tap anywhere else; a tap on empty space does nothing more, a control still runs
  if (sel.size && !selMode && !swallow && !e.target.closest('#bar') && !e.target.closest(BOARD_CARD)) clearSel();
  if (!el) return;
  if (swallow) { swallow = false; return; }
  hideZoom();
  const d = el.dataset;
  if ('b' in d) { barItems[d.b](); return; }
  if ('focus' in d) { setFocus(Number(d.focus)); return; } // also while picking a host: it may be on the other board
  if (picking) { // choosing the host for an aura or equipment: a battlefield card, or cancel
    const h = 'card' in d && cardAt(d.card);
    if (h && h.zone === 'battlefield' && d.card !== picking) send({ type: 'attach', card: picking, to: d.card });
    else if (!('unpick' in d)) return;
    picking = null; render(); return;
  }
  if ('i' in d) items[d.i]();
  else if ('close' in d) setSheet(null);
  else if ('back' in d) setSheet(sheet && sheet.back);
  else if ('zoom' in d) preview(d.zoom);
  else if ('previewClose' in d) closePreview();
  else if ('card' in d && sheet && sheet.k === 'search' && el.closest('#sheet')) setSheet({ ...sheet, sel: sheet.sel === d.card ? null : d.card });
  else if ('card' in d) {
    const hit = cardAt(d.card);
    if (!hit) return;
    if (el.closest('#sheet')) { openCard(d.card); return; } // a card listed in a sheet opens its own sheet
    const dbl = !!e.detail && lastTap && lastTap.id === d.card && e.timeStamp - lastTap.t < DOUBLE;
    lastTap = dbl ? null : { id: d.card, t: e.timeStamp };
    if (selMode || e.shiftKey || e.ctrlKey || e.metaKey) select(el, true);
    else if (!e.detail) { select(el, false); $('bar').querySelector('button').focus(); } // the keyboard: the bar, for any card
    else if (hit.zone === 'battlefield' && hit.seat === view.you) {
      if (dbl) return; // the second tap of a double tap must not untap it again
      clearSel();
      send({ type: 'tap', cards: [hit.card.id], tapped: !hit.card.tapped });
    } else if (dbl) { clearSel(); preview(d.card); }
    else select(el, false);
  }
  else if ('pile' in d) openPile(d.pile);
  else if ('life' in d) { const [s, dl] = d.life.split(':').map(Number); send({ type: 'life', seat: s, delta: dl }); }
  else if ('pad' in d) setSheet({ k: 'pad', seat: Number(d.pad) });
  else if ('cmd' in d) { const [s, i] = d.cmd.split(':').map(Number); setSheet({ k: 'cmd', seat: s, i }); }
  else if ('token' in d) setSheet({ k: 'token' });
  else if ('hand' in d) { if (document.body.classList.contains('away')) setFocus(view.you); else { handOpen = !handOpen; render(); } }
  else if ('pick' in d) pickDeck();
  else if (d.top === 'menu') setSheet({ k: 'menu' });
  else if (d.top === 'full') fullscreen();
  else if (d.top === 'draw') { const lib = view.zones[view.you].library; if (lib.length) send({ type: 'move', cards: [lib[0].id], to: { seat: view.you, zone: 'hand' } }); }
  else if (d.top === 'untap') send({ type: 'untap_all', seat: view.you });
  else if (d.top === 'undo') send({ type: 'undo' });
  else if (d.top === 'pass') tapPass();
  else if (d.top === 'log') setSheet({ k: 'log' });
});
document.addEventListener('input', (e) => { if (e.target.id === 'sq') filterSearch(); });
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  // ctrl/cmd+Z undoes your last action; the life pad takes digits and backspace from the keyboard
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && view && view.can_undo) { e.preventDefault(); send({ type: 'undo' }); return; }
  if (sheet && sheet.k === 'pad' && !typing && /^[0-9]$|^Backspace$/.test(e.key)) {
    const v = sheet.v || '';
    e.preventDefault();
    setSheet({ ...sheet, v: e.key === 'Backspace' ? v.slice(0, -1) : (v + e.key).replace(/^0+/, '').slice(0, 3) });
    return;
  }
  if (e.key !== 'Escape') return;
  if (press) { endPress(null); return; }
  if (disarmPass()) { render(); return; }
  if (picking) { picking = null; render(); return; }
  if (!$('preview').hidden) closePreview();
  else if (sel.size && $('sheet').hidden) clearSel();
  else setSheet(null);
});
document.addEventListener('fullscreenchange', render); // the buttons and the menu item show which way it toggles

render();
connect();
