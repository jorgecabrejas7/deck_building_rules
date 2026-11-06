#!/usr/bin/env python3
"""
Distill Commander Spellbook's bulk variants export (~700 MB) into a compact
combo index served from this repo's own GitHub Pages origin, so the deck
checker can match combos and read their bracket client-side, with no CORS or
proxies (Spellbook's estimate-bracket API is closed to browser origins).

Input : https://json.commanderspellbook.com/variants.json (downloaded here)
        https://backend.commanderspellbook.com/cards/ (card classification)
Output: data/combos.json
  {"updated": "<source timestamp>", "version": "<source version>",
   "combos": [{"c": ["Card A", "Card B"],  # named pieces, front-face names
               "r": "Infinite ...",        # headline result
               "t": "R",                   # Spellbook bracket tag: R S P O C E B
               "m": 2,                     # mana needed ON TOP of casting the pieces
               "f": "ir",                  # flags, see FLAGS below
               "q": [[1, "Creature with Persist or Undying", 73]],  # template pieces
               "mc": ["Card A"]},          # pieces that must be the commander
              ...],
   "templates": {"73": ["Cauldron Haze", "Kitchen Finks", ...]},
   "mass_land_denial": ["Armageddon", ...],  # Spellbook's per-card flags
   "extra_turn": ["Time Warp", ...]}

FLAGS: i infinite · r standalone result (game-relevant by itself) · b contextual
result · w wins or ends the game · p notable board prerequisites · t infinite
turns · d mass land denial · l lock · k skips turns · o controls opponents.
q, mc and empty f/m are omitted to keep the file small.

Kept: status OK, 2-5 cards, and either an infinite result or something a table
cares about (any bracket tag above Exhibition, or a game-ending result).
Non-infinite lines such as Thassa's Oracle + Demonic Consultation must be here:
they are the two-card wins the brackets are worried about.

Template requirements ("requires": generic pieces like "a creature with
persist") are resolved AT BUILD TIME into the exact list of card names matching
their Scryfall query. The checker then verifies each slot by plain name lookup,
so Ashnod's Altar + Luminous Broodmoth needs an actual persist/undying creature.
Variants whose template has no scryfallQuery, or whose query fails to resolve,
are dropped: unverifiable slots must never produce false positives.

Deduped by named cards + templates; the variant that does not need a specific
commander wins, then the highest bracket tag. A combo that works with the named
cards alone drops its template versions, and rows are sorted by piece count.

Usage:
  python3 scripts/build_combo_db.py [path/to/variants.json]
  (downloads to a temp file if no path is given)

The GitHub Action .github/workflows/update-combos.yml runs this weekly.
"""

import json
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "combos.json"
STEPS_DIR = OUT_PATH.parent / "combo_steps"
SOURCE_URL = "https://json.commanderspellbook.com/variants.json"
CARDS_URL = "https://backend.commanderspellbook.com/cards/?limit=100"
MAX_CARDS = 5
TEMPLATE_CARD_CAP = 4000  # a template matching more cards than this is dropped
TAG_RANK = {"R": 6, "S": 5, "P": 4, "O": 3, "C": 2, "E": 1, "B": 0}

# Result patterns mirror spellbook/models/variant.py in Spellbook's backend.
INFINITE_TURNS_RE = re.compile(r"(?:near-)?infinite (?:extra )?turns?", re.I)
OPPONENT_TURNS_RE = re.compile(INFINITE_TURNS_RE.pattern + r" for .* opponent", re.I)
LAND_DENIAL_RE = re.compile(r"mass land (?:destruction|denial|removal)", re.I)
SKIP_TURNS_RE = re.compile(r"(?:infinite(?:ly)? )?skip (?:(?:all )?(?:your |their )|infinite )?(?:future )?turns?", re.I)
CONTROL_RE = re.compile(r"you control (?:your|one|an|(?:up to )?(?:two|three)) opponents?", re.I)
ENDS_GAME_RE = re.compile(r"\bwins? the game|\bloses? the game|\bdraw the game", re.I)


