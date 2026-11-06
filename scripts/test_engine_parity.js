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
 *   (j) the goldfish simulation and draw odds.
 *   (k) the power level, kept apart from the pod verdict, and Jorge's read of his decks.
 *   (l) how much each card does for its deck.
 *   (n) what-if edits to the analyzed deck.
 *   (m) the share link's encode and decode.
 *   (m) the deck beside its commander's average list, and cards unusual for the commander.
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
  const b3 = PodEngine.evaluateBrackets({ stats, flagged, db, validation, combos: matched, comboDb: combos, landDenial: JSON.parse(fs.readFileSync(path.join(ROOT, "data", "land_denial.json"), "utf8")), commanders: cmds,
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
  brCard("Two", 2), brCard("Three", 3), brCard("Five", 5), brCard("Six", 6), brCard("Seven", 7), brCard("Plain", 1),
  brCard("Burst", 4, { type_line: "Sorcery" }), brCard("Bang", 3, { type_line: "Instant" }),
  brCard("Orb", 2), brCard("Leader", 2, { type_line: "Legendary Creature — Human" }),
  brCard("Pal", 1), brCard("Bud", 1),
  brCard("Time A", 3, { oracle_text: "Take an extra turn after this one." }),
  brCard("Time B", 3, { oracle_text: "Take an extra turn after this one." }),
  brCard("Time C", 3, { oracle_text: "Take an extra turn after this one." }),
  brCard("GC1", 2, { game_changer: true }), brCard("GC2", 2, { game_changer: true }),
  brCard("GC3", 2, { game_changer: true }), brCard("GC4", 2, { game_changer: true }),
].map(c => [c.name, c]));
const brDbFile = { templates: {}, mass_land_denial: ["Orb", "Maybe Walker"], extra_turn: [], combos: [
  { c: ["Three", "Two"], r: "Infinite damage", t: "R", f: "ir" },
  { c: ["Two", "Plain"], r: "Infinite mana", t: "R", m: 5, f: "ir" },
  { c: ["Plain", "Three"], r: "Infinite ETB", t: "E", f: "i" },
  { c: ["Plain", "Seven"], r: "Infinite mana", t: "S", f: "ir" },
  { c: ["Five", "Six"], r: "Infinite damage", t: "S", f: "ir" },
  { c: ["Bang", "Burst"], r: "Infinite damage", t: "S", f: "ir" },
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
    comboDb: brDbFile, landDenial: { mass: ["Orb"], maybe: [] }, commanders, validation: [], loopCards: [] });
};
const check = (b, id) => b.checks.find(c => c.id === id);
const realMatch = (names, commanders = []) => PodEngine.activeCombos(PodEngine.matchCombos(names, combos), commanders);
const consult = realMatch(["Thassa's Oracle", "Demonic Consultation"]);
const BR_CASES = [
  ["a combo Spellbook tags 4+ fails", brEval(["Two", "Three"]).failed.includes("combos")],
  ["two cheap permanents earn a tip, and Spellbook's tag stands", (() => {
    const b = brEval(["Five", "Six"]);
    return b.combos[0].fastPair && b.combos[0].tag !== "R" && !b.floor;
  })()],
  ["two spells must share a turn, so 7 mana earns no tip", !brEval(["Bang", "Burst"]).combos[0].fastPair && brEval(["Bang", "Burst"]).combos[0].turnCost === 7],
  ["a 7-mana permanent earns no tip", !brEval(["Plain", "Seven"]).combos[0].fastPair],
  ["a Bracket 3-4 combo fits, with a warning", brEval(["Plain", "Seven"]).fits && check(brEval(["Plain", "Seven"]), "combos").borderline.length === 1],
  ["a land-denial card sets Bracket 4 without moving power", brEval(["Orb"]).floor.reason === "mld"],
  ["a Bracket 1 combo is no concern, however cheap", brEval(["Plain", "Three"]).fits && brEval(["Plain", "Three"]).checklist === 2],
  ["a combo's tag sets its checklist level", brEval(["Plain", "Seven"]).checklist === 3 && brEval(["Two", "Three"]).checklist === 4],
  ["what a combo costs is still reported", brEval(["Two", "Plain"]).combos[0].deploy === 8],
  ["an infinite-turns combo breaks the extra-turn rule", brEval(["Two", "Five", "Six"]).failed.includes("extra_turns")],
  ["a land-denial combo breaks the land rule", brEval(["GC1", "Six"]).failed.includes("mass_land_denial")],
  ["a card sorted as mass land denial breaks the land rule", brEval(["Orb"]).failed.includes("mass_land_denial")],
  ["...and sets the Bracket 4 floor", brEval(["Orb"]).floor.reason === "mld"],
  ["a card only Spellbook flags is a warning, not a break", (() => {
    const b = brEval(["Maybe Walker"]);
    return !b.failed.includes("mass_land_denial") && !b.floor && b.landMaybe.includes("Maybe Walker");
  })()],
  ["a combo needing a commander does not exist from the 99", brEval(["Leader", "Three"]).fits],
  ["...and does from the command zone", !brEval(["Leader", "Three"], ["Leader"]).fits],
  ["commander + two cards takes Spellbook's two-card read", !brEval(["Bud", "Leader", "Pal"], ["Leader"]).fits && brEval(["Bud", "Leader", "Pal"], ["Leader"]).combos[0].tag === "R"],
  ["the same three cards from the 99 do not", brEval(["Bud", "Leader", "Pal"]).fits && brEval(["Bud", "Leader", "Pal"]).combos[0].tag === "E"],
  ["two extra turns pass, three fail", brEval(["Time A", "Time B"]).fits && !brEval(["Time A", "Time B", "Time C"]).fits],
  ["four game changers read Bracket 4", brEval(["GC1", "GC2", "GC3", "GC4"]).checklist === 4 && !brEval(["GC1", "GC2", "GC3", "GC4"]).fits],
  ["one game changer reads Bracket 3", brEval(["GC1"]).checklist === 3 && brEval(["GC1"]).fits],
  ["nothing notable reads Bracket 2", brEval(["Plain"]).checklist === 2],
  ["Spellbook's read takes the strongest tag", brEval(["Two", "Three"]).estimate === "R" && brEval(["Plain"]).estimate === "E"],
  ["waiting on combos is pending, not a pass", PodEngine.evaluateBrackets({ stats: { game_changers: 0 }, flagged: {}, deckNames: [], db: {}, combos: null, comboDb: null, validation: [] }).pending],
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
  interaction: { ...baseProfile.interaction, cheapAnswers: 12, counters: 11, stax: 13, free: 5, removal: 15, wipes: 3 },
  wins: { ...baseProfile.wins, ending: 5, twoCard: 3, lines: 2, web: 13, printed: 4, massPump: 5, lineCost: 2 },
  goldfish: { ...baseProfile.goldfish, winBy: { 8: 70 } },
  shape: { ...baseProfile.shape, engine: { theme: "burn", count: 30 } },
}, {}, { total: 90, top: [] });
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
  ["power is built on wins, interaction, salt and synergy", Object.keys(strong.pillars).sort().join() === "interaction,salt,synergy,wins"],
  ["a deep theme with no interaction adds no synergy", PodEngine.computePower({ ...baseProfile, interaction: { ...baseProfile.interaction, cheapAnswers: 0, counters: 0, stax: 0, free: 0, removal: 0, wipes: 0 }, shape: { ...baseProfile.shape, engine: { theme: "burn", count: 30 } } }, {}).pillars.synergy === 0],
  ["no Game Changer metric: those cards score for what they do", !("gc" in PodEngine.METRIC_RANGE)],
  ["a line through the commander counts half", PodEngine.computeProfile({ cardsInfo: manaDeck, stats: {}, commanders: ["Boss"], combos: [
    { cards: ["Boss", "X"], infinite: true, relevant: true, win: false, tag: "S", features: ["Infinite mana"], cardsToFind: 1, deploy: 4 }] }).wins.ending === 0.5],
  ["every scored metric sits in a benchmark, so tiers explain the score", Object.keys(PodEngine.METRIC_RANGE).every(k => strong.benchmarks.some(b => b.scored && b.values.some(v => v.key === k)))],
  ["benchmarks read top tier on a strong deck and low on a weak one", strong.benchmarks.filter(b => b.scored).every(b => b.tier === "S") && weak.benchmarks.find(b => b.key === "backups").tier === "F"],
  ["a benchmark names the cards behind it", (() => {
    const info = pfDeck([[pfCard("Nope", 2, "Instant", { oracle_text: "Counter target spell." })]]);
    const prof = PodEngine.computeProfile({ cardsInfo: info, stats: {}, combos: [], commanders: [] });
    const power = PodEngine.computePower(prof, {});
    return power.benchmarks.find(b => b.key === "answers").cards.includes("Nope") && power.keyCards[0].name === "Nope";
  })()],
  ["study: the median cEDH list scores above every precon", study.medians.cedh.power > Math.max(...scores("precon"))],
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

