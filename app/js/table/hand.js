// The hand, held as a fan, under a head with the hand's toggle, undo, a token and (on your turn) passing it.
// The fan: the cards overlap so the whole hand fits the width, with a slight arc and tilt.
// layoutHand measures the row and sets each card's --x (left edge), --r (tilt) and --y (arc); table.css draws them.
// raise marks the card under a finger or a mouse (.up); cardAtX finds it from the pointer's x.
import { tile, ICON } from './board.js';
import { fill } from '../i18n.js';

// armed: ms since the pass button was armed (0 when not); the bar resumes where it was, a render does not restart it
export function handHtml(view, t, open, armed) {
  const hand = view.zones[view.you].hand;
  return `<div class="hand-head"><button class="hand-bar" data-hand aria-expanded="${open}">${fill(t.tbHandBar, { n: hand.length })}${ICON.up}</button>`
    + `<button class="tbtn ico" data-top="undo" title="${t.tbUndo}" aria-label="${t.tbUndo}"${view.can_undo ? '' : ' disabled'}>${ICON.undo}</button>`
    + `<button class="tbtn add" data-token>${ICON.plus}<span>${t.tbToken}</span></button>`
    // on your turn, passing it is one tap away; the menu passes on the other player's turn, or without a draw
    + (view.turn && view.turn.seat === view.you
      ? `<button class="tbtn pass${armed ? ' armed' : ''}" data-top="pass"${armed ? ` style="--wait:-${Math.round(armed)}ms"` : ''}>${armed ? t.tbCancel : t.tbPass + ICON.pass}</button>` : '') + `</div>`
    + (open ? `<div class="hand-row">${hand.map((c, i) => tile(c, t).replace('<button ', `<button style="--i:${i}" `)).join('')}</div>` : '');
}

// GAP mirrors the battlefield's card gap in table.css
const PAD = 12, GAP = 6, TILT = 1.5, MAX_TILT = 10, ARC = 6, READABLE = 20;
export function layoutHand(row) {
  const cards = row ? [...row.children] : [], n = cards.length;
  if (!n || !row.clientWidth) return; // hidden (the hand is tucked away): laid out again when it shows
  const cw = cards[0].offsetWidth, flat = n * cw + (n - 1) * GAP, fits = flat <= row.clientWidth - 2 * PAD;
  // only an overlapping hand fans out; once each card shows less than READABLE px it lies flat so the slices stay legible
  const tight = n > 1 ? (row.clientWidth - 2 * PAD - cw) / (n - 1) : 0;
  const spread = fits || tight < READABLE ? 0 : Math.min(MAX_TILT, TILT * (n - 1));
  // a tilted end card leans out by its height times the sine of its tilt: keep that corner on screen too
  const pad = PAD + Math.ceil(cw * 1.4 * Math.sin((spread / 2) * Math.PI / 180)), W = row.clientWidth - 2 * pad;
  const step = n > 1 ? (fits ? cw + GAP : (W - cw) / (n - 1)) : 0, x0 = pad + (fits ? (W - flat) / 2 : 0);
  cards.forEach((c, i) => {
    const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0; // -1 at the left end, 1 at the right
    c.style.setProperty('--x', Math.round(x0 + i * step) + 'px');
    c.style.setProperty('--r', ((u * spread) / 2).toFixed(2) + 'deg');
    c.style.setProperty('--y', (spread ? u * u * ARC : 0).toFixed(1) + 'px');
  });
}

// the card whose visible slice is under x: the last one whose left edge is at or before it
export function cardAtX(row, x) {
  const left = row.getBoundingClientRect().left;
  let hit = row.firstElementChild;
  for (const c of row.children) if (left + c.offsetLeft <= x) hit = c;
  return hit;
}

export function raise(row, el) {
  if (row) for (const c of row.children) c.classList.toggle('up', c === el);
}
