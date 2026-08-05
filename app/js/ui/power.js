import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { DIAL_META, MSG } from './constants.js';
import { $, esc } from './helpers.js';
import { buildTip, recompute } from '../pipeline.js';
import { renderAll } from '../main.js';

export function renderPower() {
  const t = T(), r = state.result, ev = r.evalRes, lang = state.lang;
  const budgetN = RULES.tiers.tier2.max_points, t1N = RULES.tiers.tier1.max_points;
  let html = '<div class="power-head">' +
    '<span class="secT">' + t.power + '</span><span class="mono power-pts">' + ev.points + ' ' + t.ptsOf + ' ' + budgetN + '</span></div>';
  for (const m of DIAL_META) {
    const spec = RULES.dials[m.k];
    const value = r.stats[m.k] || 0;
    const stepKeys = Object.keys(spec.point_steps || {}).map(Number);
    const lastStep = stepKeys.length ? Math.max(...stepKeys) : spec.baseline_max;
    const axis = Math.max(lastStep, value, 1) * 1.4;
    const z0 = (spec.baseline_max + 0.5) / axis, z1 = Math.max((lastStep - spec.baseline_max) / axis, 0), z2 = Math.max(1 - z0 - z1, 0.08);
    const pos = Math.min(value / axis * 100, 98);
    const pts = ev.breakdown[m.k] || 0;
    const over = !!spec.forbidden && value > 0;
    const ptsLabel = over ? '✕' : (pts > 0 ? '+' + pts + (pts === 1 ? ' pt' : ' pts') : '0');
    const ptsTone = over ? 'bad' : pts === 0 ? 'good' : pts >= 3 ? 'bad' : 'warn';
    const isCombo = m.k === 'combos';
    const cd = state.combosData;
    const comboChecked = isCombo && cd && cd.status === 'done';
    const shownValue = isCombo && !comboChecked ? '–' : value;
    const chips = (!isCombo && value > spec.baseline_max ? (r.flagged[m.k] || []) : []).slice(0, 10);
    html += '<div class="dial">' +
      '<div class="dial-row">' +
      '<span class="dial-name">' + m.name[lang] + '</span>' +
      '<span class="mono dial-val">' + shownValue + '</span>' +
      '<div class="dial-meter">' +
      '<div class="dial-zone a" style="--f:' + z0.toFixed(3) + '"></div>' +
      '<div class="dial-zone b" style="--f:' + z1.toFixed(3) + '"></div>' +
      '<div class="dial-zone c" style="--f:' + z2.toFixed(3) + '"></div>' +
      '<div class="dial-marker" style="--x:' + pos.toFixed(1) + '%"></div></div>' +
      '<span class="mono dial-pts ' + ptsTone + '">' + ptsLabel + '</span></div>' +
      '<div class="dial-detail"><div class="dial-detail-bar"></div>' +
      '<div class="dial-detail-body">' +
      '<div class="dial-help">' + m.help[lang] + '</div>' +
      (chips.length ? '<div class="chip-row">' + chips.map(([n]) => {
        const c = cardCache[n] || {};
        return '<span class="card-chip">' +
          '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
          esc(n) + ' <span class="mono chip-price">' + (c.price != null ? '€' + c.price : '—') + '</span></span>';
      }).join('') + '</div>' : '') +
      (isCombo ? comboBlock() : '') + '</div></div></div>';
  }
  // violations + flags
  const viols = ev.violations.map(v => {
    if (v.id === 'conditional') return (MSG.conditional[v.condId] ? MSG.conditional[v.condId][lang](v) : v.condId);
    return MSG[v.id] ? MSG[v.id][lang](v) : JSON.stringify(v);
  });
  const flags = ev.flags.map(f => MSG['flag_' + f.id] ? MSG['flag_' + f.id][lang](f) : f.id);
  const nearCap = (r.flagged.price_20_30 || []).map(([n]) => n);
  if (nearCap.length) flags.push(MSG.flag_near_cap[lang]({ cards: nearCap }));
  if (viols.length) html += '<div class="alert tone-bad">' +
    '<span class="alert-title">✕ ' + t.viols + '</span>' +
    viols.map(v => '<div class="alert-line">' + esc(v) + '</div>').join('') + '</div>';
  if (flags.length) html += '<div class="alert tone-warn">' +
    '<span class="alert-title">⚠ ' + t.flags + '</span>' +
    flags.map(f => '<div class="alert-line">' + esc(f) + '</div>').join('') + '</div>';
  html += '<div class="tip-box">' +
    '<span class="mono tip-tag">TIP</span>' +
    '<div class="tip-text"><b>' + t.tipT + ':</b> ' + esc(buildTip()) + '</div></div>';
  // budget gauge — scale spans 0..(t2+3) so overspending stays visible
  const gMax = budgetN + 3;
  const pct = Math.min(ev.points / gMax * 100, 100);
  html += '<div class="gauge-wrap">' +
    '<span class="mini-title">' + t.budget + '</span>' +
    '<div class="gauge">' +
    '<div class="gauge-fill" style="--w:' + pct.toFixed(1) + '%"></div>' +
    '<div class="gauge-tick" style="--x:' + (t1N / gMax * 100).toFixed(1) + '%"></div>' +
    '<div class="gauge-tick" style="--x:' + (budgetN / gMax * 100).toFixed(1) + '%"></div></div>' +
    '<div class="mono gauge-scale"><span>0</span><span>Tier 1 ≤' + t1N + '</span><span>Tier 2 ≤' + budgetN + '</span><span>' + gMax + '</span></div></div>';
  $('power').innerHTML = html;
  const cb = document.getElementById('comboBtn');
  if (cb) cb.onclick = checkCombos;
}

function comboBlock() {
  const t = T(), cd = state.combosData;
  const isFile = location.protocol === 'file:';
  if (!cd || cd.status === 'error') {
    return '<div class="stack-8">' +
      (isFile ? '<div class="note-warn">' + t.fileProto + '</div>' : '') +
      (cd && cd.status === 'error' ? '<div class="note-bad">' + t.comboErr + '</div>' : '') +
      '<div class="combo-row">' +
      '<button id="comboBtn" class="btn-accent-sm">' + t.comboBtn + '</button>' +
      '<span class="note-sm">⚠ ' + t.comboProxyNote + '</span></div></div>';
  }
  if (cd.status === 'checking') return '<div class="note-muted">' + t.comboChecking + '</div>';
  const inf = cd.list.filter(c => c.infinite);
  if (!inf.length) return '<div class="note-ok">✓ ' + t.comboNone +
    (cd.list.length ? ' (' + cd.list.length + ' ' + t.comboOthers + ')' : '') + '</div>';
  return '<div class="stack-6">' + inf.map(c =>
    '<div class="combo-line"><b>' + c.cards.map(esc).join(' + ') + '</b>' +
    ' <span class="txt-muted">→ ' + esc(c.features[0] || '') + '</span></div>').join('') + '</div>';
}

let comboDb = null;
export async function checkCombos() {
  if (!state.result || (state.combosData && state.combosData.status === 'checking')) return;
  state.combosData = { status: 'checking', list: [], count: 0 };
  renderPower();
  try {
    if (!comboDb) comboDb = await (await fetch('../data/combos.json')).json();
    const list = PodEngine.matchCombos(state.deck.entries.map(e => e.name), comboDb);
    state.combosData = { status: 'done', list, count: list.length, dbVersion: comboDb.version };
    recompute();
  } catch (e) {
    console.error(e);
    state.combosData = { status: 'error', list: [], count: 0 };
  }
  renderAll();
}
