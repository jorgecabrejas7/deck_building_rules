import { evaluateDeck } from "./rules.js";

// ---- selftest (mirrors tier_rules.py --selftest) ----
function _fake(over, flaggedOver, names) {
  const dials = ["game_changers","extra_turns","tutors","stax_effects","counterspells","board_wipes",
    "free_spells","fast_mana","mass_land_denial","combos","price_1_5","price_10_20","price_20_30","price_30_plus"];
  const stats = {}; for (const d of dials) stats[d] = 0;
  stats.max_card_price_eur = 5.0;
  Object.assign(stats, over);
  const flagged = {}; for (const d of dials) flagged[d] = [];
  Object.assign(flagged, flaggedOver || {});
  return [stats, flagged, names || null];
}

export function runSelfTest(rules) {
  const cases = [
    ["stock precon", _fake({ board_wipes: 2, fast_mana: 6, free_spells: 1 }), "tier1"],
    ["one game changer only", _fake({ game_changers: 1 }), "tier1"],
    ["gc + 5th board wipe = 3pts", _fake({ game_changers: 1, board_wipes: 5 }), "tier2"],
    ["5 counterspells still precon", _fake({ counterspells: 5 }), "tier1"],
    ["20 cards of 1-5 EUR = 1pt", _fake({ price_1_5: 20 }), "tier1"],
    ["25 cards of 1-5 EUR = 2+1 overflow = 3pts", _fake({ price_1_5: 25 }), "tier2"],
    ["31 EUR card", _fake({ max_card_price_eur: 31.0 }, { price_30_plus: [["Pricy", 1]] }), "above"],
    ["two game changers = 2+1 overflow = 3pts", _fake({ game_changers: 2 }), "tier2"],
    ["three tutors = 5+1 overflow = 6pts", _fake({ tutors: 3 }), "tier2"],
    ["five tutors = 5+3 = 8pts busts budget", _fake({ tutors: 5 }), "above"],
    ["two extra turns = 3+1 = 4pts", _fake({ extra_turns: 2 }), "tier2"],
    ["two combos free (precon norm)", _fake({ combos: 2, combo_sizes: [2, 3] }), "tier1"],
    ["four 2-card combos = 3+3 = 6pts", _fake({ combos: 4, combo_sizes: [2, 2, 2, 2] }), "tier2"],
    ["combos [2,3,3,3] = 2+2 = 4pts", _fake({ combos: 4, combo_sizes: [2, 3, 3, 3] }), "tier2"],
    ["combo + tutor conditional", _fake({ combos: 1, combo_sizes: [2], tutors: 1 }), "above"],
    ["mass land denial", _fake({ mass_land_denial: 1 }), "above"],
    ["banned fast mana card", _fake({}, null, ["Mana Crypt"]), "above"],
    ["banned turn recursion", _fake({ extra_turns: 1 }, null, ["Nexus of Fate"]), "above"],
    ["tutor + gc conditional", _fake({ tutors: 1, game_changers: 1 }), "above"],
    ["gc + pricey conditional", _fake({ game_changers: 1, price_10_20: 4 }), "above"],
    ["fast mana 9 + free 5 = 1+1+2 penalty pts", _fake({ fast_mana: 9, free_spells: 5 }), "tier2"],
    ["fast mana 12 + free 5 = 4+1+2 pts, top of T2", _fake({ fast_mana: 12, free_spells: 5 }), "tier2"],
    ["fast mana 12 + free 6 = 4+2+2 pts, busted budget", _fake({ fast_mana: 12, free_spells: 6 }), "above"],
    ["fast mana 15 = 6+1 overflow = 7pts", _fake({ fast_mana: 15 }), "tier2"],
    ["budget blowout 2 tutors + 2 pricey", _fake({ tutors: 2, price_20_30: 1 }), "above"],
    ["tier2 spend: 2 pricey 20-30", _fake({ price_20_30: 2 }), "tier2"],
    ["extra turn flagged", _fake({ extra_turns: 1 }), "tier2"],
  ];
  const results = [];
  for (const [label, [stats, flagged, names], expected] of cases) {
    const res = evaluateDeck(stats, flagged, rules, names);
    let pass = res.tier === expected;
    if (label === "extra turn flagged" && !res.flags.length) pass = false;
    results.push({ label, expected, got: res.tier, points: res.points, pass });
  }
  return { pass: results.every(r => r.pass), results };
}
