// Table rendering: the view JSON in, HTML out. Events are delegated in ../table.js through data- attributes.
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
  die: svg('M3.5 2.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5.5 5.5h.01M10.5 5.5h.01M8 8h.01M5.5 10.5h.01M10.5 10.5h.01'),
  untap: svg('M3 8a5 5 0 1 0 1.5-3.5M3 2.5v2.5h2.5'),
  up: svg('M4 10l4-4 4 4'),
  plus: svg('M8 3.5v9M3.5 8h9'),
  sword: svg('M13.5 2.5 6.5 9.5M13.5 2.5H11M13.5 2.5V5M4 8l4 4M5.5 10.5l-3 3'),
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

export function tile(c, t, big = false) {
  const back = c.face_down || !c.name, info = c.name && cardCache[c.name];
  const cls = ['tc', c.tapped && 'tapped', back && 'back', c.token && 'tok', big && 'big'].filter(Boolean).join(' ');
  const src = big ? info && info.img_normal : info && info.img_small;
  const img = !back && !c.token && src ? `<img src="${esc(src)}" alt="" draggable="false">` : '';
  const cn = counters(c);
  return `<button class="${cls}" data-card="${c.id}" aria-label="${c.name ? esc(c.name) : t.tbHiddenCard}">${img}<span class="tn">${c.name ? esc(c.name) : ''}</span>${cn ? `<b class="cn">${esc(cn)}</b>` : ''}</button>`;
}

const pile = (s, zone, n, t) => `<button class="pile" data-pile="${s}:${zone}" aria-label="${t['tbZ' + zone]}: ${n}"><b>${n}</b><span>${zone === 'command' ? t.tbZcommandShort : t['tbZ' + zone]}</span></button>`;

function seat(view, s, t) {
  const p = view.players[s], z = view.zones[s], me = s === view.you, o = view.players[other(s)];
  const lands = z.battlefield.filter(isLand), rest = z.battlefield.filter((c) => !isLand(c));
  const row = (cards, cls) => cards.length ? `<div class="bfr ${cls}">${cards.map((c) => tile(c, t)).join('')}</div>` : '';
  const cmds = o.commanders.map((name, i) => `<button class="chip cmd" data-cmd="${s}:${i}" title="${t.tbCmdDmg}" aria-label="${t.tbCmdDmg}: ${esc(name)}">${ICON.sword}<span>${esc(name.split(',')[0])}</span> <b>${(p.cmd_damage || {})[name] || 0}</b></button>`).join('');
  const strip = `<div class="strip"><div class="ident"><b class="who">${esc(p.name || '?')}</b><span class="seat-tag">${me ? t.tbYou : t.tbOpp}</span></div>`
    + `<div class="life" role="group" aria-label="${t.tbLife}"><button data-life="${s}:-1" aria-label="${t.tbMinus}">−</button><output aria-label="${t.tbLife}">${p.life}</output><button data-life="${s}:1" aria-label="${t.tbPlus}">+</button></div>`
    + `<div class="zones">${cmds}${pile(s, 'library', z.library.length, t)}${me ? '' : pile(s, 'hand', z.hand.length, t)}${pile(s, 'graveyard', z.graveyard.length, t)}${pile(s, 'exile', z.exile.length, t)}${pile(s, 'command', z.command.length, t)}</div></div>`;
  const bf = `<div class="bf" data-empty="${t.tbZbattlefield}">${row(rest, 'other')}${row(lands, 'lands')}</div>`;
  return `<section class="seat ${me ? 'me' : 'opp'}" aria-label="${esc(p.name || '?')}">${me ? bf + strip : strip + bf}</section>`;
}

export const boardHtml = (view, t) => `<div class="sides">${seat(view, other(view.you), t)}${seat(view, view.you, t)}</div>`;

export function handHtml(view, t, open) {
  const hand = view.zones[view.you].hand;
  return `<div class="hand-head"><button class="hand-bar" data-hand aria-expanded="${open}">${fill(t.tbHandBar, { n: hand.length })}${ICON.up}</button>`
    + `<button class="tbtn add" data-token>${ICON.plus}${t.tbToken}</button><button class="tbtn" data-top="mull">${t.tbMulligan}</button></div>`
    + (open ? `<div class="hand-row" id="handRow">${hand.map((c) => tile(c, t)).join('')}</div>` : '');
}

export function lobbyHtml(view, t, decks, err) {
  const st = (s) => `<li class="${view.picked[s] ? 'ready' : ''}"><span>${s === view.you ? t.tbYou : t.tbOpp}</span><b>${view.picked[s] ? t.tbReady : t.tbWaiting}</b></li>`;
  const pick = decks === null ? ''
    : !decks.length ? `<p>${t.tbDeckNone}</p>`
    : `<select id="deckSel" class="f-in">${decks.map((d) => `<option value="${d.id}">${esc(d.name)}${d.commanders.length ? ' · ' + esc(d.commanders.join(' / ')) : ''}</option>`).join('')}</select><button class="sb on" data-pick>${t.tbPickGo}</button>`;
  return `<div class="lobby"><h2>${t.tbLobbyT}</h2><p>${t.tbLobbyX}</p><ul class="ready-list">${st(1)}${st(2)}</ul>${pick}<p class="f-err">${err ? t[err] : ''}</p></div>`;
}
