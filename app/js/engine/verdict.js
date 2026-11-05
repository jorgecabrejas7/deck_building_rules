// ---- the pod verdict: power decides who is in, the banned list has the last word ----
// The score reads as a practical bracket anchored on precons at Bracket 2: 2, 2*, 3, 3*...
// That is our estimate of how a deck plays, separate from Wizards' written checklist.
// Points and price dials still run and are reported, but no longer decide anything.
import { computeDeckStats } from "./stats.js";
import { computeProfile } from "./profile.js";
import { computePower } from "./power.js";

const tierFor = (score, limits) => score <= limits.tier1_max ? "tier1" : score <= limits.tier2_max ? "tier2" : "above";

// checked: false while the combo check is pending. Power cannot yet see the deck's
// combos, so the tier is provisional: it can only rise once they land.
export function podVerdict({ power, evalRes, rules, checked }) {
  const limits = rules.power_tiers;
  const bracket = limits.brackets.find(([top]) => power.score <= top)[1];
  const banned = evalRes.violations.filter(v => v.id === "banned").flatMap(v => v.cards);
  return { tier: banned.length ? "above" : tierFor(power.score, limits), byPower: tierFor(power.score, limits),
    score: power.score, bracket, banned, limits, pending: !checked };
}

// The cuts that bring a deck into the pod, tracking power after each one. Greedy on the
// cards doing the most scored jobs: it may not be the shortest list, but each step is
// real because it reruns the score. Banned cards must go regardless, so they lead.
const CUT_SEARCH_GAMES = 100;
const MAX_CUTS = 8;

export function powerCutPlan({ entries, db, combos, commanders, cardTags, classify, rules, banned = [] }) {
  const zone = new Set((commanders || []).map(n => String(n).split(" // ")[0]));
  const front = (n) => String(n).split(" // ")[0];
  const limit = rules.power_tiers.tier2_max;
  const measure = (list) => {
    const names = new Set(list.map(e => front(e.name)));
    const { stats } = computeDeckStats(list, db);
    const cardsInfo = list.map(e => ({ card: db[e.name], qty: e.quantity, name: e.name, cls: classify(db[e.name]) }));
    const live = combos.filter(c => [...c.cards, ...(c.filled || [])].every(n => names.has(n)));
    const profile = computeProfile({ cardsInfo, stats, combos: live, commanders, cardTags, games: CUT_SEARCH_GAMES });
    return computePower(profile, stats);
  };
  let rest = entries.filter(e => !banned.some(b => front(b) === front(e.name)));
  const steps = banned.map(card => ({ card: front(card), banned: true }));
  let power = measure(rest);
  if (steps.length) steps[steps.length - 1].power = power.score;
  while (power.score > limit && steps.filter(s => !s.banned).length < MAX_CUTS) {
    let best = null;
    for (const { name } of power.keyCards) {
      if (zone.has(name)) continue;
      const without = rest.filter(e => front(e.name) !== name);
      const after = measure(without);
      if (!best || after.score < best.after.score) best = { name, without, after };
    }
    if (!best || best.after.score >= power.score) break;
    rest = best.without;
    power = best.after;
    steps.push({ card: best.name, power: power.score });
  }
  return { steps, reaches: power.score <= limit, final: power.score };
}