def classify(feats):
    """(flags, headline result) from a variant's produced features."""
    names = [f["name"] for f in feats]
    has = lambda rx: any(rx.search(n) for n in names)
    flags = ""
    if any("infinite" in n.lower() for n in names):
        flags += "i"
    if any(f.get("status") == "S" for f in feats):
        flags += "r"
    if any(f.get("status") == "C" for f in feats):
        flags += "b"
    if has(ENDS_GAME_RE):
        flags += "w"
    if any(INFINITE_TURNS_RE.search(n) and not OPPONENT_TURNS_RE.search(n) for n in names):
        flags += "t"
    if has(LAND_DENIAL_RE):
        flags += "d"
    if any("lock" in n.lower() for n in names):
        flags += "l"
    if has(SKIP_TURNS_RE):
        flags += "k"
    if has(CONTROL_RE):
        flags += "o"
    # the most telling result leads: a win, then a standalone infinite, then any infinite
    headline = (next((n for n in names if ENDS_GAME_RE.search(n)), None)
                or next((f["name"] for f in feats if f.get("status") == "S" and "infinite" in f["name"].lower()), None)
                or next((n for n in names if "infinite" in n.lower()), None)
                or next((f["name"] for f in feats if f.get("status") == "S"), None)
                or names[0])
    return flags, headline


