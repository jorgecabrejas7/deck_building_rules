import { OUT_OF_DECK_RE } from "./decks.js";

// ---- Archidekt deck loading ----
// Archidekt's API whitelists its own origins, so Access-Control-Allow-Origin is
// never ours and the browser can only read it through a CORS proxy.
//
// Two things make this survive the churn of free proxies. A response only
// counts once it parses as a real Archidekt deck, so a proxy that answers 200
// with an error body of its own falls through instead of silently loading an
// empty deck (corsproxy.io started demanding an API key exactly this way). And
// each attempt is time-boxed, so a proxy that has gone dark costs seconds, not
// the whole request.
//
// To stop depending on strangers, deploy tools/cors-worker.js to your own
// Cloudflare account and put it first in this list (see the README).
const PROXIES = [
  // Jina's reader echoes the caller's Origin and, with x-return-format:text,
  // returns the upstream bytes verbatim. No key, 20 requests/minute.
  (u) => ["https://r.jina.ai/" + u, { headers: { "x-return-format": "text" } }],
  (u) => ["https://api.allorigins.win/raw?url=" + encodeURIComponent(u), {}],
  (u) => ["https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u), {}],
];
const PROXY_TIMEOUT_MS = 12000;

async function fetchDeckJson(url) {
  let lastErr = null;
  for (const wrap of PROXIES) {
    const [proxied, opts] = wrap(url);
    try {
      const res = await fetch(proxied, { ...opts, signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
      if (!res.ok) { lastErr = new Error("proxy " + res.status); continue; }
      const data = JSON.parse(await res.text());
      if (!data || !Array.isArray(data.cards)) { lastErr = new Error("proxy returned a non-deck payload"); continue; }
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all proxies failed");
}

export async function fetchArchidekt(id) {
  const data = await fetchDeckJson("https://archidekt.com/api/decks/" + id + "/");
  // Two ways a card sits outside the 100: the owner unticked its category, or
  // it lives in a maybeboard/sideboard. Archidekt ships Sideboard with
  // includedInDeck:true, so the name check is what actually keeps those cards
  // out of the analysis.
  const excluded = new Set((data.categories || [])
    .filter(c => c.includedInDeck === false || OUT_OF_DECK_RE.test(c.name))
    .map(c => c.name));
  const entries = [];
  const commanders = [];
  for (const c of data.cards || []) {
    const cats = c.categories || [];
    if (cats.some(k => excluded.has(k) || OUT_OF_DECK_RE.test(k))) continue;
    const name = (c.card && c.card.oracleCard && c.card.oracleCard.name) || (c.card && c.card.name);
    if (!name) continue;
    entries.push({ name, quantity: c.quantity || 1 });
    if (cats.some(k => /^commander$/i.test(k))) commanders.push(name);
  }
  return { name: data.name || ("Archidekt #" + id), entries, commanders };
}
