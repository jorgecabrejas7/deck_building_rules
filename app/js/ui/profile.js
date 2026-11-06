import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH } from './constants.js';
import { $, esc, fill } from './helpers.js';
import { renderPod } from './pod.js';
import { RULES } from '../rules.js';
import { readingHtml } from './verdict.js';
import { cardList, fold, paint, tableWrap } from './reading.js';

// The power level: how strong the deck is, measured against the 36 precons, the pod's
// decks and public cEDH lists (data/deck_study.json). It is its own reading and never
// decides the pod (engine/powerLevel.js). One story: the answer, the four values it is
// built from, and what is behind each value on demand.
const BANDS = [[5, 'casual'], [6.5, 'upgraded'], [7.6, 'mid'], [9, 'high'], [Infinity, 'cedh']];
const powerBand = (score) => BANDS.find(([top]) => score < top)[1];
const GROUPS = ['precon', 'pod', 'cedh'];
const LEVEL = { F: 1, C: 2, B: 3, A: 4, S: 5 };

let studyRequested = false;
export function loadStudy() {
  if (studyRequested) return;
  studyRequested = true;
  fetch('../data/deck_study.json')
    .then(r => { if (!r.ok) throw new Error('deck_study ' + r.status); return r.json(); })
    .then(d => {
      state.study = d;
      if (state.tab === 'informe' && state.result) renderProfile();
      if (state.tab === 'pod') renderPod();
    })
    .catch(e => console.warn('deck study unavailable', e));
}

const med = (group, key) => {
  const v = state.study && state.study.medians[group] && state.study.medians[group][key];
  return typeof v === 'number' ? v : null;
};
export const studyMedian = med;
const isNone = (v) => v === null || v === undefined;
const show = (v) => (isNone(v) ? '—' : String(v));
const facts = (list) => '<ul class="rd-facts">' + list.map(([v, label]) => '<li><b>' + v + '</b> ' + esc(label) + '</li>').join('') + '</ul>';
const archName = (key) => (ARCH.find(x => x.k === key) || { name: { [state.lang]: key } }).name[state.lang];

const WEIGHT = { wins: 40, interaction: 25, salt: 15, synergy: 20 };

function head(r, t) {
  const { level } = r;
  return '<header class="pw-head"><p class="sum-label">' + esc(t.pfPracticalLabel) + '</p>' +
    '<h3 class="sum-bracket">' + (level.pending ? '…' : esc(level.bracket)) + '<small>' + esc(fill(t.pfScore, { v: level.score })) + ' · ' + esc(t['band_' + powerBand(level.score)]) + '</small></h3>' +
    (level.pending ? '<p class="sum-read">' + esc(t.vPending) + '</p>' : readingHtml(r, t)) +
    '<p class="sum-note">' + esc(t.pfApart) + '</p></header>';
}

// The whole scale drawn once: each bracket's span, this deck, and where the reference groups sit.
function ladder(r, t) {
  const steps = RULES.power_brackets.brackets;
  const x = (v) => ((v - 1) / 9 * 100).toFixed(1) + '%';
  const seg = steps.map(([top, label], i) => {
    const from = i ? steps[i - 1][0] : 1;
    return '<li data-step="' + i + '" style="left:' + x(from) + ';width:calc(' + x(top) + ' - ' + x(from) + ')"' + (label === r.level.powerBracket ? ' class="on"' : '') + '><span>' + esc(label) + '</span></li>';
  }).join('');
  const refs = GROUPS.map(g => [t['pfRef_' + g], med(g, 'power')]).filter(([, m]) => m !== null)
    .map(([l, m]) => '<span class="pw-ref" style="left:' + x(m) + '"><i></i>' + esc(l) + ' ' + m + '</span>').join('');
  return '<section class="pw-sec"><h4>' + esc(t.pwLadderT) + '</h4><div class="pw-ladder">' +
    '<span class="pw-you" style="left:' + x(r.power.score) + '"><b>' + r.power.score + '</b>' + esc(t.pwYou) + '</span>' +
    '<ol class="pw-steps">' + seg + '</ol><div class="pw-refs">' + refs + '</div></div></section>';
}

// The arithmetic in the open: value, weight, what it adds, and how the sum becomes the score.
function how(r, t) {
  const { pillars, raw, upgraded, score } = r.power;
  return '<section class="pw-sec"><h4>' + esc(t.pwHowT) + '</h4><p class="sum-note">' + esc(t.pwHowX) + '</p>' +
    tableWrap('<thead><tr><th scope="col">' + esc(t.pwCol) + '</th><th scope="col">/100</th><th scope="col">' + esc(t.pwWeight) + '</th><th scope="col">' + esc(t.pwAdds) + '</th></tr></thead><tbody>' +
      Object.keys(pillars).map(k => '<tr><th scope="row">' + esc(t['pf_' + k]) + '</th><td>' + pillars[k] + '</td><td>' + WEIGHT[k] + '%</td><td class="rd-own">' + (pillars[k] * WEIGHT[k] / 100).toFixed(1) + '</td></tr>').join('') +
      '<tr class="pw-total"><th scope="row">' + esc(t.pwRaw) + '</th><td></td><td></td><td class="rd-own">' + raw + '</td></tr>' +
      '<tr class="pw-total"><th scope="row">' + esc(t.pwOnScale) + '</th><td></td><td></td><td class="rd-own">' + score + ' / 10</td></tr></tbody>') +
    (upgraded ? '<p class="sum-note">' + esc(t.pwLift) + '</p>' : '') + '</section>';
}

