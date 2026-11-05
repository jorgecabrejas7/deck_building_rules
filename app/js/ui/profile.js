import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH } from './constants.js';
import { drawOdds } from '../engine/index.js';
import { $, esc, fill } from './helpers.js';
import { renderPod } from './pod.js';

// The evidence behind the verdict: what the deck does, measured against the 36
// precons, the pod's decks and public cEDH lists (data/deck_study.json). Its
// this is its own reading and never decides the pod (engine/powerLevel.js).
const BANDS = [[5, 'casual'], [6.5, 'upgraded'], [7.6, 'mid'], [9, 'high'], [Infinity, 'cedh']];
export const powerBand = (score) => BANDS.find(([top]) => score < top)[1];

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
const show = (v) => (v === null || v === undefined ? '—' : String(v));

function tile(label, value, sub) {
  return '<div class="panel stat-tile"><div class="tile-label">' + esc(label) + '</div>' +
    '<div class="mono stat-value">' + value + '</div>' +
    (sub ? '<div class="note-sm combo-tile-sub">' + esc(sub) + '</div>' : '') + '</div>';
}

// One thin bar per pillar with the three reference medians as labelled ticks. Every
// value is also printed in the comparison table below, so nothing relies on the bar.
function pillars(power, t) {
  const tick = (group, cls, key) => {
    const v = med(group, 'pillar_' + key);
    return v === null ? '' : '<span class="pl-tick ' + cls + '" style="--x:' + Math.min(v, 100) + '%" title="' +
      esc(t['pfRef_' + group] + ': ' + v) + '"></span>';
  };
  return '<div class="pl-rows">' + Object.keys(power.pillars).map(k =>
    '<div class="pl-row"><span class="pl-name">' + esc(t['pf_' + k] || k) + '</span>' +
    '<div class="pl-track" aria-hidden="true"><div class="pl-fill" style="--w:' + power.pillars[k] + '%"></div>' +
    tick('precon', 'a', k) + tick('pod', 'b', k) + tick('cedh', 'c', k) + '</div>' +
    '<span class="mono pl-val">' + power.pillars[k] + '</span></div>').join('') + '</div>' +
    (state.study ? '<div class="pl-legend note-sm">' +
      '<span><i class="pl-key a"></i>' + esc(t.pfRef_precon) + '</span>' +
      '<span><i class="pl-key b"></i>' + esc(t.pfRef_pod) + '</span>' +
      '<span><i class="pl-key c"></i>' + esc(t.pfRef_cedh) + '</span></div>' : '');
}

// When a card or combo sets the bracket, say which: the score alone would not explain it.
function floorNote(r, t) {
  const f = r.level.floor;
  if (!f) return '';
  return '<p class="note-sm"><b>' + esc(fill(t['vWhyFloor_' + f.reason], { c: (f.reason === 'mld' ? f.mld : f.combos).join(', ') })) + '</b> ' +
    esc(fill(t.vPowerOnly, { v: r.level.score })) + '</p>';
}

function fingerprint(power, t) {
  const label = (m) => m.key === 'arch' ? esc((ARCH.find(x => x.k === m.arch) || { name: { [state.lang]: m.arch } }).name[state.lang])
    : m.key === 'typal' ? esc(t.fp_typal.replace('%n', m.type)) : esc(t['fp_' + m.key]);
  return power.fingerprint.length ? '<div class="combo-flags pf-print">' +
    power.fingerprint.map(m => '<span class="combo-flag soft">' + label(m) + '</span>').join('') + '</div>' : '';
}

