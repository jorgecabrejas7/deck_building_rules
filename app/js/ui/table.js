import * as PodEngine from '../engine/index.js';
import { state, cardCache, persistCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { ARCH } from './constants.js';
import { $, esc, tierTone } from './helpers.js';
import { analyze } from '../pipeline.js';
import { renderInput } from './input.js';

export function renderTableMode() {
  const t = T();
  $('tableModeBtn').textContent = t.tmBtn;
  const el = $('tableMode');
  if (!state.tableOpen) { el.style.display = 'none'; return; }
  el.style.display = '';
  let html = '<div class="panel" style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
    '<span class="secT">' + t.tmT + '</span>' +
    '<div style="font-size:12px;color:var(--muted)">' + t.tmHint + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">' +
    [0, 1, 2, 3].map(i => '<textarea data-tm="' + i + '" rows="8" class="mono" placeholder="' + t.tmDeck + ' ' + (i + 1) + '" style="border:1px solid var(--border);border-radius:8px;background:var(--panel2);padding:10px;font-size:11px;resize:vertical">' + esc(state.tableTexts[i]) + '</textarea>').join('') + '</div>' +
    '<div><button id="tmRunBtn" ' + (state.tableBusy ? 'disabled' : '') + ' style="background:var(--accent);color:var(--accentFg);border:none;border-radius:8px;padding:10px 24px;font-weight:600;font-size:13.5px">' +
    (state.tableBusy ? t.tmRunning + '…' : t.tmRun) + '</button></div>';
  if (state.tableResults) {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<tr style="text-align:left;color:var(--muted);font-size:11px"><th style="padding:8px">' + t.tmDeck + '</th><th>' + t.tierWord + '</th><th>' + t.pts + '</th><th>' + t.price + '</th><th>GC</th><th>' + t.archetype + '</th><th></th></tr>' +
      state.tableResults.map((d, i) => {
        return '<tr style="border-top:1px solid var(--border2)"><td style="padding:9px 8px;font-weight:600">' + esc(d.name) + '</td>' +
          '<td><span class="tier-pill ' + tierTone(d.tier) + '">' + T()[d.tier] + '</span></td>' +
          '<td class="mono">' + d.pts + '</td><td class="mono">€' + Math.round(d.price) + '</td><td class="mono">' + d.gc + '</td><td>' + esc(d.arch) + '</td>' +
          '<td><button data-tmload="' + i + '" style="border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:7px;padding:4px 10px;font-size:11px;font-weight:600">' + t.tmLoad + '</button></td></tr>';
      }).join('') + '</table></div>';
  }
  html += '</div>';
  el.innerHTML = html;
  for (const ta of el.querySelectorAll('[data-tm]'))
    ta.oninput = () => { state.tableTexts[+ta.dataset.tm] = ta.value; };
  $('tmRunBtn').onclick = runTableMode;
  for (const b of el.querySelectorAll('[data-tmload]'))
    b.onclick = () => { $('deckText').value = state.tableTexts.filter(x => x.trim())[+b.dataset.tmload]; analyze(); };
}

async function runTableMode() {
  if (state.tableBusy) return;
  const texts = state.tableTexts.filter(x => x.trim());
  if (!texts.length) return;
  state.tableBusy = true; renderTableMode();
  const results = [];
  try {
    for (const text of texts) {
      const parsed = PodEngine.parseDecklist(text);
      const names = [...new Set(parsed.entries.map(e => e.name))];
      await PodEngine.fetchCards(names, cardCache, () => {});
      const resolved = parsed.entries.filter(e => cardCache[e.name]);
      const { stats, flagged } = PodEngine.computeDeckStats(resolved, cardCache);
      const ev = PodEngine.evaluateDeck(stats, flagged, RULES, resolved.map(e => e.name));
      const cardsInfo = resolved.map(e => ({ card: cardCache[e.name], qty: e.quantity, name: e.name, cls: PodEngine.classifyCard(cardCache[e.name]) }));
      const det = PodEngine.detectArchetype(cardsInfo);
      const cmd = (parsed.commanders && parsed.commanders[0]) || PodEngine.guessCommander(resolved, cardCache);
      const a = ARCH.find(x => x.k === det.key) || ARCH[ARCH.length - 1];
      results.push({ name: cmd ? cmd.split(' // ')[0] : T().tmDeck + ' ' + (results.length + 1),
        tier: ev.tier, pts: ev.points, price: stats.total_price_eur, gc: stats.game_changers, arch: a.name[state.lang] });
    }
    persistCache();
    state.tableResults = results;
  } catch (e) { console.error(e); state.error = 'netErr'; }
  state.tableBusy = false;
  renderTableMode(); renderInput();
}
