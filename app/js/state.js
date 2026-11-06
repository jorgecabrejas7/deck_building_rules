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

export const state = {
  lang: store.lang, theme: store.theme, sysDark: matchMedia('(prefers-color-scheme: dark)').matches,
  arch: 'auto', cf: 'all', curveBin: null, hl: null, openArch: null, tab: 'load', view: 'summary',
  restoring: false, // analyzing the saved deck behind the landing, without leaving it
  shared: false,     // showing a deck from a #d= link: nothing saves until the visitor analyzes their own
  shareBad: false,   // the #d= link could not be read
  linkCopied: false,
  deckView: { level: null, q: '', group: 'value', sort: 'value', mode: store.deckMode, card: null, open: false },
  deck: null,        // {entries, commanders, deckName}
  cmdPick: null,     // user-chosen commander name(s); null = auto-detect
  result: null,      // {stats, flagged, evalRes, cardsInfo, detected, notFound, validation, commander, commanders, options, bracket, profile, power, level, salt, synergy, whatIf}
  fetchSt: 'idle', fi: {done:0,total:0,card:''}, copied: false, busy: false, error: null,
  hand: null, combosData: null, tableOpen: false, tableTexts: ['', '', '', ''], tableResults: null, tableBusy: false,
  tipsCache: null,   // {key, html} — suggestions fetched per analysis+archetype
  podDecks: null,    // {status, decks} — lazy-loaded from data/pod_decks.json
  landDenial: null,  // data/land_denial.json, which of Spellbook's flags really are mass land denial
  precons: null,     // data/precons.json, to recognise a stock precon
  saltDb: null,      // data/salt.json, loaded with the combo database
  cardTags: null,    // data/card_tags.json as name -> tags, loaded alongside it
  synergyData: null, // {key, table} for the current commander(s)
  study: null,       // data/deck_study.json: reference medians and the pod table
  podSort: { key: 'power', dir: -1 },
  cmdOpen: false,   // the commander picker stays folded until asked for
  comboFilter: 'all', comboAll: false, // bracket report: combo list filter + show-all
  cmpView: 'all',    // side-by-side card comparison: 'all' | 'diff'
};
export const TAB_KEYS = ['load', 'informe', 'pod', 'guide'];
export const VIEW_KEYS = ['summary', 'deck', 'points', 'bracket', 'combos', 'power', 'mana'];
