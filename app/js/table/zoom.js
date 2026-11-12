// The one large-card presenter (#hover): a mouse resting on a card, a finger sliding over the board, a finger on a hand card.
// A visual aid only (aria-hidden, no pointer events): the keyboard path is "View" in the card's bar.
import { tile } from './board.js';

const el = document.getElementById('hover'), still = matchMedia('(prefers-reduced-motion: reduce)');
const M = 8, R = 40; // screen margin; clearance around a finger

export const hideZoom = () => { el.hidden = true; };

// at: {rect} a mouse on the card with that rect (shown beside it), or {x, y, side} a finger
// (shown on the screen's far side, 'left' or 'right', fixed for the whole gesture). Returns whether a card is shown.
export function showZoom(card, t, at) {
  if (card.face_down || !card.name) { hideZoom(); return false; }
  const html = tile(card, t, true).replace('data-card', 'data-x').replace(/^<button/, '<div').replace(/<\/button>$/, '</div>'); // not focusable, not a hit target
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  const was = el.hidden;
  el.hidden = false;
  const portrait = innerHeight > innerWidth;
  el.style.width = at.rect ? '' : Math.round(portrait ? Math.min(innerWidth * 0.62, 300, innerHeight * 0.8 * 63 / 88) : Math.min(innerHeight * 0.86, 420) * 63 / 88) + 'px';
  const w = el.offsetWidth, h = el.offsetHeight, fit = (v) => Math.max(M, Math.min(v, innerHeight - M - h));
  let left, top;
  if (at.rect) {
    const r = at.rect;
    left = r.right + 12 + w < innerWidth ? r.right + 12 : Math.max(M, r.left - 12 - w);
    top = fit(r.top + r.height / 2 - h / 2);
  } else {
    const { x, y } = at, near = at.side === 'right' ? innerWidth - M - w : M, far = at.side === 'right' ? M : innerWidth - M - w;
    // above or below the finger on a tall screen, else beside it; the first spot the finger does not cover
    const spots = [...(portrait ? [[near, y - R - 12 - h], [near, y + R + 12]] : []), [near, fit(y - h / 2)], [far, fit(y - h / 2)]]
      .filter(([, t]) => t >= M && t + h <= innerHeight - M);
    [left, top] = spots.find(([l, t]) => l >= x + R || l + w <= x - R || t >= y + R || t + h <= y - R) || spots[spots.length - 1];
  }
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
  if (was && !still.matches) el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 120, easing: 'ease-out' });
  return true;
}
