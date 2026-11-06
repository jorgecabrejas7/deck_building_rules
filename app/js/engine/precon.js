// ---- is this deck a stock precon? ----
// precons = data/precons.json. Precons are Bracket 2 by definition, whatever a later
// game changer list says about their cards, so a deck that is still one reads that way.
// A few swaps keep the label; past that the player has made it their own deck.
const MAX_CHANGES = 5;

export function matchPrecon(entries, precons) {
  const size = entries.reduce((sum, e) => sum + e.quantity, 0);
  const counts = new Map(entries.map(e => [e.name, e.quantity]));
  let best = null;
  for (const d of precons) {
    const shared = d.cards.reduce((sum, [name, qty]) => sum + Math.min(qty, counts.get(name) || 0), 0);
    if (!best || shared > best.shared) best = { name: d.name, date: d.date, shared };
  }
  if (!best || size - best.shared > MAX_CHANGES || best.shared < 100 - MAX_CHANGES) return null;
  return { name: best.name, date: best.date, changes: size - best.shared };
}

// ---- the precon upgrade guide ----
// swaps = [{ card, cutCard }] in the order to make them. Walks them on running stats, so a
// second tutor costs what a second tutor costs, and stops at the first one past `limit`.
// A swap a pod rule forbids (addCost gives null) is passed over. A swap that adds no points
// always fits, even on a deck already over the limit.
// addCost(card, stats) and dials(card) come from advice.js, which needs the browser's rules.
export function upgradePlan(swaps, { points, limit, stats, addCost, dials }) {
  const shift = (from, names, by) => {
    const s = { ...from };
    for (const d of names) s[d] = Math.max((s[d] || 0) + by, 0);
    return s;
  };
  const steps = [];
  let total = points, now = stats;
  for (const swap of swaps) {
    const without = swap.cutCard ? shift(now, dials(swap.cutCard), -1) : now;
    const cost = addCost(swap.card, without);
    if (cost === null) continue;
    // what a card saves is what adding it back would cost
    const effect = cost - (swap.cutCard ? addCost(swap.cutCard, without) || 0 : 0);
    if (effect > 0 && total + effect > limit) return { steps, total, next: { card: swap.card, total: total + effect } };
    total += effect;
    now = shift(without, dials(swap.card), 1);
    steps.push({ ...swap, effect, total });
  }
  return { steps, total, next: null };
}
