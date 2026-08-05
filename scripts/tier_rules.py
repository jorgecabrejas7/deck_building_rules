#!/usr/bin/env python3
"""
Pod tier evaluator: applies rules/pod_rules.json to the stats produced by
power_metrics.compute_deck_stats(). Pure data-driven logic (no card knowledge here)
so it can be ported 1:1 to JS for the future HTML checker.

Tier logic:
  1. Hard bans (single card > 30 EUR, banned card lists, any dial over its hard_max,
     any violated conditional) => "Above pod power level" regardless of points.
  2. Otherwise, every dial count above its baseline costs points (point_steps maps
     count -> TOTAL points at that count). Sum across dials = the deck's power spend.
  3. points <= tier1.max_points => Tier 1; <= tier2.max_points => Tier 2; else above.

Usage:
  python3 scripts/tier_rules.py --selftest     # synthetic decks hitting each rule
  python3 scripts/tier_rules.py --calibrate    # evaluate all 36 precons
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RULES_PATH = REPO_ROOT / "rules" / "pod_rules.json"

OPS = {
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    "==": lambda a, b: a == b,
}


def load_rules(path=RULES_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dial_points(value, spec, overflow):
    """Total points a dial charges at `value` (> baseline_max). Uses the priced
    steps; beyond the last step, +overflow per extra unit — counting never stops."""
    steps = spec.get("point_steps") or {}
    if str(value) in steps:
        return steps[str(value)]
    if steps:
        last = max(int(k) for k in steps)
        if value > last:
            return steps[str(last)] + (value - last) * overflow
        return 0
    return (value - spec["baseline_max"]) * overflow


def combo_points(sizes, spec):
    """Size-weighted per-combo pricing: each combo priced by piece count
    (2-card 3pts, 3-card 2pts, 4+ 1pt by default), first `free_combos` free —
    the free slots absorb the most expensive combos first."""
    size_pts = spec.get("size_points", {})
    default_pts = spec.get("default_size_points", 1)
    priced = sorted((size_pts.get(str(s), default_pts) for s in sizes), reverse=True)
    return sum(priced[spec.get("free_combos", 0):])


def _names_in_deck(flagged, banned_names):
    """Banned-list hits among the deck's cards. flagged values are (name, qty) lists;
    the union of all flagged names misses unflagged cards, so callers pass a full
    name set instead when available."""
    return sorted(set(banned_names) & flagged)


def evaluate_deck(stats, flagged, rules, card_names=None):
    """stats/flagged: from power_metrics.compute_deck_stats().
    card_names: iterable of every card name in the deck (for banned-list checks);
    falls back to names appearing in `flagged` if omitted.

    Returns dict with: tier ('tier1'|'tier2'|'above'), tier_label, points,
    point_breakdown {dial: pts}, violations [str], flags [str], driving_cards
    {dial: [(name, qty)]} for every dial that costs points or violates."""
    violations = []
    flags = []
    points = 0
    point_breakdown = {}
    driving = {}

    if card_names is None:
        card_names = {n for entries in flagged.values() for n, _ in entries}
    else:
        card_names = set(card_names)

    bans = rules.get("hard_bans", {})

    # 1a. Single-card price ceiling
    max_price = bans.get("max_card_price_eur")
    if max_price is not None:
        over = [(n, q) for n, q in flagged.get("price_30_plus", [])]
        deck_max = stats.get("max_card_price_eur")
        if over or (deck_max is not None and deck_max > max_price):
            names = ", ".join(n for n, _ in over) or f"max card price {deck_max}"
            violations.append(
                f"Card(s) over {max_price:.0f} EUR: {names} — requires explicit table approval")
            driving["price_30_plus"] = over

    # 1b. Banned card lists
    for list_name, names in bans.get("banned_cards", {}).items():
        hits = sorted(card_names & set(names))
        if hits:
            violations.append(f"Banned ({list_name}): {', '.join(hits)}")

    # 1c/2. Per-dial points. Points never stop: beyond the last priced step every
    # extra unit costs overflow_per_unit more. Only dials marked "forbidden"
    # (mass land denial) violate outright; hard_max is display-only metadata.
    overflow = rules.get("overflow_per_unit", 1)
    for dial, spec in rules["dials"].items():
        value = stats.get(dial, 0)
        pts = 0
        if spec.get("scoring") == "per_combo_size":
            pts = combo_points(stats.get("combo_sizes") or [], spec)
        elif value > spec["baseline_max"]:
            pts = dial_points(value, spec, overflow)
        if spec.get("forbidden") and value > 0:
            # Violation AND points: going over pod level never stops the counting.
            violations.append(f"{dial} = {value}: forbidden in this pod")
            driving[dial] = flagged.get(dial, [])
        if pts:
            points += pts
            point_breakdown[dial] = pts
            if dial not in driving:
                driving[dial] = flagged.get(dial, [])
        if spec.get("flag_if_over_zero") and value > 0:
            flags.append(spec["flag_if_over_zero"])

    # 3. Conditionals. Two shapes:
    #    - penalty: {"type": "penalty", "if_all": [tests], "penalty_points": n} —
    #      all tests true => costs extra budget instead of violating outright.
    #    - hard if/then: {"if": test, "then": [required constraints]} — violation.
    for cond in rules.get("conditionals", []):
        if cond.get("type") == "penalty":
            if all(OPS[t["op"]](stats.get(t["dial"], 0), t["value"]) for t in cond["if_all"]):
                pts = cond["penalty_points"]
                points += pts
                point_breakdown[cond["id"]] = pts
                for t in cond["if_all"]:
                    driving.setdefault(t["dial"], flagged.get(t["dial"], []))
            continue
        pre = cond["if"]
        if OPS[pre["op"]](stats.get(pre["dial"], 0), pre["value"]):
            for req in cond["then"]:
                actual = stats.get(req["dial"], 0)
                if not OPS[req["op"]](actual, req["value"]):
                    violations.append(
                        f"[{cond['id']}] {cond['description']} "
                        f"({pre['dial']} = {stats.get(pre['dial'], 0)} requires "
                        f"{req['dial']} {req['op']} {req['value']}, found {actual})")
                    driving.setdefault(pre["dial"], flagged.get(pre["dial"], []))
                    driving.setdefault(req["dial"], flagged.get(req["dial"], []))

    tiers = rules["tiers"]
    if violations:
        tier = "above"
    elif points <= tiers["tier1"]["max_points"]:
        tier = "tier1"
    elif points <= tiers["tier2"]["max_points"]:
        tier = "tier2"
    else:
        tier = "above"
        violations.append(
            f"Total power spend {points} points exceeds Tier 2 budget "
            f"({tiers['tier2']['max_points']})")

    return {
        "tier": tier,
        "tier_label": tiers[tier]["label"],
        "points": points,
        "point_breakdown": point_breakdown,
        "violations": violations,
        "flags": flags,
        "driving_cards": driving,
    }


# ---------------------------------------------------------------- selftest


def _fake(stats_overrides, flagged_overrides=None, names=None):
    stats = {d: 0 for d in
             ["game_changers", "extra_turns", "tutors", "stax_effects", "counterspells",
              "board_wipes", "free_spells", "fast_mana", "mass_land_denial",
              "price_1_5", "price_10_20", "price_20_30", "price_30_plus"]}
    stats["max_card_price_eur"] = 5.0
    stats.update(stats_overrides)
    flagged = {k: [] for k in stats}
    flagged.update(flagged_overrides or {})
    return stats, flagged, names or set()


def selftest():
    rules = load_rules()
    cases = [
        ("stock precon", _fake({"board_wipes": 2, "fast_mana": 6, "free_spells": 1}), "tier1"),
        ("one game changer only", _fake({"game_changers": 1}), "tier1"),
        ("gc + 5th board wipe = 3pts", _fake({"game_changers": 1, "board_wipes": 5}), "tier2"),
        ("5 counterspells still precon", _fake({"counterspells": 5}), "tier1"),
        ("20 cards of 1-5 EUR = 1pt", _fake({"price_1_5": 20}), "tier1"),
        ("25 cards of 1-5 EUR = 2+1 overflow = 3pts", _fake({"price_1_5": 25}), "tier2"),
        ("31 EUR card", _fake({"max_card_price_eur": 31.0},
                              {"price_30_plus": [("Cavern-Hoard Whale", 1)]}), "above"),
        ("two game changers = 2+1 overflow = 3pts", _fake({"game_changers": 2}), "tier2"),
        ("three tutors = 5+1 overflow = 6pts", _fake({"tutors": 3}), "tier2"),
        ("five tutors = 5+3 = 8pts busts budget", _fake({"tutors": 5}), "above"),
        ("two extra turns = 3+1 = 4pts", _fake({"extra_turns": 2}), "tier2"),
        ("two combos free (precon norm)", _fake({"combos": 2, "combo_sizes": [2, 3]}), "tier1"),
        ("four 2-card combos = 3+3 = 6pts", _fake({"combos": 4, "combo_sizes": [2, 2, 2, 2]}), "tier2"),
        ("combos [2,3,3,3] = 2+2 = 4pts", _fake({"combos": 4, "combo_sizes": [2, 3, 3, 3]}), "tier2"),
        ("combo + tutor conditional", _fake({"combos": 1, "combo_sizes": [2], "tutors": 1}), "above"),
        ("mass land denial", _fake({"mass_land_denial": 1}), "above"),
        ("banned fast mana card", _fake({}, None, {"Mana Crypt"}), "above"),
        ("banned turn recursion", _fake({"extra_turns": 1}, None, {"Nexus of Fate"}), "above"),
        ("tutor + gc conditional", _fake({"tutors": 1, "game_changers": 1}), "above"),
        ("gc + pricey conditional", _fake({"game_changers": 1, "price_10_20": 4}), "above"),
        ("fast mana 9 + free 5 = 1+1+2 penalty pts", _fake({"fast_mana": 9, "free_spells": 5}), "tier2"),
        ("fast mana 12 + free 5 = 4+1+2 pts, top of T2", _fake({"fast_mana": 12, "free_spells": 5}), "tier2"),
        ("fast mana 12 + free 6 = 4+2+2 pts, busted budget", _fake({"fast_mana": 12, "free_spells": 6}), "above"),
        ("fast mana 15 = 6+1 overflow = 7pts", _fake({"fast_mana": 15}), "tier2"),
        ("budget blowout 2 tutors + 2 pricey", _fake({"tutors": 2, "price_20_30": 1}), "above"),
        ("tier2 spend: 2 pricey 20-30", _fake({"price_20_30": 2}), "tier2"),
        ("extra turn flagged", _fake({"extra_turns": 1}), "tier2"),
    ]
    failed = 0
    for label, (stats, flagged, names), expected in cases:
        res = evaluate_deck(stats, flagged, load_rules(), card_names=names or None)
        ok = res["tier"] == expected
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {label}: {res['tier']} "
              f"(expected {expected}, {res['points']} pts)"
              + (f"  violations={res['violations']}" if not ok else ""))
        if label == "extra turn flagged" and not res["flags"]:
            failed += 1
            print("FAIL  extra turn should carry a justification flag")
    print(f"\n{len(cases) - failed}/{len(cases)} passed")
    return failed == 0


# ---------------------------------------------------------------- calibration


def calibrate():
    sys.path.insert(0, str(Path(__file__).parent))
    from power_metrics import compute_deck_stats

    cache = json.loads((REPO_ROOT / "cache" / "scryfall_cache.json").read_text())
    rules = load_rules()
    # Commander Spellbook combo counts per deck (see combo_analysis.json; the
    # 'combos' dial is externally measured — inject when the analysis exists).
    combo_path = REPO_ROOT / "out" / "precon_decks" / "combo_analysis.json"
    combo_sizes = {}
    if combo_path.exists():
        for row in json.loads(combo_path.read_text()):
            inc = row.get("included") or []
            combo_sizes[row["deck"]] = [c["n"] for c in inc if c.get("infinite")]
    rows = []
    for report in sorted((REPO_ROOT / "out" / "precon_decks").glob("*.report.json")):
        data = json.loads(report.read_text())
        for deck in data.get("decks", []):
            stats, flagged = compute_deck_stats(deck["cards"], cache)
            stats["combo_sizes"] = combo_sizes.get(deck["deck_title"], [])
            stats["combos"] = len(stats["combo_sizes"])
            names = {c["name"] for c in deck["cards"]}
            res = evaluate_deck(stats, flagged, rules, card_names=names)
            rows.append((deck["deck_title"], report.stem.split(".")[0], stats, res))

    counts = {"tier1": 0, "tier2": 0, "above": 0}
    print(f"{'deck':<42}{'code':<6}{'pts':>4}  tier    detail")
    for name, code, stats, res in sorted(rows, key=lambda r: (-r[3]['points'], r[0])):
        counts[res["tier"]] += 1
        detail = ", ".join(f"{d}+{p}" for d, p in res["point_breakdown"].items())
        if res["violations"]:
            detail = " | ".join(res["violations"])
        print(f"{name:<42}{code:<6}{res['points']:>4}  {res['tier']:<7} {detail}")
    print(f"\nTier 1: {counts['tier1']}  Tier 2: {counts['tier2']}  Above pod: {counts['above']}  (of {len(rows)})")
    ok = counts["above"] == 0 and counts["tier1"] >= 30
    print("ACCEPTANCE:", "PASS" if ok else "FAIL", "(need 0 above pod, >=30 in Tier 1)")
    return ok


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)
    if "--calibrate" in sys.argv:
        sys.exit(0 if calibrate() else 1)
    print(__doc__)
