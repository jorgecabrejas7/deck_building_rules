// The deck-building workspace: card search on one side, the deck as stacks of cards in the middle, live figures on
// the other side. It edits the analyzed deck through edits.js, so the report and Guardar follow every change.
import { state, cardCache } from '../state.js';
import { T, fill } from '../i18n.js';
import { addToDeck, removeFromDeck, undoEdit, canEdit, searchForDeck, scryText } from '../edits.js';
import { stacksInDeck } from '../engine/index.js';
import { $, esc, eur, tierTone, announce, coverArt, coverStyle, bindCovers, glide } from './helpers.js';
import { TYPES, TYPE_ORDER } from './constants.js';
import { saveDeck } from './decks.js';
import { renderAll } from '../main.js';

const TYPE_F = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land'];
const ROLE_F = { ramp: 'otag:ramp', draw: 'otag:draw', removal: 'otag:removal', wipe: 'otag:board-wipe', tutor: 'otag:tutor' };
const RESULTS = 36;
const PIPS = ['W', 'U', 'B', 'R', 'G', 'C'];
let built = null;      // the deck fingerprint the shell was built for: a new analysis rebuilds it
let q = '';            // what is typed in the search
let type = null, role = null, cheap = false;
let hits = null;       // the cards found; null while searching
let failed = false;    // the last search did not reach Scryfall
let group = 'type';    // type | mv
let pane = 'deck';     // the part shown on a phone: search | deck | stats
let typing, asked = 0;

const short = (name) => String(name).split(' // ')[0];
const svg = (d) => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const I_BACK = svg('<path d="M15 5l-7 7 7 7"/>'), I_UNDO = svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>');
const I_SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'), I_PLUS = svg('<path d="M12 5v14M5 12h14"/>'), I_MINUS = svg('<path d="M5 12h14"/>');
const chip = (act, value, label, on) => '<button class="chip-dashed gm-chip" data-st="' + act + '" data-value="' + value + '" aria-pressed="' + on + '">' + esc(label) + '</button>';

export function openStudio() { state.studio = true; pane = 'deck'; glide(() => renderAll()); }
function closeStudio() { state.studio = false; glide(() => renderAll()); }

// ---- search ----
async function search() {
  const mine = ++asked;
  hits = null; failed = false;
  paintHits();
  const terms = [q.trim() ? '(' + scryText(q.trim()) + ')' : '', type ? 't:' + type : '', role ? ROLE_F[role] : '', cheap ? 'eur<=1' : ''].filter(Boolean);
  let found = [];
  try { found = await searchForDeck(terms, RESULTS); } catch (e) { failed = !/ 404$/.test(e.message); } // 404: nothing matches
  if (mine !== asked) return;
  hits = found;
  paintHits();
}
function paintHits() {
  const t = T(), el = $('stHits');
  if (!el) return;
  $('stHitsTitle').textContent = q.trim() || type || role || cheap ? t.stResults : t.stTop;
  if (!hits) { el.innerHTML = '<p class="st-note" role="status">' + esc(t.stSearching) + '</p>'; return; }
  if (!hits.length) { el.innerHTML = '<p class="st-note" role="status">' + esc(failed ? t.stErr : t.stNone) + '</p>'; return; }
  el.innerHTML = '<ul class="st-results">' + hits.map((c, i) => '<li style="--i:' + i + '"><button class="st-hit" data-st="add" data-value="' + i + '" aria-label="' + esc(fill(t.stAdd, { c: short(c.name) })) + '">' +
    '<img src="' + esc(c.img_normal) + '" alt="" loading="lazy" decoding="async" draggable="false"><span class="st-hit-add">' + I_PLUS + '</span>' +
    (c.price != null ? '<span class="st-price">' + esc(eur(c.price)) + '</span>' : '') + '</button></li>').join('') + '</ul>';
}

