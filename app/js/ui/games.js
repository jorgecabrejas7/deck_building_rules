// The Partidas tab (F5): every game I am in, the people I can invite (pod-mates and friends), and the deck choice
// that takes me to the game's lobby with that deck already chosen.
import { state, persistCache } from '../state.js';
import { T, fill } from '../i18n.js';
import { api } from '../api.js';
import { podRules } from '../rules.js';
import { readDeck, readDeps } from '../pipeline.js';
import { $, esc, has, tierTone, coverThumb, bindCovers, needCovers } from './helpers.js';
import { renderAll } from '../main.js';

const API = '../api/';
const LAST_DECK = 'pdc_game_deck'; // the deck last taken to a table: offered first
let data = null;      // {games, people} once loaded
let failed = false;   // the last load did not reach the server
let msg = null;       // i18n key of the last refusal
let asking = null;    // id of the game awaiting the second press that ends it
let pick = null;      // {game} | {people, pod}: the deck choice that is open; people[0] is who was tapped; pod is an id, or null between friends
let decks = null;     // my saved decks, asked for when a deck choice opens
let busy = false;     // a deck was tapped and the answer is on its way
let q = '', dq = '';  // what is typed in the people and deck searches
const pods = new Map();  // podId -> detail, for the rules and my decks in it
const tiers = new Map(); // deckId|updated_at|rules_updated_at -> tier under that pod's rules

const MAX_OPP = 5;    // a table seats six
const invitations = () => data ? data.games.filter(g => g.status === 'lobby' && g.seat !== 1 && !g.decks[g.seat]) : [];
const name = (n, t) => n === null ? t.gmDeleted : n;
const names = (g, t) => g.opponents.map(n => name(n, t)).join(', ');
// who else can sit at the game being set up: the tapped person's pod-mates in that pod, or my friends
const canJoin = (p) => pick.pod ? p.pods.some(x => x.id === pick.pod) : p.friend;
export const gamesBadge = () => invitations().length;
const pickPod = () => pick.game ? (pick.game.pod ? pick.game.pod.id : null) : pick.pod;
const tierKey = (pod, d) => d.id + '|' + d.updated_at + '|' + pod.rules_updated_at;

// Asks the server again: at boot (the tab count), when the tab opens and after every action.
export async function loadGames() {
  const res = await api(API + 'games');
  data = res.status === 200 ? res.data : null;
  failed = res.status !== 200 && res.status !== 403;
  pods.clear();
  if (pick && pick.game) {
    const g = data && data.games.find(x => x.id === pick.game.id);
    pick = g && g.status === 'lobby' ? { game: g } : null;
  }
  renderAll();
}

// My decks in the game's pod get their level under that pod's rules, one at a time. The choice works without it.
async function readTiers(podId) {
  let pod = pods.get(podId);
  if (!pod) {
    const res = await api(API + 'pods/' + podId);
    if (res.status !== 200) return;
    pod = res.data.pod;
    pods.set(podId, pod);
    paint();
  }
  try {
    const deps = await readDeps(), rules = podRules(pod);
    for (const d of pod.decks) {
      if (!d.mine || !d.list || tiers.has(tierKey(pod, d))) continue;
      const c = d.list.commanders;
      const r = await readDeck({ entries: d.list.entries, commanders: c }, deps, c.length ? c : null, rules);
      tiers.set(tierKey(pod, d), r.evalRes.tier);
      if (pick && pickPod() === podId) paint();
    }
    persistCache();
  } catch (e) { console.error(e); }
}

async function openChoice(next) {
  pick = next; dq = ''; msg = null; asking = null;
  paint('gm-back');
  if (pickPod()) readTiers(pickPod());
  if (!decks) {
    const res = await api(API + 'decks');
    if (res.status === 200) decks = res.data.decks; else msg = 'pdErr';
    paint();
  }
}
// From the Amigos tab: straight to the deck choice against that friend.
export async function inviteFriend(id) {
  state.tab = 'games';
  await loadGames();
  const p = data && data.people.find(x => x.id === id);
  if (p) openChoice({ people: [p], pod: defaultPod(p) });
}
// The pod a new game is played in: the active one if we share it, else the first we share, else none (friends).
const defaultPod = (p) => (p.pods.find(x => x.id === state.activeId) || p.pods[0] || { id: null }).id;

