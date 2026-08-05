#!/usr/bin/env node
/**
 * Dev-only parity test: extracts the PodEngine <script> block from
 * app/pod_deck_checker.html, runs it in Node, and checks that
 *   (a) the 20 selftest cases pass (same expectations as tier_rules.py --selftest)
 *   (b) all 36 precon decks get the same stats/points/tier as the Python pipeline
 *       (expected values generated on the fly via python3).
 *
 * Usage: node scripts/test_engine_parity.js [--selftest]
 * Users of the HTML app never need this.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "app", "pod_deck_checker.html"), "utf8");

const engineSrc = html.split("/* ENGINE-START */")[1].split("/* ENGINE-END */")[0];
const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);
const PodEngine = sandbox.module.exports;

const rulesJson = html.match(/<script type="application\/json" id="pod-rules">\s*([\s\S]*?)<\/script>/)[1];
const RULES = JSON.parse(rulesJson);

// Rules drift check: inline block must equal rules/pod_rules.json (ignoring doc-only keys)
const fileRules = JSON.parse(fs.readFileSync(path.join(ROOT, "rules", "pod_rules.json"), "utf8"));
function comparable(r) {
  return JSON.stringify({
    tiers: { tier1: r.tiers.tier1.max_points, tier2: r.tiers.tier2.max_points },
    dials: Object.fromEntries(Object.entries(r.dials).map(([k, v]) => [k, [v.baseline_max, v.point_steps, v.hard_max]])),
    bans: { price: r.hard_bans.max_card_price_eur, cards: r.hard_bans.banned_cards },
    conds: (r.conditionals || []).map(c => [c.id, c.type || "hard", c.if || c.if_all, c.then || c.penalty_points]),
  });
}
if (comparable(RULES) !== comparable(fileRules)) {
  console.error("FAIL: inline rules in HTML have drifted from rules/pod_rules.json");
  process.exit(1);
}
console.log("Rules drift check: OK (HTML inline rules == rules/pod_rules.json)");

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
        out.append({'deck': deck['deck_title'], 'stats': {k: v for k, v in stats.items() if isinstance(v, (int, float)) or v is None},
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
process.exit(fails ? 1 : 0);
