import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { $, esc, tierTone, archName } from './helpers.js';
import { bracketTile } from './bracket.js';

export function renderSummary() {
  const t = T(), r = state.result, ev = r.evalRes, l = r.level;
  const seats = (r.commanders || []).map(n => cardCache[n]).filter(Boolean);
  const cmd = seats[0];
  const cmdTile = cmd
    ? '<div class="cmd-tile">' +
      '<img src="' + (cmd.img_art || '') + '" alt="">' +
      '<div><div class="tile-label">' + t.commander + '</div>' +
      '<div class="cmd-name">' + esc(seats.map(c => c.name.split(' // ')[0]).join(' + ')) + '</div>' +
      '</div></div>'
    : '';
  const wrongCount = r.stats.total_cards !== 100;
  $('summary').innerHTML =
    '<div class="tier-box ' + tierTone(ev.tier) + '">' +
      '<span class="tier-box-label">' + t.tierWord + '</span>' +
      '<span class="tier-box-value">' + t['short_' + ev.tier] + '</span></div>' +
    cmdTile +
    '<div class="stat-grid">' +
      // the cap gets its name so "23 / 7" can't read as 23-of-7 anything
      stat(t.pts, ev.points + ' <span class="stat-cap">· ' + t.capWord + ' ' + RULES.tiers.tier2.max_points + '</span>',
        ev.points > RULES.tiers.tier2.max_points ? 'toned ' + tierTone(ev.tier) : '') +
      stat(t.pfPractical, l.pending ? t.brChecking : esc(l.bracket) + ' <span class="stat-cap">' + l.score + ' / 10</span>') +
      bracketTile() +
      stat(t.price, '€' + Math.round(r.stats.total_price_eur), 'stat-secondary') +
      stat(t.cardsN, r.stats.total_cards, wrongCount ? 'toned tone-warn' : 'stat-secondary') +
      '<div class="stat-tile stat-secondary"><div class="tile-label">' + t.archetype + '</div><div class="stat-arch">' + esc(archName()) + '</div></div></div>';
  function stat(lbl, val, cls) {
    return '<div class="stat-tile' + (cls ? ' ' + cls : '') + '"><div class="tile-label">' + lbl + '</div><div class="mono stat-value">' + val + '</div></div>';
  }
  // right-edge fade while more tiles remain off-screen (strip scrolls on mobile / when collapsed)
  const row = $('summary');
  const updFade = () => row.classList.toggle('fade-end', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  row.onscroll = updFade;
  updFade();
}
