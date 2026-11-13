#!/usr/bin/env python3
"""Writes data/tokens.json: every distinct token Scryfall lists, for the table's token sheet.

One entry per oracle id: {o: oracle id, i: id of the printing chosen, n: name, t: type line, c: colours ("WU"),
p/h: power/toughness, x: oracle text}. A double-faced token is its front face, whose images live under "front".
Images are not stored: the client builds them from `i` (https://cards.scryfall.io/<size>/front/<i[0]>/<i[1]>/<i>.jpg);
a token whose image URLs do not follow that pattern carries them explicitly in "a" (art crop) and "f" (normal).
Also writes data/token_makers.json: {card name: [oracle ids of the tokens it can make]} from the `all_parts` of
Scryfall's default_cards bulk file, for the cards named in tokens.json only. A double-faced card is keyed by its full
name and by its front face name, as deck lists write either.
Usage: python3 scripts/fetch_tokens.py
"""
import gzip
import json
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://api.scryfall.com/cards/search?q=layout%3Atoken+OR+layout%3Adouble_faced_token&unique=cards&order=name"
MAX_TEXT = 160
COLOURS = "WUBRG"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pod-deck-checker-token-fetch/1.0", "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except OSError:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def makers(token_ids):
    """Card name -> sorted oracle ids of its tokens, kept only if the token is in `token_ids`."""
    bulk = next(b for b in get("https://api.scryfall.com/bulk-data")["data"] if b["type"] == "default_cards")
    printing, parts = {}, {}  # token printing id -> oracle id; card name -> printing ids of its tokens
    with tempfile.TemporaryFile() as tmp:  # the file is 100+ MB: streamed to disk, read line by line (JSON lines)
        req = urllib.request.Request(bulk["jsonl_download_uri"], headers={"User-Agent": "pod-deck-checker-token-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=300) as res:
            while chunk := res.read(1 << 20):
                tmp.write(chunk)
        tmp.seek(0)
        for line in gzip.open(tmp):  # served gzipped
            card = json.loads(line)
            if card["layout"] in ("token", "double_faced_token"):
                printing[card["id"]] = card["oracle_id"]
            else:
                ids = [p["id"] for p in card.get("all_parts", []) if p["component"] == "token"]
                if ids:
                    parts.setdefault(card["name"], set()).update(ids)
    out = {}
    for name, ids in parts.items():
        oracle = sorted({printing[i] for i in ids if i in printing} & token_ids)
        for key in {name, name.split(" // ")[0]}:
            if oracle:
                out[key] = sorted(set(out.get(key, ())) | set(oracle))
    return out


def image_url(size, i):
    return f"https://cards.scryfall.io/{size}/front/{i[0]}/{i[1]}/{i}.jpg"


def entry(card):
    front = (card.get("card_faces") or [card])[0]
    uris = card.get("image_uris") or front.get("image_uris") or {}
    i = card["id"]
    text = (front.get("oracle_text") or "").replace("\n", " ")
    out = {"o": card["oracle_id"], "i": i, "n": front["name"], "t": front["type_line"],
           "c": "".join(k for k in COLOURS if k in (front.get("colors") or card.get("colors") or []))}
    for key, field in (("p", "power"), ("h", "toughness")):
        if front.get(field) not in (None, ""):
            out[key] = front[field]
    if text:
        out["x"] = text if len(text) <= MAX_TEXT else text[:MAX_TEXT - 1] + "…"
    # the derived URL must be the real one (minus its cache-busting query), else keep the real ones
    art, full = (uris.get(k, "").split("?")[0] for k in ("art_crop", "normal"))
    if (art, full) != (image_url("art_crop", i), image_url("normal", i)):
        out["a"], out["f"] = art, full
    return out


def main():
    cards, url = {}, URL
    while url:
        page = get(url)
        for card in page["data"]:
            cards.setdefault(card["oracle_id"], entry(card))
        url = page.get("next_page")
        time.sleep(0.1)
    rows = sorted(cards.values(), key=lambda e: (e["n"], e.get("p", ""), e.get("h", ""), e["o"]))
    (ROOT / "data" / "tokens.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    token_makers = makers({e["o"] for e in rows})
    (ROOT / "data" / "token_makers.json").write_text(
        json.dumps(token_makers, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(token_makers)} token-making card names")
    explicit = sum("a" in e for e in rows)
    print(f"{len(rows)} tokens, {explicit} with explicit image URLs")


if __name__ == "__main__":
    main()