// Each benchmark opens to the question it answers and the cards behind its tier.
function benchmarks(power, t) {
  const groups = [...new Set(power.benchmarks.map(b => b.pillar))];
  // no reading isn't a failing grade: a deck with no combo line has nothing to rate
  const grade = (b) => (b.values.every(v => v.value === null || v.value === undefined) ? '—' : b.tier);
  const row = (b) => '<details class="bm"><summary><span class="bm-tier mono t-' + grade(b) + '">' + grade(b) + '</span>' +
    '<span class="bm-name">' + esc(t['bm_' + b.key] || b.key) + '</span>' +
    '<span class="bm-vals note-sm">' + b.values.map(v => esc(t['pm_' + v.key] || v.key) + ' <b class="mono">' + show(v.value) + '</b>').join(' · ') + '</span></summary>' +
    '<p class="note-sm">' + esc(t['bmq_' + b.key] || '') + '</p>' +
    (b.cards.length ? '<p class="bm-cards">' + b.cards.map(esc).join(', ') + '</p>' : '') + '</details>';
  return '<div class="bm-groups">' + groups.map(g =>
    '<div class="bm-group"><h3 class="mini-title">' + esc(t['pf_' + g] || g) + '</h3>' +
    power.benchmarks.filter(b => b.pillar === g).map(row).join('') +
    (power.benchmarks.some(b => b.pillar === g && !b.scored) ? '<p class="note-sm">' + esc(t.pfNotScored) + '</p>' : '') + '</div>').join('') + '</div>' +
    '<p class="note-sm">' + esc(t.bmLegend) + '</p>';
}

function keyCards(power, t) {
  if (!power.keyCards.length) return '';
  return '<div class="pf-block"><h3 class="mini-title">' + esc(t.pfKeyCards) + '</h3>' +
    '<ul class="pf-list pf-keycards">' + power.keyCards.map(c => '<li>' + esc(c.name) +
      (c.count > 1 ? ' <b class="mono">×' + c.count + '</b>' : '') + '</li>').join('') + '</ul></div>';
}