// (j) goldfish. Decks simple enough that the right answer is obvious.
const gfCard = (name, cmc, type_line, extra = {}) => pfCard(name, cmc, type_line, extra);
const gfRead = (x) => PodEngine.readCard(x, null);
const allLands = pfDeck([[gfCard("Land", 0, "Basic Land"), 99], [gfCard("Boss", 4, "Legendary Creature — Human"), 1]]);
const gfLands = PodEngine.simulateGoldfish({ cardsInfo: allLands, commanders: ["Boss"], read: gfRead, games: 50 });
const rockDeck = pfDeck([[gfCard("Land", 0, "Basic Land"), 89], [gfCard("Rock", 1, "Artifact", { oracle_text: "{T}: Add {C}{C}." }), 10]]);
const gfRock = PodEngine.simulateGoldfish({ cardsInfo: rockDeck, commanders: [], read: gfRead, games: 200 });
const gfPlain = PodEngine.simulateGoldfish({ cardsInfo: pfDeck([[gfCard("Land", 0, "Basic Land"), 99]]), commanders: [], read: gfRead, games: 200 });
const comboDeck = pfDeck([[gfCard("Land", 0, "Basic Land"), 97], [gfCard("A", 2, "Artifact"), 1], [gfCard("B", 2, "Artifact"), 1]]);
const tutorDeck = pfDeck([[gfCard("Land", 0, "Basic Land"), 79], [gfCard("A", 2, "Artifact"), 1], [gfCard("B", 2, "Artifact"), 1],
  [gfCard("Find", 2, "Sorcery", { oracle_text: "Search your library for a card." }), 19]]);
const line = [{ pieces: ["A", "B"], deploy: 4 }];
const gfCombo = PodEngine.simulateGoldfish({ cardsInfo: comboDeck, commanders: [], combos: line, read: gfRead, games: 300 });
const gfTutor = PodEngine.simulateGoldfish({ cardsInfo: tutorDeck, commanders: [], combos: line, read: gfRead, games: 300 });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const GF_CASES = [
  ["an all-land deck makes one mana a turn", gfLands.mana.every((m, i) => m === i + 1)],
  ["rocks count on the turn they are cast", gfRock.mana[0] > 1],
  ["the commander lands on the turn its mana arrives", gfLands.commanderTurn === 4],
  ["the same deck gives the same numbers", same(gfCombo, PodEngine.simulateGoldfish({ cardsInfo: comboDeck, commanders: [], combos: line, read: gfRead, games: 300 }))],
  ["mana rocks add mana", gfRock.mana[5] > gfPlain.mana[5]],
  ["no lines means no winning turn", gfPlain.winTurn === null && gfPlain.winBy === null],
  ["cheap draw finds lands", PodEngine.simulateGoldfish({ cardsInfo: pfDeck([[gfCard("Land", 0, "Basic Land"), 30], [gfCard("Dig", 1, "Instant", { oracle_text: "Draw a card." }), 40], [gfCard("Blank", 3, "Creature"), 29]]), commanders: [], read: gfRead, games: 300 }).mana[5] >
    PodEngine.simulateGoldfish({ cardsInfo: pfDeck([[gfCard("Land", 0, "Basic Land"), 30], [gfCard("Blank", 3, "Creature"), 69]]), commanders: [], read: gfRead, games: 300 }).mana[5]],
  ["tutors find combo pieces sooner", gfTutor.winBy[8] > gfCombo.winBy[8]],
  ["odds of one card in the opening seven of 99", near(PodEngine.drawOdds(99, 1, 7), 7 / 99)],
  ["odds with no copies, and with every card seen", PodEngine.drawOdds(99, 0, 50) === 0 && near(PodEngine.drawOdds(99, 1, 99), 1)],
];
const gfBad = GF_CASES.filter(([, ok]) => !ok);
for (const [label] of gfBad) console.log(`GOLDFISH FAIL: ${label}`);
console.log(`Goldfish: ${GF_CASES.length - gfBad.length}/${GF_CASES.length} correct`);
if (gfBad.length) fails++;

