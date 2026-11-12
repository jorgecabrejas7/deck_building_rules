// What just changed, made visible. The opponent's last move glows for a moment on the cards and piles it touched;
// a life total that moves floats its running change. table.js calls changed() with the views before and after a state,
// glowOn() with what to light, applyGlow() after every render (renders rebuild the board) and lifeMoved() per state.
import { index } from './board.js';

const GLOW = 2600, glow = new Map(); // selector -> when it lit
let glowTimer = null;

// selectors for what differs between two views: cards with a new id (created, shuffled, put back by undo), cards that
// changed place (same id, other seat or zone) or state, and the piles a card entered or left
export function changed(prev, next) {
  const a = index(prev), b = index(next), out = new Set();
  const card = (id) => `[data-card="${id}"],[data-ids~="${id}"],[data-m~="${id}"]`, pile = (h) => `[data-pile="${h.seat}:${h.zone}"],[data-pk="${h.seat}:${h.zone}"]`;
  for (const [id, h] of b) {
    const o = a.get(id);
    if (!o) { out.add(card(id)); out.add(pile(h)); continue; }
    if (o.seat !== h.seat || o.zone !== h.zone) { out.add(card(id)); out.add(pile(o)); out.add(pile(h)); }
    const x = o.card, y = h.card;
    if (x.tapped !== y.tapped || x.face_down !== y.face_down || x.name !== y.name || x.attached !== y.attached || JSON.stringify(x.counters) !== JSON.stringify(y.counters)) out.add(card(id));
  }
  for (const [id, h] of a) if (!b.has(id)) out.add(pile(h));
  return [...out];
}

export function glowOn(sels) {
  const now = performance.now();
  for (const s of sels) glow.set(s, now);
  applyGlow();
  clearTimeout(glowTimer);
  glowTimer = setTimeout(applyGlow, GLOW + 50);
}

// a re-rendered element picks its glow up where it was (a negative delay), so a render mid-glow does not restart it
export function applyGlow() {
  const now = performance.now();
  for (const [s, t0] of glow) if (now - t0 > GLOW) glow.delete(s);
  for (const el of document.querySelectorAll('.glow')) el.classList.remove('glow');
  for (const [s, t0] of glow) for (const el of document.querySelectorAll(s)) { el.classList.add('glow'); el.style.setProperty('--gd', Math.round(t0 - now) + 'ms'); }
}

// one bubble per seat above its life number: rapid changes add up into one running delta, which floats away once
// they stop; settle(seat, delta) is told the total then (table.js announces it)
const bub = {}, REST = 1100;
const sign = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
export function lifeMoved(prev, next, settle) {
  if (!prev.players || !next.players) return;
  for (const s of [1, 2]) {
    const d = next.players[s].life - prev.players[s].life;
    if (d) bubble(s, d, settle);
  }
}
function bubble(s, d, settle) {
  const at = [...document.querySelectorAll(`[data-pad="${s}"]`)].find((el) => el.getClientRects().length);
  if (!at) return;
  let b = bub[s];
  if (!b) {
    b = bub[s] = { d: 0, el: document.createElement('div') };
    b.el.className = 'tb-bub';
    b.el.setAttribute('aria-hidden', 'true');
    document.body.append(b.el);
  }
  b.d += d;
  b.el.textContent = sign(b.d);
  b.el.classList.toggle('gain', b.d > 0);
  const r = at.getBoundingClientRect(), below = r.top < innerHeight / 2; // the opponent's number is at the top: the change floats below it, over their cards
  b.el.classList.toggle('below', below);
  b.el.style.left = Math.round(r.left + r.width / 2) + 'px';
  b.el.style.top = Math.round(below ? r.bottom : r.top) + 'px';
  b.el.classList.remove('tick'); void b.el.offsetWidth; b.el.classList.add('tick');
  clearTimeout(b.timer);
  b.timer = setTimeout(() => {
    bub[s] = null;
    b.el.classList.add('go');
    setTimeout(() => b.el.remove(), 700);
    if (b.d) settle(s, sign(b.d));
  }, REST);
}
