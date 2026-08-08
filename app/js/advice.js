// Advice engine: pure helpers for power-down / power-up guidance. No DOM.
// Everything derives from rules/pod_rules.json so rules changes need no edits here.
import * as PodEngine from './engine/index.js';
import { KEYWORD_PATTERNS, FAST_MANA_RE, REMINDER_TEXT_RE } from './engine/stats.js';
import { RULES } from './rules.js';
import { cardCache, persistCache } from './state.js';
import { getSynergy } from './synergy.js';

const OPS = {
  '>=': (a, b) => a >= b, '<=': (a, b) => a <= b,
  '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b,
};

// Points the NEXT unit of a dial would cost (0 while inside the free baseline).
export function dialUnitCost(dial, value) {
  const spec = RULES.dials[dial];
  const overflow = RULES.overflow_per_unit !== undefined ? RULES.overflow_per_unit : 1;
  const ptsAt = v => v > spec.baseline_max ? PodEngine.dialPoints(v, spec, overflow) : 0;
  return ptsAt(value + 1) - ptsAt(value);
}

// Which rules conditional (if any) forbids adding one unit of `dial` right now.
// Covers both directions: adding a capped dial while its gate is active, and
// adding the gating dial while a cap is already exceeded.
export function upgradeBlock(dial, stats) {
  const v = d => stats[d] || 0;
  for (const cond of RULES.conditionals || []) {
    if (cond.type === 'penalty') continue;
    const activeAfter = cond.if.dial === dial
      ? OPS[cond.if.op](v(dial) + 1, cond.if.value)
      : OPS[cond.if.op](v(cond.if.dial), cond.if.value);
    if (!activeAfter) continue;
    for (const req of cond.then) {
      const after = req.dial === dial ? v(dial) + 1 : v(req.dial);
      if (!OPS[req.op](after, req.value)) return cond.id;
    }
  }
  return null;
}

// Penalty conditionals (e.g. fast mana + free spells stacking) newly triggered
// by adding one unit of `dial` — added on top of the dial's own unit cost.
export function upgradePenalty(dial, stats) {
  let extra = 0;
  for (const cond of RULES.conditionals || []) {
    if (cond.type !== 'penalty') continue;
    const hit = tests => tests.every(t => OPS[t.op]((stats[t.dial] || 0) + (t.dial === dial ? 1 : 0), t.value));
    const now = cond.if_all.every(t => OPS[t.op](stats[t.dial] || 0, t.value));
    if (!now && hit(cond.if_all)) extra += cond.penalty_points;
  }
  return extra;
}

// Dials that make sense as deliberate power upgrades, strongest-feel first.
const UP_DIALS = ['game_changers', 'tutors', 'combos', 'extra_turns', 'fast_mana', 'free_spells', 'counterspells', 'board_wipes', 'price_10_20', 'price_20_30'];

// All upgrade paths toward Tier 2: point cost of the next unit, whether a
// conditional blocks it, and the room left in the Tier 2 budget.
export function powerUpOptions(result) {
  const stats = result.stats, ev = result.evalRes;
  const room = RULES.tiers.tier2.max_points - ev.points;
  const options = [];
  for (const dial of UP_DIALS) {
    const spec = RULES.dials[dial];
    if (!spec || spec.forbidden) continue;
    if (dial === 'combos') {
      const n = (stats.combo_sizes || []).length;
      const free = spec.free_combos || 0;
      const cost = n < free ? 0 : (spec.size_points['3'] !== undefined ? spec.size_points['3'] : spec.default_size_points);
      options.push({ dial, value: n, cost, blocked: upgradeBlock('combos', { ...stats, combos: n }) });
      continue;
    }
    const value = stats[dial] || 0;
    options.push({ dial, value,
      cost: dialUnitCost(dial, value) + upgradePenalty(dial, stats),
      blocked: upgradeBlock(dial, stats) });
  }
  return { room, options };
}

// Cut candidates to shed points, best cut first: violation-fixers, then most
// points freed, then (tie) the least-played card per EDHREC.
export function orderedCuts(result) {
  const rank = n => (cardCache[n] && cardCache[n].edhrec_rank) || 0;
  const seen = new Map();
  for (const [dial, list] of Object.entries(result.evalRes.driving)) {
    for (const [n] of list) {
      const wi = result.whatIf[n];
      if (!wi || (wi.dPts <= 0 && !wi.fixes)) continue;
      const cur = seen.get(n);
      if (!cur || wi.dPts > cur.dPts) seen.set(n, { name: n, dial, dPts: wi.dPts, fixes: wi.fixes, tier: wi.tier });
    }
  }
  return [...seen.values()].sort((a, b) =>
    (b.fixes ? 1 : 0) - (a.fixes ? 1 : 0) || b.dPts - a.dPts || rank(b.name) - rank(a.name));
}

