// ---- this deck beside its commander's average list on EDHREC ----
// A description for the player, never part of a verdict: nothing in the pod's points,
// the brackets or the power level reads it.
const front = (name) => String(name).split(" // ")[0];
const TYPE_FIELDS = [["C", "creature"], ["I", "instant"], ["S", "sorcery"], ["A", "artifact"], ["E", "enchantment"], ["P", "planeswalker"], ["B", "battle"]];
const CURVE_TOP = 7; // the last column is "7 or more", on both sides
const curveBin = (mv) => Math.min(Math.floor(mv), CURVE_TOP);

// EDHREC's average-deck page, or null when it holds no deck: a pair in the wrong order
// answers 200 with only {redirect}.
export function parseAverage(data) {
  const card = data && data.container && data.container.json_dict && data.container.json_dict.card;
  const manaCurve = data && data.panels && data.panels.mana_curve;
  if (!card || !manaCurve || typeof data.land !== "number") return null;
  const curve = Array(CURVE_TOP + 1).fill(0);
  for (const [mv, n] of Object.entries(manaCurve)) curve[curveBin(+mv)] += n;
  const avg = { name: card.name, decks: card.num_decks || 0, rank: card.rank || null,
    land: data.land, basic: data.basic || 0, nonbasic: data.nonbasic || 0, curve };
  for (const [k, field] of TYPE_FIELDS) avg[k] = data[field] || 0;
  return avg;
}

// Counts the 99 as EDHREC does: the command zone stays out, and a card counts once, under
// the classifier's main type. Rows that are zero on both sides are dropped.
export function compareToAverage({ cardsInfo, commanders, average }) {
  const zone = new Set(commanders.map(front));
  const deck = cardsInfo.filter(x => !zone.has(front(x.card.name)));
  const count = (test) => deck.reduce((n, x) => n + (test(x) ? x.qty : 0), 0);
  const isLand = (x) => x.cls.type === "L";
  const isBasic = (x) => isLand(x) && /\bBasic\b/.test(x.card.type_line || "");
  const row = (k, own, avg) => ({ k, own, avg, diff: own - avg });
  const seen = (r) => r.own || r.avg;
  return {
    types: [...TYPE_FIELDS.map(([k]) => row(k, count(x => x.cls.type === k), average[k])),
      row("land", count(isLand), average.land),
      row("basic", count(isBasic), average.basic),
      row("nonbasic", count(x => isLand(x) && !isBasic(x)), average.nonbasic)].filter(seen),
    curve: average.curve.map((avg, mv) => row(mv, count(x => !isLand(x) && curveBin(x.card.cmc || 0) === mv), avg)).filter(seen),
  };
}
