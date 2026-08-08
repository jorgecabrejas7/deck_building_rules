import { state } from '../state.js';
import { T } from '../i18n.js';
import { $ } from './helpers.js';

export function applyTheme() {
  // Effective theme always lands as the body.dark class (kept in sync with the
  // pre-paint script in index.html); tokens.css has a single dark block.
  const eff = state.theme ? state.theme === 'dark' : state.sysDark;
  document.body.classList.toggle('dark', eff);
  const t = T(), btn = $('themeBtn');
  btn.textContent = eff ? '◑' : '◐';
  btn.setAttribute('aria-label', eff ? t.themeToLight : t.themeToDark);
  btn.setAttribute('aria-pressed', String(eff));
}

export function renderHeader() {
  const t = T();
  $('appTag').textContent = t.appTag;
  // labels live in a .btn-txt span that ≤480px CSS hides (icon-only keeps the
  // actions on one row); aria-label carries the full text at every width
  const copyBtn = $('copyBtn'), copyTxt = state.copied ? t.copied : t.copy;
  copyBtn.innerHTML = '⧉<span class="btn-txt"> ' + copyTxt + '</span>';
  copyBtn.setAttribute('aria-label', copyTxt);
  copyBtn.disabled = !state.result;
  copyBtn.title = state.result ? '' : t.copyHint;
  const howBtn = $('howBtn');
  howBtn.innerHTML = '?<span class="btn-txt"> ' + t.howBtn + '</span>';
  howBtn.setAttribute('aria-label', t.howBtn);
  $('enBtn').classList.toggle('active', state.lang === 'en');
  $('esBtn').classList.toggle('active', state.lang === 'es');
  $('enBtn').setAttribute('aria-pressed', String(state.lang === 'en'));
  $('esBtn').setAttribute('aria-pressed', String(state.lang === 'es'));
}
