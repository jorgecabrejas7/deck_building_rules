// A deck's saved versions: pure list and diff logic. A version is
// {date, points, power, bracket, cards: [[name, quantity], ...]}, oldest first.
import { deckFingerprint } from "./decks.js";

export const MAX_VERSIONS = 20;

// deckFingerprint reads names only; prefixing the quantity makes 32 → 33 Islands a change.
const listKey = (cards) => deckFingerprint(cards.map(([name, qty]) => ({ name: qty + " " + name })));

// The same list as the latest version adds nothing, and the oldest fall off past the cap.
export function addVersion(versions, version) {
  const last = versions[versions.length - 1];
  if (last && listKey(last.cards) === listKey(version.cards)) return versions;
  return [...versions, version].slice(-MAX_VERSIONS);
}

const counts = (cards) => {
  const m = new Map();
  for (const [name, qty] of cards) m.set(name, (m.get(name) || 0) + qty);
  return m;
};
const gained = (from, to) => [...to].filter(([name, n]) => n > (from.get(name) || 0))
  .map(([name, n]) => ({ name, n: n - (from.get(name) || 0) }));

export function diffCards(before, after) {
  const a = counts(before), b = counts(after);
  return { added: gained(a, b), cut: gained(b, a) };
}

// Newest first, each with what changed since the one before; the oldest has no diff.
export const versionTimeline = (versions) => versions
  .map((v, i) => ({ ...v, diff: i ? diffCards(versions[i - 1].cards, v.cards) : null }))
  .reverse();
