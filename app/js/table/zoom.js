// The one large-card presenter (#hover): a mouse resting on a card, a finger sliding over the board, a finger on a hand card.
// A visual aid only (aria-hidden, no pointer events): the keyboard path is "View" in the card's bar.
import { bigHtml, twoSided } from './board.js';

const el = document.getElementById('hover'), still = matchMedia('(prefers-reduced-motion: reduce)');
const M = 8, R = 40; // screen margin; clearance around a finger

// it fades out over FADE ms; showing again cancels that at once, so sliding from card to card never waits
const FADE = 90;
let fading = null;
export function hideZoom() {
  if (el.hidden || fading) return;
  if (still.matches) { el.hidden = true; return; }
  const a = fading = el.animate({ opacity: [1, 0] }, { duration: FADE, easing: 'ease-in', fill: 'forwards' });
  a.onfinish = () => { if (fading === a) { el.hidden = true; fading = null; } a.cancel(); };
}

// at: {rect} a mouse on the card with that rect (shown beside it), or {x, y, side} a finger
// (shown on the screen's far side, 'left' or 'right', fixed for the whole gesture). Returns whether a card is shown.
export function showZoom(card, t, at) {
  if (card.face_down || !card.name) { hideZoom(); return false; }
  const portrait = innerHeight > innerWidth;
  const w1 = at.rect ? Math.min(300, Math.max(220, innerWidth * 0.22)) : Math.round(portrait ? Math.min(innerWidth * 0.62, 300, innerHeight * 0.8 * 63 / 88) : Math.min(innerHeight * 0.86, 420) * 63 / 88);
  // a two-sided card shows both faces when two cards fit the screen beside the pointer; else the shown face and a hint
  const two = twoSided(card) && 2 * w1 + 8 + 2 * M + (at.rect ? at.rect.width + 12 : 2 * R) <= innerWidth;
  const html = bigHtml(card, t, two).replace(/<(\/?)button/g, '<$1div'); // not focusable, not a hit target
  if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  el.classList.toggle('two', two);
  if (fading) { fading.cancel(); fading = null; }
  const was = el.hidden;
  el.hidden = false;
  el.style.width = two ? 2 * w1 + 8 + 'px' : at.rect ? '' : w1 + 'px';
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
