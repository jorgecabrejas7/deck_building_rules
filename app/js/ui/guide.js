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
    return '<div class="arch-item">' +
      '<div data-arch="' + a.k + '" class="arch-head">' +
      '<span>' + esc(a.name[lang]) + '</span><span>' + (open ? '−' : '＋') + '</span></div>' +
      (open ? '<div class="arch-body">' +
        '<div class="arch-desc">' + a.desc[lang] + '</div>' +
        '<div class="arch-how">' + a.how[lang] + '</div>' +
        '<div class="mono arch-slots">' +
        '<span>' + t.slots + '</span>' +
        a.slots[lang].map(s => '<span class="slot-chip">' + esc(s) + '</span>').join('') +
        '<button data-build="' + a.k + '" class="btn-build">' + t.build + '</button></div></div>' : '') + '</div>';
  }).join('');
  for (const h of $('guideBody').querySelectorAll('[data-arch]'))
    h.onclick = () => { state.openArch = state.openArch === h.dataset.arch ? null : h.dataset.arch; renderGuide(); };
  for (const b of $('guideBody').querySelectorAll('[data-build]'))
    b.onclick = (e) => { e.stopPropagation(); state.arch = b.dataset.build; state.openArch = null; renderAll(); };
}
