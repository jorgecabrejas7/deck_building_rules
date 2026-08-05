import { state, cardCache } from '../state.js';
import { T } from '../i18n.js';
import { TYPES, TYPE_ORDER, CATS } from './constants.js';
import { $, esc, badgeFor, helpIcon } from './helpers.js';
import { showCardPopover, hideCardPopover } from './popover.js';

export function renderBrowser() {
  const t = T(), lang = state.lang, r = state.result;
  const byT = state.grp === 'type';
  $('gtBtn').style.background = byT ? 'var(--text)' : 'transparent'; $('gtBtn').style.color = byT ? 'var(--bg)' : 'var(--muted)';
  $('gcBtn').style.background = !byT ? 'var(--text)' : 'transparent'; $('gcBtn').style.color = !byT ? 'var(--bg)' : 'var(--muted)';
  $('browserT').textContent = t.browser; $('groupByLbl').textContent = t.groupBy;
  $('gtBtn').textContent = t.byType; $('gcBtn').textContent = t.byCat;
  const gmap = {};
  for (const x of r.cardsInfo) { const g = byT ? x.cls.type : x.cls.cat; (gmap[g] = gmap[g] || []).push(x); }
  const cnt = {}; for (const [g, arr] of Object.entries(gmap)) cnt[g] = arr.reduce((sum, x) => sum + x.qty, 0);
  const order = byT ? TYPE_ORDER.filter(k => gmap[k]) : Object.keys(gmap).sort((a, b) => cnt[b] - cnt[a]);
  $('groups').innerHTML = order.map(g => {
    const label = byT ? TYPES[g][lang] : (CATS[g] ? CATS[g][lang] : g);
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="font-size:12px;font-weight:700;color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:6px;letter-spacing:0.05em">' +
      esc(label.toUpperCase()) + ' · ' + cnt[g] + (!byT ? helpIcon(g) : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">' +
      gmap[g].sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || a.name.localeCompare(b.name)).map(x => {
        const badge = badgeFor(x.name);
        const dim = state.hl && x.cls.cat !== state.hl && !x.cls.tags.includes(state.hl);
        const hit = state.hl && !dim;
        const mana = (x.card.mana_cost || '').replace(/[{}]/g, '') || '—';
        const wi = whatIfChip(x.name);
        return '<div class="cardTile" data-name="' + esc(x.name) + '" style="position:relative;display:flex;flex-direction:column;background:var(--panel2);border:1.5px solid ' + (hit ? 'var(--accent)' : 'var(--border)') + ';border-radius:10px;overflow:hidden;opacity:' + (dim ? 0.4 : 1) + '">' +
          '<img src="' + (x.card.img_art || '') + '" loading="lazy" style="width:100%;aspect-ratio:1.85;object-fit:cover;background:var(--track)" alt="">' +
          '<div style="position:absolute;top:5px;right:5px;display:flex;gap:4px">' +
          (badge ? '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:' + badge.bg + ';color:' + badge.fg + ';box-shadow:0 1px 4px rgba(0,0,0,.35)">' + badge.label + '</span>' : '') +
          wi + '</div>' +
          '<div style="padding:7px 9px 8px;display:flex;flex-direction:column;gap:2px">' +
          '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.name.split(' // ')[0]) + '</div>' +
          '<div class="mono" style="font-size:10px;color:var(--muted)">' + esc(mana) + ' · ' + (x.card.price != null ? '€' + x.card.price : '—') + (x.qty > 1 ? ' · x' + x.qty : '') + '</div></div></div>';
      }).join('') + '</div></div>';
  }).join('');
  $('groups').style.display = 'flex';
  $('groups').style.flexDirection = 'column';
  $('groups').style.gap = '22px';
  $('groups').style.gridTemplateColumns = '';
  $('groups').style.alignItems = 'stretch';
  for (const tile of $('groups').querySelectorAll('.cardTile')) {
    tile.onmouseenter = () => {
      const c = cardCache[tile.dataset.name]; if (!c || !c.img_normal) return;
      showCardPopover(tile, c.img_normal);
    };
    tile.onmouseleave = hideCardPopover;
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
  return '<span title="' + t.whatIf + '" style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:var(--okBg);color:var(--okFg);flex:none;white-space:nowrap">✂ ' + label + '</span>';
}
