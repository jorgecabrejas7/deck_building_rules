// Bottom sheets: every action a player can take on a card, a pile, a commander, the dice or the menu.
// buildSheet returns {title, body, items}: buttons carry data-i, the index of their handler in items.
import { ZONES, other, esc, index, tile } from './board.js';
import { cardCache } from '../state.js';

const val = (id) => (document.getElementById(id) || {}).value || '';
const num = (id, lo, hi, d) => Math.min(hi, Math.max(lo, parseInt(val(id), 10) || d));
const input = (id, v, extra = '') => `<input class="si" id="${id}" value="${v}" ${extra}>`;

export function buildSheet(sh, view, c) {
  if (!view && sh.k !== 'menu') return null;
  const { t, send } = c, items = [];
  // keep: the sheet stays open after the click (it changes sheet itself, or shows a live value)
  const b = (label, fn, cls = '', keep = false) => { items.push(() => { fn(); if (!keep) c.closeSheet(); }); return `<button class="sb ${cls}" data-i="${items.length - 1}">${label}</button>`; };
  const row = (...x) => `<div class="srow">${x.join('')}</div>`;
  const name = (s) => esc(view.players[s].name || '?');
  let title = '', body = '';

  if (sh.k === 'card') {
    const hit = index(view).get(sh.id);
    if (!hit) return null;
    const { card, seat, zone } = hit, ids = [card.id], bf = zone === 'battlefield';
    title = card.name ? esc(card.name) : card.face_down ? t.tbCardDown : t.tbHiddenCard;
    if (sh.move) {
      for (const s of [view.you, other(view.you)]) {
        body += `<h3>${name(s)}</h3>`;
        const mv = (label, to, extra = {}) => b(label, () => send({ type: 'move', cards: ids, to: { seat: s, zone: to }, ...extra }));
        body += row(...ZONES.map((z) => z === 'library'
          ? mv(`${t.tbZlibrary} · ${t.tbTop}`, z, { pos: 'top' }) + mv(`${t.tbZlibrary} · ${t.tbBottom}`, z, { pos: 'bottom' })
          : mv(t['tbZ' + z], z) + (z === 'battlefield' || z === 'exile' ? mv(`${t['tbZ' + z]} · ${t.tbFaceDown}`, z, { face_down: true }) : '')));
      }
    } else {
      const info = card.name && !card.face_down && cardCache[card.name];
      const art = info && info.img_normal ? `<button class="sh-art" data-zoom="${card.id}" aria-label="${esc(card.name)}"><img src="${esc(info.img_normal)}" alt=""></button>` : '';
      body += row(
        bf ? b(card.tapped ? t.tbUntap : t.tbTap, () => send({ type: 'tap', cards: ids, tapped: !card.tapped })) : '',
        bf || zone === 'exile' ? b(t.tbFlip, () => send({ type: 'flip', cards: ids, face_down: !card.face_down })) : '',
        !card.name ? b(t.tbLook, () => send({ type: 'look', cards: ids })) : '',
        card.name && !card.shared ? b(t.tbReveal, () => send({ type: 'reveal', cards: ids })) : '',
        b(t.tbMove, () => c.setSheet({ ...sh, move: true }), '', true),
        bf ? b(t.tbGive, () => send({ type: 'move', cards: ids, to: { seat: other(seat), zone: 'battlefield' } })) : '',
        card.token ? b(t.tbDelete, () => send({ type: 'delete', card: card.id }), 'danger') : '');
      if (bf) {
        const cn = (n, d) => b(d > 0 ? '+' : '−', () => send({ type: 'counter', card: card.id, name: n, delta: d }), '', true);
        body += `<h3>${t.tbCounters}</h3>`;
        for (const n of new Set(['+1/+1', ...Object.keys(card.counters || {})])) body += row(`<span class="cl">${esc(n)}: <b>${(card.counters || {})[n] || 0}</b></span>`, cn(n, -1), cn(n, 1));
        body += row(input('sn', '', `maxlength="30" placeholder="${t.tbCounterNew}" aria-label="${t.tbCounterName}"`),
          b(t.tbAdd, () => { const n = val('sn').trim().slice(0, 30); if (n) send({ type: 'counter', card: card.id, name: n, delta: 1 }); }, '', true));
      }
      if (art) body = `<div class="sh-card">${art}<div class="sh-acts">${body}</div></div>`;
    }
  } else if (sh.k === 'pile') {
    // either library: the owner draws, the other player can take, mill, exile or look at the top N
    const s = sh.seat, mine = s === view.you, lib = view.zones[s].library, top = (k) => lib.slice(0, k).map((x) => x.id);
    const n = () => num('sn', 1, 100, 3);
    const mv = (zone, extra = {}, to = s) => () => { const ids = top(n()); if (ids.length) send({ type: 'move', cards: ids, to: { seat: to, zone }, ...extra }); };
    title = `${t.tbZlibrary} · ${name(s)} (${lib.length})`;
    body += row(mine ? b(t.tbDraw1, () => { if (lib.length) send({ type: 'move', cards: top(1), to: { seat: s, zone: 'hand' } }); }, 'on') : '',
      b(t.tbShuffle, () => send({ type: 'shuffle', seat: s })), b(t.tbKnown, () => c.setSheet({ k: 'list', seat: s, zone: 'library' }), '', true));
    body += `<h3><label for="sn">${t.tbN}</label></h3>` + row(input('sn', 3, 'type="number" min="1" max="100" inputmode="numeric"'));
    body += row(mine ? b(t.tbDrawN, mv('hand')) : b(t.tbTakeN, mv('hand', {}, view.you)), b(t.tbMillN, mv('graveyard')),
      b(t.tbExileN, mv('exile')), b(t.tbExileDownN, mv('exile', { face_down: true })),
      b(t.tbLookN, () => { if (lib.length) send({ type: 'look', cards: top(n()) }); c.setSheet({ k: 'list', seat: s, zone: 'library' }); }, '', true),
      b(t.tbRevealN, () => { if (lib.length) send({ type: 'reveal', cards: top(n()) }); }));
  } else if (sh.k === 'list') {
    const all = view.zones[sh.seat][sh.zone], cards = sh.zone === 'library' ? all.filter((x) => x.name) : all;
    title = `${t['tbZ' + sh.zone]} · ${name(sh.seat)} (${all.length})`;
    body = cards.length ? `<div class="slist">${cards.map((x) => tile(x, t)).join('')}</div>` : `<p>${sh.zone === 'library' && all.length ? t.tbNoneKnown : t.tbEmpty}</p>`;
  } else if (sh.k === 'cmd') {
    const cmd = view.players[other(sh.seat)].commanders[sh.i];
    if (cmd === undefined) return null;
    const d = (n) => b(n > 0 ? '+1' : '−1', () => send({ type: 'cmd_damage', seat: sh.seat, commander: cmd, delta: n }), '', true);
    title = `${t.tbCmdDmg} · ${name(sh.seat)}`;
    body = `<p class="cl">${esc(cmd)}: <b>${(view.players[sh.seat].cmd_damage || {})[cmd] || 0}</b></p>` + row(d(-1), d(1));
  } else if (sh.k === 'dice') {
    const r = (sides) => () => send({ type: 'roll', sides });
    title = t.tbDice;
    body = row(b('d6', r(6)), b('d20', r(20)), b(t.tbCoin, r(2)))
      + row(input('sn', 10, `type="number" min="2" max="100" inputmode="numeric" aria-label="${t.tbCustom}"`), b(t.tbRoll, () => send({ type: 'roll', sides: num('sn', 2, 100, 10) })));
  } else if (sh.k === 'token') {
    title = t.tbTokenNew;
    body = row(input('sn', '', `maxlength="100" placeholder="${t.tbTokenName}" aria-label="${t.tbTokenName}"`))
      + row(`<label class="cl">${t.tbTokenCount} ${input('sc', 1, 'type="number" min="1" max="20" inputmode="numeric"')}</label>`,
        b(t.tbAdd, () => { const n = val('sn').trim().slice(0, 100); if (n) send({ type: 'token', seat: view.you, name: n, count: num('sc', 1, 20, 1) }); }));
  } else if (sh.k === 'menu') {
    title = t.tbMenu;
    body = `<h3>${t.tbLang}</h3>` + row(b('Español', () => c.setLang('es'), c.lang === 'es' ? 'on' : '', true), b('English', () => c.setLang('en'), c.lang === 'en' ? 'on' : '', true))
      + `<h3>${t.tbTheme}</h3>` + row(b(t.tbLight, () => c.setTheme('light'), c.dark ? '' : 'on', true), b(t.tbDark, () => c.setTheme('dark'), c.dark ? 'on' : '', true))
      + (sh.ask ? `<p>${t.tbEndAsk}</p>` + row(b(t.tbYes, () => c.endGame(), 'danger'), b(t.tbCancel, () => c.setSheet({ k: 'menu' }), '', true))
        : row(b(t.tbEndGame, () => c.setSheet({ k: 'menu', ask: true }), 'danger', true)));
  }
  return { title, body, items };
}
