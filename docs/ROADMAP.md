# Roadmap

Every feature worth considering for the checker, from commandersalt.com (CS), deckcheck.co (DC) and our own ideas. Update the status in the same commit that changes it.

**Long-term goal (2026-11-07):** Jorge plans to monetize this as a public website. That is not the current work: for now, prepare the architecture so going public is easy. Nothing is decided yet about how it earns money. The next steps are an architecture review, then monetization research. Until they produce decisions, the standing decisions below hold, and any that block a public launch get reopened there rather than quietly changed.

**Standing decisions:** a static front end plus one Django backend at `/pod/api/` (F1), both on Jorge's server, plus the route that fetches one public deck from sites that refuse browsers. No AI for now. Pod first, shareable by link. While the site is private in development every page except the account page needs an account, and Jorge approves each one: the pod is small and the data sources' terms are unchecked. At public launch the analyzer opens without an account (the gate comes off), because Wizards' Fan Content Policy forbids requiring registration to access fan content; accounts then only unlock saved decks and pods. There are many pods (F3), so nothing may assume there is only one. Each pod's own point budget alone decides who is in that pod; `rules/pod_rules.json` is the calibrated template new pods copy, and the one the selftest and calibration guard. The power level (`power_brackets`, precons at Bracket 2, then 2*, 3, 3*, 4, 4*, 5, built on ways to win, interaction, salt and synergy) is a separate reading that never changes that verdict, as is Wizards' checklist. Commander Spellbook alone rates each combo, and a two-card line at 6 mana or less a turn is only a tip. The deck reads where its strength puts it, with anything above that bracket listed as worth a look (Spellbook's combo labels, cards that may deny lands, game changers) instead of raising it. Only mass land denial, as sorted by hand in `data/land_denial.json`, sets Bracket 4 on its own. Precons read on strength like any deck: the scale is fitted on all 198 (`data/precons.json`), so 193 land at Bracket 2, and the few above are real exceptions such as Creative Energy. Pages describe a deck rather than judge it: they say which bracket it fits and why, never what to cut to reach another bracket. The way back into the pod stays, in Puntos. Jorge's read of the pod's decks is locked in the parity test: if a scoring change breaks one, ask Jorge.

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
| Pod table and study (rankings over time dropped in F3: readings are never stored server-side) | new | ✅ Pod tab |
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
These reasons assume a private pod tool. The monetization research should reopen the billing lines.
- Comments, public visibility, public API: pod-first.
- Credits, subscriptions, billing: nothing to charge for.
- Collection, binders, wishlist, card scanner, price alerts: need accounts and a camera pipeline, and no one asked.
- Webcam lobbies, store accounts, event checks, Discord bot: other products.
- Leaderboards, global deck search, cEDH meta tiers: need millions of decks. Pod table is our version.
- Commander quiz, sleeves, flavour extras (nutrition label, field reports): decoration.

## How the app is laid out
The landing is a scroll-driven planeswalker scene (`ui/hero.js`) and is the Cargar page, where every visit starts. Each report takes its colours from the commander's identity (`--h1`, `--h2`). The report is one view at a time, never a long scroll: Resumen, Mazo, Puntos, Bracket, Combos, Poder, Curva y maná, Sinergias (`VIEW_KEYS` in `state.js`, drawn by `VIEW_RENDER` in `main.js`). Any `data-go="view"` link switches view. Every reading panel follows `ui/reading.js`: the answer first, a sentence why, the evidence folded. Styles for those panels and the deck view live in `styles/power.css`.

Every deck is read by one pure function, `analyzeDeck` in `engine/analyze.js`: the app, table mode, the deck study and the parity test all call it with the rules passed in, so a pod's own rules or a deck being built go through the same code. Synergy is left out because it is an EDHREC fetch; each caller adds it.

## Stack of the backend (F1)
| Choice | Why |
|---|---|
| Django 5.2 LTS, plain views | accounts, admin and sessions come built in; the API is a handful of small views |
| django-allauth headless, username + password and Google | maintained login, signup, password and Google flows; the front end keeps its own pages |
| argon2 | the strongest hasher Django ships |
| SQLite in WAL mode | one small server, one writer at a time is enough, and a backup is a file copy |
| whitenoise, uvicorn | admin static files without another route, and one process behind Caddy |
| Rejected: Node, FastAPI, DRF, Postgres | Node or FastAPI would rebuild auth and admin; DRF is weight for a few JSON views; Postgres is a second service nobody needs yet |