// (k) the power level, kept apart from the pod verdict.
const vFor = (score, floor = null) => PodEngine.powerLevel({ power: { score }, rules: RULES, checked: true, floor });
const studyNow = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "deck_study.json"), "utf8"));
const vPod = (n) => studyNow.decks.find(d => d.group === "pod" && d.name.startsWith(n));
const V_CASES = [
  ["the pod tier ignores power: a weak deck with a rule break is out", vPod("Tiamat").tier === "above" && vPod("Tiamat").violations.includes("price_cap") && vPod("Tiamat").power.score < 5],
  ["...and a Bracket 4 deck can stay in the pod", vPod("Kotis").practicalBracket === "4" && vPod("Kotis").tier !== "above"],
  ["power up to 4 reads Bracket 2", vFor(4).bracket === "2"],
  ["just over reads 2*", vFor(4.1).bracket === "2*"],
  ["a bracket floor raises the label and leaves the score alone", (() => {
    const v = vFor(3, { bracket: 4, reason: "mld" });
    return v.bracket === "4" && v.powerBracket === "2" && v.score === 3;
  })()],
  ["at least 95% of precons read Bracket 2, and none reads 4", (() => {
    const list = studyNow.decks.filter(d => d.group === "precon");
    return list.filter(d => d.practicalBracket === "2").length >= list.length * 0.95 && !list.some(d => parseFloat(d.practicalBracket) >= 4);
  })()],
  ["a combo above the deck's bracket is flagged with Spellbook's own label, and leaves the bracket alone", (() => {
    const v = PodEngine.powerLevel({ power: { score: 4.1 }, rules: RULES, checked: true, combos: [{ tag: "S", cards: ["A", "B"] }, { tag: "E", cards: ["C", "D"] }] });
    return v.bracket === "2*" && v.watch.length === 1 && v.watch[0].tag === "S" && v.watch[0].items[0] === "A + B";
  })()],
  ["a combo at the deck's own bracket is not suspicious", PodEngine.powerLevel({ power: { score: 6 }, rules: RULES, checked: true, combos: [{ tag: "S", cards: ["A", "B"] }] }).watch.length === 0],
  ["a card that may deny lands is a flag on the reading", PodEngine.powerLevel({ power: { score: 3 }, rules: RULES, checked: true, landMaybe: ["Liliana"] }).watch[0].kind === "landMaybe"],
  ["the scale itself puts at least 95% of precons at Bracket 2", (() => {
    const list = studyNow.decks.filter(d => d.group === "precon");
    return list.filter(d => d.power.base <= RULES.power_brackets.brackets[0][0]).length >= list.length * 0.95;
  })()],
  ["a stock precon's land denial is a flag, not a floor, and no upgrade lift applies", (() => {
    const v = PodEngine.powerLevel({ power: { score: 4.1, base: 3 }, rules: RULES, checked: true, floor: { bracket: 4, reason: "mld", mld: ["Ruination"] }, precon: { name: "X", changes: 0 } });
    return v.bracket === "2" && v.score === 3 && !v.floor && v.watch[0].kind === "land";
  })()],
  ["five swaps are still the precon, six are not", (() => {
    const list = Array.from({ length: 100 }, (_, i) => "C" + i);
    const precons = [{ name: "Box", date: "2020-01-01", cards: list.map(n => [n, 1]) }];
    const deck = (swaps) => list.map((n, i) => ({ name: i < swaps ? "New" + i : n, quantity: 1 }));
    return PodEngine.matchPrecon(deck(5), precons)?.changes === 5 && PodEngine.matchPrecon(deck(6), precons) === null;
  })()],
  ["every cEDH list scores above 95% of precons", (() => {
    const list = studyNow.decks.filter(d => d.group === "precon"), low = Math.min(...studyNow.decks.filter(d => d.group === "cedh").map(d => d.power.base));
    return list.filter(d => d.power.base < low).length >= list.length * 0.95;
  })()],
  // Jorge's read of his own pod's power, November 2026. If a scoring change breaks one, ask him.
  ["Urza is the strongest, well above Luffy", vPod("Urza").power.score >= vPod("Luffy").power.score + 0.5 && vPod("Urza").power.score > vPod("Teysha").power.score],
  ["Urza's power stays below Bracket 4", ["3", "3*"].includes(vPod("Urza").powerBracket)],
  ["Kotis is Bracket 4 for land denial, without topping the ladder on power", vPod("Kotis").practicalBracket === "4" && vPod("Kotis").floor.reason === "mld" && vPod("Kotis").power.score < vPod("Urza").power.score],
  ["Urza and Teysha reach Bracket 3 on power", ["3", "3*"].includes(vPod("Teysha").powerBracket)],
  ["Luffy reads around the top of 2* or low 3", vPod("Luffy").power.score > 5],
  ["Oloro is well above Krenko", vPod("Oloro").power.score >= vPod("Krenko").power.score + 0.8],
  ["Teysha is well above Krenko", vPod("Teysha").power.score >= vPod("Krenko").power.score + 1],
  ["Frodo & Sam reads Bracket 2: it is mostly a precon", vPod("Frodo").powerBracket === "2"],
  ["the decks Jorge calls upgraded read above Bracket 2", ["Tiamat", "Lathril", "Betor", "Cloud"].every(n => vPod(n).powerBracket !== "2")],
  ["Krenko reads the middle of 2*", vPod("Krenko").powerBracket === "2*" && vPod("Krenko").power.score >= 4.5],
  ["Nekusar is below Krenko and close to Lightning", vPod("Nekusar").power.score < vPod("Krenko").power.score && Math.abs(vPod("Nekusar").power.score - vPod("Lightning").power.score) <= 0.5],
];
const vBad = V_CASES.filter(([, ok]) => !ok);
for (const [label] of vBad) console.log(`POWER LEVEL FAIL: ${label}`);
console.log(`Power level: ${V_CASES.length - vBad.length}/${V_CASES.length} correct`);
if (vBad.length) fails++;

// (n) Moxfield links.
const moxDeck = PodEngine.parseMoxfield({ name: "T", boards: {
  commanders: { cards: { a: { quantity: 1, card: { name: "Boss" } } } },
  mainboard: { cards: { b: { quantity: 2, card: { name: "Island" } } } },
  sideboard: { cards: { c: { quantity: 1, card: { name: "Mana Crypt" } } } },
  maybeboard: { cards: { d: { quantity: 1, card: { name: "Sol Ring" } } } } } });
