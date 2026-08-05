import { state } from '../state.js';
import { T } from '../i18n.js';
import { MSG } from './constants.js';
import { $, esc } from './helpers.js';

export function renderValidation() {
  const t = T(), r = state.result, lang = state.lang, el = $('validation');
  if (!r.validation.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<div style="background:var(--panel);border:1px dashed var(--warnBd);border-radius:12px;padding:14px 18px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--muted)">' + t.validT + '</span>' +
    r.validation.slice(0, 12).map(v => '<div style="font-size:12.5px;line-height:1.5;color:var(--muted)">· ' + esc(MSG['valid_' + v.id][lang](v)) + '</div>').join('') +
    (r.validation.length > 12 ? '<div style="font-size:12px;color:var(--faint)">+' + (r.validation.length - 12) + '…</div>' : '') + '</div>';
}
