import * as PodEngine from '../engine/index.js';
import { state } from '../state.js';
import { T } from '../i18n.js';
import { ARCH, SAMPLES } from './constants.js';
import { $, esc } from './helpers.js';

export function renderInput() {
  const t = T();
  $('inputTitle').textContent = t.inputTitle;
  $('deckText').placeholder = t.inputPh;
  $('deckText').setAttribute('aria-label', t.inputAria);
  $('tryLabel').textContent = t.tryLabel;
  $('archLabel').textContent = t.archLabel;
  $('analyzeBtn').textContent = state.busy
    ? (state.fi.total ? t.fetchingCards + ' ' + state.fi.done + '/' + state.fi.total : t.analyzing)
    : t.analyze;
  $('analyzeBtn').disabled = state.busy;
  const sel = $('archSel');
  const cur = state.arch;
  sel.innerHTML = '<option value="auto">' + esc(t.auto) + '</option>' +
    ARCH.map(a => '<option value="' + a.k + '">' + esc(a.name[state.lang]) + '</option>').join('');
  sel.value = cur;
  $('samples').innerHTML = ['s1', 's2', 's3'].map(k =>
    '<button data-sample="' + k + '" class="chip-dashed">' + esc(t[k]) + '</button>').join('');
  for (const b of $('samples').querySelectorAll('[data-sample]'))
    b.onclick = () => { $('deckText').value = SAMPLES[b.dataset.sample]; state.error = null; renderInput(); };
  const notice = $('inputNotice');
  if (state.error) { notice.style.display = ''; notice.textContent = t[state.error] || state.error; }
  else if (PodEngine.detectInput($('deckText').value).kind === 'moxfield') { notice.style.display = ''; notice.textContent = t.mox; }
  else notice.style.display = 'none';
}
