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
