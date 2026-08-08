import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH, CATS } from './constants.js';
import { $, esc, archKey, archName } from './helpers.js';
import { compSlots, tagCount } from './comp.js';
import { renderAll } from '../main.js';

// Archetype verdict: what the deck already does well for its detected (or
// chosen) plan, and what it lacks — the "coach's read" above the raw numbers.
export function renderVerdict() {
  const t = T(), r = state.result, lang = state.lang, es = lang === 'es';
  const key = archKey();
  const arch = ARCH.find(x => x.k === key) || ARCH[ARCH.length - 1];
  const specCats = new Set((arch.spec || []).map(([c]) => c));
  const slots = compSlots().map(sl => ({ ...sl, v: tagCount(sl.cat) }));
  const good = [], bad = [];
  const label = c => esc(CATS[c][lang]);

  for (const sl of slots) {
    const core = specCats.has(sl.cat);
    if (sl.v >= sl.min && sl.v <= sl.max) {
      good.push(label(sl.cat) + ' ' + sl.v + '/' + sl.min + '–' + sl.max +
        (core ? ' · ' + (es ? 'clave del arquetipo' : 'archetype core') : ''));
    } else if (sl.v < sl.min) {
      bad.push(label(sl.cat) + ' ' + sl.v + '/' + sl.min + '–' + sl.max +
        (core ? ' · ' + (es ? 'la pata que le falta a tu plan' : 'the missing leg of your plan') : ''));
    } else {
      bad.push(label(sl.cat) + ' ' + sl.v + '/' + sl.min + '–' + sl.max + ' · ' +
        (es ? 'sobran — candidatas a cortar' : 'over target — cut candidates'));
    }
  }
  const avg = r.stats.avg_cmc;
  if (avg != null) {
    const highCap = key === 'aggro' ? 2.8 : 3.6;
    if (avg > highCap) {
      bad.push((es ? 'Curva media alta (' : 'High average curve (') + avg +
        (key === 'aggro' ? (es ? ') para un mazo aggro' : ') for an aggro deck') : ')'));
    } else {
      good.push((es ? 'Curva media sana (' : 'Healthy average curve (') + avg + ')');
    }
  }
  if (state.arch !== 'auto' && r.detected.key !== state.arch) {
    const det = ARCH.find(x => x.k === r.detected.key);
    bad.push(t.verdictMismatch + (det ? ': ' + esc(det.name[lang]) : ''));
  }

  const line = (cls, ic, txt) => '<div class="v-line ' + cls + '"><span class="v-ic">' + ic + '</span><span>' + txt + '</span></div>';
  let html = '<div class="panel panel-pad">' +
    '<div class="row-between"><h2 class="secT">' + t.verdictT + '</h2>' +
    '<span class="comp-sub">' + esc(archName()) + '</span></div>' +
    '<div class="verdict-cols">' +
    '<div class="verdict-col"><h3 class="mini-title">' + t.verdictGood + '</h3>' +
    (good.length ? good.map(g => line('v-good', '✓', g)).join('') : line('v-good', '·', '—')) + '</div>' +
    '<div class="verdict-col"><h3 class="mini-title">' + t.verdictBad + '</h3>' +
    (bad.length ? bad.map(b => line('v-bad', '→', b)).join('')
      : line('v-good', '✓', t.verdictNoneBad)) + '</div></div>' +
    (bad.length ? '<button id="verdictTips" class="btn-ghost-sm">' + t.verdictGoTips + '</button>' : '') +
    '</div>';
  $('verdict').innerHTML = html;
  const b = $('verdictTips');
  if (b) b.onclick = () => { state.tab = 'tips'; renderAll(); };
}
