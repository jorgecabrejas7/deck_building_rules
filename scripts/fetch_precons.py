#!/usr/bin/env python3
"""Writes data/precons.json: every Commander precon Wizards has printed, from MTGJSON.

Precons are the anchor of the power scale, since all of them are Bracket 2 by definition,
and the app uses this list to recognise a stock precon.
Usage: python3 scripts/fetch_precons.py
"""
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://mtgjson.com/api/v5/"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pod-deck-checker"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)["data"]
        except OSError:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def main():
    listed = [d for d in get(BASE + "DeckList.json") if d["type"] == "Commander Deck"]
    decks = []
    for item in sorted(listed, key=lambda d: (d["releaseDate"], d["name"])):
        deck = get(f"{BASE}decks/{item['fileName']}.json")
        time.sleep(0.1)
        # a card printed in two arts is listed twice
        board = {}
        for c in deck["commander"] + deck["mainBoard"]:
            board[c["name"]] = board.get(c["name"], 0) + c["count"]
        decks.append({"name": item["name"], "set": item["code"], "date": item["releaseDate"],
                      "commanders": [c["name"] for c in deck["commander"]],
                      "cards": [[name, count] for name, count in board.items()]})
    decks = [d for d in decks if sum(q for _, q in d["cards"]) >= 90]  # not a full deck: a partial product listing
    (ROOT / "data" / "precons.json").write_text(json.dumps({"decks": decks}, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(decks)} precons of {len(listed)} listed, {decks[0]['date']} to {decks[-1]['date']}")


if __name__ == "__main__":
    main()
