// Table rendering: the view JSON in, HTML out. Events are delegated in ../table.js through data- attributes.
import { cardCache } from '../state.js';
import { fill } from '../i18n.js';

export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];
export const other = (s) => 3 - s;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

const pile = (s, zone, n, t) => `<button class="pile" data-pile="${s}:${zone}"><span>${t['tbZ' + zone]}</span><b>${n}</b></button>`;

function seat(view, s, t) {
  const p = view.players[s], z = view.zones[s], me = s === view.you, o = view.players[other(s)];
  const lands = z.battlefield.filter(isLand), rest = z.battlefield.filter((c) => !isLand(c));
  const row = (cards, cls) => cards.length ? `<div class="bfr ${cls}">${cards.map((c) => tile(c, t)).join('')}</div>` : '';
  const cmds = o.commanders.map((name, i) => `<button class="chip" data-cmd="${s}:${i}" title="${t.tbCmdDmg}">${esc(name.split(',')[0])} <b>${(p.cmd_damage || {})[name] || 0}</b></button>`).join('');
  const strip = `<div class="strip"><b class="who">${esc(p.name || '?')}</b>`
    + `<div class="life"><button data-life="${s}:-1" aria-label="${t.tbMinus}">−</button><output aria-label="${t.tbLife}">${p.life}</output><button data-life="${s}:1" aria-label="${t.tbPlus}">+</button></div>`
    + `<div class="piles">${pile(s, 'library', z.library.length, t)}${pile(s, 'graveyard', z.graveyard.length, t)}${pile(s, 'exile', z.exile.length, t)}${pile(s, 'command', z.command.length, t)}${me ? '' : pile(s, 'hand', z.hand.length, t)}</div>`
    + (cmds ? `<div class="cmds">${cmds}</div>` : '')
    + (me ? `<button class="chip" data-token>+ ${t.tbToken}</button>` : '') + '</div>';
  const bf = `<div class="bf">${row(rest, 'other')}${row(lands, 'lands')}</div>`;
  return `<section class="seat ${me ? 'me' : 'opp'}">${me ? bf + strip : strip + bf}</section>`;
}

export const boardHtml = (view, t) => `<div class="sides">${seat(view, other(view.you), t)}${seat(view, view.you, t)}</div>`;

export function handHtml(view, t, open) {
  const hand = view.zones[view.you].hand;
  return `<button class="hand-bar" data-hand aria-expanded="${open}">${fill(t.tbHandBar, { n: hand.length })}</button>`
    + (open ? `<div class="hand-row" id="handRow">${hand.map((c) => tile(c, t)).join('')}</div>` : '');
}

export function lobbyHtml(view, t, decks, err) {
  const st = (s) => `<li>${s === view.you ? t.tbYou : t.tbOpp}: ${view.picked[s] ? t.tbReady : t.tbWaiting}</li>`;
  const pick = decks === null ? ''
    : !decks.length ? `<p>${t.tbDeckNone}</p>`
    : `<select id="deckSel" class="f-in">${decks.map((d) => `<option value="${d.id}">${esc(d.name)}${d.commanders.length ? ' · ' + esc(d.commanders.join(' / ')) : ''}</option>`).join('')}</select><button class="sb" data-pick>${t.tbPickGo}</button>`;
  return `<div class="lobby"><h2>${t.tbLobbyT}</h2><p>${t.tbLobbyX}</p><ul>${st(1)}${st(2)}</ul>${pick}<p class="f-err">${err ? t[err] : ''}</p></div>`;
}
