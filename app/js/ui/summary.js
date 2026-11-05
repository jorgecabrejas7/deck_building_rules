import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { PIP } from './constants.js';
import { $, esc, tierTone, archName } from './helpers.js';
import { bracketTile } from './bracket.js';

export function renderSummary() {
  const t = T(), r = state.result, v = r.verdict;
  const seats = (r.commanders || []).map(n => cardCache[n]).filter(Boolean);
  const cmd = seats[0];
  const identity = [...new Set(seats.flatMap(c => c.color_identity || []))];
  const cmdTile = cmd
    ? '<div class="panel cmd-tile">' +
      '<img src="' + (cmd.img_art || '') + '" alt="">' +
      '<div><div class="tile-label">' + t.commander + '</div>' +
      '<div class="cmd-name">' + esc(seats.map(c => c.name.split(' // ')[0]).join(' + ')) + '</div>' +
      '<div class="ci-pips" role="img" aria-label="' + esc(identity.join(' ') || t.colorless) + '">' + identity.map(k =>
        '<span class="ci-pip" style="--pip:' + PIP[k] + '"></span>').join('') + '</div></div></div>'
    : '';
  const wrongCount = r.stats.total_cards !== 100;
  $('summary').innerHTML =
    '<div class="tier-box ' + (v.pending ? 'tone-pending' : tierTone(v.tier)) + '">' +
      '<span class="tier-box-label">' + t.tierWord + '</span>' +
      '<span class="tier-box-value">' + t[v.tier] + '</span></div>' +
    cmdTile +
    '<div class="stat-grid">' +
      stat(t.pfPractical, v.pending ? t.brChecking : esc(v.bracket) + ' <span class="stat-cap">' + v.score + ' / 10</span>') +
      bracketTile() +
      stat(t.pts, r.evalRes.points, 'stat-secondary') +
      stat(t.price, '€' + Math.round(r.stats.total_price_eur), 'stat-secondary') +
      stat(t.cardsN, r.stats.total_cards, wrongCount ? 'toned tone-warn' : 'stat-secondary') +
      '<div class="panel stat-tile stat-secondary"><div class="tile-label">' + t.archetype + '</div><div class="stat-arch">' + esc(archName()) + '</div></div></div>';
  function stat(lbl, val, cls) {
    return '<div class="panel stat-tile' + (cls ? ' ' + cls : '') + '"><div class="tile-label">' + lbl + '</div><div class="mono stat-value">' + val + '</div></div>';
  }
  // right-edge fade while more tiles remain off-screen (strip scrolls on mobile / when collapsed)
  const row = $('summary');
  const updFade = () => row.classList.toggle('fade-end', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  row.onscroll = updFade;
  updFade();
}
