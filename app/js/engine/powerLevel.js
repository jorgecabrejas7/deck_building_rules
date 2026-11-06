// ---- the power level: a reading of its own, in the spirit of commandersalt ----
// It says how strong a deck is, as a practical bracket anchored on precons at Bracket 2.
// It is completely apart from the pod's point budget, which alone decides who is in the
// pod (engine/rules.js), and from Wizards' checklist. No one reads this to judge a deck legal.

// checked: false until the combos and salt ratings have loaded.
// floor: from evaluateBrackets, when a card or combo sets a minimum bracket regardless of power.
// precon: from matchPrecon, when the deck is a stock precon: Bracket 2, whatever else it holds.
export function powerLevel({ power, rules, checked, floor = null, precon = null }) {
  if (precon) return { score: Math.min(power.score, rules.power_brackets.brackets[0][0]), bracket: "2", powerBracket: "2", floor: null, precon, pending: !checked };
  const powerBracket = rules.power_brackets.brackets.find(([top]) => power.score <= top)[1];
  const bracket = floor && parseFloat(powerBracket) < floor.bracket ? String(floor.bracket) : powerBracket;
  return { score: power.score, bracket, powerBracket, floor, precon: null, pending: !checked };
}
