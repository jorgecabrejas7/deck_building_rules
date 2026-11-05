import { state, TAB_KEYS } from '../state.js';
import { T } from '../i18n.js';
import { $, esc } from './helpers.js';
import { startCheapest } from '../pipeline.js';
import { renderAll } from '../main.js';

const TAB_LABEL = { load: 'tabLoad', informe: 'tabInforme', detalles: 'tabDetalles', pod: 'tabPod', guide: 'tabGuide' };

export function renderTabbar() {
  const t = T();
  $('tabbar').innerHTML = TAB_KEYS.map(k => {
    const enabled = k === 'load' || k === 'guide' || k === 'pod' || !!state.result;
    const active = state.tab === k;
    return '<button id="tabbtn-' + k + '" data-tab="' + k + '" ' + (enabled ? '' : 'disabled') +
      ' role="tab" aria-selected="' + active + '" aria-controls="tab-' + k + '" tabindex="' + (active ? 0 : -1) + '"' +
      ' class="tab-btn' + (active ? ' active' : '') + '">' + t[TAB_LABEL[k]] + '</button>';
  }).join('');
  for (const b of $('tabbar').querySelectorAll('[data-tab]'))
    b.onclick = () => {
      if (b.disabled) return;
      const changed = state.tab !== b.dataset.tab;
      state.tab = b.dataset.tab;
      renderAll();
      // a tab change is a new page: don't land mid-way down an unrelated panel
      if (changed) $('stickySentinel').scrollIntoView();
    };
  // roving focus: arrows move between enabled tabs, Enter/Space activate (native click)
  $('tabbar').onkeydown = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...$('tabbar').querySelectorAll('[role="tab"]:not([disabled])')];
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = e.key === 'Home' ? tabs[0]
      : e.key === 'End' ? tabs[tabs.length - 1]
      : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
  };
  for (const k of TAB_KEYS) $('tab-' + k).style.display = state.tab === k ? 'flex' : 'none';
  // on a phone the bar scrolls: keep the active tab in view
  const active = $('tabbtn-' + state.tab), bar = $('tabbar');
  if (active.offsetLeft + active.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = active.offsetLeft;
}

// Jump links through the long report. Points fold away by default, so going there opens them.
export function renderSectionNav() {
  const t = T(), nav = $('sectionNav');
  nav.hidden = !(state.result && state.tab === 'informe');
  if (nav.hidden) return;
  nav.setAttribute('aria-label', t.navAria);
  nav.innerHTML = [['verdict', t.navVerdict], ['sec-plan', t.partPlanT], ['sec-profile', t.navProfile], ['sec-bracket', t.navBracket], ['sec-points', t.navPoints]]
    .map(([id, label]) => '<a href="#' + id + '">' + esc(label) + '</a>').join('');
  nav.querySelector('[href="#sec-points"]').onclick = () => { $('sec-points').open = true; };
}

export function renderBanner() {
  const t = T(), el = $('banner');
  // cheaper printings only change price points, so the offer only shows where those exist
  const pricePts = state.result ? Object.entries(state.result.evalRes.breakdown)
    .filter(([k]) => k.startsWith('price')).reduce((sum, [, v]) => sum + v, 0) : 0;
  if (!state.result || (state.tab !== 'informe' && state.tab !== 'detalles') || (state.fetchSt === 'idle' && !pricePts)) { el.innerHTML = ''; return; }
  if (state.fetchSt === 'idle') {
    el.innerHTML = '<button id="fetchBtn" class="price-pill">' + t.pricePill + '</button>';
    $('fetchBtn').onclick = startCheapest;
  } else if (state.fetchSt === 'fetching') {
    const fi = state.fi, pct = fi.total ? Math.round(fi.done / fi.total * 100) : 0;
    const counter = fi.done + ' / ' + fi.total + (fi.card ? ' · ' + esc(fi.card) : '') + '…';
    // #banner is aria-live: build the box once, then patch only the (aria-hidden)
    // counter and bar so each progress tick is not re-announced
    const bar = el.querySelector('.progress>div');
    if (bar) {
      bar.style.setProperty('--p', pct / 100);
      el.querySelector('.banner-prog-head .mono').innerHTML = counter;
    } else {
      el.innerHTML = '<div class="banner-box tone-warn banner-col">' +
        '<div class="banner-prog-head"><span>' + t.fetchBtn + '…</span>' +
        '<span class="mono" aria-hidden="true">' + counter + '</span></div>' +
        '<div class="progress" aria-hidden="true"><div style="--p:' + pct / 100 + '"></div></div></div>';
    }
  } else {
    el.innerHTML = '<div class="banner-box tone-ok">✓ ' + t.fetchDone + '</div>';
  }
}