// Where this value sits among the medians, in words. Synergy's medians are all 0, hence the c > b guards.
function standing(v, k, t) {
  const [a, b, c] = GROUPS.map(g => med(g, 'pillar_' + k));
  if (b === null) return '';
  const key = Math.abs(v - b) <= 2 ? 'pod'
    : c > b && v >= c ? 'cedh'
    : v > b ? (c > b && v - b > (c - b) / 2 ? 'near' : 'above')
    : Math.abs(v - a) <= 2 ? 'precon'
    : v > a ? 'between' : 'below';
  return t['pfStand_' + key];
}

const bar = (label, v, own) => '<li class="rd-bar' + (own ? ' own' : '') + '" style="--v:' + Math.min(v, 100) + '">' +
  '<span class="rd-bar-l">' + esc(label) + '</span><span class="rd-bar-track" aria-hidden="true"><i></i></span>' +
  '<span class="rd-bar-n' + (own ? ' vh' : '') + '">' + Math.round(v) + '</span></li>';

// A player's reading of a measure: a word on a five-step scale, never a school grade.
// No reading isn't a failing one: a deck with no combo line has nothing to rate.
function level(b, t) {
  const none = b.values.every(v => isNone(v.value));
  const n = none ? 0 : LEVEL[b.tier];
  return '<span class="rd-level"><span class="rd-pips" aria-hidden="true">' +
    [1, 2, 3, 4, 5].map(i => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span>' +
    esc(none ? t.lvlNone : t['lvl_' + b.tier]) + '</span>';
}

function benchmark(b, t, cards) {
  return '<section class="rd-bm"><div class="rd-bm-head"><h5>' + esc(t['bm_' + b.key] || b.key) + '</h5>' + level(b, t) + '</div>' +
    '<p class="rd-q">' + esc(t['bmq_' + b.key] || '') + '</p>' +
    facts(b.values.map(v => [isNone(v.value) ? esc(t.lvlNone) : esc(v.value), t['pm_' + v.key] || v.key])) + cards + '</section>';
}

// Per value: what only makes sense beside its measures.
function winsExtra(r, t) {
  const w = r.profile.wins;
  return w.checked && w.ending ? '<p class="rd-text">' + esc(fill(t.pfWinsX, { e: w.ending, l: w.lines, t: w.twoCard, p: w.printed, f: show(w.fastest) })) + '</p>' : '';
}

function saltExtra(r, t) {
  const { salt } = r;
  if (!salt) return '';
  const pod = state.study ? state.study.decks.filter(d => d.group === 'pod').map(d => d.salt.total) : [];
  const rank = pod.length ? fill(t.pfSaltRank, { v: Math.round(pod.filter(x => x < salt.total).length / pod.length * 100) }) + '. ' : '';
  return '<p class="rd-text">' + esc(rank + fill(t.pfSaltX, { a: salt.average })) + '</p>';
}

function synergyExtra(r, t) {
  const s = r.synergy;
  if (s.status === 'loading') return '<p class="rd-text">' + esc(t.brChecking) + '</p>';
  if (s.status !== 'done') return '<p class="rd-text">' + esc(t.pfSynNone) + '</p>';
  return '<section class="rd-bm"><div class="rd-bm-head"><h5>' + esc(t.pfSynT) + '</h5><span class="rd-level">' + s.coverage + '%</span></div>' +
    '<p class="rd-q">' + esc(fill(t.pfSynX, { o: s.offPlan })) + '</p>' +
    cardList(s.carrying.map(c => c.name), { note: (n) => '+' + Math.round(s.carrying.find(c => c.name === n).s * 100) + '%' }) +
    '<a class="rd-link" href="https://edhrec.com/commanders/' + esc(s.slug) + '" target="_blank" rel="noopener noreferrer">EDHREC</a></section>';
}

function behind(k, r, t) {
  const salted = new Map((r.salt ? r.salt.top : []).map(c => [c.name, String(c.salt)]));
  const marks = r.power.benchmarks.filter(b => b.pillar === k).map(b =>
    benchmark(b, t, cardList(b.cards, { cap: 8, note: b.key === 'saltiness' ? (n) => salted.get(n) || '' : () => '' }))).join('');
  const extra = { wins: winsExtra, salt: saltExtra, synergy: synergyExtra }[k];
  return (extra ? extra(r, t) : '') + marks;
}

function value(k, r, t) {
  const v = r.power.pillars[k];
  // no combo check or salt ratings yet: the 0 behind this value isn't a reading
  const none = (k === 'wins' && !r.profile.wins.checked) || (k === 'salt' && !r.salt);
  const refs = GROUPS.map(g => [t['pfRef_' + g], med(g, 'pillar_' + k)]).filter(([, m]) => m !== null);
  return '<article class="rd-value" data-pillar="' + k + '"><div class="rd-value-read"><h4>' + esc(t['pf_' + k]) + '</h4>' +
    '<p class="rd-value-n">' + (none ? '—' : v) + '</p>' +
    '<p class="rd-value-stand">' + esc(none ? t.lvlNone : standing(v, k, t)) + '</p></div>' +
    '<ul class="rd-bars">' + bar(t.pfThisDeck, none ? 0 : v, true) + refs.map(([l, m]) => bar(l, m, false)).join('') + '</ul>' +
    '<div class="rd-behind">' + behind(k, r, t) + '</div></article>';
}

function shape(r, t) {
  const { power, profile: p } = r;
  const mark = (m) => m.key === 'arch' ? archName(m.arch) : m.key === 'typal' ? fill(t.fp_typal, { n: m.type }) : t['fp_' + m.key];
  const typal = p.shape.typal.type && p.shape.typal.share >= 25 ? fill(t.pfTypal, { n: p.shape.typal.type, s: p.shape.typal.share }) : '';
  return (power.fingerprint.length ? '<p class="rd-text rd-strong">' + power.fingerprint.map(m => esc(mark(m))).join(' · ') + '</p>' : '') +
    (p.shape.archetypes.length ? facts(p.shape.archetypes.map(a => [a.share + '%', archName(a.key)])) : '') +
    (typal ? '<p class="rd-text">' + esc(typal) + '</p>' : '') +
    (power.keyCards.length ? '<h5 class="rd-sub-t">' + esc(t.pfKeyCards) + '</h5>' +
      cardList(power.keyCards.map(c => c.name), { note: (n) => { const c = power.keyCards.find(x => x.name === n); return c.count > 1 ? '×' + c.count : ''; } }) : '');
}

// The deck beside each reference group, what sets it apart first: distance from the
// pod in units of the precon-to-cEDH span.
function comparison(r, t) {
  const p = r.profile;
  const rows = [
    ['game_changers', r.stats.game_changers || 0], ['tutors', p.consistency.tutors], ['draw', p.consistency.draw],
    ['fast_mana', p.speed.fastMana], ['ramp', p.speed.ramp], ['cheap_plays', p.speed.cheap], ['avg_mv', p.speed.avgMv],
    ['lands', p.manabase.lands], ['fetches', p.manabase.fetches], ['counters', p.interaction.counters],
    ['removal', p.interaction.removal], ['wipes', p.interaction.wipes], ['cheap_answers', p.interaction.cheapAnswers],
    ['stax', p.interaction.stax], ['ending_combos', p.wins.checked ? p.wins.ending : null],
    ['price', r.stats.total_price_eur],
  ];
  const off = ([k, v]) => {
    const pod = med('pod', k), span = Math.abs((med('cedh', k) ?? 0) - (med('precon', k) ?? 0)) || 1;
    return v === null || pod === null ? -1 : Math.abs(v - pod) / span;
  };
  const round = (k, v) => (v === null ? null : k === 'price' ? '€' + Math.round(v) : v);
  return tableWrap('<thead><tr><th></th><th scope="col">' + esc(t.pfThisDeck) + '</th>' +
    GROUPS.map(g => '<th scope="col">' + esc(t['pfRef_' + g]) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.slice().sort((a, b) => off(b) - off(a)).map(([k, v]) => '<tr><th scope="row">' + esc(t['pr_' + k]) + '</th><td class="rd-own">' + show(round(k, v)) + '</td>' +
      GROUPS.map(g => '<td>' + show(round(k, med(g, k))) + '</td>').join('') + '</tr>').join('') + '</tbody>');
}

export function renderProfile() {
  loadStudy();
  const t = T(), r = state.result;
  const { power, profile } = r;
  const top = profile.shape.archetypes[0];
  paint($('profile'), '<div class="panel rd pw">' + head(r, t) + ladder(r, t) + how(r, t) +
    '<div class="rd-values"><div class="rd-intro"><h3>' + esc(t.pwValuesT) + '</h3><p>' + esc(t.pfValuesX) + '</p></div>' +
      Object.keys(power.pillars).map(k => value(k, r, t)).join('') + '</div>' +
    '<div class="rd-folds">' +
      fold('shape', t.pfShapeT, top ? archName(top.key) : '', shape(r, t)) +
      fold('compare', t.pfCompareT, '', comparison(r, t)) +
    '</div>' +
    '<p class="rd-foot">' + esc(t.pfNote) + '</p></div>');
}