// The deck beside each reference group: also the plain-text view of the whole section.
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
  // what sets this deck apart comes first: distance from the pod, in units of the precon-to-cEDH span
  const off = ([k, v]) => {
    const pod = med('pod', k), span = Math.abs((med('cedh', k) ?? 0) - (med('precon', k) ?? 0)) || 1;
    return v === null || pod === null ? -1 : Math.abs(v - pod) / span;
  };
  const sorted = rows.slice().sort((a, b) => off(b) - off(a));
  const round = (k, v) => (v === null ? null : k === 'price' ? '€' + Math.round(v) : v);
  const mark = (k, v) => {
    const lo = Math.min(med('precon', k) ?? v, med('pod', k) ?? v), hi = Math.max(med('precon', k) ?? v, med('pod', k) ?? v);
    return v === null ? '' : v > hi ? ' ↑' : v < lo ? ' ↓' : '';
  };
  const table = (list) => '<div class="tbl-scroll"><table class="br-table pf-table"><thead><tr><th></th>' +
    '<th scope="col">' + esc(t.pfThisDeck) + '</th><th scope="col">' + esc(t.pfRef_precon) + '</th>' +
    '<th scope="col">' + esc(t.pfRef_pod) + '</th><th scope="col">' + esc(t.pfRef_cedh) + '</th></tr></thead><tbody>' +
    list.map(([k, v]) => '<tr><th scope="row">' + esc(t['pr_' + k]) + '</th><td class="mono"><b>' + show(round(k, v)) + esc(mark(k, v)) + '</b></td>' +
      ['precon', 'pod', 'cedh'].map(g => '<td class="mono">' + show(round(k, med(g, k))) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
  return '<h3 class="mini-title">' + esc(t.pfCompareT) + '</h3>' + table(sorted.slice(0, 5)) +
    '<details class="br-legend"><summary>' + esc(fill(t.pfCompareMore, { v: sorted.length })) + '</summary>' + table(sorted) + '</details>';
}

// Tempo if nobody interferes, plus how likely each role is to show up by each turn.
function tempo(r, t) {
  const g = r.profile.goldfish, L = r.profile.ledger;
  const turns = [1, 2, 3, 4, 5, 6, 8, 10];
  const deck = r.stats.total_cards - r.commanders.length;
  const roles = [['pr_ramp', L.ramp], ['pr_draw', L.draw], ['pr_tutors', L.tutors], ['pr_cheap_answers', L.cheapAnswers]];
  // seven in hand plus one a turn after the first
  const odds = [2, 4, 6, 8].map(turn => '<th scope="col">T' + turn + '</th>').join('');
  return '<details class="br-legend"><summary>' + esc(t.gfT) + '</summary>' +
    '<p class="note-sm">' + esc(t.gfX.replace('%n', g.games)) + '</p>' +
    '<div class="tbl-scroll"><table class="br-table"><thead><tr><th></th>' + turns.map(n => '<th scope="col">T' + n + '</th>').join('') +
    '</tr></thead><tbody><tr><th scope="row">' + esc(t.gfMana) + '</th>' + turns.map(n => '<td class="mono">' + g.mana[n - 1] + '</td>').join('') + '</tr></tbody></table></div>' +
    '<h3 class="mini-title">' + esc(t.gfOddsT) + '</h3>' +
    '<div class="tbl-scroll"><table class="br-table"><thead><tr><th></th>' + odds + '</tr></thead><tbody>' +
    roles.map(([label, cards]) => '<tr><th scope="row">' + esc(t[label]) + ' <span class="note-sm mono">' + cards.length + '</span></th>' +
      [2, 4, 6, 8].map(turn => '<td class="mono">' + Math.round(drawOdds(deck, cards.length, 6 + turn) * 100) + '%</td>').join('') + '</tr>').join('') +
    '</tbody></table></div></details>';
}

function tempoLead(r, t) {
  const g = r.profile.goldfish;
  const parts = [g.commanderTurn !== null ? t.gfCommander.replace('%v', g.commanderTurn) : '',
    g.winBy ? (g.winTurn !== null ? t.gfWin.replace('%v', g.winTurn) : t.gfNoWin) + ' ' +
      t.gfWinBy.replace('%a', g.winBy[6]).replace('%b', g.winBy[8]).replace('%c', g.winBy[10]) : ''];
  return parts.some(Boolean) ? '<p class="pf-lead">' + esc(parts.filter(Boolean).join(' ')) + '</p>' : '';
}

// Salt means little as a bare number, so say where it sits among the pod's decks.
function saltRank(salt, t) {
  const pod = state.study ? state.study.decks.filter(d => d.group === 'pod').map(d => d.salt.total) : [];
  return salt && pod.length ? fill(t.pfSaltRank, { v: Math.round(pod.filter(x => x < salt.total).length / pod.length * 100) }) : '';
}

function manaBlock(m, t) {
  return '<div class="pf-block"><h3 class="mini-title">' + esc(t.pfManaT) + ' · <span class="mono">' + m.score + '/100</span></h3>' +
    '<p class="note-sm">' + esc(t.pfManaX.replace('%f', m.fixing).replace('%q', m.quality).replace('%c', m.curve)) + '</p>' +
    '<p class="note-sm">' + esc(t.pfManaLands.replace('%l', m.lands).replace('%b', m.basics).replace('%t', m.tapped).replace('%e', m.fetches)) + '</p>' +
    (m.colors.length ? '<div class="tbl-scroll"><table class="br-table"><thead><tr><th></th><th scope="col">' + esc(t.pfPips) + '</th><th scope="col">' + esc(t.pfSources) + '</th></tr></thead><tbody>' +
      m.colors.map(c => '<tr><th scope="row">' + c.color + (c.color === m.weakest && c.cover < 1 ? ' ⚠' : '') + '</th>' +
        '<td class="mono">' + Math.round(c.share * 100) + '%</td><td class="mono">' + c.sources + ' / ' + c.target + '</td></tr>').join('') +
      '</tbody></table></div>' : '') + '</div>';
}

function saltBlock(salt, t) {
  if (!salt) return '<div class="pf-block"><h3 class="mini-title">' + esc(t.pfSaltT) + '</h3><p class="note-muted">' + esc(t.brChecking) + '</p></div>';
  return '<div class="pf-block"><h3 class="mini-title">' + esc(t.pfSaltT) + ' · <span class="mono">' + salt.total + '</span></h3>' +
    '<p class="note-sm">' + esc(t.pfSaltX.replace('%a', salt.average)) + '</p>' +
    (salt.top.length ? '<ul class="pf-list">' + salt.top.slice(0, 5).map(c => '<li>' + esc(c.name) + ' <b class="mono">' + c.salt + '</b></li>').join('') + '</ul>' : '') + '</div>';
}

function synergyBlock(s, t) {
  const head = '<h3 class="mini-title">' + esc(t.pfSynT) + (s.status === 'done' ? ' · <span class="mono">' + s.coverage + '%</span>' : '') + '</h3>';
  if (s.status === 'loading') return '<div class="pf-block">' + head + '<p class="note-muted">' + esc(t.brChecking) + '</p></div>';
  if (s.status !== 'done') return '<div class="pf-block">' + head + '<p class="note-muted">' + esc(t.pfSynNone) + '</p></div>';
  return '<div class="pf-block">' + head +
    '<p class="note-sm">' + esc(t.pfSynX.replace('%o', s.offPlan)) + '</p>' +
    '<ul class="pf-list">' + s.carrying.map(c => '<li>' + esc(c.name) + ' <b class="mono">+' + Math.round(c.s * 100) + '%</b></li>').join('') + '</ul>' +
    '<a class="combo-link" href="https://edhrec.com/commanders/' + esc(s.slug) + '" target="_blank" rel="noopener noreferrer">EDHREC ↗</a></div>';
}

function shapeBlock(p, t) {
  const arch = p.shape.archetypes.map(a => esc((ARCH.find(x => x.k === a.key) || { name: { [state.lang]: a.key } }).name[state.lang]) + ' <b class="mono">' + a.share + '%</b>').join(' · ');
  const w = p.wins;
  const winLine = w.checked ? t.pfWinsX.replace('%e', w.ending).replace('%l', w.lines).replace('%t', w.twoCard)
    .replace('%p', w.printed).replace('%f', show(w.fastest)) : t.brChecking;
  return '<div class="pf-block"><h3 class="mini-title">' + esc(t.pfShapeT) + '</h3>' +
    (arch ? '<p class="note-sm">' + arch + '</p>' : '') +
    (p.shape.typal.type && p.shape.typal.share >= 25
      ? '<p class="note-sm">' + esc(t.pfTypal.replace('%n', p.shape.typal.type).replace('%s', p.shape.typal.share)) + '</p>' : '') +
    '<p class="note-sm">' + esc(winLine) + '</p></div>';
}

export function renderProfile() {
  loadStudy();
  const t = T(), r = state.result, root = $('profile');
  const { power, profile, salt, synergy } = r;
  const waiting = !profile.wins.checked;
  root.innerHTML = '<div class="panel panel-pad-lg">' +
    '<div class="combo-stats">' +
      tile(t.pfPractical, waiting ? '…' : esc(r.level.bracket) + ' <span class="stat-cap">' + power.score + ' / 10</span>', waiting ? t.brPending : t['band_' + powerBand(power.score)]) +
      tile(t.pfSalt, salt ? salt.total : '…', saltRank(salt, t)) +
      tile(t.pfSyn, synergy.status === 'done' ? synergy.coverage + '%' : synergy.status === 'loading' ? '…' : '—', t.pfSynSub) +
      tile(t.pfMana, profile.manabase.score, t.pfManaSub) +
    '</div>' +
    floorNote(r, t) + fingerprint(power, t) + tempoLead(r, t) + pillars(power, t) + benchmarks(power, t) + keyCards(power, t) + tempo(r, t) +
    '<div class="pf-grid">' + manaBlock(profile.manabase, t) + saltBlock(salt, t) + synergyBlock(synergy, t) + shapeBlock(profile, t) + '</div>' +
    comparison(r, t) +
    '<p class="note-sm">' + esc(t.pfNote) + '</p></div>';
}
