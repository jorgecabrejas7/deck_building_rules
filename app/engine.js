/* ENGINE-START */
// PodEngine: pure logic, no DOM. Mirrors scripts/power_metrics.py + scripts/tier_rules.py —
// keep semantics in lockstep (scripts/test_engine_parity.js checks this against the Python outputs).
const PodEngine = (() => {

const KEYWORD_PATTERNS = {
  tutors: /search your library for a card/i,
  extra_turns: /extra turn/i,
  board_wipes: /destroy all creatures|damage to each creature|each creature (?:gets|is destroyed)/i,
  single_target_removal: /(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|attacking or blocking creature)/i,
  counterspells: /counter target [^.\n]{0,60}?spell/i,
  stax_effects: /players can't|opponents can't|skip (?:your|their) (?:draw|untap|upkeep)|your opponents control enter(?:s)? (?:the battlefield )?tapped|spells? (?:[a-z' ]{0,30})?cost \{\d+\} more to cast|(?:don't|doesn't) untap during (?:their|its controller's)|can't attack (?:you|you or planeswalkers)[^.\n]{0,40}unless/i,
  mass_land_denial: /destroy all lands|search .* library for .* lands? and (?:exile|put)/i,
  free_spells: /without paying its mana cost|rather than pay|\bcascade\b/i,
  card_advantage: /draw (?:a card|two cards|three cards|cards equal to)/i,
  protection_effects: /hexproof|indestructible|protection from/i,
};
const REMINDER_TEXT_RE = /\([^)]*\)/g;
const FAST_MANA_CMC_MAX = 2;
const FAST_MANA_RE = /add (?:\{[wubrgc0-9]\}|one mana|[a-z]+ mana|\$?\d+ mana)/i;

const PRICE_BANDS = [
  ["price_under_1", p => p < 1],
  ["price_1_5", p => p >= 1 && p < 5],
  ["price_5_10", p => p >= 5 && p < 10],
  ["price_10_20", p => p >= 10 && p < 20],
  ["price_20_30", p => p >= 20 && p < 30],
  ["price_30_plus", p => p >= 30],
];

const OPS = {
  ">=": (a, b) => a >= b, "<=": (a, b) => a <= b,
  ">": (a, b) => a > b, "<": (a, b) => a < b, "==": (a, b) => a === b,
};

// ---- deck stats (port of power_metrics.compute_deck_stats) ----
function computeDeckStats(entries, db) {
  const counter = new Map();
  for (const e of entries) counter.set(e.name, (counter.get(e.name) || 0) + e.quantity);

  let totalPrice = 0, maxCardPrice = 0, pricedQty = 0, landQty = 0, basicQty = 0;
  const cmcValues = [];
  const flagged = {};
  for (const k of Object.keys(KEYWORD_PATTERNS)) flagged[k] = [];
  const gameChangers = [], fastMana = [], unpriced = [];
  const priceBands = {};
  for (const [label] of PRICE_BANDS) priceBands[label] = [];

  for (const [name, qty] of counter) {
    const info = db[name] || {};
    const price = info.price;
    if (price !== undefined && price !== null) {
      totalPrice += price * qty;
      maxCardPrice = Math.max(maxCardPrice, price);
      pricedQty += qty;
      for (const [label, test] of PRICE_BANDS) if (test(price)) { priceBands[label].push([name, qty]); break; }
    } else unpriced.push(name);

    const typeLine = info.type_line || "";
    const oracle = (info.oracle_text || "").replace(REMINDER_TEXT_RE, "");
    const cmc = info.cmc;
    const isLand = typeLine.includes("Land");
    if (isLand) {
      landQty += qty;
      if (typeLine.includes("Basic Land")) basicQty += qty;
    } else {
      if (cmc !== undefined && cmc !== null) {
        for (let i = 0; i < qty; i++) cmcValues.push(cmc);
        if (cmc <= FAST_MANA_CMC_MAX && FAST_MANA_RE.test(oracle)) fastMana.push([name, qty]);
      }
    }
    if (info.game_changer) gameChangers.push([name, qty]);
    for (const [label, re] of Object.entries(KEYWORD_PATTERNS)) {
      if (re.test(oracle)) flagged[label].push([name, qty]);
    }
  }

  const totalCards = [...counter.values()].reduce((a, b) => a + b, 0);
  const stats = {
    total_cards: totalCards,
    unique_cards: counter.size,
    total_price_eur: Math.round(totalPrice * 100) / 100,
    max_card_price_eur: Math.round(maxCardPrice * 100) / 100,
    avg_price_per_card: pricedQty ? Math.round(totalPrice / pricedQty * 100) / 100 : null,
    unpriced_cards: unpriced.length,
    unpriced_names: unpriced,
    land_count: landQty,
    basic_land_count: basicQty,
    nonbasic_land_count: landQty - basicQty,
    avg_cmc: cmcValues.length ? Math.round(cmcValues.reduce((a, b) => a + b, 0) / cmcValues.length * 100) / 100 : null,
    game_changers: gameChangers.reduce((s, [, q]) => s + q, 0),
    fast_mana: fastMana.reduce((s, [, q]) => s + q, 0),
  };
  for (const label of Object.keys(KEYWORD_PATTERNS)) stats[label] = flagged[label].reduce((s, [, q]) => s + q, 0);
  for (const [label] of PRICE_BANDS) stats[label] = priceBands[label].reduce((s, [, q]) => s + q, 0);
  flagged.game_changers = gameChangers;
  flagged.fast_mana = fastMana;
  Object.assign(flagged, priceBands);
  return { stats, flagged };
}

// ---- tier evaluation (port of tier_rules.evaluate_deck) ----
// Violations/flags are structured {id, ...params}; the UI localizes them.
function dialPoints(value, spec, overflow) {
  const steps = spec.point_steps || {};
  if (steps[String(value)] !== undefined) return steps[String(value)];
  const keys = Object.keys(steps).map(Number);
  if (keys.length) {
    const last = Math.max(...keys);
    if (value > last) return steps[String(last)] + (value - last) * overflow;
    return 0;
  }
  return (value - spec.baseline_max) * overflow;
}

function comboPoints(sizes, spec) {
  const sizePts = spec.size_points || {};
  const def = spec.default_size_points !== undefined ? spec.default_size_points : 1;
  const priced = sizes.map(s => sizePts[String(s)] !== undefined ? sizePts[String(s)] : def)
    .sort((a, b) => b - a);
  return priced.slice(spec.free_combos || 0).reduce((a, b) => a + b, 0);
}

function evaluateDeck(stats, flagged, rules, cardNames) {
  const violations = [], flags = [];
  let points = 0;
  const breakdown = {};
  const driving = {};
  const names = cardNames ? new Set(cardNames)
    : new Set(Object.values(flagged).flat().map(([n]) => n));

  const bans = rules.hard_bans || {};
  const maxPrice = bans.max_card_price_eur;
  if (maxPrice !== undefined) {
    const over = flagged.price_30_plus || [];
    const deckMax = stats.max_card_price_eur;
    if (over.length || (deckMax !== undefined && deckMax > maxPrice)) {
      violations.push({ id: "price_cap", cap: maxPrice, cards: over.map(([n]) => n), deckMax });
      driving.price_30_plus = over;
    }
  }
  for (const [listName, list] of Object.entries(bans.banned_cards || {})) {
    const hits = list.filter(n => names.has(n)).sort();
    if (hits.length) violations.push({ id: "banned", list: listName, cards: hits });
  }
  // Points never stop: beyond the last priced step, +overflow_per_unit per extra
  // unit. Only "forbidden" dials (mass land denial) violate outright.
  const overflow = rules.overflow_per_unit !== undefined ? rules.overflow_per_unit : 1;
  for (const [dial, spec] of Object.entries(rules.dials)) {
    const value = stats[dial] || 0;
    let pts = 0;
    if (spec.scoring === "per_combo_size") {
      pts = comboPoints(stats.combo_sizes || [], spec);
    } else if (value > spec.baseline_max) {
      pts = dialPoints(value, spec, overflow);
    }
    if (spec.forbidden && value > 0) {
      // Violation AND points: going over pod level never stops the counting.
      violations.push({ id: "dial_forbidden", dial, value });
      driving[dial] = flagged[dial] || [];
    }
    if (pts) {
      points += pts;
      breakdown[dial] = pts;
      if (!driving[dial]) driving[dial] = flagged[dial] || [];
    }
    if (spec.flag_if_over_zero && value > 0) {
      flags.push({ id: spec.flag_if_over_zero, dial, cards: (flagged[dial] || []).map(([n]) => n) });
    }
  }
  for (const cond of rules.conditionals || []) {
    if (cond.type === "penalty") {
      if (cond.if_all.every(t => OPS[t.op](stats[t.dial] || 0, t.value))) {
        points += cond.penalty_points;
        breakdown[cond.id] = cond.penalty_points;
        for (const t of cond.if_all) if (!driving[t.dial]) driving[t.dial] = flagged[t.dial] || [];
      }
      continue;
    }
    const pre = cond.if;
    if (OPS[pre.op](stats[pre.dial] || 0, pre.value)) {
      for (const req of cond.then) {
        const actual = stats[req.dial] || 0;
        if (!OPS[req.op](actual, req.value)) {
          violations.push({ id: "conditional", condId: cond.id, ifDial: pre.dial, ifValue: stats[pre.dial] || 0,
            reqDial: req.dial, reqOp: req.op, reqValue: req.value, actual });
          if (!driving[pre.dial]) driving[pre.dial] = flagged[pre.dial] || [];
          if (!driving[req.dial]) driving[req.dial] = flagged[req.dial] || [];
        }
      }
    }
  }
  const tiers = rules.tiers;
  let tier;
  if (violations.length) tier = "above";
  else if (points <= tiers.tier1.max_points) tier = "tier1";
  else if (points <= tiers.tier2.max_points) tier = "tier2";
  else { tier = "above"; violations.push({ id: "budget", points, max: tiers.tier2.max_points }); }
  return { tier, points, breakdown, violations, flags, driving };
}

// ---- decklist / URL parsing ----
const LINE_RE = /^\s*(\d+)\s*x?\s+(.+?)\s*$/;
const SET_SUFFIX_RE = /\s+\(([A-Za-z0-9]{2,6})\)(\s+[\w-★]+)?(\s+\*[FE]\*)?\s*$/;
const HEADER_RE = /^(commander|deck|mainboard|sideboard|maybeboard|considering|companion|tokens?)s?\s*(\(\d+\))?\s*:?$/i;

function detectInput(text) {
  const t = text.trim();
  let m = t.match(/archidekt\.com\/decks\/(\d+)/i);
  if (m) return { kind: "archidekt", id: m[1] };
  if (/moxfield\.com/i.test(t)) return { kind: "moxfield" };
  return { kind: "list" };
}

function parseDecklist(text) {
  const entries = new Map();
  const commanders = [];
  let section = "main";
  for (let raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const cm = line.match(/^commanders?\s*:\s*(.+)$/i);
    if (cm) { commanders.push(stripLine(cm[1]).name); addEntry(entries, stripLine(cm[1])); continue; }
    const hm = line.match(HEADER_RE);
    if (hm) {
      section = /commander/i.test(hm[1]) ? "commander"
        : /sideboard|maybeboard|considering|token/i.test(hm[1]) ? "skip" : "main";
      continue;
    }
    if (section === "skip") continue;
    const e = stripLine(line);
    if (!e.name) continue;
    if (section === "commander") commanders.push(e.name);
    addEntry(entries, e);
  }
  return { entries: [...entries.entries()].map(([name, quantity]) => ({ name, quantity })), commanders };
}
function stripLine(line) {
  const m = line.match(LINE_RE);
  let qty = 1, name = line;
  if (m) { qty = parseInt(m[1], 10); name = m[2]; }
  name = name.replace(SET_SUFFIX_RE, "").trim();
  return { name, quantity: qty };
}
function addEntry(map, e) { map.set(e.name, (map.get(e.name) || 0) + e.quantity); }

// ---- Scryfall card fetching ----
function cardFromScryfall(c) {
  const faces = c.card_faces && c.card_faces.length ? c.card_faces : null;
  const oracle = c.oracle_text !== undefined && c.oracle_text !== null && c.oracle_text !== ""
    ? c.oracle_text
    : faces ? faces.map(f => f.oracle_text || "").join(" // ") : "";
  const imgs = c.image_uris || (faces && faces[0].image_uris) || {};
  const mana = c.mana_cost !== undefined && c.mana_cost !== "" ? c.mana_cost
    : faces ? (faces[0].mana_cost || "") : "";
  const eur = c.prices && (parseFloat(c.prices.eur) || parseFloat(c.prices.eur_foil)) || null;
  return {
    name: c.name, cmc: c.cmc, mana_cost: mana,
    type_line: c.type_line || (faces ? faces.map(f => f.type_line).join(" // ") : ""),
    oracle_text: oracle,
    colors: c.colors || (faces ? faces.flatMap(f => f.colors || []) : []),
    color_identity: c.color_identity || [],
    price: isNaN(eur) ? null : eur,
    game_changer: !!c.game_changer,
    keywords: c.keywords || [],
    legal_commander: (c.legalities && c.legalities.commander) || "unknown",
    edhrec_rank: c.edhrec_rank || null,
    img_art: imgs.art_crop || "", img_normal: imgs.normal || "", img_small: imgs.small || "",
  };
}

async function fetchCards(names, cache, onProgress) {
  const need = names.filter(n => !cache[n]);
  const notFound = [];
  for (let i = 0; i < need.length; i += 75) {
    const batch = need.slice(i, i + 75);
    if (onProgress) onProgress({ done: i, total: need.length });
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: batch.map(name => ({ name })) }),
    });
    if (!res.ok) throw new Error("Scryfall " + res.status);
    const data = await res.json();
    for (const c of data.data || []) {
      const card = cardFromScryfall(c);
      cache[card.name] = card;
      // also key by requested (possibly front-face) name
      for (const n of batch) {
        if (!cache[n] && (card.name === n || card.name.startsWith(n + " //") || card.name.split(" // ")[0] === n)) cache[n] = card;
      }
    }
    for (const nf of data.not_found || []) notFound.push(nf.name);
    await sleep(120);
  }
  // fuzzy fallback for renamed/flavor cards
  for (const n of [...notFound]) {
    try {
      const res = await fetch("https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(n));
      if (res.ok) {
        cache[n] = cardFromScryfall(await res.json());
        notFound.splice(notFound.indexOf(n), 1);
      }
      await sleep(120);
    } catch (e) { /* keep as not found */ }
  }
  return { notFound };
}