// ---- the first screen: an invitation is one tap from its deck choice ----
export function renderHeroInvite() {
  const el = $('heroInvite'), inv = invitations(), t = T();
  el.hidden = !inv.length;
  if (!inv.length) return;
  el.textContent = inv.length === 1 ? fill(t.gmHeroOne, { n: name(inv[0].opponents[0], t) }) : fill(t.gmHeroMany, { n: inv.length });
  el.onclick = () => {
    state.tab = 'games';
    renderAll();
    $('stickySentinel').scrollIntoView();
    if (inv.length === 1) openChoice({ game: inv[0] });
  };
}

// ---- the tab ----
const row = (id, act, key, name, sub, side, off, thumb = '') => '<li><button class="gm-row" id="' + id + '" data-act="' + act + '" data-id="' + key + '"' + (off ? ' disabled' : '') + '>' + thumb +
  '<span class="gm-main"><span class="gm-name">' + esc(name) + '</span>' + (sub ? '<span class="gm-sub">' + esc(sub) + '</span>' : '') + '</span>' + side + '</button></li>';
const search = (id, value, label) => '<div class="dk-form"><input type="search" id="' + id + '" value="' + esc(value) + '" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(label) + '" aria-label="' + esc(label) + '"></div>';

function gameRow(g, t) {
  const who = names(g, t), seats = Object.values(g.ready);
  const lobby = g.status === 'lobby', mine = lobby && !g.decks[g.seat];
  const line = !lobby ? fill(t.gmPlaying, { n: who })
    : !mine ? fill(t.gmLobby, { n: who, a: seats.filter(Boolean).length, m: seats.length })
    : g.seat === 1 ? fill(t.gmYouInvited, { n: who }) : fill(t.gmInvitesYou, { n: name(g.opponents[0], t) }); // seat 1 invited
  const sub = [g.pod ? g.pod.name : t.gmFriendGame, mine && g.seat !== 1 && g.opponents.length > 1 ? fill(t.gmWith, { n: g.opponents.slice(1).map(n => name(n, t)).join(', ') }) : null].filter(Boolean).join(' · ');
  const go = mine
    ? '<button class="btn-primary" id="gm-choose-' + g.id + '" data-act="choose" data-id="' + g.id + '" aria-label="' + esc(t.gmChoose + ', ' + who) + '">' + esc(t.gmChoose) + '</button>'
    : '<a class="btn-primary dk-login" id="gm-open-' + g.id + '" href="table.html?game=' + g.id + '" aria-label="' + esc(t.gmOpen + ', ' + who) + '">' + esc(t.gmOpen) + '</a>';
  const label = !lobby ? t.gmEnd : g.seat === 1 ? t.pdCancel : t.gmDecline;
  const end = asking === g.id
    ? '<span class="dk-confirm">' + esc(t.gmAsk) + '</span><button class="btn-ghost-sm btn-danger" id="gm-endyes-' + g.id + '" data-act="end-yes" data-id="' + g.id + '">' + esc(t.pdYes) + '</button><button class="btn-ghost-sm" id="gm-keep-' + g.id + '" data-act="keep" data-id="' + g.id + '">' + esc(t.pdCancel) + '</button>'
    : '<button class="btn-ghost-sm" id="gm-end-' + g.id + '" data-act="end" data-id="' + g.id + '" aria-label="' + esc(label + ', ' + who) + '">' + esc(label) + '</button>';
  return '<li class="pod-member"><span class="gm-main"><span class="gm-name">' + esc(line) + '</span><span class="gm-sub">' + esc(sub) + '</span></span>' +
    '<span class="dk-actions">' + go + end + '</span></li>';
}

function peopleLi(t) {
  return data.people.filter(p => has(q, p.name, ...p.pods.map(x => x.name))).map(p =>
    row('gm-person-' + p.id, 'person', p.id, p.name, [...p.pods.map(x => x.name), p.friend ? t.gmFriend : null].filter(Boolean).join(' · '),
      '<span class="gm-go">' + esc(t.gmInvite) + '</span>')).join('') || '<li class="note-sm">' + esc(t.gmNoMatch) + '</li>';
}

function decksLi(t) {
  const podId = pickPod(), pod = podId && pods.get(podId), last = Number(localStorage.getItem(LAST_DECK));
  const inPod = new Map((pod ? pod.decks : []).filter(d => d.mine).map(d => [d.id, d]));
  const first = (a, b) => (b.id === last) - (a.id === last); // the sort is stable: the server's newest-first order stays
  const li = (d) => {
    const e = inPod.get(d.id), tier = e && tiers.get(tierKey(pod, e));
    return row('gm-deck-' + d.id, 'deck', d.id, d.name, d.commanders.join(' · '),
      tier ? '<span class="tier-pill ' + tierTone(tier) + '">' + esc(t['short_' + tier]) + '</span>' : '', busy, coverThumb(d.name, d.commanders));
  };
  const found = decks.filter(d => has(dq, d.name, ...d.commanders)).sort(first);
  if (!found.length) return '<li class="note-sm">' + esc(t.gmNoMatch) + '</li>';
  const here = found.filter(d => inPod.has(d.id)), rest = found.filter(d => !inPod.has(d.id));
  if (!here.length) return rest.map(li).join('');
  return '<li class="gm-group">' + esc(fill(t.gmInPod, { n: pod.name })) + '</li>' + here.map(li).join('') +
    (rest.length ? '<li class="gm-group">' + esc(t.gmOtherDecks) + '</li>' + rest.map(li).join('') : '');
}

