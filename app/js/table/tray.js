// Quick zones while a card is dragged: big drop targets for its owner's other zones, at the screen edge farthest from
// where the drag began. table.js reads them like any [data-drop]; data-pos says where in a library the card goes.
import { ICON } from './board.js';

const el = document.getElementById('tray'), still = matchMedia('(prefers-reduced-motion: reduce)');
const TARGETS = [['hand'], ['graveyard'], ['exile'], ['library', 'top'], ['library', 'bottom']];

// zone: where the card is now (no target for it); fromLow: the drag began in the lower half, so the tray sits at the top
export function showTray(seat, zone, fromLow, t) {
  el.innerHTML = TARGETS.filter(([z]) => z !== zone).map(([z, pos]) => `<div class="tz" data-drop="${seat}:${z}"${pos ? ` data-pos="${pos}"` : ''}>${ICON[z]}`
    + `<span>${t['tbZ' + z]}${pos ? `<small>${pos === 'top' ? t.tbTop : t.tbBottom}</small>` : ''}</span></div>`).join('');
  el.className = 'tray ' + (fromLow ? 'top' : 'bottom');
  el.hidden = false;
  if (!still.matches) el.animate([{ opacity: 0, transform: `translateY(${fromLow ? -8 : 8}px)` }, { opacity: 1, transform: 'none' }], { duration: 120, easing: 'ease-out' });
}

export const hideTray = () => { el.hidden = true; el.innerHTML = ''; };
