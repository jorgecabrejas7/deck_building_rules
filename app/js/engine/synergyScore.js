// ---- deck synergy: how closely the deck follows its commander's EDHREC page ----
// table = getSynergy()'s {slug, cards:[{n, s}]}, or null when EDHREC has no page, which
// reads as "no data", never as zero. This measures fit with what players of the
// commander run, not a card-by-card interaction web, so a brew off the beaten path
// scores low without being badly built.
export function synergyScore({ cardsInfo, commanders, table }) {
  if (!table) return { status: "none" };
  const scores = new Map(table.cards.map(c => [c.n, c.s]));
  const zone = new Set((commanders || []).map(n => String(n).split(" // ")[0]));
  const onPage = [], offPage = [];
  for (const x of cardsInfo) {
    const name = String(x.card.name).split(" // ")[0];
    if (x.cls.type === "L" || zone.has(name)) continue;
    const s = scores.has(x.card.name) ? scores.get(x.card.name) : scores.get(name);
    if (s === undefined) offPage.push(name);
    else onPage.push({ name, s });
  }
  const total = onPage.length + offPage.length;
  if (!total) return { status: "none" };
  onPage.sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  return { status: "done", slug: table.slug,
    coverage: Math.round(onPage.filter(c => c.s > 0).length / total * 100),
    average: Math.round(onPage.reduce((sum, c) => sum + c.s, 0) / total * 100),
    carrying: onPage.slice(0, 6), offPlan: offPage.length };
}
