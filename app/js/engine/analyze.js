// One deck through the whole chain: stats, rules, bracket, profile, power. Pure and
// synchronous, so the app and the study scripts read a deck the same way.
// `combos` is the deck's matchCombos list, or null while the combo check has not run;
// synergy (an async EDHREC fetch) is left to the caller.
import { computeDeckStats } from "./stats.js";
import { evaluateDeck, validateDeck, whatIfCut } from "./rules.js";
import { commanderOptions, normalizeCommanders, pickCommanders } from "./commander.js";
import { activeCombos } from "./combos.js";
import { classifyCard, detectArchetype } from "./classify.js";
import { evaluateBrackets } from "./bracket.js";
import { computeProfile } from "./profile.js";
import { saltScore, saltBreakdown } from "./salt.js";
import { computePower } from "./power.js";
import { powerLevel } from "./powerLevel.js";
import { matchPrecon } from "./precon.js";

export function analyzeDeck({ parsed, db, rules, pick = null, combos = null, comboDb = null,
  landDenial = null, saltDb = null, cardTags = null, precons = null, notFound = [], games }) {
  const resolved = parsed.entries.filter(e => db[e.name]);
  const { stats, flagged } = computeDeckStats(resolved, db);
  const picked = normalizeCommanders(pick, resolved, db);
  const commanders = picked.length ? picked : pickCommanders(parsed, db);
  const commander = commanders[0] || null;
  const active = combos ? activeCombos(combos, commanders) : null;
  const infinite = (active || []).filter(c => c.infinite);
  stats.combos = infinite.length;
  stats.combo_sizes = infinite.map(c => c.n);
  const evalRes = evaluateDeck(stats, flagged, rules, resolved.map(e => e.name));
  const cardsInfo = resolved.map(e => ({ card: db[e.name], qty: e.quantity, name: e.name, cls: classifyCard(db[e.name]) }));
  const detected = detectArchetype(cardsInfo);
  const options = commanderOptions(resolved, db);
  const validation = validateDeck(cardsInfo, commanders, db, notFound);
  const bracket = evaluateBrackets({
    stats, flagged, db, validation, commanders,
    deckNames: resolved.map(e => e.name),
    combos: active, comboDb, landDenial,
    loopCards: rules.hard_bans.banned_cards.extra_turn_recursion,
    unresolved: notFound.length,
  });
  const profile = computeProfile({ cardsInfo, stats, combos: active ? bracket.combos : null, commanders, cardTags, games });
  const salt = saltDb ? saltScore(resolved.map(e => e.name), saltDb) : null;
  const saltParts = saltDb ? saltBreakdown({ cardsInfo, saltDb, cardTags, landDenial, combos: active ? bracket.combos : null }) : null;
  const power = computePower(profile, stats, salt);
  const level = powerLevel({ power, rules, checked: !!active && !!salt, floor: active ? bracket.floor : null,
    precon: precons ? matchPrecon(resolved, precons) : null,
    combos: active ? bracket.combos : [], landMaybe: bracket.landMaybe, gameChangers: bracket.checks.find(c => c.id === "game_changers").cards });
  // what-if cut deltas for every card that drives a points dial or violation
  const drivingNames = new Set();
  for (const list of Object.values(evalRes.driving)) for (const [n] of list) drivingNames.add(n);
  const whatIf = {};
  const comboPts = evalRes.breakdown.combos || 0;
  for (const n of drivingNames) {
    const wi = whatIfCut(resolved, db, rules, n);
    whatIf[n] = { dPts: evalRes.points - comboPts - wi.points, tier: wi.tier,
      fixes: evalRes.violations.length > 0 && wi.violations < evalRes.violations.length };
  }
  return { stats, flagged, evalRes, cardsInfo, detected, commander, commanders, options,
    bracket, profile, power, level, salt, saltParts, whatIf, notFound, validation };
}
