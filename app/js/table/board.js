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
  tap: svg('M2.5 7.5h8v6h-8zM6.5 2.5h2a4 4 0 0 1 4 4V9M11 7.5l1.5 1.5L14 7.5'),
  play: svg('M8 13.5v-9M4.5 8 8 4.5 11.5 8M3 2.5h10'),
  attach: svg('M10.5 5 6 9.5a1.4 1.4 0 0 0 2 2L13 6.5a2.8 2.8 0 0 0-4-4L4 7.5a4.2 4.2 0 0 0 6 6l3-3'),
  view: svg('M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'),
  more: svg('M3.5 8h.01M8 8h.01M12.5 8h.01'),
  undo: svg('M5 3 2 6l3 3M2 6h7.5a3.75 3.75 0 0 1 0 7.5H7'),
  log: svg('M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM8 5v3l2 1.5'),
  pass: svg('M2.5 8h10M9 4.5 12.5 8 9 11.5'),
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

// host id -> the auras and equipment on it, across both battlefields (an aura can sit on the other player's creature)
export function attachments(view) {
  const on = new Set(), m = new Map();
  for (const s of [1, 2]) for (const c of view.zones[s].battlefield) on.add(c.id);
  for (const s of [1, 2]) for (const c of view.zones[s].battlefield) if (c.attached && on.has(c.attached)) m.set(c.attached, [...(m.get(c.attached) || []), c]);
  return m;
}
export const attachable = (c) => !!c.name && !c.face_down && /\b(Aura|Equipment|Fortification)\b/.test((cardCache[c.name] || {}).type_line || '');

// a counter as it reads on the card: +2/+2 for two +1/+1 counters, otherwise its name and number
export const counterText = (k, v) => {
  if (k !== '+1/+1' && k !== '-1/-1') return `${k} ${v}`;
  const sg = (k[0] === '+') === (v > 0) ? '+' : '−', n = Math.abs(v);
  return `${sg}${n}/${sg}${n}`;
};
// a permanent's section, from its front face; face-down and not-yet-loaded cards go to "other"
const section = (c) => {
  const tl = !c.face_down && c.name && ((cardCache[c.name] || {}).type_line || '').split(' // ')[0];
  return !tl ? 'other' : /\bCreature\b/.test(tl) ? 'creatures' : /\bLand\b/.test(tl) ? 'lands' : 'other';
};
export const art = (c, big = false) => {
  const info = c.name && !c.face_down && !c.token && cardCache[c.name];
  return info ? (big ? info.img_normal : info.img_small) || '' : '';
};

// a card is its image; the name is written only while there is no image to show.
// group: a stack of identical cards drawn as one. A tap acts on its first card (data-card); a selection takes them all (data-ids)
export function tile(c, t, big = false, group = [c]) {
  const back = c.face_down || !c.name, src = art(c, big), n = group.length;
  const cls = ['tc', c.tapped && 'tapped', back && 'back', c.token && 'tok', big && 'big', n > 1 && 'many'].filter(Boolean).join(' ');
  const face = src ? `<img src="${esc(src)}" alt="" draggable="false">` : `<span class="tn">${c.name ? esc(c.name) : ''}</span>`;
  const cn = Object.entries(c.counters || {}).map(([k, v]) => counterText(k, v));
  return `<button class="${cls}" data-card="${c.id}"${n > 1 ? ` data-n="${n}" data-ids="${group.map((x) => x.id).join(' ')}"` : ''} aria-label="${c.name ? esc(c.name) : t.tbHiddenCard}${c.tapped ? ' · ' + t.tbTapped : ''}${n > 1 ? ' · ' + fill(t.tbCopies, { n }) : ''}${cn.length ? ' · ' + esc(cn.join(', ')) : ''}">`
    + `${face}${cn.length ? `<span class="cns" aria-hidden="true">${cn.map((x) => `<b class="cn">${esc(x)}</b>`).join('')}</span>` : ''}${n > 1 ? `<b class="nx" aria-hidden="true">×${n}</b>` : ''}</button>`;
}

