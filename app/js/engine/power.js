// ---- power: an estimate on a 1-10 scale, ours and not anyone else's ----
// Built on four values, by Jorge's call: ways to win, interaction, saltiness and
// synergy. Speed and resilience are reported but do not score. This is a reading of its
// own and never decides the pod (engine/powerLevel.js). His read of his own decks is
// locked in the parity test: change it through rules that hold for every deck.

// [low, high] per scored metric: nothing at low, full marks at high.
export const METRIC_RANGE = {
  ending: [0, 4], web: [0, 12], lines: [0, 2], winBy8: [0, 60], lineCost: [10, 3], finishers: [1, 8],
  cheapAnswers: [2, 8], counters: [0, 10], stax: [0, 8], free: [0, 4], answersTotal: [8, 22],
  salt: [15, 80], engine: [8, 28],
};
// Shown for context only. avgMv runs the other way.
const INFO_RANGE = {
  tutors: [2, 16], avgMv: [3.7, 2], cheap: [13, 50], fastMana: [3, 13], ramp: [9, 24], quality: [76, 100],
  draw: [6, 20], protection: [1, 8], recursion: [1, 6],
};
const PILLAR_WEIGHT = { wins: 0.4, interaction: 0.25, salt: 0.15, synergy: 0.2 };
// How many game-ending lines and loops a deck holds matters most, then the mana its
// cheapest line needs in one turn. Reliability counts least, because the simulation sees 3 and 4-card lines assemble rarely even when a deck
// is built around them. Teysha's web of 20 combos is exactly that case.
const COMBO_WEIGHT = { ending: 0.3, web: 0.25, lines: 0.15, lineCost: 0.2, winBy8: 0.1 };
// A deck also wins through printed win conditions and overruns, more slowly and more
// easily answered than a combo, hence the ceiling.
const FINISHER_CEILING = 0.3;
// Synergy is how deep the main theme runs. Deep themes are normal in precons, so one only
// counts once the deck can also protect its plan with real interaction.
const THEME_SUPPORT = [25, 50];

// The score broken into questions a player asks. Every scored metric belongs to one, so
// these explain the number without changing it.
const BENCHMARKS = [
  ["backups", "wins", ["ending", "web", "lines"]], ["winSpeed", "wins", ["lineCost", "winBy8"]], ["finishers", "wins", ["finishers"]],
  ["answers", "interaction", ["cheapAnswers", "counters", "answersTotal"]], ["denial", "interaction", ["stax"]], ["freeSpells", "interaction", ["free"]],
  ["saltiness", "salt", ["salt"]], ["engine", "synergy", ["engine"]],
];
const INFO_BENCHMARKS = [
  ["manaSpeed", ["fastMana", "ramp"]], ["curve", ["avgMv", "cheap"]], ["lands", ["quality"]], ["finding", ["tutors"]],
  ["cardFlow", ["draw"]], ["shielding", ["protection"]], ["recovery", ["recursion"]],
];
const TIERS = [[0.9, "S"], [0.65, "A"], [0.35, "B"], [0.1, "C"], [-Infinity, "F"]];
const tierOf = (x) => TIERS.find(([min]) => x >= min)[1];

// Stock precons run about 5 cards worth €3 or more; decks someone has upgraded run about
// 16. Price says nothing about strength (rank correlation 0.03), so this is only evidence
// that a deck is past stock level, and it needs a playable list behind it: a pile of
// pricey cards nobody plays (median EDHREC rank past 5000) doesn't count.
// A deck already past the casual band has its strength in the score: no lift needed.
const UPGRADED = { pricey: 10, medianRank: 5000, bonus: 0.5, floor: 4.1, onlyBelow: 5.5 };
const isUpgraded = ({ upgrade }) => !!upgrade && upgrade.pricey >= UPGRADED.pricey &&
  upgrade.medianRank !== null && upgrade.medianRank <= UPGRADED.medianRank;

// raw score -> 1-10, fitted on the 198 precons: precons are Bracket 2, so the top of that
// bracket (4.0) sits at their 97th percentile, raw 24. cEDH lists sit at the top.
const CURVE = [[0, 1.5], [10, 2.6], [24, 4], [30, 4.8], [40, 5.9], [55, 7.4], [70, 9.5], [85, 10], [100, 10]];

function toScale(raw) {
  for (let i = 1; i < CURVE.length; i++) {
    const [x0, y0] = CURVE[i - 1], [x1, y1] = CURVE[i];
    if (raw <= x1) return y0 + (y1 - y0) * (raw - x0) / (x1 - x0);
  }
  return CURVE[CURVE.length - 1][1];
}