const moxOk = moxDeck.commanders.join() === "Boss" && moxDeck.entries.map(e => e.name + e.quantity).join() === "Boss1,Island2" &&
  PodEngine.detectInput("https://www.moxfield.com/decks/Xgl5XCjm-hk_eXV").id === "Xgl5XCjm-hk_eXV" &&
  PodEngine.detectInput("see moxfield.com for this").kind === "list";
console.log(`Moxfield links: ${moxOk ? "correct" : "FAIL"}`);
if (!moxOk) fails++;

// (m) land drop odds.
const oddsOk = Math.abs(PodEngine.atLeastOdds(10, 4, 1, 3) - PodEngine.drawOdds(10, 4, 3)) < 1e-9 && PodEngine.atLeastOdds(10, 4, 5, 8) === 0 && Math.abs(PodEngine.atLeastOdds(4, 2, 2, 2) - 1 / 6) < 1e-9;
console.log(`Land odds: ${oddsOk ? "correct" : "FAIL"}`);
if (!oddsOk) fails++;

// (l) card values. The arithmetic stays obvious on small synthetic decks.
const cv = (name, extra = {}) => ({ name, qty: 1, cls: { type: extra.land ? "L" : "C", cat: "oth", tags: [] },
  card: { name, cmc: extra.cmc ?? 3, type_line: extra.land ? "Land" : "Creature", color_identity: extra.ci || [], produced_mana: extra.makes || [], oracle_text: extra.oracle || "", edhrec_rank: extra.rank || null } });
const cvDeck = [cv("Boss", { ci: ["U", "R"] }), cv("Rock", { cmc: 2 }), cv("Piece"), cv("Good"), cv("Stranger"), cv("Brick", { cmc: 7 }),
  cv("Dual", { land: true, makes: ["U", "R"] }), cv("Gate", { land: true, makes: ["U"], oracle: "This land enters tapped." }),
  { ...cv("Island", { land: true, makes: ["U"] }), card: { ...cv("Island", { land: true }).card, type_line: "Basic Land — Island", produced_mana: ["U"] } }];
const cvLedger = { fastMana: ["Rock"], ramp: ["Rock"], ending: ["Piece"], web: ["Piece"], twoCard: ["Piece"] };
const cvTable = { cards: [{ n: "Good", s: 0.4, nd: 50, pd: 100 }, { n: "Rock", s: 0, nd: 60, pd: 100 }, { n: "Brick", s: -0.1, nd: 1, pd: 100 }] };
const cvOf = (over = {}) => new Map(PodEngine.cardValues({ cardsInfo: cvDeck, commanders: ["Boss"], ledger: cvLedger,
  combos: [{ cards: ["Piece", "Boss"] }], table: cvTable, ...over }).map(c => [c.name, c]));
const cvA = cvOf();
const CV_CASES = [
  ["the commander tops the deck", cvA.get("Boss").level === 5 && PodEngine.cardValues({ cardsInfo: cvDeck, commanders: ["Boss"], ledger: cvLedger, table: cvTable })[0].name === "Boss"],
  ["a piece of a winning line reads key", cvA.get("Piece").level === 5 && cvA.get("Piece").combos.length === 1],
  ["a card that fits the commander and is widely run reads strong", cvA.get("Good").level === 4],
  ["a card off the commander's page with no job reads weak", cvA.get("Stranger").level === 1],
  ["an expensive card with no job is marked heavy", cvA.get("Brick").reasons.some(r => r.k === "heavy")],
  ["with no page, rank stands in and no card is called off plan", (() => {
    const v = cvOf({ table: null }); return v.get("Stranger").reasons.every(r => r.k !== "offPlan");
  })()],
  ["a dual beats a tapped mono land, and a basic reads solid", cvA.get("Dual").score > cvA.get("Gate").score && cvA.get("Island").level === 3],
  ["points stay apart from value: a costly card keeps its level", (() => {
    const v = cvOf({ whatIf: { Good: { dPts: 3, fixes: false } } }).get("Good");
    return v.level === cvA.get("Good").level && v.points.saves === 3;
  })()],
  ["a card that saves nothing shows no point cost", cvOf({ whatIf: { Good: { dPts: 0, fixes: false } } }).get("Good").points === null],
];
const cvBad = CV_CASES.filter(([, ok]) => !ok);
for (const [label] of cvBad) console.log(`CARD VALUE FAIL: ${label}`);
console.log(`Card values: ${CV_CASES.length - cvBad.length}/${CV_CASES.length} correct`);
if (cvBad.length) fails++;

