// ---- deck profile: what the deck does, measured from its cards ----
// Informative only: nothing here feeds the pod's dials or tiers, which stay in
// stats.js/rules.js and in lockstep with the Python. classify.js deliberately reads
// cards more broadly than the dial regexes, so the same word (a "counterspell") can
// count differently here than on a dial.
import { detectArchetype } from "./classify.js";
import { isLandRamp } from "./ramp.js";
import { simulateGoldfish } from "./goldfish.js";
import { FAST_MANA_RE, KEYWORD_PATTERNS, REMINDER_TEXT_RE } from "./stats.js";

const COLORS = ["W", "U", "B", "R", "G"];
const front = (n) => String(n).split(" // ")[0];
export const oracleOf = (card) => (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
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

// What a card does. Scryfall's oracle tags (data/card_tags.json) answer first; a card
// they don't list yet, usually a brand-new one, falls back on reading its text.
export function readCard(x, cardTags) {
  const name = front(x.card.name || x.name);
  const tags = cardTags && cardTags.get(name);
  const o = oracleOf(x.card);
  const isLand = x.cls.type === "L";
  if (tags) {
    const t = (...keys) => keys.some(k => tags.has(k));
    return { ramp: !isLand && t("ramp", "mana-rock", "mana-dork", "ritual", "land-ramp"), rock: t("mana-rock"), dork: t("mana-dork"),
      ritual: t("ritual"), landRamp: t("land-ramp"), draw: t("draw", "cantrip", "wheel"), tutor: t("tutor") && !t("land-ramp") && TUTOR_RE.test(o),
      removal: t("removal") && !t("board-wipe"), wipe: t("board-wipe"), counter: t("counterspell"), protection: t("protection"),
      recursion: t("recursion", "reanimate"), stax: t("hatebear", "tax"), graveHate: t("graveyard-hate"), fetch: t("fetchland"),
      printedWin: t("win-condition"), massPump: t("overrun", "anthem") };
  }
  const has = (tag) => x.cls.tags.includes(tag);
  return { ramp: has("ramp"), rock: has("ramp") && x.cls.type === "A", dork: has("ramp") && x.cls.type === "C",
    ritual: (x.cls.type === "I" || x.cls.type === "S") && FAST_MANA_RE.test(o), landRamp: !isLand && isLandRamp(x.card),
    draw: has("draw"), tutor: TUTOR_RE.test(o), removal: has("rem"), wipe: has("wipe"), counter: has("ctr"), protection: has("prot"),
    recursion: has("rec"), stax: KEYWORD_PATTERNS.stax_effects.test(o), graveHate: GRAVE_HATE_RE.test(o), fetch: isLand && FETCH_RE.test(o),
    printedWin: PRINTED_WIN_RE.test(o), massPump: has("anthem") };
}

// data/card_tags.json is tag -> names; a deck needs name -> tags.
export function indexCardTags(json) {
  const index = new Map();
  for (const [tag, names] of Object.entries(json.tags))
    for (const n of names) (index.get(n) || index.set(n, new Set()).get(n)).add(tag);
  return index;
}

const ENGINE_THEMES = ["lifegain", "sacrifice-outlet", "recursion", "reanimate", "burn", "anthem", "overrun", "mill", "discard", "theft", "wheel", "cost-reducer"];

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

function manabase(cardsInfo, avgMv, read) {
  const lands = cardsInfo.filter(x => x.cls.type === "L");
  const qty = (list) => list.reduce((s, x) => s + x.qty, 0);
  const landQty = qty(lands);
  const tapped = qty(lands.filter(x => {
    const o = oracleOf(x.card);
    return ALWAYS_TAPPED_RE.test(o) && !CONDITIONAL_TAPPED_RE.test(o);
  }));
  const fetches = qty(lands.filter(x => read(x).fetch));
  const basics = qty(lands.filter(x => (x.card.type_line || "").includes("Basic")));

  const pips = pipCounts(cardsInfo);
  const totalPips = COLORS.reduce((s, c) => s + pips[c], 0);
  const colors = COLORS.filter(c => pips[c] > 0).map(c => {
    const sources = qty(cardsInfo.filter(x =>
      (x.cls.type === "L" || (read(x).ramp && (x.card.cmc || 0) <= 3)) &&
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
// cardTags: indexCardTags(data/card_tags.json), or null to read card text only.
export function computeProfile({ cardsInfo, stats, combos, commanders, cardTags = null, games }) {
  const memo = new Map();
  const read = (x) => memo.get(x) || memo.set(x, readCard(x, cardTags)).get(x);
  const zone = new Set((commanders || []).map(front));
  const nonland = cardsInfo.filter(x => x.cls.type !== "L");
  const count = (fn) => cardsInfo.reduce((s, x) => s + (fn(x) ? x.qty : 0), 0);
  const nlQty = nonland.reduce((s, x) => s + x.qty, 0);
  const avgMv = nlQty ? nonland.reduce((s, x) => s + (x.card.cmc || 0) * x.qty, 0) / nlQty : null;

  const speed = {
    avgMv: avgMv === null ? null : Math.round(avgMv * 100) / 100,
    cheap: count(x => x.cls.type !== "L" && (x.card.cmc || 0) <= 2),
    high: count(x => x.cls.type !== "L" && (x.card.cmc || 0) >= 6),
    ramp: count(x => read(x).ramp),
    rocks: count(x => read(x).rock),
    dorks: count(x => read(x).dork),
    rituals: count(x => read(x).ritual),
    landRamp: count(x => read(x).landRamp),
    fastMana: stats.fast_mana || 0,
  };

  const consistency = {
    draw: count(x => read(x).draw),
    cheapDraw: count(x => read(x).draw && (x.card.cmc || 0) <= 2),
    tutors: count(x => read(x).tutor),
    recursion: count(x => read(x).recursion),
  };

  const answers = cardsInfo.filter(x => read(x).counter || read(x).removal || read(x).wipe);
  const answerQty = answers.reduce((s, x) => s + x.qty, 0);
  const atInstantSpeed = answers.filter(x => x.cls.type === "I" || /\bflash\b/i.test(oracleOf(x.card)))
    .reduce((s, x) => s + x.qty, 0);
  const interaction = {
    counters: count(x => read(x).counter),
    removal: count(x => read(x).removal),
    wipes: count(x => read(x).wipe),
    protection: count(x => read(x).protection),
    graveHate: count(x => read(x).graveHate),
    stax: count(x => read(x).stax),
    free: stats.free_spells || 0,
    cheapAnswers: answers.filter(x => (x.card.cmc || 0) <= 2).reduce((s, x) => s + x.qty, 0),
    instantShare: answerQty ? Math.round(atInstantSpeed / answerQty * 100) : 0,
  };

  const list = combos || [];
  const runsThroughCommander = (c) => c.cards.some(n => zone.has(n));
  // Any infinite with a real result counts, whatever its tag: the tag says how acceptable
  // a combo is at a table, not whether it can win. In practice infinite mana wins games.
  const ending = list.filter(c => c.win || c.tag === "R" || (c.relevant && c.infinite) ||
    ENDS_GAME_RE.test(c.features[0] || ""));
  const priced = ending.filter(c => typeof c.deploy === "number");
  const wins = {
    checked: !!combos,
    combos: list.length,
    infinite: list.filter(c => c.infinite).length,
    // A line through the commander dies to one removal spell on it, so it counts half.
    ending: ending.reduce((sum, c) => sum + (runsThroughCommander(c) ? 0.5 : 1), 0),
    twoCard: ending.filter(c => c.cardsToFind <= 2).reduce((sum, c) => sum + (runsThroughCommander(c) ? 0.5 : 1), 0),
    lines: independentLines(ending.filter(c => !runsThroughCommander(c))),
    // How many infinite loops the deck can make: losing one piece leaves others standing.
    web: list.filter(c => c.infinite).reduce((sum, c) => sum + (runsThroughCommander(c) ? 0.5 : 1), 0),
    throughCommander: ending.filter(runsThroughCommander).length,
    fastest: priced.length ? Math.min(...priced.map(c => c.deploy)) : null,
    lineCost: priced.length ? Math.min(...priced.map(c => c.turnCost ?? c.deploy)) : null,
    printed: count(x => read(x).printedWin),
    massPump: count(x => read(x).massPump),
  };

  // How deep the deck's main engine runs: a plan with 27 lifegain pieces wins games
  // without any combo. Draw and answers are measured elsewhere, so they aren't themes.
  const themes = new Map();
  for (const x of cardsInfo) {
    const tags = cardTags && cardTags.get(front(x.card.name));
    if (tags) for (const t of ENGINE_THEMES) if (tags.has(t)) themes.set(t, (themes.get(t) || []).concat(front(x.card.name)));
  }
  const [engineTheme, engineCards] = [...themes].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0] || [null, []];

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
    engine: { theme: engineTheme, count: engineCards.length },
  };

  const names = (fn) => cardsInfo.filter(fn).map(x => front(x.card.name));
  const cheapest = priced.length ? priced.reduce((a, b) => (b.deploy < a.deploy ? b : a)) : null;
  const ledger = {
    tutors: names(x => read(x).tutor),
    fastMana: names(x => x.cls.type !== "L" && (x.card.cmc || 0) <= 2 && FAST_MANA_RE.test(oracleOf(x.card))),
    ramp: names(x => read(x).ramp),
    cheapAnswers: answers.filter(x => (x.card.cmc || 0) <= 2).map(x => front(x.card.name)),
    counters: names(x => read(x).counter), stax: names(x => read(x).stax),
    free: names(x => KEYWORD_PATTERNS.free_spells.test(oracleOf(x.card))),
    draw: names(x => read(x).draw), protection: names(x => read(x).protection), recursion: names(x => read(x).recursion),
    ending: [...new Set(ending.flatMap(c => c.cards))], twoCard: [...new Set(ending.filter(c => c.cardsToFind <= 2).flatMap(c => c.cards))],
    winBy8: cheapest ? cheapest.cards : [],
    lineCost: priced.length ? priced.reduce((a, b) => ((b.turnCost ?? b.deploy) < (a.turnCost ?? a.deploy) ? b : a)).cards : [],
    web: [...new Set(list.filter(c => c.infinite).flatMap(c => c.cards))],
    engine: engineCards,
    answersTotal: answers.map(x => front(x.card.name)),
    finishers: names(x => read(x).printedWin || read(x).massPump),
    avgMv: [], cheap: names(x => x.cls.type !== "L" && (x.card.cmc || 0) <= 2),
  };
  const goldfish = simulateGoldfish({ cardsInfo, commanders, read, games, combos: priced.map(c => ({
    pieces: [...c.cards, ...(c.filled || [])], deploy: c.deploy })) });
  const ranks = nonland.map(x => x.card.edhrec_rank).filter(Boolean).sort((a, b) => a - b);
  const upgrade = { pricey: count(x => (x.card.price || 0) >= 3), medianRank: ranks.length ? ranks[Math.floor((ranks.length - 1) / 2)] : null };
  return { manabase: manabase(cardsInfo, avgMv, read), speed, consistency, interaction, wins, shape, ledger, goldfish, upgrade };
}