// 0..1 between a metric's two anchors. No reading counts as the low end.
function place(range, value) {
  if (value === null || value === undefined) return 0;
  return Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// salt: saltScore() for this deck, or null until the ratings have loaded.
export function computePower(profile, stats, salt = null) {
  const { speed, consistency, interaction, wins, manabase, goldfish, shape, ledger } = profile;
  const metrics = {
    ending: wins.ending, web: wins.web, lines: wins.lines, winBy8: goldfish.winBy ? goldfish.winBy[8] : null, lineCost: wins.lineCost,
    finishers: wins.printed + wins.massPump,
    cheapAnswers: interaction.cheapAnswers, counters: interaction.counters, stax: interaction.stax, free: interaction.free,
    answersTotal: interaction.removal + interaction.wipes + interaction.counters,
    salt: salt ? salt.total : null, engine: shape.engine.count,
  };
  const info = {
    tutors: consistency.tutors, avgMv: speed.avgMv, cheap: speed.cheap, fastMana: speed.fastMana, ramp: speed.ramp,
    quality: manabase.quality, draw: consistency.draw, protection: interaction.protection, recursion: consistency.recursion,
  };
  const placed = Object.fromEntries(Object.keys(METRIC_RANGE).map(k => [k, place(METRIC_RANGE[k], metrics[k])]));
  const placedInfo = Object.fromEntries(Object.keys(INFO_RANGE).map(k => [k, place(INFO_RANGE[k], info[k])]));

  const combos = Object.entries(COMBO_WEIGHT).reduce((sum, [k, w]) => sum + placed[k] * w, 0);
  const inter = mean(["cheapAnswers", "counters", "stax", "free", "answersTotal"].map(k => placed[k]));
  const supported = place(THEME_SUPPORT, inter * 100);
  const pillars = {
    wins: Math.round(Math.max(combos, placed.finishers * FINISHER_CEILING) * 100),
    interaction: Math.round(inter * 100),
    salt: Math.round(placed.salt * 100),
    synergy: Math.round(placed.engine * supported * 100),
  };
  const raw = Object.entries(PILLAR_WEIGHT).reduce((sum, [k, w]) => sum + pillars[k] * w, 0);

  const cardsOf = (keys) => [...new Set(keys.flatMap(k => (k === "salt" ? (salt ? salt.top.map(c => c.name) : []) : ledger[k] || [])))];
  const benchmarks = [
    ...BENCHMARKS.map(([key, pillar, keys]) => ({ key, pillar, scored: true, tier: tierOf(mean(keys.map(k => placed[k]))),
      values: keys.map(k => ({ key: k, value: metrics[k] })), cards: cardsOf(keys) })),
    ...INFO_BENCHMARKS.map(([key, keys]) => ({ key, pillar: "tempo", scored: false, tier: tierOf(mean(keys.map(k => placedInfo[k]))),
      values: keys.map(k => ({ key: k, value: info[k] })), cards: cardsOf(keys) })),
  ];
  // the cards doing the most scored jobs at once; salt alone says nothing about function
  const jobs = new Map();
  for (const b of benchmarks) if (b.scored && b.key !== "saltiness") for (const n of b.cards) jobs.set(n, (jobs.get(n) || 0) + 1);
  const keyCards = [...jobs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([name, count]) => ({ name, count }));

  const base = toScale(raw);
  const score = isUpgraded(profile) && base < UPGRADED.onlyBelow
    ? Math.min(Math.max(base + UPGRADED.bonus, UPGRADED.floor), UPGRADED.onlyBelow) : base;
  return { score: Math.round(score * 10) / 10, base: Math.round(base * 10) / 10, upgraded: isUpgraded(profile), raw: Math.round(raw * 10) / 10, pillars,
    metrics, benchmarks, keyCards, fingerprint: fingerprint(profile, metrics, placed, placedInfo, info) };
}

// A few plain facts about the deck's shape, each only when it clearly stands out.
function fingerprint(profile, metrics, placed, placedInfo, info) {
  const marks = [];
  const top = profile.shape.archetypes[0];
  if (top && top.share >= 25) marks.push({ key: "arch", arch: top.key });
  if (profile.shape.typal.type && profile.shape.typal.share >= 30) marks.push({ key: "typal", type: profile.shape.typal.type });
  if (placedInfo.fastMana >= 0.5) marks.push({ key: "fastMana" });
  if (placedInfo.tutors >= 0.35) marks.push({ key: "tutored" });
  if (placed.counters >= 0.35) marks.push({ key: "counters" });
  if (placed.stax >= 0.35) marks.push({ key: "stax" });
  if (profile.wins.twoCard > 0) marks.push({ key: "twoCardWin" });
  else if (metrics.ending > 0) marks.push({ key: "comboWin" });
  if (placed.engine >= 0.5) marks.push({ key: "engine" });
  if (info.avgMv !== null && info.avgMv <= 2.6) marks.push({ key: "lowCurve" });
  if (info.avgMv !== null && info.avgMv >= 3.8) marks.push({ key: "topHeavy" });
  return marks;
}