// (n) what-if edits, on small decks.
const edDeck = () => ({ deckName: "T", commanders: ["Boss", "Pal"], entries: [{ name: "Boss", quantity: 1 }, { name: "Pal", quantity: 1 }, { name: "Forest", quantity: 3 }, { name: "Rock", quantity: 1 }] });
const edQty = (d, n) => (d.entries.find(e => e.name === n) || { quantity: 0 }).quantity;
const edStart = edDeck();
const edFig = { evalRes: { points: 4 }, stats: { total_price_eur: 9.5 }, level: { pending: false, bracket: "2*", score: 4.5 }, bracket: { pending: false, combos: [{}, {}] } };
const ED_CASES = [
  ["a basic with copies to spare loses one copy", edQty(PodEngine.removeCards(edStart, ["Forest"]), "Forest") === 2],
  ["naming a card twice in a batch takes two copies", edQty(PodEngine.removeCards(edStart, ["Forest", "Forest"]), "Forest") === 1],
  ["a batch can never take a card below zero", edQty(PodEngine.removeCards(edStart, ["Rock", "Rock"]), "Rock") === 0 && PodEngine.removeCards(edStart, ["Rock", "Rock"]).entries.length === 3],
  ["the last copy leaves the list", !PodEngine.removeCards(edStart, ["Rock"]).entries.some(e => e.name === "Rock")],
  ["a removed commander leaves the command zone, its partner stays", PodEngine.removeCards(edStart, ["Boss"]).commanders.join() === "Pal"],
  ["removing and adding never touch the deck they were given", (PodEngine.removeCards(edStart, ["Forest", "Boss"]), PodEngine.addCard(edStart, "Forest"), JSON.stringify(edStart) === JSON.stringify(edDeck()))],
  ["adding a new card appends one copy", edQty(PodEngine.addCard(edStart, "Mox"), "Mox") === 1],
  ["adding a basic stacks it", edQty(PodEngine.addCard(edStart, "Forest"), "Forest") === 4 && PodEngine.addCard(edStart, "Forest").entries.length === 4],
  ["basics and 'any number' cards stack, others do not", PodEngine.stacksInDeck({ type_line: "Basic Snow Land — Forest" }) && PodEngine.stacksInDeck({ type_line: "Creature — Rat", oracle_text: "A deck can have any number of cards named Relentless Rats." }) && !PodEngine.stacksInDeck({ type_line: "Artifact", oracle_text: "" })],
  ["the diff counts copies, both ways", (() => {
    const d = PodEngine.deckDiff(edStart, PodEngine.addCard(PodEngine.removeCards(edStart, ["Forest", "Forest", "Rock"]), "Mox"));
    return d.added.length === 1 && d.added[0].name === "Mox" && d.removed.length === 2 && d.removed[0].name === "Forest" && d.removed[0].qty === 2;
  })()],
  ["remove then add again reads as no change", (() => {
    const d = PodEngine.deckDiff(edStart, PodEngine.addCard(PodEngine.removeCards(edStart, ["Rock"]), "Rock"));
    return !d.added.length && !d.removed.length;
  })()],
  ["a commander pick follows the edit, so it still matches the new list", (() => {
    const next = PodEngine.removeCards(edStart, ["Rock"]);
    const pick = PodEngine.carryPick({ key: PodEngine.deckFingerprint(edStart.entries), names: ["Pal"] }, edStart, next);
    return pick.names.join() === "Pal" && pick.key === PodEngine.deckFingerprint(next.entries);
  })()],
  ["a pick loses a cut card, and goes back to detection when no one is left", (() => {
    const key = PodEngine.deckFingerprint(edStart.entries), next = PodEngine.removeCards(edStart, ["Boss"]);
    return PodEngine.carryPick({ key, names: ["Boss", "Pal"] }, edStart, next).names.join() === "Pal" && PodEngine.carryPick({ key, names: ["Boss"] }, edStart, next) === null;
  })()],
  ["a pick for another deck is left alone", (() => {
    const stale = { key: "other", names: ["Boss"] };
    return PodEngine.carryPick(stale, edStart, PodEngine.removeCards(edStart, ["Rock"])) === stale;
  })()],
  ["the bar's figures wait for the combo check", (() => {
    const done = PodEngine.editFigures(edFig);
    const wait = PodEngine.editFigures({ ...edFig, level: { ...edFig.level, pending: true }, bracket: { pending: true, combos: [] } });
    return done.points === 4 && done.bracket === "2*" && done.power === 4.5 && done.combos === 2 && done.price === 9.5 && wait.points === 4 && wait.bracket === null && wait.power === null && wait.combos === null;
  })()],
  ["with its commander cut and no one to replace it, a real deck still reads end to end", (() => {
    const entries = expected[0].cards.map(c => ({ name: c.name, quantity: c.quantity }));
    const cmds = PodEngine.pickCommanders({ entries, commanders: [] }, db);
    const cut = PodEngine.removeCards({ entries, commanders: cmds }, cmds);
    const resolved = cut.entries.filter(e => db[e.name]);
    const { stats, flagged } = PodEngine.computeDeckStats(resolved, db);
    const cardsInfo = resolved.map(e => ({ card: db[e.name], qty: e.quantity, name: e.name, cls: PodEngine.classifyCard(db[e.name]) }));
    const bracket = PodEngine.evaluateBrackets({ stats, flagged, db, validation: PodEngine.validateDeck(cardsInfo, [], db, []), commanders: [], deckNames: resolved.map(e => e.name),
      combos: [], comboDb: combos, loopCards: RULES.hard_bans.banned_cards.extra_turn_recursion, unresolved: 0 });
    const profile = PodEngine.computeProfile({ cardsInfo, stats, combos: bracket.combos, commanders: [] });
    const level = PodEngine.powerLevel({ power: PodEngine.computePower(profile, stats, null), rules: RULES, checked: true, floor: bracket.floor, combos: bracket.combos, landMaybe: bracket.landMaybe, gameChangers: [] });
    const values = PodEngine.cardValues({ cardsInfo, commanders: [], ledger: profile.ledger, combos: bracket.combos, table: null, whatIf: {} });
    return !cut.commanders.length && stats.total_cards === 100 - cmds.length && !!level.bracket && values.length === cardsInfo.length;
  })()],
];
const edBad = ED_CASES.filter(([, ok]) => !ok);
for (const [label] of edBad) console.log(`EDIT FAIL: ${label}`);
console.log(`What-if edits: ${ED_CASES.length - edBad.length}/${ED_CASES.length} correct`);
if (edBad.length) fails++;
// (m) the share link: the list and pick survive the trip, and a bad link reads as nothing
const shareDeck = "Commander: Atraxa, Praetors' Voice\n1x Sol Ring\n3x Forêt";
const shareCode = await PodEngine.encodeShare({ text: shareDeck, commanders: ["Atraxa, Praetors' Voice"] });
const shareBack = await PodEngine.decodeShare(shareCode);
const deflated = async (s) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const bomb = b64url(await deflated(JSON.stringify({ t: "x".repeat(300_000), c: null })));
const SHARE_CASES = [
  ["the list comes back whole, accents included", shareBack && shareBack.text === shareDeck],
  ["the commander pick comes back", shareBack && shareBack.commanders.length === 1 && shareBack.commanders[0] === "Atraxa, Praetors' Voice"],
  ["no pick stays no pick", (await PodEngine.decodeShare(await PodEngine.encodeShare({ text: "1x Sol Ring", commanders: null }))).commanders === null],
  ["the code fits a URL fragment untouched", /^[A-Za-z0-9_-]+$/.test(shareCode)],
  ["a garbled link reads as nothing", await PodEngine.decodeShare("not*base64!") === null],
  ["base64 that is not deflate reads as nothing", await PodEngine.decodeShare("aGVsbG8gd29ybGQ") === null],
  ["a cut-off link reads as nothing", await PodEngine.decodeShare(shareCode.slice(0, shareCode.length >> 1)) === null],
  ["an empty link reads as nothing", await PodEngine.decodeShare("") === null],
  ["deflated JSON that is no deck reads as nothing", await PodEngine.decodeShare(b64url(await deflated('{"t":5,"c":null}'))) === null],
  ["commanders that are not names read as nothing", await PodEngine.decodeShare(b64url(await deflated('{"t":"1x Sol Ring","c":[1]}'))) === null],
  ["a link that inflates past the limit reads as nothing", await PodEngine.decodeShare(bomb) === null],
];
const shareBad = SHARE_CASES.filter(([, ok]) => !ok);
for (const [label] of shareBad) console.log(`SHARE FAIL: ${label}`);
console.log(`Share link: ${SHARE_CASES.length - shareBad.length}/${SHARE_CASES.length} correct`);
if (shareBad.length) fails++;
// (n) fitting text on the rule-zero card, measured at one unit per character.
const chars = s => s.length;
const fitsIn = n => s => s.length <= n;
const FIT_CASES = [
  ["words wrap at the width", PodEngine.wrapLines("aa bb cc", 5, chars).join("|") === "aa bb|cc"],
  ["a word wider than the line keeps its own line", PodEngine.wrapLines("aaaaaaa b", 3, chars).join("|") === "aaaaaaa|b"],
  ["no text, no lines", PodEngine.wrapLines("", 5, chars).length === 0],
  ["a short list has no count", PodEngine.moreList(["a", "b"], 3) === "a · b"],
  ["a long list counts the rest", PodEngine.moreList(["a", "b", "c", "d"], 2) === "a · b +2"],
  ["fitList keeps everything that fits", PodEngine.fitList(["aa", "bb"], fitsIn(7)) === "aa · bb"],
  ["fitList drops what does not fit and counts it", PodEngine.fitList(["aa", "bb", "cc"], fitsIn(7)) === "aa +2"],
  ["an item too long is cut, and the count stays", PodEngine.fitList(["aaaaaaaa", "b"], fitsIn(6)) === "aa… +1"],
  ["fitList on nothing is empty", PodEngine.fitList([], fitsIn(6)) === ""],
];
const fitBad = FIT_CASES.filter(([, ok]) => !ok);
for (const [label] of fitBad) console.log(`TEXT FIT FAIL: ${label}`);
console.log(`Text fit: ${FIT_CASES.length - fitBad.length}/${FIT_CASES.length} correct`);
if (fitBad.length) fails++;
// (m) one card away from a combo.
const nearDb = { templates: { 7: ["Slotty", "Other Slot"] }, combos: [
  { c: ["A", "B"], r: "win", t: "E" },            // one missing: B
  { c: ["A", "C"], r: "win", t: "R" },            // one missing: C
  { c: ["A", "Have"], r: "win", t: "C" },         // complete: not near
  { c: ["X", "Y"], r: "win", t: "R" },            // two missing
  { c: ["A", "B", "Y"], r: "win", t: "R" },       // two missing, one of them late
  { c: ["Have", "D"], r: "win", t: "P", q: [[1, "Slot", 7]] },     // slot filled from the deck
  { c: ["Have", "E"], r: "win", t: "P", q: [[1, "Slot", 7], [1, "Slot", 7]] }, // deck holds only one slot card
  { c: ["Have", "F"], r: "win", t: "P", q: [[1, "Slot", 99]] },    // unknown template
  { c: ["Boss", "G"], r: "win", t: "S", mc: ["Boss"] },            // needs Boss in the zone
  { c: ["Have", "H"], r: "win", t: "S", mc: ["H"] },               // the missing card would have to lead
  { c: ["A", "B"], r: "win", t: "E", q: [[1, "Slot", 7]] },        // same pieces as row 1: dropped
  { c: ["Have", "Split"], r: "win", t: "E" },
] };
const nearDeck = ["A", "Have", "Boss", "Slotty // Back"];
const nearOf = (cmds) => PodEngine.nearCombos(nearDeck, nearDb, cmds);
const nearKeys = (list) => list.map(c => c.missing).sort().join(",");
const nearGroups = PodEngine.groupNear(["P", "R"].map(tag => ({ missing: "Two", tag, cards: [] })).concat(
  [{ missing: "OneE", tag: "E", cards: [] }, { missing: "OneR", tag: "R", cards: [] }]));
