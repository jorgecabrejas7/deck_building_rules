import { state } from '../state.js';
import { T } from '../i18n.js';
import { MSG, comboFeatureText } from './constants.js';
import { $, esc } from './helpers.js';

// Wizards' Bracket 3 verdict, deliberately separate from the pod's point
// budget: the two answer different questions and a deck can pass one and fail
// the other. Every criterion is listed, passing ones included, so the panel
// doubles as the rulebook.
const ORDER = ['game_changers', 'mass_land_denial', 'extra_turns', 'early_combos', 'legality'];

const list = (names) => names.map(n => esc(n.split(' // ')[0])).join(', ');

function why(check, t, lang) {
  switch (check.id) {
    case 'game_changers':
      return [t.brWhyNoGc.replace('%v', check.value), list(check.cards)].filter(Boolean).join(' ');
    case 'mass_land_denial':
      return t.brWhyNoMld.replace('%c', list(check.cards));
    case 'extra_turns':
      return check.looped.length
        ? t.brWhyNoTurnsLoop.replace('%c', list(check.looped))
        : t.brWhyNoTurnsMany.replace('%v', check.value) + ' ' + list(check.cards);
    case 'early_combos':
      return t.brWhyNoCombo.replace('%m', check.max) +
        check.combos.map(c => '<span class="br-combo"><b>' + list(c.cards) + '</b> · ' +
          c.mana + ' ' + t.brComboMana + ' → ' + esc(comboFeatureText(c.feature, lang)) + '</span>').join('');
    case 'legality':
      return t.brWhyNoLegal + ' ' + check.issues.slice(0, 6)
        .map(v => esc(MSG['valid_' + v.id][lang](v))).join(' · ');
    default:
      return '';
  }
}

export function renderBracket() {
  const t = T(), lang = state.lang, b = state.result.bracket3;
  const rows = ORDER.map(id => {
    const c = b.checks.find(x => x.id === id);
    if (!c) return '';
    const tone = c.ok ? 'br-ok' : 'br-fail';
    return '<div class="br-row ' + tone + '">' +
      '<span class="br-ic" aria-hidden="true">' + (c.ok ? '✓' : '✕') + '</span>' +
      '<div class="br-text"><span class="br-rule">' + esc(t['br_' + id]) + '</span>' +
      '<span class="vh"> — ' + (c.ok ? t.brOk : t.brFail) + '</span>' +
      (c.ok ? (c.pending ? '<span class="br-why txt-muted">' + esc(t.brPending) + '</span>' : '')
            : '<span class="br-why">' + why(c, t, lang) + '</span>') + '</div></div>';
  }).join('');

  // No title here: the part header above the panel already names this section,
  // so the panel leads straight with the verdict and the five criteria.
  $('bracket').innerHTML = '<div class="panel panel-pad">' +
    '<div class="row-between"><span class="br-verdict ' +
    (!b.fits ? 'tone-bad' : b.pending ? 'tone-warn' : 'tone-ok') + '">' +
    (!b.fits ? '✕ ' + esc(t.brFitsNo) : '✓ ' + esc(t.brFits)) + '</span>' +
    (b.pending ? '<span class="note-sm">' + esc(t.brPending) + '</span>' : '') + '</div>' +
    '<div class="br-rows">' + rows + '</div></div>';
}

// Compact yes/no for the sticky summary strip. A criterion still waiting on the
// combo check cannot be called a pass, so the tile stays neutral until it lands
// (and stays neutral for good under file://, where the check never runs).
export function bracketTile() {
  const t = T(), b = state.result.bracket3;
  const tone = !b.fits ? 'tone-bad' : b.pending ? '' : 'tone-ok';
  const value = !b.fits ? '✕ ' + t.brNo : b.pending ? t.brChecking : '✓ ' + t.brYes;
  return '<div class="panel stat-tile' + (tone ? ' toned ' + tone : '') + '"' +
    (b.pending ? ' title="' + esc(t.brPending) + '"' : '') + '>' +
    '<div class="tile-label">' + t.brTile + '</div>' +
    '<div class="mono stat-value">' + value + '</div></div>';
}
