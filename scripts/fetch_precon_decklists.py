#!/usr/bin/env python3
"""
Fetch real, per-deck 100-card Commander precon decklists from the official
Wizards of the Coast decklist announcement pages (magic.wizards.com), plus
accurate Scryfall pricing/metadata for every card.

Unlike scripts/fetch_last10_precons.py (which only pulls the aggregate card
*pool* for a commander product, with no per-deck boundaries), this script
parses the actual <deck-list>...</deck-list> blocks WotC publishes for each
individual precon deck, so output is grouped by real 100-card deck.

Usage:
  python3 scripts/fetch_precon_decklists.py [--out out/precon_decks]

Products to fetch are defined in PRODUCTS below. Add more by finding the
announcement URL, e.g. via:
  https://magic.wizards.com/en/news/announcements/<product-slug>-commander-decklists
"""

import os
import re
import sys
import time
import json
import argparse
import requests
from datetime import datetime

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) '
                   'Chrome/120.0 Safari/537.36'
}
SCRYFALL_HEADERS = {'User-Agent': 'deck-building-rules/1.0 (+https://example.com)', 'Accept': 'application/json'}
SCRYFALL_SEARCH = 'https://api.scryfall.com/cards/search'
SCRYFALL_NAMED = 'https://api.scryfall.com/cards/named'

# Centralized pacing so EVERY Scryfall request (across all callers/retries) stays under
# their rate limit — previously each call site slept independently, which meant bursts
# could still happen back-to-back across different functions and trip 429s. Once a 429
# does happen, ALL subsequent requests (not just retries of the same call) must wait for
# the server's own Retry-After — ignoring it and retrying immediately just reproduces the
# same 429 over and over, which is what made the first two attempts at this so slow.
_MIN_REQUEST_INTERVAL = 0.5
_last_request_ts = 0.0
_blocked_until = 0.0


def scryfall_get(url, params=None, max_retries=3):
    """GET with rate-limit pacing that honors the server's Retry-After header."""
    global _last_request_ts, _blocked_until
    resp = None
    for attempt in range(max_retries):
        now = time.time()
        wait = max(_MIN_REQUEST_INTERVAL - (now - _last_request_ts), _blocked_until - now)
        if wait > 0:
            time.sleep(wait)
        resp = requests.get(url, headers=SCRYFALL_HEADERS, params=params, timeout=20)
        _last_request_ts = time.time()
        if resp.status_code == 429:
            retry_after = resp.headers.get('Retry-After')
            try:
                wait_s = float(retry_after) if retry_after else 5.0
            except ValueError:
                wait_s = 5.0
            _blocked_until = time.time() + wait_s + 0.5
            print(f"  [rate limited] honoring Retry-After: {wait_s:.0f}s", flush=True)
            continue
        return resp
    return resp

# code -> (expansion_code, expansion_name, released_at, decklist announcement URL)
PRODUCTS = {
    'ltc': ('ltr', 'The Lord of the Rings: Tales of Middle-earth', '2023-06-23',
            'https://magic.wizards.com/en/news/announcements/the-lord-of-the-rings-tales-of-middle-earth-commander-decklists'),
    'blc': ('blb', 'Bloomburrow', '2024-08-02',
            'https://magic.wizards.com/en/news/announcements/bloomburrow-commander-decklists'),
    'dsc': ('dsk', 'Duskmourn: House of Horror', '2024-09-27',
            'https://magic.wizards.com/en/news/announcements/duskmourn-house-of-horror-commander-decklists'),
    'drc': ('dft', 'Aetherdrift', '2025-02-14',
            'https://magic.wizards.com/en/news/announcements/aetherdrift-commander-decklists'),
    'tdc': ('tdm', 'Tarkir: Dragonstorm', '2025-04-11',
            'https://magic.wizards.com/en/news/announcements/tarkir-dragonstorm-commander-decklists'),
    'fic': ('fin', 'Final Fantasy', '2025-06-13',
            'https://magic.wizards.com/en/news/announcements/final-fantasy-commander-decklists'),
    'eoc': ('eoe', 'Edge of Eternities', '2025-08-01',
            'https://magic.wizards.com/en/news/announcements/edge-of-eternities-commander-decklists'),
    'ecc': ('ecl', 'Lorwyn Eclipsed', '2026-01-23',
            'https://magic.wizards.com/en/news/announcements/lorwyn-eclipsed-commander-decklists'),
    'soc': ('sos', 'Secrets of Strixhaven', '2026-04-24',
            'https://magic.wizards.com/en/news/announcements/secrets-of-strixhaven-commander-decklists'),
    'msc': ('msh', 'Marvel Super Heroes', '2026-06-26',
            'https://magic.wizards.com/en/news/announcements/marvel-super-heroes-commander-decklists'),
    # No decklists published yet as of fetch time (products not yet released):
    'frc': ('fra', 'Reality Fracture', '2026-10-02', None),
    'trc': ('trk', 'Star Trek', '2026-11-13', None),
}

