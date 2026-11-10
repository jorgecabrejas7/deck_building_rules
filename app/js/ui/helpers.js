import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { ARCH, CATS, CAT_HELP, BADGE_OF } from './constants.js';

export const $ = (id) => document.getElementById(id);
export const eur = (v) => '€' + v.toFixed(2);
// Banned cards named by the pod rules, read off the point evaluation that finds them.
export const bannedCards = (r) => r.evalRes.violations.filter(v => v.id === 'banned')
  .flatMap(v => v.cards).map(c => String(Array.isArray(c) ? c[0] : c).split(' // ')[0]);
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function tierTone(k) {
  return { tier1: 'tone-ok', tier2: 'tone-warn', above: 'tone-neutral' }[k];
}
export function archKey() {
  if (state.arch !== 'auto') return state.arch;
  return state.result ? state.result.detected.key : 'generic';
}
export function archName() {
  const a = ARCH.find(x => x.k === archKey()) || ARCH[ARCH.length - 1];
  return a.name[state.lang] + (state.arch === 'auto' ? ' ' + T().autoTag : '');
}

export function badgeFor(name) {
  const r = state.result;
  for (const [dial, label, tone] of BADGE_OF) {
    const spec = RULES.dials[dial];
    if (!spec) continue;
    const inDial = (r.flagged[dial] || []).some(([n]) => n === name);
    if (inDial && ((r.stats[dial] || 0) > spec.baseline_max || dial === 'game_changers')) {
      return { label, tone };
    }
  }
  return null;
}

export function helpIcon(cat) {
  if (!CAT_HELP[cat]) return '';
  return '<button type="button" class="catHelp" data-cat="' + cat +
    '" aria-label="' + esc(T().helpAria + ': ' + CATS[cat][state.lang]) + '">?</button>';
}
export function catLabel(cat, lang) { return esc(CATS[cat][lang]) + helpIcon(cat); }

// Screen-reader status line (#srStatus is a visually-hidden aria-live region).
export function announce(msg) { const el = $('srStatus'); if (el) el.textContent = msg; }

// A dial's cost in words, straight from its rules spec (RULES is read at call time).
export function dialCost(spec, lang) {
  const P = lang === 'es';
  if (spec.forbidden) return P ? 'PROHIBIDO (y cada copia suma +1 pt)' : 'FORBIDDEN (and each copy still adds +1 pt)';
  if (spec.scoring === 'per_combo_size') {
    const sp = spec.size_points, d = spec.default_size_points;
    return P ? `${spec.free_combos} gratis; después: 2 cartas +${sp['2']} · 3 cartas +${sp['3']} · 4+ +${d}` : `${spec.free_combos} free; then: 2-card +${sp['2']} · 3-card +${sp['3']} · 4+ +${d}`;
  }
  const steps = Object.entries(spec.point_steps).map(([k, v]) => k + '→' + v).join(', ');
  return (P ? 'gratis hasta ' : 'free up to ') + spec.baseline_max + (steps ? ' · ' + steps : '') + (P ? ' · después +1/unidad' : ' · then +1/unit');
}
