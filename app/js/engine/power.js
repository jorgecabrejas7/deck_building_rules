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
  // what pulled the number up or down most, each with its value, so it explains itself
  const ranked = Object.keys(METRIC_RANGE)
    .map(key => ({ key, value: metrics[key], placed: Math.round(placed[key] * 100) }))
    .sort((a, b) => b.placed - a.placed || a.key.localeCompare(b.key));
  return { score: Math.round(toScale(raw) * 10) / 10, raw: Math.round(raw * 10) / 10, pillars, metrics,
    up: ranked.filter(d => d.placed >= 50).slice(0, 4),
    down: ranked.filter(d => d.placed <= 15).slice(-4).reverse() };
}
