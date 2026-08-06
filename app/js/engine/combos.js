// ---- infinite combos: subset match against the same-origin combo DB ----
// comboDb = data/combos.json; entries are [cards, result] or
// [cards, result, [[qty, templateName, templateId], ...]] where templates are
// generic slots ("Creature with Persist or Undying") pre-resolved at build
// time into comboDb.templates[id] = [card names]. A combo only matches when
// every template slot is filled by a DIFFERENT deck card not already used by
// the combo itself — so Broodmoth + Ashnod's Altar needs an actual
// persist/undying creature in the list. n counts named cards + template
// pieces, so compactness pricing stays honest.
export function matchCombos(deckNames, comboDb) {
  const names = new Set(deckNames.map(n => n.split(" // ")[0]));
  const tpls = comboDb.templates || {};
  const out = [];
  for (const combo of comboDb.combos) {
    const [cards, result, reqs] = combo;
    let all = true;
    for (const c of cards) if (!names.has(c)) { all = false; break; }
    if (!all) continue;
    let extra = 0;
    const tNames = [];
    if (reqs) {
      const used = new Set(cards);
      let ok = true;
      for (const [qty, tName, tid] of reqs) {
        const list = tpls[String(tid)];
        if (!list) { ok = false; break; }
        let m = 0;
        for (const n of list) {
          if (names.has(n) && !used.has(n)) { used.add(n); if (++m >= qty) break; }
        }
        if (m < qty) { ok = false; break; }
        extra += qty; tNames.push(tName);
      }
      if (!ok) continue;
    }
    out.push({ cards, n: cards.length + extra, features: [result], infinite: true, templates: tNames });
  }
  return out;
}
