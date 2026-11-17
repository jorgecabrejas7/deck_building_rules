// The hand, held as a fan on a circle arc, centred at the bottom between your pill and the action button.
// The cards overlap so the whole hand fits the width, each turned about a centre far below them (a gentle fan even when they fit).
// layoutHand measures the row and sets each card's --x (left edge), --r (tilt) and --y (arc); table.css draws them.
// raise marks the card under a finger or a mouse (.up) and parts its neighbours (--p); cardAtX finds it from the pointer's x.
import { tile } from './board.js';
import { fill } from '../i18n.js';

export function handHtml(view, t) {
  const hand = view.zones[view.you].hand;
  return `<div class="hand-row" role="group" aria-label="${fill(t.tbHandBar, { n: hand.length })}">${hand.map((c, i) => tile(c, t).replace('<button ', `<button style="--i:${i}" `)).join('')}</div>`;
}

// GAP mirrors the battlefield's card gap in table.css. The ends turn DEG per card up to MAX_DEG, and the arc drops at most DEPTH px;
// the card under the pointer parts its neighbours by PART px, a share FALL of that less for each card further away
const PAD = 12, GAP = 6, DEG = 1.6, MAX_DEG = 10, DEPTH = 16, PART = 16, FALL = 0.55, HYST = 4;
const rad = (d) => (d * Math.PI) / 180;
export function layoutHand(row) {
  const cards = row ? [...row.children] : [], n = cards.length;
  if (!n || !row.clientWidth) return; // hidden (the hand is tucked away): laid out again when it shows
  const cw = cards[0].offsetWidth, flat = n * cw + (n - 1) * GAP, fits = flat <= row.clientWidth - 2 * PAD;
  const reach = fits ? flat - cw : row.clientWidth - 2 * PAD - cw; // distance from the first card's centre to the last
  const deg = n > 1 ? Math.min(MAX_DEG, DEG * (n - 1), (4 * DEPTH / reach) * 180 / Math.PI) : 0;
  // a tilted end card leans out by its height times the sine of its tilt: keep that corner on screen too
  const pad = PAD + Math.ceil(cw * 1.4 * Math.sin(rad(deg))), W = row.clientWidth - 2 * pad;
  const step = n > 1 ? (fits ? cw + GAP : (W - cw) / (n - 1)) : 0, x0 = pad + (fits ? (W - flat) / 2 : 0);
  const R = deg ? ((n - 1) * step) / 2 / Math.sin(rad(deg)) : 0, drop = R * (1 - Math.cos(rad(deg)));
  cards.forEach((c, i) => {
    const th = deg ? Math.asin((((i - (n - 1) / 2) * step) / R)) : 0; // this card's angle on the circle
    c.style.setProperty('--x', Math.round(x0 + i * step) + 'px');
    c.style.setProperty('--r', ((th * 180) / Math.PI).toFixed(2) + 'deg');
    c.style.setProperty('--y', (R * (1 - Math.cos(th)) - drop / 2).toFixed(1) + 'px'); // the middle up, the ends down
  });
  part(row);
}

// the card whose visible slice is under x: the last one whose left edge, at mid height (where its tilt has moved it), is at or before it.
// cur, the raised card, keeps it until x is HYST px past its slice, so a pointer on a boundary does not flip between two cards
export function cardAtX(row, x, cur) {
  const kids = [...row.children], rx = x - row.getBoundingClientRect().left;
  const lefts = kids.map((c) => c.offsetLeft + (c.offsetHeight / 2) * Math.sin(rad(parseFloat(c.style.getPropertyValue('--r')) || 0)));
  const at = (i) => (i < lefts.length ? lefts[i] : Infinity), c = kids.indexOf(cur);
  if (c >= 0 && rx >= at(c) - HYST && rx < at(c + 1) + HYST) return cur;
  let i = 0;
  while (i + 1 < lefts.length && lefts[i + 1] <= rx) i++;
  return kids[i];
}

export function raise(row, el) {
  if (!row || [...row.children].find((c) => c.classList.contains('up')) === (el || undefined)) return;
  for (const c of row.children) c.classList.toggle('up', c === el);
  part(row);
}

// the cards beside the raised one stand aside, so it is seen whole
function part(row) {
  const cards = [...row.children], k = cards.findIndex((c) => c.classList.contains('up'));
  cards.forEach((c, i) => c.style.setProperty('--p', (k < 0 ? 0 : Math.sign(i - k) * PART * FALL ** (Math.abs(i - k) - 1)).toFixed(1) + 'px'));
}
