import { state } from '../state.js';
import { T } from '../i18n.js';
import { api } from '../api.js';
import { $ } from './helpers.js';

const API = '../api/', AUTH = API + '_allauth/browser/v1/';
let me = null;       // GET /me's user, null while unknown or signed out
let pending = 0;     // account requests waiting, admins only

const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ICON = {
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  save: svg('<path d="M6 4h9l3 3v13H6z"/><path d="M9 4v5h6V4M9 20v-6h6v6"/>'),
  help: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 2"/><path d="M12 16.6v.01"/>'),
  user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  shield: svg('<path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 8.9 4-1.3 7-4.5 7-8.9V6l-7-2.5Z"/><path d="m9.2 12 2 2 3.6-3.8"/>'),
  out: svg('<path d="M9.5 20H6.5A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4h3"/><path d="m15.5 16 4-4-4-4M19.5 12H9.5"/>'),
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

// The account button opens a small menu: the profile, the account requests for admins (with how many wait), sign out.
const item = (href, icon, label, extra = '') => '<a class="menu-item" role="menuitem" href="' + href + '">' + icon + '<span>' + label + '</span>' + extra + '</a>';
function renderAccountMenu() {
  const t = T(), m = $('accountMenu');
  if (!me) { m.innerHTML = item('account.html', ICON.user, t.signIn); return; }
  m.innerHTML = '<div class="menu-who">' + (me.display_name || me.username).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</div>'
    + item('account.html?view=profile', ICON.user, t.profileT)
    + (me.is_admin ? item('account.html?view=requests', ICON.shield, t.reqT, pending ? '<span class="menu-badge">' + pending + '</span>' : '') : '')
    + '<button class="menu-item" role="menuitem" type="button" id="signOutBtn">' + ICON.out + '<span>' + t.signOut + '</span></button>';
  $('signOutBtn').onclick = async () => {
    await api(AUTH + 'auth/session', 'DELETE');
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    location.assign('account.html');
  };
}

function toggleAccountMenu(open) {
  const m = $('accountMenu'), on = open === undefined ? m.hidden : open;
  m.hidden = !on;
  $('accountBtn').setAttribute('aria-expanded', String(on));
}

// Wired once at boot. Asks who is signed in without blocking anything; admins also get the count of requests.
export function initAccountMenu() {
  $('accountBtn').onclick = (e) => { e.stopPropagation(); toggleAccountMenu(); };
  document.addEventListener('click', (e) => { if (!e.target.closest('.acct-menu')) toggleAccountMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleAccountMenu(false); });
  api(API + 'me').then(async (r) => {
    me = r.status === 200 && r.data.state === 'active' ? r.data.user : null;
    if (me && me.is_admin) { const q = await api(API + 'requests'); if (q.status === 200) pending = q.data.requests.length; }
    renderHeader();
  });
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
  const saveBtn = $('saveBtn'), saveTxt = state.saveSt ? t[state.saveSt] : state.openDeck ? t.sdSaveVer : t.sdSave;
  saveBtn.innerHTML = ICON.save + '<span class="btn-txt">' + saveTxt + '</span>';
  saveBtn.setAttribute('aria-label', saveTxt);
  saveBtn.hidden = !state.result;
  const howBtn = $('howBtn');
  howBtn.innerHTML = ICON.help + '<span class="btn-txt">' + t.howBtn + '</span>';
  howBtn.setAttribute('aria-label', t.howBtn);
  $('accountBtn').innerHTML = ICON.user + (pending ? '<span class="menu-dot" aria-hidden="true"></span>' : '');
  $('accountBtn').setAttribute('aria-label', t.acctBtn + (pending ? ' (' + pending + ')' : ''));
  renderAccountMenu();
  $('enBtn').classList.toggle('active', state.lang === 'en');
  $('esBtn').classList.toggle('active', state.lang === 'es');
  $('enBtn').setAttribute('aria-pressed', String(state.lang === 'en'));
  $('esBtn').setAttribute('aria-pressed', String(state.lang === 'es'));
}
