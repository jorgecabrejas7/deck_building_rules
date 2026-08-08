import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { BLOCK_MSG, CATS, dialName } from './constants.js';
import { $, esc, archKey, catLabel } from './helpers.js';
import { bindSugPopovers } from './popover.js';
import { buildTip } from '../pipeline.js';
import { compSlots, tagCount } from './comp.js';
import { orderedCuts, powerUpOptions, roomCuts, fetchUpgradeCards, deckColorIdentity, synergyAdvice, UPGRADE_QUERIES } from '../advice.js';

// Compact "why this card" line: rank · price · speed. One glance, no prose.
function whyAdd(c) {
  const parts = [];
  if (c.edhrec_rank) parts.push('EDHREC #' + fmtRank(c.edhrec_rank));
  if (c.price != null) parts.push('€' + c.price);
  if (c.cmc != null && c.cmc <= 2) parts.push('CMC ' + c.cmc);
  return parts.join(' · ');
}
// The over-target line already states "Sobran · v/min–max"; each cut candidate
// only needs its own evidence (play rate), not the slot state repeated.
function whyCut(x) {
  return x.card.edhrec_rank ? 'EDHREC #' + fmtRank(x.card.edhrec_rank) : '';
}
function fmtRank(r) { return r >= 1000 ? Math.round(r / 1000) + 'k' : String(r); }
const frontFace = n => n.split(' // ')[0];

// Suggestion tile: card image + name + why + a direct cut to make room.
// x.why overrides the generic stat line (synergy picks bring their own reason);
// x.cost labels the pod-point price of adding the card; x.cutWhy explains the cut.
function bigSugTile(c, cut, x = {}) {
  const t = T();
  const price = c.price != null ? '€' + c.price : '';
  const img = c.img_normal
    ? '<img src="' + c.img_normal + '" loading="lazy" class="sug-img" alt="">'
    : '<div class="sug-ph">' + esc(c.name) + '</div>';
  return '<div class="sugTile sug-tile" data-img="' + esc(c.img_normal || '') + '" data-name="' + esc(c.name) + '">' + img +
    '<div class="sug-name">' + esc(c.name) +
    (price ? ' <span class="mono chip-price">' + price + '</span>' : '') +
    (x.cost ? ' <span class="mono sug-pts">+' + x.cost + ' pt' + (x.cost > 1 ? 's' : '') + '</span>' : '') + '</div>' +
    '<div class="sug-why">' + esc(x.why || whyAdd(c)) + '</div>' +
    (cut ? '<div class="sug-cut">✂ ' + esc(t.tipsSwap) + ': <b>' + esc(cut.name) + '</b>' +
      (x.cutWhy ? ' <span class="why">(' + esc(x.cutWhy) + ')</span>'
        : cut.card && cut.card.edhrec_rank ? ' <span class="mono">#' + fmtRank(cut.card.edhrec_rank) + '</span>' : '') + '</div>' : '') +
    '</div>';
}

function sugChip(c) {
  const price = c.price != null ? '€' + c.price : '';
  return '<span class="sugTile card-chip" data-img="' + esc(c.img_normal || '') + '" data-name="' + esc(c.name) + '">' +
    '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
    esc(c.name) + (price ? ' <span class="mono chip-price">' + price + '</span>' : '') + '</span>';
}

function tipsKey() {
  return state.result.stats.total_price_eur + '|' + state.result.stats.total_cards + '|' + archKey() + '|' + state.lang + '|' + state.fetchSt + '|' + (state.combosData ? state.combosData.status : '');
}

function retryRow() {
  const t = T();
  return '<div class="sug-retry-row"><span class="note-warn">' + t.tipsCurated + '</span>' +
    '<button data-retry class="btn-accent-sm">' + t.sugRetry + '</button></div>';
}

// Composition slots evaluated against the current deck.
function slotState() {
  const slots = compSlots().map(sl => ({ ...sl, v: tagCount(sl.cat) }));
  return { slots,
    few: slots.filter(sl => sl.v < sl.min && sl.cat !== 'land'),
    many: slots.filter(sl => sl.v > sl.max) };
}

