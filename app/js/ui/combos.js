import { state } from '../state.js';
import { T } from '../i18n.js';
import { COMBO_TAGS } from '../engine/index.js';
import { comboFeatureText } from './constants.js';
import { $, esc } from './helpers.js';
import { bindCardTilePopover } from './popover.js';
import { checkCombos } from '../pipeline.js';

// Every combo says which bracket it belongs to. The tag is Commander Spellbook's
// own classification, so what the page calls "Bracket 4+" is what its editors do.
const TAG_TONE = { B: 'tone-bad', R: 'tone-bad', S: 'tone-warn', P: 'tone-warn', O: 'tone-tip', C: 'tone-tip', E: 'tone-ok' };
const PAGE = 20;

export function tagChip(tag, t) {
  const m = COMBO_TAGS[tag];
  const label = tag === 'B' ? t.brIllegal : 'B' + m.bracket;
  return '<span class="combo-tag ' + TAG_TONE[tag] + '" title="' + esc(t['tag_' + tag]) + '">' +
    '<b class="mono">' + esc(label) + '</b> ' + esc(m.name) + '</span>';
}

const pieceNames = (c) => [...c.cards, ...(c.filled || [])];
const spellbookUrl = (c) => 'https://commanderspellbook.com/search/?q=' +
  encodeURIComponent(c.cards.map(n => 'card:"' + n + '"').join(' '));

const manaText = (c, t) => c.deploy === null || c.deploy === undefined ? ''
  : c.extraMana
    ? t.comboManaPlus.replace('%v', c.deploy - c.extraMana).replace('%x', c.extraMana).replace('%t', c.deploy)
    : t.comboMana.replace('%v', c.deploy);

