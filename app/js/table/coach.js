// The first game on a device: an offer of full screen (on iPhone Safari, how to add the page to the Home Screen
// instead), then coach marks one at a time, each pointing at the real element. Both are remembered per viewer.
// Not modal: the table stays usable under them. table.js calls firstRun when a game is active and placeCoach after
// every layout change; the menu replays the hints with startHints.
import { ICON, standalone } from './board.js';
import { fill } from '../i18n.js';

const FS = 'pdc_table_fs', HINTS = 'pdc_table_hints', IGNORED = 6000;
const $ = (id) => document.getElementById(id);
const seen = (k) => { try { return !!localStorage.getItem(k); } catch (err) { return false; } };
const remember = (k) => { try { localStorage.setItem(k, '1'); } catch (err) { /* storage blocked: offered again next visit */ } };
const vis = (q) => [...document.querySelectorAll(q)].find((el) => el.getClientRects().length && el.offsetParent);

// [text key, target, only when its target shows at the start]
const STEPS = [
  ['tbHintTap', () => vis('.seat.me .bf .tc') || vis('.seat.me .bf')],
  ['tbHintHold', () => vis('#hand .hand-row .tc') || vis('.seat.me .bf .tc')],
  ['tbHintBoard', () => vis('.seat.opp .peek-open'), true], // phones only: where both boards show there is no bar
  ['tbHintHand', () => vis('#hand .hand-row') || vis('#hand .hand-bar')],
];

let T = null, started = false, steps = [], at = -1, back = null;

const ios = () => /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const safari = () => /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

// once per page: the offer first, then the hints when it is answered or ignored for a while (or at once when there is none)
export function firstRun(dict, fullscreen) {
  if (started) return;
  started = true; T = dict;
  const offer = seen(FS) ? null : document.fullscreenEnabled ? 'fs' : ios() && safari() && !standalone() ? 'ios' : null;
  if (!offer) { if (!seen(HINTS)) startHints(); return; }
  tipOf(offer, fullscreen, () => { remember(FS); if (!seen(HINTS)) startHints(); });
  // a pill left unanswered steps aside for the hints (startHints hides it); it is offered again next visit
  if (!seen(HINTS)) setTimeout(() => { if (!tip.hidden && at < 0) startHints(); }, IGNORED);
}

// the pill at the top: offer 'fs' asks for full screen, 'ios' explains Add to Home Screen; done runs when it is closed
function tipOf(offer, fullscreen, done) {
  const tip = $('tip'), tx = T();
  tip.innerHTML = `<p>${offer === 'fs' ? tx.tbFsAsk : tx.tbIosAsk}</p>`
    + `<button class="sb ico" data-tip="x" aria-label="${tx.tbClose}" title="${tx.tbClose}">${ICON.close}</button>`
    + (offer === 'fs' ? `<button class="sb on" data-tip="go">${ICON.full}${tx.tbFullscreen}</button>` : '');
  tip.setAttribute('aria-label', tx.tbFullscreen);
  tip.hidden = false;
  tip.onclick = (e) => {
    const b = e.target.closest('[data-tip]');
    if (!b) return;
    if (b.dataset.tip === 'go') fullscreen(); // inside the tap: browsers grant full screen only to a user gesture
    tip.hidden = true;
    done();
  };
}

// a full-screen button where the browser has no full screen: how to add the page to the Home Screen instead
export const explainFs = () => tipOf('ios', null, () => {});

export function startHints() {
  if (!T) return;
  $('tip').hidden = true; // one thing at a time
  steps = STEPS.filter(([, target, need]) => !need || target());
  back = document.activeElement;
  show(0);
}

function show(i) {
  const el = $('coach'), ring = $('coachRing');
  if (i >= steps.length) return end();
  at = i;
  const tx = T(), last = i === steps.length - 1;
  el.innerHTML = `<p class="coach-n" id="coachT">${fill(tx.tbHintN, { n: i + 1, m: steps.length })}</p><p id="coachX">${tx[steps[i][0]]}</p>`
    + `<div class="coach-b"><button class="sb quiet" data-coach="skip">${tx.tbSkip}</button><button class="sb on" data-coach="next">${last ? tx.tbDone : tx.tbNext}</button></div>`;
  el.hidden = false; ring.hidden = false;
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  placeCoach();
  el.focus({ preventScroll: true });
}

function end() {
  remember(HINTS);
  at = -1;
  $('coach').hidden = $('coachRing').hidden = true;
  if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
}

// the ring around the target, the bubble above it when there is room, else below, else over it; always on screen
export function placeCoach() {
  if (at < 0) return;
  const el = $('coach'), ring = $('coachRing'), tgt = steps[at][1](), m = 12;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!tgt) { ring.hidden = true; el.style.left = (innerWidth - w) / 2 + 'px'; el.style.top = (innerHeight - h) / 2 + 'px'; return; }
  const r = tgt.getBoundingClientRect(), pad = 4;
  ring.hidden = false;
  Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
  const top = r.top - pad - m - h >= m ? r.top - pad - m - h : r.bottom + pad + m + h <= innerHeight - m ? r.bottom + pad + m : innerHeight - m - h;
  el.style.left = Math.round(Math.min(Math.max(m, r.left + r.width / 2 - w / 2), innerWidth - m - w)) + 'px';
  el.style.top = Math.round(Math.max(m, top)) + 'px';
}

const coach = $('coach');
coach.addEventListener('click', (e) => {
  const b = e.target.closest('[data-coach]');
  if (b) { if (b.dataset.coach === 'next') show(at + 1); else end(); }
});
coach.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(); } });
