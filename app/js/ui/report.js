import { state } from '../state.js';
import { COMBO_TAGS } from '../engine/index.js';
import { T } from '../i18n.js';
import { MSG, EXTRA_PTS, dialName } from './constants.js';
import { archName } from './helpers.js';
import { renderHeader } from './header.js';

const PILLARS = ['consistency', 'efficiency', 'interaction', 'wins'];

export function copyReport() {
  if (!state.result) return;
  const t = T(), lang = state.lang, ev = state.result.evalRes;
  const lines = ['La guía del Yoryi — ' + t.power,
    t.tierWord + ': ' + t[state.result.verdict.tier],
    t.pfPractical + ': ' + state.result.verdict.bracket + ' (' + state.result.verdict.score + ' / 10)',
    t.pts + ': ' + ev.points,
    t.price + ': €' + Math.round(state.result.stats.total_price_eur),
    t.cardsN + ': ' + state.result.stats.total_cards,
    t.archetype + ': ' + archName()];
  const b = state.result.bracket;
  lines.push(t.brTile + ': ' + (!b.fits ? t.brNo : b.pending ? t.brPending : t.brYes));
  if (!b.pending) lines.push(t.brReadWotc + ': ' + b.checklist + ' · ' + t.brReadSb + ': ' + COMBO_TAGS[b.estimate].name + ' (' + COMBO_TAGS[b.estimate].bracket + ')');
  for (const c of b.checks) if (!c.ok) lines.push('  ✕ ' + t['br_' + c.id]);
  for (const c of b.combos) lines.push('  ' + [...c.cards, ...c.filled].join(' + ') + ' [B' + COMBO_TAGS[c.tag].bracket + ' ' + COMBO_TAGS[c.tag].name + ']');
  const pf = state.result;
  if (pf.profile.wins.checked) lines.push(t.pfPower + ': ' + pf.power.score + '/10 · ' + PILLARS.map(k => t['pf_' + k] + ' ' + pf.power.pillars[k]).join(' · '));
  if (pf.salt) lines.push(t.pfSalt + ': ' + pf.salt.total);
  if (pf.synergy.status === 'done') lines.push(t.pfSyn + ': ' + pf.synergy.coverage + '%');
  lines.push(t.pfMana + ': ' + pf.profile.manabase.score + '/100');
  for (const v of ev.violations) lines.push('✕ ' + (v.id === 'conditional' ? MSG.conditional[v.condId][lang](v) : MSG[v.id][lang](v)));
  for (const f of ev.flags) lines.push('⚠ ' + (MSG['flag_' + f.dial] ? MSG['flag_' + f.dial][lang](f) : f.id));
  for (const [k, p] of Object.entries(ev.breakdown)) lines.push('· ' + (EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang)) + ': +' + p + ' pts');
  try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
  state.copied = true; renderHeader();
  setTimeout(() => { state.copied = false; renderHeader(); }, 1600);
}
