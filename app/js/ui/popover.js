import { state } from '../state.js';
import { CAT_HELP } from './constants.js';
import { $ } from './helpers.js';

// Owns the two singleton popover nodes: #popover (card image) and #textPop
// (category help), shared by the browser, tips, ramp and curve sections.

export function showCardPopover(anchor, src) {
  if (!src) return;
  const rect = anchor.getBoundingClientRect();
  let x = rect.right + 12; if (x + 276 > innerWidth) x = Math.max(8, rect.left - 288);
  const y = Math.max(10, Math.min(rect.top - 60, innerHeight - 390));
  const pop = $('popover');
  pop.style.display = ''; pop.style.left = x + 'px'; pop.style.top = y + 'px';
  pop.style.backgroundImage = "url('" + src + "')";
}
export function hideCardPopover() { $('popover').style.display = 'none'; }

export function bindSugPopovers(root) {
  for (const el of root.querySelectorAll('.sugTile')) {
    el.onmouseenter = () => showCardPopover(el, el.dataset.img);
    el.onmouseleave = hideCardPopover;
  }
}

// One-time delegated handlers for the ".catHelp" help icons → #textPop.
export function initHelpPopovers() {
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.catHelp');
    if (!el) return;
    const help = CAT_HELP[el.dataset.cat];
    if (!help) return;
    const tp = $('textPop'), rect = el.getBoundingClientRect();
    tp.textContent = help[state.lang];
    tp.style.display = '';
    let x = rect.left; if (x + 330 > innerWidth) x = Math.max(8, innerWidth - 335);
    tp.style.left = x + 'px';
    tp.style.top = Math.min(rect.bottom + 8, innerHeight - 120) + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('.catHelp')) $('textPop').style.display = 'none';
  });
}
