// Table rendering: the view JSON in, HTML out. Events are delegated in ../table.js through data- attributes.
// data-drop="<seat>:<zone>" marks where a dragged card can land.
import { cardCache } from '../state.js';
import { fill } from '../i18n.js';

export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];
export const other = (s) => 3 - s;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// one stroke icon set for the table, 16px grid, drawn in currentColor
const svg = (d) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
export const ICON = {
  menu: svg('M2.5 4.5h11M2.5 8h11M2.5 11.5h11'),
  close: svg('M4 4l8 8M12 4l-8 8'),
  untap: svg('M3 8a5 5 0 1 0 1.5-3.5M3 2.5v2.5h2.5'),
  up: svg('M4 10l4-4 4 4'),
  plus: svg('M8 3.5v9M3.5 8h9'),
  sword: svg('M13.5 2.5 6.5 9.5M13.5 2.5H11M13.5 2.5V5M4 8l4 4M5.5 10.5l-3 3'),
  full: svg('M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10'),
  search: svg('M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.3 10.3l3.2 3.2'),
  library: svg('M4 4.5h7v9H4zM6 2.5h6.5v9'),
  graveyard: svg('M4.5 13.5v-7a3.5 3.5 0 0 1 7 0v7M3 13.5h10M8 6v4M6.5 7.5h3'),
  exile: svg('M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM4.1 4.1l7.8 7.8'),
  command: svg('M2.5 12.5h11M3.2 10.5 2.5 5l3 2.5L8 3.5l2.5 4 3-2.5-.7 5.5z'),
  hand: svg('M3 5.2 7.5 4l1.8 8.3-4.5 1.2zM9.5 3.5H14V12H10.6'),
};

export function index(view) {
  const m = new Map();
  for (const s of [1, 2]) for (const z of ZONES) for (const c of view.zones[s][z] || []) m.set(c.id, { card: c, seat: s, zone: z });
  return m;
}

// names worth an image: face-up named cards that are not tokens
export function visibleNames(view) {
  const out = new Set();
  for (const { card } of index(view).values()) if (card.name && !card.token && !card.face_down) out.add(card.name);
  return [...out];
}

const counters = (c) => Object.entries(c.counters || {}).map(([k, v]) => k + ' ' + v).join(' ');
const isLand = (c) => !c.face_down && c.name && /\bLand\b/.test((cardCache[c.name] || {}).type_line || '');
export const art = (c, big = false) => {
  const info = c.name && !c.face_down && !c.token && cardCache[c.name];
  return info ? (big ? info.img_normal : info.img_small) || '' : '';
};

// a card is its image; the name is written only while there is no image to show
export function tile(c, t, big = false) {
  const back = c.face_down || !c.name, src = art(c, big);
  const cls = ['tc', c.tapped && 'tapped', back && 'back', c.token && 'tok', big && 'big'].filter(Boolean).join(' ');
  const face = src ? `<img src="${esc(src)}" alt="" draggable="false">` : `<span class="tn">${c.name ? esc(c.name) : ''}</span>`;
  const cn = counters(c);
  return `<button class="${cls}" data-card="${c.id}" aria-label="${c.name ? esc(c.name) : t.tbHiddenCard}${c.tapped ? ' · ' + t.tbTapped : ''}">${face}${cn ? `<b class="cn">${esc(cn)}</b>` : ''}</button>`;
}

// a pile drawn as a card slot: the top card when it is public, a back for the library, a dashed outline when empty
function slot(s, zone, t, view) {
  const cards = view.zones[s][zone], n = cards.length;
  const face = zone === 'library' ? null : zone === 'command' ? cards[0] : cards[n - 1];
  const src = face ? art(face) : '';
  return `<button class="slot ${zone}${n ? '' : ' empty'}" data-pile="${s}:${zone}" data-drop="${s}:${zone}" title="${t['tbZ' + zone]}" aria-label="${t['tbZ' + zone]}: ${n}">`
    + `${src ? `<img src="${esc(src)}" alt="" draggable="false">` : ''}<span class="sc">${ICON[zone]}<b>${n}</b></span></button>`;
}

