// Card motion. Board and hand cards keep one DOM node per id across renders (patch), and each card glides from where
// it was to where it is (snapshot before the DOM changes, play after): FLIP on the Web Animations API.
// translate/rotate/scale are animated as their own properties so a tile's CSS transform (tap, hand fan) composes untouched.
import { index } from './board.js';

const SEL = '.bf [data-card], .hand-row [data-card]';
const MOVE = 240, TAP = 180, POP = 160;
const OVERSHOOT = 'cubic-bezier(.3,1.3,.5,1)', EASE = 'ease-out';
const idsOf = (el) => (el.dataset.ids ? el.dataset.ids.split(' ') : [el.dataset.card]);
const mid = (r) => [r.left + r.width / 2, r.top + r.height / 2];
const same = (a, b) => a.seat === b.seat && a.zone === b.zone;

// ---- patch: keyed reconciliation of the string templates ----
const spare = new Set(); // nodes patched out of one container that another may still claim, until the next snapshot
export function patch(container, html) {
  const live = new Map();
  // any drawn card, in the board or the hand, or one a patch earlier in this render just dropped: a card changing zone keeps its node
  const nodes = [...document.querySelectorAll(SEL), ...spare], mine = nodes.filter((el) => container.contains(el));
  for (const el of nodes) live.set(el.dataset.card, el);
  for (const el of nodes) for (const id of idsOf(el)) if (!live.has(id)) live.set(id, el); // a stack answers to every id it holds
  const scroll = new Map([...container.querySelectorAll('.bf')].map((bf) => [bf.dataset.drop, bf.scrollTop]));
  const focused = document.activeElement, tpl = document.createElement('template'), used = new Set();
  tpl.innerHTML = html;
  for (const fresh of tpl.content.querySelectorAll(SEL)) {
    const el = idsOf(fresh).map((id) => live.get(id)).find((x) => x && !used.has(x));
    if (!el) { fresh.__html = fresh.outerHTML; continue; }
    used.add(el);
    if (el.__html !== fresh.outerHTML) sync(el, fresh);
    el.__html = fresh.outerHTML;
    fresh.replaceWith(el);
  }
  container.replaceChildren(tpl.content);
  for (const el of used) spare.delete(el);
  for (const el of mine) if (!used.has(el)) spare.add(el);
  for (const bf of container.querySelectorAll('.bf')) bf.scrollTop = scroll.get(bf.dataset.drop) || 0;
  if (used.has(focused)) focused.focus({ preventScroll: true });
}

function sync(el, fresh) {
  const lifted = el.classList.contains('lifted'); // a held card stays held through a render
  for (const a of [...el.attributes]) if (!fresh.hasAttribute(a.name)) el.removeAttribute(a.name);
  for (const a of fresh.attributes) el.setAttribute(a.name, a.value);
  if (lifted) el.classList.add('lifted');
  const old = el.querySelector('img'), img = fresh.querySelector('img');
  if (old && img && old.getAttribute('src') === img.getAttribute('src')) img.replaceWith(old); // no flash
  el.replaceChildren(...fresh.childNodes);
}

// ---- snapshot: where every drawn card is, read once before the DOM changes ----
const running = new Set(); // {anim, end} of everything started here

export function snapshot() {
  const cards = new Map(), anchors = new Map();
  spare.clear();
  for (const el of document.querySelectorAll('#board .bf [data-card], #hand .hand-row [data-card]')) {
    const id0 = el.dataset.card, fly = document.querySelector(`[data-fly="${id0}"]`), r = (fly || el).getBoundingClientRect();
    if (!r.width) continue; // on a collapsed board: not drawn
    const tapped = el.classList.contains('tapped');
    const e = { c: mid(r), w: fly ? (tapped ? r.height : r.width) : el.offsetWidth, tapped, el };
    for (const id of idsOf(el)) cards.set(id, e);
  }
  for (const el of document.querySelectorAll('[data-pk], [data-pile]')) { // the piles win over the bar's counters
    const r = el.getBoundingClientRect(), k = el.dataset.pile || el.dataset.pk;
    if (r.width && (el.dataset.pile || !anchors.has(k))) anchors.set(k, r);
  }
  // a glide whose end has not changed picks up where it was after the patch (play): a state arriving mid-flight must not cut it short
  const resume = new Map();
  for (const r of [...running]) { if (r.meta) resume.set(r.meta.id, { ...r.meta, at: r.anim.currentTime }); r.anim.cancel(); r.end(); }
  return { cards, anchors, resume };
}

