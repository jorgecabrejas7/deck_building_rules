// ---- combos: subset match against the same-origin combo DB ----
// comboDb = data/combos.json (format documented in scripts/build_combo_db.py).
// Templates are generic slots ("Creature with Persist or Undying") pre-resolved
// at build time into comboDb.templates[id] = [card names]. A combo only matches
// when every slot is filled by a DIFFERENT deck card not already used by the
// combo itself — so Broodmoth + Ashnod's Altar needs an actual persist/undying
// creature in the list. n counts named cards + template pieces, so compactness
// pricing stays honest.
import { tagRank } from "./bracket.js";

const front = (n) => String(n).split(" // ")[0];

// Fills a row's template slots from the deck and reads it into a combo; null when
// a slot stays empty.
function readRow({ c: cards, r: result, t: tag = "E", m: extraMana = 0, f: flags = "", q: reqs, mc: mustCommand = [] }, names, tpls) {
  const filled = [];
  const tNames = [];
  if (reqs) {
    const used = new Set(cards);
    for (const [qty, tName, tid] of reqs) {
      const list = tpls[String(tid)];
      if (!list) return null;
      let m = 0;
      for (const n of list) {
        if (names.has(n) && !used.has(n)) { used.add(n); filled.push(n); if (++m >= qty) break; }
      }
      if (m < qty) return null;
      tNames.push(tName);
    }
  }
  return { cards, n: cards.length + filled.length, features: [result], tag, extraMana, mustCommand,
    templates: tNames, filled,
    infinite: flags.includes("i"), relevant: flags.includes("r"), contextual: flags.includes("b"),
    win: flags.includes("w"), prereq: flags.includes("p"), infiniteTurns: flags.includes("t"),
    landDenial: flags.includes("d"), lock: flags.includes("l"), skipTurns: flags.includes("k"),
    controlsOpponents: flags.includes("o") };
}

// Rows are sorted by piece count, so the first hit for a set of named cards is
// its most compact form; later ones are the same combo through another slot.
export function matchCombos(deckNames, comboDb) {
  const names = new Set(deckNames.map(front));
  const tpls = comboDb.templates || {};
  const out = [];
  const seen = new Set();
  for (const row of comboDb.combos) {
    if (!row.c.every(n => names.has(n))) continue;
    const key = row.c.join("|");
    if (seen.has(key)) continue;
    const combo = readRow(row, names, tpls);
    if (!combo) continue;
    seen.add(key);
    out.push(combo);
  }
  return out;
}

// A combo whose piece must be the commander does not exist with that card in
// the 99, so the live list depends on who sits in the command zone.
export function activeCombos(list, commanders) {
  const zone = new Set((commanders || []).map(front));
  return list.filter(c => c.mustCommand.every(n => zone.has(n)));
}

// The combos this deck is exactly one named card away from: slots filled from the
// deck, and only those whose must-be-commander pieces already sit in the command zone.
export function nearCombos(deckNames, comboDb, commanders) {
  const names = new Set(deckNames.map(front));
  const tpls = comboDb.templates || {};
  const out = [];
  const seen = new Set();
  for (const row of comboDb.combos) {
    let missing = null, absent = 0;
    for (const n of row.c) {
      if (names.has(n)) continue;
      missing = n;
      if (++absent > 1) break;
    }
    if (absent !== 1) continue;
    const key = row.c.join("|");
    if (seen.has(key)) continue;
    const combo = readRow(row, names, tpls);
    if (!combo) continue;
    seen.add(key);
    out.push({ ...combo, missing });
  }
  return activeCombos(out, commanders);
}

// By missing card: the card opening most combos first, then the one with Spellbook's
// strongest tag. Each card's own combos run in that same tag order.
export function groupNear(list) {
  const byCard = new Map();
  for (const c of list) {
    if (!byCard.has(c.missing)) byCard.set(c.missing, []);
    byCard.get(c.missing).push(c);
  }
  return [...byCard].map(([card, combos]) => ({ card, combos: combos.sort((a, b) => tagRank(a.tag) - tagRank(b.tag)) }))
    .sort((a, b) => b.combos.length - a.combos.length || tagRank(a.combos[0].tag) - tagRank(b.combos[0].tag));
}

// Only cards this deck could legally run: inside the commanders' colours and legal in Commander.
export function nearPlayable(groups, db, commanders) {
  const identity = new Set(commanders.flatMap(n => db[n] ? db[n].color_identity : []));
  return groups.filter(({ card }) => db[card] && db[card].legal_commander === "legal" && db[card].color_identity.every(c => identity.has(c)));
}
