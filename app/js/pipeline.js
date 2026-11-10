import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { state, cardCache, persistCache, saveVersion } from './state.js';
import { T } from './i18n.js';
import { $, announce } from './ui/helpers.js';
import { renderInput } from './ui/input.js';
import { renderBanner } from './ui/tabbar.js';
import { renderAll } from './main.js';
import { renderProfile } from './ui/profile.js';
import { renderDeck } from './ui/deck.js';
import { renderMana } from './ui/mana.js';
import { getSynergy, getAverage } from './synergy.js';

// Only the latest analysis may publish: a player pressing Analizar while the saved deck
// loads gets their own deck, whichever one Scryfall answers first.
let latestRun = 0;

// fromLink: the opening of a #d= link. Any other analysis is the visitor's own, so saving resumes.
export async function analyze(fromLink = false) {
  const run = ++latestRun;
  if (!fromLink && state.shared) { state.shared = false; history.replaceState(null, '', location.pathname + location.search); }
  if (!state.restoring) state.shareBad = false;
  const text = $('deckText').value;
  const det = PodEngine.detectInput(text);
  state.busy = true; state.error = null; renderInput();
  try {
    let parsed;
    if (det.kind === 'archidekt' || det.kind === 'moxfield') {
      try { parsed = await (det.kind === 'archidekt' ? PodEngine.fetchArchidekt : PodEngine.fetchMoxfield)(det.id); }
      catch (e) {
        console.error(e);
        if (run !== latestRun) return;
        state.error = det.kind === 'archidekt' ? 'archErr' : 'moxErr';
        state.busy = false; renderInput(); return;
      }
    } else {
      parsed = PodEngine.parseDecklist(text);
    }
    if (!parsed.entries.length) { state.busy = false; renderInput(); return; }
    const names = [...new Set(parsed.entries.map(e => e.name))];
    const { notFound } = await PodEngine.fetchCards(names, cardCache, p => {
      state.fi = { done: p.done, total: p.total, card: '' }; renderInput();
    });
    persistCache();
    if (run !== latestRun) return;
    state.deck = parsed;
    state.deckSource = det.kind === 'archidekt' ? { source: 'archidekt', url: 'https://archidekt.com/decks/' + det.id }
      : det.kind === 'moxfield' ? { source: 'moxfield', url: 'https://www.moxfield.com/decks/' + det.id } : { source: 'paste' };
    state.edits = { undo: [], base: null, text: '' };
    state.combosData = null;
    recompute(notFound);
    // the same commanders are the same saved deck, so editing its list and saving adds a version
    const cmdKey = (c) => [...c].sort().join('|');
    if (state.openDeck && cmdKey(state.openDeck.commanders) !== cmdKey(state.result.commanders)) state.openDeck = null;
    state.fetchSt = 'idle';
    if (!state.restoring) { state.tab = 'informe'; state.view = 'summary'; }
    Object.assign(state.deckView, { level: null, q: '', card: null, open: false, add: '', hits: null, locked: new Set() });
  } catch (e) {
    console.error(e);
    if (run !== latestRun) return;
    state.error = 'netErr';
  }
  state.busy = false;
  renderAll();
  // announce the verdict to screen readers (result panels are not live regions)
  if (state.result && !state.error) {
    const t = T(), ev = state.result.evalRes;
    announce(t.tierWord + ': ' + t[ev.tier] + ' · ' + ev.points + ' pts');
  }
  if (state.result && location.protocol !== 'file:') checkCombos();
}

// ---- infinite combos: checked automatically after every analysis ----
let comboDb = null;
export async function getComboDb() {
  if (!comboDb) comboDb = await (await fetch('../data/combos.json')).json();
  return comboDb;
}
let saltDb = null;
export async function getSaltDb() {
  if (!saltDb) saltDb = await (await fetch('../data/salt.json')).json();
  return saltDb;
}
let landDenial = null;
export const getLandDenial = async () => (landDenial ||= await (await fetch('../data/land_denial.json')).json());
let precons = null;
export const getPrecons = async () => (precons ||= (await (await fetch('../data/precons.json')).json()).decks);
let cardTags = null;
export async function getCardTags() {
  if (!cardTags) cardTags = PodEngine.indexCardTags(await (await fetch('../data/card_tags.json')).json());
  return cardTags;
}
// Only the latest check may publish: an edit made during one has already changed the deck it read.
let latestCheck = 0;
export async function checkCombos() {
  if (!state.result) return;
  const run = ++latestCheck;
  const deck = state.deck;
  state.combosData = { status: 'checking', list: [] };
  renderAll();
  try {
    const db = await getComboDb();
    const list = PodEngine.matchCombos(state.deck.entries.map(e => e.name), db);
    // salt is a nicety: a failed fetch leaves its panel waiting, never the combo check
    state.saltDb = await getSaltDb().catch(() => null);
    // without tags the profile reads card text, so a failed fetch only costs accuracy
    state.cardTags = await getCardTags().catch(() => null);
    state.landDenial = await getLandDenial();
    // only the Bracket 2 label depends on it, so a failed fetch costs no more than that
    state.precons = await getPrecons().catch(() => null);
    if (run !== latestCheck) return;
    state.combosData = { status: 'done', list, cardLists: db, updated: db.updated };
    recompute();
    // a check outlived by a newer analysis must not record that deck with these combos
    if (state.deck === deck) recordVersion();
    const inf = state.result.bracket.combos.filter(c => c.infinite).length;
    announce(inf ? T().srCombos + ' ' + inf : T().comboNone);
  } catch (e) {
    console.error(e);
    if (run !== latestCheck) return;
    state.combosData = { status: 'error', list: [] };
    announce(T().comboErr);
  }
  renderAll();
}

