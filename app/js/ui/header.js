import { state } from '../state.js';
import { T } from '../i18n.js';
import { $ } from './helpers.js';

const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ICON = {
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  help: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 2"/><path d="M12 16.6v.01"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>'),
};

export function applyTheme() {
  // Effective theme always lands as the body.dark class (kept in sync with the
  // pre-paint script in index.html); tokens.css has a single dark block.
  const eff = state.theme ? state.theme === 'dark' : state.sysDark;
  document.body.classList.toggle('dark', eff);
  const t = T(), btn = $('themeBtn');
  btn.innerHTML = eff ? ICON.sun : ICON.moon;
  btn.setAttribute('aria-label', eff ? t.themeToLight : t.themeToDark);
  btn.setAttribute('aria-pressed', String(eff));
}

export function renderHeader() {
  const t = T();
  $('appTag').textContent = t.appTag;
  // labels live in a .btn-txt span that ≤480px CSS hides (icon-only keeps the
  // actions on one row); aria-label carries the full text at every width
  const copyBtn = $('copyBtn'), copyTxt = state.copied ? t.copied : t.copy;
  copyBtn.innerHTML = ICON.copy + '<span class="btn-txt">' + copyTxt + '</span>';
  copyBtn.setAttribute('aria-label', copyTxt);
  copyBtn.hidden = !state.result; // nothing to copy until a deck is analyzed
  const shareBtn = $('shareBtn'), shareTxt = state.linkCopied ? t.copied : t.shareLink;
  shareBtn.innerHTML = ICON.link + '<span class="btn-txt">' + shareTxt + '</span>';
  shareBtn.setAttribute('aria-label', shareTxt);
  shareBtn.hidden = !state.result;
  const howBtn = $('howBtn');
  howBtn.innerHTML = ICON.help + '<span class="btn-txt">' + t.howBtn + '</span>';
  howBtn.setAttribute('aria-label', t.howBtn);
  $('enBtn').classList.toggle('active', state.lang === 'en');
  $('esBtn').classList.toggle('active', state.lang === 'es');
  $('enBtn').setAttribute('aria-pressed', String(state.lang === 'en'));
  $('esBtn').setAttribute('aria-pressed', String(state.lang === 'es'));
}
