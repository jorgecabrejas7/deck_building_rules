import { state, cardCache } from '../state.js';
import { T } from '../i18n.js';
import { TYPES, TYPE_ORDER, CATS } from './constants.js';
import { $, esc, badgeFor, helpIcon } from './helpers.js';
import { bindCardTilePopover } from './popover.js';

export function renderBrowser() {
  const t = T(), lang = state.lang, r = state.result;
  const byT = state.grp === 'type';
  $('gtBtn').classList.toggle('active', byT);
  $('gcBtn').classList.toggle('active', !byT);
  $('browserT').textContent = t.browser; $('groupByLbl').textContent = t.groupBy;
  $('gtBtn').textContent = t.byType; $('gcBtn').textContent = t.byCat;
  const gmap = {};
  for (const x of r.cardsInfo) { const g = byT ? x.cls.type : x.cls.cat; (gmap[g] = gmap[g] || []).push(x); }
  const cnt = {}; for (const [g, arr] of Object.entries(gmap)) cnt[g] = arr.reduce((sum, x) => sum + x.qty, 0);
  const order = byT ? TYPE_ORDER.filter(k => gmap[k]) : Object.keys(gmap).sort((a, b) => cnt[b] - cnt[a]);
  $('groups').innerHTML = order.map(g => {
    const label = byT ? TYPES[g][lang] : (CATS[g] ? CATS[g][lang] : g);
    return '<div class="group">' +
      '<div class="group-head">' +
      esc(label.toUpperCase()) + ' · ' + cnt[g] + (!byT ? helpIcon(g) : '') + '</div>' +
      '<div class="card-grid">' +
      gmap[g].sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || a.name.localeCompare(b.name)).map(x => {
        const badge = badgeFor(x.name);
        const dim = state.hl && x.cls.cat !== state.hl && !x.cls.tags.includes(state.hl);
        const hit = state.hl && !dim;
        const mana = (x.card.mana_cost || '').replace(/[{}]/g, '') || '—';
        const wi = whatIfChip(x.name);
        return '<div class="cardTile' + (hit ? ' hit' : '') + (dim ? ' dim' : '') + '" data-name="' + esc(x.name) + '">' +
          '<img src="' + (x.card.img_art || '') + '" loading="lazy" alt="">' +
          '<div class="tile-badges">' +
          (badge ? '<span class="tile-badge b-' + badge.tone + '">' + badge.label + '</span>' : '') +
          wi + '</div>' +
          '<div class="tile-body">' +
          '<div class="tile-name">' + esc(x.name.split(' // ')[0]) + '</div>' +
          '<div class="mono tile-sub">' + esc(mana) + ' · ' + (x.card.price != null ? '€' + x.card.price : '—') + (x.qty > 1 ? ' · x' + x.qty : '') + '</div></div></div>';
      }).join('') + '</div></div>';
  }).join('');
  for (const tile of $('groups').querySelectorAll('.cardTile')) {
    bindCardTilePopover(tile, () => (cardCache[tile.dataset.name] || {}).img_normal);
    for (const img of tile.querySelectorAll('img')) img.onerror = () => {
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="170" height="92"><rect width="170" height="92" fill="#8a8794"/><text x="85" y="52" font-family="monospace" font-size="26" fill="#fff" text-anchor="middle">' + tile.dataset.name.charAt(0) + '</text></svg>');
    };
  }
}

export function whatIfChip(name) {
  const r = state.result;
  const wi = r && r.whatIf && r.whatIf[name];
  if (!wi || (wi.dPts <= 0 && !wi.fixes)) return '';
  const t = T();
  const tierUp = wi.tier !== r.evalRes.tier;
  const label = (wi.dPts > 0 ? '−' + wi.dPts + ' pt' + (wi.dPts > 1 ? 's' : '') : '') +
    (tierUp ? (wi.dPts > 0 ? ' → ' : '→ ') + t[wi.tier].split(' · ')[0] : '');
  if (!label) return '';
  return '<span title="' + t.whatIf + '" class="wi-chip">✂ ' + label + '</span>';
}
