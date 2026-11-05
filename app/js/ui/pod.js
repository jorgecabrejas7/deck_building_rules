import { state } from '../state.js';
import { T } from '../i18n.js';
import { $, esc, tierTone } from './helpers.js';
import { loadStudy } from './profile.js';
import { analyze } from '../pipeline.js';
import { deckToText } from '../advice.js';
import { runTableMode } from './table.js';
import { renderAll } from '../main.js';

// Pod deck registry tab: reference decks stored in data/pod_decks.json
// (maintained with scripts/pod_decks.py). Any of them can be analyzed in
// place or compared against the currently loaded deck via table mode.
const SORTS = {
  power: d => d.power.score, points: d => d.points, salt: d => d.salt.total,
  synergy: d => (d.synergy ? d.synergy.coverage : -1), price: d => d.price, bracket: d => d.bracket.checklist,
};

// All the pod's decks at a glance, from data/deck_study.json. The study prices every
// card at its cheapest printing, so a tier here can differ from a deck's first
// analysis until "fetch cheapest prices" runs there.
function studyTable(t) {
  const s = state.study;
  if (!s) return '';
  const rows = s.decks.filter(d => d.group === 'pod').sort((a, b) => SORTS[state.podSort](b) - SORTS[state.podSort](a));
  const head = (k, label) => '<th scope="col"><button type="button" class="pod-sort' + (state.podSort === k ? ' on' : '') +
    '" data-podsort="' + k + '" aria-pressed="' + (state.podSort === k) + '">' + esc(label) + '</button></th>';
  const ref = (label, m) => '<tr class="pod-ref"><th scope="row">' + esc(label) + '</th><td></td>' +
    ['power', 'points', 'bracket', 'salt_total', 'synergy_coverage', 'price'].map(k =>
      '<td class="mono">' + (k === 'bracket' || m[k] === null || m[k] === undefined ? '' : (k === 'price' ? '€' + Math.round(m[k]) : m[k])) + '</td>').join('') + '</tr>';
  return '<div class="tbl-scroll"><table class="br-table pod-table"><thead><tr><th scope="col">' + esc(t.tmDeck) + '</th><th scope="col">' + esc(t.tierWord) + '</th>' +
    head('power', t.pfPower) + head('points', t.pts) + head('bracket', t.brTileN) + head('salt', t.pfSalt) + head('synergy', t.pfSyn) + head('price', t.price) + '</tr></thead><tbody>' +
    rows.map(d => '<tr><th scope="row">' + esc(d.name) + (d.label ? ' <span class="note-sm">· ' + esc(t['podLabel_' + d.label]) + '</span>' : '') + '</th>' +
      '<td><span class="tier-pill ' + tierTone(d.tier) + '">' + esc(t[d.tier]) + '</span></td>' +
      '<td class="mono">' + d.power.score + '</td><td class="mono">' + d.points + '</td><td class="mono">' + d.bracket.checklist + '</td>' +
      '<td class="mono">' + d.salt.total + '</td><td class="mono">' + (d.synergy ? d.synergy.coverage + '%' : '—') + '</td><td class="mono">€' + Math.round(d.price) + '</td></tr>').join('') +
    ref(t.pfRef_precon, s.medians.precon) + ref(t.pfRef_cedh, s.medians.cedh) +
    '</tbody></table></div><p class="note-sm">' + esc(t.podStudyNote) + '</p>';
}

export function renderPod() {
  const t = T();
  loadStudy();
  const el = $('podPanel');
  if (!state.podDecks) {
    state.podDecks = { status: 'loading', decks: [] };
    fetch('../data/pod_decks.json')
      .then(r => { if (!r.ok) throw new Error('pod_decks ' + r.status); return r.json(); })
      .then(d => { state.podDecks = { status: 'done', decks: d.decks || [] }; })
      .catch((e) => {
        // maintainer hint stays in the console; players see t.podErr
        console.warn('pod deck list failed: data/pod_decks.json (maintained with scripts/pod_decks.py)', e);
        state.podDecks = { status: 'error', decks: [] };
      })
      .then(() => { if (state.tab === 'pod') renderPod(); });
  }
  const pd = state.podDecks;
  let body;
  if (pd.status === 'loading') body = '<div class="note-muted">' + t.podLoading + '</div>';
  else if (pd.status === 'error') body = '<div class="note-bad">' + t.podErr + '</div>';
  else if (!pd.decks.length) body = '<div class="note-muted">' + esc(t.podEmpty) + '</div>';
  else body = '<div class="pod-rows">' + pd.decks.map(d =>
    '<div class="pod-row">' +
    '<div><div class="pod-name">' + esc(d.name) + '</div>' +
    '<div class="pod-meta">' + (d.owner ? esc(t.podBy) + ' ' + esc(d.owner) + ' · ' : '') +
    esc(t.podAdded) + ' ' + esc(d.added_at) +
    (d.url ? ' · <a href="' + esc(d.url) + '" target="_blank" rel="noopener">Archidekt ↗</a>' : '') + '</div></div>' +
    '<div class="pod-actions">' +
    '<button data-pod-load="' + d.id + '" class="btn-accent-sm">' + t.podLoad + '</button>' +
    (state.deck ? '<button data-pod-cmp="' + d.id + '" class="btn-ghost-sm">' + t.podCompare + '</button>' : '') +
    '</div></div>').join('') + '</div>';
  el.innerHTML = '<div class="panel panel-pad-lg"><h2 class="secT secT-lg">' + t.podT + '</h2>' +
    '<div class="lbl-muted">' + esc(t.podHint) + '</div>' + studyTable(t) + body + '</div>';
  for (const b of el.querySelectorAll('[data-podsort]')) b.onclick = () => { state.podSort = b.dataset.podsort; renderPod(); };
  for (const b of el.querySelectorAll('[data-pod-load]')) b.onclick = () => {
    const d = pd.decks.find(x => x.id === +b.dataset.podLoad);
    $('deckText').value = d.decklist;
    state.error = null; state.tab = 'load';
    renderAll();
    analyze();
  };
  for (const b of el.querySelectorAll('[data-pod-cmp]')) b.onclick = () => {
    const d = pd.decks.find(x => x.id === +b.dataset.podCmp);
    state.tableTexts = [deckToText(state.deck), d.decklist, '', ''];
    state.tableOpen = true; state.tableResults = null; state.tab = 'load';
    renderAll();
    runTableMode();
  };
}
