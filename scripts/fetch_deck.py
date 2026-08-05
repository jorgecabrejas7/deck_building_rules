#!/usr/bin/env python3
"""
Fetch an Archidekt deck by URL or ID, save the cardlist to a .txt file,
lookup prices via Scryfall, compute statistics, and evaluate configurable rules.

Usage:
  python scripts/fetch_deck.py <archidekt_deck_url_or_id> [--out OUT] [--rules RULES_YAML]

Examples:
  python scripts/fetch_deck.py https://archidekt.com/decks/12345/ --out out/deck.txt

Requirements:
  - Python 3.8+
  - requests

This script is intentionally self-contained and uses the public Scryfall API.
"""

import argparse
import os
import re
import sys
import time
import json
from collections import Counter, defaultdict

import requests
import yaml

ARCHIDekt_DECK_API = "https://archidekt.com/api/v1/decks/{deck_id}/"
SCRYFALL_CARD_API = "https://api.scryfall.com/cards/named"

DEFAULT_RULES = {
    'max_high_price_cards': {
        'threshold_usd': 10.0,
        'max_count': 4
    },
    'min_card_types': {
        'types_required': 2
    },
    'ban_keywords': {
        'keywords': []
    }
}


def parse_args():
    p = argparse.ArgumentParser(description='Fetch Archidekt deck and compute stats')
    # deck can be provided as a positional argument, or a batch file can be used
    p.add_argument('deck', nargs='?', help='Archidekt deck URL or numeric id')
    p.add_argument('--batch', help='Path to a file with one Archidekt URL or id per line', default=None)
    p.add_argument('--out', help='Output .txt path for card list, or output directory when --batch is used', default=None)
    p.add_argument('--rules', help='YAML rules file', default=None)
    p.add_argument('--no-price', help='Skip price lookups', action='store_true')
    return p.parse_args()


def extract_deck_id(deck_str):
    # try numeric id
    m = re.search(r"(\d+)", deck_str)
    if m:
        return m.group(1)
    return deck_str


def fetch_archidekt_deck(deck_id):
    url = ARCHIDekt_DECK_API.format(deck_id=deck_id)
    resp = requests.get(url)
    resp.raise_for_status()
    return resp.json()


def flatten_card_entries(deck_json):
    # Archidekt API returns a structure with sections and entries; each entry has a 'card' object
    cards = []
    for section in deck_json.get('sections', []):
        for entry in section.get('entries', []):
            card = entry.get('card') or {}
            qty = entry.get('quantity', 1)
            name = card.get('name') or entry.get('name')
            oracle = card.get('oracleText') or ''
            type_line = card.get('typeLine') or ''
            cmc = card.get('cmc')
            cards.append({'name': name, 'quantity': qty, 'oracle': oracle, 'type_line': type_line, 'cmc': cmc})
    return cards


