// ---- power: an estimate on a 1-10 scale, ours and not anyone else's ----
// Four pillars read off the deck profile. Each metric is placed between where a
// weak precon sits (0) and where the median cEDH list sits (1), so "60" on a pillar
// reads as "60% of the way from a weak precon to cEDH".
// Informative only: it never decides a pod tier or a bracket.

// [low, high] per metric, set from `node scripts/deck_study.js --metrics`:
// low = where weak precons sit, high = the median cEDH list. avgMv and fastest run
// the other way. Measures that do not separate precons from cEDH in the study (total
// and cheap draw, removal count, recursion, colour coverage) stay in the profile but out of the score.
export const METRIC_RANGE = {
  tutors: [2, 16], gc: [0, 15],
  avgMv: [3.7, 2], cheap: [13, 50], fastMana: [3, 13], ramp: [9, 24], quality: [76, 100],
  cheapAnswers: [2, 11], counters: [0, 10], stax: [0, 12], free: [0, 4],
  ending: [0, 4], twoCard: [0, 2], lines: [0, 2], fastest: [10, 4],
};
const PILLARS = {
  consistency: ["tutors", "gc"],
  efficiency: ["avgMv", "cheap", "fastMana", "ramp", "quality"],
  interaction: ["cheapAnswers", "counters", "stax", "free"],
  wins: ["ending", "twoCard", "lines", "fastest"],
};
// The score broken into questions a player asks. Every scored metric belongs to one
// benchmark, so these explain the number without changing it. Resilience is read the
// same way but left out of the score: in the study it did not separate precons from cEDH.
const BENCHMARKS = [
  ["manaSpeed", "efficiency", ["fastMana", "ramp"]], ["curve", "efficiency", ["avgMv", "cheap"]], ["lands", "efficiency", ["quality"]],
  ["finding", "consistency", ["tutors"]], ["strongCards", "consistency", ["gc"]],
  ["answers", "interaction", ["cheapAnswers", "counters"]], ["denial", "interaction", ["stax"]], ["freeSpells", "interaction", ["free"]],
  ["winSpeed", "wins", ["fastest"]], ["compact", "wins", ["twoCard"]], ["backups", "wins", ["ending", "lines"]],
];
const RESILIENCE_RANGE = { draw: [6, 20], protection: [1, 8], recursion: [1, 6] };
const RESILIENCE = [["cardFlow", ["draw"]], ["shielding", ["protection"]], ["recovery", ["recursion"]]];
const TIERS = [[0.9, "S"], [0.65, "A"], [0.35, "B"], [0.1, "C"], [-Infinity, "F"]];
const tierOf = (x) => TIERS.find(([min]) => x >= min)[1];

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
    tutors: consistency.tutors, gc: stats.game_changers || 0,
    avgMv: speed.avgMv, cheap: speed.cheap, fastMana: speed.fastMana, ramp: speed.ramp, quality: manabase.quality,
    cheapAnswers: interaction.cheapAnswers, counters: interaction.counters,
    stax: interaction.stax, free: interaction.free,
    ending: wins.ending, twoCard: wins.twoCard, lines: wins.lines, fastest: wins.fastest,
  };
}

// 0..1 between the metric's two anchors. A deck with no game-ending line has no
// "fastest" to read, which counts as the slow end.
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
  const raw = Object.values(pillars).reduce((s, v) => s + v, 0) / 4;
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
  return { score: Math.round(toScale(raw) * 10) / 10, raw: Math.round(raw * 10) / 10, pillars, metrics, benchmarks, keyCards,
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
  if (metrics.twoCard > 0) marks.push({ key: "twoCardWin" });
  else if (metrics.ending > 0) marks.push({ key: "comboWin" });
  if (metrics.avgMv !== null && metrics.avgMv <= 2.6) marks.push({ key: "lowCurve" });
  if (metrics.avgMv !== null && metrics.avgMv >= 3.8) marks.push({ key: "topHeavy" });
  return marks;
}
