import * as PodEngine from '../engine/index.js';
import { state } from '../state.js';
import { T } from '../i18n.js';
import { $, esc, eur, fill } from './helpers.js';
import { addToDeck, canEdit, listText, resetEdits, searchToAdd, undoEdit } from '../edits.js';

const short = (name) => String(name).split(' // ')[0];
const SHOWN_CHANGES = 6;

// ---- the bar: this list against the one that was analyzed, on every view of the report ----
function figure(label, was, now, show = String) {
  const text = (v) => v === null ? '…' : show(v);
  return '<div class="ed-fig"><dt>' + esc(label) + '</dt><dd>' +
    (text(was) === text(now) ? '' : '<span class="ed-was">' + esc(text(was)) + '</span> → ') + '<b>' + esc(text(now)) + '</b></dd></div>';
}

function changes(t) {
  const { added, removed } = PodEngine.deckDiff(state.edits.undo[0].deck, state.deck);
  const label = (sign) => (c) => sign + ' ' + short(c.name) + (c.qty > 1 ? ' ×' + c.qty : '');
  const all = [...removed.map(label('−')), ...added.map(label('+'))];
  if (!all.length) return t.edSame;
  return all.slice(0, SHOWN_CHANGES).join(' · ') + (all.length > SHOWN_CHANGES ? ' · ' + fill(t.edMore, { v: all.length - SHOWN_CHANGES }) : '');
}

export function renderEditBar() {
  const el = $('editBar'), t = T();
  el.hidden = !state.edits.undo.length;
  if (el.hidden) return;
  const was = state.edits.base, now = PodEngine.editFigures(state.result);
  el.setAttribute('aria-label', t.edBar);
  el.innerHTML = '<dl class="ed-figs">' +
    figure(t.pts, was.points, now.points) +
    figure(t.pfPractical, was.bracket, now.bracket) +
    figure(t.edPower, was.power, now.power) +
    figure(t.sumCombos, was.combos, now.combos) +
    figure(t.price, was.price, now.price, eur) + '</dl>' +
    '<p class="ed-changes">' + esc(changes(t)) + '</p>' +
    '<div class="ed-actions"><button type="button" id="edUndo" class="btn-outline">' + esc(t.edUndo) + '</button>' +
    '<button type="button" id="edReset" class="btn-outline">' + esc(t.edReset) + '</button>' +
    '<button type="button" id="edCopy" class="btn-outline">' + esc(t.edCopy) + '</button></div>';
  $('edUndo').onclick = undoEdit;
  $('edReset').onclick = resetEdits;
  $('edCopy').onclick = (e) => {
    try { navigator.clipboard.writeText(listText()); } catch (err) {}
    e.target.textContent = t.copied;
    setTimeout(() => { e.target.textContent = t.edCopy; }, 1600);
  };
}

// ---- the search that adds a card, in Mazo ----
export const addBoxHtml = (t) => '<div class="dk-add"><input id="dkAdd" type="search" class="cmd-search" placeholder="' + esc(t.dkAdd) + '" aria-label="' + esc(t.dkAdd) + '" value="' + esc(state.deckView.add) + '">' +
  '<ul id="dkHits" class="dk-hits" aria-live="polite"></ul></div>';

function paintHits() {
  const dv = state.deckView, t = T(), box = $('dkHits');
  if (!dv.hits) { box.innerHTML = ''; return; }
  if (!dv.hits.length) { box.innerHTML = '<li class="dk-note">' + esc(t.dkAddNone) + '</li>'; return; }
  box.innerHTML = dv.hits.map((c, i) => '<li><button type="button" class="dk-row" data-add="' + i + '"' + (canEdit() ? '' : ' disabled') + ' aria-label="' + esc(fill(t.dkAddCard, { c: short(c.name) })) + '">' +
    '<img src="' + esc(c.img_art) + '" loading="lazy" alt=""><span class="dk-main"><span class="dk-name">' + esc(short(c.name)) + '</span>' +
    '<span class="dk-sub">' + esc([(c.mana_cost || '').replace(/[{}]/g, ''), c.price != null ? eur(c.price) : ''].filter(Boolean).join(' · ')) + '</span></span></button></li>').join('');
  for (const b of box.querySelectorAll('[data-add]')) b.onclick = () => {
    const card = dv.hits[+b.dataset.add];
    dv.add = ''; dv.hits = null;
    // the list is about to go: keep the keyboard here, without raising a phone's keyboard
    if (matchMedia('(hover:hover)').matches) $('dkAdd').focus({ preventScroll: true });
    addToDeck(card);
  };
}

let typing;
export function bindAddBox() {
  const dv = state.deckView;
  paintHits();
  $('dkAdd').oninput = (e) => {
    const q = dv.add = e.target.value;
    clearTimeout(typing);
    if (q.trim().length < 3) { dv.hits = null; paintHits(); return; }
    typing = setTimeout(async () => {
      // Scryfall answers 404 when nothing matches, so a failure reads as no results
      const hits = await searchToAdd(q.trim()).catch(() => []);
      // only the latest text may publish: a slow answer, or one from before a new analysis, drops out
      if (dv.add === q) { dv.hits = hits; if ($('dkHits')) paintHits(); }
    }, 300);
  };
}
