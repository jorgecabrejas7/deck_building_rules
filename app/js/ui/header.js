import { state } from '../state.js';
import { T } from '../i18n.js';
import { $ } from './helpers.js';

export function applyTheme() {
  const eff = state.theme ? state.theme === 'dark' : state.sysDark;
  document.body.classList.toggle('dark', state.theme === 'dark');
  document.body.classList.toggle('light', state.theme === 'light');
  $('themeBtn').textContent = eff ? '◑' : '◐';
}

export function renderHeader() {
  const t = T();
  $('appTag').textContent = t.appTag;
  $('copyBtn').textContent = '⧉ ' + (state.copied ? t.copied : t.copy);
  $('howBtn').textContent = '? ' + t.howBtn;
  $('enBtn').style.background = state.lang === 'en' ? 'var(--text)' : 'transparent';
  $('enBtn').style.color = state.lang === 'en' ? 'var(--bg)' : 'var(--muted)';
  $('esBtn').style.background = state.lang === 'es' ? 'var(--text)' : 'transparent';
  $('esBtn').style.color = state.lang === 'es' ? 'var(--bg)' : 'var(--muted)';
}