// a pile drawn as a card slot: the top card when it is public, a back for the library, a dashed outline when empty
function slot(s, zone, t, view) {
  const cards = view.zones[s][zone], n = cards.length;
  const face = zone === 'library' ? null : zone === 'command' ? cards[0] : cards[n - 1];
  const src = face ? art(face) : '', top = zone === 'library' || zone === 'command' ? cards[0] : cards[n - 1];
  // data-lift: the card a drag out of this pile takes (the library's top card, the last card into the others)
  return `<button class="slot ${zone}${n ? '' : ' empty'}" data-pile="${s}:${zone}" data-drop="${s}:${zone}"${top ? ` data-lift="${top.id}"` : ''} title="${t['tbZ' + zone]}" aria-label="${t['tbZ' + zone]}: ${n}">`
    + `${src ? `<img src="${esc(src)}" alt="" draggable="false">` : ''}<span class="sc">${ICON[zone]}<b>${n}</b></span></button>`;
}

// a battlefield in sections, each a list of groups: identical plain cards (same name and tapped state, no counters,
// nothing attached either way, face up) share one group; any other card is a group of one
function sections(view, s, att) {
  const on = new Set([...att.values()].flat().map((c) => c.id)), out = { creatures: [], other: [], lands: [] }, seen = new Map();
  for (const c of view.zones[s].battlefield) {
    if (on.has(c.id)) continue; // drawn tucked behind its host
    const plain = c.name && !c.face_down && !c.attached && !att.has(c.id) && !Object.keys(c.counters || {}).length;
    const k = plain && [c.name, c.tapped, c.token].join('|'), g = k && seen.get(k);
    if (g) g.push(c);
    else { const ng = [c]; if (k) seen.set(k, ng); out[section(c)].push(ng); }
  }
  return out;
}

const PILES = ['graveyard', 'exile', 'library']; // the bar's order: the library count is the first to give way

