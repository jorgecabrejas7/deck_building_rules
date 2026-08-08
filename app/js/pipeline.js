import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { state, cardCache, persistCache } from './state.js';
import { T } from './i18n.js';
import { $, announce } from './ui/helpers.js';
import { renderInput } from './ui/input.js';
import { renderBanner } from './ui/tabbar.js';
import { renderAll } from './main.js';

export async function analyze() {
  const text = $('deckText').value;
  const det = PodEngine.detectInput(text);
  if (det.kind === 'moxfield') { state.error = 'mox'; renderInput(); return; }
  state.busy = true; state.error = null; renderInput();
  try {
    let parsed;
    if (det.kind === 'archidekt') {
      try {
        try { parsed = await PodEngine.fetchArchidekt(det.id, false); }
        catch (e) { parsed = await PodEngine.fetchArchidekt(det.id, true); }
      } catch (e) { state.error = 'archErr'; state.busy = false; renderInput(); return; }
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
export async function checkCombos() {
  if (!state.result || (state.combosData && state.combosData.status === 'checking')) return;
  state.combosData = { status: 'checking', list: [], count: 0 };
  renderAll();
  try {
    const list = PodEngine.matchCombos(state.deck.entries.map(e => e.name), await getComboDb());
    state.combosData = { status: 'done', list, count: list.length, dbVersion: comboDb.version };
    recompute();
    const inf = list.filter(c => c.infinite).length;
    announce(inf ? T().srCombos + ' ' + inf : T().comboNone);
  } catch (e) {
    console.error(e);
    state.combosData = { status: 'error', list: [], count: 0 };
    announce(T().comboErr);
  }
  renderAll();
}

export function recompute(notFound) {
  const parsed = state.deck;
  const resolved = parsed.entries.filter(e => cardCache[e.name]);
  const { stats, flagged } = PodEngine.computeDeckStats(resolved, cardCache);
  const _cd = state.combosData && state.combosData.status === 'done' ? state.combosData : null;
  stats.combos = _cd ? _cd.count : 0;
  stats.combo_sizes = _cd ? _cd.list.filter(c => c.infinite).map(c => c.n) : [];
  const evalRes = PodEngine.evaluateDeck(stats, flagged, RULES, resolved.map(e => e.name));
  const cardsInfo = resolved.map(e => ({ card: cardCache[e.name], qty: e.quantity, name: e.name,
    cls: PodEngine.classifyCard(cardCache[e.name]) }));
  const detected = PodEngine.detectArchetype(cardsInfo);
  const commander = (parsed.commanders && parsed.commanders[0]) || PodEngine.guessCommander(resolved, cardCache);
  const commanders = parsed.commanders && parsed.commanders.length ? parsed.commanders : (commander ? [commander] : []);
  const validation = PodEngine.validateDeck(cardsInfo, commanders, cardCache,
    notFound !== undefined ? notFound : (state.result ? state.result.notFound : []));
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
  state.result = { stats, flagged, evalRes, cardsInfo, detected, commander, commanders, whatIf,
    notFound: notFound !== undefined ? notFound : (state.result ? state.result.notFound : []), validation };
  state.hand = null;
  state.tipsCache = null;
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

// ================= advice (tip) =================
// One short verdict sentence; the ordered lists below it carry the detail.
export function buildTip() {
  const r = state.result, lang = state.lang, ev = r.evalRes, es = lang === 'es';
  const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
  if (ev.tier === 'above') {
    const over = Math.max(ev.points - t2, 0);
    return es
      ? 'Sobre el nivel del pod' + (over ? ' (+' + over + ' pts sobre Tier 2)' : '') + ': arregla las violaciones y sigue el orden de cortes.'
      : 'Above pod level' + (over ? ' (+' + over + ' pts over Tier 2)' : '') + ': fix the violations and follow the cut order.';
  }
  if (ev.tier === 'tier2') {
    const need = ev.points - t1, room = t2 - ev.points;
    return es
      ? 'Tier 2 (' + ev.points + '/' + t2 + '). Bajar a Tier 1: −' + need + ' pts. Subir dentro de Tier 2: +' + room + ' pts de margen.'
      : 'Tier 2 (' + ev.points + '/' + t2 + '). Drop to Tier 1: shed ' + need + ' pts. Climb within Tier 2: ' + room + ' pts of headroom.';
  }
  const margin = t1 - ev.points, room = t2 - ev.points;
  return es
    ? 'Tier 1 limpio (' + ev.points + '/' + t1 + '). Margen: +' + margin + ' pts sin salir de Tier 1, +' + room + ' hasta el tope de Tier 2.'
    : 'Clean Tier 1 (' + ev.points + '/' + t1 + '). Headroom: +' + margin + ' pts inside Tier 1, +' + room + ' to the Tier 2 cap.';
}
