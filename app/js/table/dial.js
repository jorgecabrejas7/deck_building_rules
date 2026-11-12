// The floating controls, over the felt: Pass turn (or whose turn it is) and the action button with its bubbles.
// Returns HTML only; table.js delegates the events through data- attributes (data-dial, data-top, data-open, data-token).
import { ICON, esc, fsShown, fsButton, others, topSeat } from './board.js';
import { fill } from '../i18n.js';

const bub = (k, icon, label, attrs = '', n = null) => `<button class="bub" data-k="${k}" ${attrs}>${icon}<span>${label}</span>${n === null ? '' : `<b class="bn" aria-hidden="true">${n}</b>`}</button>`;

// one bubble per other player (with three or more players): name and life, a tap puts them on top
function players(view, t) {
  const os = others(view), top = topSeat(view);
  if (os.length < 2) return '';
  return `<div class="pbubs" role="group" aria-label="${t.tbPlayers}"><span class="bgl">${t.tbPlayers}</span><div>${os.map((s) => {
    const p = view.players[s], n = esc(p.name || '?');
    return `<button class="bub pl${s === top ? ' on' : ''}${p.out ? ' out' : ''}" data-k="p${s}" data-show="${s}" aria-pressed="${s === top}" aria-label="${fill(t.tbShowP, { n, l: p.life })}${p.out ? ', ' + t.tbOut : ''}"><b class="pn">${n}</b><b class="pv">${p.life}</b></button>`;
  }).join('')}</div></div>`;
}

// armed: ms since the pass button was armed (0 when not); the bar resumes where it was, a render does not restart it
export function dialHtml(view, t, { open, armed }) {
  const me = view.you, z = view.zones[me], pile = (zone) => bub(zone, ICON[zone], t['tbZ' + zone], `data-open="${me}:${zone}"`, z[zone].length);
  const pass = view.turn.seat === me
    ? `<button class="tbtn pass${armed ? ' armed' : ''}" data-k="pass" data-top="pass" aria-label="${armed ? t.tbCancel : t.tbPass}"${armed ? ` style="--wait:-${Math.round(armed)}ms"` : ''}><span>${armed ? t.tbCancel : t.tbPass}</span>${armed ? '' : ICON.pass}</button>`
    : `<span class="turn-tag">${fill(t.tbTurnN, { n: `<b>${view.turn.number}</b>` })}<span class="tt-n"> · ${esc(view.players[view.turn.seat].name || '?')}</span></span>`;
  // the connection dot (.menu-btn) shows on the button itself, so a lost connection is visible while the bubbles are closed
  const btn = `<button class="dial-btn menu-btn" data-k="dial" data-dial aria-expanded="${open}" aria-controls="bubbles" aria-label="${t.tbActions}">${open ? ICON.close : ICON.more}</button>`;
  const bubs = open ? `<div class="bubs" id="bubbles" role="group" aria-label="${t.tbActions}">`
    + bub('draw', ICON.library, t.tbDraw1, `data-top="draw"${z.library.length ? '' : ' disabled'}`, z.library.length)
    + bub('untap', ICON.untap, t.tbUntapAll, 'data-top="untap"')
    + bub('undo', ICON.undo, t.tbUndo, `data-top="undo"${view.can_undo ? '' : ' disabled'}`)
    + bub('token', ICON.plus, t.tbToken, 'data-token')
    + pile('graveyard') + pile('exile') + pile('library')
    + bub('log', ICON.log, t.tbLog, 'data-top="log"')
    + (fsShown() ? fsButton(t, 'bub') : '')
    + bub('menu', ICON.menu, t.tbMenu, 'data-top="menu"') + players(view, t) + '</div>' : '';
  return pass + (open ? '<div class="scrim" data-dial></div>' : '') + btn + bubs;
}

// a quick staggered pop from the button's corner, 146 ms in all; none under reduced motion
export function popIn(el) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.querySelectorAll('.bub').forEach((b, i) => b.animate([{ opacity: 0, transform: 'translate(16px,24px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 110, delay: i * 4, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
}
