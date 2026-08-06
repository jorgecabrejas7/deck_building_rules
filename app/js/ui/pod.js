import { state } from '../state.js';
import { T } from '../i18n.js';
import { $, esc } from './helpers.js';
import { analyze } from '../pipeline.js';
import { deckToText } from '../advice.js';
import { runTableMode } from './table.js';
import { renderAll } from '../main.js';

// Pod deck registry tab: reference decks stored in data/pod_decks.json
// (maintained with scripts/pod_decks.py). Any of them can be analyzed in
// place or compared against the currently loaded deck via table mode.
export function renderPod() {
  const t = T();
  const el = $('podPanel');
  if (!state.podDecks) {
    state.podDecks = { status: 'loading', decks: [] };
    fetch('../data/pod_decks.json')
      .then(r => { if (!r.ok) throw new Error('pod_decks ' + r.status); return r.json(); })
      .then(d => { state.podDecks = { status: 'done', decks: d.decks || [] }; })
      .catch(() => { state.podDecks = { status: 'error', decks: [] }; })
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
  el.innerHTML = '<div class="panel panel-pad-lg"><span class="secT">' + t.podT + '</span>' +
    '<div class="lbl-muted">' + esc(t.podHint) + '</div>' + body + '</div>';
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
