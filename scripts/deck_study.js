#!/usr/bin/env node
/**
 * The deck study: runs the app's own engine over the 36 precons, the pod's decks
 * and the cEDH anchors, and writes data/deck_study.json for the app and the report.
 * It answers "what puts a deck inside or outside the pod?" by showing which
 * measures separate the groups (rank AUC: 0.5 = no separation, 1 = perfect).
 *
 * Cards and EDHREC pages come from cache/study_*.json, so a rerun is deterministic
 * and offline once they are filled. Delete those files to refresh.
 * Marks in data/pod_labels.json ({"<deck id>": "in"|"out"}) override the rules verdict.
 *
 * Usage: node scripts/deck_study.js [--metrics]
 *   --metrics prints each power metric's group medians, used to set engine/power.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../app/js/engine/index.js";
import { edhrecSlug } from "../app/js/synergy.js";

// Browsers send these on their own; Scryfall rejects a request without them.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => nodeFetch(url, { ...opts,
  headers: { "User-Agent": "pod-deck-checker", Accept: "application/json", ...opts.headers } });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const CARDS_PATH = path.join(ROOT, "cache", "study_cards.json");
const SYN_PATH = path.join(ROOT, "cache", "study_synergy.json");
const loadJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const RULES = read("rules/pod_rules.json");
const comboDb = read("data/combos.json");
const saltDb = read("data/salt.json");
const cardTags = E.indexCardTags(read("data/card_tags.json"));
const labels = fs.existsSync(path.join(ROOT, "data/pod_labels.json")) ? read("data/pod_labels.json") : {};

// ---- the decks ----
// Wizards' lists tag the reprinted staples by product ("Sol Ring Lorwyn") and use curly apostrophes.
const stapleName = (n) => n.replace(/^(Sol Ring|Arcane Signet|Command Tower) .+$/, "$1").replace(/’/g, "'");
function preconDecks() {
  const dir = path.join(ROOT, "out", "precon_decks");
  const out = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".report.json")).sort()) {
    for (const d of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).decks || [])
      out.push({ id: "precon:" + d.deck_title, name: d.deck_title, group: "precon",
        parsed: { entries: d.cards.map(c => ({ name: stapleName(c.name), quantity: c.quantity })), commanders: [] } });
  }
  return out;
}
const fromText = (d, group) => ({ id: group + ":" + (d.id ?? d.name), name: d.name, group, url: d.url,
  podId: d.id, parsed: E.parseDecklist(d.decklist) });
const decks = [
  ...preconDecks(),
  ...read("data/pod_decks.json").decks.map(d => fromText(d, "pod")),
  ...read("data/anchors_cedh.json").decks.map(d => fromText(d, "cedh")),
];

// ---- cards and prices: the pod's rule is the CHEAPEST printing ----
const cards = loadJson(CARDS_PATH);
const allNames = [...new Set(decks.flatMap(d => d.parsed.entries.map(e => e.name)))];
// Names Scryfall cannot resolve are remembered too, or every rerun would ask again.
const NOT_FOUND_PATH = path.join(ROOT, "cache", "study_not_found.json");
const notFound = new Set(fs.existsSync(NOT_FOUND_PATH) ? JSON.parse(fs.readFileSync(NOT_FOUND_PATH, "utf8")) : []);
const missing = allNames.filter(n => !cards[n] && !notFound.has(n));
if (missing.length) {
  console.log(`fetching ${missing.length} cards ...`);
  const res = await E.fetchCards(missing, cards);
  // fetchCards can resolve a name under a different key and report neither outcome
  for (const n of [...res.notFound, ...missing.filter(m => !cards[m])]) notFound.add(n);
  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards));
  fs.writeFileSync(NOT_FOUND_PATH, JSON.stringify([...notFound].sort(), null, 0));
}
if (notFound.size) console.log(`not on Scryfall: ${[...notFound].join("; ")}`);
const unpriced = allNames.filter(n => cards[n] && cards[n].price >= 1 && !cards[n].cheapest);
if (unpriced.length) {
  console.log(`finding cheapest printing of ${unpriced.length} cards ...`);
  let tick = 0;
  await E.fetchCheapest(unpriced, cards, () => {
    if (++tick % 100 === 0) fs.writeFileSync(CARDS_PATH, JSON.stringify(cards));
  });
  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards));
}

// ---- synergy: same page choice as app/js/synergy.js, cached on disk for reruns ----
const synCache = loadJson(SYN_PATH);
async function pageFor(slug) {
  if (slug in synCache) return synCache[slug];
  await sleep(250);
  const res = await fetch("https://json.edhrec.com/pages/commanders/" + slug + ".json");
  let found = null;
  if (res.ok) {
    const lists = (await res.json()).container?.json_dict?.cardlists || [];
    found = lists.flatMap(l => l.cardviews || []).filter(c => c.name && typeof c.synergy === "number")
      .map(c => ({ n: c.name, s: c.synergy }));
  } else if (res.status !== 404 && res.status !== 403) throw new Error("EDHREC " + res.status + " " + slug);
  synCache[slug] = found && found.length ? found : null;
  return synCache[slug];
}
async function synergyTable(commanders) {
  if (!commanders.length) return null;
  const a = edhrecSlug(commanders[0]);
  const slugs = commanders.length >= 2 ? [a + "-" + edhrecSlug(commanders[1]), edhrecSlug(commanders[1]) + "-" + a, a] : [a];
  for (const slug of slugs) {
    const page = await pageFor(slug);
    if (page) return { slug, cards: page };
  }
  return null;
}

// ---- one deck through the same engine the app uses ----
async function study(d) {
  const resolved = d.parsed.entries.filter(e => cards[e.name]);
  const names = resolved.map(e => e.name);
  const { stats, flagged } = E.computeDeckStats(resolved, cards);
  const commanders = E.pickCommanders(d.parsed, cards);
  const combos = E.activeCombos(E.matchCombos(names, comboDb), commanders);
  const infinite = combos.filter(c => c.infinite);
  stats.combos = infinite.length;
  stats.combo_sizes = infinite.map(c => c.n);
  const ev = E.evaluateDeck(stats, flagged, RULES, names);
  const cardsInfo = resolved.map(e => ({ card: cards[e.name], qty: e.quantity, name: e.name, cls: E.classifyCard(cards[e.name]) }));
  const validation = E.validateDeck(cardsInfo, commanders, cards, []);
  const bracket = E.evaluateBrackets({ stats, flagged, db: cards, validation, commanders, deckNames: names,
    combos, comboDb, loopCards: RULES.hard_bans.banned_cards.extra_turn_recursion });
  const profile = E.computeProfile({ cardsInfo, stats, combos: bracket.combos, commanders, cardTags });
  const salt = E.saltScore(names, saltDb);
  const synergy = E.synergyScore({ cardsInfo, commanders, table: await synergyTable(commanders) });
  const power = E.computePower(profile, stats);
  const verdict = ev.tier === "above" ? "out" : "in";
  return { id: d.id, name: d.name, group: d.group, url: d.url, podId: d.podId, commanders,
    cards: stats.total_cards, missing: d.parsed.entries.length - resolved.length,
    tier: ev.tier, points: ev.points, breakdown: ev.breakdown, violations: ev.violations.map(v => v.id === "conditional" ? v.condId : v.id),
    verdict, label: labels[d.podId] || null, price: stats.total_price_eur, gc: stats.game_changers,
    bracket: { fits: bracket.fits, checklist: bracket.checklist, estimate: bracket.estimate, failed: bracket.failed },
    profile: { ...profile, ledger: undefined }, salt: { total: salt.total, average: salt.average, top: salt.top.slice(0, 3) },
    synergy: synergy.status === "done" ? { coverage: synergy.coverage, average: synergy.average, offPlan: synergy.offPlan } : null,
    power: { score: power.score, raw: power.raw, pillars: power.pillars }, metrics: power.metrics };
}

const results = [];
for (const d of decks) results.push(await study(d));
fs.writeFileSync(SYN_PATH, JSON.stringify(synCache));

// ---- the comparison ----
const median = (xs) => {
  const s = xs.filter(x => typeof x === "number").sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length / 2;
  return Math.round((s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2) * 100) / 100;
};
// Mann-Whitney AUC: the chance a random deck of group B outscores one of group A.
function auc(a, b) {
  const xs = a.filter(x => typeof x === "number"), ys = b.filter(x => typeof x === "number");
  if (!xs.length || !ys.length) return null;
  let wins = 0;
  for (const x of xs) for (const y of ys) wins += y > x ? 1 : y === x ? 0.5 : 0;
  return Math.round(wins / (xs.length * ys.length) * 100) / 100;
}
const MEASURES = {
  power: d => d.power.score,
  pillar_consistency: d => d.power.pillars.consistency,
  pillar_efficiency: d => d.power.pillars.efficiency,
  pillar_interaction: d => d.power.pillars.interaction,
  pillar_wins: d => d.power.pillars.wins,
  salt_total: d => d.salt.total,
  salt_average: d => d.salt.average,
  synergy_coverage: d => d.synergy && d.synergy.coverage,
  synergy_average: d => d.synergy && d.synergy.average,
  manabase_score: d => d.profile.manabase.score,
  manabase_fixing: d => d.profile.manabase.fixing,
  manabase_quality: d => d.profile.manabase.quality,
  fetches: d => d.profile.manabase.fetches,
  lands: d => d.profile.manabase.lands,
  avg_mv: d => d.profile.speed.avgMv,
  cheap_plays: d => d.profile.speed.cheap,
  ramp: d => d.profile.speed.ramp,
  fast_mana: d => d.profile.speed.fastMana,
  draw: d => d.profile.consistency.draw,
  tutors: d => d.profile.consistency.tutors,
  recursion: d => d.profile.consistency.recursion,
  counters: d => d.profile.interaction.counters,
  removal: d => d.profile.interaction.removal,
  wipes: d => d.profile.interaction.wipes,
  cheap_answers: d => d.profile.interaction.cheapAnswers,
  stax: d => d.profile.interaction.stax,
  combos: d => d.profile.wins.combos,
  ending_combos: d => d.profile.wins.ending,
  two_card_ending: d => d.profile.wins.twoCard,
  game_changers: d => d.gc,
  price: d => d.price,
  points: d => d.points,
};
const group = (fn) => results.filter(fn);
const precons = group(d => d.group === "precon");
const pod = group(d => d.group === "pod");
const cedh = group(d => d.group === "cedh");
const podOut = pod.filter(d => (d.label || d.verdict) === "out");
const podIn = pod.filter(d => (d.label || d.verdict) === "in");
const comparisons = Object.entries(MEASURES).map(([key, fn]) => ({ key,
  medians: { precon: median(precons.map(fn)), podIn: median(podIn.map(fn)), podOut: median(podOut.map(fn)), cedh: median(cedh.map(fn)) },
  precon_vs_pod: auc(precons.map(fn), pod.map(fn)),
  podIn_vs_podOut: auc(podIn.map(fn), podOut.map(fn)),
  pod_vs_cedh: auc(pod.map(fn), cedh.map(fn)),
}));

const trimmed = results.map(({ metrics, ...d }) => d);
const out = { salt_updated: saltDb.updated, combos_updated: comboDb.updated, labelled: Object.keys(labels).length,
  groups: { precon: precons.length, podIn: podIn.length, podOut: podOut.length, cedh: cedh.length },
  medians: Object.fromEntries(["precon", "pod", "cedh"].map(g => [g, Object.fromEntries(Object.entries(MEASURES).map(([k, fn]) => [k, median(group(d => d.group === g).map(fn))]))])),
  comparisons, decks: trimmed };
fs.writeFileSync(path.join(ROOT, "data", "deck_study.json"), JSON.stringify(out, null, 1));

if (process.argv.includes("--metrics")) {
  const quant = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))]; };
  for (const k of Object.keys(results[0].metrics)) {
    const of = (l) => l.map(d => d.metrics[k]).filter(x => typeof x === "number");
    console.log(k.padEnd(16), "precon p10", String(quant(of(precons), 0.1)).padEnd(6), "med", String(median(of(precons))).padEnd(6),
      "pod med", String(median(of(pod))).padEnd(6), "cedh med", median(of(cedh)));
  }
}
const line = (d) => `${d.power.score.toFixed(1).padStart(5)}  ${d.tier.padEnd(5)} ${String(d.points).padStart(3)}pts  B${d.bracket.checklist}  salt ${String(d.salt.total).padStart(5)}  syn ${String(d.synergy ? d.synergy.coverage : "-").padStart(3)}  ${d.name.slice(0, 44)}`;
console.log("\n-- pod --");
for (const d of [...pod].sort((a, b) => b.power.score - a.power.score)) console.log(line(d));
console.log("\n-- cEDH anchors --");
for (const d of cedh) console.log(line(d));
const pw = precons.map(d => d.power.score);
console.log(`\nprecons: power min ${Math.min(...pw)} median ${median(pw)} max ${Math.max(...pw)} | cEDH min ${Math.min(...cedh.map(d => d.power.score))}`);
console.log("wrote data/deck_study.json");