async function fetchCheapest(names, cache, onProgress, isCancelled) {
  const targets = names.filter(n => cache[n] && cache[n].price !== null && cache[n].price >= 1 && !cache[n].cheapest);
  for (let i = 0; i < targets.length; i++) {
    if (isCancelled && isCancelled()) return { done: i, total: targets.length, cancelled: true };
    const n = targets[i];
    if (onProgress) onProgress({ done: i, total: targets.length, card: n });
    try {
      const q = '!"' + n.replace(/"/g, '') + '"';
      const res = await fetch("https://api.scryfall.com/cards/search?unique=prints&order=eur&dir=asc&q=" + encodeURIComponent(q));
      if (res.ok) {
        const data = await res.json();
        let best = null;
        for (const c of data.data || []) {
          for (const p of [parseFloat(c.prices && c.prices.eur), parseFloat(c.prices && c.prices.eur_foil)]) {
            if (!isNaN(p) && (best === null || p < best)) best = p;
          }
        }
        if (best !== null && best < cache[n].price) cache[n].price = best;
      }
      cache[n].cheapest = true;
    } catch (e) { /* leave default price */ }
    await sleep(90);
  }
  if (onProgress) onProgress({ done: targets.length, total: targets.length });
  return { done: targets.length, total: targets.length, cancelled: false };
}

const PROXIES = [
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
];
async function fetchViaProxies(url, opts) {
  let lastErr = null;
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(url), opts);
      if (res.ok) return res;
      lastErr = new Error("proxy " + res.status);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all proxies failed");
}

