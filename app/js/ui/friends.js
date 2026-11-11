// The Amigos tab (F6): my username to share, friend requests in and out, my friends. Pod admins add friends to a pod from the Pod tab.
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { $, esc } from './helpers.js';
import { renderAll } from '../main.js';

const API = '../api/';
let data = null;      // {friends, incoming, outgoing} once loaded
let status = 'idle';  // idle | out (not signed in) | error
let me = null;        // my username
let asking = null;    // 'f<userId>': the unfriend awaiting its second press
let msg = null;       // i18n key of the last answer worth showing
let bad = false;      // the last answer is a refusal

export const friendsBadge = () => data ? data.incoming.length : null;
export const friendList = () => data ? data.friends : [];

// Asks the server again: when a tab that needs friends opens and after every action.
export async function loadFriends() {
  const res = await api(API + 'friends');
  status = res.status === 200 ? 'idle' : res.status === 403 ? 'out' : 'error';
  data = res.status === 200 ? res.data : null;
  if (data && me === null) { const u = await api(API + 'me'); if (u.status === 200) me = u.data.user.username; }
  renderAll();
  return data;
}

const btn = (act, id, label, cls) => '<button class="' + (cls || 'btn-ghost-sm') + '" data-act="' + act + '" data-user="' + id + '">' + esc(label) + '</button>';
const row = (u, acts) => '<li class="pod-member"><span class="pod-mname">' + esc(u.name) + '</span><span class="dk-actions">' + acts + '</span></li>';
const section = (title, items) => items ? '<div class="panel pod-card"><h3 class="pod-sub">' + esc(title) + '</h3><ul class="pod-members">' + items + '</ul></div>' : '';

export function renderFriends() {
  const t = T(), el = $('friendsPanel');
  let body;
  if (status === 'out') body = '<p class="note-sm">' + esc(t.frSignInNote) + '</p><a class="btn-primary dk-login" href="account.html">' + esc(t.sdSignIn) + '</a>';
  else if (status === 'error') body = '<p class="note-bad" role="status">' + esc(t.frErr) + '</p>';
  else if (!data) body = '<p class="note-sm">' + esc(t.frLoading) + '</p>';
  else {
    const friends = data.friends.map(u => row(u, asking === 'f' + u.id
      ? '<span class="dk-confirm">' + esc(fill(t.frRemoveAsk, { n: u.name })) + '</span>' + btn('remove-yes', u.id, t.pdYes, 'btn-ghost-sm btn-danger') + '<button class="btn-ghost-sm" data-act="cancel">' + esc(t.pdCancel) + '</button>'
      : btn('remove', u.id, t.frRemove))).join('');
    body = '<div class="panel pod-card">' +
      (me ? '<p class="note-sm">' + fill(esc(t.frYou), { n: '<b>' + esc(me) + '</b>' }) + '</p>' : '') +
      '<form class="dk-form" data-friendform><input name="username" class="arch-select" maxlength="150" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t.frUsername) + '" aria-label="' + esc(t.frUsername) + '">' +
      '<button class="btn-primary">' + esc(t.frSend) + '</button></form>' +
      (msg ? '<p class="' + (bad ? 'note-bad' : 'note-sm') + '" role="status">' + esc(t[msg]) + '</p>' : '') + '</div>' +
      section(t.frIncoming, data.incoming.map(u => row(u, btn('accept', u.id, t.frAccept, 'btn-primary') + btn('decline', u.id, t.frDecline))).join('')) +
      '<div class="panel pod-card"><h3 class="pod-sub">' + esc(t.frFriends) + '</h3>' +
      (friends ? '<ul class="pod-members">' + friends + '</ul>' : '<p class="note-sm">' + esc(t.frNone) + '</p>') + '</div>' +
      section(t.frOutgoing, data.outgoing.map(u => row(u, btn('decline', u.id, t.frCancel))).join(''));
  }
  el.innerHTML = '<div class="stack-16"><div class="part-head"><div><h2 class="part-title">' + esc(t.frTitle) + '</h2><p class="part-sub">' + esc(t.frIntro) + '</p></div></div>' + body + '</div>';
  el.onclick = onClick; el.onsubmit = onSubmit;
}

// Sets the answer line from a failed call; returns whether the call went through.
async function act(method, path, body, ok) {
  const res = await api(API + path, method, body);
  asking = null;
  if (res.status === ok || (ok === 201 && res.status === 200)) { bad = false; return res; }
  const errs = res.data.errors || {};
  bad = true;
  msg = res.status === 0 ? 'frErr' : errs.username === 'self' ? 'frSelf' : errs.username === 'unknown' ? 'frUnknown' : errs.friends === 'limit' ? 'frLimit' : 'frFailed';
  return null;
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act, id = b.dataset.user;
  if (a === 'cancel') { asking = null; return renderFriends(); }
  if (a === 'remove') { asking = 'f' + id; return renderFriends(); }
  msg = null;
  if (a === 'accept') await act('POST', 'friends/' + id + '/accept', undefined, 204);
  else await act('DELETE', 'friends/' + id, undefined, 204); // remove-yes, decline, cancel
  await loadFriends();
}

async function onSubmit(e) {
  e.preventDefault();
  const res = await act('POST', 'friends', { username: e.target.username.value.trim() }, 201);
  msg = res ? (res.data.status === 'friends' ? 'frNowFriends' : 'frSent') : msg;
  await loadFriends();
}
