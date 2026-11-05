import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH, CATS } from './constants.js';
import { $, esc, archKey, bannedCards, fill, tierTone } from './helpers.js';
import { compSlots, tagCount } from './comp.js';

// The answer to "is this deck in the pod?", first thing in the report: the tier, why,
// and what to do about it. Power decides, with the banned list on top; the bracket
// sits below as the separate yardstick it is.
function reason(r, t) {
  const v = r.verdict, banned = bannedCards(r);
  if (v.pending) return t.vPending;
  const power = fill(t['vWhy_' + v.byPower], { v: v.score, a: v.limits.tier1_max, b: v.limits.tier2_max });
  return banned.length ? fill(t.vWhyBanned, { c: banned.join(', ') }) + ' ' + power : power;
}

function bracketLine(r, t) {
  const b = r.bracket;
  if (b.pending) return t.brPending;
  return b.fits ? fill(t.vBracketOk, { v: b.checklist })
    : fill(t.vBracketNo, { v: b.checklist, w: b.failed.map(id => t['brShort_' + id]).join(', ') });
}

export function renderVerdict() {
  const t = T(), r = state.result, v = r.verdict;
  const keys = v.tier !== 'tier1' && !v.pending ? r.power.keyCards.slice(0, 3).map(c => c.name) : [];
  $('verdict').innerHTML = '<div class="verdict-hero ' + (v.pending ? 'tone-pending' : tierTone(v.tier)) + '">' +
    '<div class="vh-top"><h2 class="vh-tier">' + esc(t[v.tier]) + '</h2>' +
    '<span class="vh-power mono">' + (v.pending ? '…' : esc(t.vBracketWord) + ' ' + esc(v.bracket) + ' <small>' + v.score + ' / 10 ' + esc(t.vPowerWord) + '</small>') + '</span></div>' +
    '<p class="vh-why">' + esc(reason(r, t)) + '</p>' +
    (keys.length ? '<p class="vh-sub">' + esc(fill(t.vKeyCards, { c: keys.join(', ') })) + '</p>' : '') +
    '<div class="vh-foot"><a class="vh-action" href="#sec-plan">' + esc(v.tier === 'above' ? t.vActionOut : t.vActionIn) + ' ↓</a>' +
    '<a class="vh-bracket" href="#sec-bracket">' + esc(bracketLine(r, t)) + '</a></div></div>';
  // the report closes on the same two answers it opened with
  const end = $('informeEnd');
  const podMark = v.pending ? '' : (v.tier === 'above' ? '✕ ' + t.endOut : '✓ ' + t.endIn);
  const brMark = r.bracket.pending ? '' : (r.bracket.fits ? t.endBracketOk : t.endBracketNo);
  end.innerHTML = '<div class="informe-end' + (v.tier === 'above' ? ' mixed' : '') + '">' +
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