async function fetchArchidekt(id, useProxy) {
  const api = "https://archidekt.com/api/decks/" + id + "/";
  const res = useProxy ? await fetchViaProxies(api) : await fetch(api);
  if (!res.ok) throw new Error("Archidekt " + res.status);
  const data = await res.json();
  const excluded = new Set((data.categories || []).filter(c => c.includedInDeck === false).map(c => c.name));
  const entries = [];
  const commanders = [];
  for (const c of data.cards || []) {
    const cats = c.categories || [];
    if (cats.some(k => excluded.has(k))) continue;
    const name = (c.card && c.card.oracleCard && c.card.oracleCard.name) || (c.card && c.card.name);
    if (!name) continue;
    entries.push({ name, quantity: c.quantity || 1 });
    if (cats.some(k => /^commander$/i.test(k))) commanders.push(name);
  }
  return { name: data.name || ("Archidekt #" + id), entries, commanders };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- ramp acceleration heuristics ----
function manaProduced(card) {
  const o = (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
  const m = o.match(/add ([^.\n]*)/i);
  if (!m) return 0;
  const seg = m[1];
  const sym = (seg.match(/\{[wubrgc0-9]\}/gi) || []).length;
  if (sym) return sym;
  const words = { one: 1, two: 2, three: 3, four: 4 };
  const wm = seg.match(/\b(one|two|three|four)\b/i);
  if (wm) return words[wm[1].toLowerCase()];
  const dm = seg.match(/(\d+)/);
  return dm ? Math.min(+dm[1], 6) : 1;
}
function isLandRamp(card) {
  const o = (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
  return /search (?:your|their) library for [^.]{0,60}land[^.]{0,80}onto the battlefield/i.test(o);
}

// ---- infinite combos: subset match against the same-origin combo DB ----
// comboDb = data/combos.json ({combos: [[names...], result]}); names are
// front-face names, same normalization as below.
function matchCombos(deckNames, comboDb) {
  const names = new Set(deckNames.map(n => n.split(" // ")[0]));
  const out = [];
  for (const [cards, result] of comboDb.combos) {
    let all = true;
    for (const c of cards) if (!names.has(c)) { all = false; break; }
    if (all) out.push({ cards, n: cards.length, features: [result], infinite: true });
  }
  return out;
}

// ---- infinite combos via Commander Spellbook (CORS-blocked: callers use the proxy) ----
async function fetchCombos(entries, commanders, useProxy) {
  const api = "https://backend.commanderspellbook.com/find-my-combos";
  const opts = { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      main: entries.map(e => ({ card: e.name.split(" // ")[0], quantity: e.quantity })),
      commanders: (commanders || []).map(c => ({ card: c.split(" // ")[0], quantity: 1 })),
    }) };
  const res = useProxy ? await fetchViaProxies(api, opts) : await fetch(api, opts);
  if (!res.ok) throw new Error("spellbook " + res.status);
  const data = await res.json();
  const combos = [];
  for (const c of (data.results && data.results.included) || []) {
    const cards = (c.uses || []).map(u => u.card && u.card.name).filter(Boolean);
    const features = (c.produces || []).map(f => f.feature && f.feature.name).filter(Boolean);
    combos.push({ cards, n: cards.length, features: features.slice(0, 4),
      infinite: features.some(f => /infinite/i.test(f)) });
  }
  return combos;
}

// ---- functional categorization (Archidekt-style, heuristic) ----
const CAT_RULES = [
  ["land", c => c.type_line.includes("Land") && !c.type_line.split(" // ")[0].includes("Creature")],
  ["wipe", c => /destroy all creatures|damage to each creature|each creature (?:gets|is destroyed)|exile all creatures|destroy all (?:other )?(?:nonland )?permanents/i.test(c._o)],
  ["ctr", c => /counter target/i.test(c._o)],
  ["ramp", c => /search (?:your|their) library for (?:a|up to \w+|two)?\s?(?:basic )?lands?\b/i.test(c._o)
      || (!c.type_line.includes("Land") && c.cmc <= 4 && FAST_MANA_RE.test(c._o))
      || /put (?:a|that|those|them|it) (?:land|lands)? ?(?:cards? )?onto the battlefield/i.test(c._o) && /land/i.test(c._o)],
  ["tut", c => /search your library for a card/i.test(c._o)],
  ["rem", c => /(?:destroy|exile) target (?:creature|permanent|artifact|enchantment|planeswalker|attacking or blocking creature)/i.test(c._o)
      || /deals? \d+ damage to (?:target creature|target planeswalker|any target)/i.test(c._o)],
  ["burn", c => /deals? (?:\d+|x) damage to (?:any target|each opponent|target player|target opponent|each player)/i.test(c._o)],
  ["eq", c => /\bEquipment\b/.test(c.type_line) || /\bAura\b/.test(c.type_line)],
  ["drain", c => /each opponent loses \d+ life|opponents? lose (?:\d+|x) life/i.test(c._o) || (/loses? \d+ life/i.test(c._o) && /you gain \d+ life/i.test(c._o))],
  ["sac", c => /sacrifice (?:a|another|two|x) (?:creature|artifact|permanent|token)/i.test(c._o)],
  ["tok", c => /create[sd]? .{0,80}\btokens?\b/i.test(c._o)],
  ["life", c => /(?:you )?gain (?:\d+|x|that much) life|\blifelink\b/i.test(c._o)],
  ["rec", c => /return .{0,60} from your graveyard to (?:your hand|the battlefield)/i.test(c._o)],
  ["prot", c => /hexproof|indestructible|protection from|\bward\b|can't be targeted/i.test(c._o)],
  ["draw", c => /draw (?:a card|two cards|three cards|x cards|cards equal to|that many cards)/i.test(c._o)],
  ["mot", c => /whenever you cast|magecraft|prowess/i.test(c._o)],
  ["anthem", c => /creatures you control get \+/i.test(c._o)],
];

function typeLetter(typeLine) {
  const front = typeLine.split(" // ")[0];
  if (front.includes("Land")) return "L";
  if (front.includes("Creature")) return "C";
  if (front.includes("Planeswalker")) return "P";
  if (front.includes("Instant")) return "I";
  if (front.includes("Sorcery")) return "S";
  if (front.includes("Artifact")) return "A";
  if (front.includes("Enchantment")) return "E";
  if (front.includes("Battle")) return "B";
  return "O";
}

function classifyCard(card) {
  const c = { ...card, _o: (card.oracle_text || "").replace(REMINDER_TEXT_RE, "") };
  const tags = [];
  for (const [key, test] of CAT_RULES) { try { if (test(c)) tags.push(key); } catch (e) {} }
  const primary = tags.length ? tags[0] : (c.type_line.includes("Creature") ? "cre" : "oth");
  return { type: typeLetter(card.type_line || ""), cat: primary, tags };
}

// ---- archetype detection ----
function detectArchetype(cards) {
  // cards: [{card, qty, cls}]
  const n = (fn) => cards.reduce((s, x) => s + (fn(x) ? x.qty : 0), 0);
  const o = (re) => cards.reduce((s, x) => s + (re.test((x.card.oracle_text || "")) ? x.qty : 0), 0);
  const tag = (t) => cards.reduce((s, x) => s + (x.cls.tags.includes(t) ? x.qty : 0), 0);
  const nonland = cards.filter(x => x.cls.type !== "L");
  const nlQty = nonland.reduce((s, x) => s + x.qty, 0) || 1;
  const avgCmc = nonland.reduce((s, x) => s + (x.card.cmc || 0) * x.qty, 0) / nlQty;
  const creLow = n(x => x.cls.type === "C" && (x.card.cmc || 0) <= 3);
  const instSorc = n(x => x.cls.type === "I" || x.cls.type === "S");
  const equipOnly = n(x => /\bEquipment\b/.test(x.card.type_line || ""));
  const scores = {
    voltron: (equipOnly + n(x => /\bAura\b/.test(x.card.type_line || ""))) * 1.5 + tag("prot") * 0.5,
    aristocrats: tag("sac") * 2 + tag("drain") * 2 + o(/whenever .{0,40}(?:dies|is put into a graveyard)/i) * 0.7,
    control: tag("ctr") * 2 + tag("wipe") * 1.5 + (avgCmc > 3 ? 2 : 0),
    tokens: tag("tok") * 1.4,
    aggro: (avgCmc < 2.8 ? creLow * 0.7 : 0) + o(/\bhaste\b/i) * 0.5,
    equipment: equipOnly * 2.5,
    lifegain: tag("life") * 1.2,
    spellslinger: (instSorc >= 22 ? instSorc * 0.4 : 0) + o(/whenever you cast (?:an instant|a sorcery|an instant or sorcery|a noncreature)/i) * 2 + o(/magecraft/i) * 2,
    counters: o(/\+1\/\+1 counter/i) * 0.8 + o(/proliferate/i) * 1.5,
    reanimator: o(/return .{0,60}creature .{0,40}graveyard .{0,20}(?:to the )?battlefield/i) * 2.5 + o(/\bmill\b|discard .{0,30}card/i) * 0.5,
  };
  let best = "generic", bestScore = 11; // threshold: below this, call it generic
  for (const [k, v] of Object.entries(scores)) if (v > bestScore) { best = k; bestScore = v; }
  return { key: best, scores };
}

// ---- deck validation ----
function validateDeck(cards, commanders, db, notFound) {
  const issues = [];
  const total = cards.reduce((s, x) => s + x.qty, 0);
  if (total !== 100) issues.push({ id: "count", total });
  for (const x of cards) {
    if (x.qty > 1) {
      const t = x.card.type_line || "";
      const o = x.card.oracle_text || "";
      if (!t.includes("Basic Land") && !/any number of cards named/i.test(o)) {
        issues.push({ id: "singleton", name: x.card.name, qty: x.qty });
      }
    }
  }
  if (commanders && commanders.length) {
    const ci = new Set();
    for (const cn of commanders) { const c = db[cn]; if (c) for (const col of c.color_identity || []) ci.add(col); }
    if (commanders.every(cn => db[cn])) {
      for (const x of cards) {
        const bad = (x.card.color_identity || []).filter(col => !ci.has(col));
        if (bad.length) issues.push({ id: "identity", name: x.card.name, colors: bad });
      }
    }
  }
  for (const x of cards) {
    if (x.card.legal_commander === "banned") issues.push({ id: "banned_official", name: x.card.name });
  }
  for (const n of notFound || []) issues.push({ id: "not_found", name: n });
  return issues;
}

// ---- commander guess (precon convention: first legendary creature listed) ----
function guessCommander(entries, db) {
  for (const e of entries) {
    const c = db[e.name];
    if (!c) continue;
    const front = (c.type_line || "").split(" // ")[0];
    if (front.includes("Legendary") && (front.includes("Creature") || /can be your commander/i.test(c.oracle_text || ""))) return e.name;
  }
  return null;
}

// ---- what-if: recompute tier/points with one card removed ----
function whatIfCut(entries, db, rules, cardName) {
  const rest = entries.filter(e => e.name !== cardName);
  const { stats, flagged } = computeDeckStats(rest, db);
  const res = evaluateDeck(stats, flagged, rules, rest.map(e => e.name));
  return { points: res.points, tier: res.tier, violations: res.violations.length };
}

// ---- suggestion engine: live Scryfall (EDHREC-ranked) with curated fallback ----
const SUGGEST_QUERIES = {
  ramp: "otag:ramp", draw: "otag:draw", rem: "otag:removal", wipe: "otag:board-wipe",
  prot: "otag:protection", ctr: "otag:counterspell", tut: "otag:tutor",
  sac: "otag:sacrifice-outlet", drain: "otag:life-drain",
  tok: 'o:"create" o:"token"', mot: "otag:cast-trigger",
  eq: "(t:equipment or t:aura)", life: "otag:lifegain", rec: "otag:reanimate",
  anthem: "otag:anthem", burn: "otag:burn",
};
// Curated budget staples per category (fallback when Scryfall search fails).
// [name, colorIdentity string ("" = colorless)]
const CURATED_SUGGESTIONS = {
  ramp: [["Sol Ring",""],["Arcane Signet",""],["Fellwar Stone",""],["Cultivate","G"],["Kodama's Reach","G"],["Rampant Growth","G"],["Farseek","G"],["Wayfarer's Bauble",""],["Mind Stone",""],["Solemn Simulacrum",""]],
  draw: [["Night's Whisper","B"],["Sign in Blood","B"],["Read the Bones","B"],["Harmonize","G"],["Fact or Fiction","U"],["Brainstorm","U"],["Skullclamp",""],["Guardian Project","G"],["Phyrexian Arena","B"],["Mentor of the Meek","W"]],
  rem: [["Swords to Plowshares","W"],["Path to Exile","W"],["Beast Within","G"],["Chaos Warp","R"],["Generous Gift","W"],["Feed the Swarm","B"],["Anguished Unmaking","WB"],["Putrefy","BG"],["Terminate","BR"],["Rapid Hybridization","U"]],
  wipe: [["Blasphemous Act","R"],["Day of Judgment","W"],["Fumigate","W"],["Languish","B"],["Shatter the Sky","W"],["Crux of Fate","B"],["Hour of Reckoning","W"],["Ezuri's Predation","G"]],
  prot: [["Swiftfoot Boots",""],["Lightning Greaves",""],["Heroic Intervention","G"],["Boros Charm","WR"],["Malakir Rebirth","B"],["Snakeskin Veil","G"],["Ghostly Prison","W"],["Propaganda","U"]],
  ctr: [["Counterspell","U"],["Negate","U"],["Swan Song","U"],["Arcane Denial","U"],["Dovin's Veto","WU"],["An Offer You Can't Refuse","U"]],
  tut: [["Diabolic Tutor","B"],["Solve the Equation","U"],["Idyllic Tutor","W"],["Sylvan Tutor","G"],["Gamble","R"]],
  sac: [["Viscera Seer","B"],["Carrion Feeder","B"],["Ashnod's Altar",""],["Phyrexian Altar",""],["Goblin Bombardment","R"],["Woe Strider","B"]],
  drain: [["Blood Artist","B"],["Zulaport Cutthroat","B"],["Cruel Celebrant","WB"],["Bastion of Remembrance","B"],["Suture Priest","W"],["Marauding Blight-Priest","B"]],
  tok: [["Ministrant of Obligation","W"],["Hordeling Outburst","R"],["Spectral Procession","W"],["Dreadhorde Invasion","B"],["Saproling Migration","G"],["Talrand, Sky Summoner","U"]],
  mot: [["Guttersnipe","R"],["Electrostatic Field","R"],["Archmage Emeritus","U"],["Storm-Kiln Artist","R"],["Young Pyromancer","R"]],
  eq: [["Swiftfoot Boots",""],["Colossus Hammer",""],["Blackblade Reforged",""],["All That Glitters","W"],["Ancestral Mask","G"],["Bonesplitter",""]],
  life: [["Soul Warden","W"],["Soul's Attendant","W"],["Prosperous Innkeeper","G"],["Impassioned Orator","W"],["Epicure of Blood","B"]],
  rec: [["Animate Dead","B"],["Dread Return","B"],["Victimize","B"],["Unburial Rites","WB"],["Eternal Witness","G"],["Regrowth","G"]],
  anthem: [["Glorious Anthem","W"],["Intangible Virtue","W"],["Shared Animosity","R"],["Beastmaster Ascension","G"]],
  burn: [["Lightning Bolt","R"],["Chandra's Ignition","R"],["Fiery Cannonade","R"],["Pyrite Spellbomb",""]],
};

function ciFits(cardCi, deckCi) {
  return [...cardCi].every(c => deckCi.has(c));
}

async function suggestCards({ cat, colorIdentity, excludeNames, bannedNames, maxEur = 5, limit = 6 }) {
  const deckCi = new Set(colorIdentity && colorIdentity.length ? colorIdentity : []);
  const excl = new Set(excludeNames || []);
  const ban = new Set(bannedNames || []);
  const base = SUGGEST_QUERIES[cat];
  if (base) {
    try {
      const id = deckCi.size ? [...deckCi].join("") : "c";
      const q = base + " f:commander eur<" + maxEur + " id<=" + id + " -t:land order:edhrec";
      const res = await fetch("https://api.scryfall.com/cards/search?unique=cards&q=" + encodeURIComponent(q));
      if (res.ok) {
        const data = await res.json();
        const out = [];
        for (const raw of data.data || []) {
          const c = cardFromScryfall(raw);
          if (excl.has(c.name) || ban.has(c.name) || c.game_changer) continue;
          if (c.legal_commander === "banned") continue;
          out.push(c);
          if (out.length >= limit) break;
        }
        if (out.length) return { cards: out, source: "live" };
      }
    } catch (e) { /* fall through to curated */ }
  }
  const curated = (CURATED_SUGGESTIONS[cat] || [])
    .filter(([n, ci]) => !excl.has(n) && !ban.has(n) && ciFits(ci, deckCi))
    .slice(0, limit)
    .map(([n]) => ({ name: n, price: null, img_art: "", img_normal: "" }));
  return { cards: curated, source: "curated" };
}

// ---- selftest (mirrors tier_rules.py --selftest) ----
function _fake(over, flaggedOver, names) {
  const dials = ["game_changers","extra_turns","tutors","stax_effects","counterspells","board_wipes",
    "free_spells","fast_mana","mass_land_denial","combos","price_1_5","price_10_20","price_20_30","price_30_plus"];
  const stats = {}; for (const d of dials) stats[d] = 0;
  stats.max_card_price_eur = 5.0;
  Object.assign(stats, over);
  const flagged = {}; for (const d of dials) flagged[d] = [];
  Object.assign(flagged, flaggedOver || {});
  return [stats, flagged, names || null];
}

function runSelfTest(rules) {
  const cases = [
    ["stock precon", _fake({ board_wipes: 2, fast_mana: 6, free_spells: 1 }), "tier1"],
    ["one game changer only", _fake({ game_changers: 1 }), "tier1"],
    ["gc + 5th board wipe = 3pts", _fake({ game_changers: 1, board_wipes: 5 }), "tier2"],
    ["5 counterspells still precon", _fake({ counterspells: 5 }), "tier1"],
    ["20 cards of 1-5 EUR = 1pt", _fake({ price_1_5: 20 }), "tier1"],
    ["25 cards of 1-5 EUR = 2+1 overflow = 3pts", _fake({ price_1_5: 25 }), "tier2"],
    ["31 EUR card", _fake({ max_card_price_eur: 31.0 }, { price_30_plus: [["Pricy", 1]] }), "above"],
    ["two game changers = 2+1 overflow = 3pts", _fake({ game_changers: 2 }), "tier2"],
    ["three tutors = 5+1 overflow = 6pts", _fake({ tutors: 3 }), "tier2"],
    ["five tutors = 5+3 = 8pts busts budget", _fake({ tutors: 5 }), "above"],
    ["two extra turns = 3+1 = 4pts", _fake({ extra_turns: 2 }), "tier2"],
    ["two combos free (precon norm)", _fake({ combos: 2, combo_sizes: [2, 3] }), "tier1"],
    ["four 2-card combos = 3+3 = 6pts", _fake({ combos: 4, combo_sizes: [2, 2, 2, 2] }), "tier2"],
    ["combos [2,3,3,3] = 2+2 = 4pts", _fake({ combos: 4, combo_sizes: [2, 3, 3, 3] }), "tier2"],
    ["combo + tutor conditional", _fake({ combos: 1, combo_sizes: [2], tutors: 1 }), "above"],
    ["mass land denial", _fake({ mass_land_denial: 1 }), "above"],
    ["banned fast mana card", _fake({}, null, ["Mana Crypt"]), "above"],
    ["banned turn recursion", _fake({ extra_turns: 1 }, null, ["Nexus of Fate"]), "above"],
    ["tutor + gc conditional", _fake({ tutors: 1, game_changers: 1 }), "above"],
    ["gc + pricey conditional", _fake({ game_changers: 1, price_10_20: 4 }), "above"],
    ["fast mana 9 + free 5 = 1+1+2 penalty pts", _fake({ fast_mana: 9, free_spells: 5 }), "tier2"],
    ["fast mana 12 + free 5 = 4+1+2 pts, top of T2", _fake({ fast_mana: 12, free_spells: 5 }), "tier2"],
    ["fast mana 12 + free 6 = 4+2+2 pts, busted budget", _fake({ fast_mana: 12, free_spells: 6 }), "above"],
    ["fast mana 15 = 6+1 overflow = 7pts", _fake({ fast_mana: 15 }), "tier2"],
    ["budget blowout 2 tutors + 2 pricey", _fake({ tutors: 2, price_20_30: 1 }), "above"],
    ["tier2 spend: 2 pricey 20-30", _fake({ price_20_30: 2 }), "tier2"],
    ["extra turn flagged", _fake({ extra_turns: 1 }), "tier2"],
  ];
  const results = [];
  for (const [label, [stats, flagged, names], expected] of cases) {
    const res = evaluateDeck(stats, flagged, rules, names);
    let pass = res.tier === expected;
    if (label === "extra turn flagged" && !res.flags.length) pass = false;
    results.push({ label, expected, got: res.tier, points: res.points, pass });
  }
  return { pass: results.every(r => r.pass), results };
}

return {
  KEYWORD_PATTERNS, PRICE_BANDS, computeDeckStats, evaluateDeck,
  detectInput, parseDecklist, cardFromScryfall, fetchCards, fetchCheapest, fetchArchidekt,
  classifyCard, typeLetter, detectArchetype, validateDeck, runSelfTest, sleep,
  guessCommander, whatIfCut, suggestCards, CURATED_SUGGESTIONS, SUGGEST_QUERIES, fetchCombos,
  manaProduced, isLandRamp, matchCombos,
};
})();
if (typeof module !== "undefined") module.exports = PodEngine;
/* ENGINE-END */
