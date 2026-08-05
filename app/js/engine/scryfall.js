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

export async function fetchCards(names, cache, onProgress) {
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

export async function fetchCheapest(names, cache, onProgress, isCancelled) {
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

export async function fetchArchidekt(id, useProxy) {
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

export async function suggestCards({ cat, colorIdentity, excludeNames, bannedNames, maxEur = 5, limit = 6 }) {
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
