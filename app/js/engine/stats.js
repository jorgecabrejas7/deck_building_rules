// PodEngine: pure logic, no DOM. Mirrors scripts/power_metrics.py + scripts/tier_rules.py —
// keep semantics in lockstep (scripts/test_engine_parity.js checks this against the Python outputs).

export const KEYWORD_PATTERNS = {
  tutors: /search your library for a card/i,
  extra_turns: /extra turn/i,
  board_wipes: /destroy all creatures|damage to each creature|each creature (?:gets|is destroyed)/i,
  single_target_removal: /(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|attacking or blocking creature)/i,
  counterspells: /counter target [^.\n]{0,60}?spell/i,
  stax_effects: /players can't|opponents can't|skip (?:your|their) (?:draw|untap|upkeep)|your opponents control enter(?:s)? (?:the battlefield )?tapped|spells? (?:[a-z' ]{0,30})?cost \{\d+\} more to cast|(?:don't|doesn't) untap during (?:their|its controller's)|can't attack (?:you|you or planeswalkers)[^.\n]{0,40}unless/i,
  mass_land_denial: /destroy all lands|search .* library for .* lands? and (?:exile|put)/i,
  free_spells: /without paying its mana cost|rather than pay|\bcascade\b/i,
  card_advantage: /draw (?:a card|two cards|three cards|cards equal to)/i,
  protection_effects: /hexproof|indestructible|protection from/i,
};
export const REMINDER_TEXT_RE = /\([^)]*\)/g;
const FAST_MANA_CMC_MAX = 2;
export const FAST_MANA_RE = /add (?:\{[wubrgc0-9]\}|one mana|[a-z]+ mana|\$?\d+ mana)/i;

const PRICE_BANDS = [
  ["price_under_1", p => p < 1],
  ["price_1_5", p => p >= 1 && p < 5],
  ["price_5_10", p => p >= 5 && p < 10],
  ["price_10_20", p => p >= 10 && p < 20],
  ["price_20_30", p => p >= 20 && p < 30],
  ["price_30_plus", p => p >= 30],
];

// ---- deck stats (port of power_metrics.compute_deck_stats) ----
export function computeDeckStats(entries, db) {
  const counter = new Map();
  for (const e of entries) counter.set(e.name, (counter.get(e.name) || 0) + e.quantity);

  let totalPrice = 0, maxCardPrice = 0, pricedQty = 0, landQty = 0, basicQty = 0;
  const cmcValues = [];
  const flagged = {};
  for (const k of Object.keys(KEYWORD_PATTERNS)) flagged[k] = [];
  const gameChangers = [], fastMana = [], unpriced = [];
  const priceBands = {};
  for (const [label] of PRICE_BANDS) priceBands[label] = [];

  for (const [name, qty] of counter) {
    const info = db[name] || {};
    const price = info.price;
    if (price !== undefined && price !== null) {
      totalPrice += price * qty;
      maxCardPrice = Math.max(maxCardPrice, price);
      pricedQty += qty;
      for (const [label, test] of PRICE_BANDS) if (test(price)) { priceBands[label].push([name, qty]); break; }
    } else unpriced.push(name);

    const typeLine = info.type_line || "";
    const oracle = (info.oracle_text || "").replace(REMINDER_TEXT_RE, "");
    const cmc = info.cmc;
    const isLand = typeLine.includes("Land");
    if (isLand) {
      landQty += qty;
      if (typeLine.includes("Basic Land")) basicQty += qty;
    } else {
      if (cmc !== undefined && cmc !== null) {
        for (let i = 0; i < qty; i++) cmcValues.push(cmc);
        if (cmc <= FAST_MANA_CMC_MAX && FAST_MANA_RE.test(oracle)) fastMana.push([name, qty]);
      }
    }
    if (info.game_changer) gameChangers.push([name, qty]);
    for (const [label, re] of Object.entries(KEYWORD_PATTERNS)) {
      if (re.test(oracle)) flagged[label].push([name, qty]);
    }
  }

  const totalCards = [...counter.values()].reduce((a, b) => a + b, 0);
  const stats = {
    total_cards: totalCards,
    unique_cards: counter.size,
    total_price_eur: Math.round(totalPrice * 100) / 100,
    max_card_price_eur: Math.round(maxCardPrice * 100) / 100,
    avg_price_per_card: pricedQty ? Math.round(totalPrice / pricedQty * 100) / 100 : null,
    unpriced_cards: unpriced.length,
    unpriced_names: unpriced,
    land_count: landQty,
    basic_land_count: basicQty,
    nonbasic_land_count: landQty - basicQty,
    avg_cmc: cmcValues.length ? Math.round(cmcValues.reduce((a, b) => a + b, 0) / cmcValues.length * 100) / 100 : null,
    game_changers: gameChangers.reduce((s, [, q]) => s + q, 0),
    fast_mana: fastMana.reduce((s, [, q]) => s + q, 0),
  };
  for (const label of Object.keys(KEYWORD_PATTERNS)) stats[label] = flagged[label].reduce((s, [, q]) => s + q, 0);
  for (const [label] of PRICE_BANDS) stats[label] = priceBands[label].reduce((s, [, q]) => s + q, 0);
  flagged.game_changers = gameChangers;
  flagged.fast_mana = fastMana;
  Object.assign(flagged, priceBands);
  return { stats, flagged };
}