// ---- the deck ----
function groups(t) {
  const r = state.result, cmds = new Set(r.commanders), lang = state.lang;
  const rest = r.cardsInfo.filter(x => !cmds.has(x.name)), isLand = (x) => x.cls.type === 'L';
  const byName = (a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || a.name.localeCompare(b.name);
  const split = group === 'mv'
    ? [...[0, 1, 2, 3, 4, 5, 6].map(v => [fill(t.stMv, { v }), x => !isLand(x) && (x.card.cmc || 0) === v]), [fill(t.stMv, { v: '7+' }), x => !isLand(x) && (x.card.cmc || 0) >= 7], [TYPES.L[lang], isLand]]
    : TYPE_ORDER.map(k => [TYPES[k][lang], x => x.cls.type === k]);
  return [[t.stCmd, r.cardsInfo.filter(x => cmds.has(x.name))], ...split.map(([label, test]) => [label, rest.filter(test).sort(byName)])].filter(g => g[1].length);
}
function deckHtml(t) {
  const off = canEdit() ? '' : ' disabled', cmds = new Set(state.result.commanders);
  const card = (x) => {
    const name = short(x.name);
    return '<li class="st-card" tabindex="0" data-name="' + esc(x.name) + '" style="view-transition-name:st-' + esc(x.name.replace(/[^A-Za-z0-9]/g, '_')) + '"><img src="' + esc(x.card.img_normal) + '" alt="' + esc(name) + '" loading="lazy" decoding="async" draggable="false">' +
      (x.qty > 1 ? '<span class="st-qty">×' + x.qty + '</span>' : '') +
      '<span class="st-acts">' + (cmds.has(x.name) ? '' : '<button data-st="remove" data-value="' + esc(x.name) + '" aria-label="' + esc(fill(t.stRemove, { c: name })) + '"' + off + '>' + I_MINUS + '</button>') +
      (stacksInDeck(x.card) ? '<button data-st="more" data-value="' + esc(x.name) + '" aria-label="' + esc(fill(t.stOneMore, { c: name })) + '"' + off + '>' + I_PLUS + '</button>' : '') + '</span></li>';
  };
  const cols = groups(t).map(([label, list]) => '<section class="st-col"><h3 class="st-col-h">' + esc(label) + ' <span>' + list.reduce((n, x) => n + x.qty, 0) + '</span></h3><ul class="st-stack">' + list.map(card).join('') + '</ul></section>').join('');
  const empty = state.result.cardsInfo.length <= state.result.commanders.length ? '<p class="st-empty">' + esc(t.stEmpty) + '</p>' : '';
  return '<div class="st-deck-bar"><div class="dk-actions" role="group" aria-label="' + esc(t.stGroup) + '">' + chip('group', 'type', t.stG_type, group === 'type') + chip('group', 'mv', t.stG_mv, group === 'mv') + '</div></div>' +
    '<div class="st-cols">' + cols + '</div>' + empty;
}

// ---- figures ----
function statsHtml(t) {
  const r = state.result, cards = r.cardsInfo, nonland = cards.filter(x => x.cls.type !== 'L');
  const curve = [0, 1, 2, 3, 4, 5, 6, 7].map(v => nonland.filter(x => v === 7 ? (x.card.cmc || 0) >= 7 : (x.card.cmc || 0) === v).reduce((n, x) => n + x.qty, 0));
  const top = Math.max(1, ...curve);
  const pips = Object.fromEntries(PIPS.map(p => [p, 0]));
  for (const x of nonland) for (const m of (x.card.mana_cost || '').matchAll(/\{([WUBRGC])[^}]*\}/g)) pips[m[1]] += x.qty;
  const pipTop = Math.max(1, ...Object.values(pips));
  const types = TYPE_ORDER.map(k => [TYPES[k][state.lang], cards.filter(x => x.cls.type === k).reduce((n, x) => n + x.qty, 0)]).filter(x => x[1]);
  const typeTop = Math.max(1, ...types.map(x => x[1]));
  const bar = (label, n, max, cls = '') => '<li><span class="st-bar-l">' + label + '</span><span class="st-bar"><i class="' + cls + '" style="--v:' + (n / max) + '"></i></span><span class="st-bar-n">' + n + '</span></li>';
  return '<section class="st-box"><h3>' + esc(t.stPod) + '</h3><p class="st-verdict"><span class="tier-pill ' + tierTone(r.evalRes.tier) + '">' + esc(t['short_' + r.evalRes.tier]) + '</span><b>' + esc(fill(t.stPts, { n: r.evalRes.points })) + '</b></p>' +
    '<dl class="st-facts"><div><dt>' + esc(t.stPrice) + '</dt><dd>' + esc(eur(r.stats.total_price_eur)) + '</dd></div>' +
    (r.level.pending ? '' : '<div><dt>' + esc(t.pfPractical) + '</dt><dd>' + esc(r.level.bracket) + '</dd></div>') + '</dl></section>' +
    '<section class="st-box"><h3>' + esc(t.stCurve) + '</h3><ol class="st-curve" aria-label="' + esc(t.stCurve) + '">' + curve.map((n, v) => '<li><span class="st-curve-n">' + (n || '') + '</span><i style="--v:' + (n / top) + '"></i><span class="st-curve-l">' + (v === 7 ? '7+' : v) + '</span></li>').join('') + '</ol>' +
    '<p class="st-note">' + esc(fill(t.stAvg, { v: (r.stats.avg_cmc || 0).toFixed(2) })) + '</p></section>' +
    '<section class="st-box"><h3>' + esc(t.stColors) + '</h3><ul class="st-bars">' + PIPS.filter(p => pips[p]).map(p => bar('<i class="st-pip" data-c="' + p + '"></i>', pips[p], pipTop, 'c' + p)).join('') + '</ul></section>' +
    '<section class="st-box"><h3>' + esc(t.stTypeCount) + '</h3><ul class="st-bars">' + types.map(([label, n]) => bar(esc(label), n, typeTop)).join('') + '</ul></section>';
}

