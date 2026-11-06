import { cardValues } from '../engine/index.js';
import { state, store } from '../state.js';
import { T } from '../i18n.js';
import { TYPES, TYPE_ORDER } from './constants.js';
import { $, esc, eur, fill } from './helpers.js';
import { ICON } from './reading.js';

// The whole deck, three ways of looking at it. The list stays put and the card you pick
// opens beside it (on a phone, in a sheet), so reading one never loses your place.
const LEVELS = [5, 4, 3, 2, 1];
const JOB_ORDER = ['fastMana', 'tutors', 'finishers', 'draw', 'ramp', 'answersTotal', 'engine', 'protection', 'recursion', 'stax'];
const MODES = [['list', 'dkModeList'], ['images', 'dkModeImages'], ['stacks', 'dkModeStacks']];
const SORTS = {
  value: { label: 'dkSortValue', by: (a, b) => b.commander - a.commander || b.score - a.score },
  mv: { label: 'dkSortMv', by: (a, b) => (a.x.card.cmc || 0) - (b.x.card.cmc || 0) },
  price: { label: 'dkSortPrice', by: (a, b) => (b.x.card.price || 0) - (a.x.card.price || 0) },
  name: { label: 'dkSortName', by: () => 0 },
  salt: { label: 'dkSortSalt', by: (a, b) => saltOf(b) - saltOf(a) },
  rank: { label: 'dkSortRank', by: (a, b) => (a.x.card.edhrec_rank || 1e9) - (b.x.card.edhrec_rank || 1e9) },
};
const GROUPS = [['value', 'dkByValue'], ['type', 'dkByType'], ['job', 'dkByJob'], ['mv', 'dkByMv'], ['color', 'dkByColor'], ['price', 'dkByPrice'], ['points', 'dkByPoints']];
const PRICE_BANDS = [[1, '< €1'], [5, '€1–5'], [10, '€5–10'], [20, '€10–20'], [30, '€20–30'], [Infinity, '> €30']];
const short = (name) => String(name).split(' // ')[0];
const pips = (n) => '<span class="rd-pips" data-lv="' + n + '" aria-hidden="true">' + LEVELS.slice().reverse().map(i => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span>';
const manaText = (card) => (card.mana_cost || '').replace(/[{}]/g, '');
const isLand = (c) => c.x.cls.type === 'L';
function saltOf(c) { return (state.saltDb && state.saltDb.salt && !isLand(c) && state.saltDb.salt[short(c.name)]) || 0; }

function values() {
  const r = state.result;
  return cardValues({ cardsInfo: r.cardsInfo, commanders: r.commanders, ledger: r.profile.ledger,
    combos: r.bracket.pending ? null : r.bracket.combos, table: state.synergyData && state.synergyData.table, whatIf: r.whatIf });
}

function groupsOf(list, t) {
  const lang = state.lang, split = (pairs) => pairs.map(([label, test]) => [label, list.filter(test)]);
  switch (state.deckView.group) {
    case 'value': return split(LEVELS.map(l => [t['dkLevel_' + l], c => c.level === l]));
    case 'type': return split(TYPE_ORDER.map(k => [TYPES[k][lang], c => c.x.cls.type === k]));
    case 'job': return split([...JOB_ORDER.map(k => [t['dkJob_' + k], c => !isLand(c) && c.jobs[0] === k]),
      [t.dkNoJob, c => !isLand(c) && !c.jobs.length], [t.dkLand, isLand]]);
    case 'mv': return split([...[0, 1, 2, 3, 4, 5, 6].map(v => [fill(t.dkMvN, { v }), c => !isLand(c) && (c.x.card.cmc || 0) === v]),
      [fill(t.dkMvN, { v: '7+' }), c => !isLand(c) && (c.x.card.cmc || 0) >= 7], [t.dkLand, isLand]]);
    case 'color': {
      const ci = (c) => c.x.card.color_identity || [];
      return split([...'WUBRG'].map(k => [t['dkColor_' + k], c => !isLand(c) && ci(c).length === 1 && ci(c)[0] === k]).concat([
        [t.dkMulti, c => !isLand(c) && ci(c).length > 1], [t.dkColorless, c => !isLand(c) && !ci(c).length], [t.dkLand, isLand]]));
    }
    case 'price': return split(PRICE_BANDS.map(([top, label], i) => [label, c => {
      const p = c.x.card.price || 0;
      return p < top && p >= (i ? PRICE_BANDS[i - 1][0] : 0);
    }]));
    default: return split([[t.dkCostsPts, c => !!c.points], [t.dkFreePts, c => !c.points]]);
  }
}

function pointChip(c, t) {
  if (!c.points) return '';
  return '<span class="dk-points">' + esc(c.points.saves ? fill(t.dkSavesShort, { v: c.points.saves }) : t.dkFixesShort) + '</span>';
}

const unusualChip = (c, t) => c.unusual ? '<span class="dk-unusual" title="' + esc(t.dkUnusualX) + '">' + esc(t.dkUnusual) + '</span>' : '';

const levelTag = (c, t) => '<span class="dk-level" title="' + esc(t['dkLevel_' + c.level]) + '">' + pips(c.level) + '<span class="vh">' + esc(t['dkLevel_' + c.level]) + '</span></span>';

function row(c, t) {
  const sub = [manaText(c.x.card), ...c.jobs.slice(0, 2).map(j => t['dkJob_' + j])].filter(Boolean).join(' · ');
  return '<li><button type="button" class="dk-row" data-card="' + esc(c.name) + '" aria-pressed="false">' +
    '<img src="' + esc(c.x.card.img_art || '') + '" loading="lazy" alt="">' +
    '<span class="dk-main"><span class="dk-name">' + esc(short(c.name)) + (c.x.qty > 1 ? ' <small>×' + c.x.qty + '</small>' : '') + '</span>' +
    '<span class="dk-sub">' + esc(sub) + '</span></span>' + unusualChip(c, t) + pointChip(c, t) + levelTag(c, t) + '</button></li>';
}

// One real card face: images and stacks only differ in how much of it the layout shows.
function face(c, t) {
  return '<li><button type="button" class="dk-face" data-card="' + esc(c.name) + '" aria-pressed="false" aria-label="' + esc(short(c.name) + ', ' + t['dkLevel_' + c.level] + (c.unusual ? ', ' + t.dkUnusual : '')) + '">' +
    '<img src="' + esc(c.x.card.img_normal || '') + '" loading="lazy" decoding="async" alt="">' +
    (c.x.qty > 1 ? '<span class="dk-qty">×' + c.x.qty + '</span>' : '') +
    '<span class="dk-face-foot">' + unusualChip(c, t) + pointChip(c, t) + levelTag(c, t) + '</span></button></li>';
}

const reasonText = (r, t) => fill(t['dkR_' + r.k], { n: r.n, s: r.s, i: r.seenIn });

function inspector(c, t) {
  const { card } = c.x, r = state.result, salt = saltOf(c);
  const reasons = (c.commander ? [{ k: 'commander' }] : []).concat(c.reasons);
  const pts = c.points ? (c.points.fixes ? t.dkFixes : fill(t.dkSaves, { v: c.points.saves })) : t.dkFree;
  const fact = (k, v) => '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>';
  return '<button type="button" class="dk-close" aria-label="' + esc(t.dkClose) + '">' + ICON.cross + '</button>' +
    (card.img_normal ? '<img class="dk-art" src="' + esc(card.img_normal) + '" alt="' + esc(short(c.name)) + '">' : '') +
    '<h3 class="dk-i-name">' + esc(short(c.name)) + '</h3>' +
    '<p class="dk-i-level">' + pips(c.level) + ' ' + esc(c.commander ? t.dkCommander : t['dkLevel_' + c.level]) + '</p>' +
    (c.unusual ? '<p class="dk-note">' + esc(t.dkUnusualX) + '</p>' : '') +
    (c.jobs.length ? '<h4>' + esc(t.dkDoes) + '</h4><ul class="dk-jobs">' + c.jobs.map(j => '<li>' + esc(t['dkJob_' + j]) + '</li>').join('') + '</ul>' : '') +
    (reasons.length ? '<h4>' + esc(t.dkWhy) + '</h4><ul class="dk-why">' + reasons.map(x => '<li>' + esc(reasonText(x, t)) + '</li>').join('') + '</ul>' : '') +
    '<dl class="dk-facts">' + fact(t.dkPtsCost, esc(pts)) +
      fact(t.dkPrice, card.price != null ? eur(card.price) : '—') +
      (salt ? fact(t.dkSalt, salt.toFixed(1)) : '') +
      (c.combos.length ? fact(t.dkCombos, '<a href="#combos" data-go="combos">' + c.combos.length + ' · ' + esc(t.dkSeeCombos) + ' →</a>') : '') + '</dl>' +
    (r.bracket.pending ? '<p class="dk-note">' + esc(t.dkCheckingCombos) + '</p>' : '');
}

function note(t) {
  const sd = state.synergyData;
  return sd && sd.loading ? t.dkLoading : sd && !sd.table ? t.dkNoData : '';
}

const select = (id, label, options, value) => '<label class="arch-field dk-select"><span>' + esc(label) + '</span><select id="' + id + '" class="arch-select">' +
  options.map(([k, text]) => '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + esc(text) + '</option>').join('') + '</select></label>';

// Re-rendering the whole view on a control change would drop the search box's focus and caret.
function morph(fn) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion:reduce)').matches) document.startViewTransition(fn);
  else fn();
}

