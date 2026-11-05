// ---- power: an estimate on a 1-10 scale, ours and not anyone else's ----
// Four pillars read off the deck profile. Each metric is placed between where a
// weak precon sits (0) and where the median cEDH list sits (1), so "60" on a pillar
// reads as "60% of the way from a weak precon to cEDH".
// Informative only: it never decides a pod tier or a bracket.

// [low, high] per metric, set from `node scripts/deck_study.js --metrics`:
// low = where weak precons sit, high = the median cEDH list. avgMv runs
// the other way. Measures that do not separate precons from cEDH in the study (total
// and cheap draw, removal count, recursion, colour coverage) stay in the profile but out of the score.
export const METRIC_RANGE = {
  tutors: [2, 16],
  avgMv: [3.7, 2], cheap: [13, 50], fastMana: [3, 13], ramp: [9, 24], quality: [76, 100],
  cheapAnswers: [2, 8], counters: [0, 10], stax: [0, 8], free: [0, 4], answersTotal: [8, 22],
  ending: [0, 4], lines: [0, 2], winBy8: [0, 60], web: [0, 12], engine: [8, 28],
};
// Game Changers are not a metric: each already scores for what it does, as a tutor or
// fast mana, and counting the list too paid for the same card twice.
const PILLAR_WEIGHT = { consistency: 0.15, efficiency: 0.25, interaction: 0.3, wins: 0.3 };
const PILLARS = {
  consistency: ["tutors"],
  efficiency: ["avgMv", "cheap", "fastMana", "ramp", "quality"],
  interaction: ["cheapAnswers", "counters", "stax", "free", "answersTotal"],
  wins: ["ending", "lines", "winBy8", "web"],
};
// A deck wins through combos or through an engine, so that pillar takes the better of
// the two: averaging would punish a specialist. An engine alone is slower and easier
// to answer than a combo, hence its ceiling. Deep themes are normal in precons, so one
// only counts once the deck around it is above precon level on efficiency and interaction.
const ENGINE_CEILING = 0.5;
const ENGINE_SUPPORT = [35, 50];

// The score broken into questions a player asks. Every scored metric belongs to one
// benchmark, so these explain the number without changing it. Resilience is read the
// same way but left out of the score: in the study it did not separate precons from cEDH.
const BENCHMARKS = [
  ["manaSpeed", "efficiency", ["fastMana", "ramp"]], ["curve", "efficiency", ["avgMv", "cheap"]], ["lands", "efficiency", ["quality"]],
  ["finding", "consistency", ["tutors"]],
  ["answers", "interaction", ["cheapAnswers", "counters", "answersTotal"]], ["denial", "interaction", ["stax"]], ["freeSpells", "interaction", ["free"]],
  ["winSpeed", "wins", ["winBy8"]], ["backups", "wins", ["ending", "lines", "web"]], ["engine", "wins", ["engine"]],
];
const RESILIENCE_RANGE = { draw: [6, 20], protection: [1, 8], recursion: [1, 6] };
const RESILIENCE = [["cardFlow", ["draw"]], ["shielding", ["protection"]], ["recovery", ["recursion"]]];
const TIERS = [[0.9, "S"], [0.65, "A"], [0.35, "B"], [0.1, "C"], [-Infinity, "F"]];
const tierOf = (x) => TIERS.find(([min]) => x >= min)[1];

// Stock precons run about 5 cards worth €3 or more; decks someone has upgraded run about
// 16. Price says nothing about strength (rank correlation 0.03), so this is only evidence
// that a deck is past stock level, and it needs a playable list behind it: a pile of
// pricey cards nobody plays (median EDHREC rank past 5000) doesn't count.
// A deck already past the casual band has its strength in the score: no lift needed.
const UPGRADED = { pricey: 10, medianRank: 5000, bonus: 0.5, floor: 4, onlyBelow: 5.5 };
const isUpgraded = ({ upgrade }) => !!upgrade && upgrade.pricey >= UPGRADED.pricey &&
  upgrade.medianRank !== null && upgrade.medianRank <= UPGRADED.medianRank;

// raw pillar average -> score. Flat through the casual middle, steep toward cEDH,
// the same shape commandersalt describes, with knots set from the study.
const CURVE = [[0, 1.5], [20, 3.5], [40, 5.5], [60, 7.5], [85, 9.5], [100, 10]];

function toScale(raw) {
  for (let i = 1; i < CURVE.length; i++) {
    const [x0, y0] = CURVE[i - 1], [x1, y1] = CURVE[i];
    if (raw <= x1) return y0 + (y1 - y0) * (raw - x0) / (x1 - x0);
  }
  return CURVE[CURVE.length - 1][1];
}

