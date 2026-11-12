// Bottom sheets: every action a player can take on a card, a pile, a commander or the menu.
// buildSheet returns {title, body, items, art}: buttons carry data-i, the index of their handler in items.
// A sheet opened from another one carries `back`; acting in it returns there instead of closing.
import { ZONES, other, esc, index, tile, art, attachable, ICON, fsShown } from './board.js';
import { logHtml } from './log.js';
import { fill } from '../i18n.js';

const val = (id) => (document.getElementById(id) || {}).value || '';
const num = (id, lo, hi, d) => Math.min(hi, Math.max(lo, parseInt(val(id), 10) || d));
const input = (id, v, extra = '') => `<input class="si" id="${id}" value="${v}" ${extra}>`;

export function buildSheet(sh, view, c) {
  if (!view && sh.k !== 'menu') return null;
  const { t, send } = c, items = [];
  // keep: the sheet stays open after the click (it changes sheet itself, or shows a live value)
  const b = (label, fn, cls = '', keep = false) => { items.push(() => { fn(); if (!keep) c.closeSheet(); }); return `<button class="sb ${cls}" data-i="${items.length - 1}">${label}</button>`; };
  const row = (...x) => `<div class="srow">${x.filter(Boolean).join('')}</div>`;
  const name = (s) => esc(view.players[s].name || '?');
  const grid = (cards) => `<div class="sgrid">${cards.map((x) => tile(x, t)).join('')}</div>`;
  let title = '', body = '', big = '';

  if (sh.k === 'card') {
    const hit = index(view).get(sh.id);
    if (!hit) return null;
    const { card, seat, zone } = hit, ids = [card.id], bf = zone === 'battlefield';
    title = card.name ? esc(card.name) : card.face_down ? t.tbCardDown : t.tbHiddenCard;
    big = art(card, 'img_normal');
    if (sh.move) {
      for (const s of [view.you, other(view.you)]) {
        body += `<h3>${name(s)}</h3>`;
        const mv = (label, to, extra = {}) => !Object.keys(extra).length && s === seat && to === zone ? '' : b(label, () => send({ type: 'move', cards: ids, to: { seat: s, zone: to }, ...extra }));
        body += row(...ZONES.map((z) => z === 'library'
          ? mv(`${t.tbZlibrary} · ${t.tbTop}`, z, { pos: 'top' }) + mv(`${t.tbZlibrary} · ${t.tbBottom}`, z, { pos: 'bottom' })
          : mv(t['tbZ' + z], z) + (z === 'battlefield' || z === 'exile' ? mv(`${t['tbZ' + z]} · ${t.tbFaceDown}`, z, { face_down: true }) : '')));
      }
    } else {
      // a card goes to its owner's zones, except the battlefield, which is yours: you play it
      const go = (label, z, extra = {}, cls = '') => {
        const s = z === 'battlefield' ? view.you : card.owner;
        return !Object.keys(extra).length && s === seat && z === zone ? '' : b(label, () => send({ type: 'move', cards: ids, to: { seat: s, zone: z }, ...extra }), cls); // a card already there has nowhere to go
      };
      body += row(
        bf && b(card.tapped ? t.tbUntap : t.tbTap, () => send({ type: 'tap', cards: ids, tapped: !card.tapped }), 'on'),
        go(zone === 'hand' ? t.tbPlay : t.tbToField, 'battlefield', {}, 'on'),
        (bf || zone === 'exile') && b(t.tbFlip, () => send({ type: 'flip', cards: ids, face_down: !card.face_down })),
        !card.name && b(t.tbLook, () => send({ type: 'look', cards: ids })),
        card.name && !card.shared && b(t.tbReveal, () => send({ type: 'reveal', cards: ids })),
        (bf || (zone === 'hand' && attachable(card))) && b(t.tbAttach, () => c.pickHost(card.id)),
        bf && card.attached && b(t.tbDetach, () => send({ type: 'attach', card: card.id, to: null })),
        bf && b(t.tbGive, () => send({ type: 'move', cards: ids, to: { seat: other(seat), zone: 'battlefield' } })),
        card.token && b(t.tbDelete, () => send({ type: 'delete', card: card.id }), 'danger'));
      body += `<h3>${t.tbSendTo}</h3>` + row(
        go(t.tbZhand, 'hand'),
        go(t.tbZgraveyard, 'graveyard'),
        go(t.tbZexile, 'exile'),
        go(`${t.tbZlibrary} · ${t.tbTop}`, 'library', { pos: 'top' }),
        go(`${t.tbZlibrary} · ${t.tbBottom}`, 'library', { pos: 'bottom' }),
        go(t.tbZcommand, 'command'),
        b(t.tbMove, () => c.setSheet({ ...sh, move: true }), 'quiet', true));
      if (bf) {
        const cn = (n, d) => b(d > 0 ? '+' : '−', () => send({ type: 'counter', card: card.id, name: n, delta: d }), '', true);
        body += `<h3>${t.tbCounters}</h3>`;
        for (const n of new Set(['+1/+1', ...Object.keys(card.counters || {})])) body += row(`<span class="cl">${esc(n)}: <b>${(card.counters || {})[n] || 0}</b></span>`, cn(n, -1), cn(n, 1));
        body += row(input('sn', '', `maxlength="30" placeholder="${t.tbCounterNew}" aria-label="${t.tbCounterName}"`),
          b(t.tbAdd, () => { const n = val('sn').trim().slice(0, 30); if (n) send({ type: 'counter', card: card.id, name: n, delta: 1 }); }, '', true));
      }
    }
  } else if (sh.k === 'pile') {
    // either library: the owner draws, the other player can take, mill, exile or look at the top N
    const s = sh.seat, mine = s === view.you, lib = view.zones[s].library, top = (k) => lib.slice(0, k).map((x) => x.id);
    const n = () => num('sn', 1, 100, 3);
    const mv = (zone, extra = {}, to = s) => () => { const ids = top(n()); if (ids.length) send({ type: 'move', cards: ids, to: { seat: to, zone }, ...extra }); };
    // searching looks at every card first (the server lets 100 ids through per action), then lists the ones now known
    const search = () => {
      const hidden = lib.filter((x) => !x.name).map((x) => x.id);
      for (let i = 0; i < hidden.length; i += 100) send({ type: 'look', cards: hidden.slice(i, i + 100) });
      c.setSheet({ k: 'search', seat: s });
    };
    title = `${t.tbZlibrary} · ${name(s)} (${lib.length})`;
    body += row(mine && b(t.tbDraw1, () => { if (lib.length) send({ type: 'move', cards: top(1), to: { seat: s, zone: 'hand' } }); }, 'on'),
      b(ICON.search + t.tbSearch, search, mine ? '' : 'on', true), b(t.tbShuffle, () => send({ type: 'shuffle', seat: s })));
    body += `<h3><label for="sn">${t.tbN}</label></h3>` + row(input('sn', 3, 'type="number" min="1" max="100" inputmode="numeric"'));
    body += row(mine ? b(t.tbDrawN, mv('hand')) : b(t.tbTakeN, mv('hand', {}, view.you)), b(t.tbMillN, mv('graveyard')),
      b(t.tbExileN, mv('exile')), b(t.tbExileDownN, mv('exile', { face_down: true })),
      b(t.tbLookN, () => { if (lib.length) send({ type: 'look', cards: top(n()) }); c.setSheet({ k: 'list', seat: s, zone: 'library' }); }, '', true),
      b(t.tbRevealN, () => { if (lib.length) send({ type: 'reveal', cards: top(n()) }); }));
    body += row(b(t.tbKnown, () => c.setSheet({ k: 'list', seat: s, zone: 'library' }), 'quiet', true));
  } else if (sh.k === 'search') {
    // sorted by name so the search shows nothing of the library's order; table.js filters the grid as you type.
    // Tap a card to pick it, then send it: hand and battlefield are yours, the graveyard is the owner's,
    // and "top" shuffles the rest first, as a tutor does
    const s = sh.seat, lib = view.zones[s].library, known = lib.filter((x) => x.name).sort((a, b2) => a.name.localeCompare(b2.name));
    const sel = sh.sel && lib.find((x) => x.id === sh.sel);
    const put = (label, to, extra = {}, keep = true) => b(label, () => { send({ type: 'move', cards: [sel.id], to, ...extra }); if (keep) c.setSheet({ ...sh, sel: null }); }, '', keep);
    title = `${t.tbSearch} · ${name(s)} (${lib.length})`;
    body = row(`<input class="si" id="sq" type="search" autocomplete="off" placeholder="${t.tbSearchFilter}" aria-label="${t.tbSearchFilter}">`)
      + (known.length ? `<div class="sgrid">${known.map((x) => tile(x, t).replace('class="tc', `aria-pressed="${x === sel}" class="tc${x === sel ? ' sel' : ''}`)).join('')}</div>` : `<p>${t.tbEmpty}</p>`)
      + `<div class="sfoot">` + (sel ? `<p class="pick">${esc(sel.name)}</p>` + row(put(t.tbZhand, { seat: view.you, zone: 'hand' }), put(t.tbZbattlefield, { seat: view.you, zone: 'battlefield' }),
          put(t.tbZgraveyard, { seat: sel.owner, zone: 'graveyard' }), put(t.tbTopShuffled, { seat: s, zone: 'library' }, { pos: 'top', shuffle: true }, false))
        : `<p class="pick">${t.tbSearchPick}</p>`)
      + row(b(t.tbShuffleClose, () => send({ type: 'shuffle', seat: s }), sel ? 'quiet' : 'on')) + `</div>`;
  } else if (sh.k === 'list') {
    const all = view.zones[sh.seat][sh.zone], cards = sh.zone === 'library' ? all.filter((x) => x.name) : all;
    title = `${t['tbZ' + sh.zone]} · ${name(sh.seat)} (${all.length})`;
    body = cards.length ? grid(sh.zone === 'graveyard' || sh.zone === 'exile' ? [...cards].reverse() : cards) : `<p>${sh.zone === 'library' && all.length ? t.tbNoneKnown : t.tbEmpty}</p>`;
  } else if (sh.k === 'cmd') {
    const cmd = view.players[other(sh.seat)].commanders[sh.i];
    if (cmd === undefined) return null;
    const d = (n) => b(n > 0 ? '+1' : '−1', () => send({ type: 'cmd_damage', seat: sh.seat, commander: cmd, delta: n }), '', true);
    title = `${t.tbCmdDmg} · ${name(sh.seat)}`;
    body = `<p class="cl">${esc(cmd)}: <b>${(view.players[sh.seat].cmd_damage || {})[cmd] || 0}</b></p>` + row(d(-1), d(1));
  } else if (sh.k === 'token') {
    title = t.tbTokenNew;
    body = row(input('sn', '', `maxlength="100" placeholder="${t.tbTokenName}" aria-label="${t.tbTokenName}"`))
      + row(`<label class="cl">${t.tbTokenCount} ${input('sc', 1, 'type="number" min="1" max="20" inputmode="numeric"')}</label>`,
        b(t.tbAdd, () => { const n = val('sn').trim().slice(0, 100); if (n) send({ type: 'token', seat: view.you, name: n, count: num('sc', 1, 20, 1) }); }, 'on'));
  } else if (sh.k === 'pad') {
    // any amount: type it, then subtract, add or set. sh.v is what has been typed (up to 3 digits)
    const s = sh.seat, life = view.players[s].life, v = sh.v || '', n = Number(v);
    const key = (label, next, aria = label) => b(label, () => c.setSheet({ ...sh, v: next }), 'key', true).replace('<button ', `<button aria-label="${aria}" `);
    const go = (label, delta, cls = '') => b(fill(label, { n: v }), () => { if (delta) send({ type: 'life', seat: s, delta }); }, cls)
      .replace('<button ', v ? '<button ' : '<button disabled ');
    title = fill(t.tbLifeOf, { n: name(s) });
    body = `<div class="pad"><p class="pad-v">${v || '0'}</p><p class="pad-now">${fill(t.tbLifeNow, { n: life })}</p>`
      + `<div class="pad-k">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(String(d), (v + d).replace(/^0+/, '').slice(0, 3))).join('')}`
      + key(t.tbPadClear, '') + key('0', (v + '0').replace(/^0+/, '').slice(0, 3)) + key('⌫', v.slice(0, -1), t.tbPadBack) + `</div>`
      + `<div class="srow">${go(t.tbPadSub, -n)}${go(t.tbPadAdd, n)}${go(t.tbPadSet, Math.max(-999, Math.min(999, n - life)), 'quiet')}</div></div>`;
  } else if (sh.k === 'log') {
    title = t.tbLog;
    body = logHtml(view, t);
  } else if (sh.k === 'menu') {
    const live = view && view.status === 'active', r = (sides) => () => send({ type: 'roll', sides });
    const pass = (draw) => () => send({ type: 'pass_turn', ...(draw ? { draw } : {}) });
    title = t.tbMenu;
    body = (live ? row(b(ICON.log + t.tbLog, () => c.setSheet({ k: 'log', back: sh }), '', true),
        fsShown() && b((document.fullscreenElement ? ICON.fullOff + t.tbExitFullscreen : ICON.full + t.tbFullscreen), c.fullscreen),
        b(t.tbMulligan, () => send({ type: 'mulligan' })))
      + `<h3>${fill(t.tbTurnOf, { n: view.turn.number, s: view.turn.seat === view.you ? t.lgYouLow : name(view.turn.seat) })}</h3>`
      + row(b(t.tbPass, pass(true), view.turn.seat === view.you ? 'on' : ''), b(t.tbPassNoDraw, pass(false)))
      + `<h3>${t.tbDice}</h3>` + row(b('d6', r(6)), b('d20', r(20)), b(t.tbCoin, r(2)))
      + row(input('sn', 10, `type="number" min="2" max="100" inputmode="numeric" aria-label="${t.tbCustom}"`), b(t.tbRoll, () => send({ type: 'roll', sides: num('sn', 2, 100, 10) })))
      + `<h3>${t.tbHow}</h3><ul class="how"><li>${t.tbHow1}</li><li>${t.tbHow2}</li><li>${t.tbHow3}</li><li>${t.tbHow4}</li><li>${t.tbHow5}</li><li>${t.tbHow6}</li><li>${t.tbHow7}</li></ul>` + row(b(t.tbHintsAgain, c.hints, 'quiet')) : '')
      + `<h3>${t.tbSize}</h3>` + row(...[['s', t.tbSizeS], ['m', t.tbSizeM], ['l', t.tbSizeL]].map(([k, l]) => b(l, () => c.setSize(k), c.size === k ? 'on' : '', true)))
      + `<h3>${t.tbLang}</h3>` + row(b('Español', () => c.setLang('es'), c.lang === 'es' ? 'on' : '', true), b('English', () => c.setLang('en'), c.lang === 'en' ? 'on' : '', true))
      + `<h3>${t.tbTheme}</h3>` + row(b(t.tbLight, () => c.setTheme('light'), c.dark ? '' : 'on', true), b(t.tbDark, () => c.setTheme('dark'), c.dark ? 'on' : '', true))
      + (sh.ask ? `<p>${t.tbEndAsk}</p>` + row(b(t.tbYes, () => c.endGame(), 'danger'), b(t.tbCancel, () => c.setSheet({ k: 'menu' }), '', true))
        : row(b(t.tbEndGame, () => c.setSheet({ k: 'menu', ask: true }), 'danger', true)));
  }
  return { title, body, items, art: big };
}