H2_RE = re.compile(r'<h2[^>]*>([^<]*)</h2>')
DECKLIST_RE = re.compile(
    r'<deck-list[^>]*deck-title="([^"]*)"[^>]*>.*?<main-deck>(.*?)</main-deck>',
    re.S,
)
# WotC's card-image-gallery widget tags every card with a "_<Label>:" marker whose meaning
# varies by product template (CommBord, CommFace, CmdrFace, Face, CmFceSrg, CmdrFeat,
# BorComWI, ComToken, ...). The true face commander(s) are always labelled with some form of
# "Face"/"Bord"/"Fce"; featured non-commander legendaries ("Feat"), bonus/borderless inserts
# ("BorCom"), and tokens ("Tok") are not.
CIG_CARD_RE = re.compile(r'cig-card entry="[^"]*">[^:]*_([A-Za-z]+):\s*([^<]+)')


def is_commander_label(label):
    l = label.lower()
    if 'tok' in l or 'feat' in l or 'borcom' in l or 'scheme' in l:
        return False
    return 'face' in l or 'bord' in l or 'fce' in l
# Older announcement pages (pre-2024) show commander portraits as plain <figcaption><strong>
# text instead of the cig-card widget, e.g. "Traditional Foil Éowyn, Shieldmaiden".
COMMANDER_FIGCAPTION_RE = re.compile(
    r'<figcaption[^>]*>\s*<strong>(?:Traditional Foil\s+)?([^<]+?)\s*</strong>', re.S
)
# main-deck lines look like "1 Sol Ring [id]", "Sol Ring [id]" (qty implied 1), or "5 Island [id]"
LINE_RE = re.compile(r'^\s*(?:(\d+)\s+)?(.+?)(?:\s*\[[^\]\s]+\])?\s*$')


def fetch_page(url):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def parse_decks(html):
    """Find every <deck-list deck-title="...">...</deck-list> block on the page and
    pull commanders + the 100-card main-deck list out of each. Deck section headings
    on WotC's announcement pages are inconsistent across eras (<h2>, <h3>, or none at
    all), so we anchor on the self-delimiting <deck-list> tags instead and use the
    HTML between one deck-list and the next as the "commander portrait" hint region."""
    matches = list(DECKLIST_RE.finditer(html))
    decks = []
    for i, m in enumerate(matches):
        prev_end = matches[i - 1].end() if i > 0 else 0
        hint_region = html[prev_end:m.start()]

        deck_title = m.group(1).strip()
        commanders = [name.strip() for label, name in CIG_CARD_RE.findall(hint_region) if is_commander_label(label)]
        if not commanders:
            commanders = [c.strip() for c in COMMANDER_FIGCAPTION_RE.findall(hint_region)]
        # drop alternate-treatment duplicates ("Foil-Etched X Display Commander") of an
        # already-listed commander, and de-duplicate while preserving order
        seen = set()
        deduped = []
        for c in commanders:
            if 'display commander' in c.lower():
                continue
            key = c.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(c)
        commanders = deduped

        cards = []
        for line in m.group(2).strip().splitlines():
            line = line.strip()
            if not line:
                continue
            lm = LINE_RE.match(line)
            if lm:
                qty = int(lm.group(1)) if lm.group(1) else 1
                cards.append({'quantity': qty, 'name': lm.group(2).strip()})

        total = sum(c['quantity'] for c in cards)
        decks.append({
            'deck_title': deck_title,
            'commanders': commanders,
            'cards': cards,
            'total_cards': total,
        })
    return decks


