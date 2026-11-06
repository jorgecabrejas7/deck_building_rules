// ---- goldfish hands: the state of one solo game, played by hand ----
// Every operation returns a new game. No rules are enforced: the player decides.
// turn 0 is the opening hand; toBottom counts the cards still owed after a kept mulligan.
import { manaProduced } from "./ramp.js";
import { shuffled } from "./goldfish.js";

export const LAST_TURN = 8;
export const MAX_MULLIGANS = 7;
const front = (n) => String(n).split(" // ")[0];
const without = (zone, i) => zone.filter((_, k) => k !== i);

// shortcut: manaProduced adds up "{G} or {U}" as 2 and the simulation's numbers rest on that, so
// a choice of colours is read as 1 here; fix it there if power may move. Costs ({1},{T}) are not netted.
function sourceMana(card) {
  return /add [^.\n]* or /i.test(card.oracle_text || "") ? 1 : Math.max(manaProduced(card), 1);
}

// read: readCard for this deck, so a rock means the same here as in the profile.
export function gameCards({ cardsInfo, commanders, read }) {
  const zone = new Set((commanders || []).map(front));
  const out = { library: [], command: [] };
  for (const x of cardsInfo) {
    const land = x.cls.type === "L";
    const mana = land || read(x).rock || read(x).dork ? sourceMana(x.card) : 0;
    for (let i = 0; i < x.qty; i++) {
      const commander = i === 0 && zone.has(front(x.name));
      (commander ? out.command : out.library).push({ name: x.name, mana, commander });
    }
  }
  return out;
}

export function newGame({ library, command }, random = Math.random) {
  const deck = shuffled(library, random);
  return { turn: 0, mulligans: 0, toBottom: 0, hand: deck.slice(0, 7), library: deck.slice(7), command, battlefield: [] };
}

export function mulligan(g, random = Math.random) {
  if (g.mulligans >= MAX_MULLIGANS) return g;
  const deck = shuffled([...g.hand, ...g.library], random);
  return { ...g, mulligans: g.mulligans + 1, hand: deck.slice(0, 7), library: deck.slice(7) };
}

export const keep = (g) => (g.mulligans ? { ...g, toBottom: g.mulligans } : { ...g, turn: 1 });

export function bottom(g, i) {
  const toBottom = g.toBottom - 1;
  return { ...g, toBottom, turn: toBottom ? 0 : 1, hand: without(g.hand, i), library: [...g.library, g.hand[i]] };
}

export function nextTurn(g) {
  if (g.turn >= LAST_TURN) return g;
  return { ...g, turn: g.turn + 1, hand: [...g.hand, ...g.library.slice(0, 1)], library: g.library.slice(1) };
}

export const play = (g, i) => ({ ...g, hand: without(g.hand, i), battlefield: [...g.battlefield, g.hand[i]] });
export const cast = (g, i) => ({ ...g, command: without(g.command, i), battlefield: [...g.battlefield, g.command[i]] });

export function giveBack(g, i) {
  const c = g.battlefield[i], rest = { ...g, battlefield: without(g.battlefield, i) };
  return c.commander ? { ...rest, command: [...g.command, c] } : { ...rest, hand: [...g.hand, c] };
}

export const manaAvailable = (g) => g.battlefield.reduce((sum, c) => sum + c.mana, 0);