const nearCards = { Boss: { color_identity: ["U"] }, Mate: { color_identity: ["B"] },
  Blue: { color_identity: ["U"], legal_commander: "legal" }, Dimir: { color_identity: ["U", "B"], legal_commander: "legal" },
  Red: { color_identity: ["R"], legal_commander: "legal" }, Grey: { color_identity: [], legal_commander: "legal" },
  Ban: { color_identity: ["U"], legal_commander: "banned" }, Odd: { color_identity: ["U"], legal_commander: "not_legal" } };
const nearFit = (cmds) => PodEngine.nearPlayable(["Blue", "Dimir", "Red", "Grey", "Ban", "Odd", "Unfound"].map(card => ({ card })), nearCards, cmds).map(g => g.card).join(",");
const realDeck = ["Heliod, Sun-Crowned", "Sol Ring"];
const realNear = PodEngine.nearCombos(realDeck, combos, ["Heliod, Sun-Crowned"]);
const NEAR_CASES = [
  ["finds the one missing card, and only that", nearKeys(nearOf([])) === "B,C,D,Split"],
  ["a commander in the zone opens its must-command combo", nearKeys(nearOf(["Boss"])) === "B,C,D,G,Split"],
  ["a template slot is filled from the deck, front face included", nearOf([]).find(c => c.missing === "D").filled[0] === "Slotty"],
  ["repeated pieces count once", nearOf([]).filter(c => c.missing === "B").length === 1],
  ["a complete combo is not near, and stays matched", PodEngine.matchCombos(nearDeck, nearDb).map(c => c.cards.join("+")).join() === "A+Have"],
  ["most combos first, then Spellbook's tag", nearGroups.map(g => g.card).join() === "Two,OneR,OneE"],
  ["inside a card, combos run in tag order", nearGroups[0].combos.map(c => c.tag).join() === "R,P"],
  ["drops off-colour, banned, not-legal and unfound cards", nearFit(["Boss"]) === "Blue,Grey"],
  ["partners share their colours", nearFit(["Boss", "Mate"]) === "Blue,Dimir,Grey"],
  ["the real database: every row misses one card the deck lacks", realNear.length > 0 && realNear.every(c => !realDeck.includes(c.missing) && c.cards.includes(c.missing))],
];
const nearBad = NEAR_CASES.filter(([, ok]) => !ok);
for (const [label] of nearBad) console.log(`NEAR COMBO FAIL: ${label}`);
console.log(`Near combos: ${NEAR_CASES.length - nearBad.length}/${NEAR_CASES.length} correct`);
if (nearBad.length) fails++;
// (m) the deck beside its commander's average list, and the cards unusual for that commander
const avgPage = { creature: 1, instant: 0, sorcery: 0, artifact: 2, enchantment: 0, battle: 0, planeswalker: 0, land: 36, basic: 13, nonbasic: 23,
  panels: { mana_curve: { 1: 8, 7: 1, 12: 1 } }, container: { json_dict: { card: { name: "Boss", num_decks: 1234, rank: 7, salt: 1.5 } } } };
