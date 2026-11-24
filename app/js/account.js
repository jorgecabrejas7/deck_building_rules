// Account page: sign-in, sign-up, pending, profile, privacy. Talks to the server's /pod/api (allauth headless + /me).
import { state, store } from './state.js';
import { T, fill } from './i18n.js';
import { legalHtml } from './i18n/account.js';
import { api, csrf } from './api.js';

const API = '../api/', AUTH = API + '_allauth/browser/v1/';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let me = null;        // GET /me answer, or null when the server did not answer
let current = null;   // the view being shown, re-run on language change

const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const SUN = svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>');
const MOON = svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>');
// one stroke, one size: the section and button icons of the profile and requests views
const I = {
  card: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 14h3"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  shield: svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>'),
  out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  back: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  chev: svg('<path d="m9 6 6 6-6 6"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
};

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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

// only the admin console may be a return target, so the parameter can't send anyone off-site
const goApp = () => location.assign(params.get('next') === 'admin' ? '../api/admin/' : './' + location.hash);
const goSignin = () => { location.assign('account.html'); };
// The ?view= the visitor came for (the approval email links to requests) survives the sign-in: ask /me again and
// show that view when the fresh state allows it, else the app.
async function afterSignin() {
  const r = await api(API + 'me');
  me = r.status === 200 ? r.data : null;
  const v = pick();
  if (v && v !== 'signin' && v !== 'signup') show(v); else goApp();
}
const wipeCaches = async () => { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); };

