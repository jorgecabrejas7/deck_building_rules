import { state } from '../state.js';
import { CAT_HELP } from './constants.js';
import { $ } from './helpers.js';

// Owns the two singleton popover nodes: #popover (card image) and #textPop
// (category help), shared by the browser, tips, ramp and curve sections.
// On touch devices (hover: none) popovers toggle on tap instead of hover,
// and a tap anywhere else closes them.
const TOUCH = matchMedia('(hover: none)').matches;

export function showCardPopover(anchor, src) {
  if (!src) return;
  const rect = anchor.getBoundingClientRect();
  let x = rect.right + 12; if (x + 276 > innerWidth) x = Math.max(8, rect.left - 288);
  const y = Math.max(10, Math.min(rect.top - 60, innerHeight - 390));
  const pop = $('popover');
  pop.style.display = ''; pop.style.left = x + 'px'; pop.style.top = y + 'px';
  pop.style.backgroundImage = "url('" + src + "')";
}
export function hideCardPopover() { const pop = $('popover'); pop.style.display = 'none'; pop._owner = null; }

function bindTarget(el, getSrc) {
  if (TOUCH) {
    el.addEventListener('click', () => {
      const pop = $('popover');
      const src = getSrc();
      if (!src) return;
      if (pop.style.display !== 'none' && pop._owner === el) { hideCardPopover(); return; }
      showCardPopover(el, src);
      pop._owner = el;
    });
  } else {
    el.onmouseenter = () => showCardPopover(el, getSrc());
    el.onmouseleave = hideCardPopover;
  }
}

export function bindSugPopovers(root) {
  for (const el of root.querySelectorAll('.sugTile')) bindTarget(el, () => el.dataset.img);
}
export function bindCardTilePopover(tile, getSrc) { bindTarget(tile, getSrc); }

function showHelpPopover(el) {
  const help = CAT_HELP[el.dataset.cat];
  if (!help) return false;
  const tp = $('textPop'), rect = el.getBoundingClientRect();
  tp.textContent = help[state.lang];
  tp.style.display = '';
  let x = rect.left; if (x + 330 > innerWidth) x = Math.max(8, innerWidth - 335);
  tp.style.left = x + 'px';
  tp.style.top = Math.min(rect.bottom + 8, innerHeight - 120) + 'px';
  return true;
}

// One-time delegated handlers for the ".catHelp" help icons → #textPop.
export function initHelpPopovers() {
  if (TOUCH) {
    document.addEventListener('click', (e) => {
      const help = e.target.closest && e.target.closest('.catHelp');
      if (help) {
        const tp = $('textPop');
        if (tp.style.display !== 'none' && tp._owner === help) { tp.style.display = 'none'; tp._owner = null; }
        else if (showHelpPopover(help)) tp._owner = help;
        return;
      }
      // tap outside any popover trigger closes both singletons
      if (!(e.target.closest && e.target.closest('.sugTile, .cardTile'))) {
        hideCardPopover();
        const tp = $('textPop'); tp.style.display = 'none'; tp._owner = null;
      }
    });
    return;
  }
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.catHelp');
    if (el) showHelpPopover(el);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('.catHelp')) $('textPop').style.display = 'none';
  });
}
