# Roadmap

Every feature worth considering for the checker, from commandersalt.com (CS), deckcheck.co (DC) and our own ideas. Update the status in the same commit that changes it.

**Long-term goal (2026-11-07):** Jorge plans to monetize this as a public website. That is not the current work: for now, prepare the architecture so going public is easy. Nothing is decided yet about how it earns money. The next steps are an architecture review, then monetization research. Until they produce decisions, the standing decisions below hold, and any that block a public launch get reopened there rather than quietly changed.

**Standing decisions:** a static app on Jorge's server, whose only server-side part is a route that fetches one public deck from sites that refuse browsers. No AI for now. Pod first, shareable by link, with no accounts. The pod's point budget in `rules/pod_rules.json` alone decides who is in the pod. The power level (`power_brackets`, precons at Bracket 2, then 2*, 3, 3*, 4, 4*, 5, built on ways to win, interaction, salt and synergy) is a separate reading that never changes that verdict, as is Wizards' checklist. Commander Spellbook alone rates each combo, and a two-card line at 6 mana or less a turn is only a tip. The deck reads where its strength puts it, with anything above that bracket listed as worth a look (Spellbook's combo labels, cards that may deny lands, game changers) instead of raising it. Only mass land denial, as sorted by hand in `data/land_denial.json`, sets Bracket 4 on its own. Precons read on strength like any deck: the scale is fitted on all 198 (`data/precons.json`), so 193 land at Bracket 2, and the few above are real exceptions such as Creative Energy. Pages describe a deck rather than judge it: they say which bracket it fits and why, never what to cut to reach another bracket. The way back into the pod stays, in Puntos. Jorge's read of the pod's decks is locked in the parity test: if a scoring change breaks one, ask Jorge.

Status: ✅ have · 🟡 partial · ⬜ can do static · 🅿️ parked (needs server/AI) · ⛔ skip. M1-M7 are the milestones below.

### Deck analysis
| Feature | Source | Status |
|---|---|---|
| Bracket checklist with level per rule, two readings | CS | ✅ |
| Combos with Spellbook bracket, filters, card images, steps, needs and results | CS, DC | ✅ steps in `data/combo_steps/`, in English as Spellbook writes them |
| Rule-zero notes | CS | ✅ |
| 1-10 power with pillars, arithmetic and scale in the open | CS | ✅ fitted on 198 precons and 9 cEDH lists |
| Card reader accurate on real decks | CS | ✅ Scryfall tags, 89% precision and 94% recall on 196 labelled cards |
| Benchmark breakdown: tier, question and the cards behind it | DC | ✅ 14 benchmarks |
| Card ledger: which cards drive each score | CS, DC | ✅ |
| Per-card value in the deck list: level, jobs, why, point cost | CS | ✅ `engine/cardValue.js`, Mazo view; weights are our own judgement |
| Deck views: list, images, stacks, with grouping and sorting | DC | ✅ |
| Score drivers with named boosts and penalties | CS | ✅ replaced by benchmarks |
| Deck fingerprint: plain-language description of the deck | CS | ✅ |
| Goldfish turns: mana by turn, commander turn, winning line turn | DC | ✅ |
| Combo assembly odds by turn, with tutors counted | new | ✅ |
| Draw odds | DC | ✅ by role and turn |
| Sample hand, curve, colour requirements | DC, CS | ✅ |
| Pips vs production per colour | DC, CS | ✅ |
| Manabase depth: score parts, colours, land drop odds, mana by turn, medians | CS | ✅ Curva y maná; utility lands still M4 |
| Salt score with top cards | CS | ✅ |
| Salt breakdown by category | CS | ✅ Poder |
| Report card grades | CS | ⬜ M4 |
| Combo profile: strengths, risks, redundancy, anchor piece, friction | CS | 🟡 M4 |
| Win-condition profile, alternate wins, wincon types | CS | 🟡 M4 |
| Archetype mix with reasons and sub-themes | CS | 🟡 M4 |
| Typal and commander reliance | CS | 🟡 M4 |
| Synergy against EDHREC | new | ✅ |
| Card-to-card synergy web and hubs | CS | ✅ Sinergias; reads tags and combos, not full rules text |
| Timing and speed: instant share, curve shape | CS | 🟡 M4 |
| Compare two decks: matches, adds, cuts, curve, cost | DC | ✅ table mode |
| Rescan stability (Omni-Score) | DC | ⛔ exists to tame AI variance; ours is deterministic |

### Deck improvement
| Feature | Source | Status |
|---|---|---|
| Synergy-first suggestions and cuts | DC, ours | ✅ |
| One card away from a combo | DC | ✅ Combos view |
| Rule-based trim: over 100 to 100, with reasons and locked cards | DC | ✅ Mazo |
| Tune to a target tier or bracket under a budget | DC | 🟡 M5 rule-based |
| Land and ramp tuning | DC | ⬜ M5 |
| Mana staples by colour and price cap | DC | ⬜ M5 |
| What-if editing: add and cut cards, compare, undo | DC | ✅ Mazo |
| Budget: default against cheapest printings, priciest cards, Cardmarket links | DC | ✅ Mazo |
| Upgrade guide for a precon | DC, CS | ✅ Puntos, stops at the pod's budget |
| Writing about why, via AI (DeckTrim, PowerTune reasons) | DC | 🅿️ |

