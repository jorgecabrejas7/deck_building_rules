import { state, TAB_KEYS, VIEW_KEYS } from '../state.js';
import { T } from '../i18n.js';
import { $, esc } from './helpers.js';
import { startCheapest } from '../pipeline.js';
import { renderAll } from '../main.js';
import { podOpened } from './pod.js';

const TAB_LABEL = { load: 'tabLoad', decks: 'tabDecks', informe: 'tabInforme', pod: 'tabPod', guide: 'tabGuide' };

export function renderTabbar() {
  const t = T();
  $('tabbar').innerHTML = TAB_KEYS.map(k => {
    const enabled = k === 'load' || k === 'decks' || k === 'guide' || k === 'pod' || !!state.result;
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
      if (changed && state.tab === 'pod') podOpened();
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

// The report is one view at a time, so a change of view starts at the top of the page.
export function setView(view) {
  const step = VIEW_KEYS.indexOf(view) - VIEW_KEYS.indexOf(state.view);
  const go = () => {
    state.tab = 'informe'; state.view = view;
    renderAll();
    $('stickySentinel').scrollIntoView({ behavior: 'instant' });
  };
  // the views sit side by side in the nav, so the page slides the way you moved
  document.documentElement.dataset.slide = step < 0 ? 'back' : 'forward';
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion:reduce)').matches) document.startViewTransition(go).ready.catch(() => {}); // a newer transition skips this one
  else go();
}

export function renderSectionNav() {
  const t = T(), nav = $('sectionNav');
  nav.hidden = !(state.result && state.tab === 'informe');
  if (nav.hidden) return;
  nav.setAttribute('aria-label', t.navAria);
  nav.innerHTML = VIEW_KEYS.map(v => '<a href="#' + v + '" data-go="' + v + '"' + (state.view === v ? ' aria-current="page"' : '') + '>' + esc(t['view_' + v]) + '</a>').join('');
  for (const k of VIEW_KEYS) $('view-' + k).hidden = state.view !== k;
  // on a phone the links scroll: keep the current one in view
  const a = nav.querySelector('[aria-current]').getBoundingClientRect(), n = nav.getBoundingClientRect();
  if (a.right > n.right || a.left < n.left) nav.scrollLeft += a.left - n.left - 16;
}

export function renderBanner() {
  const t = T(), el = $('banner');
  // cheaper printings only change price points, so the offer only shows where those exist
  const pricePts = state.result ? Object.entries(state.result.evalRes.breakdown)
    .filter(([k]) => k.startsWith('price')).reduce((sum, [, v]) => sum + v, 0) : 0;
  // cheaper printings are about points: the offer waits on the two views that talk about them
  const offerHere = state.view === 'summary' || state.view === 'points';
  // new prices would move the figures the edit bar compares, so the offer waits for an unedited deck
  const edited = state.edits && state.edits.undo.length;
  if (!state.result || state.tab !== 'informe' || (state.fetchSt === 'idle' && (!pricePts || !offerHere || edited))) { el.innerHTML = ''; return; }
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