export function renderTips() {
  const t = T(), r = state.result, lang = state.lang, ev = r.evalRes;
  // #tipsMain/#tipsUp/#tipsComp are static shells (index.html); the async ones
  // are aria-live, so swapping their innerHTML announces loading → results.
  if (state.tipsCache && state.tipsCache.key === tipsKey()) {
    $('tipsMain').innerHTML = state.tipsCache.main;
    $('tipsUp').innerHTML = state.tipsCache.up;
    $('tipsComp').innerHTML = state.tipsCache.comp;
    bindTips();
    return;
  }
  // sync skeleton first: verdict + point-shedding cuts (headline only when the
  // deck is over pod level; otherwise collapsed — synergy advice is the default)
  let html = '<h2 class="secT secT-lg">' + t.tipsT + '</h2>' +
    '<div class="tip-note">' + esc(buildTip()) + '</div>';
  const cuts = orderedCuts(r);
  if (cuts.length || ev.violations.length) {
    // headline framing: how many points (and/or violations) stand between the
    // deck and the target level — carried over from the old Poder advice box
    const es = lang === 'es';
    const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
    const need = ev.tier === 'above' ? Math.max(ev.points - t2, 0) : Math.max(ev.points - t1, 0);
    const needTxt = ev.tier === 'above'
      ? (ev.violations.length ? (es ? 'arregla las violaciones' : 'fix the violations') + (need ? ' · −' + need + ' pts' : '') : '−' + need + ' pts')
      : need > 0 ? '−' + need + ' pt' + (need > 1 ? 's' : '') : '';
    const list = '<h3 class="secT">' + (ev.tier === 'above' ? t.advDownPod : t.advDownT1) +
      (needTxt ? ' <span class="mono adv-need">' + needTxt + '</span>' : '') + '</h3>' +
      '<div class="stack-8">' + cuts.slice(0, 10).map((c, i) => {
        const card = cardCache[c.name] || { name: c.name };
        return '<div class="tips-block"><div class="tips-block-head">' +
          '<span class="mono">' + (i + 1) + '.</span>' +
          '<div class="chip-row">' + sugChip({ name: c.name, price: card.price, img_art: card.img_art, img_normal: card.img_normal }) + '</div>' +
          '<span class="mono">' + (c.dPts > 0 ? '−' + c.dPts + ' pts' : '') +
          (c.fixes ? (c.dPts > 0 ? ' · ' : '') + '✕→✓' : '') + '</span></div>' +
          '<div class="up-note">' + esc(dialName(c.dial, lang)) +
          (card.edhrec_rank ? ' · EDHREC #' + fmtRank(card.edhrec_rank) : '') +
          (c.tier !== ev.tier ? ' · ' + (lang === 'es' ? 'te deja en' : 'drops you to') + ' ' + t[c.tier].split(' · ')[0] : '') +
          '</div></div>';
      }).join('') + '</div>' +
      '<div class="adv-note">' + t.advCutOrder + '</div>';
    html += ev.tier === 'above' ? list
      : '<details class="adv-disclosure"><summary>' + t.downToggle + '</summary>' +
        '<div class="adv-disc-body">' + list + '</div></details>';
  }
  $('tipsMain').innerHTML = html;
  $('tipsUp').innerHTML = '<h2 class="secT secT-lg">' + t.synT + '</h2><div class="note-muted">' + t.tipsLoading + '</div>';
  renderCompBrief();
  bindTips();
  fillAsync();
}

function bindTips() {
  bindSugPopovers($('tips'));
  for (const b of $('tips').querySelectorAll('[data-retry]'))
    b.onclick = () => { state.tipsCache = null; renderTips(); };
  // tier-up options fetch lazily, only when the disclosure is first opened
  for (const d of $('tips').querySelectorAll('[data-up-lazy]:not([data-loaded])'))
    d.ontoggle = () => { if (d.open && !d.hasAttribute('data-loaded')) { d.setAttribute('data-loaded', ''); fillUpgrades(d, tipsKey()); } };
}

