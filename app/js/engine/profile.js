// ---- deck profile: what the deck does, measured from its cards ----
// Informative only: nothing here feeds the pod's dials or tiers, which stay in
// stats.js/rules.js and in lockstep with the Python. classify.js deliberately reads
// cards more broadly than the dial regexes, so the same word (a "counterspell") can
// count differently here than on a dial.
import { detectArchetype } from "./classify.js";
import { isLandRamp } from "./ramp.js";
import { FAST_MANA_RE, REMINDER_TEXT_RE } from "./stats.js";

const COLORS = ["W", "U", "B", "R", "G"];
const front = (n) => String(n).split(" // ")[0];
const oracleOf = (card) => (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// A land that always comes in tapped: "unless" and pay-to-untap lands are not it.
const ALWAYS_TAPPED_RE = /(?:enters|comes into play)(?: the battlefield)? tapped(?!\s*unless)/i;
const CONDITIONAL_TAPPED_RE = /unless|you may pay|if you (?:control|don't)|as .{0,30} enters/i;
const FETCH_RE = /search your library for .{0,60}\b(?:land|plains|island|swamp|mountain|forest)\b/i;
// Broader than the tut tag ("for a card"), so "for an artifact card" counts; land search is ramp.
const TUTOR_RE = /search your library for (?:a|an|up to \w+|two|three)\b(?![^.]*\blands?\b)/i;
const GRAVE_HATE_RE = /exile (?:target player's|each opponent's|all cards from all|all) graveyards?|exile all cards from (?:target player's|all) graveyards?|cards in graveyards can't|if a card would be put into (?:a|an opponent's) graveyard/i;
const PRINTED_WIN_RE = /you win the game|target (?:player|opponent) loses the game|each opponent loses the game/i;
const ENDS_GAME_RE = /infinite (?:damage|lifeloss|turns?|combat|.{0,20}mill)|infinitely (?:large|powerful)/i;

const has = (x, tag) => x.cls.tags.includes(tag);

// Coloured pips across the deck; hybrid symbols count for each of their colours.
export function pipCounts(cardsInfo) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const x of cardsInfo)
    for (const ch of (x.card.mana_cost || "").replace(/[{}/]/g, ""))
      if (pips[ch] !== undefined) pips[ch] += x.qty;
  return pips;
}

// Sources a colour needs for its share of the deck's pips. A commander deck wants
// roughly 24 sources for a mono-coloured demand and 12 for a one-in-five share.
const sourceTarget = (share) => 8 + 16 * share;

function manabase(cardsInfo, avgMv) {
  const lands = cardsInfo.filter(x => x.cls.type === "L");
  const qty = (list) => list.reduce((s, x) => s + x.qty, 0);
  const landQty = qty(lands);
  const tapped = qty(lands.filter(x => {
    const o = oracleOf(x.card);
    return ALWAYS_TAPPED_RE.test(o) && !CONDITIONAL_TAPPED_RE.test(o);
  }));
  const fetches = qty(lands.filter(x => FETCH_RE.test(oracleOf(x.card))));
  const basics = qty(lands.filter(x => (x.card.type_line || "").includes("Basic")));

  const pips = pipCounts(cardsInfo);
  const totalPips = COLORS.reduce((s, c) => s + pips[c], 0);
  const colors = COLORS.filter(c => pips[c] > 0).map(c => {
    const sources = qty(cardsInfo.filter(x =>
      (x.cls.type === "L" || (x.cls.tags.includes("ramp") && (x.card.cmc || 0) <= 3)) &&
      (x.card.produced_mana || []).includes(c)));
    const target = sourceTarget(pips[c] / totalPips);
    return { color: c, pips: pips[c], share: pips[c] / totalPips, sources, target: Math.round(target), cover: sources / target };
  });
  const weakest = colors.reduce((w, c) => (!w || c.cover < w.cover ? c : w), null);
  const fixing = weakest ? Math.round(clamp01(weakest.cover) * 100) : 100;
  const quality = landQty ? Math.round((1 - tapped / landQty) * 100) : 0;
  // 4.2 is a clunky top-heavy list, 2.4 a tight one
  const curve = avgMv === null ? 0 : Math.round(clamp01((4.2 - avgMv) / 1.8) * 100);
  return { lands: landQty, basics, tapped, fetches, colors, weakest: weakest && weakest.color,
    fixing, quality, curve, score: Math.round((fixing + quality + curve) / 3) };
}

// Greedy count of combos sharing no piece: lines an opponent must answer separately.
function independentLines(combos) {
  const used = new Set();
  let lines = 0;
  for (const c of [...combos].sort((a, b) => a.cards.length - b.cards.length)) {
    if (c.cards.some(n => used.has(n))) continue;
    c.cards.forEach(n => used.add(n));
    lines++;
  }
  return lines;
}

// combos: the rated list from evaluateBrackets, or null while the check is pending.
export function computeProfile({ cardsInfo, stats, combos, commanders }) {
  const zone = new Set((commanders || []).map(front));
  const nonland = cardsInfo.filter(x => x.cls.type !== "L");
  const count = (fn) => cardsInfo.reduce((s, x) => s + (fn(x) ? x.qty : 0), 0);
  const nlQty = nonland.reduce((s, x) => s + x.qty, 0);
  const avgMv = nlQty ? nonland.reduce((s, x) => s + (x.card.cmc || 0) * x.qty, 0) / nlQty : null;

  const speed = {
    avgMv: avgMv === null ? null : Math.round(avgMv * 100) / 100,
    cheap: count(x => x.cls.type !== "L" && (x.card.cmc || 0) <= 2),
    high: count(x => x.cls.type !== "L" && (x.card.cmc || 0) >= 6),
    ramp: count(x => has(x, "ramp")),
    rocks: count(x => has(x, "ramp") && x.cls.type === "A"),
    dorks: count(x => has(x, "ramp") && x.cls.type === "C"),
    rituals: count(x => (x.cls.type === "I" || x.cls.type === "S") && FAST_MANA_RE.test(oracleOf(x.card))),
    landRamp: count(x => x.cls.type !== "L" && isLandRamp(x.card)),
    fastMana: stats.fast_mana || 0,
  };

  const consistency = {
    draw: count(x => has(x, "draw")),
    cheapDraw: count(x => has(x, "draw") && (x.card.cmc || 0) <= 2),
    tutors: count(x => TUTOR_RE.test(oracleOf(x.card))),
    recursion: count(x => has(x, "rec")),
  };

  const answers = cardsInfo.filter(x => has(x, "ctr") || has(x, "rem") || has(x, "wipe"));
  const answerQty = answers.reduce((s, x) => s + x.qty, 0);
  const atInstantSpeed = answers.filter(x => x.cls.type === "I" || /\bflash\b/i.test(oracleOf(x.card)))
    .reduce((s, x) => s + x.qty, 0);
  const interaction = {
    counters: count(x => has(x, "ctr")),
    removal: count(x => has(x, "rem")),
    wipes: count(x => has(x, "wipe")),
    protection: count(x => has(x, "prot")),
    graveHate: count(x => GRAVE_HATE_RE.test(oracleOf(x.card))),
    stax: stats.stax_effects || 0,
    free: stats.free_spells || 0,
    cheapAnswers: answers.filter(x => (x.card.cmc || 0) <= 2).reduce((s, x) => s + x.qty, 0),
    instantShare: answerQty ? Math.round(atInstantSpeed / answerQty * 100) : 0,
  };

  const list = combos || [];
  // Spellbook's strong tags count too: in practice infinite mana is how a fast deck wins
  const ending = list.filter(c => c.win || c.tag === "R" || (c.tag === "S" && c.relevant && c.infinite) ||
    ENDS_GAME_RE.test(c.features[0] || ""));
  const priced = ending.filter(c => typeof c.deploy === "number");
  const wins = {
    checked: !!combos,
    combos: list.length,
    infinite: list.filter(c => c.infinite).length,
    ending: ending.length,
    twoCard: ending.filter(c => c.cardsToFind <= 2).length,
    lines: independentLines(ending),
    fastest: priced.length ? Math.min(...priced.map(c => c.deploy)) : null,
    printed: count(x => PRINTED_WIN_RE.test(oracleOf(x.card))),
    massPump: count(x => has(x, "anthem")),
  };

  const creatures = cardsInfo.filter(x => x.cls.type === "C");
  const types = new Map();
  for (const x of creatures) {
    const sub = (x.card.type_line || "").split(" // ")[0].split("—")[1];
    if (sub) for (const t of sub.trim().split(/\s+/)) types.set(t, (types.get(t) || 0) + x.qty);
  }
  const [topType, topCount] = [...types].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [null, 0];
  const creatureQty = creatures.reduce((s, x) => s + x.qty, 0);
  const archetypes = Object.entries(detectArchetype(cardsInfo).scores).filter(([, v]) => v > 0);
  const archTotal = archetypes.reduce((s, [, v]) => s + v, 0) || 1;
  const shape = {
    archetypes: archetypes.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => ({ key: k, share: Math.round(v / archTotal * 100) })),
    typal: { type: topType, count: topCount, share: creatureQty ? Math.round(topCount / creatureQty * 100) : 0 },
    creatures: creatureQty,
    throughCommander: list.filter(c => c.cards.some(n => zone.has(n))).length,
  };

  return { manabase: manabase(cardsInfo, avgMv), speed, consistency, interaction, wins, shape };
}
