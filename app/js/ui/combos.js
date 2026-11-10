import { state, cardCache } from '../state.js';
import { T, fill } from '../i18n.js';
import { COMBO_TAGS, deckFingerprint, fetchCards, groupNear, nearCombos, nearPlayable } from '../engine/index.js';
import { comboFeatureText } from './constants.js';
import { $, esc } from './helpers.js';
import { addByName, canEdit } from '../edits.js';
import { checkCombos, getComboDb } from '../pipeline.js';
import { ICON, answer, cardName, fold, more, paint } from './reading.js';

// Every combo says which bracket it belongs to. The tag is Commander Spellbook's
// own classification, so what the page calls "Bracket 4+" is what its editors do.
const TAG_TONE = { B: 'tag-b', R: 'tag-r', S: 'tag-s', P: 'tag-p', O: 'tag-o', C: 'tag-c', E: 'tag-e' };
const PAGE = 5;

export function tagChip(tag, t) {
  const m = COMBO_TAGS[tag];
  const label = tag === 'B' ? t.brIllegal : 'B' + m.bracket;
  return '<span class="rd-tag ' + TAG_TONE[tag] + '" title="' + esc(t['tag_' + tag]) + '"><b>' + esc(label) + '</b> ' + esc(m.name) + '</span>';
}

const spellbookUrl = (c) => 'https://commanderspellbook.com/search/?q=' +
  encodeURIComponent(c.cards.map(n => 'card:"' + n + '"').join(' '));

const manaText = (c, t) => c.deploy === null || c.deploy === undefined ? ''
  : c.extraMana
    ? t.comboManaPlus.replace('%v', c.deploy - c.extraMana).replace('%x', c.extraMana).replace('%t', c.deploy)
    : t.comboMana.replace('%v', c.deploy);

// A combo in one breath: its pieces and bracket, then what it does and costs.
export function comboLine(c) {
  const t = T();
  const named = c.templates ? c.templates.filter(n => !n.includes('{')) : [];
  const result = comboFeatureText(c.features[0] || '', state.lang) + (named.length ? ' (' + named.join(', ') + ')' : '');
  return '<div class="rd-line-main"><div class="rd-pieces">' +
    [...c.cards, ...(c.filled || [])].map(n => cardName(n, 'rd-piece')).join('<span class="rd-plus" aria-hidden="true">+</span>') +
    '</div>' + tagChip(c.tag, t) + '</div>' +
    '<p class="rd-result">' + esc([result, manaText(c, t)].filter(Boolean).join(' · ')) + '</p>';
}

const breaksB3 = (c) => c.tag === 'R' || c.landDenial || c.infiniteTurns;
const isLock = (c) => c.lock || c.skipTurns || c.controlsOpponents;
const FILTERS = [
  ['all', () => true],
  ['breaks', breaksB3],
  ['win', c => c.win],
  ['two', c => c.cardsToFind <= 2],
  ['inf', c => c.infinite],
  ['lock', isLock],
];

// Spellbook's text writes mana as {U}{2}: draw those as the symbols everyone knows.
const withSymbols = (text) => esc(text).replace(/\{([^}]+)\}/g, (_, sym) =>
  '<img class="cb-sym" src="https://svgs.scryfall.io/card-symbols/' + encodeURIComponent(sym.replace('/', '')) + '.svg" alt="' + esc(sym) + '">');
const lines = (text) => (text || '').split('\n').map(l => l.trim()).filter(Boolean);

