import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { PIP } from './constants.js';
import { $, esc, tierTone, archName } from './helpers.js';

export function renderSummary() {
  const t = T(), r = state.result, ev = r.evalRes;
  const budgetN = RULES.tiers.tier2.max_points;
  const cmd = r.commander ? cardCache[r.commander] : null;
  const cmdTile = cmd
    ? '<div class="panel cmd-tile">' +
      '<img src="' + (cmd.img_art || '') + '" alt="">' +
      '<div><div class="tile-label">' + t.commander + '</div>' +
      '<div class="cmd-name">' + esc(cmd.name.split(' // ')[0]) + '</div>' +
      '<div class="ci-pips">' + (cmd.color_identity || []).map(k =>
        '<span class="ci-pip" style="--pip:' + PIP[k] + '"></span>').join('') + '</div></div></div>'
    : '';
  $('summary').innerHTML =
    '<div class="tier-box ' + tierTone(ev.tier) + '">' +
      '<span class="tier-box-label">' + t.tierWord + '</span>' +
      '<span class="tier-box-value">' + t[ev.tier] + '</span></div>' +
    cmdTile +
    '<div class="stat-grid">' +
      stat(t.pts, ev.points + ' / ' + budgetN) +
      stat(t.price, '€' + Math.round(r.stats.total_price_eur)) +
      stat(t.cardsN, r.stats.total_cards) +
      '<div class="panel stat-tile"><div class="tile-label">' + t.archetype + '</div><div class="stat-arch">' + esc(archName()) + '</div></div></div>';
  function stat(lbl, val) {
    return '<div class="panel stat-tile"><div class="tile-label">' + lbl + '</div><div class="mono stat-value">' + val + '</div></div>';
  }
  // right-edge fade while more tiles remain off-screen (strip scrolls on mobile / when collapsed)
  const row = $('summary');
  const updFade = () => row.classList.toggle('fade-end', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  row.onscroll = updFade;
  updFade();
}
