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
const earlyCombos = [];
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
  const matched = PodEngine.matchCombos(entries.map(e => e.name), combos);
  const cardsInfo = entries.filter(e => db[e.name]).map(e => ({ card: db[e.name], qty: e.quantity, name: e.name }));
  const validation = PodEngine.validateDeck(cardsInfo, cmds, db, []);
  const b3 = PodEngine.evaluateBracket3({ stats, flagged, db, validation, combos: matched,
    loopCards: RULES.hard_bans.banned_cards.extra_turn_recursion });
  if (b3.fits) b3Fits++;
  else for (const id of b3.failed) (b3Reasons[id] ||= []).push(exp.deck);
  for (const c of b3.checks.find(x => x.id === "early_combos").combos)
    earlyCombos.push({ deck: exp.deck, ...c });
}
console.log(`Commander detection: ${expected.length - cmdFails}/${expected.length} precons resolved to a listed commander`);
console.log(`Bracket 3: ${b3Fits}/${expected.length} precons fit; misses ${JSON.stringify(
  Object.fromEntries(Object.entries(b3Reasons).map(([k, v]) => [k, v.length])))}`);
for (const c of earlyCombos) console.log(`  early combo: ${c.deck}: ${c.cards.join(" + ")} (${c.mana} mana)`);
// Precons are Bracket 2 decks, so a Bracket-3 miss on anything other than the
// (genuine, unintended) early combos some of them ship means the check drifted.
const unexpected = Object.keys(b3Reasons).filter(k => k !== "early_combos");
if (unexpected.length) {
  console.log(`UNEXPECTED Bracket 3 failures on precons: ${unexpected.join(", ")}`);
  fails++;
}
// early_combos is whitelisted above, so it needs its own guard: every flagged
// combo must have been PRICED, not defaulted. A piece the lookup misses used
// to score 0 mana and drag the combo under the threshold (split and modal
// cards are keyed by their full "A // B" name, the combo DB by the front face).
for (const c of earlyCombos) {
  const priced = c.cards.every(n => {
    const card = db[n] || Object.values(db).find(x => x && String(x.name).split(" // ")[0] === n);
    return card && typeof card.cmc === "number";
  });
  const sum = c.cards.reduce((s, n) => {
    const card = db[n] || Object.values(db).find(x => x && String(x.name).split(" // ")[0] === n);
    return s + (card && typeof card.cmc === "number" ? card.cmc : NaN);
  }, 0);
  if (!priced || sum !== c.mana) {
    console.log(`UNPRICED early combo in ${c.deck}: ${c.cards.join(" + ")} reported ${c.mana}, real ${sum}`);
    fails++;
  }
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

process.exit(fails || cmdFails ? 1 : 0);
