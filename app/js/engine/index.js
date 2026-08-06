// PodEngine barrel: pure logic, no DOM. Node-importable (parity test) and
// browser-importable (app). Mirrors scripts/power_metrics.py + scripts/tier_rules.py.
export { computeDeckStats } from "./stats.js";
export { evaluateDeck, validateDeck, whatIfCut, dialPoints } from "./rules.js";
export { detectInput, parseDecklist, guessCommander } from "./decks.js";
export { fetchCards, fetchCheapest, fetchArchidekt, suggestCards, searchScryfall } from "./scryfall.js";
export { manaProduced, isLandRamp } from "./ramp.js";
export { matchCombos } from "./combos.js";
export { classifyCard, detectArchetype } from "./classify.js";
export { runSelfTest } from "./selftest.js";
