import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH } from './constants.js';
import { drawOdds } from '../engine/index.js';
import { $, esc, fill } from './helpers.js';
import { renderPod } from './pod.js';
import { answer, cardList, fold, paint, tableWrap } from './reading.js';

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
const isNone = (v) => v === null || v === undefined;
const show = (v) => (isNone(v) ? '—' : String(v));
const facts = (list) => '<ul class="rd-facts">' + list.map(([v, label]) => '<li><b>' + v + '</b> ' + esc(label) + '</li>').join('') + '</ul>';
const archName = (key) => (ARCH.find(x => x.k === key) || { name: { [state.lang]: key } }).name[state.lang];

// Why the score sits where it does: which values pull away from the pod's median.
function why(r, t) {
  const { pillars, upgraded } = r.power;
  const names = (keys) => new Intl.ListFormat(state.lang).format(keys.map(k => t['pf_' + k].toLocaleLowerCase(state.lang)));
  const lead = () => {
    if (!state.study) return '';
    const gap = (k) => pillars[k] - med('pod', 'pillar_' + k);
    const up = Object.keys(pillars).filter(k => gap(k) > 5), down = Object.keys(pillars).filter(k => gap(k) < -5);
    return up.length && down.length ? fill(t.pfWhyBoth, { a: names(up), b: names(down) })
      : up.length ? fill(t.pfWhyUp, { a: names(up) })
      : down.length ? fill(t.pfWhyDown, { b: names(down) }) : t.pfWhyEven;
  };
  return [lead(), upgraded ? t.pfWhyLift : ''].filter(Boolean).join(' ');
}

// A card or combo sets the bracket here, so the score and the bracket disagree on purpose.
function floorNote(r, t) {
  const f = r.level.floor;
  if (!f || r.level.bracket === r.level.powerBracket) return '';
  return '<div class="rd-floor"><p class="rd-floor-t">' + esc(fill(t['vWhyFloor_' + f.reason], { c: (f.reason === 'mld' ? f.mld : f.combos).join(', ') })) + '</p>' +
    '<p>' + esc(fill(t.pfFloorX, { b: r.level.powerBracket })) + '</p></div>';
}

function head(r, t) {
  const { level, power } = r;
  const sub = level.pending ? esc(t.vPending)
    : esc(fill(t.pfScore, { v: level.score })) + ' · ' + esc(t['band_' + powerBand(power.score)]);
  return answer({ label: t.pfPracticalLabel, value: level.pending ? '…' : level.bracket, sub,
    body: (level.precon ? '<div class="rd-floor"><p class="rd-floor-t">' + esc(fill(t.pfPrecon, { c: level.precon.name })) + '</p></div>' : '') + floorNote(r, t) +
      (r.bracket.landMaybe.length ? '<p class="rd-flag">' + esc(fill(t.landMaybe, { c: r.bracket.landMaybe.map(n => n.split(' // ')[0]).join(', ') })) + '</p>' : '') +
      (level.pending ? '' : '<p class="rd-why">' + esc(why(r, t)) + '</p>') +
      '<p class="rd-apart">' + esc(t.pfApart) + '</p>' });
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
    benchmark(b, t, cardList(b.cards, b.key === 'saltiness' ? { note: (n) => salted.get(n) || '' } : undefined))).join('');
  const extra = { wins: winsExtra, salt: saltExtra, synergy: synergyExtra }[k];
  return (extra ? extra(r, t) : '') + marks;
}

function value(k, r, t) {
  const v = r.power.pillars[k];
  // no combo check or salt ratings yet: the 0 behind this value isn't a reading
  const none = (k === 'wins' && !r.profile.wins.checked) || (k === 'salt' && !r.salt);
  const refs = GROUPS.map(g => [t['pfRef_' + g], med(g, 'pillar_' + k)]).filter(([, m]) => m !== null);
  return '<article class="rd-value"><div class="rd-value-read"><h4>' + esc(t['pf_' + k]) + '</h4>' +
    '<p class="rd-value-n">' + (none ? '—' : v) + '</p>' +
    '<p class="rd-value-stand">' + esc(none ? t.lvlNone : standing(v, k, t)) + '</p></div>' +
    '<ul class="rd-bars">' + bar(t.pfThisDeck, none ? 0 : v, true) + refs.map(([l, m]) => bar(l, m, false)).join('') + '</ul>' +
    fold('value:' + k, t.pfBehind, '', behind(k, r, t)) + '</article>';
}

