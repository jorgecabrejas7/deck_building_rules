// PodEngine barrel: pure logic, no DOM. Node-importable (parity test) and
// browser-importable (app). Mirrors scripts/power_metrics.py + scripts/tier_rules.py.
export { analyzeDeck } from "./analyze.js";
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
export { matchCombos, activeCombos, nearCombos, groupNear, nearPlayable } from "./combos.js";
export { classifyCard, detectArchetype } from "./classify.js";
export { runSelfTest } from "./selftest.js";
export { computeProfile, pipCounts, readCard, indexCardTags } from "./profile.js";
export { saltScore, saltBreakdown } from "./salt.js";
export { synergyScore } from "./synergyScore.js";
export { computePower, METRIC_RANGE } from "./power.js";
export { simulateGoldfish, drawOdds, atLeastOdds } from "./goldfish.js";
export * as Goldfish from "./goldfishGame.js";
export { powerLevel } from "./powerLevel.js";
export { cardValues, trimPlan } from "./cardValue.js";
export { parseAverage, compareToAverage } from "./average.js";
export { matchPrecon } from "./precon.js";
export { removeCards, addCard, addRefusal, stacksInDeck, deckDiff, carryPick, editFigures } from "./deckEdit.js";
export { wrapLines, moreList, fitList } from "./fitText.js";
export { budgetTotals, cardmarketUrl, cardmarketWants } from "./budget.js";
export { tableCheck, TABLE_CHECK } from "./tableCheck.js";
export { addVersion, diffCards, versionTimeline, MAX_VERSIONS } from "./history.js";
export { upgradePlan } from "./precon.js";
export { synergyWeb, WEB_REASONS } from "./synergyWeb.js";