function topHtml(t) {
  const r = state.result, n = r.stats.total_cards, name = (state.openDeck && state.openDeck.name) || state.deck.name || r.commanders.map(short).join(' / ');
  return '<button class="st-icon" id="st-back" data-st="back" aria-label="' + esc(t.stBack) + '">' + I_BACK + '</button>' +
    '<span class="st-cover" style="' + coverStyle(name) + '">' + coverArt(r.commanders.slice(0, 1)) + '</span>' +
    '<span class="st-id"><b>' + esc(name) + '</b><span>' + esc(r.commanders.map(short).join(' / ')) + '</span></span>' +
    '<span class="st-count' + (n === 100 ? ' ok' : n > 100 ? ' over' : '') + '" aria-label="' + esc(n + ' ' + t.stCardsLabel) + '"><b>' + n + '</b><span>/ 100</span></span>' +
    '<span class="tier-pill ' + tierTone(r.evalRes.tier) + '">' + esc(t['short_' + r.evalRes.tier]) + ' · ' + esc(fill(t.stPts, { n: r.evalRes.points })) + '</span>' +
    '<button class="st-icon" id="st-undo" data-st="undo" aria-label="' + esc(t.stUndo) + '"' + (state.edits.undo.length && canEdit() ? '' : ' disabled') + '>' + I_UNDO + '</button>' +
    '<button class="btn-ghost-sm" id="st-report" data-st="back">' + esc(t.stReport) + '</button>' +
    '<button class="btn-primary" id="st-save" data-st="save">' + esc(state.saveSt ? t[state.saveSt] : t.stSave) + '</button>' +
    '<span class="st-progress" aria-hidden="true"><i style="--v:' + Math.min(1, n / 100) + '"></i></span>';
}

