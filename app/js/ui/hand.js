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
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
    '<span class="secT">' + t.handT + '</span>' +
    '<div style="display:flex;gap:8px">' +
    '<button id="handDrawBtn" style="background:var(--accent);color:var(--accentFg);border:none;border-radius:7px;padding:7px 16px;font-size:12.5px;font-weight:600">' + (state.hand ? t.handMull : t.handDraw) + '</button></div></div>';
  if (!state.hand) html += '<div style="font-size:12.5px;color:var(--muted)">' + t.handHint + '</div>';
  else html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px">' +
    state.hand.map(n => {
      const c = cardCache[n] || {};
      return c.img_normal
        ? '<img src="' + c.img_normal + '" loading="lazy" style="width:100%;border-radius:8px;background:var(--track)" alt="' + esc(n) + '">'
        : '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;font-size:12px;min-height:80px">' + esc(n) + '</div>';
    }).join('') + '</div>';
  $('handPanel').innerHTML = html;
  $('handDrawBtn').onclick = drawHand;
}
