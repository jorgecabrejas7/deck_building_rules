export const store = {
  get lang(){ return localStorage.getItem('pdc_lang') || 'es'; },
  set lang(v){ localStorage.setItem('pdc_lang', v); },
  get theme(){ return localStorage.getItem('pdc_theme') || ''; },
  set theme(v){ localStorage.setItem('pdc_theme', v); },
};

export let cardCache = {};
try { const raw = JSON.parse(localStorage.getItem('pdc_cards_v2') || '{}');
  if (raw._ts && Date.now() - raw._ts < 30 * 864e5) cardCache = raw.cards || {};
} catch (e) {}
export function persistCache(){ try { localStorage.setItem('pdc_cards_v2', JSON.stringify({ _ts: Date.now(), cards: cardCache })); } catch (e) {} }

export const state = {
  lang: store.lang, theme: store.theme, sysDark: matchMedia('(prefers-color-scheme: dark)').matches,
  arch: 'auto', grp: 'type', cf: 'all', curveBin: null, hl: null, openArch: null, tab: 'load',
  deck: null,        // {entries, commanders, deckName}
  result: null,      // {stats, flagged, evalRes, cardsInfo, detected, notFound, validation, commander, whatIf}
  fetchSt: 'idle', fi: {done:0,total:0,card:''}, copied: false, busy: false, error: null,
  hand: null, combosData: null, tableOpen: false, tableTexts: ['', '', '', ''], tableResults: null, tableBusy: false,
  tipsCache: null,   // {key, html} — suggestions fetched per analysis+archetype
};
export const TAB_KEYS = ['load', 'power', 'analysis', 'tips', 'guide'];
