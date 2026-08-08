import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { DIAL_META, MSG, comboFeatureText } from './constants.js';
import { $, esc } from './helpers.js';
import { checkCombos } from '../pipeline.js';
import { bindSugPopovers } from './popover.js';

// The precon-calibrated zone meter, full-size on active dials and miniature
// on compressed in-range rows.
function meterHtml(spec, value, mini) {
  const stepKeys = Object.keys(spec.point_steps || {}).map(Number);
  const lastStep = stepKeys.length ? Math.max(...stepKeys) : spec.baseline_max;
  const axis = Math.max(lastStep, value, 1) * 1.4;
  const z0 = (spec.baseline_max + 0.5) / axis, z1 = Math.max((lastStep - spec.baseline_max) / axis, 0), z2 = Math.max(1 - z0 - z1, 0.08);
  const pos = Math.min(value / axis * 100, 98);
  // The colored meter is decorative; the lead (non-mini) dials get a hidden text
  // equivalent of zone + value/range (mini rows already carry a text pill).
  const t = T();
  const vhText = mini ? '' : '<span class="vh">' +
    (value <= spec.baseline_max ? t.zoneIn : t.zoneOver) + ' · ' + value + '/≤' + spec.baseline_max + '</span>';
  return '<div class="dial-meter' + (mini ? ' mini' : '') + '" aria-hidden="true">' +
    '<div class="dial-zone a" style="--f:' + z0.toFixed(3) + '"></div>' +
    '<div class="dial-zone b" style="--f:' + z1.toFixed(3) + '"></div>' +
    '<div class="dial-zone c" style="--f:' + z2.toFixed(3) + '"></div>' +
    '<div class="dial-marker" style="--x:' + pos.toFixed(1) + '%"></div></div>' + vhText;
}

// Rule prose lives behind the shared "?" popover (see popover.js).
const dialHelpIcon = (k) => {
  const t = T(), m = DIAL_META.find(d => d.k === k);
  return '<button type="button" class="catHelp" data-dial="' + k +
    '" aria-label="' + esc(t.helpAria + ': ' + (m ? m.name[state.lang] : k)) + '">?</button>';
};

// Dials that cost points, violate, or await the combo check outrank the rest.
const rank = (d) => d.over ? 1000 : d.pts * 10 + (d.value > d.spec.baseline_max ? 1 : 0);

