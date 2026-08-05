import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { state, cardCache, persistCache } from './state.js';
import { EXTRA_PTS, dialName } from './ui/constants.js';
import { $ } from './ui/helpers.js';
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
    state.tab = 'power';
  } catch (e) {
    console.error(e); state.error = 'netErr';
  }
  state.busy = false;
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
export function buildTip() {
  const r = state.result, lang = state.lang, ev = r.evalRes;
  const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
  const entries = Object.entries(ev.breakdown).sort((a, b) => b[1] - a[1]);
  const nameOf = k => EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang);
  const listCards = k => (ev.driving[k] || []).slice(0, 3).map(([n]) => n).join(', ');
  if (ev.tier === 'above') {
    const cuts = entries.slice(0, 2).map(([k, p]) => nameOf(k) + ' (−' + p + ' pts: ' + (listCards(k) || '') + ')').join('; ');
    return lang === 'es'
      ? 'Este mazo necesita recortes para sentarse en el pod. Empieza por las violaciones de arriba' + (cuts ? ', y después por lo que más puntos cuesta: ' + cuts : '') + '.'
      : 'This deck needs cuts to sit at the pod. Start with the violations above' + (cuts ? ', then with what costs the most points: ' + cuts : '') + '.';
  }
  if (ev.tier === 'tier2') {
    const need = ev.points - t1;
    const cuts = entries.map(([k, p]) => nameOf(k) + ' (+' + p + ': ' + (listCards(k) || '—') + ')').join('; ');
    return lang === 'es'
      ? 'Tier 2 con ' + ev.points + '/' + t2 + ' puntos. Para bajar a Tier 1 suelta ' + need + ' punto' + (need > 1 ? 's' : '') + ': ' + cuts + '.'
      : 'Tier 2 at ' + ev.points + '/' + t2 + ' points. To drop to Tier 1, shed ' + need + ' point' + (need > 1 ? 's' : '') + ': ' + cuts + '.';
  }
  const margin = t1 - ev.points;
  return lang === 'es'
    ? 'Mazo limpio de Tier 1: ' + ev.points + ' punto' + (ev.points === 1 ? '' : 's') + ' de los ' + t1 + ' permitidos. ' + (margin > 0 ? 'Tienes ' + margin + ' punto' + (margin > 1 ? 's' : '') + ' de margen para una mejora puntual sin salir de Tier 1.' : 'Estás justo en el límite de Tier 1.')
    : 'Clean Tier 1 deck: ' + ev.points + ' point' + (ev.points === 1 ? '' : 's') + ' of the ' + t1 + ' allowed. ' + (margin > 0 ? 'You have ' + margin + ' point' + (margin > 1 ? 's' : '') + ' of headroom for one targeted upgrade without leaving Tier 1.' : 'You are right at the Tier 1 limit.');
}