export function renderDeck() {
  const t = T(), dv = state.deckView, all = values();
  const match = (c) => (!dv.level || c.level === dv.level) && (!dv.q || short(c.name).toLowerCase().includes(dv.q.toLowerCase()));
  const count = (l) => all.filter(c => c.level === l).reduce((s, c) => s + c.x.qty, 0);
  const levelBtn = (l, label, n) => '<button type="button" class="rd-filter" data-lv="' + l + '" data-level="' + l + '" aria-pressed="' + ((dv.level || 0) === l) + '">' + esc(label) + ' <b>' + n + '</b></button>';
  const seg = (k, label) => '<button type="button" data-mode="' + k + '" class="' + (dv.mode === k ? 'active' : '') + '" aria-pressed="' + (dv.mode === k) + '">' + esc(t[label]) + '</button>';
  const hint = note(t);
  $('view-deck').innerHTML = '<div class="part-head"><div><h2 class="part-title">' + esc(t.dkT) + '</h2><p class="part-sub">' + esc(t.dkX) + '</p></div></div>' +
    '<div class="dk-controls"><div class="rd-filter-bar">' + levelBtn(0, t.dkAll, all.reduce((s, c) => s + c.x.qty, 0)) + LEVELS.map(l => levelBtn(l, t['dkLevel_' + l], count(l))).join('') + '</div>' +
      '<div class="dk-tools"><input id="dkSearch" type="search" class="cmd-search" placeholder="' + esc(t.dkSearch) + '" aria-label="' + esc(t.dkSearch) + '" value="' + esc(dv.q) + '">' +
      select('dkGroup', t.dkGroup, GROUPS.map(([k, l]) => [k, t[l]]), dv.group) +
      select('dkSort', t.dkSort, Object.entries(SORTS).map(([k, s]) => [k, t[s.label]]), dv.sort) +
      '<div class="seg-toggle-sm" role="group" aria-label="' + esc(t.dkView) + '">' + MODES.map(([k, l]) => seg(k, l)).join('') + '</div></div>' +
      (hint ? '<p class="dk-note">' + esc(hint) + '</p>' : '') + '</div>' +
    '<div class="dk-body"><div id="dkList" class="dk-list dk-mode-' + dv.mode + '"></div><aside id="dkInspect" class="dk-inspect panel" aria-live="polite"></aside></div>';

  const inspect = (name, opened) => {
    const c = all.find(x => x.name === name);
    const el = $('dkInspect');
    if (!c) { el.innerHTML = ''; return; }
    dv.card = name; dv.open = opened;
    el.innerHTML = inspector(c, t);
    el.classList.toggle('open', opened);
    for (const b of $('dkList').querySelectorAll('[data-card]')) b.setAttribute('aria-pressed', String(b.dataset.card === name));
    const close = el.querySelector('.dk-close');
    close.onclick = () => {
      dv.open = false; el.classList.remove('open');
      const back = $('dkList').querySelector('[aria-pressed=true]');
      if (back) back.focus({ preventScroll: true });
    };
    // the close button only shows on a phone, where the sheet takes over the screen
    if (opened && close.offsetParent) close.focus({ preventScroll: true });
  };

  const paintList = () => {
    const sorter = (a, b) => SORTS[dv.sort].by(a, b) || a.name.localeCompare(b.name);
    const shown = all.filter(match);
    const groups = groupsOf(shown, t).filter(([, list]) => list.length);
    const item = dv.mode === 'list' ? row : face;
    $('dkList').innerHTML = groups.length ? groups.map(([label, list]) => '<section class="dk-group"><h3>' + esc(label) +
      ' <span>' + list.reduce((s, c) => s + c.x.qty, 0) + '</span></h3><ul>' + list.sort(sorter).map(c => item(c, t)).join('') + '</ul></section>').join('')
      : '<p class="dk-note">' + esc(t.dkEmpty) + '</p>';
    for (const b of $('dkList').querySelectorAll('[data-card]')) {
      b.onclick = () => inspect(b.dataset.card, true);
      // with images on screen the inspector follows the pointer, so hovering reads the card
      if (dv.mode !== 'list') b.onmouseenter = () => { if (matchMedia('(hover:hover)').matches) inspect(b.dataset.card, false); };
    }
    if (shown.length) inspect(shown.some(c => c.name === dv.card) ? dv.card : shown[0].name, dv.open);
  };
  paintList();

  $('dkSearch').oninput = (e) => { dv.q = e.target.value; paintList(); };
  for (const b of $('view-deck').querySelectorAll('[data-level]')) b.onclick = () => { dv.level = +b.dataset.level || null; morph(renderDeck); };
  for (const b of $('view-deck').querySelectorAll('[data-mode]')) b.onclick = () => { dv.mode = b.dataset.mode; store.deckMode = dv.mode; morph(renderDeck); };
  $('dkGroup').onchange = (e) => { dv.group = e.target.value; morph(renderDeck); };
  $('dkSort').onchange = (e) => { dv.sort = e.target.value; morph(renderDeck); };
}