## Privacy
We store the username, email, display name, language and a password hash (or the Google link), and later the user's saved decks and pods. Nothing is sold or shared. A signed-in user can delete the account in the profile page; that removes the account and its data, and never touches the browser's `pdc_*` keys. Backups stay on the server for 14 days. Data requests go by email to the contact address on the privacy and terms pages (`account.html?view=privacy|terms`, linked from every footer). The Google OAuth app is published (2026-11-10), so anyone with Google can request an account; every new account still waits for approval in the admin page.

## Building stages
- **F0:** static analyzer, pod rules, table mode. Done.
- **F1:** users and the private gate. Done.
- **F2:** saved decks per user, and a picker of the user's public Archidekt decks. Done. Django app `decks` (`Deck`, `DeckVersion`) at `/pod/api/decks…`; a save always adds a version, never overwrites (100 decks a user, 100 versions a deck, refused past that). The header's Guardar saves the analyzed deck; it adds a version while the analysis keeps the commanders of the deck opened from Mis mazos, otherwise it makes a new deck (in memory only, never in `pdc_*`). Visibility is private or link (`index.html#deck=<token>`, signed-in players only, latest version); `pods` exists for F3 and reads as private. Mis mazos is its own tab: open, rename, history (`diffCards`), visibility, delete with an inline confirm, and import from Archidekt by username: Caddy's `@archidektuser` route lists that user's public Commander decks (first 50), each ticked deck is fetched with the existing deck route. In DEBUG Django answers both Archidekt routes so the import works on localhost. The `api()` helper lives in `app/js/api.js`, an open path.
- **F3:** pods with their own rules. Done. Django app `pods` (`Pod`, `PodMember`, `PodDeck`) at `/pod/api/pods…`. Anyone signed in creates a pod (copying the template or a pod they are in) and is its admin; others join with `index.html#join=<code>`, which survives the sign-in redirect. A pod stores the template's rules without `power_brackets` (the power scale is the same reading for every pod); the server's `apply_edits` copies only the editable numbers and banned lists onto the pod's rules, so strings, ids and structure never come from a client, and the €30 cap stays fixed because the engine's price bands are fixed. The active pod lives in the Django session; `app/js/rules.js` exports `TEMPLATE`, a live `RULES` and `setRules`, so every reader follows the chosen pod, and help texts fill their numbers from `RULES`. The selftest runs on `TEMPLATE` only. The Pod tab reads members' decks in the browser with `readDeck` (shared with table mode) under the pod's rules, cached in memory; a deck shows in a pod when its visibility is `pods` or `link`. Admins rename, edit rules (`ui/podrules.js`), regenerate the invite, remove members and promote admins; the last admin cannot leave while others remain, and deleting an account promotes the longest-standing member. Every pod, Jorge's included, is created in the Pod tab; no server command makes one. The registry (`scripts/pod_decks.py`, its SQLite, `pod_history.json`, `engine/rankings.js`) is gone; `data/pod_decks.json` stays as the frozen fixture that holds Jorge's locked read for the parity test.
- **F4:** deck builder. Done. The builder is the analyzer: its own tab, Crear (also a button on the first screen), searches legal commanders (and a partner or background through `canPair`), then `startDeck` analyzes the text `Commander: X` and opens Mazo, where the existing what-if editor builds the deck with live readings under the active pod. `addToDeck` refuses a second copy of a non-stacking card and a card outside the commanders' colour identity (`addRefusal`, for every deck); basics get "+1 copia" in the inspector; synergy tips in Puntos and one-card-away combos get one-tap Añadir/Quitar. A deck started there saves with source `builder` and is not recorded in the browser's score history. Readings run in full on every edit: `analyzeDeck` takes about 12 ms on 100 cards, and 1-, 2- and 20-card decks read with no error or NaN (parity test). Card search uses Scryfall's 429 backoff and cleans unbalanced quotes and brackets.
- **F5:** table, shown for two players (the server and log handle 2 to 6, see F8). Done. Django app `games` (`Game`, `GamePlayer`) plus Django Channels 4.3.2 with the in-memory channel layer (single uvicorn process; switch to channels-redis only if it ever runs more than one worker). A pod member invites another from the Partidas tab (also a button on the first screen; it uses the active pod), every player picks a saved deck, and `table.py` deals: commanders to the command zone, shuffled library, 7 cards, life 40. The table is `app/table.html`, live over `/pod/api/ws/game/<id>` (Caddy's `/api/*` route already carries WebSockets; the consumer checks the session user is one of the game's players, origin is checked against `ALLOWED_HOSTS`). No Magic rules are enforced: any card moves to any zone of any player, and any library offers the top N to draw (owner) or take into your hand (the other player), mill, exile face up or down, look at or reveal, plus a search (looks at every card, lists them by name with a filter; pick one and send it to your hand, your battlefield, its owner's graveyard, or the top after shuffling the rest, then shuffle and close). An aura or equipment attaches to any battlefield card ("Anexar a…" then tap the host, or drag it onto the host): the server's `attach` action keeps an `attached` pointer that follows the host across a change of control and drops when either card leaves the battlefield, and the host is drawn with the attachment tucked behind it. A permanent is a wide art tile with a thin frame in the card's colour and its power/toughness or loyalty (no card text; a tapped one tilts and dims instead of turning), and every battlefield row is centred. A move to a library may carry `shuffle` to shuffle that library first. Play is by gesture: tap one of your battlefield cards to tap or untap it, press a battlefield card to see it large and move away to drag it onto a battlefield, the hand or a pile (a mouse too; a tray of quick zones, hand, graveyard, exile and library top or bottom, shows at the screen edge while dragging), double-tap a card to open its actions, which start selecting several, slide a finger from empty battlefield space to see the cards under it large, tap anything else to open it; a card's sheet leads with its image and sends it to its owner's zones (the battlefield is yours). The table has two layouts and the battlefield gets the whole screen. Wide screens (any landscape, any large screen, the default) stack the players like a game table, theirs on top and yours at the bottom, each battlefield the full width with creatures towards the centre line and lands beside other permanents at the player's own edge, a quiet felt with each half faintly tinted and the accent glowing along the centre line on the half whose turn it is. A phone upright shows one board at a time (the other collapses to a slim bar with life, counts and thumbnails; tap or swipe to switch, and your board returns after 10 s). Everything else floats over the felt: each player has a translucent pill in a corner of their half with name, life and commander damage, and zone chips beside it (library, graveyard, exile, command zone, and the opponent's hand) that open the pile, take dropped cards and are where flying cards land; Pass turn sits on the right edge at the centre line (just above the hand on a phone upright), showing whose turn it is on theirs; one round action button at the bottom right opens bubbles for draw, untap all, undo, token, your graveyard, exile and library, the log, full screen and the menu (dice and mulligan are in the menu); and your hand is a fan at the bottom between the pill and that button, peeking on short wide screens and rising under a finger. Battlefields split into creatures, other and lands with identical cards stacked, and card size fits the board (scaled by a size setting). Tapping a card other than your own battlefield card opens a small action bar beside it; a selection takes one action for all its cards; a held pile drags its top card; counters sit on the card with steppers. The hand is a fan you slide along (the pressed card shows large), dragging or flicking a card up plays it. Turns: the server tracks whose turn it is (random first player) and `pass_turn` untaps and draws for the next player; `undo` steps back your own latest actions (up to 5) except random or revealing ones; a per-viewer log of the last 50 actions, filtered like cards, is shown as sentences grouped by turn. The opponent's last changes glow, life changes float a bubble, and the life number opens a pad. A first game offers full screen (or Add to Home Screen on iPhone) and four first-time hints; the full-screen bubble is on every phone (on iPhone, where the browser has no full screen, it explains Add to Home Screen). tap, flip face down, counters, tokens, look, reveal, shuffle, mulligan, life, commander damage, dice and coins. The server holds the whole state in SQLite, written on every action inside one transaction, so a restart or a dropped phone loses nothing; each player gets their own view, where a card they cannot see has no name, and a card keeps its id across moves and a shuffle issues new ones, so an id cannot be followed through a shuffle. Each card keeps one element and glides between zones (FLIP on the Web Animations API, instant under reduced motion); the client applies predictable actions at once through `predict.js` (checked against the reducer by `scripts/test_table_predict.js`) and the server stays the truth, so a rejected action glides back. Undo is one bubble of the action button (no toast), and passing the turn has a 1.5 s cancel window. `table.py` is pure Python with a test per action and a 500-action fuzz that checks no hidden name ever reaches the other seat. Ending a game deletes it (the game log was cut). The table has a feel layer: a dragged card is lifted into a ghost that tilts with the pointer's speed, is pulled towards small targets such as zone chips, hands over to the card flight on a drop and flies back to its slot when dropped nowhere. The hand is an arc whose cards part around the raised one. A drawn card flips as it flies from the library. Untapping three or more permanents ripples across the board. A shuffled library chip riffles. A roll shows a tumbling die that lands on the result. The table has a look layer: a static playmat drawn in CSS (soft light at the centre, grain, vignette), each half told apart by tone with a soft seam and light falling along it on the half whose turn it is, three shadow levels for cards (resting, lifted, held) with a gentle sheen on the held and zoomed card, one card back used everywhere a back shows, tokens as tinted panels with their name centred, and glass chrome that stays quieter than the cards. Sounds are optional and synthesized (tap, untap, play, draw, shuffle, your turn, roll, error); they are off by default and switched on in the menu under Sound, per viewer.
- **F6:** friends and pod members. Done. Django app `friends` (`Friendship`: a request from one user to another, accepted or pending, at most 200 per user) at `/pod/api/friends…`. The Amigos tab shows your username to share, sends a request by exact username, accepts or declines requests (the tab label counts the waiting ones), and removes friends. A pod admin adds a friend straight to the pod from the Pod tab (`POST pods/<id>/members`); the invite link still works for anyone else. Admins make members admins and turn admins back into members; the last admin cannot be demoted. The friends list is not used for games yet: games stay between members of the same pod.
- **F7:** token lookup. Planned, after the two-player table is approved. A searchable list of tokens from Scryfall's token data, with art and power/toughness, offering first the tokens the player's deck makes. A token on the table is only a name today, so the reducer has to carry what identifies its art and stats.
- **F8:** games of 2 to 6 players. Done. The server, predictor and log handle 2 to 6 seats (`out` action, commander damage keyed by source seat, turn order skipping players who are out, a cap on tokens instead of cards). The screen always shows two battlefields, yours and one other player's; with three or more players the top one follows the turn (it stays when the turn comes to you), a row of mini pills (name, life, a dot for whose turn, struck when out, the shown one highlighted; it glows when someone off the top acts) and a Players group in the action button's bubbles put any player on top until the next turn, each player's pill has one commander-damage chip with the highest single-commander damage that opens a sheet listing every other player's commanders with steppers, giving control asks which player, the menu has "I'm out of the game" (dimmed, skipped by Pass turn), and the Partidas form invites one to five pod members at once.

## Translations
Every text is in Spanish and English, through `L` / `T()` in `i18n.js`, and placeholders are filled with `fill` from the same file. A new feature keeps its strings in `app/js/i18n/<feature>.js`, merged into `L`. No inline `lang === 'es' ? … : …` in new code. A missing key shows `⟦key⟧` on screen, and `node scripts/test_i18n.js` fails on any gap or any placeholder that differs between the two languages.

## Where it runs
https://169-58-71-242.sslip.io/pod/ is the site. The server publishes `origin/main` by itself within 5 minutes of a push (`deploy/publish.sh`, from cron). The Caddy routes are in `deploy/pod.caddy`; changing them needs Jorge's sudo. The same publish builds the backend: it creates the venv (`/srv/pod-checker/venv`), installs `server/requirements.txt` when it changed, runs `migrate` and `collectstatic` before switching the release, then restarts the user service `pod-api` (`deploy/pod-api.service`, uvicorn on 127.0.0.1:8770, settings from `/srv/pod-checker/pod-api.env`, mode 0600). Without that env file the backend steps are skipped. The database is `/srv/pod-checker/db/pod.sqlite3`, copied daily into `db/backups/` (14 days kept) by `server/backup_db.py`, since the server has no `sqlite3` CLI: `15 3 * * * /srv/pod-checker/venv/bin/python /srv/pod-checker/site/server/backup_db.py /srv/pod-checker/db/pod.sqlite3 /srv/pod-checker/db/backups >> /srv/pod-checker/backup.log 2>&1`. Caddy gates the site: every path except the account page and its modules (`OPEN_PATHS`, the same list in `server/accounts/views.py` and `deploy/pod.caddy`) first asks `/pod/api/gate`, which sends anyone not signed in to `/pod/app/account.html`. The Moxfield and Archidekt routes are gated too. The old GitHub Pages address forwards there. The server's services and how to add one are in `/srv/README.md`.

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
- `python3 -m pytest server` (from the server venv, see the README)
- `node scripts/test_engine_parity.js`
- `node scripts/test_i18n.js`
- `python3 scripts/tier_rules.py --calibrate` (the pod rules: 32 / 4 / 0)
- `node scripts/deck_study.js` after any engine change: every cEDH list above every precon
- Browser: both languages and themes, phone width, no console errors, then the live page after pushing

## Open questions for Jorge
- Which of the 13 decks Jorge has not placed read wrongly? Eight sit at 4.1, the weakest part of the scale.
- Does Korvold (7.9) or Winota (7.0) belong among the cEDH lists? Both score below the rest.
- Do the card values read right on the pod's decks? Massacre Wurm reads Marginal in Teysha, for example. Weights are in `engine/cardValue.js`.
- The deck study's four rule proposals, and Jorge's in/out marks, are still unanswered (`data/deck_study.json`, `docs/`).
- Are the Lightning and Luffy commander tags right?
