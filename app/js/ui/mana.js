import { atLeastOdds, drawOdds } from '../engine/index.js';
import { state } from '../state.js';
import { T } from '../i18n.js';
import { $, esc, fill } from './helpers.js';
import { studyMedian } from './profile.js';
import { paint, tableWrap } from './reading.js';

// Curva y maná in the open: the score, what it is made of, then each thing a player would
// check before trusting a mana base, every number with what it means beside it.
const TURNS = [1, 2, 3, 4, 5, 6, 8, 10];

const meter = (label, v, note) => '<div class="mn-part"><div class="mn-part-head"><span>' + esc(label) + '</span><b>' + v + '</b></div>' +
  '<span class="rd-bar-track" style="--v:' + v + '"><i></i></span><p>' + esc(note) + '</p></div>';

const section = (title, note, body) => '<section class="pw-sec"><h4>' + esc(title) + '</h4>' + (note ? '<p class="sum-note">' + esc(note) + '</p>' : '') + body + '</section>';

function colours(m, t) {
  if (!m.colors.length) return '';
  return section(t.mnColorsT, t.mnColorsX, tableWrap('<thead><tr><th></th><th scope="col">' + esc(t.pfPips) + '</th><th scope="col">' + esc(t.pfSources) + '</th><th></th><th></th></tr></thead><tbody>' +
    m.colors.map(c => {
      const word = c.cover >= 1 ? t.mnOk : c.cover >= 0.85 ? t.mnLow : t.mnShort;
      return '<tr><th scope="row"><span class="rd-pip" data-c="' + esc(c.color) + '" aria-hidden="true"></span>' + esc(c.color) + '</th><td>' + Math.round(c.share * 100) + '%</td>' +
        '<td>' + c.sources + ' / ' + c.target + '</td><td class="rd-cover" aria-hidden="true" style="--v:' + Math.round(Math.min(c.cover, 1) * 100) + '"><span class="rd-bar-track"><i></i></span></td><td>' + esc(word) + '</td></tr>';
    }).join('') + '</tbody>'));
}

function drops(m, deck, t) {
  // seven in hand plus one a turn after the first
  const rows = [2, 3, 4, 5, 6].map(n => [fill(t.mnDropN.replace('%v', n), { v: n }), atLeastOdds(deck, m.lands, n, 6 + n)]);
  rows.unshift([t.mnOpen, atLeastOdds(deck, m.lands, 2, 7)]);
  return section(t.mnDropsT, t.mnDropsX, '<ul class="mn-odds">' + rows.map(([label, p]) => {
    const pct = Math.round(p * 100);
    return '<li><span>' + esc(label) + '</span><span class="rd-bar-track" style="--v:' + pct + '" aria-hidden="true"><i></i></span><b>' + pct + '%</b></li>';
  }).join('') + '</ul>');
}

function tempo(g, t) {
  const top = Math.max(...TURNS.map(n => g.mana[n - 1]), 1);
  return section(t.mnTempoT, t.mnTempoX, '<ol class="rd-cols">' + TURNS.map(n =>
    '<li style="--h:' + Math.round(g.mana[n - 1] / top * 100) + '"><b>' + g.mana[n - 1] + '</b><span class="rd-col" aria-hidden="true"></span>' +
    '<span class="rd-col-l"><span class="vh">' + esc(t.gfTurn) + ' </span>T' + n + '</span></li>').join('') + '</ol>');
}

function roleOdds(r, deck, t) {
  const L = r.profile.ledger;
  const roles = [['pr_ramp', L.ramp], ['pr_draw', L.draw], ['pr_tutors', L.tutors], ['pr_cheap_answers', L.cheapAnswers]];
  return section(t.mnOddsT, '', tableWrap('<thead><tr><th></th>' + [2, 4, 6, 8].map(n => '<th scope="col">T' + n + '</th>').join('') + '</tr></thead><tbody>' +
    roles.map(([label, cards]) => '<tr><th scope="row">' + esc(t[label]) + ' <span class="rd-dim">' + cards.length + '</span></th>' +
      [2, 4, 6, 8].map(turn => '<td>' + Math.round(drawOdds(deck, cards.length, 6 + turn) * 100) + '%</td>').join('') + '</tr>').join('') + '</tbody>'));
}

function compare(r, t) {
  const p = r.profile;
  const rows = [['lands', p.manabase.lands], ['ramp', p.speed.ramp], ['fast_mana', p.speed.fastMana], ['cheap_plays', p.speed.cheap], ['avg_mv', p.speed.avgMv], ['fetches', p.manabase.fetches]];
  const cell = (v) => '<td>' + (v === null || v === undefined ? '—' : v) + '</td>';
  return section(t.mnCompareT, t.mnCompareX, tableWrap('<thead><tr><th></th><th scope="col">' + esc(t.pfThisDeck) + '</th>' +
    ['precon', 'pod', 'cedh'].map(g => '<th scope="col">' + esc(t['pfRef_' + g]) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(([k, v]) => '<tr><th scope="row">' + esc(t['pr_' + k]) + '</th><td class="rd-own">' + (v ?? '—') + '</td>' + ['precon', 'pod', 'cedh'].map(g => cell(studyMedian(g, k))).join('') + '</tr>').join('') + '</tbody>'));
}

export function renderMana() {
  const t = T(), r = state.result, m = r.profile.manabase, g = r.profile.goldfish;
  const deck = r.stats.total_cards - r.commanders.length;
  const why = g.commanderTurn !== null ? fill(t.mnWhy, { l: m.lands, b: m.basics, t: m.tapped, c: g.commanderTurn }) : fill(t.mnWhyNoCmd, { l: m.lands, b: m.basics, t: m.tapped });
  paint($('manaReport'), '<div class="panel rd pw"><header class="pw-head"><p class="sum-label">' + esc(t.mnScore) + '</p>' +
    '<h2 class="sum-bracket">' + m.score + '<small>' + esc(fill(t.mnOf, { v: '' }).trim()) + '</small></h2>' +
    '<p class="sum-read">' + esc(why) + '</p></header>' +
    section(t.mnPartsT, '', '<div class="mn-parts">' + meter(t.mnFix, m.fixing, t.mnFixX) + meter(t.mnQual, m.quality, t.mnQualX) + meter(t.mnCurveP, m.curve, t.mnCurveX) + '</div>') +
    colours(m, t) + drops(m, deck, t) + tempo(g, t) + roleOdds(r, deck, t) + compare(r, t) + '</div>');
}
