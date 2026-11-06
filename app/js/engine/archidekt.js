import { OUT_OF_DECK_RE } from "./decks.js";

// ---- Archidekt deck loading ----
// Archidekt's API refuses browsers, so the server fetches it (deploy/pod.caddy).

export async function fetchArchidekt(id) {
  const res = await fetch("../api/archidekt/" + id);
  if (!res.ok) throw new Error("archidekt " + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.cards)) throw new Error("archidekt returned a non-deck payload");
  // Two ways a card sits outside the 100: the owner unticked its category, or
  // it lives in a maybeboard/sideboard. Archidekt ships Sideboard with
  // includedInDeck:true, so the name check is what actually keeps those cards
  // out of the analysis.
  const excluded = new Set((data.categories || [])
    .filter(c => c.includedInDeck === false || OUT_OF_DECK_RE.test(c.name))
    .map(c => c.name));
  const entries = [];
  const commanders = [];
  for (const c of data.cards || []) {
    const cats = c.categories || [];
    if (cats.some(k => excluded.has(k) || OUT_OF_DECK_RE.test(k))) continue;
    const name = (c.card && c.card.oracleCard && c.card.oracleCard.name) || (c.card && c.card.name);
    if (!name) continue;
    entries.push({ name, quantity: c.quantity || 1 });
    if (cats.some(k => /^commander$/i.test(k))) commanders.push(name);
  }
  return { name: data.name || ("Archidekt #" + id), entries, commanders };
}
