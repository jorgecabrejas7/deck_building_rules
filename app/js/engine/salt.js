// ---- deck salt: EDHREC's community ratings, summed ----
// saltDb = data/salt.json. Each card's rating is the community's 0-4 frustration
// poll; a card nobody rated adds nothing. Informative only, never part of a verdict.
// EDHREC's poll rates basics too (Island 0.92), but nobody salts a deck for running lands.
const BASICS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes",
  "Snow-Covered Plains", "Snow-Covered Island", "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"]);

export function saltScore(names, saltDb) {
  const ratings = saltDb.salt || {};
  const seen = new Set();
  const rated = [];
  for (const name of names) {
    const card = String(name).split(" // ")[0];
    if (seen.has(card)) continue;
    seen.add(card);
    if (ratings[card] && !BASICS.has(card)) rated.push({ name: card, salt: ratings[card] });
  }
  rated.sort((a, b) => b.salt - a.salt || a.name.localeCompare(b.name));
  const total = rated.reduce((s, c) => s + c.salt, 0);
  return { total: Math.round(total * 10) / 10, rated: rated.length,
    average: rated.length ? Math.round(total / rated.length * 100) / 100 : 0, top: rated.slice(0, 8) };
}