function shell(t) {
  const paneBtn = (k) => '<button data-st="pane" data-value="' + k + '" aria-pressed="' + (pane === k) + '">' + esc(t['stPane_' + k]) + '</button>';
  return '<header class="st-top" id="stTop"></header>' +
    '<div class="st-main"><aside class="st-search" data-pane="search"><label class="lib-search">' + I_SEARCH + '<input type="search" id="stQ" value="' + esc(q) + '" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t.stSearch) + '" aria-label="' + esc(t.stSearch) + '"></label>' +
    '<div class="st-chips" id="stChips"></div><h3 class="st-h" id="stHitsTitle"></h3><div id="stHits" aria-live="polite"></div><p class="st-note">' + esc(t.stSearchHint) + '</p></aside>' +
    '<section class="st-deck" id="stDeck" data-pane="deck"></section><aside class="st-stats" id="stStats" data-pane="stats"></aside></div>' +
    '<nav class="st-panes" aria-label="' + esc(t.stPanes) + '">' + ['search', 'deck', 'stats'].map(paneBtn).join('') + '</nav>';
}
function paintChips(t) {
  $('stChips').innerHTML = '<div class="dk-actions" role="group" aria-label="' + esc(t.stTypes) + '">' + TYPE_F.map(k => chip('type', k, t['stF_' + k], type === k)).join('') + '</div>' +
    '<div class="dk-actions" role="group" aria-label="' + esc(t.stRoles) + '">' + Object.keys(ROLE_F).map(k => chip('role', k, t['stR_' + k], role === k)).join('') + chip('cheap', '1', t.stCheap, cheap) + '</div>';
}

export function renderStudio() {
  const el = $('studio'), on = !!(state.studio && state.result && state.tab === 'informe');
  if (!on) state.studio = false;
  el.hidden = !on;
  document.body.classList.toggle('in-studio', on);
  if (!on) { built = null; return; }
  const t = T(), key = state.lang + '|' + state.result.commanders.join('|');
  if (built !== key) {
    built = key; q = ''; type = role = null; cheap = false;
    el.innerHTML = shell(t);
    el.onclick = onClick; el.oninput = onInput;
    bindCovers(el);
    paintChips(t);
    search();
  }
  el.dataset.pane = pane;
  $('stTop').innerHTML = topHtml(t);
  $('stDeck').innerHTML = deckHtml(t);
  $('stStats').innerHTML = statsHtml(t);
}

function onInput(e) {
  if (e.target.id !== 'stQ') return;
  q = e.target.value;
  clearTimeout(typing);
  typing = setTimeout(search, 300);
}

async function onClick(e) {
  const b = e.target.closest('[data-st]');
  const card = !b && e.target.closest('.st-card'); // a tap opens a card in its stack, where a finger cannot hover
  if (card) for (const c of $('stDeck').querySelectorAll('.st-card')) c.classList.toggle('open', c === card && !c.classList.contains('open'));
  if (!b) return;
  const a = b.dataset.st, v = b.dataset.value, t = T();
  if (a === 'back') return closeStudio();
  if (a === 'pane') { pane = v; $('studio').dataset.pane = v; for (const x of b.parentNode.children) x.setAttribute('aria-pressed', x === b); return; }
  if (a === 'group') { group = v; return glide(() => { $('stDeck').innerHTML = deckHtml(t); }); }
  if (a === 'type' || a === 'role' || a === 'cheap') {
    if (a === 'type') type = type === v ? null : v; else if (a === 'role') role = role === v ? null : v; else cheap = !cheap;
    paintChips(t);
    return search();
  }
  if (a === 'save') { await saveDeck(); $('stTop').innerHTML = topHtml(T()); setTimeout(() => { if ($('stTop')) $('stTop').innerHTML = topHtml(T()); }, 3100); return; }
  if (!canEdit()) return announce(t.stWait);
  if (a === 'undo') return undoEdit();
  if (a === 'remove') return removeFromDeck([v]);
  if (a === 'more') return addToDeck(cardCache[v]);
  if (a === 'add') {
    const card = hits[Number(v)];
    b.closest('li').classList.add('gone');
    if (!stacksInDeck(card)) hits = hits.map(c => c === card ? null : c); // keeps the others' indexes
    await addToDeck(card);
    hits = hits.filter(Boolean);
    paintHits();
  }
}
