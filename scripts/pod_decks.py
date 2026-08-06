#!/usr/bin/env python3
"""Pod deck registry.

SQLite database (data/pod_decks.sqlite) holding the pod's reference decks:
name, owner, source URL and a decklist snapshot (Archidekt blocks browsers,
so the app can never fetch the URL itself — the snapshot is what it uses).
Every mutating command re-exports data/pod_decks.json, which the app reads.

Usage:
  python3 scripts/pod_decks.py add --url https://archidekt.com/decks/12345 --owner Jorge
  python3 scripts/pod_decks.py add --file mydeck.txt --name "Mi mazo" --owner Ana
  python3 scripts/pod_decks.py import            # reads decks.txt at the repo root
  python3 scripts/pod_decks.py import otherfile.txt
  python3 scripts/pod_decks.py list
  python3 scripts/pod_decks.py rm 3
  python3 scripts/pod_decks.py export

import file format — one deck per line, blank lines and # comments ignored:
  {archidekt url} - {display name}
Re-running import refreshes existing decks (matched by URL) with a fresh
decklist snapshot and the name from the file.
"""
import argparse
import datetime
import json
import pathlib
import re
import sqlite3
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "pod_decks.sqlite"
JSON_PATH = ROOT / "data" / "pod_decks.json"


def connect():
    DB_PATH.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        """CREATE TABLE IF NOT EXISTS decks(
             id INTEGER PRIMARY KEY,
             name TEXT NOT NULL,
             owner TEXT NOT NULL DEFAULT '',
             url TEXT NOT NULL DEFAULT '',
             decklist TEXT NOT NULL,
             added_at TEXT NOT NULL)"""
    )
    return con


def fetch_archidekt(deck_id: str):
    """Return (name, decklist_text) for an Archidekt deck id."""
    api = f"https://archidekt.com/api/decks/{deck_id}/"
    req = urllib.request.Request(api, headers={"User-Agent": "pod-deck-checker"})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    excluded = {c["name"] for c in data.get("categories", []) if c.get("includedInDeck") is False}
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


def cmd_add(args):
    if args.url:
        m = re.search(r"archidekt\.com/decks/(\d+)", args.url)
        if not m:
            sys.exit("Only Archidekt URLs are supported; for anything else pass --file with a text export.")
        fetched_name, decklist = fetch_archidekt(m.group(1))
        name = args.name or fetched_name
    elif args.file:
        decklist = pathlib.Path(args.file).read_text(encoding="utf-8").strip()
        name = args.name or pathlib.Path(args.file).stem
    else:
        sys.exit("Pass --url (Archidekt) or --file (text export).")
    if not decklist:
        sys.exit("Empty decklist — nothing stored.")
    con = connect()
    with con:
        cur = con.execute(
            "INSERT INTO decks(name, owner, url, decklist, added_at) VALUES(?,?,?,?,?)",
            (name, args.owner or "", args.url or "", decklist,
             datetime.date.today().isoformat()),
        )
    print(f"Stored deck #{cur.lastrowid}: {name} ({len(decklist.splitlines())} lines)")
    export(con)


def cmd_import(args):
    path = pathlib.Path(args.path)
    if not path.is_absolute() and not path.exists():
        path = ROOT / args.path
    if not path.exists():
        sys.exit(f"File not found: {path}")
    con = connect()
    ok = failed = 0
    for ln, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        url, sep, name = line.partition(" - ")
        url, name = url.strip(), name.strip()
        m = re.search(r"archidekt\.com/decks/(\d+)", url)
        if not sep or not m or not name:
            print(f"line {ln}: expected '{{archidekt url}} - {{display name}}', got: {raw!r} — skipped")
            failed += 1
            continue
        try:
            _, decklist = fetch_archidekt(m.group(1))
        except Exception as e:
            print(f"line {ln}: could not fetch {url}: {e} — skipped")
            failed += 1
            continue
        if not decklist:
            print(f"line {ln}: {url} returned an empty deck — skipped")
            failed += 1
            continue
        with con:
            row = con.execute("SELECT id FROM decks WHERE url = ?", (url,)).fetchone()
            if row:
                con.execute("UPDATE decks SET name = ?, decklist = ? WHERE id = ?",
                            (name, decklist, row[0]))
                print(f"Refreshed #{row[0]}: {name}")
            else:
                cur = con.execute(
                    "INSERT INTO decks(name, owner, url, decklist, added_at) VALUES(?,?,?,?,?)",
                    (name, args.owner or "", url, decklist, datetime.date.today().isoformat()))
                print(f"Stored #{cur.lastrowid}: {name}")
        ok += 1
    print(f"Imported/refreshed {ok} deck(s)" + (f", {failed} skipped" if failed else ""))
    export(con)


def cmd_list(args):
    con = connect()
    rows = con.execute("SELECT id, name, owner, url, added_at FROM decks ORDER BY id").fetchall()
    if not rows:
        print("No decks stored.")
        return
    for r in rows:
        print(f"#{r[0]:<3} {r[1]:<40} {r[2]:<12} {r[4]}  {r[3]}")


def cmd_rm(args):
    con = connect()
    with con:
        n = con.execute("DELETE FROM decks WHERE id = ?", (args.id,)).rowcount
    if not n:
        sys.exit(f"No deck with id {args.id}.")
    print(f"Removed deck #{args.id}.")
    export(con)


def export(con=None):
    con = con or connect()
    rows = con.execute(
        "SELECT id, name, owner, url, decklist, added_at FROM decks ORDER BY id"
    ).fetchall()
    payload = {
        "version": 1,
        "updated": datetime.date.today().isoformat(),
        "decks": [
            {"id": r[0], "name": r[1], "owner": r[2], "url": r[3],
             "decklist": r[4], "added_at": r[5]}
            for r in rows
        ],
    }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Exported {len(rows)} deck(s) → {JSON_PATH.relative_to(ROOT)}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add", help="store a deck (Archidekt URL or text-export file)")
    a.add_argument("--url", help="Archidekt deck URL")
    a.add_argument("--file", help="decklist text file (Archidekt/Moxfield text export)")
    a.add_argument("--name", help="deck name (default: fetched/derived)")
    a.add_argument("--owner", help="pod member the deck belongs to")
    a.set_defaults(fn=cmd_add)
    i = sub.add_parser("import", help="bulk import/refresh from a '{url} - {name}' file (default: decks.txt)")
    i.add_argument("path", nargs="?", default="decks.txt")
    i.add_argument("--owner", help="owner recorded for newly added decks")
    i.set_defaults(fn=cmd_import)
    sub.add_parser("list", help="list stored decks").set_defaults(fn=cmd_list)
    r = sub.add_parser("rm", help="remove a deck by id")
    r.add_argument("id", type=int)
    r.set_defaults(fn=cmd_rm)
    sub.add_parser("export", help="rewrite data/pod_decks.json").set_defaults(fn=lambda a: export())
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
