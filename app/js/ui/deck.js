import { cardValues } from '../engine/index.js';
import { state } from '../state.js';
import { T } from '../i18n.js';
import { TYPES, TYPE_ORDER } from './constants.js';
import { $, esc, eur, fill } from './helpers.js';
import { ICON } from './reading.js';

// The whole deck, weakest to strongest at a glance. The list stays on the left and the card
// you pick opens beside it (on a phone, in a sheet), so reading one never loses your place.
const LEVELS = [5, 4, 3, 2, 1];
const JOB_ORDER = ['fastMana', 'tutors', 'finishers', 'draw', 'ramp', 'answersTotal', 'engine', 'protection', 'recursion', 'stax'];
const short = (name) => String(name).split(' // ')[0];
const pips = (n) => '<span class="rd-pips" aria-hidden="true">' + LEVELS.slice().reverse().map(i => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span>';
const manaText = (card) => (card.mana_cost || '').replace(/[{}]/g, '');

function values() {
  const r = state.result;
  return cardValues({ cardsInfo: r.cardsInfo, commanders: r.commanders, ledger: r.profile.ledger,
    combos: r.bracket.pending ? null : r.bracket.combos, table: state.synergyData && state.synergyData.table, whatIf: r.whatIf });
}

function groupsOf(list, t) {
  const { group } = state.deckView, lang = state.lang;
  if (group === 'value') return LEVELS.map(l => [t['dkLevel_' + l], list.filter(c => c.level === l)]);
  if (group === 'type') return TYPE_ORDER.map(k => [TYPES[k][lang], list.filter(c => c.x.cls.type === k)]);
  const isLand = (c) => c.x.cls.type === 'L';
  return [...JOB_ORDER.map(k => [t['dkJob_' + k], list.filter(c => !isLand(c) && c.jobs[0] === k)]),
    [t.dkNoJob, list.filter(c => !isLand(c) && !c.jobs.length)], [t.dkLand, list.filter(isLand)]];
}

function pointChip(c, t) {
  if (!c.points) return '';
  return '<span class="dk-points">' + esc(c.points.saves ? fill(t.dkSavesShort, { v: c.points.saves }) : t.dkFixesShort) + '</span>';
}

function row(c, t) {
  const sub = [manaText(c.x.card), ...c.jobs.slice(0, 2).map(j => t['dkJob_' + j])].filter(Boolean).join(' · ');
  return '<li><button type="button" class="dk-row" data-card="' + esc(c.name) + '" aria-pressed="false">' +
    '<img src="' + esc(c.x.card.img_art || '') + '" loading="lazy" alt="">' +
    '<span class="dk-main"><span class="dk-name">' + esc(short(c.name)) + (c.x.qty > 1 ? ' <small>×' + c.x.qty + '</small>' : '') + '</span>' +
    '<span class="dk-sub">' + esc(sub) + '</span></span>' + pointChip(c, t) +
    '<span class="dk-level" title="' + esc(t['dkLevel_' + c.level]) + '">' + pips(c.level) + '<span class="vh">' + esc(t['dkLevel_' + c.level]) + '</span></span>' +
    '</button></li>';
}

const reasonText = (r, t) => fill(t['dkR_' + r.k], { n: r.n, s: r.s, i: r.seenIn });

function inspector(c, t) {
  const { card } = c.x, r = state.result;
  const salt = state.saltDb && state.saltDb.salt && c.x.cls.type !== 'L' && state.saltDb.salt[short(c.name)];
  const reasons = (c.commander ? [{ k: 'commander' }] : []).concat(c.reasons);
  const pts = c.points ? (c.points.fixes ? t.dkFixes : fill(t.dkSaves, { v: c.points.saves })) : t.dkFree;
  const fact = (k, v) => '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>';
  return '<button type="button" class="dk-close" aria-label="' + esc(t.dkClose) + '">' + ICON.cross + '</button>' +
    (card.img_normal ? '<img class="dk-art" src="' + esc(card.img_normal) + '" alt="' + esc(short(c.name)) + '">' : '') +
    '<h3 class="dk-i-name">' + esc(short(c.name)) + '</h3>' +
    '<p class="dk-i-level">' + pips(c.level) + ' ' + esc(c.commander ? t.dkCommander : t['dkLevel_' + c.level]) + '</p>' +
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

export function renderDeck() {
  const t = T(), dv = state.deckView, all = values();
  const match = (c) => (!dv.level || c.level === dv.level) && (!dv.q || short(c.name).toLowerCase().includes(dv.q.toLowerCase()));
  const count = (l) => all.filter(c => c.level === l).reduce((s, c) => s + c.x.qty, 0);
  const levelBtn = (l, label, n) => '<button type="button" class="rd-filter" data-level="' + l + '" aria-pressed="' + ((dv.level || 0) === l) + '">' + esc(label) + ' <b>' + n + '</b></button>';
  const seg = (k, label) => '<button type="button" data-group="' + k + '" class="' + (dv.group === k ? 'active' : '') + '" aria-pressed="' + (dv.group === k) + '">' + esc(label) + '</button>';
  const hint = note(t);
  $('view-deck').innerHTML = '<div class="part-head"><div><h2 class="part-title">' + esc(t.dkT) + '</h2><p class="part-sub">' + esc(t.dkX) + '</p></div></div>' +
    '<div class="dk-controls"><div class="rd-filter-bar">' + levelBtn(0, t.dkAll, all.reduce((s, c) => s + c.x.qty, 0)) + LEVELS.map(l => levelBtn(l, t['dkLevel_' + l], count(l))).join('') + '</div>' +
      '<div class="dk-tools"><input id="dkSearch" type="search" class="cmd-search" placeholder="' + esc(t.dkSearch) + '" aria-label="' + esc(t.dkSearch) + '" value="' + esc(dv.q) + '">' +
      '<div class="seg-toggle-sm" role="group" aria-label="' + esc(t.dkGroup) + '">' + seg('value', t.dkByValue) + seg('type', t.dkByType) + seg('job', t.dkByJob) + '</div></div>' +
      (hint ? '<p class="dk-note">' + esc(hint) + '</p>' : '') + '</div>' +
    '<div class="dk-body"><div id="dkList" class="dk-list"></div><aside id="dkInspect" class="dk-inspect panel" aria-live="polite"></aside></div>';

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
    const groups = groupsOf(all.filter(match), t).filter(([, list]) => list.length);
    $('dkList').innerHTML = groups.length ? groups.map(([label, list]) => '<section class="dk-group"><h3>' + esc(label) +
      ' <span>' + list.reduce((s, c) => s + c.x.qty, 0) + '</span></h3><ul>' + list.map(c => row(c, t)).join('') + '</ul></section>').join('')
      : '<p class="dk-note">' + esc(t.dkEmpty) + '</p>';
    for (const b of $('dkList').querySelectorAll('[data-card]')) b.onclick = () => inspect(b.dataset.card, true);
    const shown = all.filter(match);
    if (shown.length) inspect(shown.some(c => c.name === dv.card) ? dv.card : shown[0].name, dv.open);
  };
  paintList();

  $('dkSearch').oninput = (e) => { dv.q = e.target.value; paintList(); };
  for (const b of $('view-deck').querySelectorAll('[data-level]')) b.onclick = () => { dv.level = +b.dataset.level || null; renderDeck(); };
  for (const b of $('view-deck').querySelectorAll('[data-group]')) b.onclick = () => { dv.group = b.dataset.group; renderDeck(); };
}
