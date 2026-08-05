// ---- infinite combos: subset match against the same-origin combo DB ----
// comboDb = data/combos.json ({combos: [[names...], result]}); names are
// front-face names, same normalization as below.
export function matchCombos(deckNames, comboDb) {
  const names = new Set(deckNames.map(n => n.split(" // ")[0]));
  const out = [];
  for (const [cards, result] of comboDb.combos) {
    let all = true;
    for (const c of cards) if (!names.has(c)) { all = false; break; }
    if (all) out.push({ cards, n: cards.length, features: [result], infinite: true });
  }
  return out;
}
