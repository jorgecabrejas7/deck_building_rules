import { RULES } from '../rules.js';
import { state } from '../state.js';
import { COMBO_TAGS, deckFingerprint, encodeShare } from '../engine/index.js';
import { deckToText } from '../advice.js';
import { T } from '../i18n.js';
import { MSG, EXTRA_PTS, dialName } from './constants.js';
import { archName } from './helpers.js';
import { renderHeader } from './header.js';

const PILLARS = ['wins', 'interaction', 'salt', 'synergy'];

export function copyReport() {
  if (!state.result) return;
  const t = T(), lang = state.lang, ev = state.result.evalRes;
  const lines = ['La guía del Yoryi — ' + t.power,
    t.tierWord + ': ' + t[state.result.evalRes.tier],
    t.pts + ': ' + state.result.evalRes.points + ' / ' + RULES.tiers.tier2.max_points,
    t.pfPractical + ': ' + state.result.level.bracket + ' (' + state.result.level.score + ' / 10)',
    t.pts + ': ' + ev.points,
    t.price + ': €' + Math.round(state.result.stats.total_price_eur),
    t.cardsN + ': ' + state.result.stats.total_cards,
    t.archetype + ': ' + archName()];
  const b = state.result.bracket;
  if (!b.pending) lines.push(t.brReadWotc + ': ' + b.checklist + ' · ' + t.brReadSb + ': ' + COMBO_TAGS[b.estimate].name + ' (' + COMBO_TAGS[b.estimate].bracket + ')');
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

export async function copyShareLink() {
  if (!state.result) return;
  // a pick left over from another deck must not travel with this one
  const pick = state.cmdPick && state.cmdPick.key === deckFingerprint(state.deck.entries) ? state.cmdPick.names : null;
  const link = encodeShare({ text: deckToText(state.deck), commanders: pick })
    .then(code => new Blob([location.origin + location.pathname + location.search + '#d=' + code], { type: 'text/plain' }));
  try {
    // handing the clipboard a promise keeps Safari's user-gesture check happy across the async compress
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': link })]);
  } catch (e) { console.error(e); return; }
  state.linkCopied = true; renderHeader();
  setTimeout(() => { state.linkCopied = false; renderHeader(); }, 1600);
}
