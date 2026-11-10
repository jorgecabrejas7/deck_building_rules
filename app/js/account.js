// Account page: sign-in, sign-up, pending, profile, privacy. Talks to the server's /pod/api (allauth headless + /me).
import { state, store } from './state.js';
import { T } from './i18n.js';
import { legalHtml } from './i18n/account.js';

const API = '../api/', AUTH = API + '_allauth/browser/v1/';
const $ = (id) => document.getElementById(id);
const csrf = () => (document.cookie.match(/(?:^|; )pod_csrftoken=([^;]*)/) || [])[1] || '';
const params = new URLSearchParams(location.search);
let me = null;        // GET /me answer, or null when the server did not answer
let current = null;   // the view being shown, re-run on language change

// status 0 = the server could not be reached
async function api(url, method = 'GET', body) {
  try {
    const r = await fetch(url, {
      method, credentials: 'same-origin',
      headers: { 'X-CSRFToken': csrf(), 'Accept-Language': state.lang, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch (e) { return { status: 0, data: {} }; }
}

const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const SUN = svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>');
const MOON = svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>');

function applyTheme() {
  const eff = state.theme ? state.theme === 'dark' : state.sysDark, t = T();
  document.body.classList.toggle('dark', eff);
  $('themeBtn').innerHTML = eff ? SUN : MOON;
  $('themeBtn').setAttribute('aria-label', eff ? t.themeToLight : t.themeToDark);
  $('themeBtn').setAttribute('aria-pressed', String(eff));
}

const field = (id, label, type, auto) =>
  `<label class="f-lbl" for="${id}">${label}</label><input class="f-in" id="${id}" name="${id}" type="${type}" autocomplete="${auto}"${id === 'username' ? ' required autocapitalize="none" spellcheck="false"' : ''}>`
  + `<p class="f-err" id="e-${id}" aria-live="polite"></p>`;
const msg = (id) => `<p class="f-err" id="${id}" aria-live="polite"></p>`;
const text = (id, s) => { $(id).textContent = s; };
const clearErrs = () => document.querySelectorAll('.f-err').forEach((e) => { e.textContent = ''; });

// allauth answers {errors:[{message, param}]}; each message goes next to its field, the rest in the form's own line
function showErrors(res, form, map = {}) {
  if (!res.status) return text(form, T().errNet);
  const errs = res.data.errors || [];
  if (!errs.length) return text(form, T().errNet);
  for (const e of errs) {
    const el = $('e-' + (map[e.param] || e.param)) || $(form);
    el.textContent += (el.textContent ? ' ' : '') + e.message;
  }
}

function onSubmit(formId, fn) {
  $(formId).onsubmit = async (ev) => {
    ev.preventDefault(); clearErrs();
    const b = ev.submitter; if (b) b.disabled = true;
    try { await fn(Object.fromEntries(new FormData(ev.target))); } finally { if (b) b.disabled = false; }
  };
}

const goApp = () => location.assign('./' + location.hash);
const goSignin = () => { location.assign('account.html'); };
const wipeCaches = async () => { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); };

function viewSignin() {
  const t = T();
  $('card').innerHTML = `<h2>${t.signInT}</h2>${msg('f-net')}<form id="f-login">${field('username', t.username, 'text', 'username')}${field('password', t.password, 'password', 'current-password')}${msg('f-login-err')}<button class="btn-primary" type="submit">${t.signIn}</button></form>`
    + `<p class="f-or">${t.or}</p>${googleForm()}<p class="f-alt">${t.noAccount} <a href="?view=signup">${t.signUp}</a></p>`;
  if (params.has('error')) text('f-net', t.errGoogle);
  else if (!me) text('f-net', t.errNet);
  onSubmit('f-login', async (v) => {
    const res = await api(AUTH + 'auth/login', 'POST', { username: v.username, password: v.password });
    if (res.status === 200) goApp();
    else if (res.status === 401) show('pending');
    else if (res.status === 400) text('f-login-err', t.wrongCreds);
    else text('f-login-err', t.errNet);
  });
  wireGoogle();
}

function googleForm() {
  return `<form id="f-google" method="post" action="${AUTH}auth/provider/redirect"><input type="hidden" name="provider" value="google"><input type="hidden" name="callback_url" value="/pod/app/account.html"><input type="hidden" name="process" value="login"><input type="hidden" name="csrfmiddlewaretoken"><button class="btn-alt" type="submit">${T().google}</button></form>`;
}
// not onSubmit: this one must reach the server as a normal form post
const wireGoogle = () => { $('f-google').addEventListener('submit', (ev) => { ev.target.csrfmiddlewaretoken.value = csrf(); }); };

function viewSignup() {
  const t = T();
  $('card').innerHTML = `<h2>${t.signUpT}</h2><form id="f-signup">${field('username', t.username, 'text', 'username')}${field('email', t.email, 'email', 'email')}${field('password', t.password, 'password', 'new-password')}${field('password2', t.passwordAgain, 'password', 'new-password')}${msg('f-signup-err')}<button class="btn-primary" type="submit">${t.signUp}</button></form>`
    + `<p class="f-or">${t.or}</p>${googleForm()}<p class="f-alt">${t.haveAccount} <a href="?view=signin">${t.signIn}</a></p>`;
  onSubmit('f-signup', async (v) => {
    if (v.password !== v.password2) return text('e-password2', t.pwMismatch);
    const res = await api(AUTH + 'auth/signup', 'POST', { username: v.username, ...(v.email ? { email: v.email } : {}), password: v.password });
    if (res.status === 200) goApp();
    else if (res.status === 401) show('pending');
    else showErrors(res, 'f-signup-err');
  });
  wireGoogle();
}

function viewPending() {
  const t = T();
  $('card').innerHTML = `<h2>${t.pendingT}</h2><p>${t.pendingX}</p><a class="btn-alt" href="?view=signin">${t.signIn}</a>`;
}

function viewProfile() {
  const t = T(), u = me.user;
  $('card').innerHTML = `<h2>${t.profileT}</h2><p>${u.username}</p>`
    + `<form id="f-prof">${field('display_name', t.displayName, 'text', 'nickname')}<label class="f-lbl" for="language">${t.language}</label><select class="f-in" id="language" name="language"><option value="es">Español</option><option value="en">English</option></select>${msg('f-prof-err')}<button class="btn-primary" type="submit">${t.save}</button></form>`
    + `<section><h3>${t.changePw}</h3><form id="f-pw">${u.has_password ? field('current_password', t.currentPw, 'password', 'current-password') : ''}${field('new_password', t.newPw, 'password', 'new-password')}${msg('f-pw-err')}<button class="btn-alt" type="submit">${t.changePw}</button></form></section>`
    + `<section><button id="signOut" class="btn-alt" type="button">${t.signOut}</button></section>`
    + `<section><h3>${t.delT}</h3><p>${t.delX}</p>${u.has_password ? '' : `<p>${t.delNeedsPw}</p>`}<button id="delGo" class="btn-alt btn-danger" type="button">${t.delGo}</button>`
    + `<form id="f-del" hidden>${field('del_password', t.password, 'password', 'current-password')}${msg('f-del-err')}<button class="btn-alt btn-danger" type="submit">${t.delConfirm}</button><button id="delNo" class="btn-alt" type="button">${t.delCancel}</button></form></section>`;
  $('display_name').value = u.display_name; $('language').value = u.language;
  onSubmit('f-prof', async (v) => {
    const res = await api(API + 'me', 'POST', { display_name: v.display_name, language: v.language });
    if (res.status !== 200) return showErrors(res, 'f-prof-err');
    me = res.data; state.lang = store.lang = me.user.language;
    render(); text('f-prof-err', T().saved);
  });
  onSubmit('f-pw', async (v) => {
    const res = await api(AUTH + 'account/password/change', 'POST', { ...(u.has_password ? { current_password: v.current_password } : {}), new_password: v.new_password });
    if (res.status !== 200) return showErrors(res, 'f-pw-err', { password: 'new_password' });
    me.user.has_password = true; render(); text('f-pw-err', T().pwChanged);
  });
  $('signOut').onclick = async () => { await api(AUTH + 'auth/session', 'DELETE'); await wipeCaches(); goSignin(); };
  $('delGo').onclick = () => { $('f-del').hidden = false; $('delGo').hidden = true; $('del_password').focus(); };
  $('delNo').onclick = () => { $('f-del').hidden = true; $('delGo').hidden = false; };
  onSubmit('f-del', async (v) => {
    const res = await api(API + 'me/delete', 'POST', { password: v.del_password });
    if (res.status === 204) { await wipeCaches(); goSignin(); }
    else text('f-del-err', res.status === 400 ? t.delWrongPw : t.errNet);
  });
}

function viewPrivacy() {
  const t = T();
  $('card').innerHTML = `<h2>${t.privT}</h2><dl class="priv">${t.priv.map(([h, p]) => `<dt>${h}</dt><dd>${p}</dd>`).join('')}</dl><a class="btn-alt" href="./">${t.backApp}</a>`;
  $('card').querySelector('dd:last-of-type').textContent += '⟦contact TBD⟧'; // placeholder until Jorge gives a contact
}

const VIEWS = { signin: viewSignin, signup: viewSignup, pending: viewPending, profile: viewProfile, privacy: viewPrivacy };

// The state decides what is allowed; the ?view= only picks among the allowed ones.
function pick() {
  const want = params.get('view') || 'signin';
  if (want === 'privacy') return 'privacy';
  if (me && me.state === 'active') return want === 'profile' ? 'profile' : null;
  if (me && me.state === 'pending') return 'pending';
  return want === 'signup' ? 'signup' : 'signin';
}
function show(view) { current = view; render(); }
function render() {
  const t = T();
  document.documentElement.lang = state.lang;
  applyTheme();
  $('appTag').textContent = t.acctTag;
  $('esBtn').classList.toggle('active', state.lang === 'es'); $('esBtn').setAttribute('aria-pressed', String(state.lang === 'es'));
  $('enBtn').classList.toggle('active', state.lang === 'en'); $('enBtn').setAttribute('aria-pressed', String(state.lang === 'en'));
  $('footer').innerHTML = legalHtml(t);
  VIEWS[current]();
}

const setLang = (l) => { state.lang = store.lang = l; render(); };
$('esBtn').onclick = () => setLang('es');
$('enBtn').onclick = () => setLang('en');
$('themeBtn').onclick = () => { state.theme = store.theme = (state.theme ? state.theme === 'dark' : state.sysDark) ? 'light' : 'dark'; applyTheme(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { state.sysDark = e.matches; applyTheme(); });

await api(AUTH + 'config'); // sets the CSRF cookie
const r = await api(API + 'me');
me = r.status === 200 ? r.data : null;
const first = pick();
if (first) show(first); else goApp();
