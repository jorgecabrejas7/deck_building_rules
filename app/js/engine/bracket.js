// ---- Commander Brackets ----
// Wizards' bracket system, checked alongside — and independently of — the pod's
// point budget. A deck can blow the pod budget and still be a perfectly legal
// Bracket 3 deck, which is what most other tables ask for, so the two verdicts
// are reported side by side and never fold into each other.
//
// Two reads, because the brackets are guidance rather than law:
//   · The checklist. Each barometer the brackets name (Game Changers, mass land
//     denial, extra turns, combos) lands on a bracket, and the deck sits at the
//     highest one. This read decides the Bracket 3 verdict:
//       – up to three cards from the Game Changers list
//       – no mass land denial, by card or by combo
//       – extra turns in low quantities, never chained or looped, by card or by combo
//       – no combo that Commander Spellbook places at Bracket 4+
//       – ordinary Commander legality
//   · Commander Spellbook's estimate for the whole deck, reported beside it. A
//     stronger estimate is a warning, not a fail.
// Which bracket a combo belongs to is ALWAYS Spellbook's call, never ours.
// A list cannot prove intent, so the checklist tops out at "4" (Bracket 5 is about
// the competitive metagame) and bottoms out at "2" (Bracket 1 is about theme).

import { REMINDER_TEXT_RE } from "./stats.js";
import { isLegalCommander } from "./commander.js";

export const BRACKET3 = {
  // A two-card line playable on a mana curve up to this per turn is Bracket 4. Permanents
  // can land on separate turns, so the total does not protect a 7+ mana pair.
  fast_pair_turn_mana: 6, // a tip only: at 7+ a turn the line stops being playable on curve
  game_changers_max: 3,
  // "Low quantities" — one or two one-shot extra turns read as a build-around,
  // three or more read as a turns deck.
  extra_turns_max: 2,
};

// Spellbook's bracket tags, strongest first. `bracket` is its own label for what
// the tag means; `level` is the number its search syntax files the tag under.
export const COMBO_TAGS = {
  R: { name: "Ruthless", bracket: "4+", level: 4 },
  S: { name: "Spicy", bracket: "3–4", level: 3 },
  P: { name: "Powerful", bracket: "3+", level: 3 },
  O: { name: "Oddball", bracket: "2–3", level: 2 },
  C: { name: "Core", bracket: "2+", level: 2 },
  E: { name: "Exhibition", bracket: "1+", level: 1 },
  B: { name: "Banned", bracket: "—", level: 0 },
};
const TAG_ORDER = ["B", "R", "S", "P", "O", "C", "E"];
export const tagRank = (tag) => TAG_ORDER.indexOf(tag);

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
const front = (n) => String(n).split(" // ")[0];

function putsItselfBack(card, oracle) {
  const self = "(?:it|this card|" + escapeRe(front(card.name)) + ")";
  return new RegExp("(?:shuffle|put|return)\\s+" + self + "\\b[^.]{0,70}(?:library|hand)", "i").test(oracle);
}

