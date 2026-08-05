import { REMINDER_TEXT_RE, FAST_MANA_RE } from "./stats.js";

// ---- functional categorization (Archidekt-style, heuristic) ----
const CAT_RULES = [
  ["land", c => c.type_line.includes("Land") && !c.type_line.split(" // ")[0].includes("Creature")],
  ["wipe", c => /destroy all creatures|damage to each creature|each creature (?:gets|is destroyed)|exile all creatures|destroy all (?:other )?(?:nonland )?permanents/i.test(c._o)],
  ["ctr", c => /counter target/i.test(c._o)],
  ["ramp", c => /search (?:your|their) library for (?:a|up to \w+|two)?\s?(?:basic )?lands?\b/i.test(c._o)
      || (!c.type_line.includes("Land") && c.cmc <= 4 && FAST_MANA_RE.test(c._o))
      || /put (?:a|that|those|them|it) (?:land|lands)? ?(?:cards? )?onto the battlefield/i.test(c._o) && /land/i.test(c._o)],
  ["tut", c => /search your library for a card/i.test(c._o)],
  ["rem", c => /(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|attacking or blocking creature)/i.test(c._o)
      || /deals? \d+ damage to (?:target creature|target planeswalker|any target)/i.test(c._o)],
  ["burn", c => /deals? (?:\d+|x) damage to (?:any target|each opponent|target player|target opponent|each player)/i.test(c._o)],
  ["eq", c => /\bEquipment\b/.test(c.type_line) || /\bAura\b/.test(c.type_line)],
  ["drain", c => /each opponent loses \d+ life|opponents? lose (?:\d+|x) life/i.test(c._o) || (/loses? \d+ life/i.test(c._o) && /you gain \d+ life/i.test(c._o))],
  ["sac", c => /sacrifice (?:a|another|two|x) (?:creature|artifact|permanent|token)/i.test(c._o)],
  ["tok", c => /create[sd]? .{0,80}\btokens?\b/i.test(c._o)],
  ["life", c => /(?:you )?gain (?:\d+|x|that much) life|\blifelink\b/i.test(c._o)],
  ["rec", c => /return .{0,60} from your graveyard to (?:your hand|the battlefield)/i.test(c._o)],
  ["prot", c => /hexproof|indestructible|protection from|\bward\b|can't be targeted/i.test(c._o)],
  ["draw", c => /draw (?:a card|two cards|three cards|x cards|cards equal to|that many cards)/i.test(c._o)],
  ["mot", c => /whenever you cast|magecraft|prowess/i.test(c._o)],
  ["anthem", c => /creatures you control get \+/i.test(c._o)],
];

function typeLetter(typeLine) {
  const front = typeLine.split(" // ")[0];
  if (front.includes("Land")) return "L";
  if (front.includes("Creature")) return "C";
  if (front.includes("Planeswalker")) return "P";
  if (front.includes("Instant")) return "I";
  if (front.includes("Sorcery")) return "S";
  if (front.includes("Artifact")) return "A";
  if (front.includes("Enchantment")) return "E";
  if (front.includes("Battle")) return "B";
  return "O";
}

export function classifyCard(card) {
  const c = { ...card, _o: (card.oracle_text || "").replace(REMINDER_TEXT_RE, "") };
  const tags = [];
  for (const [key, test] of CAT_RULES) { try { if (test(c)) tags.push(key); } catch (e) {} }
  const primary = tags.length ? tags[0] : (c.type_line.includes("Creature") ? "cre" : "oth");
  return { type: typeLetter(card.type_line || ""), cat: primary, tags };
}

// ---- archetype detection ----
export function detectArchetype(cards) {
  // cards: [{card, qty, cls}]
  const n = (fn) => cards.reduce((s, x) => s + (fn(x) ? x.qty : 0), 0);
  const o = (re) => cards.reduce((s, x) => s + (re.test((x.card.oracle_text || "")) ? x.qty : 0), 0);
  const tag = (t) => cards.reduce((s, x) => s + (x.cls.tags.includes(t) ? x.qty : 0), 0);
  const nonland = cards.filter(x => x.cls.type !== "L");
  const nlQty = nonland.reduce((s, x) => s + x.qty, 0) || 1;
  const avgCmc = nonland.reduce((s, x) => s + (x.card.cmc || 0) * x.qty, 0) / nlQty;
  const creLow = n(x => x.cls.type === "C" && (x.card.cmc || 0) <= 3);
  const instSorc = n(x => x.cls.type === "I" || x.cls.type === "S");
  const equipOnly = n(x => /\bEquipment\b/.test(x.card.type_line || ""));
  const scores = {
    voltron: (equipOnly + n(x => /\bAura\b/.test(x.card.type_line || ""))) * 1.5 + tag("prot") * 0.5,
    aristocrats: tag("sac") * 2 + tag("drain") * 2 + o(/whenever .{0,40}(?:dies|is put into a graveyard)/i) * 0.7,
    control: tag("ctr") * 2 + tag("wipe") * 1.5 + (avgCmc > 3 ? 2 : 0),
    tokens: tag("tok") * 1.4,
    aggro: (avgCmc < 2.8 ? creLow * 0.7 : 0) + o(/\bhaste\b/i) * 0.5,
    equipment: equipOnly * 2.5,
    lifegain: tag("life") * 1.2,
    spellslinger: (instSorc >= 22 ? instSorc * 0.4 : 0) + o(/whenever you cast (?:an instant|a sorcery|an instant or sorcery|a noncreature)/i) * 2 + o(/magecraft/i) * 2,
    counters: o(/\+1\/\+1 counter/i) * 0.8 + o(/proliferate/i) * 1.5,
    reanimator: o(/return .{0,60}creature .{0,40}graveyard .{0,20}(?:to the )?battlefield/i) * 2.5 + o(/\bmill\b|discard .{0,30}card/i) * 0.5,
  };
  let best = "generic", bestScore = 11; // threshold: below this, call it generic
  for (const [k, v] of Object.entries(scores)) if (v > bestScore) { best = k; bestScore = v; }
  return { key: best, scores };
}