export function renderPower() {
  const t = T(), r = state.result, ev = r.evalRes, lang = state.lang;
  const budgetN = RULES.tiers.tier2.max_points, t1N = RULES.tiers.tier1.max_points;
  const cd = state.combosData;
  const comboChecked = cd && cd.status === 'done';
  const dials = DIAL_META.map(m => {
    const spec = RULES.dials[m.k];
    const value = r.stats[m.k] || 0;
    const pts = ev.breakdown[m.k] || 0;
    const over = !!spec.forbidden && value > 0;
    const isCombo = m.k === 'combos';
    return { m, spec, value, pts, over, isCombo,
      active: over || pts > 0 || value > spec.baseline_max || (isCombo && (!comboChecked || value > 0)) };
  });
  const activeD = dials.filter(d => d.active).sort((a, b) => rank(b) - rank(a));
  const quietD = dials.filter(d => !d.active);

  let html = '<div class="power-head">' +
    '<h2 class="secT secT-lg">' + t.power + '</h2><span class="mono power-pts">' + ev.points + ' ' + t.ptsOf + ' ' + budgetN + '</span></div>';

  for (const d of activeD) {
    const { m, spec, value, pts, over, isCombo } = d;
    // Empty when the dial costs nothing: a "0" next to the value reads as one
    // duplicated digit on the stacked mobile row (the meter already says it).
    const ptsLabel = over ? '✕' : (pts > 0 ? '+' + pts + (pts === 1 ? ' pt' : ' pts') : '');
    const ptsTone = over ? 'bad' : pts === 0 ? 'good' : pts >= 3 ? 'bad' : 'warn';
    const shownValue = isCombo && !comboChecked ? '–' : value;
    const chips = (!isCombo && value > spec.baseline_max ? (r.flagged[m.k] || []) : []).slice(0, 10);
    const detail = (chips.length ? '<div class="chip-row">' + chips.map(([n]) => {
      const c = cardCache[n] || {};
      return '<span class="card-chip">' +
        '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
        esc(n) + ' <span class="mono chip-price">' + (c.price != null ? '€' + c.price : '—') + '</span></span>';
    }).join('') + '</div>' : '') + (isCombo ? comboBlock() : '');
    html += '<div class="dial">' +
      '<div class="dial-row">' +
      '<span class="dial-name">' + m.name[lang] + dialHelpIcon(m.k) + '</span>' +
      '<span class="mono dial-val">' + shownValue + '</span>' +
      meterHtml(spec, value, false) +
      '<span class="mono dial-pts ' + ptsTone + '">' + ptsLabel + '</span></div>' +
      (detail ? '<div class="dial-detail"><div class="dial-detail-bar"></div>' +
        '<div class="dial-detail-body">' + detail + '</div></div>' : '') + '</div>';
  }
  if (!activeD.length) html += '<div class="note-ok power-clear-note">✓ ' + t.powerAllQuiet + '</div>';

  // violations + flags
  const viols = ev.violations.map(v => {
    if (v.id === 'conditional') return (MSG.conditional[v.condId] ? MSG.conditional[v.condId][lang](v) : v.condId);
    return MSG[v.id] ? MSG[v.id][lang](v) : JSON.stringify(v);
  });
  // Flags carry the rules-file prose as their id; the stable key is the dial.
  const flags = ev.flags.map(f => MSG['flag_' + f.dial] ? MSG['flag_' + f.dial][lang](f) : f.id);
  const nearCap = (r.flagged.price_20_30 || []).map(([n]) => n);
  if (nearCap.length) flags.push(MSG.flag_near_cap[lang]({ cards: nearCap }));
  if (viols.length) html += '<div class="alert tone-bad">' +
    '<span class="alert-title">✕ ' + t.viols + '</span>' +
    viols.map(v => '<div class="alert-line">' + esc(v) + '</div>').join('') + '</div>';
  if (flags.length) html += '<div class="alert tone-warn">' +
    '<span class="alert-title">⚠ ' + t.flags + '</span>' +
    flags.map(f => '<div class="alert-line">' + esc(f) + '</div>').join('') + '</div>';

  // in-range dials, compressed: one line each, zone state as text
  if (quietD.length) {
    html += '<div class="dial-quiet">' +
      '<div class="quiet-head"><h3 class="mini-title">' + t.quietZone + '</h3>' +
      '<span class="mono quiet-n">' + quietD.length + '/' + dials.length + '</span></div>' +
      quietD.map(d => '<div class="qrow">' +
        '<span class="qrow-name">' + d.m.name[lang] + dialHelpIcon(d.m.k) + '</span>' +
        meterHtml(d.spec, d.value, true) +
        '<span class="comp-pill pill-ok">' + t.ok + ' · ' +
        (d.spec.baseline_max > 0 ? d.value + '/≤' + d.spec.baseline_max : String(d.value)) + '</span></div>').join('') + '</div>';
  }

  // budget gauge — scale spans 0..(t2+3) so overspending stays visible
  const gMax = budgetN + 3;
  const pct = Math.min(ev.points / gMax * 100, 100);
  html += '<div class="gauge-wrap">' +
    '<h3 class="mini-title">' + t.budget + '</h3>' +
    '<div class="gauge" aria-hidden="true">' +
    '<div class="gauge-fill" style="--w:' + pct.toFixed(1) + '%"></div>' +
    '<div class="gauge-tick" style="--x:' + (t1N / gMax * 100).toFixed(1) + '%"></div>' +
    '<div class="gauge-tick" style="--x:' + (budgetN / gMax * 100).toFixed(1) + '%"></div></div>' +
    '<div class="mono gauge-scale"><span>0</span><span>Tier 1 ≤' + t1N + '</span><span>Tier 2 ≤' + budgetN + '</span><span>' + gMax + '</span></div></div>';
  $('power').innerHTML = html;
  bindSugPopovers($('power'));
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
      (isFile ? '' : '<div class="combo-row">' +
        '<button id="comboBtn" class="btn-accent-sm">' + t.comboRetry + '</button></div>') + '</div>';
  }
  if (cd.status === 'checking') return '<div class="note-muted">' + t.comboChecking + '</div>';
  const inf = cd.list.filter(c => c.infinite);
  if (!inf.length) return '<div class="note-ok">✓ ' + t.comboNone +
    (cd.list.length ? ' (' + cd.list.length + ' ' + t.comboOthers + ')' : '') + '</div>';
  return '<div class="stack-6">' + inf.map(c =>
    '<div class="combo-line"><b>' + c.cards.map(esc).join(' + ') + '</b>' +
    (c.templates && c.templates.length ? ' <span class="txt-muted">+ ' + c.templates.map(esc).join(' + ') + '</span>' : '') +
    ' <span class="txt-muted">→ ' + esc(comboFeatureText(c.features[0] || '', state.lang)) + '</span></div>').join('') + '</div>';
}