// A combo laid out like a recipe: both cards, what you need, the steps, what you get.
function comboRow(c, t) {
  const pieces = [...c.cards, ...(c.filled || [])];
  const facts = [
    c.win && t.cfWin, c.cardsToFind <= 2 && (c.n > 2 ? t.cfTwoCmd : t.cfTwo), c.infinite && t.cfInf, isLock(c) && t.cfLock,
    c.prereq && t.cfBoard, c.mustCommand.length && t.cfCommander,
  ].filter(Boolean);
  return '<li class="cb" data-steps="' + esc(c.cards.join('|')) + '">' +
    '<div class="cb-arts" data-n="' + Math.min(pieces.length, 4) + '">' + pieces.slice(0, 4).map(n => cardImage(n)).join('') + '</div>' +
    '<div class="cb-body"><div class="cb-head"><h4>' + pieces.map(esc).join(' <span class="rd-plus" aria-hidden="true">+</span> ') + '</h4>' + tagChip(c.tag, t) + '</div>' +
      '<p class="cb-tag">' + esc(t['tag_' + c.tag]) + '</p>' +
      '<p class="cb-line">' + esc(comboFeatureText(c.features[0] || '', state.lang)) + (manaText(c, t) ? ' · ' + esc(manaText(c, t)) : '') + '</p>' +
      (facts.length ? '<ul class="cb-facts">' + facts.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>' : '') +
      (c.fastPair ? '<p class="cb-tip">' + esc(t.cfFastTip) + '</p>' : '') +
      '<div class="cb-steps"><p class="rd-q">' + esc(t.cbLoading) + '</p></div>' +
      '<a class="rd-link" href="' + spellbookUrl(c) + '" target="_blank" rel="noopener noreferrer">' + esc(t.cbOpen) + ICON.open + '</a>' +
    '</div></li>';
}

function cardImage(name) {
  const card = state.result.cardsInfo.map(x => x.card).find(k => String(k.name).split(' // ')[0] === name) || cardCache[name] || {};
  return card.img_normal ? '<img src="' + esc(card.img_normal) + '" alt="' + esc(name) + '" loading="lazy" decoding="async">'
    : '<span class="cb-noart">' + esc(name) + '</span>';
}

// Same value as steps_shard in scripts/build_combo_db.py.
const shardOf = (key) => { let h = 0; for (const ch of key) h = (h * 31 + ch.codePointAt(0)) & 255; return h.toString(16).padStart(2, '0'); };
const shards = new Map();
const loadShard = (id) => {
  if (!shards.has(id)) shards.set(id, fetch('../data/combo_steps/' + id + '.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})));
  return shards.get(id);
};

function stepsHtml(s, t) {
  if (!s) return '<p class="rd-q">' + esc(t.cbNoSteps) + '</p>';
  const need = [...lines(s.e), ...lines(s.p)];
  const zones = (s.z || []).filter(z => 'zone_' + z in t).map(z => t['zone_' + z]);
  return (need.length || s.x ? '<section><h5>' + esc(t.cbNeed) + '</h5><ul>' + (s.x ? '<li>' + esc(t.cbMana) + ': ' + withSymbols(s.x) + '</li>' : '') +
      (zones.length ? '<li>' + esc(t.cbZones) + ': ' + esc(zones.join(', ')) + '</li>' : '') + need.map(l => '<li>' + withSymbols(l) + '</li>').join('') + '</ul></section>' : '') +
    (s.d ? '<section><h5>' + esc(t.cbSteps) + '</h5><ol>' + lines(s.d).map(l => '<li>' + withSymbols(l) + '</li>').join('') + '</ol></section>' : '') +
    (s.o ? '<section><h5>' + esc(t.cbResult) + '</h5><ul class="cb-facts">' + s.o.map(o => '<li>' + esc(comboFeatureText(o, state.lang)) + '</li>').join('') + '</ul></section>' : '') +
    (s.n ? '<section><h5>' + esc(t.cbNotes) + '</h5>' + lines(s.n).map(l => '<p>' + withSymbols(l) + '</p>').join('') + '</section>' : '');
}

// The steps live in small files, fetched for what is on screen.
function fillSteps(root, t) {
  for (const el of root.querySelectorAll('[data-steps]')) {
    const key = el.dataset.steps;
    loadShard(shardOf(key)).then(rows => {
      if (el.isConnected) el.querySelector('.cb-steps').innerHTML = stepsHtml(rows[key], t);
    });
  }
}

// The two facts worth a sentence: the cheapest line, and the card most lines lean on.
function why(list, t) {
  const uses = new Map();
  for (const c of list) for (const n of c.cards) uses.set(n, (uses.get(n) || 0) + 1);
  const anchor = [...uses].sort((a, b) => b[1] - a[1])[0];
  const fastest = list.filter(c => typeof c.deploy === 'number' && (c.infinite || c.win)).sort((a, b) => a.deploy - b.deploy)[0];
  return [fastest ? fill(t.comboWhyFast, { v: fastest.deploy, c: fastest.cards.join(' + ') }) : '',
    anchor && anchor[1] > 1 ? fill(t.comboWhyAnchor, { c: anchor[0], v: anchor[1] }) : ''].filter(Boolean).join(' ');
}

// ---- one card away: fills its own box once Scryfall answers, so the page never waits ----
const NEAR_LOOKUP = 75; // one /cards/collection call
const NEAR_IN_CARD = 3;

function nearLine(c, t) {
  return '<div class="nr-combo" data-key="' + esc(c.cards.join('|')) + '">' + comboLine(c) +
    more(t.comboSteps, '<div class="cb-steps"><p class="rd-q">' + esc(t.cbLoading) + '</p></div>' +
      '<a class="rd-link" href="' + spellbookUrl(c) + '" target="_blank" rel="noopener noreferrer">' + esc(t.cbOpen) + ICON.open + '</a>') + '</div>';
}

function nearCard({ card, combos }, t) {
  const rest = combos.slice(NEAR_IN_CARD);
  return '<li class="cb nr"><div class="cb-arts" data-n="1">' + cardImage(card) + '</div><div class="cb-body">' +
    '<h5>' + esc(card) + '</h5><button type="button" class="btn-outline sug-btn" data-add-name="' + esc(card) + '"' + (canEdit() ? '' : ' disabled') + '>' + esc(t.nearAdd) + '</button><p class="cb-tag">' + esc(fill(combos.length === 1 ? t.nearOne : t.nearMany, { v: combos.length })) + '</p>' +
    combos.slice(0, NEAR_IN_CARD).map(c => nearLine(c, t)).join('') +
    (rest.length ? more(fill(t.sugMore, { v: rest.length }), rest.map(c => nearLine(c, t)).join('')) : '') + '</div></li>';
}

function paintNear() {
  const el = $('comboNear'), near = state.near, t = T();
  if (!el || !near) return;
  const groups = near.groups || [];
  const body = near.status === 'loading' ? '<p class="rd-q">' + esc(t.nearLoading) + '</p>'
    : near.status === 'error' ? '<p class="rd-q">' + esc(t.nearErr) + '</p>'
    : !groups.length ? '<p class="rd-q">' + esc(t.nearNone) + '</p>'
    : '<ul class="cb-list" id="nearList" tabindex="-1">' + (near.all ? groups : groups.slice(0, PAGE)).map(g => nearCard(g, t)).join('') + '</ul>' +
      (groups.length > PAGE && !near.all ? '<button type="button" id="nearMore" class="rd-btn">' + esc(fill(t.nearMore, { v: groups.length })) + '</button>' : '');
  paint(el, '<section class="rd-section"><h4>' + esc(t.nearT) + '</h4><p class="rd-q">' + esc(t.nearX) + '</p>' + body + '</section>');
  // a shard weighs some 350 KB and this list can run long: steps wait until opened
  for (const row of el.querySelectorAll('.nr-combo')) row.querySelector('details').addEventListener('toggle', () => {
    const key = row.dataset.key;
    loadShard(shardOf(key)).then(rows => { if (row.isConnected) row.querySelector('.cb-steps').innerHTML = stepsHtml(rows[key], t); });
  }, { once: true });
  for (const b of el.querySelectorAll('[data-add-name]')) b.onclick = () => addByName(b.dataset.addName);
  const moreBtn = $('nearMore');
  if (moreBtn) moreBtn.onclick = () => { near.all = true; paintNear(); $('nearList').focus({ preventScroll: true }); };
}

async function loadNear(key, names, commanders) {
  let found = { key, status: 'error' };
  try {
    const groups = groupNear(nearCombos(names, await getComboDb(), commanders)).slice(0, NEAR_LOOKUP);
    await fetchCards(groups.map(g => g.card), cardCache);
    found = { key, status: 'done', groups: nearPlayable(groups, cardCache, commanders) };
  } catch (e) { console.error(e); }
  if (state.near.key !== key) return;
  state.near = found;
  paintNear();
}

function renderNear() {
  const { commanders } = state.result;
  if (!commanders.length) return; // with no commander there are no colours to read candidates against
  const key = deckFingerprint(state.deck.entries) + '|' + commanders.join('|');
  // a failed lookup is not remembered: coming back to the view tries again
  if (!state.near || state.near.key !== key || state.near.status === 'error') {
    state.near = { key, status: 'loading' };
    loadNear(key, state.deck.entries.map(e => e.name), commanders);
  }
  paintNear();
}

function tagLegend(t) {
  return fold('tags', t.tagLegendT, '', '<ul class="rd-tag-legend">' + Object.keys(COMBO_TAGS).map(k =>
    '<li>' + tagChip(k, t) + '<span class="rd-q">' + esc(t['tag_' + k]) + '</span></li>').join('') + '</ul>' +
    '<p class="rd-q">' + esc(t.tagSource) + '</p>');
}

export function renderCombos() {
  const t = T(), cd = state.combosData, root = $('combos');
  const isFile = location.protocol === 'file:';
  const shell = (value, sub, body, lead = '') => '<div class="panel rd">' + answer({ label: t.combosT, value, sub, body: lead }) + body + '</div>';
  if (!cd || cd.status === 'error') {
    paint(root, shell('—', isFile ? '' : esc(cd ? t.comboErr : t.comboChecking),
      (isFile ? '<p class="rd-text">' + esc(t.fileProto) + '</p>' : '') +
      (isFile ? '' : '<button type="button" id="comboRetry" class="rd-btn">' + esc(t.comboRetry) + '</button>')));
    const b = $('comboRetry'); if (b) b.onclick = checkCombos;
    return;
  }
  if (cd.status === 'checking') return paint(root, shell('…', esc(t.comboChecking), ''));
  const dbDate = cd.updated ? '<p class="rd-foot">' + esc(t.comboDbDate) + ' ' + esc(cd.updated.slice(0, 10)) + '</p>' : '';
  const all = state.result.bracket.combos;
  const nearBox = '<div id="comboNear"></div>';
  if (!all.length) {
    paint(root, shell('0', esc(t.comboNoneAny), nearBox + '<div class="rd-folds">' + tagLegend(t) + '</div>' + dbDate));
    return renderNear();
  }

  const pressed = (k) => state.comboFilter === k;
  const btn = (k, label, n) => '<button type="button" class="rd-filter" data-combof="' + k + '" aria-pressed="' + pressed(k) + '">' + label + ' <b>' + n + '</b></button>';
  // the tag filters double as the deck's distribution by bracket
  const tagBar = Object.keys(COMBO_TAGS).map(k => [k, all.filter(c => c.tag === k).length]).filter(([, n]) => n)
    .map(([k, n]) => btn('tag:' + k, esc(k === 'B' ? t.brIllegal : 'B' + COMBO_TAGS[k].bracket) + ' ' + esc(COMBO_TAGS[k].name), n)).join('');
  const catBar = FILTERS.map(([k, fn]) => [k, all.filter(fn).length]).filter(([k, n]) => k === 'all' || n)
    .map(([k, n]) => btn(k, esc(t['cf_' + k]), n)).join('');

  const f = state.comboFilter;
  const shown = f.startsWith('tag:') ? all.filter(c => c.tag === f.slice(4))
    : all.filter((FILTERS.find(([k]) => k === f) || FILTERS[0])[1]);
  const visible = state.comboAll ? shown : shown.slice(0, PAGE);
  const count = (fn) => all.filter(fn).length;

  paint(root, shell(String(all.length),
    esc(fill(t.comboSub, { i: count(c => c.infinite), w: count(c => c.win), d: count(c => c.cardsToFind <= 2) })),
    '<div class="rd-filter-bars"><div class="rd-filter-bar" role="group" aria-label="' + esc(t.comboFilterAria) + '">' + catBar + '</div>' +
    '<div class="rd-filter-bar" role="group" aria-label="' + esc(t.comboFilterTagAria) + '">' + tagBar + '</div></div>' +
    '<ul class="cb-list" id="comboList" tabindex="-1">' + (visible.map(c => comboRow(c, t)).join('') ||
      '<li class="rd-q">' + esc(t.comboNoMatch) + '</li>') + '</ul>' +
    (shown.length > PAGE && !state.comboAll
      ? '<button type="button" id="comboMore" class="rd-btn">' + esc(t.comboMore.replace('%v', shown.length)) + '</button>' : '') +
    nearBox + '<div class="rd-folds">' + tagLegend(t) + '</div>' + dbDate,
    why(all, t) ? '<p class="rd-why">' + esc(why(all, t)) + '</p>' : ''));

  fillSteps(root, t);
  renderNear();
  for (const b of root.querySelectorAll('[data-combof]')) b.onclick = () => {
    const k = b.dataset.combof;
    state.comboFilter = state.comboFilter === k ? 'all' : k;
    state.comboAll = false;
    renderCombos();
    // the re-render removes the pressed button: keep keyboard focus where it was
    root.querySelector('[data-combof="' + k + '"]').focus();
  };
  const moreBtn = $('comboMore');
  if (moreBtn) moreBtn.onclick = () => { state.comboAll = true; renderCombos(); $('comboList').focus({ preventScroll: true }); };
}
