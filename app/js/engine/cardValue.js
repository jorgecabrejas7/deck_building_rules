// ---- how much each card does for this deck ----
// A reading for the player, never part of a verdict: the pod's points, Wizards' checklist
// and the power level don't read it. What a card costs in points stays beside its value,
// so a weak card that costs points is easy to spot. Scores are our own judgement.
const front = (name) => String(name).split(" // ")[0];

// A card's best job counts in full and its second at half: two jobs beat one, without
// making a modal spell look like a game plan.
const JOBS = { fastMana: 25, tutors: 25, finishers: 25, draw: 15, ramp: 15, answersTotal: 15, engine: 15, protection: 12, recursion: 12, stax: 8 };
const LEVELS = [[70, 5], [45, 4], [25, 3], [12, 2]];
const levelOf = (score) => (LEVELS.find(([min]) => score >= min) || [0, 1])[1];

function fit(row, reasons) {
  if (!row) { reasons.push({ k: "offPlan" }); return 0; }
  const seenIn = row.pd ? row.nd / row.pd : 0;
  reasons.push({ k: "synergy", s: Math.round(row.s * 100), seenIn: Math.round(seenIn * 100) });
  return (row.s >= 0.3 ? 35 : row.s >= 0.1 ? 25 : row.s >= 0 ? 15 : 8) + (seenIn >= 0.4 ? 10 : seenIn >= 0.2 ? 5 : 0);
}

// No page for this commander: how widely the card is played anywhere is the only hint left.
function staple(rank, reasons) {
  const pts = !rank ? 0 : rank < 500 ? 20 : rank < 2000 ? 12 : rank < 8000 ? 6 : 0;
  if (pts >= 12) reasons.push({ k: "staple" });
  return pts;
}

function landScore(x, colours, reasons) {
  const { card } = x;
  if (/\bBasic\b/.test(card.type_line)) { reasons.push({ k: "basic" }); return 30; }
  const makes = (card.produced_mana || []).filter(c => colours.includes(c)).length;
  const fetches = /search your library for an? [^.]*\b(land|plains|island|swamp|mountain|forest)\b/i.test(card.oracle_text || "");
  const oracle = card.oracle_text || "";
  const tapped = /enters (the battlefield )?tapped/i.test(oracle) && !/unless|you may pay/i.test(oracle);
  let score = 25;
  if (fetches) { score += 25; reasons.push({ k: "fetch" }); }
  else if (colours.length > 1 && makes > 1) { score += 20; reasons.push({ k: "fixes", n: makes }); }
  else if (colours.length && !makes) { score -= 15; reasons.push({ k: "noColour" }); }
  if (tapped) { score -= 15; reasons.push({ k: "tapped" }); } else if (makes) score += 10;
  return score;
}

export function cardValues({ cardsInfo, commanders, ledger, combos, table, whatIf = {} }) {
  const zone = new Set((commanders || []).map(front));
  const colours = [...new Set(cardsInfo.filter(x => zone.has(front(x.card.name))).flatMap(x => x.card.color_identity || []))];
  const rows = new Map((table ? table.cards : []).map(c => [c.n, c]));
  const list = combos || [];
  return cardsInfo.map(x => {
    const name = front(x.card.name), isLand = x.cls.type === "L", reasons = [];
    const jobs = Object.keys(JOBS).filter(k => (ledger[k] || []).includes(name)).sort((a, b) => JOBS[b] - JOBS[a]);
    const pieces = list.filter(c => c.cards.includes(name));
    const ends = (ledger.ending || []).includes(name), web = (ledger.web || []).includes(name);
    if (pieces.length) reasons.push({ k: ends ? "comboEnds" : "combo", n: pieces.length });
    let score = (jobs[0] ? JOBS[jobs[0]] : 0) + (jobs[1] ? JOBS[jobs[1]] / 2 : 0)
      + (ends ? 60 : web ? 30 : pieces.length ? 15 : 0)
      + ((ledger.twoCard || []).includes(name) ? 10 : 0) + (pieces.length >= 3 ? 5 : 0);
    const row = rows.get(x.card.name) || rows.get(name);
    if (isLand) {
      score += landScore(x, colours, reasons);
      // a utility land its commander's players pick is doing more than making mana
      if (row && row.s >= 0.1) { score += 15; reasons.push({ k: "synergy", s: Math.round(row.s * 100), seenIn: Math.round((row.pd ? row.nd / row.pd : 0) * 100) }); }
    } else if (!zone.has(name)) {
      score += table ? fit(row, reasons) : staple(x.card.edhrec_rank, reasons);
      if (jobs.length && (x.card.cmc || 0) <= 2) { score += 5; reasons.push({ k: "cheap" }); }
      if ((x.card.cmc || 0) >= 6 && !pieces.length && !jobs.includes("finishers")) { score -= 10; reasons.push({ k: "heavy", n: x.card.cmc }); }
    }
    const commander = zone.has(name);
    const wi = whatIf[x.name];
    return { name: x.name, x, jobs, combos: pieces, reasons, commander,
      score, level: commander ? 5 : levelOf(score),
      points: wi && (wi.dPts > 0 || wi.fixes) ? { saves: Math.max(wi.dPts, 0), fixes: !!wi.fixes } : null };
  }).sort((a, b) => b.commander - a.commander || b.score - a.score || a.name.localeCompare(b.name));
}
