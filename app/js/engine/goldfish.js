// ---- goldfish: how the deck develops if nobody interferes ----
// A seeded simulation, so the same list always gets the same numbers. It estimates
// tempo only: no opponents, no politics, and no pilot choosing the better play.
// shortcut: only cheap one-shot draw digs for cards, and rituals add nothing, so it runs a
// little slow on draw engines and storm lists; model them if turns look off on those decks.
import { manaProduced } from "./ramp.js";

const TURNS = 12;
const front = (n) => String(n).split(" // ")[0];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(cards, random) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

// combos: { pieces: [names], deploy: total mana }, the lines that can end a game.
// read: readCard for this deck, so ramp means the same here as in the profile.
export function simulateGoldfish({ cardsInfo, commanders, combos = [], read, games = 500, seed = 1 }) {
  const zone = new Set((commanders || []).map(front));
  const random = rng(seed);
  const library = [];
  let commanderCost = null;
  for (const x of cardsInfo) {
    const name = front(x.card.name || x.name);
    const r = read(x);
    if (zone.has(name)) { commanderCost = commanderCost === null ? x.card.cmc || 0 : Math.min(commanderCost, x.card.cmc || 0); continue; }
    const card = { name, cmc: x.card.cmc || 0, land: x.cls.type === "L", rock: r.rock, dork: r.dork, landRamp: r.landRamp,
      prod: Math.max(manaProduced(x.card), 1), tutor: r.tutor,
      cantrip: r.draw && (x.card.cmc || 0) <= 2 && (x.cls.type === "I" || x.cls.type === "S") };
    for (let i = 0; i < x.qty; i++) library.push(card);
  }
  const lines = combos.slice(0, 30);
  const manaTotals = Array(TURNS).fill(0);
  const commanderTurns = [], winTurns = [];

  for (let g = 0; g < games; g++) {
    let deck = shuffled(library, random);
    // one mulligan for a hand no one would keep
    const landsIn = (cards) => cards.filter(c => c.land).length;
    if (landsIn(deck.slice(0, 7)) < 2 || landsIn(deck.slice(0, 7)) > 5) deck = shuffled(library, random);
    const hand = deck.slice(0, 7);
    let next = 7, lands = 0, sources = 0, pendingSources = 0, pendingLands = 0, tutors = 0, lastMana = 0;
    let commanderCast = commanderCost === null, winTurn = null;
    const seen = new Set([...zone, ...hand.map(c => c.name)]);

    for (let turn = 1; turn <= TURNS; turn++) {
      if (turn > 1 && next < deck.length) { const c = deck[next++]; hand.push(c); seen.add(c.name); }
      sources += pendingSources; lands += pendingLands; pendingSources = 0; pendingLands = 0;
      const land = hand.findIndex(c => c.land);
      if (land >= 0) { hand.splice(land, 1); lands++; }
      const mana = lands + sources;
      let available = mana;

      for (const c of hand.filter(k => k.rock || k.dork || k.landRamp).sort((a, b) => a.cmc - b.cmc)) {
        if (c.cmc > available) break;
        available -= c.cmc;
        hand.splice(hand.indexOf(c), 1);
        if (c.rock) { sources += c.prod; available += c.prod; }
        else if (c.dork) pendingSources += c.prod;
        else pendingLands++;
      }
      for (const c of hand.filter(k => k.cantrip).sort((a, b) => a.cmc - b.cmc)) {
        if (c.cmc > available || next >= deck.length) break;
        available -= c.cmc;
        hand.splice(hand.indexOf(c), 1);
        const drawn = deck[next++];
        hand.push(drawn); seen.add(drawn.name);
      }
      // the cantrips may have found the land drop this turn was missing
      if (land < 0) {
        const late = hand.findIndex(c => c.land);
        if (late >= 0) { hand.splice(late, 1); lands++; available++; }
      }
      if (!commanderCast && commanderCost <= available) {
        available -= commanderCost; commanderCast = true; commanderTurns.push(turn);
      }
      for (const c of hand.filter(k => k.tutor).sort((a, b) => a.cmc - b.cmc)) {
        if (c.cmc > available) break;
        available -= c.cmc; tutors++;
        hand.splice(hand.indexOf(c), 1);
      }
      const made = lands + sources;
      manaTotals[turn - 1] += made;
      if (winTurn === null && lines.some(l =>
        l.pieces.filter(p => !seen.has(p)).length <= tutors && made + lastMana >= l.deploy)) winTurn = turn;
      lastMana = made;
    }
    if (winTurn !== null) winTurns.push(winTurn);
  }

  const byTurn = (turn) => Math.round(winTurns.filter(x => x <= turn).length / games * 100);
  return {
    games,
    mana: manaTotals.map(total => Math.round(total / games * 10) / 10),
    commanderTurn: median(commanderTurns),
    winTurn: winTurns.length * 2 >= games ? median(winTurns) : null,
    winBy: lines.length ? { 4: byTurn(4), 6: byTurn(6), 8: byTurn(8), 10: byTurn(10) } : null,
  };
}

// The chance of having seen at least one of `copies` cards after seeing `seen` of `deck`.
export function drawOdds(deck, copies, seen) {
  if (copies <= 0) return 0;
  let miss = 1;
  for (let i = 0; i < Math.min(seen, deck); i++) miss *= Math.max(deck - copies - i, 0) / (deck - i);
  return 1 - miss;
}
