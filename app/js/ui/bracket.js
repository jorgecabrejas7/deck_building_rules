import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { COMBO_TAGS } from '../engine/index.js';
import { MSG } from './constants.js';
import { comboInline, tagChip } from './combos.js';
import { $, esc, fill } from './helpers.js';

// The bracket report, deliberately separate from the pod's point budget: the
// two answer different questions and a deck can pass one and fail the other.
// Every criterion is listed, passing ones included, so the panel doubles as the
// rulebook. Each row says which bracket that barometer alone would put the deck in.
const ORDER = ['game_changers', 'mass_land_denial', 'extra_turns', 'combos', 'legality'];

const list = (names) => names.map(n => esc(n.split(' // ')[0])).join(', ');
const inlineList = (combos, cls) => combos.map(c => comboInline(c, cls)).join('');

// What the row says about this deck: the state on one line, then the evidence.
function detail(c, t, lang) {
  switch (c.id) {
    case 'game_changers':
      return { state: fill(t.brGcState, { v: c.value, m: c.max }), why: list(c.cards) };
    case 'mass_land_denial':
      return !c.ok
        ? { state: fill(t.brCountState, { v: c.value }),
            why: list(c.cards) + inlineList(c.combos) }
        : { state: t.brNone, why: '' };
    case 'extra_turns': {
      const parts = [];
      if (c.looped.length) parts.push(fill(t.brWhyNoTurnsLoop, { c: list(c.looped) }));
      if (c.value > c.max) parts.push(fill(t.brWhyNoTurnsMany, { v: c.value, m: c.max }));
      if (c.combos.length) parts.push(t.brWhyTurnsCombo + inlineList(c.combos));
      return { state: c.value || c.combos.length ? fill(t.brGcState, { v: c.value, m: c.max }) : t.brNone,
        why: parts.join(' ') || list(c.cards) };
    }
    case 'combos': {
      const parts = [];
      if (c.combos.length) parts.push(t.brWhyNoCombo + inlineList(c.combos));
      if (c.borderline.length) parts.push('<span class="br-sub">' + t.brBorderline + '</span>' + inlineList(c.borderline));
      return { state: c.combos.length ? fill(t.brB4State, { v: c.combos.length })
        : c.borderline.length ? fill(t.brB34State, { v: c.borderline.length }) : t.brNoB4, why: parts.join('') };
    }
    case 'legality':
      return { state: c.ok ? t.brLegalOk : fill(t.brCountState, { v: c.issues.length }),
        why: c.ok ? '' : c.issues.slice(0, 6).map(v => esc(MSG['valid_' + v.id][lang](v))).join(' · ') };
    default:
      return { state: '', why: '' };
  }
}

function rows(b, t, lang) {
  // what fails reads first
  return [...ORDER].sort((x, y) => b.failed.includes(y) - b.failed.includes(x)).map(id => {
    const c = b.checks.find(x => x.id === id);
    const d = detail(c, t, lang);
    const waiting = c.pending && c.ok;
    return '<div class="br-row ' + (c.ok ? 'br-ok' : 'br-fail') + '">' +
      '<span class="br-ic" aria-hidden="true">' + (waiting ? '…' : c.ok ? '✓' : '✕') + '</span>' +
      '<div class="br-text">' +
        '<div class="br-head"><span class="br-rule">' + esc(t['br_' + id]) + '</span>' +
        '<span class="vh"> — ' + (waiting ? t.brPending : c.ok ? t.brOk : t.brFail) + '</span>' +
        '<span class="br-state">' + esc(waiting ? t.brChecking : d.state) + '</span>' +
        (c.level ? '<span class="br-level lv-' + c.level + '" title="' + esc(t.brLevelHelp) + '">B' + c.level + '</span>' : '') +
        '</div>' +
        (d.why && !waiting ? '<div class="br-why' + (c.ok ? ' calm' : '') + '">' + d.why + '</div>' : '') +
      '</div></div>';
  }).join('');
}

// The shortest route back into Bracket 3, in the words a player acts on.
function cutsBlock(b, t) {
  const { cards, choices } = b.cuts;
  if (b.fits || (!cards.length && !choices.length)) return '';
  const why = (c) => c.reasons.map(r => r === 'combos'
    ? fill(c.combos === 1 ? t.brCutCombo : t.brCutCombos, { v: c.combos })
    : t['brCut_' + r]).join(' · ');
  return '<div class="br-cuts tone-warn"><h3 class="mini-title">' + esc(t.brCutsT) + '</h3>' +
    '<ul class="br-cut-list">' +
    cards.map(c => '<li><b>' + esc(c.card.split(' // ')[0]) + '</b> <span class="br-cut-why">' + esc(why(c)) + '</span></li>').join('') +
    choices.map(c => '<li>' + fill(t['brChoice_' + c.id], { v: c.count }) + ' <span class="br-cut-why">' + list(c.from) + '</span></li>').join('') +
    '</ul></div>';
}

