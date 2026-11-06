// Entry point: renderAll orchestrator + one-time event wiring.
// NOTE: UI modules import renderAll from here (an intentional cycle) — safe
// because every cross-module call happens inside event handlers, after eval.
import * as PodEngine from './engine/index.js';
import { RULES } from './rules.js';
import { state, store, saveSession, loadSession, VIEW_KEYS } from './state.js';
import { deckToText } from './advice.js';
import { T } from './i18n.js';
import { $ } from './ui/helpers.js';
import { applyTheme, renderHeader } from './ui/header.js';
import { renderInput } from './ui/input.js';
import { renderSummary } from './ui/summary.js';
import { renderTabbar, renderBanner, renderSectionNav, setView } from './ui/tabbar.js';
import { renderPower } from './ui/power.js';
import { renderValidation } from './ui/validation.js';
import { renderComp } from './ui/comp.js';
import { renderVerdict } from './ui/verdict.js';
import { renderCommander } from './ui/commander.js';
import { renderBracket } from './ui/bracket.js';
import { renderCombos } from './ui/combos.js';
import { renderProfile } from './ui/profile.js';
import { renderDeck } from './ui/deck.js';
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
import { initHero } from './ui/hero.js';

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

// Only the view on screen is drawn, so the suggestions and other late data wait until asked for.
const VIEW_RENDER = {
  summary: () => { renderVerdict(); renderCommander(); },
  deck: renderDeck,
  points: () => { renderPower(); renderTips(); },
  bracket: renderBracket,
  combos: renderCombos,
  power: renderProfile,
  mana: () => { renderComp(); renderCurve(); renderRamp(); renderHand(); },
};

export function renderAll() {
  const focus = focusKey(document.activeElement) || lastFocus;
  applyTheme(); renderHeader(); renderInput(); renderGuide(); renderTabbar(); renderTableMode();
  const t = T();
  $('loadSub').textContent = t.emptyX;
  $('footer').textContent = t.footer;
  const has = !!state.result;
  document.body.dataset.tab = state.tab;
  document.body.dataset.view = state.view;
  // the summary belongs to the report: Pod and Guide are about other things
  // every visit starts on the landing; after that, Cargar is just the paste box
  if (state.tab !== 'load') state.landing = false;
  $('hero').hidden = state.tab !== 'load' || !state.landing;
  $('summary').style.display = has && state.tab === 'informe' ? '' : 'none';
  renderSectionNav();
  document.documentElement.lang = state.lang;
  document.querySelector('.skip-link').textContent = t.skipLink;
  $('themeBtn').title = t.themeTitle;
  $('emptyPod').textContent = t.emptyPod;
  renderBanner();
  if (has) {
    renderSummary(); renderValidation();
    if (state.tab === 'informe') {
      // the part headings are static per language; their ids match their keys
      for (const k of ['partPlanT', 'partPodT', 'partPodX', 'partBrT', 'partBrX', 'partPfT', 'partPfX', 'tipsCompT']) $(k).textContent = t[k];
      // out of the pod, the way back in is what the player came for
      $('view-points').classList.toggle('out', state.result.evalRes.tier === 'above');
      VIEW_RENDER[state.view]();
    }
  }
  if (state.tab === 'pod') renderPod();
  restoreFocus(focus);
  saveSession();
}

// ================= boot =================
const __boot = () => {
  // poisoned-cache recovery: a missing critical i18n key means the module
  // graph mixed two deploys — force ONE cache-bypassing reload (guarded in
  // index.html against loops), then boot with whatever we have
  const tCheck = T();
  if ((!tCheck || !tCheck.tabInforme) && window.__pdcRecover && window.__pdcRecover()) return;
  try { sessionStorage.removeItem('pdc_recovered'); } catch (e) {}
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
  $('emptyPod').onclick = () => { state.tab = 'pod'; renderAll(); };
  $('archSel').onchange = (e) => { state.arch = e.target.value; renderAll(); };
  $('deckText').oninput = () => { state.error = null; renderInput(); saveSession(); };
  // every link between views, from the nav or from inside a panel
  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element && e.target.closest('[data-go]');
    if (link) { e.preventDefault(); setView(link.dataset.go); }
  });
  $('tableModeBtn').onclick = () => {
    state.tableOpen = !state.tableOpen;
    // opening with an analyzed deck: seat it at Mazo 1 so comparing starts ready
    if (state.tableOpen && state.deck && !state.tableTexts[0].trim())
      state.tableTexts[0] = deckToText(state.deck);
    renderAll();
  };
  initHelpPopovers();
  initHero();
  // collapse the sticky summary+tabbar once the page top scrolls away
  new IntersectionObserver(([e]) => {
    $('stickyWrap').classList.toggle('stuck', !e.isIntersecting);
    $('summary').dispatchEvent(new Event('scroll')); // re-check the strip's edge fade at the new width
  }).observe($('stickySentinel'));
  const st = PodEngine.runSelfTest(RULES);
  if (!st.pass) console.warn('PodEngine selftest FAILED', st.results.filter(r => !r.pass));
  // restore the previous session's inputs, then re-derive the analysis
  const sess = loadSession();
  if (sess) {
    if (typeof sess.deckText === 'string') $('deckText').value = sess.deckText;
    if (typeof sess.arch === 'string') state.arch = sess.arch;
    if (sess.cmdPick && Array.isArray(sess.cmdPick.names)) state.cmdPick = sess.cmdPick;
    if (Array.isArray(sess.tableTexts))
      state.tableTexts = [0, 1, 2, 3].map(i => typeof sess.tableTexts[i] === 'string' ? sess.tableTexts[i] : '');
  }
  history.scrollRestoration = 'manual';
  renderAll();
  // the saved deck is analyzed behind the landing, so Informe is ready and opens where it was left
  if (sess && typeof sess.deckText === 'string' && sess.deckText.trim()) {
    state.restoring = true;
    if (VIEW_KEYS.includes(sess.view)) state.view = sess.view;
    analyze().finally(() => { state.restoring = false; });
  }
};
if (document.readyState !== 'loading') __boot();
else window.addEventListener('DOMContentLoaded', __boot);