// ---- play: start the glides once the DOM is patched and laid out ----
export function play(before, prev, next) {
  if (!before.cards.size || !prev || !next || !prev.zones || !next.zones || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = index(prev), b = index(next), now = new Map();
  for (const el of document.querySelectorAll('#board .bf [data-card], #hand .hand-row [data-card]')) { // one read pass
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const e = { el, c: mid(r), w: el.offsetWidth, tapped: el.classList.contains('tapped'), box: el.closest('.bf, .hand-row').getBoundingClientRect() };
    for (const id of idsOf(el)) now.set(id, e);
  }
  const jobs = [], kept = new Set();
  for (const [id, s] of before.resume) {
    const n = now.get(id), here = b.get(id);
    const ok = s.to ? n && Math.abs(n.c[0] - s.to.c[0]) < 1 && Math.abs(n.c[1] - s.to.c[1]) < 1 && Math.abs(n.w - s.to.w) < 1 && n.tapped === s.to.tapped
      : !n && here && s.pile === `${here.seat}:${here.zone}`;
    if (ok) { kept.add(id); jobs.push(() => s.redo(s.at)); }
  }
  for (const [id, n] of now) {
    if (kept.has(id)) continue;
    const o = a.get(id), here = b.get(id), was = before.cards.get(id), real = n.el.dataset.card === id;
    if (!here) continue;
    if (!o) { if (real) jobs.push(() => pop(n.el)); continue; }
    if (!was) { // was not drawn: it comes from its old pile, or fades in
      if (same(o, here)) continue;
      const from = before.anchors.get(`${o.seat}:${o.zone}`);
      jobs.push(() => from ? fly(id, n, mid(from), from.width, false, MOVE, OVERSHOOT, real) : fade(n, real));
      continue;
    }
    const [dx, dy] = [was.c[0] - n.c[0], was.c[1] - n.c[1]], tapChange = was.tapped !== n.tapped, away = !same(o, here);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(was.w - n.w) < 1 && !tapChange) continue;
    const out = was.c[0] < n.box.left || was.c[0] > n.box.right || was.c[1] < n.box.top || was.c[1] > n.box.bottom;
    const [ms, ease] = away ? [MOVE, OVERSHOOT] : tapChange ? [TAP, OVERSHOOT] : [MOVE, EASE];
    jobs.push(() => (away || out || !real) ? fly(id, n, was.c, was.w, was.tapped, ms, ease, real) : glide(id, was, n, ms, ease));
  }
  for (const [id, was] of before.cards) { // drawn before, in another place now that is not drawn
    const o = a.get(id), here = b.get(id);
    if (kept.has(id) || now.has(id) || !o || !here || same(o, here)) continue;
    const pile = `${here.seat}:${here.zone}`;
    jobs.push(() => leave(id, was, before.anchors.get(pile), pile));
  }
  for (const j of jobs) j();
}

// meta: what snapshot needs to resume it: the card id, where it ends (to, or the pile it leaves for) and redo(at)
function track(anim, end, meta, at) {
  if (at) anim.currentTime = at;
  const r = { anim, meta, end: () => { if (r.done) return; r.done = true; running.delete(r); end(); } };
  running.add(r);
  anim.finished.then(r.end, r.end);
}
const keyframes = (dx, dy, s, rot) => [{ translate: `${dx}px ${dy}px`, rotate: `${rot}deg`, scale: s }, { translate: '0 0', rotate: '0deg', scale: 1 }];
// a tap is a quarter turn: the tile's own CSS rotation jumps, this animation runs from the old angle
const turn = (was, n) => (was === n ? 0 : n ? -90 : 90);

function glide(id, was, n, ms, easing, at) {
  const anim = n.el.animate(keyframes(was.c[0] - n.c[0], was.c[1] - n.c[1], was.w / n.w, turn(was.tapped, n.tapped)), { duration: ms, easing });
  track(anim, () => {}, { id, to: n, redo: (t) => glide(id, was, n, ms, easing, t) }, at);
}

// a clone flies where the real card cannot go (clipped by its box, or coming from a pile); the real one waits hidden
function fly(id, n, from, fromW, fromTapped, ms, easing, hide, at) {
  const el = n.el, c = clone(el, n.c, n.w, id);
  if (hide) el.style.visibility = 'hidden';
  const anim = c.animate(keyframes(from[0] - n.c[0], from[1] - n.c[1], fromW / n.w, turn(fromTapped, n.tapped)), { duration: ms, easing });
  track(anim, () => { c.remove(); if (hide) el.style.visibility = ''; }, hide && { id, to: n, redo: (t) => fly(id, n, from, fromW, fromTapped, ms, easing, hide, t) }, at);
}

function leave(id, was, to, pile, at) {
  const c = clone(was.el, was.c, was.w, id);
  const end = to ? { translate: `${to.left + to.width / 2 - was.c[0]}px ${to.top + to.height / 2 - was.c[1]}px`, scale: to.width / was.w, opacity: 0 } : { opacity: 0 };
  const anim = c.animate([{ translate: '0 0', scale: 1, opacity: 1 }, { offset: 0.66, opacity: 1 }, end], { duration: MOVE, easing: EASE });
  track(anim, () => c.remove(), { id, pile, redo: (t) => leave(id, was, to, pile, t) }, at);
}

function pop(el) { track(el.animate([{ scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: POP, easing: EASE }), () => {}); }
function fade(n, real) {
  if (real) track(n.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: POP }), () => {});
}

// a fixed copy of a tile centred on c, at its un-rotated width w (a tapped tile's CSS rotates it)
function clone(el, c, w, id) {
  const f = el.cloneNode(true);
  f.classList.remove('lifted', 'up', 'sel', 'glow', 'drop-on');
  f.classList.add('fly');
  f.dataset.fly = id;
  f.removeAttribute('data-card'); f.removeAttribute('data-ids');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  const h = w * 1.4;
  f.style.cssText = `--cw:${w}px;left:${c[0] - w / 2}px;top:${c[1] - h / 2}px`;
  document.body.append(f);
  return f;
}
