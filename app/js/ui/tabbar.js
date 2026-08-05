import { state, TAB_KEYS } from '../state.js';
import { T } from '../i18n.js';
import { $, esc } from './helpers.js';
import { startCheapest } from '../pipeline.js';
import { renderAll } from '../main.js';

const TAB_LABEL = { load: 'tabLoad', power: 'tabPower', analysis: 'tabAnalysis', tips: 'tabTips', guide: 'tabGuide' };

export function renderTabbar() {
  const t = T();
  $('tabbar').innerHTML = TAB_KEYS.map(k => {
    const enabled = k === 'load' || k === 'guide' || !!state.result;
    const active = state.tab === k;
    return '<button data-tab="' + k + '" ' + (enabled ? '' : 'disabled') + ' class="tab-btn' + (active ? ' active' : '') + '">' + t[TAB_LABEL[k]] + '</button>';
  }).join('');
  for (const b of $('tabbar').querySelectorAll('[data-tab]'))
    b.onclick = () => { if (!b.disabled) { state.tab = b.dataset.tab; renderAll(); } };
  for (const k of TAB_KEYS) $('tab-' + k).style.display = state.tab === k ? 'flex' : 'none';
}

export function renderBanner() {
  const t = T(), el = $('banner');
  if (!state.result) { el.innerHTML = ''; return; }
  if (state.fetchSt === 'idle') {
    el.innerHTML = '<div class="banner-box tone-warn banner-row">' +
      '<span class="banner-note">' + t.priceNote + '</span>' +
      '<button id="fetchBtn" class="btn-tone-outline">' + t.fetchBtn + '</button></div>';
    $('fetchBtn').onclick = startCheapest;
  } else if (state.fetchSt === 'fetching') {
    const fi = state.fi, pct = fi.total ? Math.round(fi.done / fi.total * 100) : 0;
    el.innerHTML = '<div class="banner-box tone-warn banner-col">' +
      '<div class="banner-prog-head"><span>' + t.fetchBtn + '…</span>' +
      '<span class="mono">' + fi.done + ' / ' + fi.total + (fi.card ? ' · ' + esc(fi.card) : '') + '…</span></div>' +
      '<div class="progress"><div style="--w:' + pct + '%"></div></div></div>';
  } else {
    el.innerHTML = '<div class="banner-box tone-ok">✓ ' + t.fetchDone + '</div>';
  }
}