function choiceHtml(t) {
  const first = pick.people && pick.people[0], podId = pickPod();
  const who = pick.game ? names(pick.game, t) : pick.people.map(p => p.name).join(', ');
  const options = first ? [...first.pods, ...(first.friend ? [{ id: null, name: t.gmFriendGame }] : [])] : [];
  const podName = pick.game ? (pick.game.pod && pick.game.pod.name) : (first.pods.find(x => x.id === podId) || {}).name;
  const chip = (id, act, key, on, label, off) => '<button class="chip-dashed gm-chip" id="' + id + '" data-act="' + act + '" data-id="' + key + '" aria-pressed="' + on + '"' + (off ? ' disabled' : '') + '>' + esc(label) + '</button>';
  const where = options.length > 1
    ? '<div class="dk-actions" role="group" aria-label="' + esc(t.gmWhere) + '">' + options.map(o => chip('gm-pod-' + o.id, 'pod', o.id === null ? '' : o.id, o.id === podId, o.name)).join('') + '</div>'
    : '';
  const sitting = new Set(first ? pick.people.map(p => p.id) : []);
  const others = first ? data.people.filter(p => p.id !== first.id && canJoin(p)) : [];
  const more = others.length
    ? '<p class="note-sm" id="gmMoreLabel">' + esc(t.gmMore) + '</p><div class="dk-actions" role="group" aria-labelledby="gmMoreLabel">' +
      others.map(p => chip('gm-more-' + p.id, 'more', p.id, sitting.has(p.id), p.name, !sitting.has(p.id) && sitting.size >= MAX_OPP)).join('') + '</div>'
    : '';
  const note = podId ? fill(t.gmPodRules, { n: podName }) : t.gmNoRules;
  let list;
  if (!decks) list = '<p class="note-sm">' + esc(msg ? '' : t.gmLoading) + '</p>';
  else if (!decks.length) list = '<p class="note-sm">' + esc(t.gmNoDecks) + '</p><div class="dk-actions"><button class="btn-primary" id="gm-tab-load" data-act="tab" data-id="load">' + esc(t.tabLoad) + '</button><button class="btn-ghost-sm" id="gm-tab-build" data-act="tab" data-id="build">' + esc(t.tabBuild) + '</button></div>';
  else list = (decks.length > 8 ? search('gmDeckQ', dq, t.gmFindDeck) : '') + '<ul class="gm-list" id="gmDecks">' + decksLi(t) + '</ul>';
  return '<div class="panel pod-card"><div class="dk-actions"><button class="btn-ghost-sm" id="gm-back" data-act="back">' + esc(t.gmBack) + '</button></div>' +
    '<h3 class="pod-sub">' + esc(fill(t.gmDeckFor, { n: who })) + '</h3>' + where + more +
    '<p class="note-sm">' + esc(note) + '</p>' + flash(t) + list + '</div>';
}

const flash = (t) => msg ? '<p class="note-bad" role="alert">' + esc(t[msg]) + '</p>' : '';

function listHtml(t) {
  const waiting = (g) => g.status === 'lobby' && !g.decks[g.seat];
  const games = [...data.games].sort((a, b) => waiting(b) - waiting(a)).map(g => gameRow(g, t)).join('');
  const people = data.people.length
    ? (data.people.length > 8 ? search('gmPeopleQ', q, t.gmFindPerson) : '') + '<ul class="gm-list" id="gmPeople">' + peopleLi(t) + '</ul>'
    : '<p class="note-sm">' + esc(t.gmNoPeople) + '</p><div class="dk-actions"><button class="btn-primary" id="gm-tab-friends" data-act="tab" data-id="friends">' + esc(t.tabFriends) + '</button><button class="btn-ghost-sm" id="gm-tab-pod" data-act="tab" data-id="pod">' + esc(t.tabPod) + '</button></div>';
  return flash(t) +
    (games ? '<div class="panel pod-card"><h3 class="pod-sub">' + esc(t.gmYours) + '</h3><ul class="pod-members">' + games + '</ul></div>' : '') +
    '<div class="panel pod-card"><h3 class="pod-sub">' + esc(t.gmInviteTitle) + '</h3>' + people + '</div>' +
    '<div class="panel pod-card"><p class="note-sm">' + esc(t.gmPracticeNote) + '</p><div class="dk-actions"><button class="btn-ghost-sm" id="gm-practice" data-act="practice">' + esc(t.gmPractice) + '</button></div></div>';
}

