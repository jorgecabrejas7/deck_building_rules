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
  let html = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:8px">' +
    '<span class="secT">' + t.power + '</span><span class="mono" style="font-size:11.5px;color:var(--muted)">' + ev.points + ' ' + t.ptsOf + ' ' + budgetN + '</span></div>';
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
    const ptsColor = over ? 'var(--bad)' : pts === 0 ? 'var(--good)' : pts >= 3 ? 'var(--bad)' : 'var(--warn)';
    const isCombo = m.k === 'combos';
    const cd = state.combosData;
    const comboChecked = isCombo && cd && cd.status === 'done';
    const shownValue = isCombo && !comboChecked ? '–' : value;
    const chips = (!isCombo && value > spec.baseline_max ? (r.flagged[m.k] || []) : []).slice(0, 10);
    html += '<div style="display:flex;flex-direction:column;gap:12px;padding:14px 0;border-top:1px solid var(--border2)">' +
      '<div style="display:grid;grid-template-columns:minmax(120px,150px) 30px 1fr 56px;gap:12px;align-items:center;font-size:13px">' +
      '<span style="font-weight:600">' + m.name[lang] + '</span>' +
      '<span class="mono" style="font-weight:600;font-size:15px">' + shownValue + '</span>' +
      '<div style="position:relative;height:9px;display:flex;gap:2px">' +
      '<div style="flex:' + z0.toFixed(3) + ';background:var(--zoneA);border-radius:4px"></div>' +
      '<div style="flex:' + z1.toFixed(3) + ';background:var(--zoneB);border-radius:4px"></div>' +
      '<div style="flex:' + z2.toFixed(3) + ';background:var(--zoneC);border-radius:4px"></div>' +
      '<div style="position:absolute;left:' + pos.toFixed(1) + '%;top:-3px;width:2.5px;height:15px;background:var(--marker);border-radius:2px"></div></div>' +
      '<span class="mono" style="font-weight:600;font-size:12.5px;color:' + ptsColor + ';text-align:right">' + ptsLabel + '</span></div>' +
      '<div style="display:flex;gap:14px"><div style="width:3px;border-radius:2px;background:var(--border);flex:none"></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
      '<div style="font-size:12.5px;line-height:1.6;color:var(--muted);max-width:760px">' + m.help[lang] + '</div>' +
      (chips.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' + chips.map(([n]) => {
        const c = cardCache[n] || {};
        return '<span style="display:flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--panel2);border-radius:99px;padding:4px 12px 4px 5px;font-size:11.5px;font-weight:600">' +
          '<span style="width:24px;height:24px;border-radius:99px;flex:none;background:var(--track) center/cover no-repeat;' + (c.img_art ? 'background-image:url(\'' + c.img_art + '\')' : '') + '"></span>' +
          esc(n) + ' <span class="mono" style="color:var(--muted)">' + (c.price != null ? '€' + c.price : '—') + '</span></span>';
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
  if (viols.length) html += '<div style="margin-top:12px;background:var(--badBg);border:1px solid var(--badBd);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--badFg)">✕ ' + t.viols + '</span>' +
    viols.map(v => '<div style="font-size:13px;line-height:1.55;color:var(--badFg)">' + esc(v) + '</div>').join('') + '</div>';
  if (flags.length) html += '<div style="margin-top:10px;background:var(--warnBg);border:1px solid var(--warnBd);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--warnFg)">⚠ ' + t.flags + '</span>' +
    flags.map(f => '<div style="font-size:13px;line-height:1.55;color:var(--warnFg)">' + esc(f) + '</div>').join('') + '</div>';
  html += '<div style="margin-top:12px;background:var(--tipBg);border:1px solid var(--tipBd);border-radius:10px;padding:14px 18px;display:flex;gap:12px;align-items:flex-start">' +
    '<span class="mono" style="font-weight:700;font-size:9.5px;background:var(--tipFg);color:var(--tipBg);border-radius:5px;padding:3px 6px;flex:none;margin-top:2px">TIP</span>' +
    '<div style="font-size:12.5px;line-height:1.6;color:var(--tipFg)"><b>' + t.tipT + ':</b> ' + esc(buildTip()) + '</div></div>';
  // budget gauge — scale spans 0..(t2+3) so overspending stays visible
  const gMax = budgetN + 3;
  const pct = Math.min(ev.points / gMax * 100, 100);
  html += '<div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--muted)">' + t.budget + '</span>' +
    '<div style="position:relative;height:14px;background:var(--track);border-radius:7px">' +
    '<div style="position:absolute;left:0;top:0;bottom:0;width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,oklch(0.7 0.12 145),oklch(0.78 0.11 85) 60%,oklch(0.62 0.15 25));border-radius:7px"></div>' +
    '<div style="position:absolute;left:' + (t1N / gMax * 100).toFixed(1) + '%;top:-4px;bottom:-4px;width:2px;background:var(--muted)"></div>' +
    '<div style="position:absolute;left:' + (budgetN / gMax * 100).toFixed(1) + '%;top:-4px;bottom:-4px;width:2px;background:var(--muted)"></div></div>' +
    '<div class="mono" style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)"><span>0</span><span>Tier 1 ≤' + t1N + '</span><span>Tier 2 ≤' + budgetN + '</span><span>' + gMax + '</span></div></div>';
  $('power').innerHTML = html;
  const cb = document.getElementById('comboBtn');
  if (cb) cb.onclick = checkCombos;
}

function comboBlock() {
  const t = T(), cd = state.combosData;
  const isFile = location.protocol === 'file:';
  if (!cd || cd.status === 'error') {
    return '<div style="display:flex;flex-direction:column;gap:8px">' +
      (isFile ? '<div style="font-size:12px;color:var(--warnFg)">' + t.fileProto + '</div>' : '') +
      (cd && cd.status === 'error' ? '<div style="font-size:12px;color:var(--badFg)">' + t.comboErr + '</div>' : '') +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button id="comboBtn" style="background:var(--accent);color:var(--accentFg);border:none;border-radius:7px;padding:7px 16px;font-size:12.5px;font-weight:600">' + t.comboBtn + '</button>' +
      '<span style="font-size:11.5px;color:var(--muted)">⚠ ' + t.comboProxyNote + '</span></div></div>';
  }
  if (cd.status === 'checking') return '<div style="font-size:12.5px;color:var(--muted)">' + t.comboChecking + '</div>';
  const inf = cd.list.filter(c => c.infinite);
  if (!inf.length) return '<div style="font-size:12.5px;color:var(--okFg)">✓ ' + t.comboNone +
    (cd.list.length ? ' (' + cd.list.length + ' ' + t.comboOthers + ')' : '') + '</div>';
  return '<div style="display:flex;flex-direction:column;gap:6px">' + inf.map(c =>
    '<div style="font-size:12.5px;line-height:1.5"><b>' + c.cards.map(esc).join(' + ') + '</b>' +
    ' <span style="color:var(--muted)">→ ' + esc(c.features[0] || '') + '</span></div>').join('') + '</div>';
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
