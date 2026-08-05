#!/usr/bin/env python3
"""
Distill Commander Spellbook's bulk variants export (~600 MB) into a compact
combo index served from this repo's own GitHub Pages origin, so the deck
checker can match infinite combos client-side with zero CORS/proxies.

Input : https://json.commanderspellbook.com/variants.json (downloaded here)
Output: data/combos.json
  {"updated": "<source timestamp>", "version": "<source version>",
   "combos": [[["Card A", "Card B"], "Infinite ..."], ...]}

Kept: status OK, 2-5 cards, produces at least one "Infinite ..." feature.
Card names are front-face names (the checker normalizes DFCs the same way).
Deduped by card-name set (first result string wins).

Usage:
  python3 scripts/build_combo_db.py [path/to/variants.json]
  (downloads to a temp file if no path is given)

The GitHub Action .github/workflows/update-combos.yml runs this weekly.
"""

import json
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "combos.json"
SOURCE_URL = "https://json.commanderspellbook.com/variants.json"
MAX_CARDS = 5


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


def build(src_path):
    text_head = open(src_path, encoding="utf-8").read(300)
    meta = {}
    for key in ("timestamp", "version"):
        i = text_head.find('"%s": "' % key)
        if i >= 0:
            j = text_head.index('"', i + len(key) + 6)
            k = text_head.index('"', j + 1)
            meta[key] = text_head[j + 1:k]

    seen = {}
    total = 0
    for v in iter_variants(src_path):
        total += 1
        if v.get("status") != "OK":
            continue
        uses = v.get("uses") or []
        if not (2 <= len(uses) <= MAX_CARDS):
            continue
        feats = [p["feature"]["name"] for p in (v.get("produces") or [])
                 if p.get("feature", {}).get("name")]
        inf = [f for f in feats if "infinite" in f.lower()]
        if not inf:
            continue
        names = tuple(sorted(
            (u["card"]["name"].split(" // ")[0]) for u in uses if u.get("card")))
        if len(names) < 2 or names in seen:
            continue
        seen[names] = inf[0]

    combos = [[list(names), result] for names, result in seen.items()]
    combos.sort(key=lambda c: (len(c[0]), c[0]))
    out = {"updated": meta.get("timestamp", ""), "version": meta.get("version", ""),
           "combos": combos}
    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    print(f"scanned {total} variants -> {len(combos)} unique infinite combos "
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