function loopsTurns(card, loopList) {
  if (!card) return false;
  if (loopList.has(card.name) || loopList.has(front(card.name))) return true;
  // reminder text is stripped everywhere else in the engine, so Buyback has to
  // be read off the keyword list — its rules text lives only in parentheses
  const buyback = (card.keywords || []).some(k => k.toLowerCase() === "buyback");
  const oracle = (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
  if (!/extra turn/i.test(oracle)) return false;
  if (buyback || putsItselfBack(card, oracle) || ACTIVATED_TURN_RE.test(oracle)) return true;
  return RECURRING_TRIGGER_RE.test(oracle) && !CONSUMES_SELF_RE.test(oracle);
}

// The combo database names cards by their front face, while the card cache is
// keyed by the full Scryfall name ("Expansion // Explosion"), so pricing a
// combo needs a front-face index — without it every split, modal and
// transforming piece resolves to nothing, and a combo that silently scores 0
// mana always looks early.
function frontFaceIndex(db) {
  const idx = new Map();
  for (const key of Object.keys(db)) {
    const card = db[key];
    if (!card) continue;
    const name = front(card.name || key);
    if (!idx.has(name)) idx.set(name, card);
  }
  return idx;
}

// Everything it takes to start the combo: casting each piece (slot fillers
// included) plus the extra mana Spellbook says it needs on top. Shown to the
// player, never used to judge. null when a piece cannot be priced: an unknown
// cost must never read as free.
function comboDeploy(combo, db, idx) {
  let mv = combo.extraMana || 0;
  for (const n of [...combo.cards, ...(combo.filled || [])]) {
    const c = db[n] || idx.get(front(n));
    if (!c || typeof c.cmc !== "number") return null;
    mv += c.cmc;
  }
  return mv;
}

// The most mana the combo needs in a single turn. Permanents can come down on earlier
// turns, so the dearest of them sets the bar; spells must all be cast when it happens,
// along with any extra mana it needs. null when a piece cannot be priced.
function comboTurnCost(combo, db, idx) {
  let dearest = 0, spells = 0;
  for (const n of [...combo.cards, ...(combo.filled || [])]) {
    const c = db[n] || idx.get(front(n));
    if (!c || typeof c.cmc !== "number") return null;
    if (/Instant|Sorcery/.test(String(c.type_line).split(" // ")[0])) spells += c.cmc;
    else dearest = Math.max(dearest, c.cmc);
  }
  return Math.max(dearest, spells) + (combo.extraMana || 0);
}

// Spellbook's classification of one combo, now that the commander is known
// (spellbook/models/variant.py: estimate_bracket). Its published tag cannot know:
// it treats every legend as a possible commander, which overrates a combo whose
// legend sits in the 99 and underrates one that really runs through the command zone.
// shortcut: the export lacks Spellbook's mana-accuracy flag and library-zone pieces,
// so speed can be one step off on those rows; export them here if they ever matter.
function deckTag(c, cardsToFind, pieces) {
  const arguable = (c.prereq ? 1 : 0) + (c.relevant || c.contextual ? 0 : 1);
  const definitelyTwo = cardsToFind + arguable <= 2;
  const arguablyTwo = cardsToFind <= 2 && cardsToFind + arguable <= 3;
  const borderline = c.relevant || c.contextual;
  const m = c.extraMana;
  const speed = m === 0 ? 5 : m <= 4 ? 4 : m <= 6 ? 3 : m <= 8 ? 2 : 1;
  // "controls all opponents" and "controls some" share a flag; only the first is published as R
  if (pieces.gc > BRACKET3.game_changers_max || pieces.turns >= 2 || pieces.mld || c.infiniteTurns || c.landDenial ||
      (c.controlsOpponents && c.tag === "R") || (speed >= 4 && c.relevant && definitelyTwo)) return "R";
  if ((speed >= 4 && ((c.relevant && arguablyTwo) || (borderline && definitelyTwo))) ||
      c.lock || c.skipTurns || c.controlsOpponents) return "S";
  if ((speed >= 3 && c.relevant && definitelyTwo) || pieces.gc) return "P";
  if (speed >= 3 && borderline && arguablyTwo) return "O";
  if (pieces.turns || (speed >= 2 && c.relevant && definitelyTwo)) return "C";
  return "E";
}

// Deckbuilding notes that are true rules violations, not just warnings: a deck
// that breaks these is not a legal Commander deck in any bracket.
const LEGALITY_IDS = new Set(["count", "singleton", "identity", "banned_official"]);

// The strongest combo tag, and the card rules Spellbook's estimator applies on
// top of the tags (spellbook/models/variant.py: estimate_bracket).
function spellbookEstimate({ gc, mldCards, extraTurnCards, combos, banned }) {
  if (banned) return "B";
  let best = "E";
  const raise = (tag) => { if (tagRank(tag) < tagRank(best)) best = tag; };
  for (const c of combos) raise(c.tag === "B" ? "E" : c.tag);
  if (extraTurnCards) raise("C");
  if (gc) raise("P");
  if (gc > BRACKET3.game_changers_max || extraTurnCards >= 2 || mldCards) raise("R");
  return best;
}

// What it takes to fit Bracket 3. Named cuts for what has no alternative (land
// denial, looping turns) and a greedy pass over the breaking combos: cut the card
// that breaks the most, preferring anything but the commander. Greedy can miss the
// true minimum on tangled combo webs, but every list it returns does fit. Counted
// limits stay a choice for the player: "cut 2 of these", after the named cuts.
function cutsToFit({ combos, mld, turnCards, looped, gcCards, commanders }) {
  const zone = new Set((commanders || []).map(front));
  const cuts = [];
  const cut = (card, reason, combosBroken = 0) => {
    const found = cuts.find(x => x.card === card);
    if (found) { found.reasons.push(reason); found.combos += combosBroken; return; }
    cuts.push({ card, reasons: [reason], combos: combosBroken });
  };
  const gone = (n) => cuts.some(x => x.card === n);

  for (const n of mld) cut(n, "mass_land_denial");
  for (const n of looped) cut(n, "extra_turns");

  let open = combos.filter(c => !c.cards.some(n => cuts.some(x => front(x.card) === n)));
  while (open.length) {
    const score = new Map();
    for (const c of open) for (const n of c.cards) {
      // a commander is what the deck is built around: the last card to give up
      const weight = (zone.has(n) ? 0.001 : 1) + (gcCards.some(g => front(g) === n) ? 0.1 : 0);
      score.set(n, (score.get(n) || 0) + weight);
    }
    const [best] = [...score].sort((a, b) => b[1] - a[1])[0];
    const broken = open.filter(c => c.cards.includes(best));
    cut(best, "combos", broken.length);
    open = open.filter(c => !c.cards.includes(best));
  }

  const left = (list) => list.filter(n => !gone(n) && !gone(front(n)));
  const over = (id, list, max) => list.length > max ? [{ id, count: list.length - max, from: list }] : [];
  return { cards: cuts, choices: [
    ...over("game_changers", left(gcCards), BRACKET3.game_changers_max),
    ...over("extra_turns", left(turnCards), BRACKET3.extra_turns_max),
  ] };
}

// combos: active combos for this deck, or null while the combo check has not run
// — the criteria that depend on them then report as pending instead of passing.
// comboDb: the DB's card lists (mass_land_denial, extra_turn), null until loaded.
// landDenial: data/land_denial.json, our sorted read of which of those really are mass land denial.
// loopCards: card names known to chain extra turns (the pod rules already keep
// this list; passing it in keeps this module free of the pod's rules shape).
// unresolved: how many cards Scryfall could not identify — a deck missing a
// card only because of a typo is not an illegal deck.
export function evaluateBrackets({ stats, flagged, deckNames, combos, comboDb, landDenial, commanders, db, validation, loopCards, unresolved = 0 }) {
  const loopList = new Set(loopCards || []);
  const pendingCombos = !combos;
  const list = combos || [];
  const idx = frontFaceIndex(db);

  const zone = new Set((commanders || []).map(front));
  const mldSet = new Set((landDenial && landDenial.mass) || []);
  // Spellbook flags cards that only sometimes deny lands (a loyalty ability, a colour hoser):
  // those are worth a warning, and a card we haven't sorted yet gets the same benefit of the doubt.
  const mldMaybe = new Set([...((comboDb && comboDb.mass_land_denial) || []), ...((landDenial && landDenial.maybe) || [])].filter(n => !mldSet.has(n)));
  const turnSet = new Set((comboDb && comboDb.extra_turn) || []);

  const rated = list.map(c => {
    const named = c.cards.map(n => db[n] || idx.get(front(n)));
    const cardsToFind = c.n - c.cards.filter(n => zone.has(n)).length;
    // No piece could be a commander: the published tag already holds, and it keeps
    // any correction Spellbook's editors made by hand.
    const dependsOnSeat = c.tag !== "B" && named.some(card => card && isLegalCommander(card));
    const tag = !dependsOnSeat ? c.tag : deckTag(c, cardsToFind, {
      gc: named.filter(card => card && card.game_changer).length,
      turns: c.cards.filter(n => turnSet.has(n)).length,
      mld: c.cards.some(n => mldSet.has(n)),
    });
    const turnCost = comboTurnCost(c, db, idx);
    // Spellbook alone rates a combo. Two cards playable on curve is a tip for the player, nothing more.
    const fastPair = c.n === 2 && c.relevant && (c.infinite || c.win) && turnCost !== null && turnCost <= BRACKET3.fast_pair_turn_mana;
    return { ...c, tag, cardsToFind, deploy: comboDeploy(c, db, idx), turnCost, fastPair };
  });

  const checks = [];

  // ---- Game Changers ----
  const gcCards = (flagged.game_changers || []).map(([n]) => n);
  const gc = stats.game_changers || 0;
  checks.push({ id: "game_changers", ok: gc <= BRACKET3.game_changers_max, value: gc,
    max: BRACKET3.game_changers_max, cards: gcCards, level: gc > BRACKET3.game_changers_max ? 4 : gc ? 3 : 2 });

  // ---- mass land denial: the sorted list catches what oracle text alone
  // cannot (Winter Orb, Upheaval), and combos can do it too ----
  const mldCards = (flagged.mass_land_denial || []).map(([n]) => n).filter(n => !mldMaybe.has(front(n)));
  const landMaybe = deckNames.filter(n => mldMaybe.has(front(n)));
  for (const n of deckNames) if (mldSet.has(front(n)) && !mldCards.includes(n)) mldCards.push(n);
  const mldCombos = rated.filter(c => c.landDenial);
  checks.push({ id: "mass_land_denial", ok: !mldCards.length && !mldCombos.length, value: mldCards.length + mldCombos.length,
    cards: mldCards, combos: mldCombos, pending: pendingCombos || !comboDb,
    level: mldCards.length || mldCombos.length ? 4 : 2 });

  // ---- extra turns ----
  const turnCards = (flagged.extra_turns || []).map(([n]) => n);
  for (const n of deckNames) if (turnSet.has(front(n)) && !turnCards.includes(n)) turnCards.push(n);
  const looped = turnCards.filter(n => loopsTurns(db[n], loopList));
  const turnCombos = rated.filter(c => c.infiniteTurns);
  const turns = turnCards.length;
  const turnsOk = !looped.length && !turnCombos.length && turns <= BRACKET3.extra_turns_max;
  checks.push({ id: "extra_turns", ok: turnsOk, value: turns, max: BRACKET3.extra_turns_max,
    cards: turnCards, looped, combos: turnCombos, pending: pendingCombos,
    level: turnsOk ? 2 : 4 });

  // ---- combos: Spellbook's tag decides. "Spicy" spans Brackets 3 and 4, so it
  // fits with a warning; only what it places at 4+ breaks Bracket 3 ----
  const tooStrong = rated.filter(c => c.tag === "R");
  const borderline = rated.filter(c => c.tag === "S");
  checks.push({ id: "combos", ok: !tooStrong.length, pending: pendingCombos, combos: tooStrong, borderline,
    level: Math.max(2, ...rated.map(c => COMBO_TAGS[c.tag].level)) });

  // ---- legality ----
  // A card the lookup could not identify shrinks the deck's countable size, so
  // the 100-card rule would fail on a typo rather than on an illegal deck.
  const issues = (validation || []).filter(v => LEGALITY_IDS.has(v.id) && !(v.id === "count" && unresolved));
  checks.push({ id: "legality", ok: !issues.length, issues, level: 0 });

  // ---- worth saying out loud, without breaking any written rule ----
  const locks = rated.filter(c => c.lock || c.skipTurns || c.controlsOpponents);

  const failed = checks.filter(c => !c.ok);
  const pending = checks.some(c => c.pending && c.ok);
  const checklist = Math.max(...checks.map(c => c.level));
  const banned = issues.some(v => v.id === "banned_official");
  const estimate = spellbookEstimate({ gc, mldCards: mldCards.length, extraTurnCards: turns, combos: rated, banned });

  // Only what breaks Bracket 3 goes on the cut list.
  const breaking = [...tooStrong, ...mldCombos, ...turnCombos];
  const cuts = cutsToFit({ combos: [...new Set(breaking)], mld: mldCards, turnCards, looped, gcCards, commanders });

  // Land denial puts a deck in Bracket 4 whatever its power says. A deck can be Bracket 4 without being strong.
  const floorCuts = cutsToFit({ combos: mldCombos, mld: mldCards, turnCards: [], looped: [], gcCards: [], commanders }).cards;
  const floor = mldCards.length || mldCombos.length ? { bracket: 4, reason: "mld",
    mld: [...mldCards, ...mldCombos.map(c => c.cards.join(" + "))],
    cuts: floorCuts.map(c => ({ card: front(c.card), reason: "mld" })) } : null;

  return {
    floor, landMaybe, checks, failed: failed.map(c => c.id), pending,
    fits: !failed.length,
    checklist,                    // Wizards' read: 2..4
    estimate,                     // Spellbook's read: a COMBO_TAGS key
    legal: !issues.length,
    combos: rated.sort((a, b) => tagRank(a.tag) - tagRank(b.tag) || a.n - b.n || (a.deploy ?? 99) - (b.deploy ?? 99)),
    locks,
    cuts,
  };
}