// Things a table deserves to hear before game one, even when no rule is broken.
// "Dense" is measured against the precon baselines the pod rules already keep.
function ruleZero(b, t) {
  const stats = state.result.stats, notes = [];
  const dense = (k) => (stats[k] || 0) > ((RULES.dials[k] || {}).baseline_max ?? Infinity);
  for (const k of ['tutors', 'fast_mana', 'free_spells', 'stax_effects', 'counterspells'])
    if (dense(k)) notes.push(fill(t['rz_' + k], { v: stats[k] }));
  if (b.locks.length) notes.push(fill(t.rz_locks, { v: b.locks.length }));
  const wins = b.combos.filter(c => c.win).length;
  if (wins) notes.push(fill(t.rz_wins, { v: wins }));
  if (COMBO_TAGS[b.estimate].level > b.checklist) notes.push(t.rz_estimate);
  if (!notes.length) return '';
  return '<div class="br-notes"><h3 class="mini-title">' + esc(t.rzT) + '</h3>' +
    '<ul class="br-note-list">' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>';
}

// Both reads side by side. A list cannot prove intent, so the checklist never
// claims Bracket 1 or 5: those are about theme and metagame, and it says so.
function reads(b, t) {
  const tag = COMBO_TAGS[b.estimate];
  const estimate = b.estimate === 'B' ? t.brIllegal : tag.bracket;
  return '<div class="br-reads">' +
    '<div class="br-read"><span class="tile-label">' + esc(t.brReadWotc) + '</span>' +
      '<span class="br-read-n mono">' + (b.pending ? '…' : b.checklist) + '</span>' +
      '<span class="note-sm">' + esc(b.pending ? t.brPending : t['brName' + b.checklist]) + '</span></div>' +
    '<div class="br-read"><span class="tile-label">' + esc(t.brReadSb) + '</span>' +
      '<span class="br-read-n mono">' + (b.pending ? '…' : esc(estimate)) + '</span>' +
      '<span class="note-sm">' + (b.pending || b.estimate === 'B' ? '' : tagChip(b.estimate, t)) + '</span></div>' +
    '</div>';
}

function legend(t) {
  const row = (n) => '<tr><th scope="row">' + n + '</th>' +
    t.brTable[n - 1].map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>';
  return '<details class="br-legend"><summary>' + esc(t.brLegendT) + '</summary>' +
    '<div class="tbl-scroll"><table class="br-table"><thead><tr><th></th>' +
    t.brTableHead.map(h => '<th scope="col">' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' + [1, 2, 3, 4, 5].map(row).join('') + '</tbody></table></div>' +
    '<p class="note-sm">' + esc(t.brLegendX) + '</p></details>';
}

export function renderBracket() {
  const t = T(), lang = state.lang, b = state.result.bracket;
  const legal = (b.checks.find(c => c.id === 'legality').issues || [])[0];
  const summary = b.pending ? t.brPending
    : b.fits ? t.brSumFits
    : fill(t.brSumFails, { v: b.failed.map(id => id === 'legality' ? MSG['valid_' + legal.id][lang](legal) : t['brShort_' + id]).join(', ') });

  // No title here: the part header above the panel already names this section,
  // so the panel leads straight with the verdict and the two reads.
  $('bracket').innerHTML = '<div class="panel panel-pad-lg">' +
    '<div class="br-top">' + reads(b, t) +
      '<div class="br-call">' +
        '<span class="br-verdict ' + (!b.fits ? 'tone-bad' : b.pending ? 'tone-warn' : 'tone-ok') + '">' +
          (!b.fits ? '✕ ' + esc(t.brFitsNo) : b.pending ? esc(t.brPending) : '✓ ' + esc(t.brFits)) + '</span>' +
        '<p class="br-sum">' + esc(summary) + '</p></div></div>' +
    '<div class="br-rows">' + rows(b, t, lang) + '</div>' +
    cutsBlock(b, t) + ruleZero(b, t) + legend(t) + '</div>';
}

// Compact read for the sticky summary strip. A criterion still waiting on the
// combo check cannot be called a pass, so the tile stays neutral until it lands
// (and stays neutral for good under file://, where the check never runs).
export function bracketTile() {
  const t = T(), b = state.result.bracket;
  const tone = !b.fits ? 'tone-bad' : b.pending ? '' : 'tone-ok';
  const value = b.pending ? t.brChecking : (b.fits ? '✓ ' + t.brYes : '✕ ' + t.brNo);
  return '<div class="panel stat-tile' + (tone ? ' toned ' + tone : '') + '"' +
    (b.pending ? ' title="' + esc(t.brPending) + '"' : '') + '>' +
    '<div class="tile-label">' + t.brTile + '</div>' +
    '<div class="mono stat-value">' + value + '</div></div>';
}
