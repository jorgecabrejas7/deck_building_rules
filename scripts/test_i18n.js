// Both languages must carry the same strings and placeholders; fill and the missing-key marker must behave.
import fs from 'node:fs';
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const rules = fs.readFileSync(new URL('../rules/pod_rules.json', import.meta.url), 'utf8');
globalThis.fetch = async () => new Response(rules);
const { L, T, fill } = await import('../app/js/i18n.js');

const errs = [];
const holes = (s) => [...new Set(String(s).match(/%[a-zA-Z]+/g) || [])].sort().join();
const walk = (a, b, path) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = path + k;
    if (!(k in a) || !(k in b)) { errs.push(`${p}: missing in ${k in a ? 'en' : 'es'}`); continue; }
    if (typeof a[k] === 'object' && a[k] && typeof b[k] === 'object' && b[k]) walk(a[k], b[k], p + '.');
    else if (typeof a[k] !== typeof b[k]) errs.push(`${p}: type differs`);
    else if (typeof a[k] === 'string' && holes(a[k]) !== holes(b[k])) errs.push(`${p}: placeholders differ (${holes(a[k])} vs ${holes(b[k])})`);
  }
};
walk(L.es, L.en, '');
if (fill('%v a %v', { v: 2 }) !== '2 a 2') errs.push('fill: repeated placeholder');
if (fill('x %v', { v: '$&' }) !== 'x $&') errs.push('fill: $ pattern in value');
if (T().nope !== '⟦nope⟧') errs.push('marker: missing key not shown');
if ('nope' in T()) errs.push('marker: `in` must stay truthful');

errs.forEach((e) => console.error(e));
console.log(errs.length ? `i18n: ${errs.length} problem(s)` : `i18n ok: ${Object.keys(L.es).length} keys in es and en`);
process.exit(errs.length ? 1 : 0);
