Deck building helper tools

scripts/fetch_deck.py - Fetch an Archidekt deck, save cardlist, lookup prices on Scryfall, compute stats, and evaluate rules.

Usage example:

  python3 scripts/fetch_deck.py https://archidekt.com/decks/12345/ --out out/deck12345.txt --rules scripts/rules.yaml

Dependencies:
  pip install requests pyyaml

Notes:
  - The script uses the public Scryfall API for price lookups (no API key required). It uses the 'named' endpoint with exact card name matching and prefers usd prices.
  - Archidekt rate limits may apply; the script adds a small delay between Scryfall requests.

## Pod Deck Checker (app/ — hosted on GitHub Pages)

Live at: https://jorgecabrejas7.github.io/deck_building_rules/app/

Web app for the pod (app/index.html + styles.css + engine.js + app.js; the old
app/pod_deck_checker.html redirects there), organized in tabs (Cargar mazo /
Poder / Análisis / Consejos / Guía) with a sticky tier summary + commander
header. Paste a decklist (Archidekt/Moxfield text export) and it fetches card
data + Cardmarket EUR prices from Scryfall, applies the pod power rules
(rules/pod_rules.json v2, embedded), reports tier / points / violations with
what-if cut deltas, deck composition vs archetype targets with concrete
EDHREC-ranked card suggestions and why-add/why-cut reasoning (curated fallback
+ disclaimer offline), infinite-combo checking via Commander Spellbook (opt-in
proxy), ramp castability analysis, interactive mana curve, deck browser with
card art, sample opening hand, a 4-deck table compare mode, a how-it-works
rules explainer, and a bilingual (ES/EN) archetype guide.

Rules v2 semantics: points never stop counting (past a dial's last priced step
each extra unit adds +1); only the tier budgets decide (T1<=2, T2<=7) plus hard
bans and conditionals. Combos: every infinite combo counts separately, first 2
free, then 2-card +3 / 3-card +2 / 4+ +1. Calibration: 31 T1 / 5 T2 / 0 above.

Share the link — nothing to install. Rules are fetched from
rules/pod_rules.json (single source of truth) and infinite combos are matched
client-side against data/combos.json, a compact index distilled from Commander
Spellbook's bulk export by scripts/build_combo_db.py and refreshed weekly by a
GitHub Action — same-origin, no CORS, no proxies. Archidekt/Moxfield still
block direct browser reads, so deck URLs fall back to paste-the-text-export
(with an opt-in public-proxy retry for Archidekt).

Dev checks (users never need these):
  node scripts/test_engine_parity.js   # JS engine == Python rules on all 36 precons
  python3 scripts/tier_rules.py --selftest --calibrate

When rules change: edit rules/pod_rules.json — the app fetches it at runtime,
so there is nothing else to sync. Re-run the parity test + calibration.
