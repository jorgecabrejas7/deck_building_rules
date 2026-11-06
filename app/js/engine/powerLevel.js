// ---- the power level: a reading of its own, in the spirit of commandersalt ----
// It says how strong a deck is, as a practical bracket anchored on precons. It is completely
// apart from the pod's point budget, which alone decides who is in the pod (engine/rules.js),
// and from Wizards' checklist. No one reads this to judge a deck legal.
import { COMBO_TAGS } from "./bracket.js";

const TAG_ORDER = ["R", "S", "P", "O", "C"];

// What sits above the deck's own bracket: it still reads where its strength puts it, and
// these are the things a table may want to look at. Spellbook's own label rates each combo.
function watchList({ bracket, combos, landMaybe, landDenied, gameChangers }) {
  const n = parseFloat(bracket), watch = [];
  for (const tag of TAG_ORDER) {
    const above = combos.filter(c => c.tag === tag && COMBO_TAGS[tag].level > n);
    if (above.length) watch.push({ kind: "combo", tag, items: above.map(c => c.cards.join(" + ")) });
  }
  if (landDenied.length) watch.push({ kind: "land", items: landDenied });
  if (landMaybe.length) watch.push({ kind: "landMaybe", items: landMaybe });
  if (gameChangers.length && n < 3) watch.push({ kind: "gc", items: gameChangers });
  return watch;
}

// checked: false until the combos and salt ratings have loaded.
// floor: from evaluateBrackets, when a land denial card sets a minimum bracket regardless of power.
// precon: from matchPrecon. A precon reads on its strength like any deck, and what it ships with stays a note.
export function powerLevel({ power, rules, checked, floor = null, precon = null, combos = [], landMaybe = [], gameChangers = [] }) {
  // a stock precon is not an upgraded list, whatever its reprints cost today
  const score = precon ? power.base ?? power.score : power.score;
  const powerBracket = rules.power_brackets.brackets.find(([top]) => score <= top)[1];
  const applied = precon ? null : floor;
  const bracket = applied && parseFloat(powerBracket) < applied.bracket ? String(applied.bracket) : powerBracket;
  const watch = watchList({ bracket, combos, landMaybe, gameChangers, landDenied: precon && floor ? floor.mld : [] });
  const tips = combos.filter(c => c.fastPair).map(c => c.cards.join(" + "));
  return { score, bracket, powerBracket, floor: applied, precon, watch, tips, pending: !checked };
}
