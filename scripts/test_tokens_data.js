// data/tokens.json (scripts/fetch_tokens.py): parses, unique by oracle id, sorted, complete, and holds the well-known tokens.
import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync(new URL('../data/tokens.json', import.meta.url), 'utf8'));
const fail = (m) => { console.error('FAIL ' + m); process.exit(1); };
if (!Array.isArray(rows) || rows.length < 500) fail('too few tokens');
const key = (e) => [e.n, e.p || '', e.h || '', e.o];
const seen = new Set();
rows.forEach((e, k) => {
  for (const f of ['o', 'i', 'n', 't']) if (!e[f]) fail(`${e.n || k} lacks ${f}`);
  if (seen.has(e.o)) fail('duplicate ' + e.o);
  seen.add(e.o);
  if (k && key(rows[k - 1]).join('\0') > key(e).join('\0')) fail(`not sorted at ${e.n}`);
});
const has = (n, c, p, h) => rows.some((e) => e.n === n && (c === undefined || e.c === c) && e.p === p && e.h === h);
const need = [['Soldier', 'W', '1', '1'], ['Zombie', 'B', '2', '2'], ['Saproling', 'G', '1', '1'], ['Treasure'], ['Food'], ['Clue']];
for (const [n, ...rest] of need) if (!has(n, ...rest)) fail('missing ' + n);
console.log(`tokens data ok: ${rows.length} tokens, unique, sorted, well-known ones present`);
