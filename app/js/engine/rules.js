import { computeDeckStats } from "./stats.js";

const OPS = {
  ">=": (a, b) => a >= b, "<=": (a, b) => a <= b,
  ">": (a, b) => a > b, "<": (a, b) => a < b, "==": (a, b) => a === b,
};

// ---- tier evaluation (port of tier_rules.evaluate_deck) ----
// Violations/flags are structured {id, ...params}; the UI localizes them.
function dialPoints(value, spec, overflow) {
  const steps = spec.point_steps || {};
  if (steps[String(value)] !== undefined) return steps[String(value)];
  const keys = Object.keys(steps).map(Number);
  if (keys.length) {
    const last = Math.max(...keys);
    if (value > last) return steps[String(last)] + (value - last) * overflow;
    return 0;
  }
  return (value - spec.baseline_max) * overflow;
}

function comboPoints(sizes, spec) {
  const sizePts = spec.size_points || {};
  const def = spec.default_size_points !== undefined ? spec.default_size_points : 1;
  const priced = sizes.map(s => sizePts[String(s)] !== undefined ? sizePts[String(s)] : def)
    .sort((a, b) => b - a);
  return priced.slice(spec.free_combos || 0).reduce((a, b) => a + b, 0);
}

export function evaluateDeck(stats, flagged, rules, cardNames) {
  const violations = [], flags = [];
  let points = 0;
  const breakdown = {};
  const driving = {};
  const names = cardNames ? new Set(cardNames)
    : new Set(Object.values(flagged).flat().map(([n]) => n));

  const bans = rules.hard_bans || {};
  const maxPrice = bans.max_card_price_eur;
  if (maxPrice !== undefined) {
    const over = flagged.price_30_plus || [];
    const deckMax = stats.max_card_price_eur;
    if (over.length || (deckMax !== undefined && deckMax > maxPrice)) {
      violations.push({ id: "price_cap", cap: maxPrice, cards: over.map(([n]) => n), deckMax });
      driving.price_30_plus = over;
    }
  }
  for (const [listName, list] of Object.entries(bans.banned_cards || {})) {
    const hits = list.filter(n => names.has(n)).sort();
    if (hits.length) violations.push({ id: "banned", list: listName, cards: hits });
  }
  // Points never stop: beyond the last priced step, +overflow_per_unit per extra
  // unit. Only "forbidden" dials (mass land denial) violate outright.
  const overflow = rules.overflow_per_unit !== undefined ? rules.overflow_per_unit : 1;
  for (const [dial, spec] of Object.entries(rules.dials)) {
    const value = stats[dial] || 0;
    let pts = 0;
    if (spec.scoring === "per_combo_size") {
      pts = comboPoints(stats.combo_sizes || [], spec);
    } else if (value > spec.baseline_max) {
      pts = dialPoints(value, spec, overflow);
    }
    if (spec.forbidden && value > 0) {
      // Violation AND points: going over pod level never stops the counting.
      violations.push({ id: "dial_forbidden", dial, value });
      driving[dial] = flagged[dial] || [];
    }
    if (pts) {
      points += pts;
      breakdown[dial] = pts;
      if (!driving[dial]) driving[dial] = flagged[dial] || [];
    }
    if (spec.flag_if_over_zero && value > 0) {
      flags.push({ id: spec.flag_if_over_zero, dial, cards: (flagged[dial] || []).map(([n]) => n) });
    }
  }
  for (const cond of rules.conditionals || []) {
    if (cond.type === "penalty") {
      if (cond.if_all.every(t => OPS[t.op](stats[t.dial] || 0, t.value))) {
        points += cond.penalty_points;
        breakdown[cond.id] = cond.penalty_points;
        for (const t of cond.if_all) if (!driving[t.dial]) driving[t.dial] = flagged[t.dial] || [];
      }
      continue;
    }
    const pre = cond.if;
    if (OPS[pre.op](stats[pre.dial] || 0, pre.value)) {
      for (const req of cond.then) {
        const actual = stats[req.dial] || 0;
        if (!OPS[req.op](actual, req.value)) {
          violations.push({ id: "conditional", condId: cond.id, ifDial: pre.dial, ifValue: stats[pre.dial] || 0,
            reqDial: req.dial, reqOp: req.op, reqValue: req.value, actual });
          if (!driving[pre.dial]) driving[pre.dial] = flagged[pre.dial] || [];
          if (!driving[req.dial]) driving[req.dial] = flagged[req.dial] || [];
        }
      }
    }
  }
  const tiers = rules.tiers;
  let tier;
  if (violations.length) tier = "above";
  else if (points <= tiers.tier1.max_points) tier = "tier1";
  else if (points <= tiers.tier2.max_points) tier = "tier2";
  else { tier = "above"; violations.push({ id: "budget", points, max: tiers.tier2.max_points }); }
  return { tier, points, breakdown, violations, flags, driving };
}

// ---- deck validation ----
export function validateDeck(cards, commanders, db, notFound) {
  const issues = [];
  const total = cards.reduce((s, x) => s + x.qty, 0);
  if (total !== 100) issues.push({ id: "count", total });
  for (const x of cards) {
    if (x.qty > 1) {
      const t = x.card.type_line || "";
      const o = x.card.oracle_text || "";
      if (!t.includes("Basic Land") && !/any number of cards named/i.test(o)) {
        issues.push({ id: "singleton", name: x.card.name, qty: x.qty });
      }
    }
  }
  if (commanders && commanders.length) {
    const ci = new Set();
    for (const cn of commanders) { const c = db[cn]; if (c) for (const col of c.color_identity || []) ci.add(col); }
    if (commanders.every(cn => db[cn])) {
      for (const x of cards) {
        const bad = (x.card.color_identity || []).filter(col => !ci.has(col));
        if (bad.length) issues.push({ id: "identity", name: x.card.name, colors: bad });
      }
    }
  }
  for (const x of cards) {
    if (x.card.legal_commander === "banned") issues.push({ id: "banned_official", name: x.card.name });
  }
  for (const n of notFound || []) issues.push({ id: "not_found", name: n });
  return issues;
}

// ---- what-if: recompute tier/points with one card removed ----
export function whatIfCut(entries, db, rules, cardName) {
  const rest = entries.filter(e => e.name !== cardName);
  const { stats, flagged } = computeDeckStats(rest, db);
  const res = evaluateDeck(stats, flagged, rules, rest.map(e => e.name));
  return { points: res.points, tier: res.tier, violations: res.violations.length };
}
