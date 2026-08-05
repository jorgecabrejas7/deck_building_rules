import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { ARCH, CATS, CAT_HELP, BADGE_OF } from './constants.js';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function tierTone(k) {
  return { tier1: 'tone-ok', tier2: 'tone-warn', above: 'tone-bad' }[k];
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
  return '<span class="catHelp" data-cat="' + cat + '">?</span>';
}
export function catLabel(cat, lang) { return esc(CATS[cat][lang]) + helpIcon(cat); }
