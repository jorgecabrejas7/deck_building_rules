import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH } from './constants.js';
import { $, esc } from './helpers.js';
import { renderPod } from './pod.js';

// Part three of the report: what the deck does, measured against the 36 precons,
// the pod's decks and public cEDH lists (data/deck_study.json). Informative only:
// the pod's tier and the bracket verdict never read anything shown here.
const PILLAR_KEYS = ['consistency', 'efficiency', 'interaction', 'wins'];
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
  return '<div class="pl-rows">' + PILLAR_KEYS.map(k =>
    '<div class="pl-row"><span class="pl-name">' + esc(t['pf_' + k]) + '</span>' +
    '<div class="pl-track" aria-hidden="true"><div class="pl-fill" style="--w:' + power.pillars[k] + '%"></div>' +
    tick('precon', 'a', k) + tick('pod', 'b', k) + tick('cedh', 'c', k) + '</div>' +
    '<span class="mono pl-val">' + power.pillars[k] + '</span></div>').join('') + '</div>' +
    (state.study ? '<div class="pl-legend note-sm">' +
      '<span><i class="pl-key a"></i>' + esc(t.pfRef_precon) + '</span>' +
      '<span><i class="pl-key b"></i>' + esc(t.pfRef_pod) + '</span>' +
      '<span><i class="pl-key c"></i>' + esc(t.pfRef_cedh) + '</span></div>' : '');
}

function drivers(power, t) {
  const item = (d) => '<li>' + esc(t['pm_' + d.key]) + ' <b class="mono">' + show(d.value) + '</b></li>';
  if (!power.up.length && !power.down.length) return '';
  return '<div class="pf-cols">' +
    (power.up.length ? '<div><h3 class="mini-title">' + esc(t.pfUp) + '</h3><ul class="pf-list">' + power.up.map(item).join('') + '</ul></div>' : '') +
    (power.down.length ? '<div><h3 class="mini-title">' + esc(t.pfDown) + '</h3><ul class="pf-list">' + power.down.map(item).join('') + '</ul></div>' : '') +
    '</div>';
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
    ['price', Math.round(r.stats.total_price_eur)],
  ];
  return '<div class="tbl-scroll"><table class="br-table pf-table"><thead><tr><th></th>' +
    '<th scope="col">' + esc(t.pfThisDeck) + '</th><th scope="col">' + esc(t.pfRef_precon) + '</th>' +
    '<th scope="col">' + esc(t.pfRef_pod) + '</th><th scope="col">' + esc(t.pfRef_cedh) + '</th></tr></thead><tbody>' +
    rows.map(([k, v]) => '<tr><th scope="row">' + esc(t['pr_' + k]) + '</th><td class="mono"><b>' + show(v) + '</b></td>' +
      ['precon', 'pod', 'cedh'].map(g => '<td class="mono">' + show(med(g, k)) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
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
    (salt.top.length ? '<ul class="pf-list">' + salt.top.map(c => '<li>' + esc(c.name) + ' <b class="mono">' + c.salt + '</b></li>').join('') + '</ul>' : '') + '</div>';
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
      tile(t.pfPower, waiting ? '…' : power.score + ' <span class="stat-cap">/ 10</span>', waiting ? t.brPending : t['band_' + powerBand(power.score)]) +
      tile(t.pfSalt, salt ? salt.total : '…', med('pod', 'salt_total') !== null ? t.pfVsPod.replace('%v', med('pod', 'salt_total')) : '') +
      tile(t.pfSyn, synergy.status === 'done' ? synergy.coverage + '%' : synergy.status === 'loading' ? '…' : '—', t.pfSynSub) +
      tile(t.pfMana, profile.manabase.score, t.pfManaSub) +
    '</div>' +
    pillars(power, t) + drivers(power, t) +
    '<div class="pf-grid">' + manaBlock(profile.manabase, t) + saltBlock(salt, t) + synergyBlock(synergy, t) + shapeBlock(profile, t) + '</div>' +
    '<details class="br-legend" open><summary>' + esc(t.pfCompareT) + '</summary>' + comparison(r, t) + '</details>' +
    '<p class="note-sm">' + esc(t.pfNote) + '</p></div>';
}