def slugify(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def collector_key(number):
    d = re.match(r'\d+', str(number) or '')
    return int(d.group()) if d else 0


def extract_scryfall_fields(card):
    prices = card.get('prices', {}) or {}
    eur = prices.get('eur')
    eur_foil = prices.get('eur_foil')
    price = float(eur) if eur else (float(eur_foil) if eur_foil else None)
    oracle_text = card.get('oracle_text')
    if not oracle_text and card.get('card_faces'):
        oracle_text = ' // '.join(f.get('oracle_text', '') for f in card['card_faces'])
    return {
        'name': card.get('name'),
        'price': price,
        'eur': float(eur) if eur else None,
        'eur_foil': float(eur_foil) if eur_foil else None,
        'cmc': card.get('cmc'),
        'type_line': card.get('type_line'),
        'rarity': card.get('rarity'),
        'colors': card.get('colors', []),
        'color_identity': card.get('color_identity', []),
        'oracle_text': oracle_text or '',
        'game_changer': bool(card.get('game_changer', False)),
        'keywords': card.get('keywords', []),
        'set': card.get('set'),
        'released_at': card.get('released_at'),
    }


def find_cheapest_printing(name, max_pages=5):
    """Search every printing of an exact card name and return the fields of whichever
    printing has the lowest Cardmarket (EUR) market price (falling back to eur_foil for
    printings that are foil-only). This is a deliberate choice: 'price of this card' means
    the cheapest way to acquire it, not the price of Scryfall's arbitrarily-chosen 'default'
    printing (which can even be an unreleased future reprint with no price at all).
    A single page holds up to 175 prints, which covers even heavily-reprinted staples
    (Sol Ring has 131), so 5 pages is a generous ceiling, not a expected depth."""
    url = SCRYFALL_SEARCH
    params = {'q': f'!"{name}"', 'unique': 'prints'}
    pages = 0
    cheapest = None
    any_printing = None
    while url and pages < max_pages:
        resp = scryfall_get(url, params=params if pages == 0 else None)
        if resp.status_code != 200:
            break
        j = resp.json()
        for card in j.get('data', []):
            fields = extract_scryfall_fields(card)
            if any_printing is None:
                any_printing = fields
            if fields['price'] is not None and (cheapest is None or fields['price'] < cheapest['price']):
                cheapest = fields
        url = j.get('next_page') if j.get('has_more') else None
        pages += 1
    return cheapest if cheapest is not None else any_printing


def resolve_card_name(name):
    """Some precons (e.g. Marvel Super Heroes) rename shared staples per-deck for flavor,
    e.g. 'Sol Ring Avengers' or 'Arcane Signet (Villains)' for plain 'Sol Ring'/'Arcane
    Signet'. Strip a trailing parenthetical and/or trailing words until Scryfall recognizes
    an exact name, so we price the real underlying card instead of getting a 404."""
    base = re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()
    candidates = []
    if base != name:
        candidates.append(base)
    words = base.split()
    for k in range(1, min(4, len(words))):
        candidates.append(' '.join(words[:-k]))

    for cand in candidates:
        r = scryfall_get(SCRYFALL_NAMED, params={'exact': cand})
        if r.status_code == 200:
            return cand
    return name


def fetch_scryfall_data(names, cache, save_every=100, save_cb=None):
    missing = [n for n in names if n not in cache]
    print(f"{len(names) - len(missing)} cards already cached, fetching {len(missing)} from Scryfall...", flush=True)
    t0 = time.time()
    for idx, name in enumerate(missing, 1):
        fields = find_cheapest_printing(name)
        if fields is None:
            # exact name not found at all — try resolving flavor-renamed staples
            # (e.g. 'Sol Ring Avengers' -> 'Sol Ring') and retry
            resolved = resolve_card_name(name)
            if resolved != name:
                fields = find_cheapest_printing(resolved)
        if fields is None:
            fields = {'name': name, 'price': None, 'cmc': None, 'type_line': None, 'rarity': None,
                      'colors': [], 'color_identity': [], 'oracle_text': '', 'game_changer': False,
                      'keywords': [], 'set': None, 'released_at': None}
        cache[name] = fields

        if idx % 25 == 0 or idx == len(missing):
            elapsed = time.time() - t0
            rate = idx / elapsed if elapsed else 0
            print(f"  {idx}/{len(missing)}  ({rate:.1f} cards/s, {elapsed:.0f}s elapsed)", flush=True)
        if save_cb and idx % save_every == 0:
            save_cb(cache)
    return cache


def main():
    p = argparse.ArgumentParser(description='Fetch real per-deck Commander precon decklists + Scryfall pricing')
    p.add_argument('--out', default='out/precon_decks', help='Output directory')
    p.add_argument('--cache', default='cache/scryfall_cache.json', help='Scryfall data cache path')
    p.add_argument('--refetch-decklists', action='store_true',
                    help='Re-fetch decklist HTML from magic.wizards.com even if a report.json already exists '
                         '(default: reuse existing report.json so re-running to resume Scryfall pricing is fast)')
    args = p.parse_args()

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(os.path.dirname(args.cache), exist_ok=True)

    cache = {}
    if os.path.exists(args.cache):
        cache = json.loads(open(args.cache, encoding='utf-8').read())

    all_names = set()
    products_out = []

    for code, (exp_code, exp_name, released_at, url) in PRODUCTS.items():
        if url is None:
            print(f"Skipping {code} ({exp_name}): no decklists published yet")
            products_out.append({
                'commander_code': code, 'commander_name': f'{exp_name} Commander',
                'expansion_code': exp_code, 'expansion_name': exp_name, 'released_at': released_at,
                'decks': [], 'status': 'not_yet_published',
            })
            continue

        report_path = os.path.join(args.out, f"{code}.report.json")
        if os.path.exists(report_path) and not args.refetch_decklists:
            print(f"Reusing existing decklists for {exp_name} Commander ({code}) from {report_path}")
            existing = json.loads(open(report_path, encoding='utf-8').read())
            decks = existing.get('decks', [])
        else:
            print(f"Fetching {exp_name} Commander decklists ({code}) from {url} ...")
            html = fetch_page(url)
            decks = parse_decks(html)
            if not decks:
                print(f"  WARNING: no <deck-list> blocks found for {code} — page structure may have changed", file=sys.stderr)

            for d in decks:
                bad = d['total_cards'] != 100
                flag = '  (!! not 100 cards)' if bad else ''
                print(f"  {d['deck_title']:<30} {d['total_cards']:>3} cards  commanders: {', '.join(d['commanders'])}{flag}")

            product_dir = os.path.join(args.out, code)
            os.makedirs(product_dir, exist_ok=True)
            for d in decks:
                slug = slugify(d['deck_title'])
                with open(os.path.join(product_dir, f"{slug}.txt"), 'w', encoding='utf-8') as f:
                    for c in d['cards']:
                        f.write(f"{c['quantity']}x {c['name']}\n")
            time.sleep(0.3)

        for d in decks:
            for c in d['cards']:
                all_names.add(c['name'])

        products_out.append({
            'commander_code': code, 'commander_name': f'{exp_name} Commander',
            'expansion_code': exp_code, 'expansion_name': exp_name, 'released_at': released_at,
            'source_url': url, 'decks': decks, 'status': 'ok',
        })

    def save_cache(c):
        with open(args.cache, 'w', encoding='utf-8') as f:
            json.dump(c, f, indent=2, ensure_ascii=False)

    print(f"\n{len(all_names)} unique card names across all decks. Fetching Scryfall data...")
    cache = fetch_scryfall_data(sorted(all_names), cache, save_cb=save_cache)
    save_cache(cache)
    print(f"Cache now has {len(cache)} entries -> {args.cache}")

    for product in products_out:
        report_path = os.path.join(args.out, f"{product['commander_code']}.report.json")
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump({**product, 'generated_at': datetime.utcnow().isoformat() + 'Z'}, f, indent=2, ensure_ascii=False)

    summary_path = os.path.join(args.out, 'summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump({
            'products': [{'code': p['commander_code'], 'name': p['commander_name'],
                          'status': p['status'], 'deck_count': len(p['decks'])} for p in products_out],
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(products_out)} product reports + summary to {args.out}")


if __name__ == '__main__':
    main()
