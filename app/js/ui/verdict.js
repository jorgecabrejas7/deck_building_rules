import { state } from '../state.js';
import { T } from '../i18n.js';
import { RULES } from '../rules.js';
import { ARCH, CATS, EXTRA_PTS, MSG, dialName } from './constants.js';
import { $, esc, archKey, fill, tierTone } from './helpers.js';
import { compSlots, tagCount } from './comp.js';

// The answer to "is this deck in the pod?", first thing in the report: the point budget
// decides, as it always has. The power level and Wizards' checklist sit below as the
// separate readings they are.
function reason(r, t) {
  const ev = r.evalRes, a = RULES.tiers.tier1.max_points, b = RULES.tiers.tier2.max_points;
  const hard = ev.violations.filter(v => v.id !== 'budget');
  const main = fill(t['vWhy_' + (ev.points > b ? 'over' : ev.points > a ? 'tier2' : 'tier1')], { v: ev.points, a, b });
  return hard.length ? main + ' ' + fill(t.vWhyRules, { v: hard.length }) : main;
}

function violationLines(r, lang) {
  return r.evalRes.violations.filter(v => v.id !== 'budget').map(v =>
    v.id === 'conditional' ? (MSG.conditional[v.condId] ? MSG.conditional[v.condId][lang](v) : v.condId) : MSG[v.id][lang](v));
}

function spendLine(r, t, lang) {
  const spends = Object.entries(r.evalRes.breakdown).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return spends.length ? fill(t.vSpends, { c: spends.map(([k, v]) => (EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang)) + ' +' + v).join(', ') }) : '';
}

function powerLine(r, t) {
  const l = r.level;
  return l.pending ? t.brPending : fill(t.vPowerLine, { b: l.bracket, v: l.score });
}

function bracketLine(r, t) {
  const b = r.bracket;
  if (b.pending) return t.brPending;
  return b.fits ? fill(t.vBracketOk, { v: b.checklist })
    : fill(t.vBracketNo, { v: b.checklist, w: b.failed.map(id => t['brShort_' + id]).join(', ') });
}

export function renderVerdict() {
  const t = T(), r = state.result, lang = state.lang, ev = r.evalRes;
  const lines = violationLines(r, lang), spend = spendLine(r, t, lang);
  $('verdict').innerHTML = '<div class="verdict-hero ' + tierTone(ev.tier) + '">' +
    '<div class="vh-top"><h2 class="vh-tier">' + esc(t[ev.tier]) + '</h2>' +
    '<span class="vh-power mono">' + ev.points + ' <small>/ ' + RULES.tiers.tier2.max_points + ' ' + esc(t.pts) + '</small></span></div>' +
    '<p class="vh-why">' + esc(reason(r, t)) + '</p>' +
    lines.map(l => '<p class="vh-sub">✕ ' + esc(l) + '</p>').join('') +
    (spend ? '<p class="vh-sub">' + esc(spend) + '</p>' : '') +
    '<div class="vh-foot"><a class="vh-action" href="#sec-plan">' + esc(ev.tier === 'above' ? t.vActionOut : t.vActionIn) + ' ↓</a>' +
    '<a class="vh-bracket" href="#sec-profile">' + esc(powerLine(r, t)) + '</a>' +
    '<a class="vh-bracket" href="#sec-bracket">' + esc(bracketLine(r, t)) + '</a></div></div>';
  // the report closes on the same answers it opened with
  const podMark = ev.tier === 'above' ? '✕ ' + t.endOut : '✓ ' + t.endIn;
  const brMark = r.bracket.pending ? '' : (r.bracket.fits ? t.endBracketOk : t.endBracketNo);
  $('informeEnd').innerHTML = '<div class="informe-end' + (ev.tier === 'above' ? ' mixed' : '') + '">' +
    [podMark, brMark].filter(Boolean).map(esc).join(' · ') + '</div>';
}

// The coach's read of the deck's parts against its archetype: quiet polish, never the
// verdict. Lands, ramp and the rest count the same way as the profile (comp.js).
export function compositionHtml() {
  const t = T(), r = state.result, lang = state.lang, es = lang === 'es';
  const key = archKey();
  const arch = ARCH.find(x => x.k === key) || ARCH[ARCH.length - 1];
  const specCats = new Set((arch.spec || []).map(([c]) => c));
  const good = [], bad = [];
  const label = c => esc(CATS[c][lang]);
  // canonical composition notation: "Categoría — Estado · valor/min–max"
  for (const sl of compSlots()) {
    const v = tagCount(sl.cat), range = v + '/' + sl.min + '–' + sl.max, core = specCats.has(sl.cat);
    if (v >= sl.min && v <= sl.max) {
      good.push(label(sl.cat) + ' — ' + t.ok + ' · ' + range + (core ? ' · ' + (es ? 'clave del arquetipo' : 'archetype core') : ''));
    } else if (v < sl.min) {
      bad.push(label(sl.cat) + ' — ' + t.few + ' · ' + range + (core ? ' · ' + (es ? 'la pata que le falta a tu plan' : 'the missing leg of your plan') : ''));
    } else {
      bad.push(label(sl.cat) + ' — ' + t.many + ' · ' + range);
    }
  }
  const avg = r.stats.avg_cmc;
  if (avg != null) {
    const highCap = key === 'aggro' ? 2.8 : 3.6;
    if (avg > highCap) bad.push((es ? 'Curva media alta (' : 'High average curve (') + avg + (key === 'aggro' ? (es ? ') para un mazo aggro' : ') for an aggro deck') : ')'));
    else good.push((es ? 'Curva media sana (' : 'Healthy average curve (') + avg + ')');
  }
  if (state.arch !== 'auto' && r.detected.key !== state.arch) {
    const det = ARCH.find(x => x.k === r.detected.key);
    bad.push(t.verdictMismatch + (det ? ': ' + esc(det.name[lang]) : ''));
  }
  const line = (cls, ic, txt) => '<div class="v-line ' + cls + '"><span class="v-ic" aria-hidden="true">' + ic + '</span><span>' + txt + '</span></div>';
  return '<div class="verdict-cols"><div class="verdict-col"><h4 class="mini-title">' + t.verdictGood + '</h4>' +
    (good.length ? good.map(g => line('v-good', '✓', g)).join('') : line('v-good', '·', '—')) + '</div>' +
    '<div class="verdict-col"><h4 class="mini-title">' + t.verdictPolish + '</h4>' +
    (bad.length ? bad.map(b => line('v-polish', '·', b)).join('') : line('v-good', '✓', t.verdictNoneBad)) + '</div></div>';
}