export function renderGames() {
  const t = T(), el = $('gamesPanel');
  let body;
  if (!state.pods) body = '<p class="note-sm">' + esc(t.gmSignIn) + '</p><a class="btn-primary dk-login" href="account.html">' + esc(t.sdSignIn) + '</a>';
  else if (!data) body = '<p class="' + (failed ? 'note-bad' : 'note-sm') + '" role="status">' + esc(failed ? t.pdErr : t.gmLoading) + '</p>';
  else body = pick ? choiceHtml(t) : listHtml(t);
  el.innerHTML = '<div class="stack-16"><div class="part-head"><div><h2 class="part-title">' + esc(t.gmTitle) + '</h2><p class="part-sub">' + esc(t.gmIntro) + '</p></div></div>' + body + '</div>';
  el.onclick = onClick; el.oninput = onInput;
  bindCovers(el);
  if (decks) needCovers(decks.map(d => d.commanders), () => paint());
}
// Redraws the tab and puts the keyboard back where it was, or on the control named.
function paint(focus) {
  if (state.tab !== 'games') return;
  const id = focus || (document.activeElement && document.activeElement.id);
  renderGames();
  const el = id && $(id);
  if (el) el.focus({ preventScroll: true });
}

// Typing filters the list under the field without redrawing the field itself.
function onInput(e) {
  if (e.target.id === 'gmPeopleQ') { q = e.target.value; $('gmPeople').innerHTML = peopleLi(T()); }
  if (e.target.id === 'gmDeckQ') { dq = e.target.value; $('gmDecks').innerHTML = decksLi(T()); }
}

const refusal = (res) => res.status === 0 ? 'pdErr' : (res.data.errors || {}).games === 'limit' ? 'gmLimit' : (res.data.errors || {}).deck === 'size' ? 'gmDeckSize' : 'gmErr';

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act, id = Number(b.dataset.id);
  if (a === 'tab') return $('tabbtn-' + b.dataset.id).click();
  if (a === 'person') { const p = data.people.find(x => x.id === id); return openChoice({ people: [p], pod: defaultPod(p) }); }
  if (a === 'choose') return openChoice({ game: data.games.find(g => g.id === id) });
  if (a === 'pod') {
    pick.pod = id || null;
    pick.people = pick.people.filter((p, i) => !i || canJoin(p));
    paint();
    if (pick.pod) readTiers(pick.pod);
    return;
  }
  if (a === 'more') {
    const at = pick.people.findIndex(p => p.id === id);
    if (at > 0) pick.people.splice(at, 1); else pick.people.push(data.people.find(p => p.id === id));
    return paint();
  }
  if (a === 'back') {
    const back = pick.game ? 'gm-choose-' + pick.game.id : 'gm-person-' + pick.people[0].id;
    pick = null; msg = null;
    return paint(back);
  }
  if (a === 'end') { asking = id; return paint('gm-endyes-' + id); }
  if (a === 'keep') { asking = null; return paint('gm-end-' + id); }
  if (a === 'end-yes') {
    const res = await api(API + 'games/' + id, 'DELETE');
    msg = res.status === 204 || res.status === 404 ? null : refusal(res);
    asking = null;
    return loadGames();
  }
  if (a === 'practice') {
    const res = await api(API + 'games/practice', 'POST', {});
    if (res.status === 201) return location.assign('table.html?game=' + res.data.id);
    msg = refusal(res);
    return paint();
  }
  if (a === 'deck' && !busy) {
    busy = true; msg = null; paint();
    const res = pick.game
      ? await api(API + 'games/' + pick.game.id + '/deck', 'POST', { deck: id })
      : await api(API + 'games', 'POST', { opponents: pick.people.map(p => p.id), pod: pick.pod, deck: id });
    busy = false;
    if (res.status === 200 || res.status === 201) {
      localStorage.setItem(LAST_DECK, id);
      return location.assign('table.html?game=' + (pick.game ? pick.game.id : res.data.id));
    }
    if (res.status === 404 && pick.game) { msg = 'gmGone'; return loadGames(); } // someone ended it meanwhile
    msg = refusal(res);
    paint();
  }
}
