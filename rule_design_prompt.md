I'm building house-rule power-level guidelines for my Commander (EDH) pod, to replace WotC's official Bracket system, which I find inadequate. I have real data from 36 official Commander precon decks (10 different products, 2024-2026) and want to design a two-tier system:

- **Tier 1 ("Precon")**: matches stock precon power level.
- **Tier 2 ("Slightly above precon")**: a deliberate, bounded step up from Tier 1.
- Anything beyond Tier 2 is "above pod power level."

## Rule shape I want

Not independent per-dial ceilings (e.g. "tutors ≤1 AND free_spells ≤10" checked separately — that lets a deck stack multiple maxed-out dials at once). Instead:

1. **Ranges per dial** — e.g. "Tier 1 = 0-2 cards in the €10-20 price band."
2. **Conditional caps across dials** — e.g. "IF a deck has a game changer, THEN it's capped at N cards in the €10-20 band" (tightening one dial based on another dial's value). The idea is a deck gets to be strong on ONE axis, not stack several.

Data to check is available in ./notebooks/precon_deck_analysis.ipynb

Dial definitions (oracle-text regex heuristics unless noted):
- `game_changers` — Scryfall's official Commander Bracket flag (exact, not a regex).
- `mass_land_denial` — "destroy all lands" / mass-exile-lands effects.
- `extra_turns` — take an extra turn.
- `stax_effects` — "players/opponents can't...", "skip your/their draw/untap/upkeep".
- `free_spells` — castable without paying mana cost / "rather than pay".
- `tutors` — unconditional "search your library for a card" (any card, not "for a land" etc).
- `counterspells` — "counter target spell".
- `board_wipes` — "destroy all creatures" / mass damage to all creatures.
- `fast_mana` — nonland permanents, mana value ≤2, that add mana (i.e. ramp beyond basics).
- `price_*` bands — count of cards (by quantity) in each Cardmarket EUR price band.
- Depsite this not being excluded from gating we are more permissive with these (too noisy/universal to be a power signal): `single_target_removal` (every deck has some), `card_advantage` and `protection_effects` (low-precision broad regexes), but we check how powerful they are (Farewell is way better board wipe than Wrath of God, and thus must make the rest of the deck less powerful in other aspects).



## What I need from this conversation

Work with me to define, dial by dial and interaction by interaction, the actual Tier 1 and Tier 2 ranges/caps and any conditional (if-this-then-that) rules between dials. Once finalized, I want a clear structure of rules defined where it can be rule-checked against any decklist. I need this to easily checkable, as I want a single html file in the end which I will later tell you how to build in which I can either paste a Moxfield, Archidekt url or a text deckl;ist and it will fetch the price info as we are doing in the current code and make the analysis, but that's after we have discussed and set up the rules and with my explicit approval.