def save_cardlist_txt(cards, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        for c in cards:
            f.write(f"{c['quantity']}x {c['name']}\n")


def lookup_price_scryfall(card_name):
    # Use exact name lookup via Scryfall named endpoint
    params = {'exact': card_name}
    resp = requests.get(SCRYFALL_CARD_API, params=params)
    if resp.status_code == 200:
        data = resp.json()
        # prefer usd, fall back to usd_foil
        usd = data.get('prices', {}).get('usd')
        usd_foil = data.get('prices', {}).get('usd_foil')
        if usd:
            return float(usd)
        if usd_foil:
            return float(usd_foil)
    # Not found or no price
    return None


def compute_stats(cards, price_map=None):
    total_cards = sum(c['quantity'] for c in cards)
    counts = Counter()
    type_counts = Counter()
    price_total = 0.0
    priced_cards = 0
    price_distribution = defaultdict(int)

    for c in cards:
        name = c['name']
        qty = c['quantity']
        counts[name] += qty
        if c.get('type_line'):
            # crude split on '—' and spaces
            types = re.split(r"\s+", c['type_line'].split('—')[0].strip())
            for t in types:
                if t:
                    type_counts[t] += qty
        price = None
        if price_map and name in price_map and price_map[name] is not None:
            price = price_map[name]
            price_total += price * qty
            priced_cards += qty
            # bucket
            if price >= 50:
                price_distribution['50+'] += qty
            elif price >= 20:
                price_distribution['20-49.99'] += qty
            elif price >= 10:
                price_distribution['10-19.99'] += qty
            elif price >= 1:
                price_distribution['1-9.99'] += qty
            else:
                price_distribution['<1'] += qty

    avg_price_per_card = (price_total / priced_cards) if priced_cards else None
    return {
        'total_cards': total_cards,
        'unique_cards': len(counts),
        'counts': counts,
        'type_counts': type_counts,
        'price_total': price_total,
        'avg_price_per_priced_card': avg_price_per_card,
        'price_distribution': dict(price_distribution)
    }


def load_rules(rules_path):
    if not rules_path:
        return DEFAULT_RULES
    with open(rules_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def evaluate_rules(stats, cards, price_map, rules):
    results = {}
    # Rule: max_high_price_cards
    mh = rules.get('max_high_price_cards')
    if mh:
        thr = mh.get('threshold_usd', 10.0)
        maxc = mh.get('max_count', 4)
        count_high = 0
        high_list = []
        for c in cards:
            p = price_map.get(c['name']) if price_map else None
            if p is not None and p >= thr:
                count_high += c['quantity']
                high_list.append((c['name'], p, c['quantity']))
        passed = count_high <= maxc
        results['max_high_price_cards'] = {'passed': passed, 'count': count_high, 'max_allowed': maxc, 'threshold': thr, 'items': high_list}

    # Rule: min_card_types
    mct = rules.get('min_card_types')
    if mct:
        required = mct.get('types_required', 2)
        available_types = len(stats['type_counts'])
        passed = available_types >= required
        results['min_card_types'] = {'passed': passed, 'types_found': available_types, 'required': required}

    # Rule: ban_keywords (checks oracle text)
    bk = rules.get('ban_keywords')
    if bk:
        keywords = [k.lower() for k in bk.get('keywords', [])]
        violating = []
        for c in cards:
            text = (c.get('oracle') or '').lower()
            for kw in keywords:
                if kw and kw in text:
                    violating.append((c['name'], kw))
        passed = len(violating) == 0
        results['ban_keywords'] = {'passed': passed, 'violations': violating}

    return results


def process_deck(deck_input, out_base, rules_path, no_price):
    deck_id = extract_deck_id(deck_input)

    try:
        deck_json = fetch_archidekt_deck(deck_id)
    except Exception as e:
        print(f"Failed to fetch Archidekt deck {deck_id}: {e}", file=sys.stderr)
        return {'deck': deck_input, 'error': str(e)}

    cards = flatten_card_entries(deck_json)

    # Determine out path
    if out_base:
        if os.path.isdir(out_base) or out_base.endswith(os.sep):
            out_dir = out_base
        else:
            # if looks like a file but we're batching, treat as directory
            out_dir = out_base
    else:
        out_dir = 'out'
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{deck_id}.txt")

    save_cardlist_txt(cards, out_path)
    print(f"Saved cardlist to {out_path}")

    price_map = {}
    if not no_price:
        print("Looking up prices on Scryfall (may be slow)...")
        for c in cards:
            name = c['name']
            if name in price_map:
                continue
            try:
                price = lookup_price_scryfall(name)
            except Exception:
                price = None
            price_map[name] = price
            time.sleep(0.1)

    stats = compute_stats(cards, price_map if not no_price else None)

    rules = load_rules(rules_path)
    eval_results = evaluate_rules(stats, cards, price_map if not no_price else None, rules)

    # Print a brief summary
    print('\nDeck summary:')
    print(f"Deck input: {deck_input} (id: {deck_id})")
    print(f"Total cards: {stats['total_cards']}")
    print(f"Unique cards: {stats['unique_cards']}")
    if stats['price_total']:
        print(f"Total price (USD): ${stats['price_total']:.2f}")
    else:
        print('Total price (USD): N/A')

    # write a small JSON report next to the txt
    report_path = os.path.splitext(out_path)[0] + '.report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump({'deck_input': deck_input, 'deck_id': deck_id, 'stats': stats, 'rules': rules, 'evaluation': eval_results, 'prices': price_map}, f, indent=2, default=str)
    print(f"Wrote report to {report_path}\n---\n")

    return {'deck': deck_input, 'deck_id': deck_id, 'out_txt': out_path, 'report': report_path, 'evaluation': eval_results}


def main():
    args = parse_args()

    if not args.deck and not args.batch:
        print('Either provide a deck URL/ID or --batch with a file listing decks (one per line).', file=sys.stderr)
        sys.exit(2)

    # Batch mode
    if args.batch:
        batch_file = args.batch
        if not os.path.exists(batch_file):
            print(f"Batch file not found: {batch_file}", file=sys.stderr)
            sys.exit(2)
        with open(batch_file, 'r', encoding='utf-8') as f:
            lines = [ln.strip() for ln in f if ln.strip() and not ln.strip().startswith('#')]

        results = []
        out_base = args.out or 'out'
        for deck_input in lines:
            res = process_deck(deck_input, out_base, args.rules, args.no_price)
            results.append(res)
            # small pause between decks
            time.sleep(0.2)

        # write a batch summary
        batch_report = os.path.join(out_base, 'batch.report.json')
        with open(batch_report, 'w', encoding='utf-8') as f:
            json.dump({'inputs': lines, 'results': results}, f, indent=2, default=str)
        print(f"Wrote batch report to {batch_report}")
        return

    # Single deck mode (positional)
    deck_input = args.deck
    out_base = os.path.dirname(args.out) if args.out and not args.out.endswith(os.sep) and not os.path.isdir(args.out) else (args.out or 'out')
    process_deck(deck_input, out_base, args.rules, args.no_price)


if __name__ == '__main__':
    main()
