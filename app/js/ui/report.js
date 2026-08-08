import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { MSG, EXTRA_PTS, dialName } from './constants.js';
import { archName } from './helpers.js';
import { renderHeader } from './header.js';

export function copyReport() {
  if (!state.result) return;
  const t = T(), lang = state.lang, ev = state.result.evalRes;
  const lines = ['La guía del Yoryi — ' + t.power,
    t.tierWord + ': ' + t[ev.tier],
    t.pts + ': ' + ev.points + ' / ' + RULES.tiers.tier2.max_points,
    t.price + ': €' + Math.round(state.result.stats.total_price_eur),
    t.cardsN + ': ' + state.result.stats.total_cards,
    t.archetype + ': ' + archName()];
  for (const v of ev.violations) lines.push('✕ ' + (v.id === 'conditional' ? MSG.conditional[v.condId][lang](v) : MSG[v.id][lang](v)));
  for (const f of ev.flags) lines.push('⚠ ' + (MSG['flag_' + f.dial] ? MSG['flag_' + f.dial][lang](f) : f.id));
  for (const [k, p] of Object.entries(ev.breakdown)) lines.push('· ' + (EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang)) + ': +' + p + ' pts');
  try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
  state.copied = true; renderHeader();
  setTimeout(() => { state.copied = false; renderHeader(); }, 1600);
}