// Cut candidates to MAKE ROOM for an addition (not about points): cards from
// over-target categories first, then unclassified filler, weakest (least
// played) first. Never lands or commanders.
export function roomCuts(result, overCats, limit = 8) {
  const over = new Set(overCats || []);
  const cmd = new Set(result.commanders || []);
  return result.cardsInfo
    .filter(x => x.cls.type !== 'L' && !cmd.has(x.name))
    .map(x => ({ x, overHit: [...over].some(c => x.cls.cat === c || x.cls.tags.includes(c)),
      filler: x.cls.cat === 'oth' || x.cls.cat === 'cre', rank: x.card.edhrec_rank || 0 }))
    .sort((a, b) => (b.overHit ? 1 : 0) - (a.overHit ? 1 : 0) || (b.filler ? 1 : 0) - (a.filler ? 1 : 0) || b.rank - a.rank)
    .slice(0, limit)
    .map(e => e.x);
}

// Rebuild a pasteable decklist from the parsed deck (for table-mode compare).
export function deckToText(deck) {
  const lines = [];
  for (const c of deck.commanders || []) lines.push('Commander: ' + c);
  const cmds = new Set(deck.commanders || []);
  for (const e of deck.entries) if (!cmds.has(e.name)) lines.push(e.quantity + 'x ' + e.name);
  return lines.join('\n');
}

// Scryfall search per upgrade dial. eur<10 keeps suggestions out of the
// price-band dials so the shown point cost stays honest; the price-band
// dials themselves are the only ones that search above that.
export const UPGRADE_QUERIES = {
  game_changers: { q: 'is:gamechanger f:commander eur<10', gc: true },
  tutors: { q: 'otag:tutor f:commander eur<10', cat: 'tut' },
  extra_turns: { q: 'otag:extra-turn f:commander eur<10' },
  counterspells: { q: 'otag:counterspell f:commander eur<10', cat: 'ctr' },
  board_wipes: { q: 'otag:board-wipe f:commander eur<10', cat: 'wipe' },
  fast_mana: { q: 'otag:ramp t:artifact cmc<=2 f:commander eur<10', cat: 'ramp' },
  free_spells: { q: 'o:"without paying its mana cost" f:commander eur<10' },
  price_10_20: { q: 'eur>=10 eur<20 f:commander', gc: false },
  price_20_30: { q: 'eur>=20 eur<30 f:commander', gc: false },
};

export async function fetchUpgradeCards(dial, result, limit = 4, extraExclude = []) {
  const meta = UPGRADE_QUERIES[dial];
  if (!meta) return [];
  const ci = deckColorIdentity(result);
  const id = ci.length ? ci.join('') : 'c';
  const banned = Object.values(RULES.hard_bans.banned_cards).flat();
  return PodEngine.searchScryfall(meta.q + ' id<=' + id + ' -t:land order:edhrec', {
    excludeNames: [...result.cardsInfo.map(x => x.name), ...extraExclude],
    bannedNames: banned,
    limit, requireCat: meta.cat || null, allowGameChanger: !!meta.gc,
  });
}

// ---- synergy-first advice (the default "improve my deck" answer) ----
// Backbone: EDHREC per-commander synergy scores (see synergy.js). Suggestions
// are filtered to pod-legal, budget-affordable cards not already in the deck;
// cuts are the deck's least plan-relevant cards per the same synergy table.

// Point-scoring dials one added card could bump. game_changers is absent on
// purpose: game changers are excluded from default suggestions entirely.
const ADD_DIALS = ['tutors', 'extra_turns', 'board_wipes', 'counterspells', 'free_spells', 'stax_effects', 'mass_land_denial'];
const PRICE_DIALS = [
  ['price_1_5', p => p >= 1 && p < 5],
  ['price_10_20', p => p >= 10 && p < 20],
  ['price_20_30', p => p >= 20 && p < 30],
];

export function cardDials(card) {
  const oracle = (card.oracle_text || '').replace(REMINDER_TEXT_RE, '');
  const dials = [];
  for (const d of ADD_DIALS) if (KEYWORD_PATTERNS[d].test(oracle)) dials.push(d);
  const isLand = (card.type_line || '').includes('Land');
  if (!isLand && card.cmc !== undefined && card.cmc !== null && card.cmc <= 2 && FAST_MANA_RE.test(oracle)) dials.push('fast_mana');
  if (card.price !== null && card.price !== undefined)
    for (const [d, test] of PRICE_DIALS) if (test(card.price)) { dials.push(d); break; }
  return dials;
}

