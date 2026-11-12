// Physical drag. The dragged card is lifted into a ghost, a clone of its own tile (the same art, shape and corner radius), that rises
// from where the card was, follows the pointer, tilts with its speed and is pulled towards small drop targets. A drop hands the ghost's
// place to motion.js (it flies the card on from there); a drop on nothing flies the ghost back to its slot.
// Pointer events only record the latest position. One frame loop does every write, and nothing in it measures the layout.
import { tile } from './board.js';
import { clone } from './motion.js';

const still = matchMedia('(prefers-reduced-motion: reduce)');
const LIFT = 1.1, MIN_W = 72, MAX_W = 110, TILT = 12, TILT_PER_SPEED = 16, LEAN = 6, PULL = 40, TAPPED = 12;
const RISE = 30, BACK = 200, BACK_EASE = 'cubic-bezier(.34,1.5,.64,1)'; // RISE: time constant (ms) of the lift; the rise takes about three
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const tf = (x, y, rot, lean, s) => `translate(${x}px,${y}px) perspective(600px) rotate(${rot}deg) rotateX(${lean}deg) scale(${s})`;

// el: the card's element (a battlefield tile, a hand card, a card in a sheet, or a pile's chip: then the ghost is the pile's card);
// ids: how many cards go along; hosts: every battlefield card is a small target too (an aura or equipment); hit(x, y) -> the target
// under the pointer, or null; x, y: the pointer
export function pickUp(el, { card, t, id, n, hosts, hit, x, y }) {
  const anim = !still.matches, own = el.classList.contains('tc');
  const r = el.getBoundingClientRect(), hand = !!el.closest('.hand-row'), tapped = el.classList.contains('tapped');
  const w = own ? el.offsetWidth : clamp(r.width, MIN_W, MAX_W), c0 = [r.left + r.width / 2, r.top + r.height / 2];
  const src = own ? el : new DOMParser().parseFromString(tile(card, t), 'text/html').body.firstChild;
  const g = clone(src, c0, w, id);
  g.removeAttribute('data-fly'); // motion.js sees it as a flying clone only once it is handed over
  g.classList.remove('tapped');
  g.classList.add('ghost');
  if (n > 1) { g.classList.add('many'); if (!g.querySelector('.nx')) g.insertAdjacentHTML('beforeend', `<b class="nx" aria-hidden="true">×${n}</b>`); }
  // where the card is at pickup: its tilt (a tapped tile, a hand card in the fan) and size (a raised hand card) ease out as it lifts
  const rot0 = tapped ? TAPPED : hand && !el.classList.contains('up') ? parseFloat(el.style.getPropertyValue('--r')) || 0 : 0;
  const s0 = own && !tapped ? r.width / w : 1, S = clamp(MIN_W / w, LIFT, 1.6), gh = g.offsetHeight * S;
  const free = (px, py) => [px, py - 0.1 * gh]; // the pointer holds it near its centre
  const off = [c0[0] - free(x, y)[0], c0[1] - free(x, y)[1]];
  document.body.append(g);

  let mags = [], mag = null, held = null, over = null, live = true, raf = 0, last = -1, t0 = -1, px = x, py = y, vx = 0, vy = 0, tilt = 0, lean = 0, m = 0, pose = [0, 0, s0];
  const measure = () => {
    const small = [...document.querySelectorAll('.chip[data-drop],.tz[data-drop]'), ...(hosts ? document.querySelectorAll('.bf [data-card]') : [])].filter((e) => e !== el);
    mags = small.map((e) => { const q = e.getBoundingClientRect(); return { el: e, cx: q.left + q.width / 2, cy: q.top + q.height / 2, w: q.width, reach: Math.min(PULL, Math.max(q.width, q.height) / 2 + 12) }; });
  };
  measure();
  const again = setTimeout(measure, 150); // the quick zones slide in
  addEventListener('scroll', measure, true);
  addEventListener('resize', measure);

  const retarget = () => {
    let best = null, bd = Infinity;
    if (anim) for (const q of mags) { const d = Math.hypot(x - q.cx, y - q.cy); if (d < q.reach + (q === mag ? 12 : 0) && d < bd) { best = q; bd = d; } }
    mag = best;
    if (best) held = best; // the pull fades out towards the last target once it is left
    const now = best ? best.el : hit(x, y);
    if (now === over) return;
    if (over) over.classList.remove('drop-on');
    over = now;
    if (over) over.classList.add('drop-on');
  };
  const frame = (ts) => {
    if (!live) return;
    raf = requestAnimationFrame(frame);
    if (t0 < 0) t0 = last = ts; // the frame clock, not performance.now(): they may differ
    const dt = clamp(ts - last, 1, 50), k = (tau) => 1 - Math.exp(-dt / tau);
    last = ts;
    vx += ((x - px) / dt - vx) * k(50); vy += ((y - py) / dt - vy) * k(50); px = x; py = y;
    retarget();
    const lift = anim ? Math.exp(-(ts - t0) / RISE) : 0; // 1 at pickup, then 0
    m += ((anim && mag ? 1 : 0) - m) * k(60);
    tilt += ((anim ? clamp(vx * TILT_PER_SPEED, -TILT, TILT) : 0) * (1 - m) - tilt) * k(80);
    lean += ((anim ? clamp(-vy * 5, -LEAN, LEAN) : 0) * (1 - m) - lean) * k(80);
    const [fx, fy] = free(x, y);
    let s = anim ? S + (s0 - S) * lift : S, cx = fx + off[0] * lift, cy = fy + off[1] * lift;
    if (held) {
      s += (clamp((held.w * 1.3) / w, 0.45, S) - s) * m; // it shrinks towards the target's size
      cx += (held.cx - cx) * m * 0.9; cy += (held.cy - cy) * m * 0.9;
    }
    pose = [cx - c0[0], cy - c0[1], s];
    g.style.transform = tf(pose[0], pose[1], rot0 * lift + tilt, lean, s);
  };
  raf = requestAnimationFrame(frame);

  const stop = () => {
    live = false; cancelAnimationFrame(raf); clearTimeout(again);
    removeEventListener('scroll', measure, true); removeEventListener('resize', measure);
    if (over) over.classList.remove('drop-on');
  };
  return {
    get over() { return over; },
    move(nx, ny) { x = nx; y = ny; },
    settle(nx, ny) { x = nx; y = ny; retarget(); }, // the target at the very point of release
    // a drop on a target: upright, and a flying clone to motion.js until end()
    drop() { stop(); g.style.transform = tf(pose[0], pose[1], 0, 0, pose[2]); g.dataset.fly = id; },
    end() { g.remove(); },
    // a drop on nothing: back to the slot, then done()
    back(done) {
      stop();
      const q = el.getBoundingClientRect(), fin = () => { g.remove(); done(); };
      if (!anim) return fin();
      const to = tf(q.left + q.width / 2 - c0[0], q.top + q.height / 2 - c0[1], rot0, 0, s0);
      g.animate({ transform: [g.style.transform, to] }, { duration: BACK, easing: BACK_EASE, fill: 'forwards' }).finished.then(fin, fin);
    },
  };
}
