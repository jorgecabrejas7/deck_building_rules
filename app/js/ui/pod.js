import { state } from '../state.js';
import { T } from '../i18n.js';
import { $, esc, tierTone } from './helpers.js';
import { loadStudy } from './profile.js';
import { analyze } from '../pipeline.js';
import { deckToText } from '../advice.js';
import { runTableMode } from './table.js';
import { renderAll } from '../main.js';

// Pod deck registry: decks from data/pod_decks.json (maintained with
// scripts/pod_decks.py) joined to their numbers from data/deck_study.json. The list
// still works without the study, which is why the join starts from the registry.
const SORTS = {
  power: s => s.power.score, points: s => s.points, salt: s => s.salt.total,
  synergy: s => (s.synergy ? s.synergy.coverage : -1), price: s => s.price, bracket: s => s.bracket.checklist,
};
// shortcut: typos fixed for display only, because the registry mirrors Archidekt; drop these if the lists get renamed there
const NAME_FIX = [[/necome/, 'become'], [/Acetic/, 'Ascetic'], [/Teysha/, 'Teysa']];
const displayName = (n) => NAME_FIX.reduce((name, [bad, good]) => name.replace(bad, good), n);

function rowFor(d, s, t) {
  const num = (v) => '<td class="mono num">' + v + '</td>';
  const tier = !s ? '—' : '<span class="tier-pill ' + tierTone(s.tier) + '">' + esc(t['short_' + s.tier]) + '</span>' +
    (s.violations.includes('banned') ? '<span class="pod-why">' + esc(t.podBanned) + '</span>' : '');
  return '<tr><th scope="row"><span class="pod-name">' + esc(displayName(d.name)) + '</span>' +
    (d.url ? ' <a class="pod-link" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">Archidekt ↗</a>' : '') + '</th>' +
    '<td>' + tier + '</td>' +
    num(s ? s.points : '—') + num(s ? esc(s.practicalBracket) + ' · ' + s.power.score.toFixed(1) + (s.floor ? '<span class="pod-why">' + esc(t['podFloor_' + s.floor.reason]) + '</span>' : '') : '—') + num(s ? s.bracket.checklist : '—') +
    num(s ? s.salt.total.toFixed(1) : '—') + num(s && s.synergy ? s.synergy.coverage + '%' : '—') + num(s ? '€' + Math.round(s.price) : '—') +
    '<td class="pod-actions"><button data-pod-load="' + d.id + '" class="btn-ghost-sm">' + t.podLoad + '</button>' +
    (state.deck ? '<button data-pod-cmp="' + d.id + '" class="btn-ghost-sm">' + t.podCompare + '</button>' : '') + '</td></tr>';
}

function table(decks, t) {
  const study = state.study;
  const of = (d) => (study ? study.decks.find(s => s.group === 'pod' && s.podId === d.id) : null);
  const { key, dir } = state.podSort;
  const rows = decks.map(d => ({ d, s: of(d) }));
  if (study) rows.sort((a, b) => dir * ((a.s ? SORTS[key](a.s) : -1) - (b.s ? SORTS[key](b.s) : -1)));
  const head = (k, label) => {
    const on = key === k;
    return '<th scope="col" class="num" aria-sort="' + (on ? (dir < 0 ? 'descending' : 'ascending') : 'none') + '">' +
      '<button type="button" class="pod-sort' + (on ? ' on' : '') + '" data-podsort="' + k + '">' + esc(label) +
      (on ? ' <span aria-hidden="true">' + (dir < 0 ? '▼' : '▲') + '</span>' : '') + '</button></th>';
  };
  const ref = (label, m) => '<tr class="pod-ref"><th scope="row">' + esc(label) + '</th><td></td>' +
    ['points', 'power', null, 'salt_total', 'synergy_coverage', 'price'].map(k => {
      const v = k && m[k];
      return '<td class="mono num">' + (typeof v !== 'number' ? '' : k === 'price' ? '€' + Math.round(v) : k === 'synergy_coverage' ? Math.round(v) + '%' : k === 'points' ? v : v.toFixed(1)) + '</td>';
    }).join('') + '<td></td></tr>';
  return '<div class="tbl-scroll pod-scroll"><table class="pod-table"><thead><tr><th scope="col">' + esc(t.tmDeck) + '</th><th scope="col">' + esc(t.tierWord) + '</th>' +
    head('points', t.pts) + head('power', t.pfPractical) + head('bracket', t.brTileN) + head('salt', t.pfSalt) + head('synergy', t.pfSyn) + head('price', t.price) +
    '<td></td></tr></thead><tbody>' + rows.map(({ d, s }) => rowFor(d, s, t)).join('') +
    (study ? ref(t.pfRef_precon, study.medians.precon) + ref(t.pfRef_cedh, study.medians.cedh) : '') +
    '</tbody></table></div>' + (study ? '<p class="note-sm">' + esc(t.podStudyNote) + '</p>' : '');
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
  const body = pd.status === 'loading' ? '<div class="note-muted">' + t.podLoading + '</div>'
    : pd.status === 'error' ? '<div class="note-bad">' + t.podErr + '</div>'
    : !pd.decks.length ? '<div class="note-muted">' + esc(t.podEmpty) + '</div>'
    : table(pd.decks, t);
  el.innerHTML = '<div class="stack-16"><div class="part-head"><div><h2 class="part-title">' + t.podT + '</h2>' +
    '<p class="part-sub">' + esc(t.podHint) + '</p></div></div><div class="panel pod-card">' + body + '</div></div>';
  for (const b of el.querySelectorAll('[data-podsort]')) b.onclick = () => {
    const k = b.dataset.podsort;
    state.podSort = { key: k, dir: state.podSort.key === k ? -state.podSort.dir : -1 };
    renderPod();
    // a partial render bypasses renderAll's focus restore
    const again = el.querySelector('[data-podsort="' + k + '"]');
    if (again) again.focus({ preventScroll: true });
  };
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