async function fillAsync() {
  const key = tipsKey();
  const mode = await fillSynergy(key);
  if (mode === 'stale') return;
  if (mode === 'degrade') { await fillCompFull(key); return; }
  if (tipsKey() !== key) return;
  cacheTips(key);
}

function cacheTips(key) {
  state.tipsCache = { key,
    main: $('tipsMain').innerHTML, up: $('tipsUp').innerHTML, comp: $('tipsComp').innerHTML };
}

// ---- the default answer: synergy picks for THIS deck's plan ----
// Returns 'ok' (rendered, cacheable), 'degrade' (fall back to category
// suggestions in #tipsComp) or 'stale' (analysis changed mid-flight).
async function fillSynergy(key) {
  const t = T(), r = state.result, lang = state.lang, es = lang === 'es';
  const { few } = slotState();
  let data = null, failNote = null;
  try {
    data = await synergyAdvice(r, few.map(f => f.cat), 6);
    if (!data) failNote = t.synNoPage;
    else if (!data.picks.length) failNote = t.synNoPicks;
  } catch (e) { failNote = t.synFailNet; }
  const el = $('tipsUp');
  if (!el || tipsKey() !== key) return 'stale';
  let body = '';
  if (failNote) {
    body = '<div class="note-warn">' + esc(failNote) + '</div>' +
      (failNote === t.synFailNet ? '<div class="sug-retry-row"><button data-retry class="btn-accent-sm">' + t.sugRetry + '</button></div>' : '');
  } else {
    const cmdShort = r.commander ? frontFace(r.commander).split(',')[0] : '';
    body += '<div class="up-note">' + esc(es
      ? 'Las cartas que más sinergia tienen con ' + cmdShort + ' según EDHREC, ya filtradas a las reglas del pod (≤€' + RULES.hard_bans.max_card_price_eur + ', sin prohibidas) y a tu presupuesto de puntos.'
      : 'The cards with the most synergy with ' + cmdShort + ' per EDHREC, pre-filtered to pod rules (≤€' + RULES.hard_bans.max_card_price_eur + ', no banned cards) and your points budget.') + '</div>';
    const podBanned = new Set(Object.values(RULES.hard_bans.banned_cards).flat());
    const used = new Set();
    // pair each add with the least plan-relevant unused cut; prefer a same-
    // category swap, but only among the genuinely weak end of the list —
    // never nominate a high-synergy card just because it shares the category
    const pickCut = (pick) => {
      const avail = data.cuts.filter(c => !used.has(c.x.name));
      const sameCat = avail.slice(0, 15).find(c =>
        (c.syn === null || c.syn < 0.05) && (c.x.cls.cat === pick.cls.cat || c.x.cls.tags.includes(pick.cls.cat)));
      const found = sameCat || avail[0] || null;
      if (found) used.add(found.x.name);
      return found;
    };
    body += '<div class="sug-grid">' + data.picks.map(p => {
      const cut = pickCut(p);
      const why = [(es ? 'sinergia +' : 'synergy +') + Math.round(p.synergy * 100) + '%']
        .concat(p.incl !== null ? [es
          ? 'en el ' + Math.round(p.incl * 100) + '% de los mazos de ' + cmdShort
          : 'in ' + Math.round(p.incl * 100) + '% of ' + cmdShort + ' decks'] : [])
        .concat(p.fills ? [t.synCovers + ' ' + CATS[p.fills][lang]] : [])
        .join(' · ');
      const cutWhy = !cut ? '' : podBanned.has(cut.x.name)
        ? (es ? 'prohibida en el pod' : 'banned in the pod')
        : cut.syn === null
          ? (es ? 'poco jugada con ' + cmdShort + ' según EDHREC' : 'rarely played with ' + cmdShort + ' per EDHREC')
          // a positive-synergy cut needs the comparative clause, or "+12%"
          // reads like a reason to KEEP the card
          : (es ? 'sinergia ' : 'synergy ') + (cut.syn >= 0 ? '+' : '') + Math.round(cut.syn * 100) + '%' +
            (cut.syn >= 0 ? ' · ' + t.cutCompare : '');
      return bigSugTile(p.card, cut ? { name: cut.x.name, card: cut.x.card } : null, { why, cost: p.cost, cutWhy });
    }).join('') + '</div>';
  }
  // tier-up advice is opt-in: collapsed, fetched only on demand
  body += '<details class="adv-disclosure" data-up-lazy><summary>' + t.tierUpToggle + '</summary>' +
    '<div class="adv-disc-body" data-up-body><div class="note-muted">' + t.tipsLoading + '</div></div></details>';
  el.innerHTML = '<h2 class="secT secT-lg">' + t.synT + '</h2>' + body;
  bindTips();
  return failNote ? 'degrade' : 'ok';
}

