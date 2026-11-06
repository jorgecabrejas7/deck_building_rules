// ---- what-if edits: pure operations on a parsed deck {entries, commanders} ----
// Each returns a new deck and leaves the old one untouched, so an undo stack can hold them.
import { deckFingerprint } from "./decks.js";

// One copy per mention: 12 Forests lose one, and naming a card twice takes two. A commander
// leaves the command zone along with its last copy.
export function removeCards(deck, names) {
  const left = new Map(deck.entries.map(e => [e.name, e.quantity]));
  for (const n of names) if (left.has(n)) left.set(n, left.get(n) - 1);
  const entries = deck.entries.filter(e => left.get(e.name) > 0).map(e => ({ ...e, quantity: left.get(e.name) }));
  const kept = new Set(entries.map(e => e.name));
  return { ...deck, entries, commanders: (deck.commanders || []).filter(c => kept.has(c)) };
}

export function addCard(deck, name) {
  const has = deck.entries.some(e => e.name === name);
  return { ...deck, entries: has
    ? deck.entries.map(e => e.name === name ? { ...e, quantity: e.quantity + 1 } : e)
    : [...deck.entries, { name, quantity: 1 }] };
}

// Same rule as validateDeck's singleton check, and snow basics count too.
export const stacksInDeck = (card) => /\bBasic\b/.test(card.type_line || "") || /any number of cards named/i.test(card.oracle_text || "");

export function deckDiff(before, after) {
  const was = new Map(before.entries.map(e => [e.name, e.quantity]));
  const now = new Map(after.entries.map(e => [e.name, e.quantity]));
  const change = (a, b) => [...a].filter(([n, q]) => q > (b.get(n) || 0)).map(([name, q]) => ({ name, qty: q - (b.get(name) || 0) }));
  return { added: change(now, was), removed: change(was, now) };
}

// A commander pick is tied to its deck's fingerprint, and an edit changes that fingerprint:
// the pick follows the deck, minus whoever was cut. A pick for another deck stays ignored.
export function carryPick(pick, before, after) {
  if (!pick || pick.key !== deckFingerprint(before.entries)) return pick;
  const inDeck = new Set(after.entries.map(e => e.name));
  const names = pick.names.filter(n => inDeck.has(n));
  return names.length ? { key: deckFingerprint(after.entries), names } : null;
}

// What the edit bar compares. The readings that wait on the combo check are null until it ends.
export function editFigures(result) {
  const { evalRes, level, bracket, stats } = result;
  return { points: evalRes.points, price: stats.total_price_eur,
    bracket: level.pending ? null : level.bracket,
    power: level.pending ? null : level.score,
    combos: bracket.pending ? null : bracket.combos.length };
}
