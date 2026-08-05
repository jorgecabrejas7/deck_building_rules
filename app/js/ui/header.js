import { state } from '../state.js';
import { T } from '../i18n.js';
import { $ } from './helpers.js';

export function applyTheme() {
  // Effective theme always lands as the body.dark class (kept in sync with the
  // pre-paint script in index.html); tokens.css has a single dark block.
  const eff = state.theme ? state.theme === 'dark' : state.sysDark;
  document.body.classList.toggle('dark', eff);
  $('themeBtn').textContent = eff ? '◑' : '◐';
}

export function renderHeader() {
  const t = T();
  $('appTag').textContent = t.appTag;
  $('copyBtn').textContent = '⧉ ' + (state.copied ? t.copied : t.copy);
  $('howBtn').textContent = '? ' + t.howBtn;
  $('enBtn').classList.toggle('active', state.lang === 'en');
  $('esBtn').classList.toggle('active', state.lang === 'es');
}
