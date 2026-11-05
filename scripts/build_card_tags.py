#!/usr/bin/env python3
"""
Build data/card_tags.json: what each card does, from Scryfall's oracle tags (people
tagging every card by function), so the deck profile does not have to guess from
card text. Pod dials and tiers never read this file.

Output: {"updated": "YYYY-MM-DD", "tags": {"ramp": ["Sol Ring", ...], ...}}
Names are front-face names. A network failure fails the build, so the last good
file stays in place. The GitHub Action .github/workflows/update-combos.yml runs this weekly.
"""

import datetime
import json
import time
import urllib.parse
from pathlib import Path

from build_combo_db import get_json

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "card_tags.json"
TAGS = ["ramp", "mana-rock", "mana-dork", "ritual", "land-ramp", "draw", "cantrip", "wheel", "tutor",
        "removal", "board-wipe", "counterspell", "protection", "recursion", "reanimate", "hatebear",
        "tax", "graveyard-hate", "discard", "fetchland", "cost-reducer", "extra-turn",
        "sacrifice-outlet", "anthem", "win-condition", "overrun", "theft", "burn", "lifegain", "mill"]
MIN_CARDS_PER_TAG = 40  # today's smallest is above this: fewer means a broken answer


def fetch_tag(tag):
    url = "https://api.scryfall.com/cards/search?unique=cards&q=" + urllib.parse.quote(f"otag:{tag} f:commander")
    names = []
    while url:
        page = get_json(url)
        names += [c["name"].split(" // ")[0] for c in page["data"]]
        url = page.get("next_page") if page.get("has_more") else None
        time.sleep(0.2)
    if len(names) < MIN_CARDS_PER_TAG:
        raise RuntimeError(f"tag {tag} returned only {len(names)} cards")
    return sorted(set(names))


def main():
    tags = {}
    for tag in TAGS:
        tags[tag] = fetch_tag(tag)
        print(f"{tag}: {len(tags[tag])}")
    out = {"updated": datetime.date.today().isoformat(), "tags": tags}
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT_PATH.stat().st_size / 1e3:.0f} KB -> {OUT_PATH}")


if __name__ == "__main__":
    main()