### Data and browsing
| Feature | Source | Status |
|---|---|---|
| Paste and Archidekt import | both | ✅ |
| Moxfield URL | both | ✅ through the server; paste if Moxfield refuses (no official API) |
| MTGGoldfish, TappedOut, ManaBox text formats | DC | ⬜ M5 |
| Precon browser with tier, bracket, power | DC | ⬜ M5 |
| All precons, from MTGJSON (198, weekly) | DC | ✅ fit and recognition; browser still M5 |
| Pod table and study, with rankings over time | new | ✅ snapshot per study |
| Table check: balance, who stands out, what to mention | new | ✅ table mode |
| Your deck against the commander's average list | new | ✅ Curva y maná, from EDHREC |
| Commander page: how your deck compares among pod and precons | CS | ⬜ M6 |
| Card search in plain English | DC | 🅿️ |
| Tokens list | DC | ⬜ M5 |

### Sharing and tools
| Feature | Source | Status |
|---|---|---|
| Share link holding the deck | DC, CS | ✅ |
| Rule-zero card to save as an image | CS | ✅ Resumen |
| Buy links | DC | ✅ Cardmarket search |
| Export and copy list | CS, DC | 🟡 M5 |
| QR card | DC | ⬜ M6 |
| Install and offline | DC | 🟡 M6 service worker exists |
| Goldfish playtester | DC, CS | ✅ Curva y maná, no rules enforced |
| Rulebook search | DC | ⬜ M7 |
| Saved deck versions in the browser, score history | DC | ✅ Resumen |

### Parked until server/AI is decided
Written synopsis and mulligan guide · chat assistant with memory · roast · rules Q&A · new-set impact report · plain-English card search.

### Skip, with reason
These reasons assume a private pod tool. The monetization research should reopen the accounts and billing lines.
- Accounts, cloud decks, comments, public visibility, public API: pod-first.
- Credits, subscriptions, billing: nothing to charge for.
- Collection, binders, wishlist, card scanner, price alerts: need accounts and a camera pipeline, and no one asked.
- Webcam lobbies, store accounts, event checks, Discord bot: other products.
- Leaderboards, global deck search, cEDH meta tiers: need millions of decks. Pod table is our version.
- Commander quiz, sleeves, flavour extras (nutrition label, field reports): decoration.

## How the app is laid out
The landing is a scroll-driven planeswalker scene (`ui/hero.js`) and is the Cargar page, where every visit starts. Each report takes its colours from the commander's identity (`--h1`, `--h2`). The report is one view at a time, never a long scroll: Resumen, Mazo, Puntos, Bracket, Combos, Poder, Curva y maná, Sinergias (`VIEW_KEYS` in `state.js`, drawn by `VIEW_RENDER` in `main.js`). Any `data-go="view"` link switches view. Every reading panel follows `ui/reading.js`: the answer first, a sentence why, the evidence folded. Styles for those panels and the deck view live in `styles/power.css`.

## Where it runs
https://169-58-71-242.sslip.io/pod/ is the site. The server publishes `origin/main` by itself within 5 minutes of a push (`deploy/publish.sh`, from cron). The Caddy routes are in `deploy/pod.caddy`; changing them needs Jorge's sudo. The old GitHub Pages address forwards there. The server's services and how to add one are in `/srv/README.md`.

## Where to pick up
What's left is marked ⬜ above (mostly M4 depth and smaller M5 items). Read the standing decisions above first, and check the open questions below before changing any score.

Not yet prepared for a public launch: no licence file, no fan-content or non-affiliation notice on the site, no real domain (the address is an sslip.io name), and no review of whether the data sources' terms allow commercial use. The site calls Scryfall, Commander Spellbook's bulk export, EDHREC's undocumented JSON, and Moxfield's unofficial API. The pod's own rules, decks and wording are built into the product.

## Milestones
- **M1, card reader:** done.
- **M2, benchmarks and card ledger:** done.
- **M3, goldfish engine:** done. No draw spells or rituals in the simulation yet (see `shortcut:` in `engine/goldfish.js`).
- **M4, profile depth:** manabase detail, salt breakdown, combo profile, win-condition and archetype reasons, report card grades.
- **M5, improvement and sharing:** one-card-away combos, rule-based trim and tuning, precon browser with newer precons, import formats, share links, rule-zero image, buy links, tokens.
- **M6-M7, as priorities allow:** synergy web, commander comparison, saved versions and history, offline, QR, playtester, rulebook search.

## Every milestone must pass
- `node scripts/test_engine_parity.js`
- `python3 scripts/tier_rules.py --calibrate` (the pod rules: 32 / 4 / 0)
- `node scripts/deck_study.js` after any engine change: every cEDH list above every precon
- Browser: both languages and themes, phone width, no console errors, then the live page after pushing

## Open questions for Jorge
- Which of the 13 decks Jorge has not placed read wrongly? Eight sit at 4.1, the weakest part of the scale.
- Does Korvold (7.9) or Winota (7.0) belong among the cEDH lists? Both score below the rest.
- Do the card values read right on the pod's decks? Massacre Wurm reads Marginal in Teysha, for example. Weights are in `engine/cardValue.js`.
- The deck study's four rule proposals, and Jorge's in/out marks, are still unanswered (`data/deck_study.json`, `docs/`).
- Are the Lightning and Luffy commander tags right?
