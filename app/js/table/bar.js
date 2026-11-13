// The action bar: the few actions a selection needs most, one tap each. It floats beside a single card, or docks above
// the hand in selection mode. buildBar returns {html, items}: buttons carry data-b, the index of their handler in items.
// c.lead is the card the bar is about when one card (or one stack) is selected; null for a selection of several.
import { esc, index, attachable, twoSided, ICON } from './board.js';
import { fill } from '../i18n.js';

export function buildBar(ids, view, c) {
  const idx = index(view), hits = ids.map((id) => idx.get(id)).filter(Boolean);
  if (!hits.length) return null;
  const { t, send } = c, items = [], lead = c.lead && idx.get(c.lead);
  // an action ends the selection first (focus goes back to the card); only the counter steppers below keep it
  const b = (icon, label, fn, title = label) => {
    items.push(() => { c.done(); fn(); });
    return `<button class="ba" data-b="${items.length - 1}" title="${title}">${ICON[icon]}<span>${label}</span></button>`;
  };
  // a card goes to its owner's zones, except the battlefield, which is yours; a card already there stays
  const go = (zone, extra = {}) => () => {
    const by = new Map();
    for (const h of hits) {
      const s = zone === 'battlefield' ? view.you : h.card.owner;
      if (h.seat === s && h.zone === zone) continue;
      by.set(s, [...(by.get(s) || []), h.card.id]);
    }
    for (const [s, list] of by) for (let i = 0; i < list.length; i += 100) send({ type: 'move', cards: list.slice(i, i + 100), to: { seat: s, zone }, ...extra });
  };
  const away = (zone) => hits.some((h) => h.zone !== zone);
  const bf = hits.filter((h) => h.zone === 'battlefield'), tap = (v) => () => send({ type: 'tap', cards: bf.filter((h) => h.card.tapped !== v).map((h) => h.card.id), tapped: v });
  // a card with a back face turns on the battlefield, and from the hand can be played showing its other face
  const turns = bf.length && bf.every((h) => twoSided(h.card)) && lead, other = lead && lead.zone === 'hand' && twoSided(lead.card);
  const acts = [
    bf.some((h) => !h.card.tapped) && b('tap', t.tbTap, tap(true)),
    bf.some((h) => h.card.tapped) && b('untap', t.tbUntap, tap(false)),
    turns && b('transform', t.tbTransform, () => send({ type: 'transform', cards: bf.map((h) => h.card.id), flipped: !lead.card.flipped })),
    away('battlefield') && b('play', hits.every((h) => h.zone === 'hand') ? t.tbPlay : t.tbZbattlefield, go('battlefield')),
    other && b('transform', t.tbPlayOther, go('battlefield', { flipped: true })),
    away('hand') && b('hand', t.tbZhand, go('hand')),
    away('graveyard') && b('graveyard', t.tbZgraveyard, go('graveyard')),
    away('exile') && b('exile', t.tbZexile, go('exile')),
    away('library') && b('library', t.tbZlibrary, go('library', { pos: 'top' }), `${t.tbZlibrary} · ${t.tbTop}`),
    // a token of it on your battlefield: same name and ref, same counters (a flipped two-faced card copies its front name)
    hits.length === 1 && hits[0].zone === 'battlefield' && b('plus', t.tbCopy, () => { const k = hits[0].card; send({ type: 'token', seat: view.you, name: k.name, count: 1, ...(k.token && k.ref ? { ref: k.ref } : {}), ...(Object.keys(k.counters || {}).length ? { counters: k.counters } : {}) }); }),
    lead && attachable(lead.card) && (lead.zone === 'battlefield' || lead.zone === 'hand') && b('attach', t.tbAttachShort, () => c.pickHost(lead.card.id), t.tbAttach),
    // the selection stays: the bar docks and the card is the first of several
    lead && !c.multi && `<button class="ba" data-b="${items.push(c.selectMany) - 1}">${ICON.multi}<span>${t.tbSelectMany}</span></button>`,
    lead && b('view', t.tbView, () => c.preview(lead.card.id), t.tbZoom),
    lead && b('more', t.tbMore, () => c.openSheet(lead.card.id)),
  ].filter(Boolean);
  // one battlefield card: its counters, +1/+1 always offered
  let cn = '';
  if (hits.length === 1 && hits[0].zone === 'battlefield') {
    const card = hits[0].card, has = card.counters || {};
    cn = `<div class="bcs">${[...new Set(['+1/+1', '-1/-1', ...Object.keys(has)])].map((k) => {
      const v = has[k] || 0, step = (d) => { items.push(() => send({ type: 'counter', card: card.id, name: k, delta: d })); return items.length - 1; };
      return `<div class="bc" role="group" aria-label="${esc(k)}"><button class="bs" data-b="${step(-1)}" aria-label="${t.tbMinus} ${esc(k)}"${v > 0 ? '' : ' disabled'}>−</button>`
        + `<span class="bv">${esc(k)} <b>${v}</b></span><button class="bs" data-b="${step(1)}" aria-label="${t.tbPlus} ${esc(k)}">+</button></div>`;
    }).join('')}<button class="bs bo" data-b="${items.push(() => { c.done(); c.openSheet(card.id); }) - 1}" title="${t.tbCounterNew}">${t.tbCounterOther}</button></div>`;
  }
  const head = c.multi ? `<div class="bh"><b>${ids.length === 1 ? t.tbSel1 : fill(t.tbSelN, { n: ids.length })}</b><button class="sb" data-b="${items.push(c.done) - 1}">${t.tbCancel}</button></div>` : '';
  return { html: `${head}<div class="bas" style="--cols:${acts.length}">${acts.join('')}</div>${cn}`, items };
}
