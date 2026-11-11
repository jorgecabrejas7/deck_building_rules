// The game log as sentences, the viewer as "you". Pure: view.log entries in, HTML out (names escaped, in <b>).
// Every sentence key has a "Y" twin for when the viewer acted: Spanish conjugates the verb for "tú".
import { esc, other } from './board.js';
import { fill } from '../i18n.js';

// a card list: up to three known cards by name, else a count
function cards(list, t) {
  if (list.length <= 3 && list.every((c) => c.name)) return list.map((c) => `<b>${esc(c.name)}</b>`).join(', ');
  return list.length === 1 ? t.lgCard1 : fill(t.lgCardN, { n: list.length });
}

// the verb phrase a move reads as, from where its (first) card was and where it went
function moveKey(e) {
  const from = (e.cards[0] || {}).zone, to = e.to.zone;
  if (to === 'hand') return from === 'library' ? 'lgDraw' : 'lgToHand';
  if (to === 'battlefield') return from === 'hand' ? 'lgPlay' : from === 'battlefield' ? (e.to.seat === e.seat ? 'lgSteal' : 'lgGive') : 'lgToField';
  if (to === 'graveyard') return from === 'library' ? 'lgMill' : from === 'hand' ? 'lgDiscard' : 'lgToGrave';
  if (to === 'exile') return 'lgExile';
  if (to === 'command') return 'lgToCmd';
  return e.shuffle ? 'lgTopShuffled' : e.pos === 'bottom' ? 'lgBottom' : 'lgTop';
}

export function line(e, view, t) {
  const me = e.seat === view.you, nm = (s) => `<b>${esc(view.players[s].name || '?')}</b>`;
  const obj = (s) => (s === view.you ? t.lgYouObj : s === e.seat ? t.lgSelfObj : nm(s)); // "to you", "to themselves", "to admin"
  // whose library or life: yours, their own, or someone's (both nouns are feminine in Spanish: one article fits)
  const own = (k, s) => fill(s === view.you ? t.lgOwnY : s === e.seat ? t.lgOwnSelf : t.lgOwnOf, { k, s: nm(s) });
  const S = (k, v = {}) => fill(t[me ? k + 'Y' : k], { a: nm(e.seat), ...v });
  const c = e.cards ? cards(e.cards, t) : e.card ? cards([e.card], t) : '';
  switch (e.type) {
    case 'move': return S(moveKey(e), { c, s: obj(e.to.seat), z: own(t.lgLib, e.to.seat) }) + (e.face_down ? t.lgDown : '');
    case 'tap': return S(e.tapped ? 'lgTap' : 'lgUntap', { c });
    case 'untap_all': return S('lgUntapAll');
    case 'flip': return S(e.face_down ? 'lgFlipDown' : 'lgFlipUp', { c });
    case 'counter': return S(e.delta < 0 ? 'lgCtrDel' : 'lgCtrAdd', { n: Math.abs(e.delta), k: esc(e.name), c });
    case 'token': return S('lgToken', { c: fill(e.count === 1 ? t.lgTok1 : t.lgTokN, { n: e.count, k: `<b>${esc(e.name)}</b>` }) });
    case 'delete': return S('lgDelete', { c });
    case 'attach': return e.host ? S('lgAttach', { c, h: cards([e.host], t) }) : S('lgDetach', { c });
    case 'look': return S('lgLook', { c });
    case 'reveal': return S('lgReveal', { c });
    case 'shuffle': return S('lgShuffle', { z: own(t.lgLib, e.target) });
    case 'mulligan': return S('lgMull', { n: e.n });
    case 'life': return S(e.delta < 0 ? 'lgLifeDown' : 'lgLifeUp', { n: Math.abs(e.delta), z: own(t.lgLifeW, e.target), l: e.life });
    case 'cmd_damage': return S(e.delta < 0 ? 'lgCmdDown' : 'lgCmdUp', { n: Math.abs(e.delta), k: `<b>${esc(e.commander)}</b>`, s: obj(e.target), v: e.value });
    case 'roll': return e.sides === 2 ? S('lgCoin', { r: e.result % 2 === 1 ? t.tbHeads : t.tbTails }) : S('lgRoll', { n: e.sides, r: e.result });
    case 'pass_turn': {
      const head = e.target === e.seat ? S('lgTake') : e.target === view.you ? fill(t.lgPassToY, { a: nm(e.seat) }) : S('lgPass', { s: nm(e.target) });
      const drew = e.draw && e.cards && e.cards.length ? fill(e.target === view.you ? t.lgDrewY : t.lgDrew, { s: nm(e.target), c }) : '';
      return head + drew;
    }
    case 'undo': return S('lgUndo', { u: t['lgU' + e.undone] || t.lgUany });
    default: return S('lgOther', { k: esc(e.type) });
  }
}

// whose turn number n was: the current one, or the seat a pass gave it to (or took it from, for the turn before)
function whose(view, n) {
  if (view.turn && n === view.turn.number) return view.turn.seat;
  const to = view.log.find((e) => e.type === 'pass_turn' && e.turn === n), next = view.log.find((e) => e.type === 'pass_turn' && e.turn === n + 1);
  return to ? to.target : next ? other(next.target) : null;
}

// newest first, grouped by turn
export function logHtml(view, t) {
  const log = view.log || [];
  if (!log.length) return `<p>${t.tbLogEmpty}</p>`;
  const groups = new Map();
  for (const e of [...log].reverse()) groups.set(e.turn, [...(groups.get(e.turn) || []), e]);
  return [...groups].map(([n, es]) => {
    const s = whose(view, n);
    const head = s ? fill(t.tbTurnOf, { n, s: s === view.you ? t.lgYouLow : esc(view.players[s].name || '?') }) : fill(t.tbTurnN, { n });
    return `<h3>${head}</h3><ul class="lg">${es.map((e) => `<li${e.seat === view.you ? ' class="me"' : ''}>${line(e, view, t)}</li>`).join('')}</ul>`;
  }).join('');
}
