#!/usr/bin/env python3
"""
Distill EDHREC's community salt ratings into data/salt.json, so the deck checker
can score a deck's saltiness client-side with one small same-origin file.

Input : https://json.edhrec.com/pages/top/salt-1.json (every rated card at once;
        an undocumented path, so a short or empty answer fails the build and the
        last good data/salt.json stays in place)
Output: data/salt.json  {"updated": "YYYY-MM-DD", "salt": {"Stasis": 3.06, ...}}

Names are front-face names (the checker normalizes DFCs the same way). Cards
nobody has rated (salt 0) are left out: absent means "no rating".

The GitHub Action .github/workflows/update-combos.yml runs this weekly.
"""

import datetime
import json
import urllib.request
from pathlib import Path

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "salt.json"
SOURCE_URL = "https://json.edhrec.com/pages/top/salt-1.json"
MIN_RATED_CARDS = 5000  # far below today's count: only a broken answer lands under it


def main():
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "pod-deck-checker"})
    with urllib.request.urlopen(req, timeout=120) as res:
        page = json.load(res)
    views = page["container"]["json_dict"]["cardlists"][0]["cardviews"]
    salt = {v["name"].split(" // ")[0]: round(v["salt"], 2) for v in views if v.get("salt")}
    if len(salt) < MIN_RATED_CARDS:
        raise RuntimeError(f"EDHREC returned only {len(salt)} rated cards")
    out = {"updated": datetime.date.today().isoformat(), "salt": dict(sorted(salt.items()))}
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(salt)} rated cards ({OUT_PATH.stat().st_size / 1e3:.0f} KB) -> {OUT_PATH}")


if __name__ == "__main__":
    main()
