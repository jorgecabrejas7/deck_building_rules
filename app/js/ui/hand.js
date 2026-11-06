import { Goldfish, readCard } from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { T } from '../i18n.js';
import { $, esc, fill } from './helpers.js';

function begin() {
  const r = state.result;
  return Goldfish.newGame(Goldfish.gameCards({ cardsInfo: r.cardsInfo, commanders: r.commanders, read: x => readCard(x, state.cardTags) }));
}

const ACTIONS = {
  begin,
  mull: g => Goldfish.mulligan(g),
  keep: Goldfish.keep,
  next: Goldfish.nextTurn,
  bottom: Goldfish.bottom,
  play: Goldfish.play,
  cast: Goldfish.cast,
  back: Goldfish.giveBack,
};

function face(name, alt) {
  const c = cardCache[name] || {};
  return c.img_normal
    ? '<img src="' + c.img_normal + '" loading="lazy" alt="' + alt + '">'
    : '<div class="hand-ph">' + esc(name) + '</div>';
}

// With an action the card is a real button; during the opening hand it is only a picture.
function zone(cards, act, label) {
  return cards.map((c, i) => act
    ? '<button type="button" class="gf-card" data-act="' + act + '" data-i="' + i + '" aria-label="' + fill(label, { n: esc(c.name) }) + '">' + face(c.name, '') + '</button>'
    : '<div>' + face(c.name, esc(c.name)) + '</div>').join('');
}

function section(title, cards, act, label, cls) {
  return '<h3 class="gf-zone">' + title + ' <span>' + cards.length + '</span></h3>' +
    (cards.length ? '<div class="' + cls + '">' + zone(cards, act, label) + '</div>' : '<div class="note-muted">' + T().handEmpty + '</div>');
}

const btn = (act, cls, label, disabled) =>
  '<button type="button" class="' + cls + '" data-act="' + act + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';

function stat(label, value, cls) {
  return '<div class="gf-stat' + (cls ? ' ' + cls : '') + '"><b>' + value + '</b><span>' + label + '</span></div>';
}

function gameHtml(g) {
  const t = T(), playing = g.turn > 0, bottoming = g.toBottom > 0;
  const atEnd = g.turn >= Goldfish.LAST_TURN;
  const prompt = bottoming ? fill(t.handBottomN, { n: g.toBottom }) : !playing ? t.handOpening : atEnd ? t.handEnd : t.handPlaying;
  return '<div class="gf-stats">' +
    stat(t.handTurn, playing ? g.turn + '/' + Goldfish.LAST_TURN : '–') +
    stat(t.handMana, Goldfish.manaAvailable(g), 'gf-mana') +
    stat(t.handCards, g.hand.length) +
    stat(t.handLibrary, g.library.length) +
    stat(t.handMulls, g.mulligans) + '</div>' +
    '<div class="note-muted">' + prompt + '</div>' +
    (g.command.length ? section(t.handCommand, g.command, playing ? 'cast' : null, t.handCast, 'gf-field') : '') +
    section(t.handCards, g.hand, bottoming ? 'bottom' : playing ? 'play' : null, bottoming ? t.handSend : t.handPlay, 'hand-grid') +
    section(t.handField, g.battlefield, 'back', t.handReturn, 'gf-field');
}

function controls(g) {
  const t = T();
  if (!g) return btn('begin', 'btn-accent-sm', t.handDraw);
  let html = '';
  if (g.turn > 0) html += btn('next', 'btn-accent-sm', t.handNext, g.turn >= Goldfish.LAST_TURN);
  else if (!g.toBottom) html += btn('keep', 'btn-accent-sm', t.handKeep) + btn('mull', 'btn-ghost-sm', t.handMull, g.mulligans >= Goldfish.MAX_MULLIGANS);
  return html + btn('begin', 'btn-ghost-sm', t.handRestart);
}

export function renderHand() {
  const t = T(), g = state.hand, panel = $('handPanel');
  panel.innerHTML = '<div class="hand-head"><h2 class="secT">' + t.handT + '</h2><div class="gf-bar">' + controls(g) + '</div></div>' +
    (g ? gameHtml(g) : '<div class="note-muted">' + t.handHint + '</div>');
  panel.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const { act, i } = b.dataset;
    state.hand = ACTIONS[act](state.hand, +i);
    renderHand();
    // The render replaced the button, so a keyboard player would lose their place.
    const same = '[data-act="' + act + '"]' + (i === undefined ? '' : '[data-i="' + i + '"]') + ':not(:disabled)';
    (panel.querySelector(same) || panel.querySelector('[data-act]:not(:disabled)')).focus({ preventScroll: true });
  };
}