function recordVersion() {
  const r = state.result;
  // a shared deck isn't the visitor's, and a what-if isn't a version until it is analyzed as one
  if (r.level.pending || !r.commanders.length || state.shared || (state.edits && state.edits.undo.length)) return;
  saveVersion(r.commanders, { date: new Date().toISOString(), points: r.evalRes.points, power: r.level.score,
    bracket: r.level.bracket, cards: state.deck.entries.map(e => [e.name, e.quantity]) });
}

export function recompute(notFound) {
  const parsed = state.deck;
  // A user pick overrules detection, but only for the deck it was made on:
  // the same legend can sit in someone else's 99, so matching by name alone
  // would silently re-derive THEIR deck around YOUR commander.
  const pick = state.cmdPick && state.cmdPick.key === PodEngine.deckFingerprint(parsed.entries)
    ? state.cmdPick.names : null;
  const _cd = state.combosData && state.combosData.status === 'done' ? state.combosData : null;
  const missing = notFound !== undefined ? notFound : (state.result ? state.result.notFound : []);
  const r = PodEngine.analyzeDeck({ parsed, db: cardCache, rules: RULES, pick,
    combos: _cd ? _cd.list : null, comboDb: _cd ? _cd.cardLists : null, landDenial: state.landDenial,
    saltDb: state.saltDb, cardTags: state.cardTags, precons: state.precons, notFound: missing });
  r.synergy = synergyFor(r.cardsInfo, r.commanders);
  loadAverage(r.commanders);
  state.result = r;
  state.hand = null;
  state.tipsCache = null;
  if (!state.edits.undo.length) state.edits.base = PodEngine.editFigures(state.result);
}

// EDHREC's page depends only on the commanders, so it is fetched once per pick. Its
// answer patches the result directly: a full recompute would throw away the sample
// hand and the fetched tips for a panel that does not read them.
function synergyFor(cardsInfo, commanders) {
  const key = commanders.join('|');
  if (state.synergyData && state.synergyData.key === key) {
    return state.synergyData.loading ? { status: 'loading' }
      : PodEngine.synergyScore({ cardsInfo, commanders, table: state.synergyData.table });
  }
  state.synergyData = { key, loading: true, table: null };
  getSynergy(commanders).catch(() => null).then(table => {
    if (!state.synergyData || state.synergyData.key !== key) return;
    state.synergyData = { key, loading: false, table };
    if (!state.result) return;
    state.result.synergy = PodEngine.synergyScore({ cardsInfo: state.result.cardsInfo, commanders, table });
    if (state.tab === 'informe' && state.view === 'power') renderProfile();
    if (state.tab === 'informe' && state.view === 'deck') renderDeck();
  });
  return { status: 'loading' };
}

// Fetched like the synergy table, and never awaited: the report does not wait for it.
function loadAverage(commanders) {
  const key = commanders.join('|');
  if (state.averageData && state.averageData.key === key) return;
  state.averageData = { key, loading: true, failed: false, average: null };
  getAverage(commanders).then(average => ({ average }), () => ({ failed: true })).then(got => {
    if (!state.averageData || state.averageData.key !== key) return;
    state.averageData = { key, loading: false, failed: false, average: null, ...got };
    if (state.result && state.tab === 'informe' && state.view === 'mana') renderMana();
  });
}

// The command zone drives colour identity, synergy advice and the archetype
// read, so changing it re-derives the whole report. null = back to detection.
export function setCommanders(names) {
  state.cmdPick = names && names.length
    ? { key: PodEngine.deckFingerprint(state.deck.entries), names }
    : null;
  recompute();
  renderAll();
}

let fetchCancelled = false;
export async function startCheapest() {
  if (state.fetchSt === 'fetching' || !state.result) return;
  state.fetchSt = 'fetching'; fetchCancelled = false; renderBanner();
  const names = [...new Set(state.deck.entries.map(e => e.name))];
  await PodEngine.fetchCheapest(names, cardCache, p => {
    state.fi = { done: p.done, total: p.total, card: p.card || '' }; renderBanner();
  }, () => fetchCancelled);
  persistCache();
  recompute();
  state.fetchSt = 'done';
  renderAll();
}
