import { state } from '../state.js';
import { T } from '../i18n.js';
import { CAT_HELP, DIAL_META } from './constants.js';
import { $ } from './helpers.js';

// Owns the two singleton popover nodes: #popover (card image) and #textPop
// (category help), shared by the browser, tips, ramp and curve sections.
// On touch devices (hover: none) popovers toggle on tap instead of hover,
// and a tap anywhere else closes them.
const TOUCH = matchMedia('(hover: none)').matches;

// Popovers are anchored to viewport coordinates, so they strand on screen when
// the page scrolls (mouseleave never fires mid-scroll). Any scroll dismisses
// them — except within a short grace window after opening, because focusing a
// tile via keyboard can scroll it into view, and that scroll must not close
// the popover the focus just opened.
let popOpenAt = -Infinity;
addEventListener('scroll', () => {
  if (performance.now() - popOpenAt < 250) return;
  hideCardPopover(); hideHelpPopover();
}, { capture: true, passive: true });

// grace=true (focus/tap opens) keeps the popover through the scroll a focus
// jump causes; hover opens pass grace=false so any scroll dismisses at once
// (otherwise the card can strand over the sticky header mid-scroll).
export function showCardPopover(anchor, src, grace = true) {
  if (!src) return;
  const rect = anchor.getBoundingClientRect();
  let x = rect.right + 12; if (x + 276 > innerWidth) x = Math.max(8, rect.left - 288);
  const y = Math.max(10, Math.min(rect.top - 60, innerHeight - 390));
  const pop = $('popover');
  let img = pop.firstElementChild;
  if (!img) { img = document.createElement('div'); img.className = 'card-pop-img'; pop.appendChild(img); }
  pop.style.display = 'block'; pop.style.left = x + 'px'; pop.style.top = y + 'px';
  // the frame shows a card-back-like placeholder; the art fades in once loaded
  if (pop._src !== src) {
    pop._src = src;
    img.classList.remove('in'); img.style.backgroundImage = '';
    const pre = new Image();
    pre.onload = () => {
      if (pop._src !== src) return; // a different card took over meanwhile
      img.style.backgroundImage = "url('" + src + "')";
      img.classList.add('in');
    };
    pre.src = src;
  }
  popOpenAt = grace ? performance.now() : -Infinity;
}
export function hideCardPopover() { const pop = $('popover'); pop.style.display = 'none'; pop._owner = null; }

function bindTarget(el, getSrc) {
  el.tabIndex = 0; // card previews must be reachable from the keyboard
  // announce the tile: card name + action (focus lands on something named)
  if (el.dataset.name && !el.hasAttribute('role')) {
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', el.dataset.name + ' — ' + T().previewAria);
  }
  if (TOUCH) {
    const toggle = () => {
      const pop = $('popover');
      const src = getSrc();
      if (!src) return;
      if (pop.style.display !== 'none' && pop._owner === el) { hideCardPopover(); return; }
      showCardPopover(el, src);
      pop._owner = el;
    };
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  } else {
    el.onmouseenter = () => showCardPopover(el, getSrc(), false);
    el.onmouseleave = hideCardPopover;
    el.onfocus = () => showCardPopover(el, getSrc());
    el.onblur = hideCardPopover;
  }
}

export function bindSugPopovers(root) {
  for (const el of root.querySelectorAll('.sugTile')) bindTarget(el, () => el.dataset.img);
}
export function bindCardTilePopover(tile, getSrc) { bindTarget(tile, getSrc); }

// "?" icons carry either data-cat (category definitions) or data-dial (pod
// rule prose for a power dial).
function helpTextFor(el) {
  if (el.dataset.cat) { const h = CAT_HELP[el.dataset.cat]; return h && h[state.lang]; }
  if (el.dataset.dial) { const m = DIAL_META.find(d => d.k === el.dataset.dial); return m && m.help[state.lang]; }
  return null;
}

function showHelpPopover(el, grace = true) {
  const text = helpTextFor(el);
  if (!text) return false;
  const tp = $('textPop'), rect = el.getBoundingClientRect();
  tp.textContent = text;
  tp.style.display = 'block';
  let x = rect.left; if (x + 330 > innerWidth) x = Math.max(8, innerWidth - 335);
  tp.style.left = x + 'px';
  tp.style.top = Math.max(8, Math.min(rect.bottom + 8, innerHeight - tp.offsetHeight - 10)) + 'px';
  popOpenAt = grace ? performance.now() : -Infinity;
  return true;
}

function hideHelpPopover() { const tp = $('textPop'); tp.style.display = 'none'; tp._owner = null; }

// One-time delegated handlers for the ".catHelp" help buttons → #textPop.
export function initHelpPopovers() {
  // Esc closes both popover singletons in every input mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideCardPopover(); hideHelpPopover(); }
  });
  if (TOUCH) {
    document.addEventListener('click', (e) => {
      const help = e.target.closest && e.target.closest('.catHelp');
      if (help) {
        const tp = $('textPop');
        if (tp.style.display !== 'none' && tp._owner === help) hideHelpPopover();
        else if (showHelpPopover(help)) tp._owner = help;
        return;
      }
      // tap outside any popover trigger closes both singletons
      if (!(e.target.closest && e.target.closest('.sugTile, .cardTile'))) {
        hideCardPopover();
        hideHelpPopover();
      }
    });
    return;
  }
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.catHelp');
    if (el) showHelpPopover(el, false);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('.catHelp')) hideHelpPopover();
  });
  // keyboard: focusing a help button opens its popover, blurring closes it
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('.catHelp');
    if (el) showHelpPopover(el);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.closest && e.target.closest('.catHelp')) hideHelpPopover();
  });
}
