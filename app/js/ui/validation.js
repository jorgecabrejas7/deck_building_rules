import { state } from '../state.js';
import { T } from '../i18n.js';
import { MSG } from './constants.js';
import { $, esc } from './helpers.js';

export function renderValidation() {
  const t = T(), r = state.result, lang = state.lang, el = $('validation');
  // compact echo next to the analyze button: the full panel renders below the
  // fold on the Load tab and is easy to miss before analyzing
  const jump = $('validJump');
  if (!r.validation.length) {
    el.innerHTML = ''; el.style.display = 'none';
    if (jump) jump.style.display = 'none';
    return;
  }
  if (jump) {
    const n = r.validation.length;
    jump.style.display = '';
    jump.textContent = '⚠ ' + n + ' ' + (n === 1 ? t.validJump1 : t.validJumpN) + ' ↓';
    jump.onclick = () => el.scrollIntoView();
  }
  el.style.display = '';
  el.innerHTML = '<div class="valid-box">' +
    '<h2 class="mini-title">' + t.validT + '</h2>' +
    r.validation.slice(0, 12).map(v => '<div class="valid-line">· ' + esc(MSG['valid_' + v.id][lang](v)) + '</div>').join('') +
    (r.validation.length > 12 ? '<div class="valid-more">+' + (r.validation.length - 12) + '…</div>' : '') + '</div>';
}
