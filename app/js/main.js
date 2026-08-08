// Entry point: renderAll orchestrator + one-time event wiring.
// NOTE: UI modules import renderAll from here (an intentional cycle) — safe
// because every cross-module call happens inside event handlers, after eval.
import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { state, store } from './state.js';
import { T } from './i18n.js';
import { $ } from './ui/helpers.js';
import { applyTheme, renderHeader } from './ui/header.js';
import { renderInput } from './ui/input.js';
import { renderSummary } from './ui/summary.js';
import { renderTabbar, renderBanner } from './ui/tabbar.js';
import { renderPower } from './ui/power.js';
import { renderValidation } from './ui/validation.js';
import { renderComp } from './ui/comp.js';
import { renderVerdict } from './ui/verdict.js';
import { renderBrowser } from './ui/browser.js';
import { renderTips } from './ui/tips.js';
import { renderRamp } from './ui/ramp.js';
import { renderHand } from './ui/hand.js';
import { renderTableMode } from './ui/table.js';
import { renderCurve } from './ui/curve.js';
import { renderGuide } from './ui/guide.js';
import { renderPod } from './ui/pod.js';
import { openHow, closeHow } from './ui/how.js';
import { copyReport } from './ui/report.js';
import { initHelpPopovers } from './ui/popover.js';
import { analyze } from './pipeline.js';

// renderAll re-innerHTMLs whole sections, which destroys keyboard focus.
// Remember the focused element's identity (id or first data-* key) and restore
// it after the render if focus fell back to <body>.
let lastFocus = null;
const focusKey = (el) => {
  if (!el || el === document.body || !(el instanceof HTMLElement)) return null;
  if (el.id) return { id: el.id };
  for (const k in el.dataset)
    return { attr: 'data-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), val: el.dataset[k] };
  return null;
};
function restoreFocus(f) {
  if (!f) return;
  // NB: a focused element whose pane just went display:none is blurred
  // asynchronously, so test focusability directly instead of activeElement
  const alive = el => !!el && el !== document.body && el.isConnected &&
    el.offsetParent !== null && !el.disabled;
  if (alive(document.activeElement)) return; // focus genuinely survived
  let el = f.id ? $(f.id) : null;
  if (!el && f.attr)
    el = [...document.querySelectorAll('[' + f.attr + ']')].find(x => x.getAttribute(f.attr) === f.val);
  // target gone or unfocusable (e.g. its pane was hidden by a tab switch):
  // land on the active tab so keyboard users continue from the tabbar
  if (!alive(el)) el = document.querySelector('[role="tab"][aria-selected="true"]');
  if (el) el.focus({ preventScroll: true });
}

export function renderAll() {
  const focus = focusKey(document.activeElement) || lastFocus;
  applyTheme(); renderHeader(); renderInput(); renderGuide(); renderTabbar(); renderTableMode();
  const t = T();
  $('emptyT').textContent = t.emptyT; $('emptyX').textContent = t.emptyX;
  $('footer').textContent = t.footer;
  const has = !!state.result;
  $('empty').style.display = has || state.tableOpen ? 'none' : '';
  $('summary').style.display = has ? '' : 'none';
  renderBanner();
  if (has) {
    renderSummary(); renderValidation();
    if (state.tab === 'power') renderPower();
    if (state.tab === 'analysis') { renderVerdict(); renderComp(); renderBrowser(); renderCurve(); renderRamp(); renderHand(); }
    if (state.tab === 'tips') renderTips();
  }
  if (state.tab === 'pod') renderPod();
  restoreFocus(focus);
}

// ================= boot =================
const __boot = () => {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { state.sysDark = e.matches; applyTheme(); });
  $('themeBtn').onclick = () => { const eff = state.theme ? state.theme === 'dark' : state.sysDark;
    state.theme = eff ? 'light' : 'dark'; store.theme = state.theme; applyTheme(); };
  $('esBtn').onclick = () => { state.lang = 'es'; store.lang = 'es'; renderAll(); };
  $('enBtn').onclick = () => { state.lang = 'en'; store.lang = 'en'; renderAll(); };
  $('copyBtn').onclick = copyReport;
  $('howBtn').onclick = openHow;
  $('howModal').onclick = (e) => { if (e.target === $('howModal')) closeHow(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHow(); });
  document.addEventListener('focusin', (e) => { const k = focusKey(e.target); if (k) lastFocus = k; });
  // clickable non-button elements carry role="button"; activate them from the keyboard
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el instanceof HTMLElement &&
        el.getAttribute('role') === 'button' && el.tagName !== 'BUTTON') {
      e.preventDefault(); el.click();
    }
  });
  $('analyzeBtn').onclick = analyze;
  $('archSel').onchange = (e) => { state.arch = e.target.value; renderAll(); };
  $('deckText').oninput = () => { state.error = null; renderInput(); };
  $('gtBtn').onclick = () => { state.grp = 'type'; renderBrowser(); };
  $('gcBtn').onclick = () => { state.grp = 'cat'; renderBrowser(); };
  $('tableModeBtn').onclick = () => { state.tableOpen = !state.tableOpen; renderAll(); };
  initHelpPopovers();
  // collapse the sticky summary+tabbar once the page top scrolls away
  new IntersectionObserver(([e]) => {
    $('stickyWrap').classList.toggle('stuck', !e.isIntersecting);
    $('summary').dispatchEvent(new Event('scroll')); // re-check the strip's edge fade at the new width
  }).observe($('stickySentinel'));
  const st = PodEngine.runSelfTest(RULES);
  if (!st.pass) console.warn('PodEngine selftest FAILED', st.results.filter(r => !r.pass));
  renderAll();
};
if (document.readyState !== 'loading') __boot();
else window.addEventListener('DOMContentLoaded', __boot);
