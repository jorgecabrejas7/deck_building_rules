import { state } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { COMBO_TAGS } from '../engine/index.js';
import { MSG } from './constants.js';
import { comboLine, tagChip } from './combos.js';
import { $, esc, fill } from './helpers.js';
import { ICON, answer, cardList, cardName, fold, more, paint, tableWrap } from './reading.js';

// Wizards' checklist, deliberately separate from the pod's point budget and from the
// power level: they answer different questions and a deck can pass one and fail another.
// Every criterion is listed, passing ones included, so the panel doubles as the rulebook.
const ORDER = ['game_changers', 'mass_land_denial', 'extra_turns', 'combos', 'legality'];
const COMBO_CAP = 3;

const names = (list) => list.map(n => esc(n.split(' // ')[0])).join(', ');
const text = (s) => '<p class="rd-q">' + s + '</p>';

// Combos behind a criterion: the first few, the rest folded (the full list is just below).
function combosOf(list, t) {
  if (!list.length) return '';
  const lines = (part) => '<ul class="rd-lines">' + part.map(c => '<li>' + comboLine(c) + '</li>').join('') + '</ul>';
  return lines(list.slice(0, COMBO_CAP)) +
    (list.length > COMBO_CAP ? more(fill(t.sugMore, { v: list.length - COMBO_CAP }), lines(list.slice(COMBO_CAP))) : '');
}

// What the row says about this deck: the state on one line, then the evidence.
const landNote = (b, t) => (b.landMaybe.length ? '<p class="rd-flag">' + ICON.wait + '<span>' + esc(fill(t.watch_landMaybe, { c: names(b.landMaybe) })) + '</span></p>' : '');

function detail(c, t, lang) {
  switch (c.id) {
    case 'game_changers':
      return { state: String(c.value), why: cardList(c.cards) };
    case 'mass_land_denial':
      return !c.ok
        ? { state: fill(t.brCountState, { v: c.value }), why: cardList(c.cards) + combosOf(c.combos, t) }
        : { state: t.brNone, why: '' };
    case 'extra_turns': {
      const parts = [];
      if (c.looped.length) parts.push(text(fill(t.brWhyNoTurnsLoop, { c: names(c.looped) })));
      if (c.value > c.max) parts.push(text(fill(t.brWhyNoTurnsMany, { v: c.value, m: c.max })));
      if (c.combos.length) parts.push(text(t.brWhyTurnsCombo) + combosOf(c.combos, t));
      return { state: c.value || c.combos.length ? String(c.value) : t.brNone,
        why: parts.join('') + cardList(c.cards) };
    }
    case 'combos': {
      const parts = [];
      if (c.combos.length) parts.push(text(t.brWhyNoCombo) + combosOf(c.combos, t));
      if (c.borderline.length) parts.push(text(t.brBorderline) + combosOf(c.borderline, t));
      return { state: c.combos.length ? fill(t.brB4State, { v: c.combos.length })
        : c.borderline.length ? fill(t.brB34State, { v: c.borderline.length }) : t.brNoB4, why: parts.join('') };
    }
    case 'legality':
      return { state: c.ok ? t.brLegalOk : fill(t.brCountState, { v: c.issues.length }),
        why: c.ok ? '' : c.issues.slice(0, 6).map(v => text(esc(MSG['valid_' + v.id][lang](v)))).join('') };
    default:
      return { state: '', why: '' };
  }
}

const CHECK_STATE = (c, waiting) => (waiting ? 'wait' : !c.ok && c.level === 0 ? 'fail' : 'b' + (c.level || 2));

