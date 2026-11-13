// ---- Moxfield deck loading ----
// Moxfield's API refuses browsers, so the server fetches it (deploy/pod.caddy).
// It has no official public API: a refusal here means the player pastes the list instead.

// Only the commanders and the main deck count toward the 100; the sideboard (companions too) and maybeboard are kept apart.
export function parseMoxfield(data) {
  const board = (key) => Object.values((data.boards && data.boards[key] && data.boards[key].cards) || {})
    .filter(c => c.card && c.card.name).map(c => ({ name: c.card.name, quantity: c.quantity || 1 }));
  const commanders = board("commanders");
  return { name: data.name || "Moxfield", entries: [...commanders, ...board("mainboard")], commanders: commanders.map(c => c.name),
    side: [...board("sideboard"), ...board("companions")], maybe: board("maybeboard") };
}

export async function fetchMoxfield(id) {
  const res = await fetch("../api/moxfield/" + id);
  if (!res.ok) throw new Error("moxfield " + res.status);
  const parsed = parseMoxfield(await res.json());
  if (!parsed.entries.length) throw new Error("moxfield returned an empty deck");
  return parsed;
}