// Mana by turn: one series over time, every column labelled, so it is its own text equivalent.
function manaChart(g, t) {
  const turns = [1, 2, 3, 4, 5, 6, 8, 10];
  const top = Math.max(...turns.map(n => g.mana[n - 1]), 1);
  return '<h5 class="rd-sub-t">' + esc(t.gfManaT) + '</h5><ol class="rd-cols">' + turns.map(n =>
    '<li style="--h:' + Math.round(g.mana[n - 1] / top * 100) + '"><b>' + g.mana[n - 1] + '</b><span class="rd-col" aria-hidden="true"></span>' +
    '<span class="rd-col-l"><span class="vh">' + esc(t.gfTurn) + ' </span>T' + n + '</span></li>').join('') + '</ol>';
}

// Unscored context, all in one calm place: tempo with nobody interfering, the odds of
// seeing each role, and the measures that describe the deck without counting for power.
function context(r, t) {
  const g = r.profile.goldfish, L = r.profile.ledger;
  const deck = r.stats.total_cards - r.commanders.length;
  const lead = [g.commanderTurn !== null ? fill(t.gfCommander, { v: g.commanderTurn }) : '',
    g.winBy ? (g.winTurn !== null ? fill(t.gfWin, { v: g.winTurn }) : t.gfNoWin) + ' ' + fill(t.gfWinBy, { a: g.winBy[6], b: g.winBy[8], c: g.winBy[10] }) : ''].filter(Boolean).join(' ');
  const roles = [['pr_ramp', L.ramp], ['pr_draw', L.draw], ['pr_tutors', L.tutors], ['pr_cheap_answers', L.cheapAnswers]];
  const odds = tableWrap('<thead><tr><th></th>' + [2, 4, 6, 8].map(n => '<th scope="col">T' + n + '</th>').join('') + '</tr></thead><tbody>' +
    // seven in hand plus one a turn after the first
    roles.map(([label, cards]) => '<tr><th scope="row">' + esc(t[label]) + ' <span class="rd-dim">' + cards.length + '</span></th>' +
      [2, 4, 6, 8].map(turn => '<td>' + Math.round(drawOdds(deck, cards.length, 6 + turn) * 100) + '%</td>').join('') + '</tr>').join('') + '</tbody>');
  const marks = r.power.benchmarks.filter(b => !b.scored).map(b => benchmark(b, t, cardList(b.cards, { cap: 0 }))).join('');
  return '<p class="rd-text rd-strong">' + esc(t.pfNotScored) + '</p>' +
    (lead ? '<p class="rd-text">' + esc(lead) + '</p>' : '') + manaChart(g, t) +
    '<p class="rd-q">' + esc(fill(t.gfX, { n: g.games })) + '</p>' +
    '<h5 class="rd-sub-t">' + esc(t.gfOddsT) + '</h5>' + odds + marks;
}

function manabase(m, t) {
  const rows = m.colors.map(c => '<tr><th scope="row"><span class="rd-pip" data-c="' + esc(c.color) + '" aria-hidden="true"></span>' + esc(c.color) + '</th>' +
    '<td>' + Math.round(c.share * 100) + '%</td><td>' + c.sources + ' / ' + c.target +
    (c.color === m.weakest && c.cover < 1 ? ' <span class="rd-short">' + esc(t.pfShort) + '</span>' : '') + '</td>' +
    '<td class="rd-cover" aria-hidden="true" style="--v:' + Math.round(Math.min(c.cover, 1) * 100) + '"><span class="rd-bar-track"><i></i></span></td></tr>').join('');
  return '<p class="rd-text">' + esc(fill(t.pfManaX, { f: m.fixing, q: m.quality, c: m.curve })) + '</p>' +
    '<p class="rd-text">' + esc(fill(t.pfManaLands, { l: m.lands, b: m.basics, t: m.tapped, e: m.fetches })) + '</p>' +
    (rows ? tableWrap('<thead><tr><th></th><th scope="col">' + esc(t.pfPips) + '</th><th scope="col">' + esc(t.pfSources) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody>') : '');
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
  const g = profile.goldfish, top = profile.shape.archetypes[0];
  paint($('profile'), '<div class="panel rd">' + head(r, t) +
    '<div class="rd-values"><div class="rd-intro"><h3>' + esc(t.pfValuesT) + '</h3><p>' + esc(t.pfValuesX) + '</p></div>' +
      Object.keys(power.pillars).map(k => value(k, r, t)).join('') + '</div>' +
    '<div class="rd-folds">' +
      fold('context', t.pf_tempo, g.commanderTurn !== null ? fill(t.gfAside, { v: g.commanderTurn }) : '', context(r, t)) +
      fold('mana', t.pfManaT, fill(t.pfManaAside, { v: profile.manabase.score }), manabase(profile.manabase, t)) +
      fold('shape', t.pfShapeT, top ? archName(top.key) : '', shape(r, t)) +
      fold('compare', t.pfCompareT, '', comparison(r, t)) +
    '</div>' +
    '<p class="rd-foot">' + esc(t.pfNote) + '</p></div>');
}
