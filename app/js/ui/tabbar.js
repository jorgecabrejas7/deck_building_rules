import { state, store, TAB_KEYS } from '../state.js';
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
    b.onclick = () => { if (!b.disabled) { state.tab = b.dataset.tab; renderAll(); } };
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
}

export function renderBanner() {
  const t = T(), el = $('banner');
  if (!state.result) { el.innerHTML = ''; return; }
  if (state.fetchSt === 'idle') {
    if (store.priceNoteSeen) {
      // one-time notice already dismissed: keep the fetch affordance as a compact pill
      el.innerHTML = '<button id="fetchBtn" class="price-pill">' + t.pricePill + '</button>';
    } else {
      el.innerHTML = '<div class="banner-box tone-warn banner-row">' +
        '<span class="banner-note">' + t.priceNote + '</span>' +
        '<button id="fetchBtn" class="btn-tone-outline">' + t.fetchBtn + '</button>' +
        '<button id="bannerX" class="banner-x" aria-label="' + t.dismiss + '" title="' + t.dismiss + '">✕</button></div>';
      $('bannerX').onclick = () => { store.priceNoteSeen = true; renderBanner(); };
    }
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
