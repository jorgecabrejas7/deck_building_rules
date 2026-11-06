// The pod's ranking over time, read from data/pod_history.json.
// A rank is by power score; equal scores share a rank.

export const podSnapshot = (date, podResults) => ({ date,
  decks: Object.fromEntries(podResults.map(d => [d.podId, { power: d.power.score, points: d.points }])) });

// One snapshot per date, oldest first: a rerun on the same date replaces that date's.
export const addSnapshot = (snapshots, snapshot) =>
  [...snapshots.filter(s => s.date !== snapshot.date), snapshot].sort((a, b) => a.date.localeCompare(b.date));

const ranksOf = (decks, ids) => new Map(ids.map(id =>
  [id, 1 + ids.filter(other => decks[other].power > decks[id].power).length]));

// id -> { rank, change, isNew }. rank is null for a deck the last snapshot hasn't seen.
// change is places gained (negative for lost), null when there is nothing to compare.
// It compares only decks in both snapshots, so a new or removed deck moves nobody else.
export function podRankings(snapshots, podIds) {
  const latest = snapshots.at(-1), previous = snapshots.at(-2);
  if (!latest) return new Map();
  const ranked = podIds.filter(id => latest.decks[id]);
  const rank = ranksOf(latest.decks, ranked);
  const shared = previous ? ranked.filter(id => previous.decks[id]) : [];
  const now = ranksOf(latest.decks, shared), before = previous ? ranksOf(previous.decks, shared) : new Map();
  return new Map(podIds.map(id => [id, {
    rank: rank.get(id) ?? null,
    change: before.has(id) ? before.get(id) - now.get(id) : null,
    isNew: !latest.decks[id] || (!!previous && !previous.decks[id]),
  }]));
}
