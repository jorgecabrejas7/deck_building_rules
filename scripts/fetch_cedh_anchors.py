#!/usr/bin/env python3
"""
Fetch the public cEDH lists that anchor the top of the power scale into
data/anchors_cedh.json. They exist only so a "10" means something outside this
pod; they are never treated as pod decks. Rerun by hand to refresh them.
"""

import datetime
import json
from pathlib import Path

from pod_decks import fetch_archidekt

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "anchors_cedh.json"
# Among Archidekt's most viewed lists with "cEDH" in the name, spread over strategies, with no banned card.
DECK_IDS = [1727139, 3384924, 96159, 5662629, 4763518, 4383998, 7307169, 1624978, 2565352]


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
