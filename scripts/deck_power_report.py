#!/usr/bin/env python3
"""
Given any Commander decklist, classify it against the Tier 1 (Precon) / Tier 2 (Slightly
above precon) guidelines in out/precon_decks/power_baseline.json and report exactly which
dials pushed it there, with the specific cards driving each dial.

Fetches missing card data live from Scryfall on demand and adds it to the shared cache
(cache/scryfall_cache.json), so pod decks and precon decks share one cache.

Decklist format: one card per line, "<qty> <name>" or "<qty>x <name>" (e.g. "1x Sol Ring"
or "1 Sol Ring"). Blank lines and lines starting with # are ignored.

Usage:
  python3 scripts/deck_power_report.py path/to/decklist.txt
  python3 scripts/deck_power_report.py out/precon_decks/dsc/jump-scare.txt
"""

import argparse
import json
import re
import sys
from pathlib import Path

from power_metrics import compute_deck_stats, GATED_DIALS
from fetch_precon_decklists import fetch_scryfall_data

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = REPO_ROOT / "cache" / "scryfall_cache.json"
BASELINE_PATH = REPO_ROOT / "out" / "precon_decks" / "power_baseline.json"

LINE_RE = re.compile(r'^\s*(\d+)\s*x?\s+(.+?)\s*$')


def parse_decklist(path):
    cards = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = LINE_RE.match(line)
        if m:
            cards.append({"quantity": int(m.group(1)), "name": m.group(2)})
        else:
            cards.append({"quantity": 1, "name": line})
    return cards


def classify(stats, guidelines):
    """Return (tier_label, list of (dial, value, tier1_max, tier2_max, status))."""
    breakdown = []
    worst = 1
    for dial in GATED_DIALS:
        value = stats[dial]
        g = guidelines[dial]
        if value <= g["tier1_max"]:
            status = "ok"
        elif value <= g["tier2_max"]:
            status = "tier2"
            worst = max(worst, 2)
        else:
            status = "over"
            worst = 3
        breakdown.append((dial, value, g["tier1_max"], g["tier2_max"], status))

    tier_label = {1: "Tier 1 (Precon)", 2: "Tier 2 (Slightly above precon)", 3: "Above Tier 2 (above pod power level)"}[worst]
    return tier_label, breakdown


def main():
    p = argparse.ArgumentParser(description="Classify a decklist against precon power guidelines")
    p.add_argument("decklist", help="Path to a decklist .txt file")
    args = p.parse_args()

    if not BASELINE_PATH.exists():
        sys.exit(f"No guidelines found at {BASELINE_PATH} — run scripts/generate_power_baseline.py first")
    guidelines = json.loads(BASELINE_PATH.read_text())["guidelines"]

    cache = json.loads(CACHE_PATH.read_text()) if CACHE_PATH.exists() else {}
    cards = parse_decklist(args.decklist)
    names = sorted({c["name"] for c in cards})

    missing = [n for n in names if n not in cache]
    if missing:
        print(f"Fetching {len(missing)} uncached card(s) from Scryfall...", file=sys.stderr)
        cache = fetch_scryfall_data(names, cache, save_cb=lambda c: CACHE_PATH.write_text(json.dumps(c, indent=2, ensure_ascii=False)))
        CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False))

    stats, flagged = compute_deck_stats(cards, cache)
    tier_label, breakdown = classify(stats, guidelines)

    total_qty = sum(c["quantity"] for c in cards)
    print(f"\n{args.decklist}  ({total_qty} cards)")
    print(f"Tier: {tier_label}\n")

    print(f"{'dial':<18}{'value':>7}{'Tier1':>7}{'Tier2':>7}  status")
    for dial, value, t1, t2, status in breakdown:
        marker = {"ok": "", "tier2": "  <- Tier 2", "over": "  <- OVER Tier 2"}[status]
        print(f"{dial:<18}{value:>7}{t1:>7}{t2:>7}{marker}")

    over_dials = [b for b in breakdown if b[4] != "ok"]
    if over_dials:
        print("\nCards driving the flagged dials (consider cutting to come down a tier):")
        for dial, value, t1, t2, status in over_dials:
            cards_for_dial = sorted(flagged[dial], key=lambda x: x[0])
            names_str = ", ".join(f"{name} x{qty}" if qty > 1 else name for name, qty in cards_for_dial)
            print(f"  {dial}: {names_str}")
    else:
        print("\nNo dials exceed Tier 1 — this deck matches stock precon power level.")


if __name__ == "__main__":
    main()
