// ---- combos: subset match against the same-origin combo DB ----
// comboDb = data/combos.json (format documented in scripts/build_combo_db.py).
// Templates are generic slots ("Creature with Persist or Undying") pre-resolved
// at build time into comboDb.templates[id] = [card names]. A combo only matches
// when every slot is filled by a DIFFERENT deck card not already used by the
// combo itself — so Broodmoth + Ashnod's Altar needs an actual persist/undying
// creature in the list. n counts named cards + template pieces, so compactness
// pricing stays honest.
const front = (n) => String(n).split(" // ")[0];

// Rows are sorted by piece count, so the first hit for a set of named cards is
// its most compact form; later ones are the same combo through another slot.
export function matchCombos(deckNames, comboDb) {
  const names = new Set(deckNames.map(front));
  const tpls = comboDb.templates || {};
  const out = [];
  const seen = new Set();
  for (const { c: cards, r: result, t: tag = "E", m: extraMana = 0, f: flags = "", q: reqs, mc: mustCommand = [] } of comboDb.combos) {
    if (!cards.every(n => names.has(n))) continue;
    const key = cards.join("|");
    if (seen.has(key)) continue;
    const filled = [];
    const tNames = [];
    if (reqs) {
      const used = new Set(cards);
      let ok = true;
      for (const [qty, tName, tid] of reqs) {
        const list = tpls[String(tid)];
        if (!list) { ok = false; break; }
        let m = 0;
        for (const n of list) {
          if (names.has(n) && !used.has(n)) { used.add(n); filled.push(n); if (++m >= qty) break; }
        }
        if (m < qty) { ok = false; break; }
        tNames.push(tName);
      }
      if (!ok) continue;
    }
    seen.add(key);
    out.push({ cards, n: cards.length + filled.length, features: [result], tag, extraMana, mustCommand,
      templates: tNames, filled,
      infinite: flags.includes("i"), relevant: flags.includes("r"), contextual: flags.includes("b"),
      win: flags.includes("w"), prereq: flags.includes("p"), infiniteTurns: flags.includes("t"),
      landDenial: flags.includes("d"), lock: flags.includes("l"), skipTurns: flags.includes("k"),
      controlsOpponents: flags.includes("o") });
  }
  return out;
}

// A combo whose piece must be the commander does not exist with that card in
// the 99, so the live list depends on who sits in the command zone.
export function activeCombos(list, commanders) {
  const zone = new Set((commanders || []).map(front));
  return list.filter(c => c.mustCommand.every(n => zone.has(n)));
}
