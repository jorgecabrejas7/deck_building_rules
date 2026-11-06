// PodEngine barrel: pure logic, no DOM. Node-importable (parity test) and
// browser-importable (app). Mirrors scripts/power_metrics.py + scripts/tier_rules.py.
export { computeDeckStats } from "./stats.js";
export { evaluateDeck, validateDeck, whatIfCut, dialPoints } from "./rules.js";
export { detectInput, parseDecklist, deckFingerprint } from "./decks.js";
export { encodeShare, decodeShare } from "./share.js";
export { fetchCards, fetchCheapest, suggestCards, searchScryfall } from "./scryfall.js";
export { fetchArchidekt } from "./archidekt.js";
export { fetchMoxfield, parseMoxfield } from "./moxfield.js";
export { isLegalCommander, isBackground, canPair, pairKinds, commanderCandidates,
  commanderOptions, normalizeCommanders, pickCommanders } from "./commander.js";
export { evaluateBrackets, BRACKET3, COMBO_TAGS, tagRank } from "./bracket.js";
export { manaProduced, isLandRamp } from "./ramp.js";
export { matchCombos, activeCombos } from "./combos.js";
export { classifyCard, detectArchetype } from "./classify.js";
export { runSelfTest } from "./selftest.js";
export { computeProfile, pipCounts, readCard, indexCardTags } from "./profile.js";
export { saltScore } from "./salt.js";
export { synergyScore } from "./synergyScore.js";
export { computePower, METRIC_RANGE } from "./power.js";
export { simulateGoldfish, drawOdds, atLeastOdds } from "./goldfish.js";
export { powerLevel } from "./powerLevel.js";
export { cardValues } from "./cardValue.js";
export { matchPrecon } from "./precon.js";
export { removeCards, addCard, stacksInDeck, deckDiff, carryPick, editFigures } from "./deckEdit.js";
export { wrapLines, moreList, fitList } from "./fitText.js";
