#!/usr/bin/env python3
"""
Fetch the public cEDH lists that anchor the top of the power scale into
data/anchors_cedh.json. They exist only so a "10" means something outside this
pod; they are never treated as pod decks. Rerun by hand to refresh them.
"""

import datetime
import json
import re
import urllib.request
from pathlib import Path

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "anchors_cedh.json"
# Among Archidekt's most viewed lists with "cEDH" in the name, spread over strategies, with no banned card.
DECK_IDS = [1727139, 3384924, 96159, 5662629, 4763518, 4383998, 7307169, 1624978, 2565352]

# Same list as OUT_OF_DECK_RE in app/js/engine/decks.js.
OUT_OF_DECK_RE = re.compile(r"(sideboard|maybeboard|considering|companion)s?", re.I)


def fetch_archidekt(deck_id: str):
    """Return (name, decklist_text) for an Archidekt deck id."""
    api = f"https://archidekt.com/api/decks/{deck_id}/"
    req = urllib.request.Request(api, headers={"User-Agent": "pod-deck-checker"})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    # Archidekt ships its Sideboard category with includedInDeck:true, so the flag
    # alone lets it through.
    excluded = {c["name"] for c in data.get("categories", [])
                if c.get("includedInDeck") is False or OUT_OF_DECK_RE.fullmatch(c["name"])}
    lines, commanders = [], []
    for c in data.get("cards", []):
        cats = c.get("categories") or []
        if any(k in excluded for k in cats):
            continue
        card = c.get("card") or {}
        name = (card.get("oracleCard") or {}).get("name") or card.get("name")
        if not name:
            continue
        if any(re.fullmatch(r"commander", k, re.I) for k in cats):
            commanders.append(name)
        else:
            lines.append(f"{c.get('quantity', 1)}x {name}")
    text = "\n".join([f"Commander: {n}" for n in commanders] + lines)
    return data.get("name") or f"Archidekt #{deck_id}", text


def main():
    decks = []
    for deck_id in DECK_IDS:
        name, decklist = fetch_archidekt(str(deck_id))
        decks.append({"name": name, "url": f"https://archidekt.com/decks/{deck_id}", "decklist": decklist})
        print(f"{name}: {sum(1 for line in decklist.splitlines() if line.strip())} lines")
    OUT_PATH.write_text(json.dumps({"updated": datetime.date.today().isoformat(), "decks": decks},
                                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(decks)} decks -> {OUT_PATH}")


if __name__ == "__main__":
    main()