function viewSignin() {
  const t = T();
  $('card').innerHTML = `<h2>${t.signInT}</h2>${msg('f-net')}<form id="f-login">${field('username', t.username, 'text', 'username')}${field('password', t.password, 'password', 'current-password')}${msg('f-login-err')}<button class="btn-primary" type="submit">${t.signIn}</button></form>`
    + `<p class="f-or">${t.or}</p>${googleForm()}<p class="f-alt">${t.noAccount} <a href="?view=signup">${t.signUp}</a></p>`;
  if (params.has('error')) text('f-net', t.errGoogle);
  else if (!me) text('f-net', t.errNet);
  onSubmit('f-login', async (v) => {
    const res = await api(AUTH + 'auth/login', 'POST', { username: v.username, password: v.password });
    if (res.status === 200) return afterSignin();
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

// One settings row per job: icon and title on the left, the controls in one line on the right (stacked on phones).
const sec = (icon, title, body, cls = '') => `<section class="set${cls}"><h3 class="set-h">${icon}<span>${title}</span></h3><div class="set-b">${body}</div></section>`;
const cell = (html) => `<div class="f-cell">${html}</div>`;
const head = (title, sub, actions) => `<div class="acct-head"><div class="acct-id"><h2>${title}</h2>${sub}</div><div class="acct-go">${actions}</div></div>`;
const btnI = (cls, icon, label, attrs = '') => `<button class="${cls}" type="button"${attrs}>${icon}<span>${label}</span></button>`;

function viewProfile() {
  const t = T(), u = me.user;
  $('card').innerHTML = head(t.profileT, `<p>${esc(u.username)}</p>`,
    `<a class="btn-alt btn-sm" href="./">${I.back}<span>${t.backApp}</span></a>${btnI('btn-alt btn-sm', I.out, t.signOut, ' id="signOut"')}`)
    + sec(I.card, t.profileSec, `<form id="f-prof"><div class="f-line">${cell(field('display_name', t.displayName, 'text', 'nickname'))}`
      + cell(`<label class="f-lbl" for="language">${t.language}</label><select class="f-in" id="language" name="language"><option value="es">Español</option><option value="en">English</option></select>`)
      + `<button class="btn-primary" type="submit">${t.save}</button></div>${msg('f-prof-err')}</form>`)
    + sec(I.lock, t.changePw, `<form id="f-pw"><div class="f-line">${u.has_password ? cell(field('current_password', t.currentPw, 'password', 'current-password')) : ''}`
      + `${cell(field('new_password', t.newPw, 'password', 'new-password'))}<button class="btn-alt" type="submit">${t.changePw}</button></div>${msg('f-pw-err')}</form>`)
    + (u.is_admin ? sec(I.shield, t.adminT, `<a class="set-link" id="reqLink" href="?view=requests"><span class="set-link-t">${t.reqT}</span><span class="req-count" hidden></span>${I.chev}</a>`
      + `<a class="set-link" href="?view=users"><span class="set-link-t">${t.usersT}</span>${I.chev}</a>`) : '')
    + sec(I.trash, t.delT, `<p>${t.delX}</p>${u.has_password ? '' : `<p>${t.delNeedsPw}</p>`}${btnI('btn-alt btn-danger btn-sm', I.trash, t.delGo, ' id="delGo"')}`
      + `<form id="f-del" hidden><div class="f-line">${cell(field('del_password', t.password, 'password', 'current-password'))}<button class="btn-alt btn-danger" type="submit">${t.delConfirm}</button><button id="delNo" class="btn-alt" type="button">${t.delCancel}</button></div>${msg('f-del-err')}</form>`, ' set-danger');
  $('display_name').value = u.display_name; $('language').value = u.language;
  // the admin sees how many wait without opening the view
  if (u.is_admin) api(API + 'requests').then((r) => {
    const n = r.status === 200 ? r.data.requests.length : 0, c = document.querySelector('#reqLink .req-count');
    if (n && c) { c.textContent = n; c.hidden = false; }
  });
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
  $('delNo').onclick = () => { $('f-del').hidden = true; $('delGo').hidden = false; $('delGo').focus(); };
  onSubmit('f-del', async (v) => {
    const res = await api(API + 'me/delete', 'POST', { password: v.del_password });
    if (res.status === 204) { await wipeCaches(); goSignin(); }
    else text('f-del-err', res.status === 400 ? t.delWrongPw : t.errNet);
  });
}

// Admins only: accounts that signed up and wait for approval. Approve lets them in; reject only marks them (nothing
// is deleted) and takes them off the list. `note` is the line to show above the list after a decision.
async function viewRequests(note) {
  const t = T();
  $('card').innerHTML = head(t.reqT, `<p>${t.reqX}</p>`,
    `<a class="btn-alt btn-sm" href="?view=profile">${I.back}<span>${t.profileT}</span></a>`)
    + `<p class="f-ok" id="f-req-ok" aria-live="polite"></p>${msg('f-req-err')}`
    + `<ul id="reqList" class="req" aria-busy="true"><li class="req-none">${t.reqLoading}</li></ul>`;
  if (note) text('f-req-ok', note);
  const res = await api(API + 'requests');
  $('reqList').removeAttribute('aria-busy');
  if (res.status !== 200) { $('reqList').innerHTML = ''; return text('f-req-err', res.status === 403 ? t.reqForbidden : t.errNet); }
  const rows = res.data.requests, names = Object.fromEntries(rows.map((r) => [r.id, r.username]));
  if (!rows.length) { $('reqList').innerHTML = `<li class="req-none">${t.reqNone}</li>`; return; }
  const when = (iso) => `<time datetime="${iso}">${new Date(iso).toLocaleString(state.lang, { dateStyle: 'medium', timeStyle: 'short' })}</time>`;
  const actions = () => `<div class="req-act">${btnI('btn-primary', I.check, t.reqApprove, ' data-do="approve"')}${btnI('btn-alt btn-danger', I.x, t.reqReject, ' data-do="ask"')}</div>`;
  $('reqList').innerHTML = rows.map((r) => `<li class="req-row" data-id="${r.id}"><div class="req-who"><strong>${esc(r.username)}</strong>`
    + (r.email ? `<span>${I.mail}${esc(r.email)}</span>` : '') + `<span>${I.clock}${when(r.date_joined)}</span></div>${actions()}</li>`).join('');
  $('reqList').onclick = async (ev) => {
    const b = ev.target.closest('button[data-do]'); if (!b) return;
    const row = b.closest('.req-row'), id = row.dataset.id, name = names[id], act = row.querySelector('.req-act');
    if (b.dataset.do === 'ask') {   // the question replaces the buttons; Cancelar puts them back
      act.outerHTML = `<div class="req-act req-ask" role="group" aria-live="polite"><p>${fill(t.reqRejectAsk, { u: esc(name) })}</p>${btnI('btn-alt btn-danger', I.x, t.reqRejectYes, ' data-do="reject"')}<button class="btn-alt" data-do="cancel" type="button">${t.delCancel}</button></div>`;
      row.querySelector('[data-do="cancel"]').focus();
      return;
    }
    if (b.dataset.do === 'cancel') { act.outerHTML = actions(); row.querySelector('[data-do="ask"]').focus(); return; }
    for (const x of act.querySelectorAll('button')) x.disabled = true;
    const r = await api(API + 'requests/' + id + '/' + b.dataset.do, 'POST');
    if (r.status === 204) viewRequests(fill(b.dataset.do === 'approve' ? t.reqApproved : t.reqRejected, { u: name }));
    else if (r.status === 404) viewRequests(fill(t.reqGone, { u: name }));   // someone else decided it meanwhile
    else { for (const x of act.querySelectorAll('button')) x.disabled = false; text('f-req-err', t.errNet); }
  };
}

// Admins only: every account, filtered by state and searched by name or email. Dar de baja and Borrar ask first, inline,
// the way Rechazar does. Admin accounts, the admin's own included, are left to the Django admin. The filter and the
// search survive the re-render after an action.
let uFilter = 'all', uQuery = '';
const inFilter = (u, f) => f === 'all' || u.state === f || (f === 'active' && u.state === 'admin');
async function viewUsers(note) {
  const t = T();
  $('card').innerHTML = head(t.usersT, `<p>${t.usersX}</p>`,
    `<a class="btn-alt btn-sm" href="?view=profile">${I.back}<span>${t.profileT}</span></a>`)
    + `<div class="u-tools"><input class="f-in" id="uSearch" type="search" placeholder="${t.usersSearch}" aria-label="${t.usersSearch}" autocomplete="off" spellcheck="false">`
    + `<div class="u-filter" id="uFilter" role="group" aria-label="${t.usersFilter}"></div></div>`
    + `<p class="f-ok" id="f-u-ok" aria-live="polite"></p>${msg('f-u-err')}`
    + `<ul id="userList" class="req" aria-busy="true"><li class="req-none">${t.reqLoading}</li></ul>`;
  if (note) text('f-u-ok', note);
  $('uSearch').value = uQuery;
  const res = await api(API + 'users');
  $('userList').removeAttribute('aria-busy');
  if (res.status !== 200) { $('userList').innerHTML = ''; return text('f-u-err', res.status === 403 ? t.reqForbidden : t.errNet); }
  const all = res.data.users, byId = Object.fromEntries(all.map((u) => [u.id, u]));
  const FILTERS = [['all', t.fAll], ['active', t.fActive], ['pending', t.fPending], ['inactive', t.fInactive], ['rejected', t.fRejected]];
  const STATE = { admin: t.stAdmin, active: t.stActive, pending: t.stPending, inactive: t.stInactive, rejected: t.stRejected };
  const day = (iso) => new Date(iso).toLocaleDateString(state.lang, { dateStyle: 'medium' });
  const actions = (u) => {
    if (u.state === 'admin') return '';
    const del = btnI('btn-alt btn-danger', I.trash, t.uDel, ' data-do="ask-delete"');
    if (u.state === 'active') return `<div class="req-act">${del}${btnI('btn-alt', I.out, t.uDeact, ' data-do="ask-deactivate"')}</div>`;
    const on = u.state === 'pending' ? btnI('btn-primary', I.check, t.reqApprove, ' data-do="activate"') : btnI('btn-alt', I.undo, t.uReact, ' data-do="activate"');
    return `<div class="req-act">${del}${on}</div>`;
  };
  const row = (u) => `<li class="req-row" data-id="${u.id}"><div class="req-who"><strong>${esc(u.display_name || u.username)}`
    + ` <span class="u-badge u-${u.state}">${u.is_self ? t.stYou : STATE[u.state]}</span></strong>`
    + (u.display_name ? `<span>${I.user}${esc(u.username)}</span>` : '') + (u.email ? `<span>${I.mail}${esc(u.email)}</span>` : '')
    + `<span>${I.clock}${fill(t.uJoined, { d: day(u.date_joined) })} · ${u.last_login ? fill(t.uLast, { d: day(u.last_login) }) : t.uNever}</span></div>`
    + `${actions(u)}</li>`;
  const drawFilter = () => {
    $('uFilter').innerHTML = FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === uFilter}">${l}<span>${all.filter((u) => inFilter(u, k)).length}</span></button>`).join('');
  };
  const drawList = () => {
    const q = uQuery.trim().toLowerCase();
    const rows = all.filter((u) => inFilter(u, uFilter) && (!q || [u.username, u.display_name, u.email].some((s) => s.toLowerCase().includes(q))));
    $('userList').innerHTML = rows.length ? rows.map(row).join('') : `<li class="req-none">${t.uNone}</li>`;
  };
  drawFilter(); drawList();
  $('uSearch').oninput = (e) => { uQuery = e.target.value; drawList(); };
  $('uFilter').onclick = (e) => { const b = e.target.closest('button[data-f]'); if (b) { uFilter = b.dataset.f; drawFilter(); drawList(); } };
  $('userList').onclick = async (ev) => {
    const b = ev.target.closest('button[data-do]'); if (!b) return;
    const li = b.closest('.req-row'), u = byId[li.dataset.id], act = li.querySelector('.req-act'), d = b.dataset.do;
    if (d.startsWith('ask-')) {   // the question replaces the buttons; Cancelar puts them back
      const what = d.slice(4), del = what === 'delete';
      act.outerHTML = `<div class="req-act req-ask" role="group" aria-live="polite"><p>${fill(del ? t.uDelAsk : t.uDeactAsk, { u: esc(u.username) })}</p>`
        + btnI('btn-alt btn-danger', del ? I.trash : I.out, del ? t.uDelYes : t.uDeactYes, ` data-do="${what}"`)
        + `<button class="btn-alt" data-do="cancel" type="button">${t.delCancel}</button></div>`;
      li.querySelector('[data-do="cancel"]').focus();
      return;
    }
    if (d === 'cancel') { act.outerHTML = actions(u); li.querySelector('[data-do^="ask-"]').focus(); return; }
    for (const x of act.querySelectorAll('button')) x.disabled = true;
    const r = await api(API + 'users/' + u.id + '/' + d, 'POST');
    const done = { deactivate: t.uDeactDone, activate: u.state === 'pending' ? t.reqApproved : t.uReactDone, delete: t.uDelDone }[d];
    if (r.status === 204) viewUsers(fill(done, { u: u.username }));
    else if (r.status === 404 || r.status === 409) viewUsers(fill(t.uGone, { u: u.username }));   // changed meanwhile
    else { for (const x of act.querySelectorAll('button')) x.disabled = false; text('f-u-err', t.errNet); }
  };
}

// k is 'priv' or 'terms': the page title is t[k+'T'], the rows t[k]
const legalView = (k) => () => {
  const t = T();
  $('card').innerHTML = `<h2>${t[k + 'T']}</h2><dl class="priv">${t[k].map(([h, p]) => `<dt>${h}</dt><dd>${p}</dd>`).join('')}</dl><a class="btn-alt" href="./">${t.backApp}</a>`;
};

const VIEWS = { signin: viewSignin, signup: viewSignup, pending: viewPending, profile: viewProfile, requests: viewRequests, users: viewUsers, privacy: legalView('priv'), terms: legalView('terms') };

// The state decides what is allowed; the ?view= only picks among the allowed ones.
function pick() {
  const want = params.get('view') || 'signin';
  if (want === 'privacy' || want === 'terms') return want;
  if (me && me.state === 'active') return want === 'profile' || ((want === 'requests' || want === 'users') && me.user.is_admin) ? want : null;
  // pending is the landing, but its own sign-in link must still reach the form (another account may be approved)
  if (me && me.state === 'pending' && !params.has('view')) return 'pending';
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
  $('card').classList.toggle('acct-wide', current === 'profile' || current === 'requests' || current === 'users');
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
