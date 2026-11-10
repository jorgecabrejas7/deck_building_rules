// What-if editing: every change to the analyzed deck goes through here, so the report, the
// paste box and the session follow it. The deck operations themselves are in engine/deckEdit.js.
import * as PodEngine from './engine/index.js';
import { state, cardCache, persistCache } from './state.js';
import { deckToText } from './advice.js';
import { analyze, recompute, checkCombos } from './pipeline.js';
import { renderAll } from './main.js';
import { T, fill } from './i18n.js';
import { $, announce } from './ui/helpers.js';

// The bar compares against the deck as it stood before the first edit, so that first edit waits
// for the combo check that completes those figures. Cheaper printings would move the prices under
// a frozen comparison, so no edit runs during that fetch and the offer hides while edits exist.
export const canEdit = () => state.fetchSt !== 'fetching' &&
  (state.edits.undo.length > 0 || !state.combosData || state.combosData.status !== 'checking');

// The list as a player would paste it, with the command zone the report is using.
export const listText = () => deckToText({ ...state.deck, commanders: state.result.commanders });

async function publish() {
  // the old combo list no longer matches this deck, whatever step it is in
  state.combosData = null;
  recompute();
  $('deckText').value = state.edits.undo.length ? listText() : state.edits.text;
  state.error = null;
  if (location.protocol !== 'file:') await checkCombos();
  else renderAll();
}

async function commit(next) {
  const e = state.edits;
  if (!e.undo.length) e.text = $('deckText').value;
  e.undo.push({ deck: state.deck, cmdPick: state.cmdPick });
  state.cmdPick = PodEngine.carryPick(state.cmdPick, state.deck, next);
  state.deck = next;
  await publish();
}

// Every removal enters here, one undo step per call. A name takes one copy; repeat it to take more.
export async function removeFromDeck(names) {
  if (!canEdit()) return;
  await commit(PodEngine.removeCards(state.deck, names));
  announce(fill(T().edRemoved, { c: names.join(', ') }));
}

// `card` comes whole from searchToAdd, so no second lookup is needed.
export async function addToDeck(card) {
  if (!canEdit()) return;
  const why = PodEngine.addRefusal(state.deck, card, deckIdentity());
  if (why) return announce(fill(T()[why], { c: card.name }));
  cardCache[card.name] ||= card;
  persistCache();
  await commit(PodEngine.addCard(state.deck, card.name));
  announce(fill(T().edAdded, { c: card.name }));
}

async function restore({ deck, cmdPick }) {
  state.deck = deck;
  state.cmdPick = cmdPick;
  await publish();
  announce(T().edRestored);
}
export function undoEdit() { return restore(state.edits.undo.pop()); }
export function resetEdits() {
  const first = state.edits.undo[0];
  state.edits.undo = [];
  return restore(first);
}

// The commanders' colours, or null while the deck has none.
export function deckIdentity() {
  const cmds = state.result.commanders;
  return cmds.length ? [...new Set(cmds.flatMap(n => (cardCache[n] || {}).color_identity || []))] : null;
}

// The player's words as Scryfall syntax: an odd quote or unbalanced bracket would fail the whole query.
export function scryText(q) {
  if ((q.match(/"/g) || []).length % 2) q = q.replace(/"/g, '');
  const depth = [...q].reduce((d, ch) => d < 0 ? d : d + (ch === '(') - (ch === ')'), 0);
  return depth ? q.replace(/[()]/g, '') : q;
}

// Cards the deck can legally take: inside the commanders' colours, and not a second copy of a
// singleton. Game changers are welcome: the player is asking, and the bar shows what it does.
export function searchToAdd(q) {
  const ci = deckIdentity();
  const id = ci ? ' id<=' + (ci.join('') || 'c') : '';
  const excludeNames = state.result.cardsInfo.filter(x => !PodEngine.stacksInDeck(x.card)).map(x => x.card.name);
  return PodEngine.searchScryfall('(' + scryText(q) + ') f:commander' + id + ' order:edhrec', { excludeNames, limit: 8, allowGameChanger: true });
}

// A card named by a suggestion: cached, or one lookup away.
export async function addByName(name) {
  if (!cardCache[name]) await PodEngine.fetchCards([name], cardCache);
  if (cardCache[name]) await addToDeck(cardCache[name]);
}

export const searchCommanders = (q) => PodEngine.searchScryfall(
  '(' + scryText(q) + ') f:commander (is:commander or t:background) order:edhrec', { limit: 8, allowGameChanger: true });

// A new deck is a normal analysis of its command zone, edited in Mazo like any other.
export function startDeck(cards) {
  for (const c of cards) cardCache[c.name] = c;
  persistCache();
  $('deckText').value = deckToText({ entries: cards.map(c => ({ name: c.name, quantity: 1 })), commanders: cards.map(c => c.name) });
  state.cmdPick = null;
  return analyze(false, true);
}
