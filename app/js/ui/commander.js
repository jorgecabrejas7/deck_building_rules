import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { T } from '../i18n.js';
import { PIP } from './constants.js';
import { $, esc } from './helpers.js';
import { setCommanders } from '../pipeline.js';
import { bindSugPopovers } from './popover.js';

// Detection is a guess from the deck's colours, so the list is always offered:
// every card that could legally sit in the command zone is a chip, and clicking
// one re-derives the report around it.
const front = (s) => String(s).split(' // ')[0];

// Clicking a chip either starts a new command zone or joins the current one.
// A legal pair (partners, Doctor + companion, creature + Background) adds a
// second seat; anything else replaces what is there.
function pickOn(name, picked) {
  if (picked.includes(name)) return picked.filter(n => n !== name);
  const card = cardCache[name];
  if (picked.length === 1 && PodEngine.canPair(cardCache[picked[0]], card)) return [picked[0], name];
  return PodEngine.isLegalCommander(card) ? [name] : picked;
}

export function renderCommander() {
  const t = T(), r = state.result, el = $('commanderPanel');
  const cands = r.candidates || [];
  const picked = r.commanders || [];
  const manual = !!state.cmdPick;

  const seat = (name) => {
    const c = cardCache[name] || {};
    return '<div class="cmd-seat">' +
      '<span class="cmd-seat-art sugTile" data-img="' + esc(c.img_normal || '') + '" data-name="' + esc(front(name)) + '"' +
      (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
      '<div><div class="cmd-name">' + esc(front(name)) + '</div>' +
      '<div class="ci-pips">' + (c.color_identity || []).map(k =>
        '<span class="ci-pip" style="--pip:' + PIP[k] + '"></span>').join('') + '</div></div></div>';
  };

  const chip = (c) => {
    const on = picked.includes(c.name);
    // A Background can only join a "Choose a Background" commander already seated.
    const joinable = c.solo || (picked.length === 1 && PodEngine.canPair(cardCache[picked[0]], c.card));
    return '<button type="button" data-cmd="' + esc(c.name) + '"' + (on || joinable ? '' : ' disabled') +
      ' aria-pressed="' + on + '" class="cmd-chip' + (on ? ' on' : '') + '">' +
      '<span class="chip-art"' + (c.card.img_art ? ' style="background-image:url(\'' + c.card.img_art + '\')"' : '') + '></span>' +
      esc(front(c.name)) + (c.solo ? '' : ' <span class="cmd-chip-tag">' + esc(t.cmdBackground) + '</span>') + '</button>';
  };

  const pairable = picked.length === 1 && cands.some(c => PodEngine.canPair(cardCache[picked[0]], c.card));
  el.innerHTML = '<div class="panel panel-pad">' +
    '<div class="row-between"><h2 class="secT secT-lg">' + t.cmdT + '</h2>' +
    '<span class="comp-sub">' + esc(manual ? t.cmdManualTag : t.cmdAutoTag) + '</span></div>' +
    (picked.length
      ? '<div class="cmd-seats">' + picked.map(seat).join('') + '</div>'
      : '<div class="note-warn">' + esc(t.cmdNone) + '</div>') +
    (cands.length
      ? '<div class="mini-title">' + esc(t.cmdPick) + '</div>' +
        '<div class="cmd-chips">' + cands.map(chip).join('') +
        (manual ? '<button type="button" data-cmd-auto="1" class="cmd-chip cmd-chip-auto">↺ ' + esc(t.cmdAuto) + '</button>' : '') +
        '</div>' +
        (pairable ? '<div class="note-sm">' + esc(t.cmdPairHint) + '</div>' : '')
      : '');

  for (const b of el.querySelectorAll('[data-cmd]'))
    b.onclick = () => setCommanders(pickOn(b.dataset.cmd, picked));
  const auto = el.querySelector('[data-cmd-auto]');
  if (auto) auto.onclick = () => setCommanders(null);
  bindSugPopovers(el);
}