// ---- composition status: honest diagnosis, demoted to a secondary note ----
function renderCompBrief() {
  const t = T(), lang = state.lang, es = lang === 'es', r = state.result;
  const { few, many } = slotState();
  let body = '';
  // canonical composition notation everywhere: "Estado · valor/min–max"
  for (const sl of few)
    body += '<div class="over-line"><b>' + catLabel(sl.cat, lang) + '</b> — <span class="few">' + t.few + '</span> · ' +
      sl.v + '/' + sl.min + '–' + sl.max + '</div>';
  for (const m of many) {
    const cands = r.cardsInfo
      .filter(x => (x.cls.cat === m.cat || x.cls.tags.includes(m.cat)) && x.cls.type !== 'L')
      .sort((a, b) => (b.card.edhrec_rank || 1e9) - (a.card.edhrec_rank || 1e9)).slice(0, 3);
    body += '<div class="over-line"><b>' + catLabel(m.cat, lang) + '</b> — ' + t.many + ' · ' + m.v + '/' + m.min + '–' + m.max +
      ' — ' + t.tipsCutLabel + ': ' +
      cands.map(x => esc(x.name) + (whyCut(x) ? ' <span class="why">(' + esc(whyCut(x)) + ')</span>' : '')).join(' · ') + '</div>';
  }
  if (few.length)
    body += '<div class="up-note">' + (es
      ? 'Las sugerencias de arriba marcadas «' + t.synCovers + ' …» llenan estos huecos con cartas que además hacen sinergia.'
      : 'Suggestions above marked "' + t.synCovers + ' …" fill these gaps with cards that are also synergistic.') + '</div>';
  if (!body) body = '<div class="over-line">' + t.tipsNone + '</div>';
  $('tipsComp').innerHTML = '<h2 class="secT secT-lg">' + t.tipsComp + '</h2>' + body;
}

// ---- degraded path: category suggestions when synergy data is unavailable ----
async function fillCompFull(key) {
  const t = T(), r = state.result, lang = state.lang;
  const { few, many } = slotState();
  const ci = deckColorIdentity(r);
  const inDeck = r.cardsInfo.map(x => x.name);
  const banned = Object.values(RULES.hard_bans.banned_cards).flat();
  const cutPool = roomCuts(r, many.map(m => m.cat), 12);
  let body = '', usedCurated = false, cutIdx = 0;
  for (const sl of few) {
    let sug = { cards: [], source: 'live' };
    try { sug = await PodEngine.suggestCards({ cat: sl.cat, colorIdentity: ci, excludeNames: inDeck, bannedNames: banned }); } catch (e) { usedCurated = true; }
    if (sug.source === 'curated') usedCurated = true;
    body += '<div class="advice-block">' +
      '<div class="advice-head"><b>' + catLabel(sl.cat, lang) + '</b> — <span class="few">' + t.few + '</span> · ' +
      sl.v + '/' + sl.min + '–' + sl.max + '</div>';
    if (sug.cards.length) {
      body += '<div class="sug-grid">' + sug.cards.slice(0, 6).map(c => {
        const cut = cutPool.length ? cutPool[cutIdx++ % cutPool.length] : null;
        return bigSugTile(c, cut);
      }).join('') + '</div>';
    }
    body += '</div>';
  }
  if (usedCurated) body += retryRow();
  const el = $('tipsComp');
  if (!el || tipsKey() !== key) return;
  if (few.length) {
    el.innerHTML = '<h2 class="secT secT-lg">' + t.tipsComp + '</h2>' + body;
    bindTips();
  }
}

