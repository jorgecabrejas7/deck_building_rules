#!/usr/bin/env node
/**
 * Dev-only parity test: loads app/js/engine/ in Node and checks that
 *   (a) the selftest cases pass (same expectations as tier_rules.py --selftest)
 *   (b) all 36 precon decks get the same stats/points/tier as the Python pipeline
 *       (expected values generated on the fly via python3).
 *   (c) commander auto-detection recovers the real commander of all 36 precons,
 *       and every precon's Bracket 3 verdict is explainable.
 *   (d) game changers pay on their own dial only.
 *   (e) maybeboard / sideboard cards never reach the analysis.
 *   (f) the commander picker is offered the WHOLE deck, not a shortlist.
 *   (g) the bracket rules, on synthetic cards and on the real combo database.
 *   (h) the deck profile: manabase arithmetic, salt, synergy and the power scale.
 *   (i) the card reader against hand-labelled cards, with and without Scryfall's tags.
 *
 * Usage: node scripts/test_engine_parity.js [--selftest]
 * Users of the HTML app never need this.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PodEngine from "../app/js/engine/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, "rules", "pod_rules.json"), "utf8"));
// Rules now live ONLY in rules/pod_rules.json (the app fetches it at runtime),
// so the old HTML-inline drift check is obsolete.

// (a) selftest
const st = PodEngine.runSelfTest(RULES);
for (const r of st.results) {
  if (!r.pass) console.log(`FAIL  ${r.label}: got ${r.got}, expected ${r.expected}`);
}
console.log(`Selftest: ${st.results.filter(r => r.pass).length}/${st.results.length} passed`);
if (!st.pass) process.exit(1);
if (process.argv.includes("--selftest")) process.exit(0);

// (b) precon parity vs Python
const py = execFileSync("python3", ["-c", `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "scripts"))})
from pathlib import Path
from power_metrics import compute_deck_stats
from tier_rules import evaluate_deck, load_rules
root = Path(${JSON.stringify(ROOT)})
cache = json.loads((root/'cache'/'scryfall_cache.json').read_text())
rules = load_rules()
out = []
for report in sorted((root/'out'/'precon_decks').glob('*.report.json')):
    data = json.loads(report.read_text())
    for deck in data.get('decks', []):
        stats, flagged = compute_deck_stats(deck['cards'], cache)
        res = evaluate_deck(stats, flagged, rules, card_names={c['name'] for c in deck['cards']})
        out.append({'deck': deck['deck_title'], 'commanders': deck.get('commanders', []), 'stats': {k: v for k, v in stats.items() if isinstance(v, (int, float)) or v is None},
                    'tier': res['tier'], 'points': res['points'], 'breakdown': res['point_breakdown'],
                    'violations': len(res['violations']), 'cards': deck['cards']})
print(json.dumps(out))
`], { maxBuffer: 64 * 1024 * 1024 }).toString();
const expected = JSON.parse(py);

const cache = JSON.parse(fs.readFileSync(path.join(ROOT, "cache", "scryfall_cache.json"), "utf8"));
// Adapt the Python cache to the JS card shape (price key matches already)
const db = {};
for (const [name, info] of Object.entries(cache)) db[name] = info;

const STAT_KEYS = ["game_changers", "mass_land_denial", "extra_turns", "stax_effects", "free_spells", "tutors",
  "counterspells", "board_wipes", "fast_mana", "price_under_1", "price_1_5", "price_5_10", "price_10_20",
  "price_20_30", "price_30_plus", "total_cards", "land_count", "basic_land_count",
  "single_target_removal", "card_advantage", "protection_effects"];

let fails = 0;
for (const exp of expected) {
  const entries = exp.cards.map(c => ({ name: c.name, quantity: c.quantity }));
  const { stats, flagged } = PodEngine.computeDeckStats(entries, db);
  const res = PodEngine.evaluateDeck(stats, flagged, RULES, entries.map(e => e.name));
  const diffs = [];
  for (const k of STAT_KEYS) if (stats[k] !== exp.stats[k]) diffs.push(`${k}: js=${stats[k]} py=${exp.stats[k]}`);
  if (Math.abs(stats.total_price_eur - exp.stats.total_price_eur) > 0.05) diffs.push(`total_price: js=${stats.total_price_eur} py=${exp.stats.total_price_eur}`);
  if (res.tier !== exp.tier) diffs.push(`tier: js=${res.tier} py=${exp.tier}`);
  if (res.points !== exp.points) diffs.push(`points: js=${res.points} py=${exp.points}`);
  if (res.violations.length !== exp.violations) diffs.push(`violations: js=${res.violations.length} py=${exp.violations}`);
  if (diffs.length) { fails++; console.log(`MISMATCH ${exp.deck}\n  ${diffs.join("\n  ")}`); }
}
console.log(`Precon parity: ${expected.length - fails}/${expected.length} decks match Python (stats+points+tier+violations)`);

// (c) commander detection + Bracket 3, on the same 36 precons.
// Ground truth: each precon report lists the box's legendary options. Modern
// precons ship two ALTERNATIVE face commanders, so a correct guess is any
// subset of that list — and for a real partner pair, both halves.
const combos = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "combos.json"), "utf8"));
let cmdFails = 0, b3Fits = 0;
const b3Levels = {};
const tooStrong = [];
const b3Reasons = {};
for (const exp of expected) {
  const entries = exp.cards.map(c => ({ name: c.name, quantity: c.quantity }));
  // precons carry no Commander header, so this exercises pure detection
  const cmds = PodEngine.pickCommanders({ entries, commanders: [] }, db);
  const truth = exp.commanders || [];
  if (!cmds.length || !cmds.every(c => truth.includes(c))) {
    cmdFails++;
    console.log(`COMMANDER ${exp.deck}: got ${cmds.join(" + ") || "(none)"}, box lists ${truth.join(" / ")}`);
  }
  const { stats, flagged } = PodEngine.computeDeckStats(entries, db);
  const matched = PodEngine.activeCombos(PodEngine.matchCombos(entries.map(e => e.name), combos), cmds);
  const cardsInfo = entries.filter(e => db[e.name]).map(e => ({ card: db[e.name], qty: e.quantity, name: e.name }));
  const validation = PodEngine.validateDeck(cardsInfo, cmds, db, []);
  const b3 = PodEngine.evaluateBrackets({ stats, flagged, db, validation, combos: matched, comboDb: combos, commanders: cmds,
    deckNames: entries.map(e => e.name), loopCards: RULES.hard_bans.banned_cards.extra_turn_recursion });
  if (b3.fits) b3Fits++;
  else for (const id of b3.failed) (b3Reasons[id] ||= []).push(exp.deck);
  (b3Levels[b3.checklist] ||= []).push(exp.deck);
  for (const c of b3.checks.find(x => x.id === "combos").combos)
    tooStrong.push({ deck: exp.deck, ...c });
}
console.log(`Commander detection: ${expected.length - cmdFails}/${expected.length} precons resolved to a listed commander`);
console.log(`Bracket 3: ${b3Fits}/${expected.length} precons fit; misses ${JSON.stringify(b3Reasons)}`);
console.log(`Checklist read: ${JSON.stringify(Object.fromEntries(Object.entries(b3Levels).map(([k, v]) => [k, v.length])))}`);
for (const c of tooStrong) console.log(`  Bracket 4+ combo: ${c.deck}: ${c.cards.join(" + ")} (${c.features[0]})`);
// Precons are Bracket 2 decks, so a Bracket-3 miss on anything other than the
// combos Spellbook itself rates 4+ (some precons do ship one) means the check drifted.
const unexpected = Object.keys(b3Reasons).filter(k => k !== "combos");
if (unexpected.length) {
  console.log(`UNEXPECTED Bracket 3 failures on precons: ${unexpected.join(", ")}`);
  fails++;
}
// (d) game changers pay on their own dial only. Same card, two price tags:
// the points must not move, or an expensive game changer would outweigh a cheap
// one for the very same effect. The >30 EUR hard cap still applies to both.
const gcDb = {
  cheap: { name: "cheap", price: 0.6, cmc: 2, type_line: "Creature", oracle_text: "", game_changer: true },
  pricey: { name: "pricey", price: 25, cmc: 2, type_line: "Creature", oracle_text: "", game_changer: true },
  huge: { name: "huge", price: 35, cmc: 2, type_line: "Creature", oracle_text: "", game_changer: true },
  plain: { name: "plain", price: 25, cmc: 2, type_line: "Creature", oracle_text: "", game_changer: false },
};
const gcRun = (name) => {
  const entries = [{ name, quantity: 1 }];
  const { stats, flagged } = PodEngine.computeDeckStats(entries, gcDb);
  const res = PodEngine.evaluateDeck(stats, flagged, RULES, [name]);
  return { points: res.points, bands: stats.price_20_30, capped: res.violations.some(v => v.id === "price_cap") };
};
const gcCases = [
  ["cheap and pricey game changers cost the same", gcRun("cheap").points === gcRun("pricey").points],
  ["a game changer never enters a price band", gcRun("pricey").bands === 0],
  ["a non-game-changer at the same price still pays", gcRun("plain").points > gcRun("pricey").points],
  ["the 30 EUR hard cap still catches a game changer", gcRun("huge").capped],
];
const gcBad = gcCases.filter(([, ok]) => !ok);
for (const [label] of gcBad) console.log(`GAME CHANGER PRICING FAIL: ${label}`);
console.log(`Game-changer pricing: ${gcCases.length - gcBad.length}/${gcCases.length} correct`);
if (gcBad.length) fails++;

// (e) cards parked outside the 100 never reach the analysis. Archidekt ships
// its Sideboard category with includedInDeck:true, so these lists really do
// arrive attached to otherwise ordinary decks.
const OUT_CASES = [
  ["Moxfield SIDEBOARD: header", "1 Sol Ring\n\nSIDEBOARD:\n1 Mana Crypt", ["Sol Ring"], ["Mana Crypt"]],
  ["Archidekt [Maybeboard] tag", "1x Sol Ring (c21) 263 [Artifact]\n1x Mana Crypt (2xm) 270 [Maybeboard]", ["Sol Ring"], ["Mana Crypt"]],
  ["comment section marker", "1 Sol Ring\n// Maybeboard\n1 Mana Crypt", ["Sol Ring"], ["Mana Crypt"]],
  ["skip section ends at the next header", "Maybeboard\n1 Mana Crypt\nDeck\n1 Sol Ring", ["Sol Ring"], ["Mana Crypt"]],
  ["Archidekt [Tokens] holds real deck cards", "1x Sol Ring (c21) 263 [Artifact]\n1x Krenko's Command (ddt) 53 [Tokens]", ["Sol Ring", "Krenko's Command"], []],
  ["a text export's Tokens section is not deck cards", "1 Sol Ring\n\nTOKENS:\n1 Goblin", ["Sol Ring"], ["Goblin"]],
  ["an ordinary comment is not a section", "// budget build\n1 Sol Ring", ["Sol Ring"], []],
];
let outBad = 0;
for (const [label, text, want, unwanted] of OUT_CASES) {
  const names = new Set(PodEngine.parseDecklist(text).entries.map(e => e.name));
  if (!want.every(n => names.has(n)) || unwanted.some(n => names.has(n))) {
    outBad++; console.log(`OUT-OF-DECK FAIL: ${label} -> ${[...names].join(", ") || "(empty)"}`);
  }
}
console.log(`Out-of-deck exclusion: ${OUT_CASES.length - outBad}/${OUT_CASES.length} correct`);
if (outBad) fails++;

// (f) the picker spans the whole deck: every resolvable card is listed with its
// eligibility, so "why isn't my commander in the list?" cannot happen silently.
let optBad = 0;
for (const exp of expected) {
  const entries = exp.cards.map(c => ({ name: c.name, quantity: c.quantity })).filter(e => db[e.name]);
  const opts = PodEngine.commanderOptions(entries, db);
  const distinct = new Set(entries.map(e => e.name)).size;
  const eligible = opts.filter(o => o.kind === "solo" || o.kind === "second");
  const sameAsCandidates = eligible.length === PodEngine.commanderCandidates(entries, db).length;
  if (opts.length !== distinct || !eligible.length || !sameAsCandidates) {
    optBad++;
    console.log(`PICKER FAIL ${exp.deck}: listed ${opts.length}/${distinct}, eligible ${eligible.length}`);
  }
}
console.log(`Commander picker: ${expected.length - optBad}/${expected.length} precons list every card with an eligibility`);
if (optBad) fails++;

// (g) the bracket rules themselves. Synthetic cards keep the mana arithmetic
// obvious; the real database guards the shape of what the build produces.
const brCard = (name, cmc, extra = {}) => ({ name, cmc, type_line: "Artifact", oracle_text: "", ...extra });
const brDb = Object.fromEntries([
  brCard("Two", 2), brCard("Three", 3), brCard("Five", 5), brCard("Six", 6), brCard("Plain", 1),
  brCard("Orb", 2), brCard("Leader", 2, { type_line: "Legendary Creature — Human" }),
  brCard("Pal", 1), brCard("Bud", 1),
  brCard("Time A", 3, { oracle_text: "Take an extra turn after this one." }),
  brCard("Time B", 3, { oracle_text: "Take an extra turn after this one." }),
  brCard("Time C", 3, { oracle_text: "Take an extra turn after this one." }),
  brCard("GC1", 2, { game_changer: true }), brCard("GC2", 2, { game_changer: true }),
  brCard("GC3", 2, { game_changer: true }), brCard("GC4", 2, { game_changer: true }),
].map(c => [c.name, c]));
const brDbFile = { templates: {}, mass_land_denial: ["Orb"], extra_turn: [], combos: [
  { c: ["Three", "Two"], r: "Infinite damage", t: "R", f: "ir" },
  { c: ["Five", "Six"], r: "Infinite damage", t: "R", f: "ir" },
  { c: ["Two", "Plain"], r: "Infinite mana", t: "R", m: 5, f: "ir" },
  { c: ["Plain", "Three"], r: "Infinite ETB", t: "E", f: "i" },
  { c: ["Plain", "Six"], r: "Infinite mana", t: "S", f: "ir" },
  { c: ["Plain", "Five"], r: "Win the game", t: "R", f: "rw" },
  { c: ["Two", "Five", "Six"], r: "Infinite turns", t: "R", f: "irt" },
  { c: ["GC1", "Six"], r: "Mass Land Denial", t: "R", f: "rd" },
  { c: ["Leader", "Three"], r: "Infinite damage", t: "R", f: "ir", mc: ["Leader"] },
  { c: ["Bud", "Leader", "Pal"], r: "Infinite damage", t: "S", f: "ir" },
] };
const brEval = (names, commanders = []) => {
  const entries = names.map(name => ({ name, quantity: 1 }));
  const { stats, flagged } = PodEngine.computeDeckStats(entries, brDb);
  const list = PodEngine.activeCombos(PodEngine.matchCombos(names, brDbFile), commanders);
  return PodEngine.evaluateBrackets({ stats, flagged, deckNames: names, db: brDb, combos: list,
    comboDb: brDbFile, commanders, validation: [], loopCards: [] });
};
const check = (b, id) => b.checks.find(c => c.id === id);
const cutDown = (names, commanders = []) => {
  const b = brEval(names, commanders);
  const out = new Set(b.cuts.cards.map(c => c.card));
  for (const c of b.cuts.choices) for (const n of c.from.slice(0, c.count)) out.add(n);
  return brEval(names.filter(n => !out.has(n)), commanders);
};
const realMatch = (names, commanders = []) => PodEngine.activeCombos(PodEngine.matchCombos(names, combos), commanders);
const consult = realMatch(["Thassa's Oracle", "Demonic Consultation"]);
const BR_CASES = [
  ["a combo Spellbook tags 4+ fails", brEval(["Two", "Three"]).failed.includes("combos")],
  ["...however much mana it costs", brEval(["Five", "Six"]).failed.includes("combos")],
  ["a Bracket 3-4 combo fits, with a warning", brEval(["Plain", "Six"]).fits && check(brEval(["Plain", "Six"]), "combos").borderline.length === 1],
  ["a Bracket 1 combo is no concern, however cheap", brEval(["Plain", "Three"]).fits && brEval(["Plain", "Three"]).checklist === 2],
  ["a combo's tag sets its checklist level", brEval(["Plain", "Six"]).checklist === 3 && brEval(["Two", "Three"]).checklist === 4],
  ["what a combo costs is still reported", brEval(["Two", "Plain"]).combos[0].deploy === 8],
  ["an infinite-turns combo breaks the extra-turn rule", brEval(["Two", "Five", "Six"]).failed.includes("extra_turns")],
  ["a land-denial combo breaks the land rule", brEval(["GC1", "Six"]).failed.includes("mass_land_denial")],
  ["a card flagged by Spellbook breaks the land rule", brEval(["Orb"]).failed.includes("mass_land_denial")],
  ["a combo needing a commander does not exist from the 99", brEval(["Leader", "Three"]).fits],
  ["...and does from the command zone", !brEval(["Leader", "Three"], ["Leader"]).fits],
  ["commander + two cards takes Spellbook's two-card read", !brEval(["Bud", "Leader", "Pal"], ["Leader"]).fits && brEval(["Bud", "Leader", "Pal"], ["Leader"]).combos[0].tag === "R"],
  ["the same three cards from the 99 do not", brEval(["Bud", "Leader", "Pal"]).fits && brEval(["Bud", "Leader", "Pal"]).combos[0].tag === "E"],
  ["two extra turns pass, three fail", brEval(["Time A", "Time B"]).fits && !brEval(["Time A", "Time B", "Time C"]).fits],
  ["four game changers read Bracket 4", brEval(["GC1", "GC2", "GC3", "GC4"]).checklist === 4 && !brEval(["GC1", "GC2", "GC3", "GC4"]).fits],
  ["one game changer reads Bracket 3", brEval(["GC1"]).checklist === 3 && brEval(["GC1"]).fits],
  ["nothing notable reads Bracket 2", brEval(["Plain"]).checklist === 2],
  ["Spellbook's read takes the strongest tag", brEval(["Five", "Six"]).estimate === "R" && brEval(["Plain"]).estimate === "E"],
  ["waiting on combos is pending, not a pass", PodEngine.evaluateBrackets({ stats: { game_changers: 0 }, flagged: {}, deckNames: [], db: {}, combos: null, comboDb: null, validation: [] }).pending],
  ["the cut list always lands inside Bracket 3", [
    ["Two", "Three"], ["Two", "Three", "Plain", "Five"], ["GC1", "GC2", "GC3", "GC4", "Six"],
    ["Time A", "Time B", "Time C", "Orb"], ["Two", "Five", "Six", "Three", "GC1"],
  ].every(names => cutDown(names).fits)],
  ["the commander is the last card it cuts", brEval(["Leader", "Three"], ["Leader"]).cuts.cards.map(c => c.card).join() === "Three"],
  ["real DB: every combo has a known tag", combos.combos.every(c => PodEngine.COMBO_TAGS[c.t])],
  ["real DB: Oracle + Consultation is there, as a Ruthless win", consult.length === 1 && consult[0].win && consult[0].tag === "R" && !consult[0].infinite],
  ["real DB: flags Winter Orb as land denial and Time Warp as a turn", combos.mass_land_denial.includes("Winter Orb") && combos.extra_turn.includes("Time Warp")],
  ["real DB: a throttled build cannot slip through", combos.combos.length > 100000 && Object.keys(combos.templates).length > 100 && !!combos.updated],
];
const brBad = BR_CASES.filter(([, ok]) => !ok);
for (const [label] of brBad) console.log(`BRACKET FAIL: ${label}`);
console.log(`Bracket rules: ${BR_CASES.length - brBad.length}/${BR_CASES.length} correct`);
if (brBad.length) fails++;

// (h) the deck profile. Small synthetic decks keep the arithmetic checkable; the
// committed study guards the calibration of the scale against real decks.
const pfCard = (name, cmc, type_line, extra = {}) => ({ name, cmc, type_line, oracle_text: "", mana_cost: "", produced_mana: [], ...extra });
const pfDeck = (list) => list.map(([card, qty = 1]) => ({ card, qty, name: card.name, cls: PodEngine.classifyCard(card) }));
const pfProfile = (info, combos = []) => PodEngine.computeProfile({ cardsInfo: info, stats: {}, combos, commanders: [] });
const manaDeck = pfDeck([
  [pfCard("Island", 0, "Basic Land — Island", { produced_mana: ["U"] }), 12],
  [pfCard("Mountain", 0, "Basic Land — Mountain", { produced_mana: ["R"] }), 4],
  [pfCard("Guildgate", 0, "Land", { oracle_text: "This land enters tapped.\n{T}: Add {U} or {R}.", produced_mana: ["U", "R"] }), 4],
  [pfCard("Blue", 2, "Creature — Human", { mana_cost: "{U}{U}" }), 3],
  [pfCard("Red", 2, "Instant", { mana_cost: "{R}{R}", oracle_text: "Counter target spell." }), 1],
]);
const mana = pfProfile(manaDeck).manabase;
const sameTable = { slug: "x", cards: [{ n: "Blue", s: 0.5 }, { n: "Red", s: -0.1 }] };
const synOf = (table) => PodEngine.synergyScore({ cardsInfo: manaDeck, commanders: [], table });
const baseProfile = pfProfile(manaDeck);
const weak = PodEngine.computePower(baseProfile, {});
const strong = PodEngine.computePower({ ...baseProfile,
  consistency: { ...baseProfile.consistency, tutors: 17 },
  speed: { ...baseProfile.speed, avgMv: 1.9, cheap: 55, fastMana: 14, ramp: 27 },
  interaction: { ...baseProfile.interaction, cheapAnswers: 12, counters: 11, stax: 13, free: 5 },
  manabase: { ...baseProfile.manabase, quality: 100 },
  wins: { ...baseProfile.wins, ending: 5, twoCard: 3, lines: 2, fastest: 3 },
}, { game_changers: 20 });
const study = read_study();
function read_study() { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "deck_study.json"), "utf8")); }
const scores = (g) => study.decks.filter(d => d.group === g).map(d => d.power.score);
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const PF_CASES = [
  ["lands, basics and always-tapped lands are counted", mana.lands === 20 && mana.basics === 16 && mana.tapped === 4],
  ["a colour's sources include duals", mana.colors.find(c => c.color === "U").sources === 16 && mana.colors.find(c => c.color === "R").sources === 8],
  ["pips weigh by quantity", mana.colors.find(c => c.color === "U").pips === 6 && mana.colors.find(c => c.color === "R").pips === 2],
  ["the weakest colour sets the fixing score", mana.weakest === "R" && mana.fixing === 67],
  ["a conditional tapped land is not always tapped", pfProfile(pfDeck([[pfCard("Check", 0, "Land", { oracle_text: "This land enters tapped unless you control an Island." })]])).manabase.tapped === 0],
  ["a land search is ramp, not a tutor", pfProfile(pfDeck([[pfCard("Cultivate", 3, "Sorcery", { oracle_text: "Search your library for up to two basic land cards." })]])).consistency.tutors === 0],
  ["a tutor is read off the card", pfProfile(pfDeck([[pfCard("Tutor", 2, "Sorcery", { oracle_text: "Search your library for an artifact card." })]])).consistency.tutors === 1],
  ["independent lines share no piece", pfProfile(manaDeck, [
    { cards: ["A", "B"], win: true, tag: "R", features: ["Win the game"], cardsToFind: 2, deploy: 4 },
    { cards: ["B", "C"], win: true, tag: "R", features: ["Win the game"], cardsToFind: 2, deploy: 5 },
    { cards: ["D", "E"], win: true, tag: "R", features: ["Win the game"], cardsToFind: 2, deploy: 6 },
  ]).wins.lines === 2],
  ["salt adds up by front face and only once per card", (() => {
    const s = PodEngine.saltScore(["A // B", "A // B", "C", "Unrated"], { salt: { A: 1.5, C: 0.5 } });
    return s.total === 2 && s.rated === 2 && s.top[0].name === "A";
  })()],
  ["basic lands add no salt", PodEngine.saltScore(["Island", "C"], { salt: { Island: 0.9, C: 0.5 } }).total === 0.5],
  ["no EDHREC page is no data, not zero", synOf(null).status === "none"],
  ["synergy covers nonland cards with positive synergy", synOf(sameTable).coverage === 50 && synOf(sameTable).offPlan === 0],
  ["power reads weak decks low and strong decks at the top", weak.score < 4 && strong.score === 10],
  ["every scored metric sits in a benchmark, so tiers explain the score", Object.keys(PodEngine.METRIC_RANGE).every(k => strong.benchmarks.some(b => b.scored && b.values.some(v => v.key === k)))],
  ["benchmarks read top tier on a strong deck and low on a weak one", strong.benchmarks.filter(b => b.scored).every(b => b.tier === "S") && weak.benchmarks.find(b => b.key === "finding").tier === "F"],
  ["a benchmark names the cards behind it", (() => {
    const info = pfDeck([[pfCard("Search", 2, "Sorcery", { oracle_text: "Search your library for a card." })]]);
    const prof = PodEngine.computeProfile({ cardsInfo: info, stats: {}, combos: [], commanders: [] });
    const power = PodEngine.computePower(prof, {});
    return power.benchmarks.find(b => b.key === "finding").cards.join() === "Search" && power.keyCards[0].name === "Search";
  })()],
  ["study: every cEDH list scores above every precon", Math.min(...scores("cedh")) > Math.max(...scores("precon"))],
  ["study: the precon median stays in the casual band", (() => { const p = sorted(scores("precon")); return p[p.length >> 1] < 5; })()],
  ["study: the pillars stay within 0-100", study.decks.every(d => Object.values(d.power.pillars).every(v => v >= 0 && v <= 100))],
];
const pfBad = PF_CASES.filter(([, ok]) => !ok);
for (const [label] of pfBad) console.log(`PROFILE FAIL: ${label}`);
console.log(`Deck profile: ${PF_CASES.length - pfBad.length}/${PF_CASES.length} correct`);
if (pfBad.length) fails++;

// (i) what a card does, measured against labels written independently of any tag.
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "card_tags_golden.json"), "utf8")).cards;
const studyCards = JSON.parse(fs.readFileSync(path.join(ROOT, "cache", "study_cards.json"), "utf8"));
const byFront = new Map(Object.values(studyCards).map(c => [String(c.name).split(" // ")[0], c]));
const liveTags = PodEngine.indexCardTags(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "card_tags.json"), "utf8")));
const FUNCTIONS = ["ramp", "draw", "tutor", "removal", "wipe", "counter", "protection", "recursion"];
function goldenScore(tags) {
  const score = { tp: 0, fp: 0, fn: 0, misses: [] };
  for (const [name, labels] of Object.entries(golden)) {
    const card = byFront.get(name);
    if (!card) throw new Error(`golden card missing from cache/study_cards.json: ${name}`);
    const read = PodEngine.readCard({ card, name, qty: 1, cls: PodEngine.classifyCard(card) }, tags);
    for (const f of FUNCTIONS) {
      const want = labels.includes(f), got = !!read[f];
      if (want && got) score.tp++;
      else if (got) { score.fp++; score.misses.push(`+${f} ${name}`); }
      else if (want) { score.fn++; score.misses.push(`-${f} ${name}`); }
    }
  }
  score.precision = score.tp / (score.tp + score.fp);
  score.recall = score.tp / (score.tp + score.fn);
  score.f1 = 2 * score.precision * score.recall / (score.precision + score.recall);
  return score;
}
const pct = (x) => (x * 100).toFixed(0) + "%";
const textOnly = goldenScore(null), tagged = goldenScore(liveTags);
console.log(`Card reader on ${Object.keys(golden).length} labelled cards: text only precision ${pct(textOnly.precision)} recall ${pct(textOnly.recall)}; with tags precision ${pct(tagged.precision)} recall ${pct(tagged.recall)}`);
if (process.argv.includes("--misses")) console.log(tagged.misses.join("\n"));
if (tagged.f1 <= textOnly.f1 || tagged.f1 < 0.9) { console.log("CARD READER FAIL: below 90%, or no better than reading text"); fails++; }

process.exit(fails || cmdFails ? 1 : 0);