// One line inside a checklist row: the pieces, its bracket, what it costs and does.
export function comboInline(c, cls = '') {
  const t = T();
  return '<span class="br-combo' + (cls ? ' ' + cls : '') + '"><b>' + pieceNames(c).map(esc).join(' + ') + '</b> ' +
    tagChip(c.tag, t) + (manaText(c, t) ? ' <span class="mono">' + esc(manaText(c, t)) + '</span>' : '') +
    ' → ' + esc(comboFeatureText(c.features[0] || '', state.lang)) + '</span>';
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

function comboRow(c, t, imgOf) {
  const badges = [
    breaksB3(c) ? '<span class="combo-flag bad">' + esc(t.cfBreaks) + '</span>' : '',
    c.win ? '<span class="combo-flag">' + esc(t.cfWin) + '</span>' : '',
    c.cardsToFind <= 2 ? '<span class="combo-flag">' + esc(c.n > 2 ? t.cfTwoCmd : t.cfTwo) + '</span>' : '',
    c.infinite ? '<span class="combo-flag">' + esc(t.cfInf) + '</span>' : '',
    isLock(c) ? '<span class="combo-flag">' + esc(t.cfLock) + '</span>' : '',
    c.prereq ? '<span class="combo-flag soft">' + esc(t.cfBoard) + '</span>' : '',
    c.mustCommand.length ? '<span class="combo-flag soft">' + esc(t.cfCommander) + '</span>' : '',
  ].join('');
  const pieces = pieceNames(c).map(n =>
    '<span class="combo-card" data-name="' + esc(n) + '"' + (imgOf(n) ? ' data-img="' + esc(imgOf(n)) + '"' : '') + '>' + esc(n) + '</span>')
    .join('<span class="combo-plus" aria-hidden="true">+</span>');
  return '<li class="combo-item' + (breaksB3(c) ? ' breaks' : '') + '">' +
    '<div class="combo-main"><div class="combo-pieces">' + pieces + '</div>' + tagChip(c.tag, t) + '</div>' +
    '<div class="combo-result">→ ' + esc(comboFeatureText(c.features[0] || '', state.lang)) +
      (c.templates && c.templates.length ? ' <span class="txt-muted">(' + c.templates.map(esc).join(', ') + ')</span>' : '') + '</div>' +
    '<div class="combo-foot"><div class="combo-flags">' + badges + '</div>' +
      '<span class="mono combo-mana">' + esc(manaText(c, t)) + '</span>' +
      '<a class="combo-link" href="' + spellbookUrl(c) + '" target="_blank" rel="noopener noreferrer">' + esc(t.comboSteps) + ' ↗</a></div></li>';
}

function stats(list, t) {
  const count = (fn) => list.filter(fn).length;
  const uses = new Map();
  for (const c of list) for (const n of c.cards) uses.set(n, (uses.get(n) || 0) + 1);
  const anchor = [...uses].sort((a, b) => b[1] - a[1])[0];
  const fastest = list.filter(c => typeof c.deploy === 'number' && (c.infinite || c.win)).sort((a, b) => a.deploy - b.deploy)[0];
  const tile = (lbl, val, sub) => '<div class="panel stat-tile"><div class="tile-label">' + esc(lbl) + '</div>' +
    '<div class="mono stat-value">' + val + '</div>' + (sub ? '<div class="note-sm combo-tile-sub">' + esc(sub) + '</div>' : '') + '</div>';
  return '<div class="combo-stats">' +
    tile(t.csTotal, list.length, t.csInf.replace('%v', count(c => c.infinite))) +
    tile(t.csTwo, count(c => c.cardsToFind <= 2), t.csWin.replace('%v', count(c => c.win))) +
    tile(t.csFastest, fastest ? fastest.deploy : '—', fastest ? fastest.cards.join(' + ') : t.csNoFast) +
    tile(t.csAnchor, anchor ? anchor[1] : '—', anchor ? anchor[0] : '') +
    '</div>';
}

function tagLegend(t) {
  return '<details class="br-legend"><summary>' + esc(t.tagLegendT) + '</summary>' +
    '<ul class="tag-legend">' + Object.keys(COMBO_TAGS).map(k =>
      '<li>' + tagChip(k, t) + ' <span class="note-sm">' + esc(t['tag_' + k]) + '</span></li>').join('') + '</ul>' +
    '<p class="note-sm">' + esc(t.tagSource) + '</p></details>';
}

export function renderCombos() {
  const t = T(), cd = state.combosData, root = $('combos');
  const isFile = location.protocol === 'file:';
  const head = '<div class="row-between"><h3 class="secT">' + esc(t.combosT) + '</h3>' +
    (cd && cd.updated ? '<span class="note-sm">' + esc(t.comboDbDate) + ' ' + esc(cd.updated.slice(0, 10)) + '</span>' : '') + '</div>';
  if (!cd || cd.status === 'error') {
    root.innerHTML = '<div class="panel panel-pad-lg">' + head +
      (isFile ? '<div class="note-warn">' + t.fileProto + '</div>' : '') +
      (cd ? '<div class="note-bad">' + t.comboErr + '</div>' : '') +
      (isFile ? '' : '<div class="combo-row"><button id="comboRetry" class="btn-accent-sm">' + t.comboRetry + '</button></div>') + '</div>';
    const b = $('comboRetry'); if (b) b.onclick = checkCombos;
    return;
  }
  if (cd.status === 'checking') {
    root.innerHTML = '<div class="panel panel-pad-lg">' + head + '<div class="note-muted">' + t.comboChecking + '</div></div>';
    return;
  }
  const all = state.result.bracket.combos;
  if (!all.length) {
    root.innerHTML = '<div class="panel panel-pad-lg">' + head + '<div class="note-ok">✓ ' + t.comboNoneAny + '</div>' + tagLegend(t) + '</div>';
    return;
  }

  // the tag chips double as the deck's distribution and as filters
  const tagBtn = (k, n) => '<button type="button" class="combo-filter' + (state.comboFilter === 'tag:' + k ? ' on' : '') +
    '" data-combof="tag:' + k + '" aria-pressed="' + (state.comboFilter === 'tag:' + k) + '">' +
    '<span class="mono">' + esc(k === 'B' ? t.brIllegal : 'B' + COMBO_TAGS[k].bracket) + '</span> ' + esc(COMBO_TAGS[k].name) + ' <b class="mono">' + n + '</b></button>';
  const tagBar = Object.keys(COMBO_TAGS).map(k => [k, all.filter(c => c.tag === k).length]).filter(([, n]) => n)
    .map(([k, n]) => tagBtn(k, n)).join('');
  const catBar = FILTERS.map(([k, fn]) => [k, all.filter(fn).length]).filter(([k, n]) => k === 'all' || n)
    .map(([k, n]) => '<button type="button" class="combo-filter' + (state.comboFilter === k ? ' on' : '') +
      '" data-combof="' + k + '" aria-pressed="' + (state.comboFilter === k) + '">' + esc(t['cf_' + k]) + ' <b class="mono">' + n + '</b></button>').join('');

  const f = state.comboFilter;
  const shown = f.startsWith('tag:') ? all.filter(c => c.tag === f.slice(4))
    : all.filter((FILTERS.find(([k]) => k === f) || FILTERS[0])[1]);
  const visible = state.comboAll ? shown : shown.slice(0, PAGE);
  const front = new Map(state.result.cardsInfo.map(({ card }) => [String(card.name).split(' // ')[0], card]));
  const imgOf = (n) => (front.get(n) || {}).img_normal || '';

  root.innerHTML = '<div class="panel panel-pad-lg">' + head + stats(all, t) +
    '<div class="combo-filters" role="group" aria-label="' + esc(t.comboFilterAria) + '">' + catBar + '</div>' +
    '<div class="combo-filters" role="group" aria-label="' + esc(t.comboFilterTagAria) + '">' + tagBar + '</div>' +
    '<ul class="combo-list">' + (visible.map(c => comboRow(c, t, imgOf)).join('') ||
      '<li class="note-muted">' + esc(t.comboNoMatch) + '</li>') + '</ul>' +
    (shown.length > PAGE && !state.comboAll
      ? '<button type="button" id="comboMore" class="btn-ghost">' + esc(t.comboMore.replace('%v', shown.length)) + '</button>' : '') +
    tagLegend(t) + '</div>';

  for (const b of root.querySelectorAll('[data-combof]')) b.onclick = () => {
    state.comboFilter = state.comboFilter === b.dataset.combof ? 'all' : b.dataset.combof;
    state.comboAll = false;
    renderCombos();
  };
  const more = $('comboMore');
  if (more) more.onclick = () => { state.comboAll = true; renderCombos(); };
  for (const el of root.querySelectorAll('.combo-card[data-img]')) bindCardTilePopover(el, () => el.dataset.img);
}
