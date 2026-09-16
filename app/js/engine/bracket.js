// ---- Commander Brackets: Bracket 3 "Upgraded" ----
// Wizards' bracket system, checked alongside — and independently of — the pod's
// point budget. A deck can blow the pod budget and still be a perfectly legal
// Bracket 3 deck, which is what most other tables ask for, so the two verdicts
// are reported side by side and never fold into each other.
//
// Bracket 3 (magic.wizards.com, Commander Brackets):
//   · up to three cards from the Game Changers list
//   · no mass land denial
//   · extra-turn cards in low quantities only, never chained in succession or looped
//   · no intentional EARLY-GAME two-card infinite combo (late-game ones are fine)
// plus ordinary Commander legality: 100 singleton cards inside the commander's
// colour identity, nothing on the official ban list.

import { REMINDER_TEXT_RE } from "./stats.js";

export const BRACKET3 = {
  game_changers_max: 3,
  // "Low quantities" — one or two one-shot extra turns read as a build-around,
  // three or more read as a turns deck.
  extra_turns_max: 2,
  // "Early game" is roughly the first six turns, so a two-card combo whose
  // halves together cost six mana or less is assumed to land inside it.
  early_combo_mana: 6,
};

// A one-shot extra-turn spell is fine; what the bracket rules out is a card
// that takes turns over and over. Four shapes say "again next turn" in print:
//   · the spell puts itself back into the library or hand (Beacon of Tomorrows,
//     Nexus of Fate) — so it is cast again every turn;
//   · Buyback does the same by rule (Walk the Aeons);
//   · the turn comes off an activated ability, which can simply be activated
//     again (Magistrate's Scepter, Sage of Hours, Timestream Navigator);
//   · the turn comes off a recurring upkeep/end-step trigger that does not
//     consume its own source (Lighthouse Chronologist, Timesifter).
// Everything else stays a one-shot: a combat-damage trigger that forbids
// attacking during the turns it grants (Medomai), a cast trigger (Emrakul), a
// trigger that sacrifices its own permanent (Second Chance). The curated list
// covers the long tail this cannot read off the card.
const ACTIVATED_TURN_RE = /^[^\n]*?:[^\n]*extra turn/im;
const RECURRING_TRIGGER_RE = /^at the beginning of[^\n]*extra turn/im;
const CONSUMES_SELF_RE = /sacrifice (?:this|it)\b/i;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function putsItselfBack(card, oracle) {
  const self = "(?:it|this card|" + escapeRe(String(card.name).split(" // ")[0]) + ")";
  return new RegExp("(?:shuffle|put|return)\\s+" + self + "\\b[^.]{0,70}(?:library|hand)", "i").test(oracle);
}

function loopsTurns(card, loopList) {
  if (!card) return false;
  if (loopList.has(card.name) || loopList.has(String(card.name).split(" // ")[0])) return true;
  // reminder text is stripped everywhere else in the engine, so Buyback has to
  // be read off the keyword list — its rules text lives only in parentheses
  const buyback = (card.keywords || []).some(k => k.toLowerCase() === "buyback");
  const oracle = (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
  if (!/extra turn/i.test(oracle)) return false;
  if (buyback || putsItselfBack(card, oracle) || ACTIVATED_TURN_RE.test(oracle)) return true;
  return RECURRING_TRIGGER_RE.test(oracle) && !CONSUMES_SELF_RE.test(oracle);
}

function comboMana(combo, db) {
  let mv = 0;
  for (const n of combo.cards) {
    const c = db[n] || db[String(n).split(" // ")[0]];
    if (c && typeof c.cmc === "number") mv += c.cmc;
  }
  return mv;
}

// Deckbuilding notes that are true rules violations, not just warnings: a deck
// that breaks these is not a legal Commander deck in any bracket.
const LEGALITY_IDS = new Set(["count", "singleton", "identity", "banned_official"]);

// combos: matchCombos() output, or null while the combo check has not run —
// the combo criterion then reports as pending instead of silently passing.
// loopCards: card names known to chain extra turns (the pod rules already keep
// this list; passing it in keeps this module free of the pod's rules shape).
export function evaluateBracket3({ stats, flagged, combos, db, validation, loopCards }) {
  const loopList = new Set(loopCards || []);
  const checks = [];

  const gc = stats.game_changers || 0;
  checks.push({ id: "game_changers", ok: gc <= BRACKET3.game_changers_max, value: gc,
    max: BRACKET3.game_changers_max, cards: (flagged.game_changers || []).map(([n]) => n) });

  const mld = stats.mass_land_denial || 0;
  checks.push({ id: "mass_land_denial", ok: mld === 0, value: mld,
    cards: (flagged.mass_land_denial || []).map(([n]) => n) });

  const turnCards = (flagged.extra_turns || []).map(([n]) => n);
  const looped = turnCards.filter(n => loopsTurns(db[n], loopList));
  const turns = stats.extra_turns || 0;
  checks.push({ id: "extra_turns", ok: !looped.length && turns <= BRACKET3.extra_turns_max,
    value: turns, max: BRACKET3.extra_turns_max, cards: turnCards, looped });

  const early = combos
    ? combos.filter(c => c.infinite && c.n === 2 && c.cards.length === 2 && comboMana(c, db) <= BRACKET3.early_combo_mana)
        .map(c => ({ cards: c.cards, mana: comboMana(c, db), feature: c.features[0] || "" }))
    : [];
  checks.push({ id: "early_combos", ok: !early.length, pending: !combos,
    max: BRACKET3.early_combo_mana, combos: early });

  const issues = (validation || []).filter(v => LEGALITY_IDS.has(v.id));
  checks.push({ id: "legality", ok: !issues.length, issues });

  const failed = checks.filter(c => !c.ok);
  return {
    checks, failed: failed.map(c => c.id),
    pending: checks.some(c => c.pending && c.ok),
    fits: !failed.length,
  };
}
