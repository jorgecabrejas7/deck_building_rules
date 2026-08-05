Deck building helper tools

scripts/fetch_deck.py - Fetch an Archidekt deck, save cardlist, lookup prices on Scryfall, compute stats, and evaluate rules.

Usage example:

  python3 scripts/fetch_deck.py https://archidekt.com/decks/12345/ --out out/deck12345.txt --rules scripts/rules.yaml

Dependencies:
  pip install requests pyyaml

Notes:
  - The script uses the public Scryfall API for price lookups (no API key required). It uses the 'named' endpoint with exact card name matching and prefers usd prices.
  - Archidekt rate limits may apply; the script adds a small delay between Scryfall requests.

## Pod Deck Checker (app/pod_deck_checker.html)

Single self-contained HTML app for the pod, organized in tabs (Cargar mazo /
Poder / Análisis / Consejos / Guía) with a sticky tier summary + commander
header. Paste a decklist (Archidekt/Moxfield text export) and it fetches card
data + Cardmarket EUR prices from Scryfall, applies the pod power rules
(rules/pod_rules.json, embedded), reports tier / points / violations with
what-if cut deltas, deck composition vs archetype targets with concrete
EDHREC-ranked card suggestions (curated fallback + disclaimer offline),
deck browser with card art, mana curve, sample opening hand, a 4-deck table
compare mode, and a bilingual (ES/EN) archetype guide.

Share the file as-is: recipients just double-click it — no install, no server.
(Internet is needed for Scryfall. Archidekt/Moxfield block direct browser reads,
so deck URLs fall back to paste-the-text-export instructions.)

Dev checks (users never need these):
  node scripts/test_engine_parity.js   # JS engine == Python rules on all 36 precons
  python3 scripts/tier_rules.py --selftest --calibrate

When rules change: edit rules/pod_rules.json AND the inline <script id="pod-rules">
block in the HTML — the parity test fails if they drift.
