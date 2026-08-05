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
import { renderBrowser } from './ui/browser.js';
import { renderTips } from './ui/tips.js';
import { renderRamp } from './ui/ramp.js';
import { renderHand } from './ui/hand.js';
import { renderTableMode } from './ui/table.js';
import { renderCurve } from './ui/curve.js';
import { renderGuide } from './ui/guide.js';
import { openHow, closeHow } from './ui/how.js';
import { copyReport } from './ui/report.js';
import { initHelpPopovers } from './ui/popover.js';
import { analyze } from './pipeline.js';

export function renderAll() {
  applyTheme(); renderHeader(); renderInput(); renderGuide(); renderTabbar(); renderTableMode();
  const t = T();
  $('emptyT').textContent = t.emptyT; $('emptyX').textContent = t.emptyX;
  $('footer').textContent = t.footer;
  const has = !!state.result;
  $('empty').style.display = has || state.tableOpen ? 'none' : '';
  $('stickyWrap').style.display = has ? 'flex' : 'none';
  if (has) {
    renderSummary(); renderBanner(); renderValidation();
    if (state.tab === 'power') renderPower();
    if (state.tab === 'analysis') { renderComp(); renderBrowser(); renderCurve(); renderRamp(); renderHand(); }
    if (state.tab === 'tips') renderTips();
  }
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
  $('analyzeBtn').onclick = analyze;
  $('archSel').onchange = (e) => { state.arch = e.target.value; renderAll(); };
  $('deckText').oninput = () => { state.error = null; renderInput(); };
  $('gtBtn').onclick = () => { state.grp = 'type'; renderBrowser(); };
  $('gcBtn').onclick = () => { state.grp = 'cat'; renderBrowser(); };
  $('tableModeBtn').onclick = () => { state.tableOpen = !state.tableOpen; renderAll(); };
  initHelpPopovers();
  const st = PodEngine.runSelfTest(RULES);
  if (!st.pass) console.warn('PodEngine selftest FAILED', st.results.filter(r => !r.pass));
  renderAll();
};
if (document.readyState !== 'loading') __boot();
else window.addEventListener('DOMContentLoaded', __boot);
