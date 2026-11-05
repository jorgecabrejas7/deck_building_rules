# Roadmap

Every feature worth considering for the checker, from commandersalt.com (CS), deckcheck.co (DC) and our own ideas. Update the status in the same commit that changes it.

**Standing decisions:** static first, with no server or AI for now, and pod first, shareable by link, with no accounts. Pod rules alone decide a tier; profile measures are informative unless a rule change is approved. Learn from those sites' published methods, and use none of their data, scores or look: DeckCheck's API terms ban scraping and competing databases.

Status: ✅ have · 🟡 partial · ⬜ can do static · 🅿️ parked (needs server/AI) · ⛔ skip. M1-M7 are the milestones below.

### Deck analysis
| Feature | Source | Status |
|---|---|---|
| Bracket checklist with level per rule, two readings | CS | ✅ |
| Combos with Spellbook bracket, filters, mana, steps link | CS, DC | ✅ |
| Cut list to reach Bracket 3, rule-zero notes | CS | ✅ |
| 1-10 power with pillars and drivers | CS | 🟡 fitted on few decks |
| Card reader accurate on real decks | CS | ✅ Scryfall tags, 89% precision and 94% recall on 196 labelled cards |
| Benchmark breakdown: tier, question and the cards behind it | DC | ✅ 14 benchmarks |
| Card ledger: which cards drive each score | CS, DC | ✅ |
| Per-card score and weight in the deck list | CS | 🟡 top cards by jobs done |
| Score drivers with named boosts and penalties | CS | ✅ replaced by benchmarks |
| Deck fingerprint: plain-language description of the deck | CS | ✅ |
| Goldfish turns: mana by turn, commander turn, winning line turn | DC | ✅ |
| Combo assembly odds by turn, with tutors counted | new | ✅ |
| Draw odds | DC | ✅ by role and turn |
| Sample hand, curve, colour requirements | DC, CS | ✅ |
| Pips vs production per colour | DC, CS | ✅ |
| Manabase depth: untapped share, fetch and dual quality, utility lands, expected lands | CS | 🟡 M4 |
| Salt score with top cards | CS | ✅ |
| Salt breakdown: stax, theft, taxes, group slug, price, combos | CS | ⬜ M4 |
| Report card grades | CS | ⬜ M4 |
| Combo profile: strengths, risks, redundancy, anchor piece, friction | CS | 🟡 M4 |
| Win-condition profile, alternate wins, wincon types | CS | 🟡 M4 |
| Archetype mix with reasons and sub-themes | CS | 🟡 M4 |
| Typal and commander reliance | CS | 🟡 M4 |
| Synergy against EDHREC | new | ✅ |
| Card-to-card synergy web and hubs | CS | ⬜ M6, after M1 |
| Timing and speed: instant share, curve shape | CS | 🟡 M4 |
| Compare two decks: matches, adds, cuts, curve, cost | DC | ✅ table mode |
| Rescan stability (Omni-Score) | DC | ⛔ exists to tame AI variance; ours is deterministic |

### Deck improvement
| Feature | Source | Status |
|---|---|---|
| Synergy-first suggestions and cuts | DC, ours | ✅ |
| One card away from a combo | DC | ⬜ M5 |
| Rule-based trim: over 100 to 100, with reasons and locked cards | DC | ⬜ M5 |
| Tune to a target tier or bracket under a budget | DC | 🟡 M5 rule-based |
| Land and ramp tuning | DC | ⬜ M5 |
| Mana staples by colour and price cap | DC | ⬜ M5 |
| Accept or skip suggestions, with undo | DC | ⬜ M5 |
| Printings switch: cheapest, priciest, newest | DC | 🟡 M5 cheapest exists |
| Upgrade guide for a precon | DC, CS | ⬜ M5 |
| Writing about why, via AI (DeckTrim, PowerTune reasons) | DC | 🅿️ |

### Data and browsing
| Feature | Source | Status |
|---|---|---|
| Paste and Archidekt import | both | ✅ |
| Moxfield URL | both | 🅿️ blocks browsers; paste works |
| MTGGoldfish, TappedOut, ManaBox text formats | DC | ⬜ M5 |
| Precon browser with tier, bracket, power | DC | ⬜ M5 |
| Add newer precons (ours stops at 36; DeckCheck lists 180) | DC | ⬜ M5 |
| Pod table and study | new | ✅ |
| Commander page: how your deck compares among pod and precons | CS | ⬜ M6 |
| Card search in plain English | DC | 🅿️ |
| Tokens list | DC | ⬜ M5 |

### Sharing and tools
| Feature | Source | Status |
|---|---|---|
| Share link holding the deck | DC, CS | ⬜ M5 |
| Rule-zero card to save as an image | CS | ⬜ M5 |
| Buy links | DC | ⬜ M5 |
| Export and copy list | CS, DC | 🟡 M5 |
| QR card | DC | ⬜ M6 |
| Install and offline | DC | 🟡 M6 service worker exists |
| Goldfish playtester | DC, CS | ⬜ M7, large |
| Rulebook search | DC | ⬜ M7 |
| Saved deck versions in the browser, score history | DC | ⬜ M6 |

### Parked until server/AI is decided
Written synopsis and mulligan guide · chat assistant with memory · roast · rules Q&A · new-set impact report · Moxfield import · plain-English card search.

### Skip, with reason
- Accounts, cloud decks, comments, public visibility, public API: pod-first.
- Credits, subscriptions, billing: nothing to charge for.
- Collection, binders, wishlist, card scanner, price alerts: need accounts and a camera pipeline, and no one asked.
- Webcam lobbies, store accounts, event checks, Discord bot: other products.
- Leaderboards, global deck search, cEDH meta tiers: need millions of decks. Pod table is our version.
- Commander quiz, sleeves, flavour extras (nutrition label, field reports): decoration.

## Milestones
- **M1, card reader:** done.
- **M2, benchmarks and card ledger:** done.
- **M3, goldfish engine:** done. No draw spells or rituals in the simulation yet (see `shortcut:` in `engine/goldfish.js`).
- **M4, profile depth:** manabase detail, salt breakdown, combo profile, win-condition and archetype reasons, report card grades.
- **M5, improvement and sharing:** one-card-away combos, rule-based trim and tuning, precon browser with newer precons, import formats, share links, rule-zero image, buy links, tokens.
- **M6-M7, as priorities allow:** synergy web, commander comparison, saved versions and history, offline, QR, playtester, rulebook search.

## Every milestone must pass
- `node scripts/test_engine_parity.js`
- `python3 scripts/tier_rules.py --calibrate` (32 / 4 / 0: no pod rule changes without approval)
- `node scripts/deck_study.js` after any engine change: every cEDH list above every precon
- Browser: both languages and themes, phone width, no console errors, then the live page after pushing

## Open questions for Jorge
- Which pod decks feel wrongly placed? (`data/pod_labels.json`)
- Which of the study's four rule proposals to apply?
- Are the Lightning and Luffy commander tags right?