// Points that adding this one card would cost right now, or null when a pod
// rule forbids it outright (forbidden dial, active conditional).
export function cardAddCost(card, stats) {
  let cost = 0;
  const s = { ...stats };
  for (const dial of cardDials(card)) {
    const spec = RULES.dials[dial];
    if (spec && spec.forbidden) return null;
    if (upgradeBlock(dial, s)) return null;
    cost += dialUnitCost(dial, s[dial] || 0) + upgradePenalty(dial, s);
    s[dial] = (s[dial] || 0) + 1;
  }
  return cost;
}

const frontFace = n => n.split(' // ')[0];

// Cut candidates ordered least-plan-relevant first: lowest EDHREC synergy with
// this commander (absent from the commander's page = below every listed card),
// least-played on ties. Never lands, commanders, or cards from a category the
// deck is short on.
export function synergyCuts(result, synCards, shortfallCats) {
  const synOf = new Map();
  for (const s of synCards) synOf.set(frontFace(s.n), { s: s.s, i: s.pd ? s.nd / s.pd : 0 });
  const short = new Set(shortfallCats || []);
  const cmd = new Set((result.commanders || []).map(frontFace));
  return result.cardsInfo
    .filter(x => {
      if (x.cls.type === 'L' || cmd.has(frontFace(x.name)) || x.cls.cat === 'land') return false;
      if (short.has(x.cls.cat) || x.cls.tags.some(c => short.has(c))) return false;
      // staple guard: low synergy but high inclusion means "everyone runs it"
      // (Sol Ring scores ~0% synergy by construction) — never nominate those
      const e = synOf.get(frontFace(x.name));
      return !e || e.i < 0.3;
    })
    .map(x => { const e = synOf.get(frontFace(x.name)); return { x, syn: e ? e.s : null }; })
    .sort((a, b) => {
      const sa = a.syn === null ? -1 : a.syn, sb = b.syn === null ? -1 : b.syn;
      return sa - sb || (b.x.card.edhrec_rank || 0) - (a.x.card.edhrec_rank || 0);
    });
}

// The synergy picks themselves. Returns null when EDHREC has no page for this
// commander; throws on network errors (caller degrades to category advice).
// Filters: not in deck, pod-legal (bans, €30 cap, color identity, no game
// changers, no forbidden/blocked dials), and never past the Tier 2 point
// budget — an over-budget deck only gets 0-point picks.
export async function synergyAdvice(result, shortfallCats, limit = 6) {
  const syn = await getSynergy(result.commanders);
  if (!syn) return null;
  const inDeck = new Set(result.cardsInfo.map(x => frontFace(x.name)));
  const banned = new Set(Object.values(RULES.hard_bans.banned_cards).flat().map(frontFace));
  const pool = syn.cards
    .filter(c => c.s > 0 && !inDeck.has(frontFace(c.n)) && !banned.has(frontFace(c.n)))
    .sort((a, b) => b.s - a.s)
    .slice(0, 60);
  await PodEngine.fetchCards(pool.map(c => c.n), cardCache);
  persistCache();
  const ci = new Set(deckColorIdentity(result));
  const cap = RULES.hard_bans.max_card_price_eur;
  const budget = Math.max(RULES.tiers.tier2.max_points - result.evalRes.points, 0);
  const short = new Set(shortfallCats || []);
  const picks = [];
  for (const s of pool) {
    const card = cardCache[s.n] || cardCache[frontFace(s.n)];
    if (!card || card.game_changer || card.legal_commander === 'banned') continue;
    if (banned.has(frontFace(card.name))) continue;
    if (card.price === null || card.price > cap) continue;
    if ((card.type_line || '').includes('Land')) continue;
    if (![...(card.color_identity || [])].every(c => ci.has(c))) continue;
    const cost = cardAddCost(card, result.stats);
    if (cost === null || cost > budget) continue;
    const cls = PodEngine.classifyCard(card);
    const fills = [cls.cat, ...cls.tags].find(c => short.has(c)) || null;
    picks.push({ card, cls, cost, fills, synergy: s.s, incl: s.pd ? s.nd / s.pd : null,
      score: s.s + (fills ? 0.12 : 0) - cost * 0.05 });
  }
  picks.sort((a, b) => b.score - a.score);
  return { picks: picks.slice(0, limit), cuts: synergyCuts(result, syn.cards, shortfallCats), slug: syn.slug };
}

export function deckColorIdentity(result) {
  const cmd = result.commander && cardCache[result.commander];
  if (cmd && cmd.color_identity && cmd.color_identity.length) return cmd.color_identity;
  const ci = new Set();
  for (const x of result.cardsInfo) for (const c of x.card.color_identity || []) ci.add(c);
  return [...ci];
}
