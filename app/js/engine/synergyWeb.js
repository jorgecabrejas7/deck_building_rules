// Which cards of a deck work together, read from two sources only: Commander
// Spellbook's combos and Scryfall's tags (data/card_tags.json). It never reads rules
// text, so it misses interactions, and it never touches the points or the brackets.
const front = (n) => String(n).split(" // ")[0];
const MAX_HUBS = 8;
const MIN_HUB_DEGREE = 3; // below this a card has partners, but nothing leans on it

// Tags that feed each other: [one side, other side, reason]. Each reason is the key
// webR_<reason> in i18n.js. Broad tags (draw, ramp, removal) stay out: they would
// link half of any deck and say nothing.
const FEEDS = [
  [["sacrifice-outlet"], ["recursion", "reanimate"], "sacBack"],
  [["sacrifice-outlet"], ["theft"], "sacTheft"],
  [["discard", "mill", "wheel"], ["recursion", "reanimate"], "fillYard"],
  [["board-wipe"], ["recursion", "reanimate"], "wipeBack"],
  [["board-wipe"], ["protection"], "wipeProtect"],
  [["cost-reducer"], ["mana-rock", "mana-dork", "ritual"], "reduceMana"],
  [["tutor"], ["win-condition", "extra-turn"], "tutorFinish"],
  [["protection", "counterspell"], ["win-condition"], "guardFinish"],
];
export const WEB_REASONS = ["combo", ...new Set(FEEDS.map(f => f[2]))];

// cardsInfo: the report's cards. combos: r.bracket.combos. cardTags: name -> Set of tags.
// Returns nodes (connected cards with their degree), edges {a, b, reasons}, hubs with
// their partners grouped by reason, and unconnected (non-land cards with no edge).
export function synergyWeb({ cardsInfo, combos, cardTags }) {
  const lands = new Set(), known = new Set();
  for (const x of cardsInfo) (x.cls.type === "L" ? lands : known).add(front(x.card.name));
  const pieces = (combos || []).map(c => [...c.cards, ...(c.filled || [])].map(front));
  // a land joins only as a piece of a combo
  for (const n of pieces.flat()) if (lands.has(n)) known.add(n);

  const edges = new Map();
  const link = (a, b, reason) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a], key = x + "\n" + y;
    const edge = edges.get(key) || edges.set(key, { a: x, b: y, reasons: [] }).get(key);
    if (!edge.reasons.includes(reason)) edge.reasons.push(reason);
  };
  for (const list of pieces) {
    const inDeck = list.filter(n => known.has(n));
    inDeck.forEach((a, i) => inDeck.slice(i + 1).forEach(b => link(a, b, "combo")));
  }
  const hasTag = (name, tag) => {
    const tags = cardTags && cardTags.get(name);
    // searching for a land is ramp, not a tutor (same call as readCard)
    return !!tags && tags.has(tag) && !(tag === "tutor" && tags.has("land-ramp"));
  };
  const having = (list) => [...known].filter(n => list.some(tag => hasTag(n, tag)));
  for (const [side, other, reason] of FEEDS)
    for (const a of having(side)) for (const b of having(other)) link(a, b, reason);

  const list = [...edges.values()];
  const partners = new Map();
  const add = (n, partner, reasons) => (partners.get(n) || partners.set(n, []).get(n)).push({ partner, reasons });
  for (const e of list) { add(e.a, e.b, e.reasons); add(e.b, e.a, e.reasons); }
  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const nodes = [...partners].map(([name, p]) => ({ name, degree: p.length }))
    .sort((a, b) => b.degree - a.degree || byName(a.name, b.name));
  const hubs = nodes.filter(n => n.degree >= MIN_HUB_DEGREE).slice(0, MAX_HUBS).map(({ name, degree }) => {
    const groups = new Map();
    for (const { partner, reasons } of partners.get(name))
      for (const r of reasons) (groups.get(r) || groups.set(r, []).get(r)).push(partner);
    return { name, degree, groups: [...groups].map(([reason, cards]) => ({ reason, cards: cards.sort(byName) }))
      .sort((a, b) => (b.reason === "combo") - (a.reason === "combo") || b.cards.length - a.cards.length) };
  });
  return { nodes, edges: list, hubs, unconnected: [...known].filter(n => !partners.has(n)).sort(byName) };
}
