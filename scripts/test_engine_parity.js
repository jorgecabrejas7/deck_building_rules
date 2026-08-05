#!/usr/bin/env node
/**
 * Dev-only parity test: loads app/js/engine/ in Node and checks that
 *   (a) the selftest cases pass (same expectations as tier_rules.py --selftest)
 *   (b) all 36 precon decks get the same stats/points/tier as the Python pipeline
 *       (expected values generated on the fly via python3).
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
