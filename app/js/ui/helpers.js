import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { ARCH, CATS, CAT_HELP, BADGE_OF } from './constants.js';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function tierColors(k) {
  return { tier1: ['var(--okBg)', 'var(--okBd)', 'var(--okFg)'], tier2: ['var(--warnBg)', 'var(--warnBd)', 'var(--warnFg)'], above: ['var(--badBg)', 'var(--badBd)', 'var(--badFg)'] }[k];
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
      const bg = tone === 'bad' ? 'var(--badBg)' : tone === 'warn' ? 'var(--warnBg)' : 'var(--border2)';
      const fg = tone === 'bad' ? 'var(--badFg)' : tone === 'warn' ? 'var(--warnFg)' : 'var(--muted)';
      return { label, bg, fg };
    }
  }
  return null;
}

export function helpIcon(cat) {
  if (!CAT_HELP[cat]) return '';
  return '<span class="catHelp" data-cat="' + cat + '" style="display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1.2px solid var(--muted);color:var(--muted);font-size:10px;font-weight:700;cursor:help;vertical-align:1px;margin-left:5px">?</span>';
}
export function catLabel(cat, lang) { return esc(CATS[cat][lang]) + helpIcon(cat); }