function rows(b, t, lang) {
  // what sets the bracket reads first
  return '<ul class="rd-checks">' + [...ORDER].sort((x, y) => b.checks.find(c => c.id === y).level - b.checks.find(c => c.id === x).level || (x === 'legality') - (y === 'legality')).map(id => {
    const c = b.checks.find(x => x.id === id);
    const d = detail(c, t, lang);
    const waiting = c.pending && c.ok;
    const badge = id === 'legality' ? (c.ok ? ICON.check : ICON.cross) : waiting ? ICON.wait : esc(String(c.level || 2));
    return '<li class="rd-check ' + CHECK_STATE(c, waiting) + '"><span class="rd-badge" title="' + esc(fill(t.brLevelTag, { v: c.level || 2 })) + '">' + badge + '</span>' +
      '<div class="rd-check-body"><div class="rd-check-head">' +
        '<span class="rd-rule">' + esc(t['br_' + id]) + '</span>' +
        '<span class="rd-state">' + esc(waiting ? t.brChecking : d.state) + '</span>' +
      '</div>' + (d.why && !waiting ? '<div class="rd-evidence">' + d.why + '</div>' : '') + '</div></li>';
  }).join('') + '</ul>';
}

// Why the deck sits where it does: the criteria that set its bracket, in one sentence.
function because(b, t) {
  const top = b.checks.filter(c => c.id !== 'legality' && c.level === b.checklist && c.level >= 3);
  if (!top.length) return fill(t.brFitsPlain, { v: b.checklist });
  const part = (c) => {
    if (c.id === 'game_changers') return fill(t.brBc_gc, { v: c.value });
    if (c.id === 'mass_land_denial') return fill(t.brBc_mld, { c: names([...c.cards, ...c.combos.map(x => x.cards[0])].slice(0, 3)) });
    if (c.id === 'extra_turns') return t.brBc_turns;
    return c.combos.length ? fill(t.brBc_comboR, { v: c.combos.length }) : fill(t.brBc_comboS, { v: c.borderline.length });
  };
  return fill(t.brFitsBecause, { v: b.checklist, w: new Intl.ListFormat(state.lang).format(top.map(part)) });
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
  return fold('rulezero', t.rzT, String(notes.length), '<ul class="rd-notes">' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>');
}

function legend(t) {
  const row = (n) => '<tr><th scope="row">' + n + '</th>' + t.brTable[n - 1].map((x, i) => '<td data-h="' + esc(t.brTableHead[i]) + '">' + esc(x) + '</td>').join('') + '</tr>';
  return fold('brackets', t.brLegendT, '', tableWrap('<thead><tr><th></th>' +
    t.brTableHead.map(h => '<th scope="col">' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' + [1, 2, 3, 4, 5].map(row).join('') + '</tbody>', 'text') +
    '<p class="rd-q">' + esc(t.brLegendX) + '</p>');
}

// A list cannot prove intent, so the checklist never claims Bracket 1 or 5: those are
// about theme and metagame, and the legend says so. Spellbook's estimate stays a quiet aside.
export function renderBracket() {
  const t = T(), lang = state.lang, b = state.result.bracket;
  const sb = b.pending ? '' : '<p class="rd-apart">' + esc(t.brReadSb) + ': ' +
    (b.estimate === 'B' ? esc(t.brIllegal) : tagChip(b.estimate, t)) + '</p>';

  paint($('bracket'), '<div class="panel rd">' +
    answer({ label: t.brReadLabel, value: b.pending ? '…' : String(b.checklist),
      sub: b.pending ? '' : esc(t['brName' + b.checklist]),
      body: '<p class="rd-why">' + esc(b.pending ? t.brPending : because(b, t)) + '</p>' + sb + landNote(b, t) }) +
    rows(b, t, lang) +
    '<div class="rd-folds">' + ruleZero(b, t) + legend(t) + '</div></div>');
}

// Compact read for the sticky summary strip. A criterion still waiting on the
// combo check cannot be called a pass, so the tile stays neutral until it lands
// (and stays neutral for good under file://, where the check never runs).
export function bracketTile() {
  const t = T(), b = state.result.bracket;
  return '<div class="panel stat-tile"' + (b.pending ? ' title="' + esc(t.brPending) + '"' : '') + '>' +
    '<div class="tile-label">' + t.sumWizards + '</div>' +
    '<div class="mono stat-value">' + (b.pending ? t.brChecking : b.checklist) + '</div></div>';
}
