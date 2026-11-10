// The pod rules editor (admins): edits a copy of the pod's rules and POSTs it; the server alone validates.
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { esc } from './helpers.js';
import { DIAL_META } from './constants.js';
import { state } from '../state.js';

const OPS = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '==': '=' };
const name = (k) => DIAL_META.find(d => d.k === k).name[state.lang];
const num = (p, v, min, max, label) => `<label class="pr-f"><span>${label}</span><input type="number" inputmode="numeric" step="1" min="${min}" max="${max}" data-p="${p}" value="${esc(v)}"></label>`;

export function renderRulesEditor(el, pod, onSaved) {
  const rules = structuredClone(pod.rules);
  for (const d of Object.values(rules.dials)) d._steps = Object.entries(d.point_steps || {});
  let errors = {}, msg = '';

  const errs = (prefix) => Object.keys(errors).filter(p => p === prefix || p.startsWith(prefix + '.') || p.startsWith(prefix + '['))
    .map(p => `<p class="pr-err" role="alert">${esc(fill(T().prInvalid, { p }))}</p>`).join('');

  const stepRows = (k, d) => d._steps.map(([key, pts], i) => `<div class="pr-row">
    <label class="pr-f"><span>${T().prWith}</span><input type="number" inputmode="numeric" step="1" min="${d.baseline_max + 1}" max="200" data-s="${k}.${i}.0" value="${esc(key)}"></label>
    <span class="pr-arrow" aria-hidden="true">→</span>
    <label class="pr-f"><span>${T().prPoints}</span><input type="number" inputmode="numeric" step="1" min="0" max="100" data-s="${k}.${i}.1" value="${esc(pts)}"></label>
    <button type="button" class="btn-ghost-sm pr-x" data-del="${k}.${i}" aria-label="${T().prRemove}">✕</button></div>`).join('')
    + `<button type="button" class="btn-ghost-sm" data-add="${k}">${T().prAddStep}</button>`;

  const dial = (k, d) => {
    let body;
    if (d.forbidden) body = `<p class="pr-note">${T().prForbidden}</p>`;
    else if (k === 'combos') {
      body = `<div class="pr-grid">${num(`dials.${k}.free_combos`, d.free_combos, 0, 20, T().prFree)}
        ${num(`dials.${k}.size_points.2`, d.size_points['2'], 0, 20, T().prCombo2)}
        ${num(`dials.${k}.size_points.3`, d.size_points['3'], 0, 20, T().prCombo3)}
        ${num(`dials.${k}.default_size_points`, d.default_size_points, 0, 20, T().prCombo4)}</div>`;
    } else {
      body = num(`dials.${k}.baseline_max`, d.baseline_max, 0, 100, T().prFreeUpTo) + stepRows(k, d);
    }
    return `<details class="pr-dial"${errs('dials.' + k) ? ' open' : ''}><summary>${esc(name(k))}</summary>${body}${errs('dials.' + k)}</details>`;
  };

  const cond = (c, i) => {
    const t = (x) => `${esc(name(x.dial))} ${OPS[x.op] || esc(x.op)}`;
    let inner;
    if (c.if_all) {
      inner = c.if_all.map((x, j) => `${t(x)} ${num(`conditionals.${i}.if_all.${j}.value`, x.value, 0, 200, '')}`).join(` ${T().prAnd} `)
        + `: +${num(`conditionals.${i}.penalty_points`, c.penalty_points, 0, 20, '')} ${T().prPts}`;
    } else {
      inner = `${T().prIf} ${t(c.if)} ${num(`conditionals.${i}.if.value`, c.if.value, 0, 200, '')}: `
        + c.then.map((x, j) => `${t(x)} ${num(`conditionals.${i}.then.${j}.value`, x.value, 0, 200, '')}`).join(` ${T().prAnd} `);
    }
    return `<div class="pr-cond">${inner}${errs('conditionals.' + i)}</div>`;
  };

  function draw() {
    const t = rules.tiers;
    el.innerHTML = `<form class="pr" novalidate>
      <section><h3>${T().prBudget}</h3><div class="pr-grid">
        ${num('tiers.tier1.max_points', t.tier1.max_points, 0, 100, T().prTier1)}
        ${num('tiers.tier2.max_points', t.tier2.max_points, 0, 100, T().prTier2)}
        ${num('overflow_per_unit', rules.overflow_per_unit, 0, 10, T().prOverflow)}</div>${errs('tiers')}${errs('overflow_per_unit')}</section>
      <section><h3>${T().prDials}</h3>${DIAL_META.filter(m => rules.dials[m.k]).map(m => dial(m.k, rules.dials[m.k])).join('')}</section>
      <section><h3>${T().prConds}</h3>${rules.conditionals.map(cond).join('')}</section>
      <section><h3>${T().prBans}</h3><p class="pr-note">${T().prBansHelp}</p>
        ${Object.entries(rules.hard_bans.banned_cards).map(([k, v]) => `<label class="pr-f pr-ban"><span>${esc(k)}</span><textarea rows="8" data-ban="${esc(k)}">${esc(v.join('\n'))}</textarea></label>`).join('')}${errs('hard_bans')}</section>
      <div class="pr-actions"><button type="submit" class="btn-accent">${T().prSave}</button><span class="pr-msg" role="status">${esc(msg)}</span></div></form>`;
  }

  const set = (path, v) => { let o = rules; const ks = path.split('.'); for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = v; };
  const toNum = (s) => (s === '' ? null : Number(s));

  el.oninput = (e) => {
    const { p, s, ban } = e.target.dataset;
    if (p) set(p, toNum(e.target.value));
    else if (s) { const [k, i, f] = s.split('.'); rules.dials[k]._steps[i][f] = e.target.value; }
    else if (ban) rules.hard_bans.banned_cards[ban] = e.target.value.split('\n').map(x => x.trim()).filter(Boolean);
  };
  el.onclick = (e) => {
    const b = e.target.closest('button[data-add],button[data-del]');
    if (!b) return;
    if (b.dataset.add) { const d = rules.dials[b.dataset.add]; d._steps.push([String(Math.max(d.baseline_max, ...d._steps.map(x => Number(x[0]) || 0)) + 1), '']); }
    else { const [k, i] = b.dataset.del.split('.'); rules.dials[k]._steps.splice(i, 1); }
    draw();
  };
  el.onsubmit = async (e) => {
    e.preventDefault();
    const out = structuredClone(rules);
    for (const d of Object.values(out.dials)) {
      if (d.point_steps) d.point_steps = Object.fromEntries(d._steps.map(([k, v]) => [k, toNum(String(v))]));
      delete d._steps;
    }
    const res = await api(`../api/pods/${pod.id}`, 'POST', { rules: out });
    errors = {}; msg = '';
    if (res.status === 200) { msg = T().prSaved; onSaved(res.data.pod); return; }
    if (res.status === 400) { errors = res.data.errors || {}; msg = T().prFix; }
    else msg = res.status === 403 ? T().prNotAdmin : T().prNetwork;
    draw();
  };
  draw();
}
