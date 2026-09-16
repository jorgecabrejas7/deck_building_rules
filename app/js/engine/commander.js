// ---- commander identification ----
// Who sits in the command zone decides the deck's colour identity, its EDHREC
// synergy page and half the advice, so it is worth getting right: the deck's
// own colours pick the legend, and the user can overrule the guess with any
// card in the list that is a legal commander.

const frontFace = (s) => String(s || "").split(" // ")[0];
const kws = (card) => (card.keywords || []).map(k => k.toLowerCase());

// A card can lead a deck on its own when it is a legendary creature, when it
// says so outright ("can be your commander" — the planeswalker commanders),
// or when it is a creature everywhere except the battlefield (Grist).
export function isLegalCommander(card) {
  if (!card || card.legal_commander === "banned" || card.legal_commander === "not_legal") return false;
  const front = frontFace(card.type_line);
  if (!front.includes("Legendary")) return /can be your commander/i.test(card.oracle_text || "");
  if (front.includes("Creature")) return true;
  const o = card.oracle_text || "";
  return /can be your commander/i.test(o) || /isn't on the battlefield, it's a [^.]*creature/i.test(o);
}

// Backgrounds are legal in the command zone, but only as somebody's second half.
export function isBackground(card) {
  return !!card && /\bBackground\b/.test(card.type_line || "");
}

// Every way a card is allowed to share the command zone. One card can offer
// several (Amy Pond has both Partner and Doctor's companion).
export function pairKinds(card) {
  const out = [];
  if (!card) return out;
  const k = kws(card);
  if (k.includes("partner")) out.push("partner"); // "Partner with X" also grants plain Partner
  if (k.includes("friends forever")) out.push("friends");
  if (k.includes("doctor's companion")) out.push("companion");
  if (k.includes("choose a background")) out.push("chooser");
  if (/\bTime Lord\b/.test(card.type_line || "") && /\bDoctor\b/.test(card.type_line || "")) out.push("doctor");
  if (isBackground(card)) out.push("background");
  return out;
}

const PAIRS = [["partner", "partner"], ["friends", "friends"], ["companion", "doctor"], ["chooser", "background"]];

export function canPair(a, b) {
  if (!a || !b || a.name === b.name) return false;
  const ka = pairKinds(a), kb = pairKinds(b);
  return PAIRS.some(([x, y]) => (ka.includes(x) && kb.includes(y)) || (ka.includes(y) && kb.includes(x)));
}

// EVERY card in the deck, each with its command-zone eligibility, so the picker
// can show the whole list rather than a shortlist the user has to take on
// trust. kind: "solo" leads alone, "second" (a Background) only joins one that
// can, "banned" is on the Commander ban list, "ineligible" is everything else.
export function commanderOptions(entries, db) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (seen.has(e.name)) continue;
    const card = db[e.name];
    if (!card) continue;
    seen.add(e.name);
    const kind = card.legal_commander === "banned" ? "banned"
      : isLegalCommander(card) ? "solo"
      : isBackground(card) ? "second"
      : "ineligible";
    out.push({ name: e.name, card, kind, solo: kind === "solo" });
  }
  return out;
}

// The subset that may actually sit in the command zone — what the detection
// and the pick validation reason over.
export function commanderCandidates(entries, db) {
  return commanderOptions(entries, db).filter(c => c.kind === "solo" || c.kind === "second");
}

const identityOf = (card) => new Set(card.color_identity || []);
const coversAll = (outer, inner) => [...inner].every(c => outer.has(c));

function restIdentity(entries, db, exclude) {
  const set = new Set();
  for (const e of entries) {
    if (exclude.has(e.name)) continue;
    const c = db[e.name];
    if (c) for (const col of c.color_identity || []) set.add(col);
  }
  return set;
}

// Keeps only the names that really can lead THIS deck together, so a stale
// pick (saved session, edited list) degrades to auto-detection instead of
// poisoning the colour-identity check. The card that CAN lead alone always
// takes the first seat: a declared list is not ordered (Archidekt's follows
// its arbitrary card order), so a Background listed first must not knock out
// the creature that chose it, nor end up named as "the" commander.
export function normalizeCommanders(names, entries, db) {
  const cands = new Map(commanderCandidates(entries, db).map(c => [c.name, c]));
  const listed = [];
  for (const n of names || []) {
    const c = cands.get(n);
    if (c && !listed.includes(c)) listed.push(c);
  }
  const lead = listed.find(c => c.solo);
  if (!lead) return [];
  const second = listed.find(c => c !== lead && canPair(lead.card, c.card));
  return second ? [lead.name, second.name] : [lead.name];
}

// Auto-detection. A declared Commander section (text header or Archidekt
// category) always wins. Otherwise the deck's own colours pick the legend: a
// commander has to cover the colour identity of all 99, and among the legends
// that do, the tightest fit is the one the list was built around — list order
// (the precon convention — exports list the command zone first) only breaks
// ties, and a pair is ranked by the later of its two positions, so a genuine
// partner pair at the top of the list beats a coincidental legend further down.
export function pickCommanders(parsed, db) {
  const entries = parsed.entries.filter(e => db[e.name]);
  const declared = normalizeCommanders(parsed.commanders, entries, db);
  if (declared.length) return declared;

  const cands = commanderCandidates(entries, db);
  const options = [];
  cands.forEach((c, i) => {
    if (!c.solo) return;
    options.push(score([c], i));
  });
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i], b = cands[j];
      if ((!a.solo && !b.solo) || !canPair(a.card, b.card)) continue;
      // solo-first: commanders[0] is what the report, the EDHREC/Spellbook
      // links and the table-mode label name, and a Background is never that
      options.push(score(a.solo ? [a, b] : [b, a], Math.max(i, j)));
    }
  }
  if (!options.length) return [];
  options.sort((x, y) => (y.covers - x.covers) || (x.missing - y.missing) || (x.size - y.size) || (x.order - y.order));
  return options[0].names;

  function score(group, order) {
    const ci = new Set(group.flatMap(g => [...identityOf(g.card)]));
    const rest = restIdentity(entries, db, new Set(group.map(g => g.name)));
    return {
      names: group.map(g => g.name), order, size: ci.size,
      covers: coversAll(ci, rest) ? 1 : 0,
      missing: [...rest].filter(c => !ci.has(c)).length,
    };
  }
}
