// The token sheet (the Token bubble): the tokens your deck can make, the ones the other decks can make, those you made lately, or a search of the dataset.
// A tap creates it on the battlefield of the player chosen at the top (you at first) at once and the sheet stays open. Its body is painted here, not rebuilt with the sheet,
// so the focus survives a creation; events are delegated in ../table.js (data-tk, data-step, data-tkadd).
import { tile, esc, others } from './board.js';
import { line } from './log.js';
import { fill } from '../i18n.js';
import { findTokens, tokenOf, tokenCount, tokensReady, tokensFailed } from './tokens.js';

const CAP = 60, RECENT = 8;
const COLOUR = { W: 'tbColW', U: 'tbColU', B: 'tbColB', R: 'tbColR', G: 'tbColG' };
const $ = (id) => document.getElementById(id);
const recent = []; // the refs made through the sheet, latest first
let target = null; // the seat the tokens go to; null is you, and the sheet resets it on opening
export const setTarget = (s) => { target = s; };

export const tokenSheet = (t) => ({
  title: t.tbTokenNew,
  body: `<div class="tk-top"><input class="si" id="tq" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t.tbTkSearch}" aria-label="${t.tbTkSearch}">`
    + `<div class="tk-n" role="group" aria-label="${t.tbTokenCount}"><button class="sb" data-step="-1" aria-label="${t.tbMinus}">−</button>`
    + `<input class="si" id="tn" type="number" value="1" min="1" max="20" inputmode="numeric" aria-label="${t.tbTokenCount}"><button class="sb" data-step="1" aria-label="${t.tbPlus}">+</button></div>`
    + `<div class="tk-made" id="tkmade" role="status"></div></div>`
    + `<div class="tk-for" id="tkfor" role="group" aria-label="${t.tbTkFor}"></div><div id="tkbody"></div><h3><label for="tkc">${t.tbTkCustom}</label></h3>`
    + `<div class="srow"><input class="si" id="tkc" maxlength="100" placeholder="${t.tbTokenName}"><button class="sb on" data-tkadd>${t.tbAdd}</button></div>`,
});

const count = () => Math.min(20, Math.max(1, parseInt($('tn').value, 10) || 1));
export const stepCount = (d) => { $('tn').value = Math.min(20, Math.max(1, count() + d)); };

// "Zombie, 2/2, black, creature, token"
const label = (e, t) => [e.n + (e.p != null ? ` ${e.p}/${e.h}` : ''), ...[...e.c].map((k) => t[COLOUR[k]]), /\bCreature\b/.test(e.t) && t.tbTkCreature, t.tbTkLow].filter(Boolean).join(', ');
// the board's own tile, so a token looks here as it will on the table; the card behind it has no id: nothing to drag or select
const entryTile = (e, t) => {
  const card = { id: '', name: e.n, token: true, ref: e.o, counters: {} };
  const face = tile(card, t, false, [card], true).replace(/^<button/, '<div').replace(/<\/button>$/, '</div>').replace(' data-card=""', '');
  return `<button class="tkt" data-tk="${e.o}"${e.x ? ` title="${esc(e.x)}"` : ''} aria-label="${esc(label(e, t))}">${face}<span class="tkn">${esc(e.n)}</span></button>`;
};

// a titled grid of the tokens the dataset knows among `refs`, by name; an empty one is not drawn
const group = (h, refs, t, sort = true) => {
  const es = refs.map(tokenOf).filter(Boolean);
  return es.length ? `<h3>${h}</h3><div class="tkgrid">${(sort ? es.sort((a, b) => a.n.localeCompare(b.n)) : es).map((e) => entryTile(e, t)).join('')}</div>` : '';
};

export function paintTokens(view, c) {
  const body = $('tkbody');
  if (!body) return;
  const t = c.t, q = $('tq').value, mine = view.players[view.you].tokens || [], keep = body.contains(document.activeElement) && document.activeElement.dataset.tk;
  let h;
  if (tokensFailed()) h = `<p>${t.tbTkFail}</p>`;
  else if (!tokensReady()) h = `<p>${t.tbTkLoading}</p>`;
  else if (!q.trim()) h = group(t.tbTkDeck, mine, t) + group(t.tbTkOthers, [...new Set(others(view).flatMap((s) => view.players[s].tokens || []))].filter((r) => !mine.includes(r)), t) + group(t.tbTkRecent, recent, t, false) + `<p>${fill(t.tbTkHint, { n: tokenCount() })}</p>`;
  else {
    const hits = findTokens(q);
    h = hits.length ? `<div class="tkgrid">${hits.slice(0, CAP).map((e) => entryTile(e, t)).join('')}</div>${hits.length > CAP ? `<p>${t.tbTkMore}</p>` : ''}` : `<p>${t.tbTkNone}</p>`;
  }
  body.innerHTML = h;
  const to = target ?? view.you;
  $('tkfor').innerHTML = [view.you, ...others(view)].map((s) => `<button class="sb${s === to ? ' on' : ''}" data-tkfor="${s}" aria-pressed="${s === to}">${s === view.you ? t.tbYou : esc(view.players[s].name || t.tbOpp)}</button>`).join('');
  const f = keep && body.querySelector(`[data-tk="${keep}"]`);
  if (f) f.focus({ preventScroll: true });
}

// a line under the search says what was made, in the log's own sentence (a toast would hide the search; the line is a live region)
function made(view, c, name, ref) {
  const n = count();
  const seat = target ?? view.you;
  c.send({ type: 'token', seat, name, count: n, ...(ref ? { ref } : {}) });
  $('tkmade').innerHTML = line({ type: 'token', seat, name, count: n }, view, c.t);
}

export function pickToken(ref, view, c) {
  const e = tokenOf(ref);
  if (!e) return;
  made(view, c, e.n, e.o);
  recent.splice(0, recent.length, e.o, ...recent.filter((r) => r !== e.o).slice(0, RECENT - 1));
  paintTokens(view, c);
}

export function pickCustom(view, c) {
  const name = $('tkc').value.trim().slice(0, 100);
  if (!name) return;
  made(view, c, name);
  $('tkc').value = '';
}
