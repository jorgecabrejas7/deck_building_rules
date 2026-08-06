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

Web app for the pod — native ES modules, no build step: app/index.html +
app/styles/ (tokens/layout/components/mobile) + app/js/engine/ (pure,
DOM-free rules engine, also imported by the Node parity test) + app/js/ui/
(one module per section) with app/js/main.js as the entry point. Organized
in tabs (Cargar mazo /
Poder / Análisis / Consejos / Guía) with a sticky tier summary + commander
header. Paste a decklist (Archidekt/Moxfield text export) and it fetches card
data + Cardmarket EUR prices from Scryfall, applies the pod power rules
(rules/pod_rules.json v2, embedded), reports tier / points / violations with
what-if cut deltas, ordered power-down advice (violation-fixers first, then
most points freed) AND power-up advice (open upgrade paths toward Tier 2 with
their point costs, conditional locks explained, and concrete EDHREC-ranked
cards each paired with a direct cut), deck composition vs archetype targets
with why-add/why-cut reasoning and a retry button when EDHREC/Scryfall is
unreachable (curated fallback + disclaimer offline), automatic infinite-combo
checking via Commander Spellbook on every analysis, an archetype verdict panel
(what the deck does well / what it lacks), ramp castability analysis,
interactive mana curve, deck browser with card art, sample opening hand, a
4-deck table compare mode, a pod deck registry (see below), a how-it-works
rules explainer, and a bilingual (ES/EN) archetype guide.

Pod deck registry: reference decks live in a SQLite database managed by
scripts/pod_decks.py (add via Archidekt URL — fetched server-side, no CORS —
or a text-export file; rm/list/export). Every change re-exports
data/pod_decks.json, which the app's "Pod" tab reads: analyze any stored deck
or compare it against the currently loaded one in table mode.
  python3 scripts/pod_decks.py add --url https://archidekt.com/decks/12345 --owner Jorge
  python3 scripts/pod_decks.py add --file deck.txt --name "Mi mazo" --owner Ana

Rules v2 semantics: points never stop counting (past a dial's last priced step
each extra unit adds +1); only the tier budgets decide (T1<=2, T2<=7) plus hard
bans and conditionals. Combos: every infinite combo counts separately, first 2
free, then 2-card +3 / 3-card +2 / 4+ +1. Calibration: 31 T1 / 5 T2 / 0 above.

Share the link — nothing to install; the layout adapts to phones (tap the
card tiles and "?" icons where there is no mouse hover). Rules are fetched from
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
