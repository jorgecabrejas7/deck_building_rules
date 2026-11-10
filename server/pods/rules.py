import copy
import json
from pathlib import Path

# the release ships rules/ next to server/ (deploy/publish.sh)
TEMPLATE_PATH = Path(__file__).resolve().parent.parent.parent / "rules" / "pod_rules.json"


def template():
    rules = json.loads(TEMPLATE_PATH.read_text())
    del rules["power_brackets"]
    return rules


def dig(obj, *path):
    for k in path:
        try:
            obj = obj[int(k) if isinstance(obj, list) else k]  # dotted paths carry list indices as strings
        except (KeyError, IndexError, TypeError, ValueError):
            return None
    return obj


def apply_edits(current, submitted):
    """Copy the editable numbers and banned lists of `submitted` onto a copy of `current`.
    Everything else (strings, ids, ops, flags) stays as stored. Returns (rules, {dotted.path: "invalid"})."""
    rules, errors = copy.deepcopy(current), {}

    def num(target, key, path, lo, hi):
        v = dig(submitted, *path.split("."))
        if type(v) is int and lo <= v <= hi:
            target[key] = v
            return v
        errors[path] = "invalid"

    t1 = num(rules["tiers"]["tier1"], "max_points", "tiers.tier1.max_points", 0, 100)
    t2 = num(rules["tiers"]["tier2"], "max_points", "tiers.tier2.max_points", 0, 100)
    if t1 is not None and t2 is not None and t1 > t2:
        errors["tiers.tier1.max_points"] = "invalid"
    num(rules, "overflow_per_unit", "overflow_per_unit", 0, 10)

    for name, spec in rules["dials"].items():
        if spec.get("forbidden"):
            continue
        p = f"dials.{name}"
        if name == "combos":  # hard_max stays: combos have no steps to derive it from
            free = num(spec, "free_combos", f"{p}.free_combos", 0, 20)
            if free is not None:
                spec["baseline_max"] = free
            num(spec["size_points"], "2", f"{p}.size_points.2", 0, 20)
            num(spec["size_points"], "3", f"{p}.size_points.3", 0, 20)
            num(spec, "default_size_points", f"{p}.default_size_points", 0, 20)
            continue
        base = num(spec, "baseline_max", f"{p}.baseline_max", 0, 100)
        steps = dig(submitted, "dials", name, "point_steps")
        ok = base is not None and isinstance(steps, dict) and len(steps) <= 30
        clean = {}
        if ok:
            for k, v in steps.items():
                if not (isinstance(k, str) and k.isascii() and k.isdigit() and base < int(k) <= 200
                        and type(v) is int and 0 <= v <= 100):
                    ok = False
                    break
                clean[int(k)] = v
            vals = [clean[k] for k in sorted(clean)]
            ok = ok and vals == sorted(vals)
        if ok:
            spec["point_steps"] = {str(k): clean[k] for k in sorted(clean)}
            spec["hard_max"] = max(clean, default=base)
        else:
            errors[f"{p}.point_steps"] = "invalid"

    subs = dig(submitted, "conditionals")
    for i, c in enumerate(rules["conditionals"]):
        if dig(subs, i, "id") != c["id"]:
            errors[f"conditionals.{i}.id"] = "invalid"
            continue
        if "penalty_points" in c:
            num(c, "penalty_points", f"conditionals.{i}.penalty_points", 0, 20)
        if "if" in c:
            num(c["if"], "value", f"conditionals.{i}.if.value", 0, 200)
        for lst in ("then", "if_all"):
            for j, cond in enumerate(c.get(lst, [])):
                num(cond, "value", f"conditionals.{i}.{lst}.{j}.value", 0, 200)

    for key in rules["hard_bans"]["banned_cards"]:
        names = dig(submitted, "hard_bans", "banned_cards", key)
        if isinstance(names, list) and len(names) <= 200 and all(
                isinstance(n, str) and 1 <= len(n.strip()) <= 200 for n in names):
            rules["hard_bans"]["banned_cards"][key] = list(dict.fromkeys(n.strip() for n in names))
        else:
            errors[f"hard_bans.banned_cards.{key}"] = "invalid"
    return rules, errors
