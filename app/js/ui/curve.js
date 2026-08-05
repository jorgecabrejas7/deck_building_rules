import { state } from '../state.js';
import { T } from '../i18n.js';
import { SEGC, PIP } from './constants.js';
import { $, esc, helpIcon } from './helpers.js';
import { bindSugPopovers } from './popover.js';

function segOf(x) {
  if (x.cls.type === 'C') return 'cre';
  const k = x.cls.cat;
  if (k === 'draw') return 'draw';
  if (k === 'rem' || k === 'wipe' || k === 'burn') return 'rem';
  if (k === 'ramp') return 'ramp';
  return 'oth';
}

export function renderCurve() {
  const t = T(), r = state.result;
  const nl = r.cardsInfo.filter(x => x.cls.type !== 'L');
  const bins = Array.from({ length: 8 }, () => ({ cre: 0, draw: 0, rem: 0, ramp: 0, oth: 0 }));
  for (const x of nl) bins[Math.min(Math.floor(x.card.cmc || 0), 7)][segOf(x)] += x.qty;
  const segKeys = state.cf === 'all' ? ['cre', 'draw', 'rem', 'ramp', 'oth'] : [state.cf];
  const totals = bins.map(b => segKeys.reduce((sum, k) => sum + b[k], 0));
  const maxT = Math.max(...totals, 1);
  const nlQty = nl.reduce((sum, x) => sum + x.qty, 0) || 1;
  const avgCmc = (nl.reduce((sum, x) => sum + (x.card.cmc || 0) * x.qty, 0) / nlQty).toFixed(2);
  const H = 200;
  let html = '<div style="grid-column:1/-1;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
    '<span class="secT" style="font-size:11.5px">' + t.curve + '</span>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' + ['all', 'cre', 'draw', 'rem', 'ramp'].map(k =>
      '<button data-cf="' + k + '" style="padding:4px 12px;border-radius:99px;border:1px solid ' + (state.cf === k ? 'var(--text)' : 'var(--border)') + ';background:' + (state.cf === k ? 'var(--text)' : 'transparent') + ';color:' + (state.cf === k ? 'var(--bg)' : 'var(--muted)') + ';font-size:11px;font-weight:600">' + t[k] + '</button>').join('') + '</div></div>' +
    '<div style="display:flex;align-items:flex-end;gap:10px;height:' + (H + 26) + 'px;border-bottom:1px solid var(--border2)">' +
    bins.map((b, i) => {
      const total = totals[i];
      const sel = state.curveBin === i;
      return '<div data-bin="' + i + '" style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;cursor:pointer;border-radius:8px;padding:2px;' + (sel ? 'background:var(--panel2);outline:1.5px solid var(--accent)' : '') + '">' +
        '<span class="mono" style="font-size:11px;font-weight:700;text-align:center;color:' + (total ? 'var(--text)' : 'var(--faint)') + '">' + (total || '') + '</span>' +
        '<div style="display:flex;flex-direction:column;justify-content:flex-end;border-radius:5px 5px 0 0;overflow:hidden">' +
        segKeys.filter(k => b[k] > 0).map(k => '<div title="' + t[k] + ': ' + b[k] + '" style="height:' + Math.round(b[k] / maxT * H) + 'px;background:' + SEGC[k] + ';transition:height .25s"></div>').join('') + '</div>' +
        '<span class="mono" style="font-size:10.5px;color:var(--muted);text-align:center">' + (i === 7 ? '7+' : i) + '</span></div>';
    }).join('') + '</div>';
  if (state.curveBin !== null) {
    const i = state.curveBin;
    const cardsInBin = nl.filter(x => Math.min(Math.floor(x.card.cmc || 0), 7) === i &&
      (state.cf === 'all' || segOf(x) === state.cf))
      .sort((a, b) => (a.card.edhrec_rank || 1e9) - (b.card.edhrec_rank || 1e9));
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<span class="mono" style="font-size:11px;color:var(--muted)">CMC ' + (i === 7 ? '7+' : i) + ' · ' + cardsInBin.reduce((sum, x) => sum + x.qty, 0) + '</span>' +
      cardsInBin.map(x => {
        const c = x.card;
        return '<span class="sugTile" data-img="' + esc(c.img_normal || '') + '" style="display:flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--panel2);border-radius:99px;padding:4px 12px 4px 5px;font-size:11.5px;font-weight:600">' +
          '<span style="width:24px;height:24px;border-radius:99px;flex:none;background:var(--track) center/cover no-repeat;' + (c.img_art ? "background-image:url('" + c.img_art + "')" : '') + '"></span>' +
          esc(x.name) + (x.qty > 1 ? ' ×' + x.qty : '') + '</span>';
      }).join('') +
      '<button id="binClear" style="border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:99px;padding:3px 12px;font-size:11px;font-weight:600">✕</button></div>';
  }
  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--muted);padding-top:2px">' +
    ['cre', 'draw', 'rem', 'ramp', 'oth'].map(k => '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:' + SEGC[k] + '"></span>' + t[k] + helpIcon(k) + '</span>').join('') +
    '<span class="mono" style="margin-left:auto">' + t.avg + ' ' + avgCmc + ' · ' + nlQty + ' ' + t.nonlands + '</span></div></div>';
  // pips
  const pipCnt = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const x of r.cardsInfo) {
    const mana = x.card.mana_cost || '';
    for (const ch of mana.replace(/[{}/]/g, '')) if (pipCnt[ch] !== undefined) pipCnt[ch] += x.qty;
  }
  const pipTot = Object.values(pipCnt).reduce((a, b) => a + b, 0) || 1;
  html += '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:12px">' +
    '<span class="secT" style="font-size:11.5px">' + t.pips + '</span><div style="display:flex;flex-direction:column;gap:9px;font-size:12px">' +
    ['W', 'U', 'B', 'R', 'G'].filter(k => pipCnt[k] > 0).map(k => {
      const pc = Math.round(pipCnt[k] / pipTot * 100);
      const bar = k === 'W' ? 'oklch(0.8 0.07 95)' : PIP[k];
      return '<div style="display:flex;align-items:center;gap:9px"><div style="width:15px;height:15px;border-radius:50%;background:' + PIP[k] + ';border:1px solid var(--muted);flex:none"></div>' +
        '<div style="flex:1;height:8px;background:var(--track);border-radius:4px"><div style="width:' + pc + '%;height:100%;background:' + bar + ';border-radius:4px"></div></div>' +
        '<span class="mono" style="font-size:10.5px;color:var(--muted);width:36px;text-align:right">' + pc + '%</span></div>';
    }).join('') + '</div></div>';
  // price bands
  const bandDefs = [['<€1', pp => pp < 1, 'oklch(0.7 0.11 150)'], ['€1–5', pp => pp >= 1 && pp < 5, 'oklch(0.75 0.1 85)'], ['€5–10', pp => pp >= 5 && pp < 10, 'oklch(0.72 0.11 70)'], ['€10–20', pp => pp >= 10 && pp < 20, 'oklch(0.68 0.12 55)'], ['€20–30', pp => pp >= 20 && pp < 30, 'oklch(0.64 0.13 40)'], ['>€30', pp => pp >= 30, 'oklch(0.6 0.15 25)']];
  const bandCounts = bandDefs.map(([, f]) => r.cardsInfo.filter(x => x.card.price != null && f(x.card.price)).reduce((sum, x) => sum + x.qty, 0));
  const maxB = Math.max(...bandCounts, 1);
  html += '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:12px">' +
    '<span class="secT" style="font-size:11.5px">' + t.bands + '</span><div class="mono" style="display:flex;flex-direction:column;gap:9px;font-size:11px;color:var(--muted)">' +
    bandDefs.map(([lbl, , c], i) => '<div style="display:flex;align-items:center;gap:9px"><span style="width:48px">' + lbl + '</span>' +
      '<div style="flex:1;height:8px;background:var(--track);border-radius:4px"><div style="width:' + Math.round(bandCounts[i] / maxB * 100) + '%;height:100%;background:' + c + ';border-radius:4px"></div></div>' +
      '<span style="width:26px;text-align:right">' + bandCounts[i] + '</span></div>').join('') + '</div></div>';
  $('curveWrap').innerHTML = html;
  for (const b of $('curveWrap').querySelectorAll('[data-cf]')) b.onclick = (e) => { e.stopPropagation(); state.cf = b.dataset.cf; renderCurve(); };
  for (const b of $('curveWrap').querySelectorAll('[data-bin]')) b.onclick = () => { state.curveBin = state.curveBin === +b.dataset.bin ? null : +b.dataset.bin; renderCurve(); };
  const bc = document.getElementById('binClear'); if (bc) bc.onclick = (e) => { e.stopPropagation(); state.curveBin = null; renderCurve(); };
  bindSugPopovers($('curveWrap'));
}
