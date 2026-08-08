export const store = {
  get lang(){ return localStorage.getItem('pdc_lang') || 'es'; },
  set lang(v){ localStorage.setItem('pdc_lang', v); },
  get theme(){ return localStorage.getItem('pdc_theme') || ''; },
  set theme(v){ localStorage.setItem('pdc_theme', v); },
  get priceNoteSeen(){ return localStorage.getItem('pdc_price_note') === '1'; },
  set priceNoteSeen(v){ localStorage.setItem('pdc_price_note', v ? '1' : ''); },
};

export let cardCache = {};
try { const raw = JSON.parse(localStorage.getItem('pdc_cards_v2') || '{}');
  if (raw._ts && Date.now() - raw._ts < 30 * 864e5) cardCache = raw.cards || {};
} catch (e) {}
export function persistCache(){ try { localStorage.setItem('pdc_cards_v2', JSON.stringify({ _ts: Date.now(), cards: cardCache })); } catch (e) {} }

// ---- session persistence: survive refresh / tab eviction ----
// One versioned blob with the raw inputs only (deck text, archetype, active
// tab, table-mode lists); results are re-derived by re-running the analysis.
const SESSION_KEY = 'pdc_session_v1';
export function saveSession(){
  const ta = document.getElementById('deckText');
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({
    deckText: ta ? ta.value : '', arch: state.arch, tab: state.tab,
    tableTexts: state.tableTexts,
  })); } catch (e) {}
}
// Pre-consolidation tab keys map onto the merged report/detail panes.
const TAB_MIGRATE = { power: 'informe', tips: 'informe', analysis: 'detalles' };
export function loadSession(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s || typeof s !== 'object') return null;
    if (TAB_MIGRATE[s.tab]) s.tab = TAB_MIGRATE[s.tab];
    return s;
  } catch (e) { return null; }
}

export const state = {
  lang: store.lang, theme: store.theme, sysDark: matchMedia('(prefers-color-scheme: dark)').matches,
  arch: 'auto', grp: 'type', cf: 'all', curveBin: null, hl: null, openArch: null, tab: 'load',
  deck: null,        // {entries, commanders, deckName}
  result: null,      // {stats, flagged, evalRes, cardsInfo, detected, notFound, validation, commander, whatIf}
  fetchSt: 'idle', fi: {done:0,total:0,card:''}, copied: false, busy: false, error: null,
  hand: null, combosData: null, tableOpen: false, tableTexts: ['', '', '', ''], tableResults: null, tableBusy: false,
  tipsCache: null,   // {key, html} — suggestions fetched per analysis+archetype
  podDecks: null,    // {status, decks} — lazy-loaded from data/pod_decks.json
  cmpView: 'all',    // side-by-side card comparison: 'all' | 'diff'
};
export const TAB_KEYS = ['load', 'informe', 'detalles', 'pod', 'guide'];