const avgRead = PodEngine.parseAverage(avgPage);
const avgCard = (name, type, cmc, qty = 1, type_line = "") => ({ qty, card: { name, cmc, type_line }, cls: { type } });
const avgOut = PodEngine.compareToAverage({ commanders: ["Boss // Back"], average: avgRead, cardsInfo: [
  avgCard("Boss // Back", "C", 3), avgCard("Beast", "C", 3), avgCard("Golem", "C", 9), avgCard("Rock", "A", 1),
  avgCard("Island", "L", 0, 20, "Basic Land — Island"), avgCard("Dual", "L", 0, 1, "Land")] });
const avgRow = (list, k) => list.find(r => r.k === k);
const AVG_CASES = [
  ["a page reads its deck count and rank", avgRead.decks === 1234 && avgRead.rank === 7 && avgRead.name === "Boss"],
  ["curve values past 7 fold into the top column", avgRead.curve[7] === 2 && avgRead.curve[1] === 8],
  ["a redirect or empty answer is no page", PodEngine.parseAverage({ redirect: "/average-decks/x" }) === null && PodEngine.parseAverage({}) === null],
  ["a page with no rank says so", PodEngine.parseAverage({ ...avgPage, container: { json_dict: { card: { name: "Boss" } } } }).rank === null],
  ["the commander stays out of the count", avgRow(avgOut.types, "C").own === 2],
  ["differences are signed against the average", avgRow(avgOut.types, "C").diff === 1 && avgRow(avgOut.types, "A").diff === -1],
  ["lands split into basics and nonbasics, counting copies", avgRow(avgOut.types, "land").own === 21 && avgRow(avgOut.types, "basic").own === 20 && avgRow(avgOut.types, "nonbasic").diff === -22],
  ["a type empty on both sides is dropped", !avgRow(avgOut.types, "B") && !avgRow(avgOut.types, "I")],
  ["the curve counts nonlands, heavy cards in the top column", avgRow(avgOut.curve, 7).own === 1 && avgRow(avgOut.curve, 3).own === 1 && avgRow(avgOut.curve, 1).diff === -7 && !avgRow(avgOut.curve, 0)],
  ["a card off the commander's page is unusual", cvA.get("Stranger").unusual === true],
  ["a card in few of its decks is unusual", cvA.get("Brick").unusual === true],
  ["a card in many of its decks is not", cvA.get("Good").unusual === false],
  ["lands and the commander are never marked", cvA.get("Dual").unusual === false && cvA.get("Boss").unusual === false],
  ["with no page nothing is marked", [...cvOf({ table: null }).values()].every(c => c.unusual === false)],
];
const avgBad = AVG_CASES.filter(([, ok]) => !ok);
for (const [label] of avgBad) console.log(`AVERAGE FAIL: ${label}`);
console.log(`Average deck: ${AVG_CASES.length - avgBad.length}/${AVG_CASES.length} correct`);
if (avgBad.length) fails++;
// budget: totals, honesty before the lookup, and what fetchCheapest keeps. Network stubbed.
const bgCard = (name, price, extra = {}) => ({ name, price, cmc: 2, type_line: "Creature", oracle_text: "", ...extra });
const bgInfo = (db) => Object.values(db).map(card => ({ name: card.name, qty: card.name === "Dear" ? 2 : 1, card }));
const bgDb = Object.fromEntries([["Dear", 10], ["Flat", 3], ["Penny", 0.5], ["Dead", 2], ["None", null]].map(([n, p]) => [n, bgCard(n, p)]));
const bgBefore = PodEngine.budgetTotals(bgInfo(bgDb));
const bgFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (url.includes("Dead")) throw new Error("offline");
  const eur = url.includes("Dear") ? ["2.00", "9.00"] : ["3.50"];
  return { ok: true, status: 200, json: async () => ({ data: eur.map(e => ({ prices: { eur: e } })) }) };
};
await PodEngine.fetchCheapest(Object.keys(bgDb), bgDb);
globalThis.fetch = bgFetch;
const bgPartial = PodEngine.budgetTotals(bgInfo(bgDb));
const bgDeadFailed = bgDb.Dead.cheapest === undefined;
bgDb.Dead.cheapest = true;
const bgAfter = PodEngine.budgetTotals(bgInfo(bgDb));
const bgStats = PodEngine.computeDeckStats(Object.keys(bgDb).map(name => ({ name, quantity: name === "Dear" ? 2 : 1 })), bgDb).stats;
const bgLegacy = PodEngine.budgetTotals(bgInfo({ Old: bgCard("Old", 4, { cheapest: true }) }));
const BUDGET_CASES = [
  ["before the lookup there is a default total and no saving", bgBefore.atDefault === 25.5 && bgBefore.atCheapest === null && bgBefore.saving === null && bgBefore.pending === 3],
  ["fetchCheapest keeps the default and lowers the price", bgDb.Dear.price === 2 && bgDb.Dear.price_default === 10 && bgDb.Dear.cheapest === true],
  ["no cheaper printing leaves the price and still records the default", bgDb.Flat.price === 3 && bgDb.Flat.price_default === 3],
  ["a card under €1 is not looked up", bgDb.Penny.cheapest === undefined && bgDb.Penny.price_default === undefined],
  ["a failed lookup keeps the saving hidden", bgDeadFailed && bgPartial.pending === 1 && bgPartial.saving === null],
  ["the default total does not move with the lookup", bgPartial.atDefault === 25.5 && bgAfter.atDefault === 25.5],
  ["totals and saving count copies", bgAfter.atCheapest === 9.5 && bgAfter.saving === 16],
  ["pod points read the same cheapest price as the budget total", bgStats.total_price_eur === bgAfter.atCheapest],
  ["unpriced cards stay out and are counted", bgAfter.unpriced === 1 && bgAfter.priciest.every(c => c.name !== "None")],
  ["the priciest list sorts by current price and keeps the default", bgAfter.priciest[0].name === "Flat" && bgAfter.priciest.find(c => c.name === "Dear").priceDefault === 10],
  ["a cached card without the field is flagged", bgLegacy.defaultUnknown === 1 && bgLegacy.atDefault === 4 && bgLegacy.saving === 0],
  ["a card not looked up yet is pending, not flagged", bgBefore.defaultUnknown === 0],
  ["the buy link searches the front face, encoded", PodEngine.cardmarketUrl("Fire & Ice's // Back").endsWith("searchString=Fire%20%26%20Ice's")],
  ["the wants list has quantity and full name per line", PodEngine.cardmarketWants([{ qty: 2, card: { name: "A // B" } }, { qty: 1, card: { name: "C" } }]) === "2 A // B\n1 C"],
];
const bgBad = BUDGET_CASES.filter(([, ok]) => !ok);
for (const [label] of bgBad) console.log(`BUDGET FAIL: ${label}`);
console.log(`Budget: ${BUDGET_CASES.length - bgBad.length}/${BUDGET_CASES.length} correct`);
if (bgBad.length) fails++;
// (t) the table check: a description of the table, from the power level.
const tcDeck = (name, score, { wins = 20, interaction = 30, salt = 20, gc = 0, ...level } = {}) =>
  ({ name, gc, power: { pillars: { wins, interaction, salt } }, level: { score, watch: [], floor: null, pending: false, ...level } });
