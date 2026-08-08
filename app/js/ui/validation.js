import { state } from '../state.js';
import { T } from '../i18n.js';
import { MSG } from './constants.js';
import { $, esc } from './helpers.js';

export function renderValidation() {
  const t = T(), r = state.result, lang = state.lang, el = $('validation');
  if (!r.validation.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<div class="valid-box">' +
    '<h2 class="mini-title">' + t.validT + '</h2>' +
    r.validation.slice(0, 12).map(v => '<div class="valid-line">· ' + esc(MSG['valid_' + v.id][lang](v)) + '</div>').join('') +
    (r.validation.length > 12 ? '<div class="valid-more">+' + (r.validation.length - 12) + '…</div>' : '') + '</div>';
}
