// The token dataset (data/tokens.json, built by scripts/fetch_tokens.py): loaded once and on demand, indexed by oracle id.
// A table card carries `ref` (the oracle id); tokenInfo gives it the shape of a cached Scryfall card, so board.js draws it like any permanent.
const COLOUR = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const byRef = new Map(), infos = new Map();
let list = [], keys = [], names = [], status = 'idle'; // idle | loading | ready | failed

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const image = (e, size) => e.a ? (size === 'art_crop' ? e.a : e.f) : `https://cards.scryfall.io/${size}/front/${e.i[0]}/${e.i[1]}/${e.i}.jpg`;

export const tokensReady = () => status === 'ready';
export const tokensFailed = () => status === 'failed';
export const tokenCount = () => list.length;
export const tokenOf = (ref) => byRef.get(ref);

// a promise when this call starts the load; nothing while it is under way or done. A failed load is retried only on `retry`
export function loadTokens(retry = false) {
  if (status === 'loading' || status === 'ready' || (status === 'failed' && !retry)) return;
  status = 'loading';
  return fetch('../data/tokens.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((rows) => {
    list = rows;
    // each word of a query must start a word of: name, type line, P/T, colours
    keys = rows.map((e) => ' ' + fold([e.n, e.t, e.p != null && `${e.p}/${e.h}`, ...[...e.c].map((k) => COLOUR[k])].filter(Boolean).join(' ')));
    names = rows.map((e) => ' ' + fold(e.n));
    for (const e of rows) byRef.set(e.o, e);
    status = 'ready';
  }).catch(() => { status = 'failed'; });
}

export function findTokens(q) {
  const all = fold(q).trim(), words = all.split(/\s+/).filter(Boolean).map((w) => ' ' + w);
  const rank = (k) => names[k] === ' ' + all ? 0 : names[k].startsWith(words[0]) ? 1 : words.every((w) => names[k].includes(w)) ? 2 : 3; // name matches lead
  return list.map((e, k) => k).filter((k) => words.every((w) => keys[k].includes(w))).sort((x, y) => rank(x) - rank(y) || x - y).map((k) => list[k]);
}

export function tokenInfo(ref) {
  const e = byRef.get(ref);
  if (!e) return undefined;
  if (!infos.has(ref)) infos.set(ref, { type_line: e.t, colors: [...e.c], power: e.p ?? null, toughness: e.h ?? null, loyalty: null, img_art: image(e, 'art_crop'), img_normal: image(e, 'normal'), img_small: image(e, 'normal') });
  return infos.get(ref);
}