function metricsOf(profile, stats) {
  const { speed, consistency, interaction, wins, manabase } = profile;
  return {
    tutors: consistency.tutors,
    avgMv: speed.avgMv, cheap: speed.cheap, fastMana: speed.fastMana, ramp: speed.ramp, quality: manabase.quality,
    cheapAnswers: interaction.cheapAnswers, counters: interaction.counters, answersTotal: interaction.removal + interaction.wipes + interaction.counters,
    stax: interaction.stax, free: interaction.free,
    ending: wins.ending, lines: wins.lines, winBy8: profile.goldfish.winBy ? profile.goldfish.winBy[8] : null, web: wins.web, engine: profile.shape.engine.count,
  };
}

// 0..1 between the metric's two anchors. No reading counts as the low end.
function place(key, value) {
  const [lo, hi] = METRIC_RANGE[key];
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

export function computePower(profile, stats) {
  const metrics = metricsOf(profile, stats);
  const pillars = {}, placed = {};
  for (const [pillar, keys] of Object.entries(PILLARS)) {
    for (const k of keys) placed[k] = place(k, metrics[k]);
    pillars[pillar] = Math.round(keys.reduce((s, k) => s + placed[k], 0) / keys.length * 100);
  }
  placed.engine = place("engine", metrics.engine);
  const support = (pillars.efficiency + pillars.interaction) / 2;
  const supported = Math.max(0, Math.min(1, (support - ENGINE_SUPPORT[0]) / (ENGINE_SUPPORT[1] - ENGINE_SUPPORT[0])));
  pillars.wins = Math.round(Math.max(pillars.wins, placed.engine * supported * ENGINE_CEILING * 100));
  const raw = Object.entries(PILLAR_WEIGHT).reduce((sum, [k, w]) => sum + pillars[k] * w, 0);
  const metricValue = { ...metrics, draw: profile.consistency.draw, protection: profile.interaction.protection, recursion: profile.consistency.recursion };
  const bench = (key, pillar, keys, scored, at) => {
    const share = keys.reduce((sum, k) => sum + at(k), 0) / keys.length;
    return { key, pillar, scored, tier: tierOf(share), values: keys.map(k => ({ key: k, value: metricValue[k] })),
      cards: [...new Set(keys.flatMap(k => profile.ledger[k] || []))] };
  };
  const benchmarks = [
    ...BENCHMARKS.map(([key, pillar, keys]) => bench(key, pillar, keys, true, k => placed[k])),
    ...RESILIENCE.map(([key, keys]) => bench(key, "resilience", keys, false, (k) => {
      const [lo, hi] = RESILIENCE_RANGE[k];
      return Math.max(0, Math.min(1, (metricValue[k] - lo) / (hi - lo)));
    })),
  ];
  // the cards doing the most scored jobs at once
  const jobs = new Map();
  for (const b of benchmarks) if (b.scored) for (const n of b.cards) jobs.set(n, (jobs.get(n) || 0) + 1);
  const keyCards = [...jobs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([name, count]) => ({ name, count }));
  const base = toScale(raw);
  const score = isUpgraded(profile) && base < UPGRADED.onlyBelow ? Math.min(Math.max(base + UPGRADED.bonus, UPGRADED.floor), UPGRADED.onlyBelow) : base;
  return { score: Math.min(10, Math.round(score * 10) / 10), upgraded: isUpgraded(profile), raw: Math.round(raw * 10) / 10, pillars, metrics, benchmarks, keyCards,
    fingerprint: fingerprint(profile, metrics, placed) };
}

// A few plain facts about the deck's shape, each only when it clearly stands out.
function fingerprint(profile, metrics, placed) {
  const marks = [];
  const top = profile.shape.archetypes[0];
  if (top && top.share >= 25) marks.push({ key: "arch", arch: top.key });
  if (profile.shape.typal.type && profile.shape.typal.share >= 30) marks.push({ key: "typal", type: profile.shape.typal.type });
  if (placed.fastMana >= 0.5) marks.push({ key: "fastMana" });
  if (placed.tutors >= 0.35) marks.push({ key: "tutored" });
  if (placed.counters >= 0.35) marks.push({ key: "counters" });
  if (placed.stax >= 0.35) marks.push({ key: "stax" });
  if (profile.wins.twoCard > 0) marks.push({ key: "twoCardWin" });
  else if (metrics.ending > 0) marks.push({ key: "comboWin" });
  if (placed.engine >= 0.5) marks.push({ key: "engine", theme: profile.shape.engine.theme });
  if (metrics.avgMv !== null && metrics.avgMv <= 2.6) marks.push({ key: "lowCurve" });
  if (metrics.avgMv !== null && metrics.avgMv >= 3.8) marks.push({ key: "topHeavy" });
  return marks;
}
