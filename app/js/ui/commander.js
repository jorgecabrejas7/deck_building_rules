import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { T } from '../i18n.js';
import { PIP } from './constants.js';
import { $, esc } from './helpers.js';
import { setCommanders } from '../pipeline.js';
import { bindSugPopovers } from './popover.js';

// Detection is a guess from the deck's colours, so the whole deck is on offer:
// every card is listed, the ones that may legally sit in the command zone come
// first and are clickable, and the rest stay visible with the reason they are
// not — a shortlist would ask the user to trust a filter they cannot inspect.
const front = (s) => String(s).split(' // ')[0];

// Clicking a card either starts a new command zone or joins the current one.
// A legal pair (partners, Doctor + companion, creature + Background) adds a
// second seat; anything else replaces what is there.
function pickOn(name, picked) {
  if (picked.includes(name)) return picked.filter(n => n !== name);
  const card = cardCache[name];
  if (picked.length === 1 && PodEngine.canPair(cardCache[picked[0]], card)) return [picked[0], name];
  return PodEngine.isLegalCommander(card) ? [name] : picked;
}

const KIND_ORDER = { solo: 0, second: 1, banned: 2, ineligible: 3 };

export function renderCommander() {
  const t = T(), r = state.result, el = $('commanderPanel');
  const picked = r.commanders || [];
  const manual = !!state.cmdPick;
  const options = (r.options || []).slice().sort((a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
  const eligible = options.filter(o => o.kind === 'solo' || o.kind === 'second').length;

  const seat = (name) => {
    const c = cardCache[name] || {};
    return '<div class="cmd-seat">' +
      '<span class="cmd-seat-art sugTile" data-img="' + esc(c.img_normal || '') + '" data-name="' + esc(front(name)) + '"' +
      (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
      '<div><div class="cmd-name">' + esc(front(name)) + '</div>' +
      '<div class="ci-pips">' + (c.color_identity || []).map(k =>
        '<span class="ci-pip" style="--pip:' + PIP[k] + '"></span>').join('') + '</div></div></div>';
  };

  // Why a card cannot be chosen right now — shown on the chip, not hidden in a
  // filter, so "why isn't my commander here?" answers itself.
  const blockedBy = (o) => {
    if (o.kind === 'banned') return t.cmdWhyBanned;
    if (o.kind === 'ineligible') return t.cmdWhyNotLegendary;
    if (o.kind === 'second' && !(picked.length === 1 && PodEngine.canPair(cardCache[picked[0]], o.card)))
      return t.cmdBackground;
    return null;
  };

  const chip = (o) => {
    const on = picked.includes(o.name);
    const why = on ? null : blockedBy(o);
    // "not a legendary creature" is the reason for most of the deck, so it
    // rides the faded style and the tooltip; only the surprising reasons
    // (banned, Background) earn a visible tag.
    const tag = why && o.kind !== 'ineligible' ? why : null;
    return '<button type="button" data-cmd="' + esc(o.name) + '"' + (why ? ' disabled title="' + esc(why) + '"' : '') +
      ' aria-pressed="' + on + '" class="cmd-chip' + (on ? ' on' : '') + (why ? ' cmd-chip-out' : '') + '">' +
      '<span class="chip-art"' + (o.card.img_art ? ' style="background-image:url(\'' + o.card.img_art + '\')"' : '') + '></span>' +
      '<span class="cmd-chip-name">' + esc(front(o.name)) + '</span>' +
      (tag ? '<span class="cmd-chip-tag">' + esc(tag) + '</span>' : '') +
      (why ? '<span class="vh"> — ' + esc(why) + '</span>' : '') + '</button>';
  };

  const pairable = picked.length === 1 && options.some(o =>
    (o.kind === 'solo' || o.kind === 'second') && PodEngine.canPair(cardCache[picked[0]], o.card));

  el.innerHTML = '<div class="panel panel-pad">' +
    '<div class="row-between"><h2 class="secT secT-lg">' + t.cmdT + '</h2>' +
    '<span class="comp-sub">' + esc(manual ? t.cmdManualTag : t.cmdAutoTag) + '</span></div>' +
    (picked.length
      ? '<div class="cmd-seats">' + picked.map(seat).join('') + '</div>'
      : '<div class="note-warn">' + esc(t.cmdNone) + '</div>') +
    (options.length
      ? '<div class="row-between"><span class="mini-title">' + esc(t.cmdPick) + '</span>' +
        '<span class="comp-sub">' + t.cmdLegalCount.replace('%n', eligible).replace('%t', options.length) + '</span></div>' +
        '<div class="cmd-tools">' +
        '<input id="cmdSearch" type="search" class="cmd-search" autocomplete="off"' +
        ' placeholder="' + esc(t.cmdSearch) + '" aria-label="' + esc(t.cmdSearch) + '">' +
        (manual ? '<button type="button" data-cmd-auto="1" class="cmd-chip cmd-chip-auto">↺ ' + esc(t.cmdAuto) + '</button>' : '') +
        '</div>' +
        '<div id="cmdList" class="cmd-chips">' + options.map(chip).join('') +
        '<div id="cmdNoMatch" class="note-sm" hidden>' + esc(t.cmdNoMatch) + '</div></div>' +
        (pairable ? '<div class="note-sm">' + esc(t.cmdPairHint) + '</div>' : '')
      : '');

  for (const b of el.querySelectorAll('[data-cmd]'))
    b.onclick = () => setCommanders(pickOn(b.dataset.cmd, picked));
  const auto = el.querySelector('[data-cmd-auto]');
  if (auto) auto.onclick = () => setCommanders(null);
  // Filtering hides chips in place instead of re-rendering, so typing stays
  // instant and never disturbs focus or the rest of the report.
  const search = $('cmdSearch');
  if (search) search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const b of el.querySelectorAll('[data-cmd]')) {
      const hit = !q || b.dataset.cmd.toLowerCase().includes(q);
      b.hidden = !hit;
      if (hit) shown++;
    }
    $('cmdNoMatch').hidden = shown > 0;
  };
  bindSugPopovers(el);
}
