// ---- the table check: how a table of decks reads side by side ----
// A description from the power level, for a talk before playing. It never decides the pod:
// the points alone do that. Spellbook's labels reach it through level.watch.

export const TABLE_CHECK = {
  // gap between the highest and lowest power, on the 1-10 scale
  evenUpTo: 1,
  closeUpTo: 2,
  // how far from the median of the other decks a deck sits before it stands out
  margin: { score: 1, wins: 30, interaction: 20, salt: 15, gc: 2 },
};

const MEASURES = {
  score: d => d.level.score,
  wins: d => d.power.pillars.wins,
  interaction: d => d.power.pillars.interaction,
  salt: d => d.power.pillars.salt,
  gc: d => d.gc,
};

const tenth = (x) => Math.round(x * 10) / 10;
function median(xs) {
  const s = [...xs].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// decks: two or more, each { name, level (powerLevel), power (computePower), gc }.
export function tableCheck(decks) {
  // a land denial floor already sets the deck's bracket, so level.watch leaves it out; the table still wants to hear it
  const mention = decks.map(d => ({ name: d.name,
    watch: d.level.floor ? [...d.level.watch, { kind: "land", items: d.level.floor.mld }] : d.level.watch }))
    .filter(m => m.watch.length);
  // without combos and salt the scores read low, so comparing them would mislead
  if (decks.some(d => d.level.pending)) return { pending: true, mention };

  const scores = decks.map(MEASURES.score), low = Math.min(...scores), high = Math.max(...scores);
  const spread = tenth(high - low);
  const balance = spread <= TABLE_CHECK.evenUpTo ? "even" : spread <= TABLE_CHECK.closeUpTo ? "close" : "wide";
  const gap = (d, k) => tenth(MEASURES[k](d) - median(decks.filter(o => o !== d).map(MEASURES[k])));
  const standouts = decks.map(d => ({ name: d.name,
    more: Object.keys(MEASURES).filter(k => gap(d, k) >= TABLE_CHECK.margin[k]),
    // only power reads downwards: with two decks, every "more" would otherwise repeat as the other's "less"
    less: gap(d, "score") <= -TABLE_CHECK.margin.score }))
    .filter(s => s.more.length || s.less);
  return { pending: false, low, high, spread, balance, standouts, mention };
}
