import { addVersion } from './engine/history.js';

export const store = {
  get lang(){ return localStorage.getItem('pdc_lang') || 'es'; },
  set lang(v){ localStorage.setItem('pdc_lang', v); },
  get deckMode(){ return localStorage.getItem('pdc_deck_mode') || 'list'; },
  set deckMode(v){ localStorage.setItem('pdc_deck_mode', v); },
  get theme(){ return localStorage.getItem('pdc_theme') || ''; },
  set theme(v){ localStorage.setItem('pdc_theme', v); },
};

export let cardCache = {};
try { const raw = JSON.parse(localStorage.getItem('pdc_cards_v3') || '{}');
  if (raw._ts && Date.now() - raw._ts < 30 * 864e5) cardCache = raw.cards || {};
} catch (e) {}
export function persistCache(){ try { localStorage.setItem('pdc_cards_v3', JSON.stringify({ _ts: Date.now(), cards: cardCache })); } catch (e) {} }

// ---- session persistence: survive refresh / tab eviction ----
// One versioned blob with the raw inputs only (deck text, archetype, active
// tab, table-mode lists); results are re-derived by re-running the analysis.
const SESSION_KEY = 'pdc_session_v1';
export function saveSession(){
  if (state.shared) return; // a deck opened from a link never replaces the visitor's own
  const ta = document.getElementById('deckText');
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({
    deckText: ta ? ta.value : '', arch: state.arch, tab: state.tab, view: state.view,
    tableTexts: state.tableTexts, cmdPick: state.cmdPick,
  })); } catch (e) {}
}
export function loadSession(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s || typeof s !== 'object') return null;
    return s;
  } catch (e) { return null; }
}

// ---- deck history: one list of versions per commander, card images never stored ----
const historyKey = (commanders) => 'pdc_history_v1:' + [...commanders].sort().join('|');
export function loadHistory(commanders){
  try {
    const v = JSON.parse(localStorage.getItem(historyKey(commanders)));
    return Array.isArray(v) ? v.filter(x => x && Array.isArray(x.cards)) : [];
  } catch (e) { return []; }
}
// A full or blocked store only costs this version: the analysis never depends on it.
export function saveVersion(commanders, version){
  try { localStorage.setItem(historyKey(commanders), JSON.stringify(addVersion(loadHistory(commanders), version))); } catch (e) {}
}

export const state = {
  lang: store.lang, theme: store.theme, sysDark: matchMedia('(prefers-color-scheme: dark)').matches,
  arch: 'auto', cf: 'all', curveBin: null, hl: null, openArch: null, tab: 'load', view: 'summary',
  restoring: false, // analyzing the saved deck behind the landing, without leaving it
  shared: false,     // showing a deck from a #d= link: nothing saves until the visitor analyzes their own
  shareBad: false,   // the #d= link could not be read
  linkCopied: false,
  // shortcut: openDeck is not kept across reloads, persist it if players ask
  openDeck: null,    // {id, name, commanders}: the saved deck behind the analysis, so Guardar adds a version; cleared when an analysis has other commanders
  deckSource: null,  // {source, url?}: where the analyzed list came from, saved with it
  saveSt: null,      // label key shown on the Guardar button for a moment
  deckView: { level: null, q: '', group: 'value', sort: 'value', mode: store.deckMode, card: null, open: false, add: '', hits: null, locked: new Set() },
  deck: null,        // {entries, commanders, deckName}
  cmdPick: null,     // user-chosen commander name(s); null = auto-detect
  edits: null,       // {undo: [{deck, cmdPick}], base: figures before the first edit, text: paste box before it}, new per analysis
  result: null,      // {stats, flagged, evalRes, cardsInfo, detected, notFound, validation, commander, commanders, options, bracket, profile, power, level, salt, saltParts, synergy, whatIf}
  fetchSt: 'idle', fi: {done:0,total:0,card:''}, copied: false, busy: false, error: null,
  hand: null, combosData: null, tableOpen: false, tableTexts: ['', '', '', ''], tableResults: null, tableBusy: false,
  tipsCache: null,   // {key, html} — suggestions fetched per analysis+archetype
  pods: null,        // the player's pods (summaries), null when signed out or offline
  activeId: null,    // the active pod's id; its full detail loads when the Pod tab opens
  pod: null,         // the active pod, in full: members, decks and their lists
  landDenial: null,  // data/land_denial.json, which of Spellbook's flags really are mass land denial
  precons: null,     // data/precons.json, to recognise a stock precon
  saltDb: null,      // data/salt.json, loaded with the combo database
  cardTags: null,    // data/card_tags.json as name -> tags, loaded alongside it
  synergyData: null, // {key, table} for the current commander(s)
  averageData: null, // {key, loading, failed, average} EDHREC's average deck for them
  study: null,       // data/deck_study.json: reference medians and the pod table
  cmdOpen: false,   // the commander picker stays folded until asked for
  comboFilter: 'all', comboAll: false, // bracket report: combo list filter + show-all
  near: null,        // {key, status, groups, all}: combos one card away, for this deck and commander
  cmpView: 'all',    // side-by-side card comparison: 'all' | 'diff'
};
export const TAB_KEYS = ['load', 'build', 'decks', 'informe', 'pod', 'games', 'guide'];
export const VIEW_KEYS = ['summary', 'deck', 'points', 'bracket', 'combos', 'power', 'mana', 'web'];
