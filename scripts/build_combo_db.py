#!/usr/bin/env python3
"""
Distill Commander Spellbook's bulk variants export (~600 MB) into a compact
combo index served from this repo's own GitHub Pages origin, so the deck
checker can match infinite combos client-side with zero CORS/proxies.

Input : https://json.commanderspellbook.com/variants.json (downloaded here)
Output: data/combos.json
  {"updated": "<source timestamp>", "version": "<source version>",
   "combos": [[["Card A", "Card B"], "Infinite ..."],                # no extra pieces
              [["Card C", "Card D"], "Infinite ...",
               [[1, "Creature with Persist or Undying", 73]]],       # + template pieces
              ...],
   "templates": {"73": ["Cauldron Haze", "Kitchen Finks", ...]}}

Kept: status OK, 2-5 cards, produces at least one "Infinite ..." feature.
Card names are front-face names (the checker normalizes DFCs the same way).

Template requirements ("requires": generic pieces like "a creature with
persist") are preserved as [quantity, name, templateId] triples, and every
referenced template is resolved AT BUILD TIME into the exact list of card
names matching its Scryfall query (the export ships the ready-made search
URL). The checker then verifies each slot by plain name lookup — without
this, Ashnod's Altar + Luminous Broodmoth would count as an infinite combo
in a deck with no persist/undying creature. Variants whose template has no
scryfallQuery, or whose query fails to resolve, are dropped: unverifiable
slots must never produce false positives.

Deduped by card-name set; the variant with the fewest template pieces wins
(a combo that works with the named cards alone beats one needing extras).

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
TEMPLATE_CARD_CAP = 4000  # a template matching more cards than this is dropped


def resolve_template(api_url):
    """Fetch every card name matching a template's Scryfall search."""
    import time
    names, url = [], api_url
    while url:
        req = urllib.request.Request(url, headers={
            "User-Agent": "pod-deck-checker", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.load(r)
        names += [c["name"].split(" // ")[0] for c in page.get("data", [])]
        if len(names) > TEMPLATE_CARD_CAP:
            return None
        url = page.get("next_page") if page.get("has_more") else None
        time.sleep(0.12)
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
    templates = {}  # template id -> scryfallApi URL
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
        if len(names) < 2:
            continue
        reqs = []
        for r in (v.get("requires") or []):
            tpl = r.get("template") or {}
            tid, name = tpl.get("id"), tpl.get("name")
            if tid is None or not name or not tpl.get("scryfallQuery"):
                reqs = None  # unverifiable template -> drop variant
                break
            templates.setdefault(tid, tpl.get("scryfallApi"))
            reqs.append([r.get("quantity") or 1, name, tid])
        if reqs is None:
            continue
        pieces = sum(q for q, _, _ in reqs)
        prev = seen.get(names)
        if prev is None or pieces < prev[1]:
            seen[names] = ([inf[0], reqs], pieces)

    used_tids = {tid for (result, reqs), _ in seen.values() for _, _, tid in reqs}
    resolved, dropped_tids = {}, set()
    print(f"resolving {len(used_tids)} templates via Scryfall ...")
    for tid in sorted(used_tids):
        cards = None
        try:
            cards = resolve_template(templates[tid])
        except Exception as e:
            print(f"  template {tid}: fetch failed ({e}) -> combos using it dropped")
        if cards is None:
            dropped_tids.add(tid)
        else:
            resolved[str(tid)] = cards

    combos, dropped = [], 0
    for names, ((result, reqs), _) in seen.items():
        if any(tid in dropped_tids for _, _, tid in reqs):
            dropped += 1
            continue
        combos.append([list(names), result] if not reqs else [list(names), result, reqs])
    combos.sort(key=lambda c: (len(c[0]), c[0]))
    if dropped:
        print(f"dropped {dropped} combos whose templates could not be resolved")
    out = {"updated": meta.get("timestamp", ""), "version": meta.get("version", ""),
           "combos": combos, "templates": resolved}
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
