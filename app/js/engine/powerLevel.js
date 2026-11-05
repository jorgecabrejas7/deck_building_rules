// ---- the power level: a reading of its own, in the spirit of commandersalt ----
// It says how strong a deck is, as a practical bracket anchored on precons at Bracket 2.
// It is completely apart from the pod's point budget, which alone decides who is in the
// pod (engine/rules.js), and from Wizards' checklist. No one reads this to judge a deck legal.

// checked: false until the combos and salt ratings have loaded.
// floor: from evaluateBrackets, when a card or combo sets a minimum bracket regardless of power.
export function powerLevel({ power, rules, checked, floor = null }) {
  const powerBracket = rules.power_brackets.brackets.find(([top]) => power.score <= top)[1];
  const bracket = floor && parseFloat(powerBracket) < floor.bracket ? String(floor.bracket) : powerBracket;
  return { score: power.score, bracket, powerBracket, floor, pending: !checked };
}
