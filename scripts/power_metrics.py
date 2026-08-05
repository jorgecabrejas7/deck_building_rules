#!/usr/bin/env python3
"""
Shared power-level metrics for Commander decks. Used by both the precon-baseline
notebook (notebooks/precon_deck_analysis.ipynb) and scripts/generate_power_baseline.py,
so a "tutor" or a "game changer" is counted identically everywhere and the two never
drift apart.

Everything here is INFORMATIONAL: raw counts/flags, no tiers, thresholds, or pass/fail
rules. Those haven't been decided yet — this module only measures.

Detection confidence varies by dial:
  HIGH  game_changers        Scryfall's official Commander Bracket flag, exact.
        commander keywords   e.g. Eminence — read directly from Scryfall's keyword
                              list for the specific commander card(s), exact.
  GOOD  tutors, extra_turns, board_wipes, single_target_removal, counterspells,
        stax_effects, mass_land_denial, free_spells
                              Oracle-text regex on well-templated reminder/rules text.
                              Reasonably precise, but not a rules engine — misses
                              nonstandard templating and double-faced-card edge cases.
  LOW   card_advantage, protection_effects
                              Oracle-text regex on very common phrasing ("draw a
                              card", "hexproof"). High recall, low precision — these
                              will overcount relative to "meaningfully powerful card
                              advantage/protection." Treat as a rough signal only.
  STRUCTURAL  fast_mana       CMC <= 2 nonland permanent whose oracle text adds mana.
                              No exclusion for precon-ubiquitous staples (Sol Ring,
                              Arcane Signet, ...) — that's a judgment call for later,
                              not baked in here.
"""

import re
from collections import Counter

KEYWORD_PATTERNS = {
    "tutors": r"search your library for a card",
    "extra_turns": r"extra turn",
    "board_wipes": r"destroy all creatures|damage to each creature|each creature (?:gets|is destroyed)",
    "single_target_removal": r"(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|attacking or blocking creature)",
    # "counter target ... spell" with an optional qualifier gap ("noncreature",
    # "enchantment, instant, or sorcery", ...) — plain "counter target spell" included.
    "counterspells": r"counter target [^.\n]{0,60}?spell",
    # players/opponents-can't + skip-step, plus: opponents' permanents entering
    # tapped (Authority of the Consuls), cost-increase taxes (Thalia/Sphere), and
    # forced no-untap on others' permanents (its controller's/their — NOT "your",
    # which is a self-drawback like Basalt Monolith).
    "stax_effects": r"players can't|opponents can't|skip (?:your|their) (?:draw|untap|upkeep)"
                    r"|your opponents control enter(?:s)? (?:the battlefield )?tapped"
                    r"|spells? (?:[a-z' ]{0,30})?cost \{\d+\} more to cast"
                    r"|(?:don't|doesn't) untap during (?:their|its controller's)",
    "mass_land_denial": r"destroy all lands|search .* library for .* lands? and (?:exile|put)",
    "free_spells": r"without paying its mana cost|rather than pay|\bcascade\b",
    "card_advantage": r"draw (?:a card|two cards|three cards|cards equal to)",
    "protection_effects": r"hexproof|indestructible|protection from",
}

# Reminder text (parenthesized keyword explanations) is stripped before regex matching:
# e.g. Rebound's reminder contains "without paying its mana cost", which is not the
# free-spell power signal the dial is after. Cascade survives the strip because the
# keyword line itself remains and free_spells matches \bcascade\b.
REMINDER_TEXT_RE = re.compile(r"\([^)]*\)")

# Dials backed by a regex in KEYWORD_PATTERNS plus 'game_changers' and 'fast_mana'
# (both computed specially, see compute_deck_stats). Used by generate_power_baseline.py
# to know which stats to summarize.
ALL_DIALS = list(KEYWORD_PATTERNS) + ["game_changers", "fast_mana"]

# Dials used to GATE a deck into a power tier (see generate_power_baseline.py). Chosen
# from ALL_DIALS by dropping the ones too noisy/universal to be a power signal:
# single_target_removal (every deck runs some — not differentiating), card_advantage
# and protection_effects (LOW-confidence regexes, see module docstring), and the
# price/avg_cmc informational fields (correlated with power but not causative).
GATED_DIALS = [
    "game_changers", "mass_land_denial", "extra_turns", "stax_effects",
    "free_spells", "tutors", "counterspells", "board_wipes", "fast_mana",
]

# Tier 2 ("slightly above precon") ceiling = Tier 1 ceiling x this multiplier, per dial.
# Starting point, not gospel — tune freely and re-run generate_power_baseline.py.
# Dials that warp a game even in small numbers (mass land denial, extra turns) get a
# smaller step up than dials every deck accumulates naturally (tutors, wipes).
TIER2_MULTIPLIERS = {
    "game_changers": 1.5,
    "mass_land_denial": 1.0,
    "extra_turns": 1.3,
    "stax_effects": 1.3,
    "free_spells": 1.3,
    "tutors": 1.5,
    "counterspells": 1.5,
    "board_wipes": 1.5,
    "fast_mana": 1.3,
}

