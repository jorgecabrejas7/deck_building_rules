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
    return '<button data-tab="' + k + '" ' + (enabled ? '' : 'disabled') + ' style="border:none;border-bottom:2.5px solid ' +
      (active ? 'var(--accent)' : 'transparent') + ';background:transparent;padding:10px 18px;font-size:13.5px;font-weight:' +
      (active ? '700' : '600') + ';color:' + (active ? 'var(--text)' : enabled ? 'var(--muted)' : 'var(--faint)') +
      ';cursor:' + (enabled ? 'pointer' : 'default') + '">' + t[TAB_LABEL[k]] + '</button>';
  }).join('');
  for (const b of $('tabbar').querySelectorAll('[data-tab]'))
    b.onclick = () => { if (!b.disabled) { state.tab = b.dataset.tab; renderAll(); } };
  for (const k of TAB_KEYS) $('tab-' + k).style.display = state.tab === k ? 'flex' : 'none';
}

export function renderBanner() {
  const t = T(), el = $('banner');
  if (!state.result) { el.innerHTML = ''; return; }
  if (state.fetchSt === 'idle') {
    el.innerHTML = '<div style="background:var(--warnBg);border:1px solid var(--warnBd);border-radius:12px;padding:13px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--warnFg)">' +
      '<span style="flex:1;min-width:260px">' + t.priceNote + '</span>' +
      '<button id="fetchBtn" style="border:1px solid var(--warnBd);background:transparent;color:var(--warnFg);border-radius:7px;padding:7px 16px;font-weight:600;font-size:12.5px;white-space:nowrap">' + t.fetchBtn + '</button></div>';
    $('fetchBtn').onclick = startCheapest;
  } else if (state.fetchSt === 'fetching') {
    const fi = state.fi, pct = fi.total ? Math.round(fi.done / fi.total * 100) : 0;
    el.innerHTML = '<div style="background:var(--warnBg);border:1px solid var(--warnBd);border-radius:12px;padding:13px 18px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--warnFg)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><span style="flex:1;min-width:180px">' + t.fetchBtn + '…</span>' +
      '<span class="mono" style="font-weight:600">' + fi.done + ' / ' + fi.total + (fi.card ? ' · ' + esc(fi.card) : '') + '…</span></div>' +
      '<div style="height:6px;background:var(--warnBd);border-radius:3px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--warnFg);transition:width .1s linear"></div></div></div>';
  } else {
    el.innerHTML = '<div style="background:var(--okBg);border:1px solid var(--okBd);border-radius:12px;padding:13px 18px;font-size:13px;color:var(--okFg)">✓ ' + t.fetchDone + '</div>';
  }
}
