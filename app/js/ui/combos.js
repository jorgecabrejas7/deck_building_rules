import { state } from '../state.js';
import { T } from '../i18n.js';
import { COMBO_TAGS } from '../engine/index.js';
import { comboFeatureText } from './constants.js';
import { $, esc, fill } from './helpers.js';
import { checkCombos } from '../pipeline.js';
import { ICON, answer, cardName, fold, paint } from './reading.js';

// Every combo says which bracket it belongs to. The tag is Commander Spellbook's
// own classification, so what the page calls "Bracket 4+" is what its editors do.
// Green stays reserved for the verdict: only tags that bear on Bracket 3 get a colour.
const TAG_TONE = { B: 'tone-bad', R: 'tone-bad', S: 'tone-warn', P: 'tone-neutral', O: 'tone-neutral', C: 'tone-neutral', E: 'tone-neutral' };
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

function comboRow(c, t) {
  const traits = [
    c.win && t.cfWin,
    c.cardsToFind <= 2 && (c.n > 2 ? t.cfTwoCmd : t.cfTwo),
    c.infinite && t.cfInf,
    isLock(c) && t.cfLock,
    c.prereq && t.cfBoard,
    c.mustCommand.length && t.cfCommander,
    c.fastPair && t.cfFastTip,
  ].filter(Boolean);
  return '<li>' + comboLine(c) + '<div class="rd-line-foot">' +
    '<span class="rd-traits">' + esc(traits.join(' · ')) + '</span>' +
    '<a class="rd-link" href="' + spellbookUrl(c) + '" target="_blank" rel="noopener noreferrer">' + esc(t.comboSteps) + ICON.open + '</a></div></li>';
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
  if (!all.length) return paint(root, shell('0', esc(t.comboNoneAny), '<div class="rd-folds">' + tagLegend(t) + '</div>' + dbDate));

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
    '<ul class="rd-lines rd-combo-list" id="comboList" tabindex="-1">' + (visible.map(c => comboRow(c, t)).join('') ||
      '<li class="rd-q">' + esc(t.comboNoMatch) + '</li>') + '</ul>' +
    (shown.length > PAGE && !state.comboAll
      ? '<button type="button" id="comboMore" class="rd-btn">' + esc(t.comboMore.replace('%v', shown.length)) + '</button>' : '') +
    '<div class="rd-folds">' + tagLegend(t) + '</div>' + dbDate,
    why(all, t) ? '<p class="rd-why">' + esc(why(all, t)) + '</p>' : ''));

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