function seat(view, s, t) {
  const p = view.players[s], z = view.zones[s], me = s === view.you, o = view.players[other(s)];
  const lands = z.battlefield.filter(isLand), rest = z.battlefield.filter((c) => !isLand(c));
  const row = (cards, cls) => cards.length ? `<div class="bfr ${cls}">${cards.map((c) => tile(c, t)).join('')}</div>` : '';
  const cmds = o.commanders.map((name, i) => `<button class="chip cmd" data-cmd="${s}:${i}" title="${t.tbCmdDmg}: ${esc(name)}" aria-label="${t.tbCmdDmg}: ${esc(name)}">${ICON.sword}<b>${(p.cmd_damage || {})[name] || 0}</b></button>`).join('');
  const lead = me ? `<button class="chip ico" data-top="untap" title="${t.tbUntapAll}" aria-label="${t.tbUntapAll}">${ICON.untap}</button>`
    : `<button class="chip" data-pile="${s}:hand" data-drop="${s}:hand" title="${t.tbZhand}" aria-label="${t.tbZhand}: ${z.hand.length}">${ICON.hand}<b>${z.hand.length}</b></button>`;
  // the opponent's rail opens the table's own controls: the menu (with the connection dot) and full screen
  const ctl = me ? '' : `<button class="chip ico menu-btn" data-top="menu" title="${t.tbMenu}" aria-label="${t.tbMenu}">${ICON.menu}</button>`
    + (document.fullscreenEnabled ? `<button class="chip ico fs-btn" data-top="full" title="${t.tbFullscreen}" aria-label="${t.tbFullscreen}">${ICON.full}</button>` : '');
  const strip = `<div class="strip">${ctl}<b class="who">${esc(p.name || '?')}</b>${lead}${cmds}`
    + `<div class="life" role="group" aria-label="${t.tbLife}"><button data-life="${s}:-1" aria-label="${t.tbMinus}">−</button><output aria-label="${t.tbLife}">${p.life}</output><button data-life="${s}:1" aria-label="${t.tbPlus}">+</button></div></div>`;
  const order = me ? ['command', 'exile', 'graveyard', 'library'] : ['library', 'graveyard', 'exile', 'command'];
  const area = `<div class="area"><div class="bf" data-drop="${s}:battlefield" data-empty="${me ? t.tbDropHere : t.tbZbattlefield}">${row(rest, 'other')}${row(lands, 'lands')}</div>`
    + `<div class="piles">${order.map((zone) => slot(s, zone, t, view)).join('')}</div></div>`;
  return `<section class="seat ${me ? 'me' : 'opp'}" aria-label="${esc(p.name || '?')}">${me ? area + strip : strip + area}</section>`;
}

export const boardHtml = (view, t) => `<div class="sides">${seat(view, other(view.you), t)}${seat(view, view.you, t)}</div>`;

export function handHtml(view, t, open) {
  const hand = view.zones[view.you].hand;
  return `<div class="hand-head"><button class="hand-bar" data-hand aria-expanded="${open}">${fill(t.tbHandBar, { n: hand.length })}${ICON.up}</button>`
    + `<button class="tbtn add" data-token>${ICON.plus}${t.tbToken}</button></div>`
    + (open ? `<div class="hand-row" id="handRow">${hand.map((c) => tile(c, t)).join('')}</div>` : '');
}

export function lobbyHtml(view, t, decks, err) {
  const st = (s) => `<li class="${view.picked[s] ? 'ready' : ''}"><span>${s === view.you ? t.tbYou : t.tbOpp}</span><b>${view.picked[s] ? t.tbReady : t.tbWaiting}</b></li>`;
  const pick = decks === null ? ''
    : !decks.length ? `<p>${t.tbDeckNone}</p>`
    : `<select id="deckSel" class="f-in">${decks.map((d) => `<option value="${d.id}">${esc(d.name)}${d.commanders.length ? ' · ' + esc(d.commanders.join(' / ')) : ''}</option>`).join('')}</select><button class="sb on" data-pick>${t.tbPickGo}</button>`;
  return `<div class="lobby"><h2>${t.tbLobbyT}</h2><p>${t.tbLobbyX}</p><ul class="ready-list">${st(1)}${st(2)}</ul>${pick}<p class="f-err">${err ? t[err] : ''}</p></div>`;
}
