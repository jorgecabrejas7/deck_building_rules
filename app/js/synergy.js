// EDHREC per-commander synergy data. json.edhrec.com serves static JSON with
// Access-Control-Allow-Origin:* — reachable directly from the browser, no proxy.
// Each cardview carries `synergy` (how much more often the card shows up in
// THIS commander's decks vs the format baseline) plus inclusion counts.
// Pure data module, no DOM. Cached in localStorage per commander slug.

const CACHE_PREFIX = 'pdc_syn_v1:';
const TTL_MS = 7 * 864e5; // 7 days — synergy tables move slowly

// EDHREC slug: front face, lowercase, accents stripped, punctuation dropped.
export function edhrecSlug(name) {
  return name.split(' // ')[0].toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/["'’,.:!?()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readCache(slug) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + slug));
    if (raw && Date.now() - raw._ts < TTL_MS) return raw;
  } catch (e) { /* corrupt/absent entry: refetch */ }
  return null;
}
function writeCache(slug, data) {
  try { localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ _ts: Date.now(), ...data })); } catch (e) { /* quota: run uncached */ }
}

// null = no EDHREC page for this slug (404); throws on network/server errors.
async function fetchPage(slug) {
  const res = await fetch('https://json.edhrec.com/pages/commanders/' + slug + '.json');
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error('EDHREC ' + res.status);
  const data = await res.json();
  const lists = (((data.container || {}).json_dict || {}).cardlists) || [];
  const cards = [];
  for (const cl of lists) {
    for (const cv of cl.cardviews || []) {
      if (!cv.name || typeof cv.synergy !== 'number') continue;
      cards.push({ n: cv.name, s: cv.synergy, nd: cv.num_decks || 0, pd: cv.potential_decks || 0 });
    }
  }
  return cards;
}

// Synergy table for the deck's commander(s): {slug, cards:[{n,s,nd,pd}]} or
// null when EDHREC has no page. Partner pairs get a combined page on EDHREC;
// try both orders before falling back to the first commander alone.
export async function getSynergy(commanders) {
  const names = (commanders || []).filter(Boolean);
  if (!names.length) return null;
  const slugs = [];
  if (names.length >= 2) {
    const a = edhrecSlug(names[0]), b = edhrecSlug(names[1]);
    slugs.push(a + '-' + b, b + '-' + a);
  }
  slugs.push(edhrecSlug(names[0]));
  for (const slug of slugs) {
    const hit = readCache(slug);
    if (hit) {
      if (hit.missing) continue;
      return { slug, cards: hit.cards };
    }
    const cards = await fetchPage(slug);
    if (cards === null) { writeCache(slug, { missing: true }); continue; }
    writeCache(slug, { cards });
    return { slug, cards };
  }
  return null;
}
