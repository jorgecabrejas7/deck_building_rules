import { state, cardCache } from '../state.js';
import { T } from '../i18n.js';
import { $, esc } from './helpers.js';

function drawHand() {
  const r = state.result;
  const pool = [];
  for (const x of r.cardsInfo) {
    const isCmd = r.commanders && r.commanders.includes(x.name);
    for (let i = 0; i < x.qty - (isCmd ? 1 : 0); i++) pool.push(x.name);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  state.hand = pool.slice(0, 7);
  renderHand();
}

export function renderHand() {
  const t = T();
  let html = '<div class="hand-head">' +
    '<h2 class="secT">' + t.handT + '</h2>' +
    '<button id="handDrawBtn" class="btn-accent-sm">' + (state.hand ? t.handMull : t.handDraw) + '</button></div>';
  if (!state.hand) html += '<div class="note-muted">' + t.handHint + '</div>';
  else html += '<div class="hand-grid">' +
    state.hand.map(n => {
      const c = cardCache[n] || {};
      return c.img_normal
        ? '<img src="' + c.img_normal + '" loading="lazy" alt="' + esc(n) + '">'
        : '<div class="hand-ph">' + esc(n) + '</div>';
    }).join('') + '</div>';
  $('handPanel').innerHTML = html;
  $('handDrawBtn').onclick = drawHand;
}
