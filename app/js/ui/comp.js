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
  let html = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">' +
    '<span style="font-size:12px;font-weight:700;letter-spacing:0.06em;color:var(--compMut)">' + t.comp + '</span>' +
    '<span style="font-size:11px;color:var(--compMut)">' + t.compTargets + ' ' + esc(archName()) + '</span></div><div style="display:flex;flex-direction:column">';
  for (const s of compSlots()) {
    const v = tagCount(s.cat);
    const scale = Math.max(s.max * 1.5, v * 1.15, 1);
    const status = v < s.min ? 'few' : v > s.max ? 'many' : 'ok';
    html += '<div data-hl="' + s.cat + '" style="display:grid;grid-template-columns:minmax(90px,130px) 1fr minmax(120px,auto);gap:12px;align-items:center;font-size:13px;padding:9px 10px;border-radius:8px;cursor:pointer;background:' + (state.hl === s.cat ? 'var(--panel)' : 'transparent') + '">' +
      '<span style="font-weight:600">' + catLabel(s.cat, lang) + '</span>' +
      '<div style="position:relative;height:9px;background:var(--compBd);border-radius:5px">' +
      '<div style="position:absolute;left:' + (s.min / scale * 100).toFixed(1) + '%;width:' + ((s.max - s.min) / scale * 100).toFixed(1) + '%;top:0;bottom:0;background:' + (state.hl === s.cat ? 'var(--accent)' : 'var(--faint)') + ';border-radius:5px"></div>' +
      '<div style="position:absolute;left:' + Math.min(v / scale * 100, 98).toFixed(1) + '%;top:-3px;width:2.5px;height:15px;background:var(--marker);border-radius:2px"></div></div>' +
      '<span style="justify-self:end;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:' + (status === 'ok' ? 'var(--okBg)' : 'var(--warnBg)') + ';color:' + (status === 'ok' ? 'var(--okFg)' : 'var(--warnFg)') + '">' + t[status] + ' · ' + v + '/' + s.min + '–' + s.max + '</span></div>';
  }
  html += '</div><div style="display:flex;gap:10px;align-items:center;font-size:11.5px;color:var(--compMut)"><span>' + t.compHint + '</span>' +
    (state.hl ? '<button id="clearHl" style="border:1px solid var(--compBd);background:transparent;color:var(--compMut);border-radius:99px;padding:3px 12px;font-size:11px;font-weight:600">✕ ' + t.clear + ': ' + CATS[state.hl][lang] + '</button>' : '') + '</div>';
  $('comp').innerHTML = html;
  for (const row of $('comp').querySelectorAll('[data-hl]'))
    row.onclick = () => { state.hl = state.hl === row.dataset.hl ? null : row.dataset.hl; renderComp(); renderBrowser(); };
  const cl = $('clearHl'); if (cl) cl.onclick = () => { state.hl = null; renderComp(); renderBrowser(); };
}
