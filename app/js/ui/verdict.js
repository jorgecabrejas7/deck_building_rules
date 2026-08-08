import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { ARCH, CATS } from './constants.js';
import { $, esc, archKey, archName, tierTone } from './helpers.js';
import { compSlots, tagCount } from './comp.js';

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

  // canonical composition notation: "Categoría — Estado · valor/min–max"
  const range = sl => sl.v + '/' + sl.min + '–' + sl.max;
  for (const sl of slots) {
    const core = specCats.has(sl.cat);
    if (sl.v >= sl.min && sl.v <= sl.max) {
      good.push(label(sl.cat) + ' — ' + t.ok + ' · ' + range(sl) +
        (core ? ' · ' + (es ? 'clave del arquetipo' : 'archetype core') : ''));
    } else if (sl.v < sl.min) {
      bad.push(label(sl.cat) + ' — ' + t.few + ' · ' + range(sl) +
        (core ? ' · ' + (es ? 'la pata que le falta a tu plan' : 'the missing leg of your plan') : ''));
    } else {
      bad.push(label(sl.cat) + ' — ' + t.many + ' · ' + range(sl) + ' · ' +
        (es ? 'candidatas a cortar' : 'cut candidates'));
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
  const ev = r.evalRes, t2 = RULES.tiers.tier2.max_points;
  // a deck at/under pod level with zero violations PASSES: the verdict leads
  // with that win and composition drift demotes to a compact polish note
  const passing = ev.tier !== 'above' && !ev.violations.length;
  const head = '<div class="row-between"><h2 class="secT secT-lg">' + t.verdictT + '</h2>' +
    '<span class="comp-sub">' + esc(archName()) + '</span></div>';
  let html;
  if (passing) {
    const lead = (ev.tier === 'tier1' ? t.verdictLeadT1 : t.verdictLeadT2) +
      ' · ' + ev.points + '/' + t2 + ' pts · ' + t.verdictReady;
    const polish = bad.slice(0, 3), rest = bad.slice(3);
    html = '<div class="panel panel-pad">' + head +
      '<div class="verdict-lead ' + tierTone(ev.tier) + '"><span class="v-lead-ic">✓</span><span>' + esc(lead) + '</span></div>' +
      '<div class="verdict-cols">' +
      '<div class="verdict-col"><h3 class="mini-title">' + t.verdictGood + '</h3>' +
      (good.length ? good.map(g => line('v-good', '✓', g)).join('') : line('v-good', '·', '—')) + '</div>' +
      (bad.length
        ? '<div class="verdict-col"><h3 class="mini-title">' + t.verdictPolish + '</h3>' +
          polish.map(b => line('v-polish', '·', b)).join('') +
          (rest.length
            ? '<details class="polish-more"><summary>+' + rest.length + ' ' + t.verdictMore + '</summary>' +
              rest.map(b => line('v-polish', '·', b)).join('') + '</details>'
            : '') + '</div>'
        : '<div class="verdict-col"><h3 class="mini-title">' + t.verdictBad + '</h3>' +
          line('v-good', '✓', t.verdictNoneBad) + '</div>') +
      '</div>' +
      (bad.length ? '<button id="verdictTips" class="btn-ghost-sm">' + t.verdictGoTips + '</button>' : '') +
      '</div>';
  } else {
    html = '<div class="panel panel-pad">' + head +
      '<div class="verdict-cols">' +
      '<div class="verdict-col"><h3 class="mini-title">' + t.verdictGood + '</h3>' +
      (good.length ? good.map(g => line('v-good', '✓', g)).join('') : line('v-good', '·', '—')) + '</div>' +
      '<div class="verdict-col"><h3 class="mini-title">' + t.verdictBad + '</h3>' +
      (bad.length ? bad.map(b => line('v-bad', '→', b)).join('')
        : line('v-good', '✓', t.verdictNoneBad)) + '</div></div>' +
      (bad.length ? '<button id="verdictTips" class="btn-ghost-sm">' + t.verdictGoTips + '</button>' : '') +
      '</div>';
  }
  $('verdict').innerHTML = html;
  // peak-end: a passing report also ENDS on the win, after the advice section
  const end = $('informeEnd');
  if (end) end.innerHTML = passing ? '<div class="informe-end">' + esc(t.endLegal) + '</div>' : '';
  // the advice now lives further down this same report: scroll, don't switch tabs
  const b = $('verdictTips');
  // instant jump: a smooth scroll gets cancelled by lazy-image layout shifts above the target
  if (b) b.onclick = () => { $('tips').scrollIntoView(); };
}
