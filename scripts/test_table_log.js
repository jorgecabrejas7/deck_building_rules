// Every game-log entry type renders as a full sentence in es and en, for the viewer and for the other player.
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const { L, fill } = await import('../app/js/i18n.js');
const { line, logHtml } = await import('../app/js/table/log.js');

const c = (zone, name) => ({ seat: 1, zone, ...(name ? { name } : {}) });
const E = [
  { type: 'move', cards: [c('library', 'Island')], to: { seat: 1, zone: 'hand' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('hand', 'Island')], to: { seat: 1, zone: 'battlefield' }, pos: null, face_down: true, shuffle: false },
  { type: 'move', cards: [c('battlefield', 'Sol Ring')], to: { seat: 2, zone: 'battlefield' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [{ seat: 2, zone: 'battlefield', name: 'Sol Ring' }], to: { seat: 1, zone: 'battlefield' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('battlefield', 'Sol Ring')], to: { seat: 1, zone: 'battlefield' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('graveyard', 'X')], to: { seat: 1, zone: 'battlefield' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('library'), c('library'), c('library')], to: { seat: 1, zone: 'graveyard' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('hand')], to: { seat: 1, zone: 'graveyard' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('battlefield', 'A'), c('battlefield', 'B')], to: { seat: 1, zone: 'graveyard' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('battlefield', 'A')], to: { seat: 2, zone: 'exile' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('battlefield', 'A')], to: { seat: 1, zone: 'hand' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('battlefield', 'A')], to: { seat: 1, zone: 'command' }, pos: null, face_down: false, shuffle: false },
  { type: 'move', cards: [c('hand')], to: { seat: 1, zone: 'library' }, pos: 'top', face_down: false, shuffle: false },
  { type: 'move', cards: [c('hand')], to: { seat: 2, zone: 'library' }, pos: 'bottom', face_down: false, shuffle: false },
  { type: 'move', cards: [c('hand', 'Approach')], to: { seat: 1, zone: 'library' }, pos: 7, face_down: false, shuffle: false },
  { type: 'move', cards: [c('hand'), c('hand')], to: { seat: 2, zone: 'library' }, pos: 3, face_down: false, shuffle: false },
  { type: 'move', cards: [c('library', 'Tutor')], to: { seat: 1, zone: 'library' }, pos: 'top', face_down: false, shuffle: true },
  { type: 'tap', tapped: true, cards: [c('battlefield', 'A')] }, { type: 'tap', tapped: false, cards: [c('battlefield', 'A')] },
  { type: 'transform', flipped: true, cards: [c('battlefield', 'A')] }, { type: 'transform', flipped: false, cards: [c('battlefield', 'A'), c('battlefield', 'B')] }, { type: 'transform', flipped: true, cards: [c('battlefield'), c('battlefield')] },
  { type: 'untap_all', target: 1 },
  { type: 'flip', face_down: true, cards: [c('battlefield', 'A')] }, { type: 'flip', face_down: false, cards: [c('exile', 'A')] },
  { type: 'counter', card: c('battlefield', 'A'), name: '+1/+1', delta: 2, value: 2 }, { type: 'counter', card: c('battlefield', 'A'), name: 'loyalty', delta: -1, value: 3 },
  { type: 'token', target: 1, name: 'Goblin', count: 2 }, { type: 'token', target: 1, name: 'Food', count: 1 },
  { type: 'delete', card: c('battlefield', 'Goblin') },
  { type: 'attach', card: c('battlefield', 'Helm'), host: c('battlefield', 'Angel') }, { type: 'attach', card: c('battlefield', 'Helm'), host: null },
  { type: 'look', cards: [c('library', 'A'), c('library', 'B')] }, { type: 'reveal', cards: [c('hand', 'A')] },
  { type: 'shuffle', target: 1 }, { type: 'shuffle', target: 2 },
  { type: 'mulligan', n: 6 },
  { type: 'life', target: 2, delta: -3, life: 37 }, { type: 'life', target: 1, delta: 2, life: 42 },
  { type: 'cmd_damage', target: 2, from: 1, commander: 'Atraxa', delta: 3, value: 3 }, { type: 'cmd_damage', target: 1, from: 2, commander: 'Atraxa', delta: -1, value: 0 },
  { type: 'out', out: true }, { type: 'out', out: false },
  { type: 'roll', sides: 20, result: 14 }, { type: 'roll', sides: 2, result: 1 },
  { type: 'pass_turn', target: 2, prev: 1, draw: true, cards: [{ seat: 2, zone: 'library', name: 'Forest' }] }, { type: 'pass_turn', target: 2, prev: 1, draw: false, cards: [] },
  { type: 'pass_turn', target: 1, prev: 2, draw: true, cards: [{ seat: 1, zone: 'library' }] },
  ...['move', 'tap', 'transform', 'untap_all', 'flip', 'counter', 'token', 'delete', 'attach', 'life', 'cmd_damage', 'out', 'pass_turn'].map((u) => ({ type: 'undo', undone: u })),
];
const errs = [], types = new Set();
for (const lang of ['es', 'en']) for (const you of [1, 2]) {
  const t = L[lang], view = { you, players: { 1: { name: 'admin' }, 2: { name: 'tester' } }, turn: { seat: 2, number: 2 } };
  E.forEach((e, i) => {
    types.add(e.type);
    const s = line({ seq: i, turn: 1, seat: 1, ...e }, view, t);
    if (!s || /%[a-z]|⟦|undefined/.test(s)) errs.push(`${lang} you=${you} ${e.type}: ${s}`);
  });
  const ctl = /control/, [give, steal, same] = [2, 3, 4].map((i) => line({ seq: i, turn: 1, seat: 1, ...E[i] }, view, t));
  if (!ctl.test(give) || !ctl.test(steal) || ctl.test(same)) errs.push(`${lang} you=${you}: control change sentences: ${give} | ${steal} | ${same}`);
  view.log = E.map((e, i) => ({ seq: i, turn: i < 20 ? 1 : 2, seat: 1 + (i % 2), ...e }));
  if (!logHtml(view, t).includes(fill(t.tbTurnN, { n: 1 }))) errs.push(`${lang}: no turn heading`);
}
// four players: the commander sentence says whose commander it was; headings come from `prev`, not a guess
const four = { you: 3, players: { 1: { name: 'ana' }, 2: { name: 'ben' }, 3: { name: 'cy' }, 4: { name: 'di' } }, turn: { seat: 4, number: 3 } };
const pass = (turn, prev, target) => ({ seq: turn, turn, seat: prev, type: 'pass_turn', target, prev, draw: false, cards: [] });
const cmd = { type: 'cmd_damage', target: 1, from: 4, commander: 'Atraxa', delta: 2, value: 2 };
for (const lang of ['es', 'en']) {
  const t = L[lang];
  const said = line({ seq: 1, turn: 1, seat: 2, ...cmd }, four, t);
  if (!said.includes('Atraxa</b> (<b>di</b>)') || !line({ seq: 1, turn: 1, seat: 2, ...cmd, from: 3 }, four, t).includes(`(${t.lgYouLow})`)) errs.push(`${lang} 4p cmd_damage: ${said}`);
  four.log = [{ seq: 0, turn: 1, seat: 1, type: 'roll', sides: 6, result: 3 }, pass(2, 1, 3), pass(3, 3, 4), { seq: 9, turn: 3, seat: 2, type: 'out', out: true }];
  const html = logHtml(four, t);
  for (const [n, s] of [[1, 'ana'], [2, t.lgYouLow], [3, 'di']]) if (!html.includes(`<h3>${fill(t.tbTurnOf, { n, s })}</h3>`)) errs.push(`${lang} 4p heading of turn ${n}: ${html}`);
  const outs = [line(four.log[3], four, t), line({ ...four.log[3], seat: 3 }, four, t), line({ ...four.log[3], out: false }, four, t)];
  if (outs.some((x) => !x || /%[a-z]|undefined/.test(x)) || new Set(outs).size !== 3) errs.push(`${lang} out sentences: ${outs}`);
}
const all = ['move', 'tap', 'transform', 'untap_all', 'flip', 'counter', 'token', 'delete', 'attach', 'look', 'reveal', 'shuffle', 'mulligan', 'life', 'cmd_damage', 'out', 'roll', 'pass_turn', 'undo'];
for (const k of all) if (!types.has(k)) errs.push(`no sample for ${k}`);
errs.forEach((e) => console.error(e));
console.log(errs.length ? `table log: ${errs.length} problem(s)` : `table log ok: ${E.length} entries in es and en`);
process.exit(errs.length ? 1 : 0);
