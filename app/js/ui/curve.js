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
  let html = '<div class="curve-card span">' +
    '<div class="row-between">' +
    '<span class="secT">' + t.curve + '</span>' +
    '<div class="curve-filters">' + ['all', 'cre', 'draw', 'rem', 'ramp'].map(k =>
      '<button data-cf="' + k + '" class="cf-btn' + (state.cf === k ? ' active' : '') + '">' + t[k] + '</button>').join('') + '</div></div>' +
    '<div class="curve-bins">' +
    bins.map((b, i) => {
      const total = totals[i];
      const sel = state.curveBin === i;
      return '<div data-bin="' + i + '" class="curve-bin' + (sel ? ' sel' : '') + '">' +
        '<span class="mono bin-count' + (total ? ' has' : '') + '">' + (total || '') + '</span>' +
        '<div class="bin-stack">' +
        segKeys.filter(k => b[k] > 0).map(k => '<div title="' + t[k] + ': ' + b[k] + '" class="bin-seg" style="--h:' + Math.round(b[k] / maxT * H) + 'px;--c:' + SEGC[k] + '"></div>').join('') + '</div>' +
        '<span class="mono bin-label">' + (i === 7 ? '7+' : i) + '</span></div>';
    }).join('') + '</div>';
  if (state.curveBin !== null) {
    const i = state.curveBin;
    const cardsInBin = nl.filter(x => Math.min(Math.floor(x.card.cmc || 0), 7) === i &&
      (state.cf === 'all' || segOf(x) === state.cf))
      .sort((a, b) => (a.card.edhrec_rank || 1e9) - (b.card.edhrec_rank || 1e9));
    html += '<div class="bin-cards">' +
      '<span class="mono">CMC ' + (i === 7 ? '7+' : i) + ' · ' + cardsInBin.reduce((sum, x) => sum + x.qty, 0) + '</span>' +
      cardsInBin.map(x => {
        const c = x.card;
        return '<span class="sugTile card-chip" data-img="' + esc(c.img_normal || '') + '">' +
          '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
          esc(x.name) + (x.qty > 1 ? ' ×' + x.qty : '') + '</span>';
      }).join('') +
      '<button id="binClear" class="pill-clear">✕</button></div>';
  }
  html += '<div class="curve-legend">' +
    ['cre', 'draw', 'rem', 'ramp', 'oth'].map(k => '<span class="legend-item"><span class="legend-swatch" style="--c:' + SEGC[k] + '"></span>' + t[k] + helpIcon(k) + '</span>').join('') +
    '<span class="mono avg">' + t.avg + ' ' + avgCmc + ' · ' + nlQty + ' ' + t.nonlands + '</span></div></div>';
  // pips
  const pipCnt = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const x of r.cardsInfo) {
    const mana = x.card.mana_cost || '';
    for (const ch of mana.replace(/[{}/]/g, '')) if (pipCnt[ch] !== undefined) pipCnt[ch] += x.qty;
  }
  const pipTot = Object.values(pipCnt).reduce((a, b) => a + b, 0) || 1;
  html += '<div class="curve-card">' +
    '<span class="secT">' + t.pips + '</span><div class="pip-rows">' +
    ['W', 'U', 'B', 'R', 'G'].filter(k => pipCnt[k] > 0).map(k => {
      const pc = Math.round(pipCnt[k] / pipTot * 100);
      const bar = k === 'W' ? 'oklch(0.8 0.07 95)' : PIP[k];
      return '<div class="pip-row"><div class="pip-dot" style="--pip:' + PIP[k] + '"></div>' +
        '<div class="pip-track"><div class="pip-fill" style="--w:' + pc + '%;--c:' + bar + '"></div></div>' +
        '<span class="mono pip-pct">' + pc + '%</span></div>';
    }).join('') + '</div></div>';
  // price bands
  const bandDefs = [['<€1', pp => pp < 1, 'oklch(0.7 0.11 150)'], ['€1–5', pp => pp >= 1 && pp < 5, 'oklch(0.75 0.1 85)'], ['€5–10', pp => pp >= 5 && pp < 10, 'oklch(0.72 0.11 70)'], ['€10–20', pp => pp >= 10 && pp < 20, 'oklch(0.68 0.12 55)'], ['€20–30', pp => pp >= 20 && pp < 30, 'oklch(0.64 0.13 40)'], ['>€30', pp => pp >= 30, 'oklch(0.6 0.15 25)']];
  const bandCounts = bandDefs.map(([, f]) => r.cardsInfo.filter(x => x.card.price != null && f(x.card.price)).reduce((sum, x) => sum + x.qty, 0));
  const maxB = Math.max(...bandCounts, 1);
  html += '<div class="curve-card">' +
    '<span class="secT">' + t.bands + '</span><div class="mono band-rows">' +
    bandDefs.map(([lbl, , c], i) => '<div class="band-row"><span>' + lbl + '</span>' +
      '<div class="pip-track"><div class="pip-fill" style="--w:' + Math.round(bandCounts[i] / maxB * 100) + '%;--c:' + c + '"></div></div>' +
      '<span>' + bandCounts[i] + '</span></div>').join('') + '</div></div>';
  $('curveWrap').innerHTML = html;
  for (const b of $('curveWrap').querySelectorAll('[data-cf]')) b.onclick = (e) => { e.stopPropagation(); state.cf = b.dataset.cf; renderCurve(); };
  for (const b of $('curveWrap').querySelectorAll('[data-bin]')) b.onclick = () => { state.curveBin = state.curveBin === +b.dataset.bin ? null : +b.dataset.bin; renderCurve(); };
  const bc = document.getElementById('binClear'); if (bc) bc.onclick = (e) => { e.stopPropagation(); state.curveBin = null; renderCurve(); };
  bindSugPopovers($('curveWrap'));
}