// one player's side. Rendered whole every time: the full board (rail + battlefield + piles) and the collapsed bar.
// Which one shows is client state (table.js applyFocus toggles .seat.on); CSS shows both boards on wide screens.
function seat(view, s, t) {
  const p = view.players[s], z = view.zones[s], me = s === view.you, o = view.players[other(s)], who = esc(p.name || '?');
  const att = attachments(view), secs = sections(view, s, att);
  const stack = ([c, ...more]) => {
    const under = att.get(c.id);
    if (!under) return tile(c, t, false, [c, ...more]);
    return `<div class="stk" style="--n:${under.length}">${under.map((x, i) => tile(x, t).replace('<button ', `<button style="--i:${i}" `)).join('')}${tile(c, t)}</div>`;
  };
  // mine reads creatures, other, lands down towards me; theirs mirrors it, lands at their edge
  const order = me ? ['creatures', 'other', 'lands'] : ['lands', 'other', 'creatures'];
  const rows = order.filter((k) => secs[k].length).map((k) => `<div class="bfr" role="group" aria-label="${t['tbSec' + k]}">${secs[k].map(stack).join('')}</div>`).join('');
  const cmds = o.commanders.map((name, i) => `<button class="chip cmd" data-cmd="${s}:${i}" title="${t.tbCmdDmg}: ${esc(name)}" aria-label="${t.tbCmdDmg}: ${esc(name)}">${ICON.sword}<b>${(p.cmd_damage || {})[name] || 0}</b></button>`).join('');
  const lead = me ? `<button class="chip ico" data-top="untap" title="${t.tbUntapAll}" aria-label="${t.tbUntapAll}">${ICON.untap}</button>`
    : `<button class="chip" data-pile="${s}:hand" data-drop="${s}:hand" title="${t.tbZhand}" aria-label="${t.tbZhand}: ${z.hand.length}">${ICON.hand}<b>${z.hand.length}</b></button>`;
  const menu = `<button class="chip ico menu-btn" data-top="menu" title="${t.tbMenu}" aria-label="${t.tbMenu}">${ICON.menu}</button>`;
  // the opponent's rail opens the table's own controls: the menu (with the connection dot) and full screen
  const ctl = me ? '' : menu + (document.fullscreenEnabled ? `<button class="chip ico fs-btn" data-top="full" title="${t.tbFullscreen}" aria-label="${t.tbFullscreen}">${ICON.full}</button>` : '');
  // the number opens a pad to add, subtract or set any amount
  const life = `<div class="life" role="group" aria-label="${t.tbLife}"><button data-life="${s}:-1" aria-label="${t.tbMinus}">−</button>`
    + `<button class="lv" data-pad="${s}" aria-label="${fill(t.tbLifeEdit, { n: who, l: p.life })}">${p.life}</button><button data-life="${s}:1" aria-label="${t.tbPlus}">+</button></div>`;
  // whose turn: a quiet tag beside the active player's name (and an accent edge on their rail, in table.css)
  const turn = view.turn && view.turn.seat === s ? `<span class="trn">${fill(t.tbTurnN, { n: view.turn.number })}</span>` : '';
  const log = me ? '' : `<button class="chip ico log-btn" data-top="log" title="${t.tbLog}" aria-label="${t.tbLog}">${ICON.log}</button>`;
  const strip = `<div class="strip">${ctl}<span class="who-c"><b class="who">${who}</b>${turn}</span>${lead}${cmds}${log}${life}</div>`;
  const piles = (me ? ['command', 'exile', 'graveyard', 'library'] : ['library', 'graveyard', 'exile', 'command']).map((zone) => slot(s, zone, t, view)).join('');
  // the page dots: the opponent's board is the left page, yours the right
  const dots = `<div class="dots" aria-hidden="true"><i${me ? '' : ' class="on"'}></i><i${me ? ' class="on"' : ''}></i></div>`;
  const area = `<div class="area"><div class="bf" data-drop="${s}:battlefield" data-empty="${me ? t.tbDropHere : t.tbZbattlefield}">${rows}</div><div class="piles">${piles}</div>${dots}</div>`;
  // the collapsed bar: tap it to open this board, drop a card on it to put the card onto this battlefield
  const minis = ['creatures', 'other', 'lands'].flatMap((k) => secs[k]).map(([c, ...more]) => {
    const src = art(c);
    return `<span data-m="${[c, ...more].map((x) => x.id).join(' ')}" class="mini${c.tapped ? ' tapped' : ''}${c.face_down || !c.name ? ' back' : c.token ? ' tok' : ''}">${src ? `<img src="${esc(src)}" alt="" draggable="false">` : ''}${more.length ? `<b>×${more.length + 1}</b>` : ''}</span>`;
  }).join('');
  const counts = [['hand', z.hand.length], ...PILES.map((k) => [k, z[k].length])].map(([k, n]) => `<span class="pk-n" data-pk="${s}:${k}">${ICON[k]}${n}</span>`).join('');
  const label = [fill(t.tbShowBoard, { n: who }), turn && fill(t.tbTurnN, { n: view.turn.number }), `${t.tbZhand}: ${z.hand.length}`, ...PILES.map((k) => `${t['tbZ' + k]}: ${z[k].length}`), fill(t.tbPermanents, { n: z.battlefield.length })].filter(Boolean).join(', ');
  const peek = `<div class="peek" data-drop="${s}:battlefield">${me ? '' : menu}`
    + `<button class="peek-open" data-focus="${s}" aria-expanded="false" aria-label="${label}"><span class="pk-top"><b class="who">${who}</b>${turn}${counts}</span><span class="pk-row">${minis}</span></button>${log}${life}</div>`;
  return `<section class="seat ${me ? 'me' : 'opp'}${turn ? ' turn' : ''}" data-seat="${s}" aria-label="${who}">${me ? area + strip + peek : peek + strip + area}</section>`;
}

export const boardHtml = (view, t) => `<div class="sides">${seat(view, other(view.you), t)}${seat(view, view.you, t)}</div>`;

export function lobbyHtml(view, t, decks, err) {
  const st = (s) => `<li class="${view.picked[s] ? 'ready' : ''}"><span>${s === view.you ? t.tbYou : t.tbOpp}</span><b>${view.picked[s] ? t.tbReady : t.tbWaiting}</b></li>`;
  const pick = decks === null ? ''
    : !decks.length ? `<p>${t.tbDeckNone}</p>`
    : `<select id="deckSel" class="f-in">${decks.map((d) => `<option value="${d.id}">${esc(d.name)}${d.commanders.length ? ' · ' + esc(d.commanders.join(' / ')) : ''}</option>`).join('')}</select><button class="sb on" data-pick>${t.tbPickGo}</button>`;
  return `<div class="lobby"><h2>${t.tbLobbyT}</h2><p>${t.tbLobbyX}</p><ul class="ready-list">${st(1)}${st(2)}</ul>${pick}<p class="f-err">${err ? t[err] : ''}</p></div>`;
}
