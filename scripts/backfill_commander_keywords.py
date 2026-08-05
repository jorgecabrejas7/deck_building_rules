#!/usr/bin/env python3
"""
Add Scryfall's 'keywords' list (needed to detect Eminence etc.) to the cache entries
for every commander in out/precon_decks/*.report.json. The main fetch
(fetch_precon_decklists.py) resolves prices via a cheapest-printing search that doesn't
request 'keywords', so this backfills just that field for the ~90 commander cards
in-place — cheap, no need to re-run the full price fetch.

Usage:
  python3 scripts/backfill_commander_keywords.py
"""

import json
import time
from pathlib import Path

import requests

from fetch_precon_decklists import SCRYFALL_NAMED, SCRYFALL_HEADERS, resolve_card_name

REPO_ROOT = Path(__file__).resolve().parent.parent
DECKS_DIR = REPO_ROOT / "out" / "precon_decks"
CACHE_PATH = REPO_ROOT / "cache" / "scryfall_cache.json"


def fetch_keywords(name):
    for attempt in range(6):
        r = requests.get(SCRYFALL_NAMED, headers=SCRYFALL_HEADERS, params={"exact": name}, timeout=15)
        if r.status_code == 429:
            time.sleep(min(30, 2 ** attempt))
            continue
        if r.status_code == 200:
            return r.json().get("keywords", [])
        return None
    return None


def main():
    cache = json.loads(CACHE_PATH.read_text())

    commanders = set()
    for report_path in sorted(DECKS_DIR.glob("*.report.json")):
        product = json.loads(report_path.read_text())
        for deck in product.get("decks", []):
            commanders.update(deck.get("commanders", []))

    print(f"{len(commanders)} unique commander names")
    updated = 0
    for name in sorted(commanders):
        entry = cache.get(name)
        if entry is not None and "keywords" in entry:
            continue
        keywords = fetch_keywords(name)
        if keywords is None:
            resolved = resolve_card_name(name)
            if resolved != name:
                keywords = fetch_keywords(resolved)
        if keywords is None:
            keywords = []
        if entry is None:
            entry = {"name": name}
            cache[name] = entry
        entry["keywords"] = keywords
        updated += 1
        if keywords:
            print(f"  {name}: {keywords}")
        time.sleep(0.1)

    CACHE_PATH.write_text(json.dumps(cache, indent=2, ensure_ascii=False))
    print(f"Updated keywords for {updated} commanders -> {CACHE_PATH}")


if __name__ == "__main__":
    main()
