// ---- what the deck costs: pure, so the page and the tests read the same totals ----
const PRICIEST = 10;
const round = (v) => Math.round(v * 100) / 100;
const frontFace = (name) => String(name).split(" // ")[0];

// Which cards are worth a cheapest-printing lookup: under €1 the default price stands.
export const needsCheapest = (card) => card.price != null && card.price >= 1 && !card.cheapest;

// A card looked up before price_default existed only remembers its cheapest price, so
// its default is unknown and atDefault can read low; defaultUnknown lets the page say so.
export function budgetTotals(cardsInfo) {
  const priced = cardsInfo.filter(x => x.card.price != null);
  const defaultOf = (card) => card.price_default ?? card.price;
  const sum = (priceOf) => round(priced.reduce((s, x) => s + priceOf(x.card) * x.qty, 0));
  const pending = priced.filter(x => needsCheapest(x.card)).length;
  const atDefault = sum(defaultOf);
  // with lookups missing, any "cheapest" total would be a made-up saving
  const atCheapest = pending ? null : sum(card => card.price);
  return {
    atDefault, atCheapest, pending,
    saving: pending ? null : round(atDefault - atCheapest),
    defaultUnknown: priced.filter(x => x.card.cheapest && x.card.price_default == null).length,
    unpriced: cardsInfo.length - priced.length,
    priciest: [...priced].sort((a, b) => b.card.price - a.card.price || a.card.name.localeCompare(b.card.name))
      .slice(0, PRICIEST).map(x => ({ name: x.card.name, qty: x.qty, price: x.card.price, priceDefault: defaultOf(x.card) })),
  };
}

// Cardmarket's product names vary for two-faced cards; the front face always finds them.
export const cardmarketUrl = (name) =>
  "https://www.cardmarket.com/en/Magic/Products/Search?searchString=" + encodeURIComponent(frontFace(name));

export const cardmarketWants = (cardsInfo) => cardsInfo.map(x => x.qty + " " + x.card.name).join("\n");
