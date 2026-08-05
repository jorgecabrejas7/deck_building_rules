import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH, BASECOMP, CATS } from './constants.js';
import { $, archKey, archName, catLabel, esc } from './helpers.js';
import { renderBrowser } from './browser.js';

export function compSlots() {
  const a = ARCH.find(x => x.k === archKey());
  const merged = new Map(BASECOMP.map(([c, mn, mx]) => [c, [mn, mx]]));
  for (const [c, mn, mx] of (a && a.spec) || []) merged.set(c, [mn, mx]);
  return [...merged.entries()].map(([cat, [mn, mx]]) => ({ cat, min: mn, max: mx }));
}
export function tagCount(cat) {
  return state.result.cardsInfo.reduce((s, x) => s + ((x.cls.cat === cat || x.cls.tags.includes(cat)) ? x.qty : 0), 0);
}

export function renderComp() {
  const t = T(), lang = state.lang;
  let html = '<div class="comp-head">' +
    '<span class="comp-title">' + t.comp + '</span>' +
    '<span class="comp-sub">' + t.compTargets + ' ' + esc(archName()) + '</span></div><div class="comp-rows">';
  for (const s of compSlots()) {
    const v = tagCount(s.cat);
    const scale = Math.max(s.max * 1.5, v * 1.15, 1);
    const status = v < s.min ? 'few' : v > s.max ? 'many' : 'ok';
    html += '<div data-hl="' + s.cat + '" class="comp-row' + (state.hl === s.cat ? ' hl' : '') + '">' +
      '<span>' + catLabel(s.cat, lang) + '</span>' +
      '<div class="comp-track">' +
      '<div class="comp-band" style="--l:' + (s.min / scale * 100).toFixed(1) + '%;--w:' + ((s.max - s.min) / scale * 100).toFixed(1) + '%"></div>' +
      '<div class="dial-marker" style="--x:' + Math.min(v / scale * 100, 98).toFixed(1) + '%"></div></div>' +
      '<span class="comp-pill ' + (status === 'ok' ? 'pill-ok' : 'pill-warn') + '">' + t[status] + ' · ' + v + '/' + s.min + '–' + s.max + '</span></div>';
  }
  html += '</div><div class="comp-hint"><span>' + t.compHint + '</span>' +
    (state.hl ? '<button id="clearHl" class="comp-clear">✕ ' + t.clear + ': ' + CATS[state.hl][lang] + '</button>' : '') + '</div>';
  $('comp').innerHTML = html;
  for (const row of $('comp').querySelectorAll('[data-hl]'))
    row.onclick = () => { state.hl = state.hl === row.dataset.hl ? null : row.dataset.hl; renderComp(); renderBrowser(); };
  const cl = $('clearHl'); if (cl) cl.onclick = () => { state.hl = null; renderComp(); renderBrowser(); };
}
