import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { DIAL_META, MSG, BLOCK_MSG, dialName } from './constants.js';
import { $, esc } from './helpers.js';
import { checkCombos } from '../pipeline.js';
import { orderedCuts, powerUpOptions } from '../advice.js';
import { bindSugPopovers } from './popover.js';
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
  html += adviceSections();
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
  bindSugPopovers($('power'));
  const cb = document.getElementById('comboBtn');
  if (cb) cb.onclick = checkCombos;
  for (const b of $('power').querySelectorAll('[data-goto-tips]'))
    b.onclick = () => { state.tab = 'tips'; renderAll(); };
}

// The two clearly separated advice blocks: shed points down to Tier 1 (or back
// to pod level), and spend remaining budget up to Tier 2.
function adviceSections() {
  const t = T(), r = state.result, ev = r.evalRes, lang = state.lang, es = lang === 'es';
  const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
  let html = '';
  if (ev.tier !== 'tier1') {
    const need = ev.tier === 'above' ? Math.max(ev.points - t2, 0) : ev.points - t1;
    const cuts = orderedCuts(r).slice(0, 6);
    html += '<div class="adv-box adv-down">' +
      '<div class="adv-head"><span class="adv-arrow">▼</span><span class="secT">' +
      (ev.tier === 'above' ? t.advDownPod : t.advDownT1) + '</span>' +
      '<span class="mono adv-need">' + (ev.tier === 'above'
        ? (ev.violations.length ? (es ? 'arregla las violaciones' : 'fix the violations') + (need ? ' · −' + need + ' pts' : '') : '−' + need + ' pts')
        : '−' + need + ' pt' + (need > 1 ? 's' : '')) + '</span></div>';
    if (cuts.length) {
      html += '<ol class="adv-cuts">' + cuts.map(c => {
        const card = cardCache[c.name] || {};
        const rk = card.edhrec_rank ? ' · EDHREC #' + fmtRank(card.edhrec_rank) : '';
        return '<li><span class="sugTile card-chip" data-img="' + esc(card.img_normal || '') + '">' +
          '<span class="chip-art"' + (card.img_art ? ' style="background-image:url(\'' + card.img_art + '\')"' : '') + '></span>' +
          esc(c.name) + '</span>' +
          '<span class="adv-why mono">' + (c.dPts > 0 ? '−' + c.dPts + ' pts' : '') +
          (c.fixes ? (c.dPts > 0 ? ' · ' : '') + (es ? 'arregla violación' : 'fixes violation') : '') +
          ' · ' + esc(dialName(c.dial, lang)) + rk + '</span></li>';
      }).join('') + '</ol>' +
      '<div class="adv-note">' + t.advCutOrder + '</div>';
    }
    html += '<button data-goto-tips class="btn-ghost-sm">' + t.advSeeCards + '</button></div>';
  }
  if (ev.tier !== 'above') {
    const { room, options } = powerUpOptions(r);
    const affordable = options.filter(o => !o.blocked && o.cost <= room);
    const open = [...affordable.filter(o => o.cost > 0).sort((a, b) => a.cost - b.cost),
      ...affordable.filter(o => o.cost === 0)].slice(0, 5);
    const blocked = options.filter(o => o.blocked);
    html += '<div class="adv-box adv-up">' +
      '<div class="adv-head"><span class="adv-arrow">▲</span><span class="secT">' + t.advUp + '</span>' +
      '<span class="mono adv-need">' + room + ' pt' + (room !== 1 ? 's' : '') + ' ' + (es ? 'de margen' : 'of headroom') + '</span></div>';
    if (ev.tier === 'tier1' && t1 - ev.points > 0) {
      html += '<div class="adv-note">' + (es
        ? 'Sin salir de Tier 1 aún te caben ' + (t1 - ev.points) + ' pts; a partir de ahí entras en Tier 2 (≤' + t2 + ').'
        : 'You can still add ' + (t1 - ev.points) + ' pts without leaving Tier 1; beyond that you enter Tier 2 (≤' + t2 + ').') + '</div>';
    }
    html += '<div class="adv-ups">' + open.map(o =>
      '<div class="adv-up-row"><span class="mono adv-cost">' + (o.cost === 0 ? t.advFree : '+' + o.cost + ' pt' + (o.cost > 1 ? 's' : '')) + '</span>' +
      '<span>' + esc(upLabel(o, lang)) + '</span></div>').join('') + '</div>';
    if (blocked.length) {
      html += '<div class="adv-blocked">' + blocked.map(o =>
        '<div class="adv-up-row muted"><span class="adv-lock">🔒</span><span>' + esc(dialName(o.dial, lang)) + ' — ' +
        esc(BLOCK_MSG[o.blocked] ? BLOCK_MSG[o.blocked][lang] : o.blocked) + '</span></div>').join('') + '</div>';
    }
    html += '<button data-goto-tips class="btn-ghost-sm">' + t.advSeeCards + '</button></div>';
  }
  return html;
}

function upLabel(o, lang) {
  const es = lang === 'es';
  const name = dialName(o.dial, lang);
  if (o.dial === 'combos') {
    return es ? (o.cost === 0 ? 'Un combo infinito — los 2 primeros son gratis (llevas ' + o.value + ')' : 'Otro combo infinito (llevas ' + o.value + ')')
      : (o.cost === 0 ? 'An infinite combo — the first 2 are free (you run ' + o.value + ')' : 'Another infinite combo (you run ' + o.value + ')');
  }
  return es ? (name + ': de ' + o.value + ' a ' + (o.value + 1)) : (name + ': from ' + o.value + ' to ' + (o.value + 1));
}

function fmtRank(r) { return r >= 1000 ? Math.round(r / 1000) + 'k' : String(r); }

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
    ' <span class="txt-muted">→ ' + esc(c.features[0] || '') + '</span></div>').join('') + '</div>';
}
