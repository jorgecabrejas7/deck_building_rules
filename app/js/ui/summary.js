import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { PIP } from './constants.js';
import { $, esc, tierColors, archName } from './helpers.js';

export function renderSummary() {
  const t = T(), r = state.result, ev = r.evalRes;
  const [bg, bd, fg] = tierColors(ev.tier);
  const budgetN = RULES.tiers.tier2.max_points;
  const cmd = r.commander ? cardCache[r.commander] : null;
  const cmdTile = cmd
    ? '<div class="panel" style="padding:6px 14px 6px 6px;display:flex;align-items:center;gap:10px;min-width:180px">' +
      '<img src="' + (cmd.img_art || '') + '" style="width:56px;height:41px;object-fit:cover;border-radius:7px;background:var(--track)" alt="">' +
      '<div><div style="font-size:10.5px;color:var(--muted)">' + t.commander + '</div>' +
      '<div style="font-size:13px;font-weight:700;line-height:1.2">' + esc(cmd.name.split(' // ')[0]) + '</div>' +
      '<div style="display:flex;gap:3px;padding-top:3px">' + (cmd.color_identity || []).map(k =>
        '<span style="width:10px;height:10px;border-radius:50%;background:' + PIP[k] + ';border:1px solid var(--muted)"></span>').join('') + '</div></div></div>'
    : '';
  $('summary').innerHTML =
    '<div style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:12px;padding:12px 20px;display:flex;flex-direction:column;justify-content:center;min-width:200px">' +
      '<span style="font-size:10.5px;font-weight:600;letter-spacing:0.06em;color:' + fg + ';opacity:.75">' + t.tierWord + '</span>' +
      '<span style="font-size:18px;font-weight:700;color:' + fg + '">' + t[ev.tier] + '</span></div>' +
    cmdTile +
    '<div style="flex:1;min-width:280px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">' +
      stat(t.pts, ev.points + ' / ' + budgetN) +
      stat(t.price, '€' + Math.round(r.stats.total_price_eur)) +
      stat(t.cardsN, r.stats.total_cards) +
      '<div class="panel" style="padding:9px 14px"><div style="font-size:10.5px;color:var(--muted)">' + t.archetype + '</div><div style="font-size:13.5px;font-weight:600;padding-top:3px">' + esc(archName()) + '</div></div></div>';
  function stat(lbl, val) {
    return '<div class="panel" style="padding:9px 14px"><div style="font-size:10.5px;color:var(--muted)">' + lbl + '</div><div class="mono" style="font-weight:700;font-size:18px">' + val + '</div></div>';
  }
}