def get_json(url):
    """GET with backoff on throttling. Anything still failing raises, which fails
    the build: a rate limit must never quietly publish a smaller database."""
    for attempt in range(8):
        req = urllib.request.Request(url, headers={
            "User-Agent": "pod-deck-checker", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 7:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 2 ** attempt * 5
        except urllib.error.URLError:
            if attempt == 7:
                raise
            wait = 2 ** attempt * 5
        print(f"  waiting {wait}s before retrying {url}")
        time.sleep(wait)


def fetch_card_flags():
    """Spellbook's per-card mass-land-denial and extra-turn flags."""
    mld, turns, url = [], [], CARDS_URL
    while url:
        page = get_json(url)
        for c in page["results"]:
            name = c["name"].split(" // ")[0]
            if c.get("massLandDenial"):
                mld.append(name)
            if c.get("extraTurn"):
                turns.append(name)
        url = page.get("next")
        time.sleep(0.5)
    if not mld or not turns:
        raise RuntimeError("Spellbook card flags came back empty")
    return sorted(set(mld)), sorted(set(turns))


def resolve_template(api_url):
    """Fetch every card name matching a template's Scryfall search. None when the
    search genuinely finds nothing usable: Scryfall answers 404 for no matches."""
    names, url = [], api_url
    while url:
        try:
            page = get_json(url)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                return None
            raise
        names += [c["name"].split(" // ")[0] for c in page.get("data", [])]
        if len(names) > TEMPLATE_CARD_CAP:
            return None
        url = page.get("next_page") if page.get("has_more") else None
        time.sleep(0.15)
    return sorted(set(names))


def iter_variants(path):
    """Stream top-level objects of the 'variants' array without loading 600 MB
    into a parsed tree: scan for balanced {...} chunks and json-parse each."""
    dec = json.JSONDecoder()
    with open(path, "r", encoding="utf-8") as f:
        head = f.read(1 << 16)
        start = head.index('"variants"')
        start = head.index("[", start) + 1
        buf = head[start:]
        depth = 0
        obj_start = None
        in_str = False
        esc = False
        pos = 0
        while True:
            if pos >= len(buf):
                chunk = f.read(1 << 20)
                if not chunk:
                    break
                buf = buf[obj_start if obj_start is not None else pos:] + chunk
                if obj_start is not None:
                    pos -= obj_start
                    obj_start = 0
                else:
                    pos = 0
            ch = buf[pos]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                if depth == 0:
                    obj_start = pos
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and obj_start is not None:
                    yield dec.raw_decode(buf[obj_start:pos + 1])[0]
                    obj_start = None
            elif ch == "]" and depth == 0:
                return
            pos += 1


def steps_shard(names):
    """Which file holds a combo's steps. app/js/ui/combos.js computes the same value."""
    h = 0
    for ch in "|".join(names):
        h = (h * 31 + ord(ch)) & 255
    return f"{h:02x}"


def write_steps(kept):
    """One small file per shard, so a deck only downloads what its own combos need."""
    shards = {}
    for row, steps in kept:
        # the same named pieces explain the same line, whatever fills a template slot
        shards.setdefault(steps_shard(row["c"]), {}).setdefault("|".join(row["c"]), {k: v for k, v in steps.items() if v})
    STEPS_DIR.mkdir(parents=True, exist_ok=True)
    for shard, rows in shards.items():
        (STEPS_DIR / f"{shard}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(f.stat().st_size for f in STEPS_DIR.glob("*.json"))
    print(f"steps: {sum(len(r) for r in shards.values())} combos in {len(shards)} files ({size / 1e6:.1f} MB)")


def build(src_path):
    with open(src_path, encoding="utf-8") as f:
        head = f.read(300)
    meta = dict(re.findall(r'"(timestamp|version)": "([^"]*)"', head))

    seen = {}
    templates = {}  # template id -> scryfallApi URL
    total = 0
    for v in iter_variants(src_path):
        total += 1
        if v.get("status") != "OK":
            continue
        uses = v.get("uses") or []
        if not (1 <= len(uses) <= MAX_CARDS):
            continue
        feats = [p["feature"] for p in (v.get("produces") or []) if p.get("feature", {}).get("name")]
        if not feats:
            continue
        flags, result = classify(feats)
        if v.get("notablePrerequisites"):
            flags += "p"
        tag = v.get("bracketTag") or "E"
        if not ("i" in flags or "w" in flags or tag not in ("E", "B")):
            continue
        names = tuple(sorted(
            (u["card"]["name"].split(" // ")[0]) for u in uses if u.get("card")))
        reqs = []
        for r in (v.get("requires") or []):
            tpl = r.get("template") or {}
            tid, name = tpl.get("id"), tpl.get("name")
            if tid is None or not name or not tpl.get("scryfallQuery"):
                reqs = None  # unverifiable template -> drop variant
                break
            templates.setdefault(tid, tpl.get("scryfallApi"))
            reqs.append([r.get("quantity") or 1, name, tid])
        if reqs is None or len(names) + sum(q for q, _, _ in reqs) < 2:
            continue
        must = sorted(u["card"]["name"].split(" // ")[0] for u in uses
                      if u.get("card") and u.get("mustBeCommander"))
        row = {"c": list(names), "r": result, "t": tag}
        # how to play it goes to data/combo_steps/: the matcher never needs the text
        steps = {"d": v.get("description") or "", "p": v.get("notablePrerequisites") or "",
                 "e": v.get("easyPrerequisites") or "", "n": v.get("notes") or "", "x": v.get("manaNeeded") or "",
                 "o": [f["name"] for f in feats], "z": sorted({z for u in uses for z in (u.get("zoneLocations") or [])})}
        if v.get("manaValueNeeded"):
            row["m"] = v["manaValueNeeded"]
        if flags:
            row["f"] = flags
        if reqs:
            row["q"] = reqs
        if must:
            row["mc"] = must
        # the same pieces with a different template are a different requirement:
        # a deck may fill one slot and not the other, so both stay
        key = (names, tuple(sorted(t for _, _, t in reqs)))
        rank = (len(must), -TAG_RANK.get(tag, 0))
        prev = seen.get(key)
        if prev is None or rank < prev[1]:
            seen[key] = (row, rank, steps)

    # a combo that works with the named cards alone makes its template versions redundant
    seen = {k: v for k, v in seen.items() if not k[1] or (k[0], ()) not in seen}

    used_tids = {tid for row, _, _ in seen.values() for _, _, tid in row.get("q", [])}
    resolved, dropped_tids = {}, set()
    print(f"resolving {len(used_tids)} templates via Scryfall ...")
    for tid in sorted(used_tids):
        cards = resolve_template(templates[tid])
        if cards is None:
            print(f"  template {tid}: no usable result -> combos using it dropped")
            dropped_tids.add(tid)
        else:
            resolved[str(tid)] = cards

    kept = [(row, steps) for row, _, steps in seen.values()
            if not any(tid in dropped_tids for _, _, tid in row.get("q", []))]
    combos = [row for row, _ in kept]
    if len(combos) < len(seen):
        print(f"dropped {len(seen) - len(combos)} combos whose templates could not be resolved")
    # fewest pieces first: the matcher keeps the first hit for each set of named cards
    combos.sort(key=lambda c: (len(c["c"]) + sum(q for q, _, _ in c.get("q", [])), c["c"]))
    print("fetching Spellbook card flags ...")
    mld, turns = fetch_card_flags()
    print(f"  {len(mld)} mass land denial, {len(turns)} extra turn cards")
    out = {"updated": meta.get("timestamp", ""), "version": meta.get("version", ""),
           "combos": combos, "templates": resolved,
           "mass_land_denial": mld, "extra_turn": turns}
    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    write_steps(kept)
    print(f"scanned {total} variants -> {len(combos)} unique combos "
          f"({OUT_PATH.stat().st_size / 1e6:.1f} MB) -> {OUT_PATH}")


def main():
    if len(sys.argv) > 1:
        build(sys.argv[1])
        return
    with tempfile.NamedTemporaryFile(suffix=".json") as tmp:
        print("downloading", SOURCE_URL, "...")
        with urllib.request.urlopen(SOURCE_URL, timeout=600) as r:
            while True:
                chunk = r.read(1 << 22)
                if not chunk:
                    break
                tmp.write(chunk)
        tmp.flush()
        build(tmp.name)


if __name__ == "__main__":
    main()