// ---- tier-up options (opt-in): concrete cards per open upgrade path ----
async function fillUpgrades(details, key) {
  const t = T(), r = state.result, lang = state.lang, es = lang === 'es';
  const { room, options } = powerUpOptions(r);
  const many = slotState().many;
  const cutPool = roomCuts(r, many.map(m => m.cat), 12);
  let body = '', failed = false, cutIdx = 0;
  if (r.evalRes.tier === 'above') {
    body = '<div class="note-muted">' + (es ? 'Primero baja al nivel del pod (ver arriba).' : 'First get back to pod level (see above).') + '</div>';
  } else if (room <= 0) {
    body = '<div class="note-muted">' + t.tipsUpNone + '</div>';
  } else {
    body += '<div class="up-note">' + esc(t.tipsUpFrame) + '</div>';
    body += '<div class="up-note">' + (es
      ? 'Margen: ' + room + ' pt' + (room !== 1 ? 's' : '') + ' hasta el tope de Tier 2 (≤' + RULES.tiers.tier2.max_points + '). Cartas de <€10 para no tocar las bandas de precio.'
      : 'Headroom: ' + room + ' pt' + (room !== 1 ? 's' : '') + ' to the Tier 2 cap (≤' + RULES.tiers.tier2.max_points + '). Cards under €10 so price bands stay untouched.') + '</div>';
    // paid upgrades are the point of climbing; free dial headroom comes after
    const affordable = options.filter(o => !o.blocked && o.cost <= room && UPGRADE_QUERIES[o.dial]);
    const open = [...affordable.filter(o => o.cost > 0).sort((a, b) => a.cost - b.cost),
      ...affordable.filter(o => o.cost === 0)].slice(0, 3);
    const suggested = [];
    for (const o of open) {
      let cards = [];
      try { cards = await fetchUpgradeCards(o.dial, r, 3, suggested); } catch (e) { failed = true; }
      if (!cards.length) continue;
      suggested.push(...cards.map(c => c.name));
      body += '<div class="advice-block">' +
        '<div class="advice-head"><b>' + esc(dialName(o.dial, lang)) + '</b> — ' +
        '<span class="mono">' + (o.cost === 0 ? t.advFree : '+' + o.cost + ' pt' + (o.cost > 1 ? 's' : '')) + '</span> · ' +
        o.value + ' → ' + (o.value + 1) + '</div>' +
        '<div class="sug-grid">' + cards.map(c => {
          const cut = cutPool.length ? cutPool[cutIdx++ % cutPool.length] : null;
          return bigSugTile(c, cut);
        }).join('') + '</div></div>';
    }
    const comboOpt = options.find(o => o.dial === 'combos');
    if (comboOpt && !comboOpt.blocked && comboOpt.cost <= room) {
      const cmd = r.commander ? frontFace(r.commander) : '';
      body += '<div class="up-note">∞ ' + esc(t.tipsComboHint) + (cmd
        ? ' <a href="https://commanderspellbook.com/search/?q=' + encodeURIComponent('"' + cmd + '"') + '" target="_blank" rel="noopener">Commander Spellbook ↗</a>' : '') + '</div>';
    }
    const blocked = options.filter(o => o.blocked);
    if (blocked.length) {
      body += '<div class="adv-blocked">' + blocked.map(o =>
        '<div class="adv-up-row muted"><span class="adv-lock">🔒</span><span>' + esc(dialName(o.dial, lang)) + ' — ' +
        esc(BLOCK_MSG[o.blocked] ? BLOCK_MSG[o.blocked][lang] : o.blocked) + '</span></div>').join('') + '</div>';
    }
  }
  if (failed) body += retryRow();
  const holder = details.querySelector('[data-up-body]');
  if (!holder || tipsKey() !== key) return;
  if (failed) details.removeAttribute('data-loaded'); // allow another attempt
  holder.innerHTML = body;
  bindTips();
  // keep the cached copy in sync so a re-render doesn't drop the loaded options
  if (!failed && state.tipsCache && state.tipsCache.key === key) cacheTips(key);
}
