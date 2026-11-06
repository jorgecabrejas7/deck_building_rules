import { oracleOf } from "./profile.js";
import { KEYWORD_PATTERNS } from "./stats.js";

// ---- deck salt: EDHREC's community ratings, summed ----
// saltDb = data/salt.json. Each card's rating is the community's 0-4 frustration
// poll; a card nobody rated adds nothing. Informative only, never part of a verdict.
// EDHREC's poll rates basics too (Island 0.92), but nobody salts a deck for running lands.
const BASICS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
  "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"]);

const front = (n) => String(n).split(" // ")[0];

// The deck's rated cards, once each by front face, saltiest first.
function ratedCards(names, saltDb) {
  const ratings = saltDb.salt || {};
  const seen = new Set();
  const rated = [];
  for (const name of names) {
    const card = front(name);
    if (seen.has(card)) continue;
    seen.add(card);
    if (ratings[card] && !BASICS.has(card)) rated.push({ name: card, salt: ratings[card] });
  }
  return rated.sort((a, b) => b.salt - a.salt || a.name.localeCompare(b.name));
}

export function saltScore(names, saltDb) {
  const rated = ratedCards(names, saltDb);
  const total = rated.reduce((s, c) => s + c.salt, 0);
  return { total: Math.round(total * 10) / 10, rated: rated.length,
    average: rated.length ? Math.round(total / rated.length * 100) / 100 : 0, top: rated.slice(0, 8) };
}

// Hits the whole table: "damage to each opponent", "each player loses 2 life", and
// punishers that name no target ("whenever an opponent draws ... damage to that player").
const GROUP_DAMAGE_RE = /damage to (?:[^.]*\b)?each (?:other )?(?:opponent|player)|each (?:other )?(?:opponent|player) loses [^.]*\blife\b|\b(?:each|an?) (?:other )?(?:opponent|player)\b[^.]*damage to (?:that player|them)\b/i;

// The part of the stax read that charges rather than stops.
const TAX_RE = /more to cast|can't attack [^.]*unless/i;

// A card's strongest category. Effects first, in the order the community rates them
// (average salt: land denial 1.5, extra turns 0.8, hatebears 0.6, theft 0.5, taxes 0.4,
// burn 0.3); combo and game changer only name a card with no such effect of its own.
function category(x, name, cardTags, denial, pieces) {
  const tags = cardTags && cardTags.get(name);
  const has = (tag) => !!tags && tags.has(tag);
  if (denial.has(name)) return "land_denial";
  if (has("extra-turn")) return "extra_turns";
  if (has("hatebear")) return "stax";
  if (has("theft")) return "theft";
  if (has("tax")) return "taxes";
  const o = oracleOf(x.card);
  // Scryfall tags neither Stasis nor Propaganda, so the text fills in what the tags miss
  if (KEYWORD_PATTERNS.stax_effects.test(o)) return TAX_RE.test(o) ? "taxes" : "stax";
  if (GROUP_DAMAGE_RE.test(o)) return "group_damage";
  if (pieces.has(name)) return "combos";
  if (x.card.game_changer) return "game_changers";
  return "other";
}

// Where the deck's salt comes from. Each rated card lands in one category, so the parts
// sum to saltScore's total. Informative only, never scored. share is a percentage of the
// total; salt is left unrounded so the sum holds.
// cardTags, landDenial and combos are null until they load; a card then reads as less.
export function saltBreakdown({ cardsInfo, saltDb, cardTags, landDenial, combos }) {
  const byName = new Map(cardsInfo.map(x => [front(x.name), x]));
  const denial = new Set(landDenial ? [...landDenial.mass, ...landDenial.maybe] : []);
  const pieces = new Set((combos || []).flatMap(c => c.cards.map(front)));
  const parts = new Map();
  let sum = 0;
  for (const c of ratedCards(cardsInfo.map(x => x.name), saltDb)) {
    const key = category(byName.get(c.name), c.name, cardTags, denial, pieces);
    const part = parts.get(key) || parts.set(key, { key, salt: 0, cards: [] }).get(key);
    part.salt += c.salt;
    part.cards.push(c);
    sum += c.salt;
  }
  const list = [...parts.values()].map(p => ({ ...p, share: Math.round(p.salt / sum * 100) }));
  // "other" says the least, so it closes the list whatever its size
  return list.sort((a, b) => (a.key === "other") - (b.key === "other") || b.salt - a.salt);
}
