import { state } from '../state.js';
import { T, fill } from '../i18n.js';
import { esc } from './helpers.js';
import { bindCardTilePopover } from './popover.js';

// The anatomy every reading panel shares (power level, Wizards' checklist, combos):
// the answer first, then what it rests on, then the depth folded away. Styles: power.css.
const svg = (d) => '<svg class="rd-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
export const ICON = {
  check: svg('M3 8.5 6.5 12 13 4.5'),
  cross: svg('M4 4l8 8M12 4l-8 8'),
  wait: svg('M3 8h.01M8 8h.01M13 8h.01'),
  open: svg('M5 11l6-6M6 5h5v5'),
};
const CHEVRON = svg('M6 3.5 10.5 8 6 12.5');

// label + the big answer, then a line of context; `body` is the plain-language why.
export function answer({ label, value, sub, body = '' }) {
  return '<header class="rd-answer"><h3 class="rd-answer-main"><span class="rd-answer-label">' + esc(label) + '</span> ' +
    '<span class="rd-answer-value">' + esc(value) + '</span></h3>' +
    '<div class="rd-answer-sub">' + sub + '</div>' + body + '</header>';
}

// `key` lets an open fold survive a re-render (late salt, EDHREC, a language switch).
export function fold(key, title, aside, body) {
  return '<details class="rd-fold" data-fold="' + esc(key) + '"><summary><span class="rd-fold-t">' + esc(title) + '</span>' +
    (aside ? '<span class="rd-fold-aside">' + esc(aside) + '</span>' : '') + CHEVRON + '</summary>' +
    '<div class="rd-fold-body">' + body + '</div></details>';
}

const frontName = (name) => String(name).split(' // ')[0];
const cardIndex = () => new Map(state.result.cardsInfo.map(({ card }) => [frontName(card.name), card]));

// A card name that previews on hover, focus or tap. Cards the deck list can't place stay plain.
export function cardName(name, cls, note = '') {
  const n = frontName(name), img = (cardIndex().get(n) || {}).img_normal;
  return '<span class="' + cls + '" data-name="' + esc(n) + '"' + (img ? ' data-img="' + esc(img) + '"' : '') + '>' +
    esc(n) + (note ? ' <b>' + esc(note) + '</b>' : '') + '</span>';
}

// Cards never run as prose: they wrap as chips, and past `cap` the rest wait behind a fold.
// note(name) adds a figure to a chip. cap 0 folds the whole list.
export function cardList(names, { cap = 12, note = () => '' } = {}) {
  if (!names.length) return '';
  const t = T();
  const chips = (list) => '<ul class="rd-cards">' + list.map(n => '<li>' + cardName(n, 'rd-card', note(n)) + '</li>').join('') + '</ul>';
  if (names.length <= cap) return chips(names);
  return (cap ? chips(names.slice(0, cap)) : '') +
    more(fill(cap ? t.sugMore : t.cardsSee, { v: cap ? names.length - cap : names.length }), chips(names.slice(cap)));
}

export const more = (label, body) => '<details class="rd-more"><summary>' + esc(label) + CHEVRON + '</summary>' + body + '</details>';

export const tableWrap = (html, cls = '') => '<div class="rd-table-wrap"><table class="rd-table ' + cls + '">' + html + '</table></div>';

// Replaces a panel's content, keeping its folds open and wiring its card previews.
export function paint(root, html) {
  const open = new Set([...root.querySelectorAll('details[open][data-fold]')].map(d => d.dataset.fold));
  root.innerHTML = html;
  for (const d of root.querySelectorAll('details[data-fold]')) if (open.has(d.dataset.fold)) d.open = true;
  for (const el of root.querySelectorAll('[data-img]')) {
    bindCardTilePopover(el, () => el.dataset.img);
    // popover.js closes on any touch tap outside its own tiles: this tap must not count as outside
    el.addEventListener('click', (e) => e.stopPropagation());
  }
}
