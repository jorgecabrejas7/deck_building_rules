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
  let html = '<div class="panel tm-panel">' +
    '<span class="secT">' + t.tmT + '</span>' +
    '<div class="lbl-muted">' + t.tmHint + '</div>' +
    '<div class="tm-grid">' +
    [0, 1, 2, 3].map(i => '<textarea data-tm="' + i + '" rows="8" class="mono tm-ta" placeholder="' + t.tmDeck + ' ' + (i + 1) + '">' + esc(state.tableTexts[i]) + '</textarea>').join('') + '</div>' +
    '<div><button id="tmRunBtn" ' + (state.tableBusy ? 'disabled' : '') + ' class="btn-accent">' +
    (state.tableBusy ? t.tmRunning + '…' : t.tmRun) + '</button></div>';
  if (state.tableResults) {
    html += '<div class="table-scroll"><table class="tm-table">' +
      '<tr><th>' + t.tmDeck + '</th><th>' + t.tierWord + '</th><th>' + t.pts + '</th><th>' + t.price + '</th><th>GC</th><th>' + t.archetype + '</th><th></th></tr>' +
      state.tableResults.map((d, i) => {
        return '<tr><td>' + esc(d.name) + '</td>' +
          '<td><span class="tier-pill ' + tierTone(d.tier) + '">' + T()[d.tier] + '</span></td>' +
          '<td class="mono">' + d.pts + '</td><td class="mono">€' + Math.round(d.price) + '</td><td class="mono">' + d.gc + '</td><td>' + esc(d.arch) + '</td>' +
          '<td><button data-tmload="' + i + '" class="btn-ghost-sm">' + t.tmLoad + '</button></td></tr>';
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

export async function runTableMode() {
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
