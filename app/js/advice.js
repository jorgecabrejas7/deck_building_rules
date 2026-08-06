// Advice engine: pure helpers for power-down / power-up guidance. No DOM.
// Everything derives from rules/pod_rules.json so rules changes need no edits here.
import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { cardCache } from './state.js';

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

export function deckColorIdentity(result) {
  const cmd = result.commander && cardCache[result.commander];
  if (cmd && cmd.color_identity && cmd.color_identity.length) return cmd.color_identity;
  const ci = new Set();
  for (const x of result.cardsInfo) for (const c of x.card.color_identity || []) ci.add(c);
  return [...ci];
}
