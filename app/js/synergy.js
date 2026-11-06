// EDHREC per-commander synergy data. json.edhrec.com serves static JSON with
// Access-Control-Allow-Origin:* — reachable directly from the browser, no proxy.
// Each cardview carries `synergy` (how much more often the card shows up in
// THIS commander's decks vs the format baseline) plus inclusion counts.
// The commander's average deck comes from the same place, in the same way.
// Pure data module, no DOM. Cached in localStorage per commander slug.
import { parseAverage } from './engine/average.js';

const SYNERGY_PREFIX = 'pdc_syn_v1:';
const AVERAGE_PREFIX = 'pdc_avg_v1:';
const TTL_MS = 7 * 864e5; // 7 days — synergy tables move slowly

// EDHREC slug: front face, lowercase, accents stripped, punctuation dropped.
export function edhrecSlug(name) {
  return name.split(' // ')[0].toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/["'’,.:!?()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readCache(prefix, slug) {
  try {
    const raw = JSON.parse(localStorage.getItem(prefix + slug));
    if (raw && Date.now() - raw._ts < TTL_MS) return raw;
  } catch (e) { /* corrupt/absent entry: refetch */ }
  return null;
}
function writeCache(prefix, slug, data) {
  try { localStorage.setItem(prefix + slug, JSON.stringify({ _ts: Date.now(), ...data })); } catch (e) { /* quota: run uncached */ }
}

// null = no EDHREC page for this slug (404); throws on network/server errors.
async function fetchJson(path) {
  const res = await fetch('https://json.edhrec.com/pages/' + path + '.json');
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error('EDHREC ' + res.status);
  return res.json();
}

async function fetchSynergy(slug) {
  const data = await fetchJson('commanders/' + slug);
  if (!data) return null;
  const lists = (((data.container || {}).json_dict || {}).cardlists) || [];
  const cards = [];
  for (const cl of lists) {
    for (const cv of cl.cardviews || []) {
      if (!cv.name || typeof cv.synergy !== 'number') continue;
      cards.push({ n: cv.name, s: cv.synergy, nd: cv.num_decks || 0, pd: cv.potential_decks || 0 });
    }
  }
  // EDHREC answers 200 with an empty body for a pair it has no page for
  return cards.length ? { cards } : null;
}

// The first page EDHREC has for the commander(s), or null. Partner pairs get a combined
// page on EDHREC; try both orders before falling back to the first commander alone.
async function firstPage(commanders, prefix, fetchPage) {
  const names = (commanders || []).filter(Boolean);
  if (!names.length) return null;
  const slugs = [];
  if (names.length >= 2) {
    const a = edhrecSlug(names[0]), b = edhrecSlug(names[1]);
    slugs.push(a + '-' + b, b + '-' + a);
  }
  slugs.push(edhrecSlug(names[0]));
  for (const slug of slugs) {
    const hit = readCache(prefix, slug);
    if (hit) {
      if (hit.missing) continue;
      return { slug, ...hit };
    }
    const page = await fetchPage(slug);
    if (page === null) { writeCache(prefix, slug, { missing: true }); continue; }
    writeCache(prefix, slug, page);
    return { slug, ...page };
  }
  return null;
}

// Synergy table for the deck's commander(s): {slug, cards:[{n,s,nd,pd}]} or null.
export const getSynergy = (commanders) => firstPage(commanders, SYNERGY_PREFIX, fetchSynergy);

// Average deck for the commander(s), as parseAverage reads it, or null.
export const getAverage = (commanders) => firstPage(commanders, AVERAGE_PREFIX, async (slug) => {
  const data = await fetchJson('average-decks/' + slug);
  return data && parseAverage(data);
});
