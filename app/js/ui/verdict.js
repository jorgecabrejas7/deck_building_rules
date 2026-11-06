import { state } from '../state.js';
import { T } from '../i18n.js';
import { RULES } from '../rules.js';
import { ARCH, CATS, EXTRA_PTS, MSG, dialName } from './constants.js';
import { $, esc, archKey, fill, tierTone } from './helpers.js';
import { compSlots, tagCount } from './comp.js';
import { moreList } from '../engine/index.js';
import { makeRuleZeroCard } from './rulezero.js';

// The answer to "is this deck in the pod?", first thing in the report: the point budget
// decides, as it always has. The power level and Wizards' checklist sit below as the
// separate readings they are.
function reason(r, t) {
  const ev = r.evalRes, a = RULES.tiers.tier1.max_points, b = RULES.tiers.tier2.max_points;
  const hard = ev.violations.filter(v => v.id !== 'budget');
  if (hard.length && ev.points <= b) return fill(t.vWhyFitsButRules, { v: ev.points, b, a: hard.length });
  const main = fill(t['vWhy_' + (ev.points > b ? 'over' : ev.points > a ? 'tier2' : 'tier1')], { v: ev.points, a, b });
  return hard.length ? main + ' ' + fill(t.vWhyRules, { v: hard.length }) : main;
}

function violationLines(r, lang) {
  return r.evalRes.violations.filter(v => v.id !== 'budget').map(v =>
    v.id === 'conditional' ? (MSG.conditional[v.condId] ? MSG.conditional[v.condId][lang](v) : v.condId) : MSG[v.id][lang](v));
}

export const watchLine = (w, t) => fill(t['watch_' + (w.kind === 'combo' ? w.tag : w.kind)], { c: moreList(w.items, 3) });

// Why it reads where it does, and what a table may want to look at: shared with Poder.
export function readingHtml(r, t) {
  const l = r.level;
  const lead = l.floor ? fill(t.readFloor, { b: l.powerBracket }) : l.watch.length ? t.readWatch : fill(t.readFits, { b: l.bracket });
  return (l.precon ? '<p class="sum-note">' + esc(fill(t.readPrecon, { c: l.precon.name })) + '</p>' : '') +
    '<p class="sum-read">' + esc(lead) + '</p>' +
    (l.watch.length ? '<ul class="sum-watch">' + l.watch.map(w => '<li>' + esc(watchLine(w, t)) + '</li>').join('') + '</ul>' : '') +
    (l.tips.length ? '<p class="sum-note"><b>' + esc(t.readTipT) + '.</b> ' + esc(fill(t.tipOnCurve, { c: l.tips.slice(0, 3).join(' · ') })) + '</p>' : '');
}

const tile = (go, label, value, sub) => '<a class="sum-tile" href="#' + go + '" data-go="' + go + '"><span class="sum-tile-l">' + esc(label) + '</span>' +
  '<span class="sum-tile-v">' + esc(value) + '</span><span class="sum-tile-s">' + esc(sub) + '</span></a>';

export function renderVerdict() {
  const t = T(), r = state.result, ev = r.evalRes, l = r.level, b = r.bracket;
  const budget = RULES.tiers.tier2.max_points, out = ev.tier === 'above';
  const lines = violationLines(r, state.lang);
  const wins = r.profile.wins;
  $('verdict').innerHTML = '<section class="sum">' +
    '<p class="sum-label">' + esc(t.pfPracticalLabel) + '</p>' +
    '<h2 class="sum-bracket">' + (l.pending ? '…' : esc(l.bracket)) + '<small>' + esc(fill(t.pfScore, { v: l.score })) + '</small></h2>' +
    (l.pending ? '<p class="sum-read">' + esc(t.brPending) + '</p>' : readingHtml(r, t)) +
    '<div class="sum-tiles">' +
      tile('points', t.sumPod, t['short_' + ev.tier], ev.points + ' ' + fill(t.sumOfBudget, { b: budget })) +
      tile('bracket', t.sumWizards, b.pending ? '…' : String(b.checklist), b.pending ? t.brChecking : t['brName' + b.checklist]) +
      tile('combos', t.sumCombos, b.pending ? '…' : String(b.combos.length), wins.checked ? fill(t.sumEnding, { v: Math.ceil(wins.ending) }) : t.brChecking) +
      tile('power', t.sumSalt, r.salt ? String(Math.round(r.salt.total)) : '…', r.power.pillars.salt + ' / 100') +
      tile('mana', t.mnScore, String(r.profile.manabase.score), fill(t.mnOf, { v: '' }).trim()) +
    '</div>' +
    '<div class="sum-pod"><p>' + esc(reason(r, t)) + (lines.length ? ' ' + esc(lines[0]) + (lines.length > 1 ? ' +' + (lines.length - 1) : '') : '') + '</p>' +
      '<a class="sum-cta" href="#points" data-go="points">' + esc(out ? t.sumBack : t.sumImprove) + ' →</a></div>' +
    (l.pending ? '' : '<button type="button" class="sum-share" id="r0Btn">' + esc(t.r0Btn) + '</button>') +
    '</section>';
  if (!l.pending) $('r0Btn').onclick = makeRuleZeroCard;
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