FAST_MANA_CMC_MAX = 2
FAST_MANA_RE = re.compile(r"add (?:\{[wubrgc0-9]\}|one mana|[a-z]+ mana|\$?\d+ mana)", re.IGNORECASE)

# EUR (Cardmarket) price bands, counted per deck alongside the other dials so price
# distribution can be cross-tabbed against — and conditioned on — the other power dials.
PRICE_BANDS = [
    ("price_under_1", lambda p: p < 1),
    ("price_1_5", lambda p: 1 <= p < 5),
    ("price_5_10", lambda p: 5 <= p < 10),
    ("price_10_20", lambda p: 10 <= p < 20),
    ("price_20_30", lambda p: 20 <= p < 30),
    ("price_30_plus", lambda p: p >= 30),
]
PRICE_BAND_DIALS = [b[0] for b in PRICE_BANDS]


def price_band(price):
    if price is None:
        return None
    for label, test in PRICE_BANDS:
        if test(price):
            return label
    return None


def compute_deck_stats(cards, cache):
    """cards: list of {'name': str, 'quantity': int}.
    cache: dict of card name -> scryfall fields (price, cmc, type_line, rarity,
    color_identity, oracle_text, game_changer), e.g. cache/scryfall_cache.json.

    Returns (stats: dict of numbers, flagged: dict[label -> list[(name, qty)]]).
    All values are raw counts/flags — no tiers or thresholds applied."""
    counter = Counter()
    for c in cards:
        counter[c["name"]] += c["quantity"]

    total_price = 0.0
    max_card_price = 0.0
    priced_qty = 0
    land_qty = 0
    basic_land_qty = 0
    cmc_values = []
    flagged = {k: [] for k in KEYWORD_PATTERNS}
    game_changers = []
    fast_mana = []
    unpriced = []

    price_bands = {label: [] for label in PRICE_BAND_DIALS}

    for name, qty in counter.items():
        info = cache.get(name, {})
        price = info.get("price")
        if price is not None:
            total_price += price * qty
            max_card_price = max(max_card_price, price)
            priced_qty += qty
            band = price_band(price)
            if band:
                price_bands[band].append((name, qty))
        else:
            unpriced.append(name)

        type_line = info.get("type_line") or ""
        oracle = REMINDER_TEXT_RE.sub("", info.get("oracle_text") or "")
        cmc = info.get("cmc")
        is_land = "Land" in type_line

        if is_land:
            land_qty += qty
            if "Basic Land" in type_line:
                basic_land_qty += qty
        else:
            if cmc is not None:
                cmc_values.extend([cmc] * qty)
            if cmc is not None and cmc <= FAST_MANA_CMC_MAX and FAST_MANA_RE.search(oracle):
                fast_mana.append((name, qty))

        if info.get("game_changer"):
            game_changers.append((name, qty))

        for label, pattern in KEYWORD_PATTERNS.items():
            if re.search(pattern, oracle, re.IGNORECASE):
                flagged[label].append((name, qty))

    stats = {
        "total_cards": sum(counter.values()),
        "unique_cards": len(counter),
        "total_price_eur": round(total_price, 2),
        "max_card_price_eur": round(max_card_price, 2),
        "avg_price_per_card": round(total_price / priced_qty, 2) if priced_qty else None,
        "unpriced_cards": len(unpriced),
        "land_count": land_qty,
        "basic_land_count": basic_land_qty,
        "nonbasic_land_count": land_qty - basic_land_qty,
        "avg_cmc": round(sum(cmc_values) / len(cmc_values), 2) if cmc_values else None,
        "game_changers": sum(q for _, q in game_changers),
        "fast_mana": sum(q for _, q in fast_mana),
    }
    for label in KEYWORD_PATTERNS:
        stats[label] = sum(q for _, q in flagged[label])
    for label in PRICE_BAND_DIALS:
        stats[label] = sum(q for _, q in price_bands[label])

    flagged["game_changers"] = game_changers
    flagged["fast_mana"] = fast_mana
    flagged.update(price_bands)
    return stats, flagged


def commander_ability_flags(commander_names, cache):
    """Informational: for each commander name, report Scryfall's raw keyword list and
    whether it includes an ability that's active from the command zone (currently just
    the officially keyworded 'Eminence' — freeform unkeyworded equivalents, if any,
    won't be caught here)."""
    out = {}
    for name in commander_names:
        info = cache.get(name, {})
        keywords = info.get("keywords", [])
        out[name] = {
            "keywords": keywords,
            "has_eminence": "Eminence" in keywords,
        }
    return out
