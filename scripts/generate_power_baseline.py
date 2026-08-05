#!/usr/bin/env python3
"""
Compute descriptive power-metric statistics across the real precon decklists in
out/precon_decks/, and derive Tier 1 / Tier 2 power guidelines from them. Writes both to
out/precon_decks/power_baseline.json.

Tier 1 ("Precon") ceiling per gated dial = the 90th percentile of that dial across all
real precon decks, rounded up — "about as strong as a stock precon gets, ignoring a rare
outlier." Tier 2 ("Slightly above precon") ceiling = Tier 1 ceiling x a per-dial
multiplier (power_metrics.TIER2_MULTIPLIERS). A deck's tier is the lowest tier whose
ceiling isn't exceeded on ANY gated dial (one blown dial is enough to bump it up).

The multipliers are a starting point, not gospel — edit TIER2_MULTIPLIERS in
power_metrics.py and re-run this script to match your pod's comfort level.

Usage:
  python3 scripts/generate_power_baseline.py
"""

import json
import math
from pathlib import Path

from power_metrics import compute_deck_stats, ALL_DIALS, GATED_DIALS, TIER2_MULTIPLIERS

REPO_ROOT = Path(__file__).resolve().parent.parent
DECKS_DIR = REPO_ROOT / "out" / "precon_decks"
CACHE_PATH = REPO_ROOT / "cache" / "scryfall_cache.json"
OUT_PATH = DECKS_DIR / "power_baseline.json"


def percentile(values, pct):
    if not values:
        return 0
    s = sorted(values)
    k = (len(s) - 1) * pct
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] + (s[c] - s[f]) * (k - f)


def main():
    cache = json.loads(CACHE_PATH.read_text())

    deck_stats = []
    for report_path in sorted(DECKS_DIR.glob("*.report.json")):
        product = json.loads(report_path.read_text())
        for deck in product.get("decks", []):
            stats, _ = compute_deck_stats(deck["cards"], cache)
            stats["_label"] = f"{deck['deck_title']} [{product['commander_code']}]"
            deck_stats.append(stats)

    if not deck_stats:
        raise SystemExit("No precon decks found under out/precon_decks/ — run fetch_precon_decklists.py first")

    metrics = {}
    for dial in ALL_DIALS:
        values = [d[dial] for d in deck_stats if d.get(dial) is not None]
        if not values:
            continue
        metrics[dial] = {
            "observed_min": min(values),
            "observed_median": percentile(values, 0.5),
            "observed_p75": percentile(values, 0.75),
            "observed_p90": percentile(values, 0.90),
            "observed_max": max(values),
        }

    guidelines = {}
    for dial in GATED_DIALS:
        tier1_max = math.ceil(metrics[dial]["observed_p90"])
        multiplier = TIER2_MULTIPLIERS[dial]
        if tier1_max > 0:
            tier2_max = math.ceil(tier1_max * multiplier)
        else:
            # multiplying zero by anything is still zero — dials most precons never touch
            # (game changers, tutors, extra turns) would otherwise get NO Tier 2 headroom.
            # A multiplier > 1 means "give this some room to grow"; floor that at +1.
            tier2_max = 1 if multiplier > 1.0 else 0
        guidelines[dial] = {"tier1_max": tier1_max, "tier2_multiplier": multiplier, "tier2_max": tier2_max}

    baseline = {
        "tier_names": {"1": "Precon", "2": "Slightly above precon"},
        "note": (
            "Tier ceiling per dial = decks with that dial's count <= tier{N}_max qualify for "
            "tier N. A deck's overall tier is the lowest tier it fits on EVERY gated dial "
            "(one blown dial bumps it up). Above Tier 2 max on any dial = 'above pod power level.'"
        ),
        "generated_from": f"{len(deck_stats)} real precon decks under out/precon_decks/",
        "guidelines": guidelines,
        "metrics": metrics,
    }

    OUT_PATH.write_text(json.dumps(baseline, indent=2))
    print(f"Wrote baseline + guidelines from {len(deck_stats)} decks to {OUT_PATH}\n")
    print(f"{'dial':<18}{'median':>8}{'p90':>6}{'Tier1':>8}{'Tier2':>8}")
    for dial in GATED_DIALS:
        m, g = metrics[dial], guidelines[dial]
        print(f"{dial:<18}{m['observed_median']:>8}{m['observed_p90']:>6}{g['tier1_max']:>8}{g['tier2_max']:>8}")


if __name__ == "__main__":
    main()
