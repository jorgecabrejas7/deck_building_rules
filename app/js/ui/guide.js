import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH } from './constants.js';
import { $, esc } from './helpers.js';
import { renderAll } from '../main.js';

export function renderGuide() {
  const t = T(), lang = state.lang;
  $('guideT').textContent = t.guide;
  $('guideBody').innerHTML = ARCH.map(a => {
    const open = state.openArch === a.k;
    return '<div style="border-bottom:1px solid var(--border2)">' +
      '<div data-arch="' + a.k + '" style="display:flex;justify-content:space-between;align-items:center;padding:13px 22px;font-size:14px;cursor:pointer">' +
      '<span style="font-weight:600">' + esc(a.name[lang]) + '</span><span style="color:var(--muted);font-size:16px">' + (open ? '−' : '＋') + '</span></div>' +
      (open ? '<div style="padding:0 22px 16px;display:flex;flex-direction:column;gap:10px;background:var(--panel2)">' +
        '<div style="font-size:13px;line-height:1.6;max-width:720px;padding-top:12px">' + a.desc[lang] + '</div>' +
        '<div style="font-size:12.5px;line-height:1.6;color:var(--muted);max-width:720px">' + a.how[lang] + '</div>' +
        '<div class="mono" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:10.5px">' +
        '<span style="color:var(--muted)">' + t.slots + '</span>' +
        a.slots[lang].map(s => '<span style="border:1px solid var(--border);border-radius:99px;padding:3px 11px">' + esc(s) + '</span>').join('') +
        '<button data-build="' + a.k + '" style="background:var(--accent);color:var(--accentFg);border:none;border-radius:99px;padding:5px 14px;font:600 11px \'IBM Plex Sans\',sans-serif">' + t.build + '</button></div></div>' : '') + '</div>';
  }).join('');
  for (const h of $('guideBody').querySelectorAll('[data-arch]'))
    h.onclick = () => { state.openArch = state.openArch === h.dataset.arch ? null : h.dataset.arch; renderGuide(); };
  for (const b of $('guideBody').querySelectorAll('[data-build]'))
    b.onclick = (e) => { e.stopPropagation(); state.arch = b.dataset.build; state.openArch = null; renderAll(); };
}
