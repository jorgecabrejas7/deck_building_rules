import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { state, cardCache, persistCache } from './state.js';
import { T } from './i18n.js';
import { $, announce } from './ui/helpers.js';
import { renderInput } from './ui/input.js';
import { renderBanner } from './ui/tabbar.js';
import { renderAll } from './main.js';
import { renderProfile } from './ui/profile.js';
import { getSynergy } from './synergy.js';

export async function analyze() {
  const text = $('deckText').value;
  const det = PodEngine.detectInput(text);
  if (det.kind === 'moxfield') { state.error = 'mox'; renderInput(); return; }
  state.busy = true; state.error = null; renderInput();
  try {
    let parsed;
    if (det.kind === 'archidekt') {
      try { parsed = await PodEngine.fetchArchidekt(det.id); }
      catch (e) { console.error(e); state.error = 'archErr'; state.busy = false; renderInput(); return; }
    } else {
      parsed = PodEngine.parseDecklist(text);
    }
    if (!parsed.entries.length) { state.busy = false; renderInput(); return; }
    const names = [...new Set(parsed.entries.map(e => e.name))];
    const { notFound } = await PodEngine.fetchCards(names, cardCache, p => {
      state.fi = { done: p.done, total: p.total, card: '' }; renderInput();
    });
    persistCache();
    state.deck = parsed;
    state.combosData = null;
    recompute(notFound);
    state.fetchSt = 'idle';
    state.tab = 'informe';
  } catch (e) {
    console.error(e); state.error = 'netErr';
  }
  state.busy = false;
  renderAll();
  // announce the verdict to screen readers (result panels are not live regions)
  if (state.result && !state.error) {
    const t = T(), v = state.result.verdict;
    announce(t.tierWord + ': ' + t[v.tier] + ' · ' + t.pfPower + ' ' + v.score);
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
let cardTags = null;
export async function getCardTags() {
  if (!cardTags) cardTags = PodEngine.indexCardTags(await (await fetch('../data/card_tags.json')).json());
  return cardTags;
}
export async function checkCombos() {
  if (!state.result || (state.combosData && state.combosData.status === 'checking')) return;
  state.combosData = { status: 'checking', list: [] };
  renderAll();
  try {
    const list = PodEngine.matchCombos(state.deck.entries.map(e => e.name), await getComboDb());
    // salt is a nicety: a failed fetch leaves its panel waiting, never the combo check
    state.saltDb = await getSaltDb().catch(() => null);
    // without tags the profile reads card text, so a failed fetch only costs accuracy
    state.cardTags = await getCardTags().catch(() => null);
    state.combosData = { status: 'done', list, cardLists: comboDb, updated: comboDb.updated };
    recompute();
    const inf = state.result.bracket.combos.filter(c => c.infinite).length;
    announce(inf ? T().srCombos + ' ' + inf : T().comboNone);
  } catch (e) {
    console.error(e);
    state.combosData = { status: 'error', list: [] };
    announce(T().comboErr);
  }
  renderAll();
}

export function recompute(notFound) {
  const parsed = state.deck;
  const resolved = parsed.entries.filter(e => cardCache[e.name]);
  const { stats, flagged } = PodEngine.computeDeckStats(resolved, cardCache);
  // A user pick overrules detection, but only for the deck it was made on:
  // the same legend can sit in someone else's 99, so matching by name alone
  // would silently re-derive THEIR deck around YOUR commander.
  const pick = state.cmdPick && state.cmdPick.key === PodEngine.deckFingerprint(parsed.entries)
    ? state.cmdPick.names : null;
  const picked = PodEngine.normalizeCommanders(pick, resolved, cardCache);
  const commanders = picked.length ? picked : PodEngine.pickCommanders(parsed, cardCache);
  const commander = commanders[0] || null;
  const _cd = state.combosData && state.combosData.status === 'done' ? state.combosData : null;
  const combos = _cd ? PodEngine.activeCombos(_cd.list, commanders) : null;
  const infinite = (combos || []).filter(c => c.infinite);
  stats.combos = infinite.length;
  stats.combo_sizes = infinite.map(c => c.n);
  const evalRes = PodEngine.evaluateDeck(stats, flagged, RULES, resolved.map(e => e.name));
  const cardsInfo = resolved.map(e => ({ card: cardCache[e.name], qty: e.quantity, name: e.name,
    cls: PodEngine.classifyCard(cardCache[e.name]) }));
  const detected = PodEngine.detectArchetype(cardsInfo);
  const options = PodEngine.commanderOptions(resolved, cardCache);
  const missing = notFound !== undefined ? notFound : (state.result ? state.result.notFound : []);
  const validation = PodEngine.validateDeck(cardsInfo, commanders, cardCache, missing);
  const bracket = PodEngine.evaluateBrackets({
    stats, flagged, db: cardCache, validation, commanders,
    deckNames: resolved.map(e => e.name),
    combos, comboDb: _cd ? _cd.cardLists : null,
    loopCards: RULES.hard_bans.banned_cards.extra_turn_recursion,
    unresolved: missing.length,
  });
  const profile = PodEngine.computeProfile({ cardsInfo, stats, combos: combos ? bracket.combos : null, commanders, cardTags: state.cardTags });
  const power = PodEngine.computePower(profile, stats);
  const verdict = PodEngine.podVerdict({ power, evalRes, rules: RULES, checked: !!combos });
  // Only a deck outside Tier 1 needs a route, and only once its combos are known.
  const cutPlan = combos && verdict.tier === 'above' ? PodEngine.powerCutPlan({ entries: resolved, db: cardCache,
    combos: bracket.combos, commanders, cardTags: state.cardTags, classify: PodEngine.classifyCard, rules: RULES, banned: verdict.banned }) : null;
  const salt = state.saltDb ? PodEngine.saltScore(resolved.map(e => e.name), state.saltDb) : null;
  const synergy = synergyFor(cardsInfo, commanders);
  // what-if cut deltas for every card that drives a points dial or violation
  const drivingNames = new Set();
  for (const list of Object.values(evalRes.driving)) for (const [n] of list) drivingNames.add(n);
  const whatIf = {};
  const comboPts = evalRes.breakdown.combos || 0;
  for (const n of drivingNames) {
    const wi = PodEngine.whatIfCut(resolved, cardCache, RULES, n);
    whatIf[n] = { dPts: evalRes.points - comboPts - wi.points, tier: wi.tier,
      fixes: evalRes.violations.length > 0 && wi.violations < evalRes.violations.length };
  }
  state.result = { stats, flagged, evalRes, cardsInfo, detected, commander, commanders, options,
    bracket, profile, power, verdict, cutPlan, salt, synergy, whatIf, notFound: missing, validation };
  state.hand = null;
  state.tipsCache = null;
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
    if (state.tab === 'informe') renderProfile();
  });
  return { status: 'loading' };
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
  if (state.fetchSt !== 'idle' || !state.result) return;
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