const tcOf = (...decks) => PodEngine.tableCheck(decks);
const tcOut = (c, name) => c.standouts.find(s => s.name === name);
const tcM = PodEngine.TABLE_CHECK;
const TC_CASES = [
  ["a gap of exactly the even limit reads even, despite float noise", tcOf(tcDeck("A", 5.6), tcDeck("B", 4.6)).balance === "even"],
  ["just past the even limit reads close", tcOf(tcDeck("A", 4.1 + tcM.evenUpTo), tcDeck("B", 4)).balance === "close"],
  ["the close limit is still close, past it reads wide", tcOf(tcDeck("A", 4 + tcM.closeUpTo), tcDeck("B", 4)).balance === "close" && tcOf(tcDeck("A", 4.1 + tcM.closeUpTo), tcDeck("B", 4)).balance === "wide"],
  ["the spread runs from lowest to highest across four decks", (() => {
    const c = tcOf(tcDeck("A", 4), tcDeck("B", 6.5), tcDeck("C", 3.3), tcDeck("D", 5));
    return c.low === 3.3 && c.high === 6.5 && c.spread === 3.2 && c.balance === "wide";
  })()],
  ["an even table has no standouts", tcOf(tcDeck("A", 5), tcDeck("B", 5.2), tcDeck("C", 4.9)).standouts.length === 0],
  ["a deck above the others stands out on power and says why", (() => {
    const s = tcOut(tcOf(tcDeck("Top", 7, { wins: 80, interaction: 60, salt: 50, gc: 3 }), tcDeck("B", 4.5), tcDeck("C", 4.6), tcDeck("D", 4.4)), "Top");
    return ["score", "wins", "interaction", "salt", "gc"].every(k => s.more.includes(k)) && !s.less;
  })()],
  ["one deck below an even table reads below, and the rest do not stand out", (() => {
    const c = tcOf(tcDeck("A", 6), tcDeck("B", 6), tcDeck("C", 6), tcDeck("Low", 3));
    return c.standouts.length === 1 && c.standouts[0].name === "Low" && c.standouts[0].less && !c.standouts[0].more.length;
  })()],
  ["a deck can stand out on one measure without standing out on power", (() => {
    const s = tcOut(tcOf(tcDeck("Salty", 5, { salt: 20 + tcM.margin.salt }), tcDeck("B", 5), tcDeck("C", 5)), "Salty");
    return s.more.join() === "salt" && !s.less;
  })()],
  ["just under a margin does not stand out", tcOf(tcDeck("A", 5, { gc: tcM.margin.gc - 1 }), tcDeck("B", 5)).standouts.length === 0],
  ["two decks: the lower one reads less on power only", (() => {
    const c = tcOf(tcDeck("A", 7, { wins: 90 }), tcDeck("B", 4));
    return tcOut(c, "A").more.join() === "score,wins" && tcOut(c, "B").less && !tcOut(c, "B").more.length;
  })()],
  ["two decks under one name stay two decks", tcOf(tcDeck("Same", 7), tcDeck("Same", 4)).spread === 3],
  ["pending power compares nothing, and still lists what is known", (() => {
    const c = tcOf(tcDeck("A", 7, { watch: [{ kind: "gc", items: ["X"] }] }), tcDeck("B", 4, { pending: true }));
    return c.pending && c.balance === undefined && !c.standouts && c.mention.length === 1 && c.mention[0].name === "A";
  })()],
  ["mention carries level.watch through the real powerLevel, combos and game changers", (() => {
    const level = PodEngine.powerLevel({ power: { score: 3 }, rules: RULES, checked: true, combos: [{ tag: "R", cards: ["A", "B"] }], gameChangers: ["Rhystic Study"] });
    const m = tcOf({ name: "W", gc: 1, power: { pillars: { wins: 20, interaction: 30, salt: 20 } }, level }, tcDeck("Quiet", 3)).mention;
    return m.length === 1 && m[0].name === "W" && m[0].watch.some(w => w.tag === "R") && m[0].watch.some(w => w.kind === "gc");
  })()],
  ["a land denial floor is mentioned though level.watch leaves it out", (() => {
    const level = PodEngine.powerLevel({ power: { score: 3 }, rules: RULES, checked: true, floor: { bracket: 4, reason: "mld", mld: ["Armageddon"] } });
    const m = tcOf({ name: "L", gc: 0, power: { pillars: { wins: 20, interaction: 30, salt: 20 } }, level }, tcDeck("B", 3)).mention;
    return level.watch.length === 0 && m[0].watch[0].kind === "land" && m[0].watch[0].items[0] === "Armageddon";
  })()],
  ["a precon's land denial is mentioned once", (() => {
    const level = PodEngine.powerLevel({ power: { score: 3, base: 3 }, rules: RULES, checked: true, precon: { name: "P" }, floor: { bracket: 4, reason: "mld", mld: ["Armageddon"] } });
    const m = tcOf({ name: "P", gc: 0, power: { pillars: { wins: 20, interaction: 30, salt: 20 } }, level }, tcDeck("B", 3)).mention;
    return m[0].watch.filter(w => w.kind === "land").length === 1;
  })()],
];
const tcBad = TC_CASES.filter(([, ok]) => !ok);
for (const [label] of tcBad) console.log(`TABLE CHECK FAIL: ${label}`);
console.log(`Table check: ${TC_CASES.length - tcBad.length}/${TC_CASES.length} correct`);
if (tcBad.length) fails++;

process.exit(fails || cmdFails ? 1 : 0);
