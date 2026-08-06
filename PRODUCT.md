# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: the players of Jorge's Commander pod, checking a deck against the shared pod rules before game night — mostly on their phones, Spanish-first. Jorge is the rules maintainer and secondary power user (calibrating rules, comparing table matchups).

## Product Purpose

The Pod Deck Checker ("app/" on GitHub Pages) evaluates a pasted Commander decklist against the pod's power rules (rules/pod_rules.json v2) and reports tier, points, and violations. Success carries two jobs with equal weight (confirmed): (1) a verdict players trust enough to settle "is this deck legal for our pod" without arguing, and (2) concrete deck improvement — card suggestions, what-if cut deltas, curve and castability analysis.

## Positioning

An honest, calibrated point-budget system that replaced WotC's brackets: per-dial baselines anchored to all 36 Commander precons, overflow scoring (points never stop counting), hard bans (€30/card cap, fast mana, mass land denial, repeatable extra turns), and cross-dial conditionals. The calibration acceptance test — 0 precons above pod level, ≥30 of 36 in Tier 1 (actual 31/5/0) — is the claim a generic power-level tool cannot truthfully copy.

## Operating Context

- Players export decklists as text from Archidekt/Moxfield and paste them in; both sites block direct browser reads (CORS), so URL import falls back to paste with an opt-in proxy retry for Archidekt. Scryfall is the only API reachable from the browser.
- Card data and Cardmarket EUR prices come from Scryfall at runtime; infinite combos are matched client-side against data/combos.json (distilled weekly from Commander Spellbook's bulk export by a GitHub Action).
- Table mode compares up to 4 decks for balancing a pod.
- Rules changes are made only in rules/pod_rules.json, verified by node scripts/test_engine_parity.js (JS engine must match the Python evaluator on all 36 precons) and python3 scripts/tier_rules.py --calibrate, then committed and pushed (Pages deploys from main).

## Capabilities and Constraints

- Native ES modules, no build step; dev server must run from the repo root so ../rules and ../data fetches resolve.
- app/js/engine/ is a pure DOM-free engine importable by both the browser and the Node parity test; UI is one module per section with a mutate-state-then-renderAll() pattern.
- Zero-install requirement: the product is a shareable link (GitHub Pages), nothing to install.
- Bilingual, Spanish default. Pod terminology is established usage from real table talk: Rampeo, Robo, Removal, Tokens, Go-Wide Tokens (never "Rampa" or "Fichas a lo ancho").
- Mobile support is behind media queries with desktop untouched: ≥44px targets, tap popovers where hover is unavailable.

## Brand Commitments

Current branding is "La guía del Yoryi", but Jorge confirmed branding is flexible — it may evolve or be replaced if a redesign calls for it. The Spanglish pod terminology above is product vocabulary, not branding, and should be preserved.

## Evidence on Hand

- rules/pod_rules.json — the rules themselves, single source of truth.
- Calibration results across all 36 precon decks (31 Tier 1 / 5 Tier 2 / 0 above pod), reproducible via scripts/tier_rules.py --calibrate; combo data for precons in out/precon_decks/combo_analysis.json (12/36 ship infinite combos).
- No testimonials, external users, or press — future surfaces must not fabricate any.

## Product Principles

- Honesty over flattery: the verdict must stay calibrated to the precon anchor set; never soften a tier to please.
- Verdict and advice are co-equal: settling legality and improving the deck deserve equal design weight.
- Zero friction to check: paste → answer, on a phone, in Spanish, with nothing to install.
- One source of truth: rules live in pod_rules.json; engine parity (Python ↔ JS) guards every change.
- Speak the pod's language: real table vocabulary beats correct translation.
