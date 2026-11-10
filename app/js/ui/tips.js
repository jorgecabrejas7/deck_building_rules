import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T, fill } from '../i18n.js';
import { BLOCK_MSG, CATS, dialName } from './constants.js';
import { $, esc, archKey, catLabel } from './helpers.js';
import { bindSugPopovers } from './popover.js';
import { addByName, canEdit, removeFromDeck } from '../edits.js';
import { compositionHtml } from './verdict.js';
import { compSlots, tagCount } from './comp.js';
import { orderedCuts, powerUpOptions, roomCuts, fetchUpgradeCards, deckColorIdentity, synergyAdvice, cardAddCost, cardDials, UPGRADE_QUERIES } from '../advice.js';

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

// Suggestion row: art thumb, name, why, and the direct cut that makes room. The full
// card opens on hover or tap, so the art never outweighs the verdict.
function bigSugTile(c, cut, x = {}) {
  const t = T();
  const price = c.price != null ? '€' + c.price : '';
  const dis = canEdit() ? '' : ' disabled';
  return '<div class="sug-tile">' +
    '<span class="sug-thumb sugTile" data-img="' + esc(c.img_normal || '') + '" data-name="' + esc(c.name) + '"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
    '<div class="sug-body"><div class="sug-name">' + esc(c.name) +
    (price ? ' <span class="mono chip-price">' + price + '</span>' : '') + '</div>' +
    '<div class="sug-why">' + esc(x.why || whyAdd(c)) + '</div>' +
    '<div class="sug-act"><button type="button" class="btn-outline sug-btn" data-add-name="' + esc(c.name) + '"' + dis + '>' + esc(t.tipAdd) + '</button></div>' +
    (cut ? '<div class="sug-cut">' + esc(t.tipsSwap) + ': <b>' + esc(cut.name) + '</b>' +
      (x.cutWhy ? ' <span class="why">(' + esc(x.cutWhy) + ')</span>'
        : cut.card && cut.card.edhrec_rank ? ' <span class="mono">#' + fmtRank(cut.card.edhrec_rank) + '</span>' : '') +
      ' <button type="button" class="btn-outline sug-btn" data-cut-name="' + esc(cut.name) + '"' + dis + '>' + esc(t.tipCut) + '</button></div>' : '') +
    '</div></div>';
}

function sugChip(c) {
  const price = c.price != null ? '€' + c.price : '';
  return '<span class="sugTile card-chip" data-img="' + esc(c.img_normal || '') + '" data-name="' + esc(c.name) + '">' +
    '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
    esc(c.name) + (price ? ' <span class="mono chip-price">' + price + '</span>' : '') + '</span>';
}

function tipsKey() {
  return state.result.evalRes.tier + '|' + state.result.evalRes.points + '|' + state.result.stats.total_price_eur + '|' + state.result.stats.total_cards + '|' + archKey() + '|' + state.lang + '|' + state.fetchSt + '|' + (state.combosData ? state.combosData.status : '');
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

// The way back to the budget: rule breaks first, then the cuts that free most points, with
// a running total. Combo points are not freed card by card, so they are stated apart.
function cutPlanHtml(r, t) {
  const ev = r.evalRes, cuts = orderedCuts(r).slice(0, 10), target = ev.tier === 'above' ? RULES.tiers.tier2.max_points : RULES.tiers.tier1.max_points;
  let running = ev.points;
  const rows = cuts.map(c => {
    running = Math.max(running - Math.max(c.dPts, 0), 0);
    const card = cardCache[c.name] || { name: c.name };
    return '<li class="plan-step">' + sugChip({ name: c.name, price: card.price, img_art: card.img_art, img_normal: card.img_normal }) +
      '<span class="plan-after mono">' + (c.dPts > 0 ? '−' + c.dPts + ' → ' + running : esc(t.planFixes)) + '</span></li>';
  }).join('');
  const combo = ev.breakdown.combos || 0;
  return (rows ? '<ol class="plan-list">' + rows + '</ol>' : '') +
    '<p class="note-sm">' + esc(fill(running <= target ? t.planReaches : t.planShort, { v: running, m: target })) +
    (combo ? ' ' + esc(fill(t.planCombos, { v: combo })) : '') + '</p>';
}

// A recognised precon's synergy swaps in order, each with its point effect and the running
// total, up to the pod's budget.
function preconGuideHtml(swaps, tile, t) {
  const r = state.result, start = r.evalRes.points;
  const limit = RULES.tiers.tier2.max_points, t1 = RULES.tiers.tier1.max_points;
  const plan = PodEngine.upgradePlan(swaps, { points: start, limit, stats: r.stats, addCost: cardAddCost, dials: cardDials });
  const cross = start <= t1 ? plan.steps.findIndex(s => s.total > t1) : -1;
  const rows = plan.steps.map((s, i) =>
    (i === cross ? '<li class="precon-tier">' + esc(fill(t.preconTier1, { n: t1 })) + '</li>' : '') +
    '<li class="plan-step precon-step">' + tile(s.pick, s.cut) +
    '<span class="plan-after mono">' + (s.effect < 0 ? '−' + -s.effect : '+' + s.effect) + ' → ' + s.total + '</span></li>').join('');
  return '<p class="note-sm">' + esc(fill(t.preconStart, { v: start, m: limit, n: t1 })) + '</p>' +
    (rows ? '<ol class="plan-list">' + rows + '</ol>' : '') +
    '<p class="note-sm">' + esc(plan.next
      ? fill(t.preconStops, { c: plan.next.card.name, v: plan.next.total, m: limit })
      : fill(t.preconEnds, { v: plan.total, m: limit })) + '</p>';
}

export function renderTips() {
  const t = T(), r = state.result, ev = r.evalRes;
  // #tipsMain/#tipsUp/#tipsComp are static shells (index.html); the async ones
  // are aria-live, so swapping their innerHTML announces loading → results.
  if (state.tipsCache && state.tipsCache.key === tipsKey()) {
    $('tipsMain').innerHTML = state.tipsCache.main;
    $('tipsUp').innerHTML = state.tipsCache.up;
    $('tipsComp').innerHTML = state.tipsCache.comp;
    bindTips();
    return;
  }
  // Over budget: the route back leads. Tier 2: optional, folded. Tier 1: nothing to cut.
  $('tipsMain').innerHTML = ev.tier === 'above'
    ? '<h3 class="secT secT-lg">' + esc(fill(t.planOutT, { v: ev.points })) + '</h3>' + cutPlanHtml(r, t)
    : '<p class="plan-note">' + esc(t['planIn_' + ev.tier]) + '</p>' + (ev.tier === 'tier2'
      ? '<details class="adv-disclosure"><summary>' + esc(t.downToggle) + '</summary><div class="adv-disc-body">' + cutPlanHtml(r, t) + '</div></details>' : '');
  $('tipsUp').innerHTML = '<h3 class="secT secT-lg">' + (r.level.precon ? t.preconT : t.synT) + '</h3><div class="note-muted">' + t.tipsLoading + '</div>';
  renderCompBrief();
  bindTips();
  fillAsync();
}

function bindTips() {
  bindSugPopovers($('tips'));
  for (const b of $('tips').querySelectorAll('[data-add-name]')) b.onclick = () => addByName(b.dataset.addName);
  for (const b of $('tips').querySelectorAll('[data-cut-name]')) b.onclick = () => removeFromDeck([b.dataset.cutName]);
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
  const precon = r.level.precon;
  let data = null, failNote = null;
  try {
    data = await synergyAdvice(r, few.map(f => f.cat), precon ? 10 : 6);
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
      ? 'Las cartas que más sinergia tienen con ' + cmdShort + ' según EDHREC, sin prohibidas ni cartas de más de €' + RULES.hard_bans.max_card_price_eur + '.'
      : 'The cards with the most synergy with ' + cmdShort + ' per EDHREC, leaving out banned cards and anything over €' + RULES.hard_bans.max_card_price_eur + '.') + '</div>';
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
    const tile = (p, cut) => {
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
      return bigSugTile(p.card, cut ? { name: cut.x.name, card: cut.x.card } : null, { why, cutWhy });
    };
    const swaps = data.picks.map(pick => { const cut = pickCut(pick); return { pick, cut, card: pick.card, cutCard: cut && cut.x.card }; });
    if (precon) body += preconGuideHtml(swaps, tile, t);
    else {
      const tiles = swaps.map(s => tile(s.pick, s.cut));
      body += '<div class="sug-grid">' + tiles.slice(0, 3).join('') + '</div>' +
        (tiles.length > 3 ? '<details class="adv-disclosure"><summary>' + esc(fill(t.sugMore, { v: tiles.length - 3 })) + '</summary>' +
          '<div class="adv-disc-body sug-grid">' + tiles.slice(3).join('') + '</div></details>' : '');
    }
  }
  // tier-up advice is opt-in: collapsed, fetched only on demand, and pointless out of the pod
  if (r.evalRes.tier !== 'above') body += '<details class="adv-disclosure" data-up-lazy><summary>' + t.tierUpToggle + '</summary>' +
    '<div class="adv-disc-body" data-up-body><div class="note-muted">' + t.tipsLoading + '</div></div></details>';
  el.innerHTML = '<h3 class="secT secT-lg">' + (precon ? t.preconT : t.synT) + '</h3>' + body;
  bindTips();
  return failNote ? 'degrade' : 'ok';
}

// ---- composition status: honest diagnosis, folded away as quiet polish ----
function renderCompBrief() {
  $('tipsComp').innerHTML = compositionHtml();
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
    el.innerHTML = compositionHtml() + body;
    bindTips();
  }
}

// ---- tier-up options (opt-in): concrete cards per open upgrade path ----
async function fillUpgrades(details, key) {
  const t = T(), r = state.result, lang = state.lang;
  const { options } = powerUpOptions(r);
  const many = slotState().many;
  const cutPool = roomCuts(r, many.map(m => m.cat), 12);
  let body = '', failed = false, cutIdx = 0;
  {
    body += '<div class="up-note">' + esc(t.tipsUpFrame) + '</div>';
    // paid upgrades are the point of climbing; free dial headroom comes after
    const usable = options.filter(o => !o.blocked && UPGRADE_QUERIES[o.dial]);
    const open = [...usable.filter(o => o.cost > 0).sort((a, b) => a.cost - b.cost),
      ...usable.filter(o => o.cost === 0)].slice(0, 3);
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
    if (comboOpt && !comboOpt.blocked) {
      const cmd = r.commander ? frontFace(r.commander) : '';
      body += '<div class="up-note">∞ ' + esc(t.tipsComboHint) + (cmd
        ? ' <a href="https://commanderspellbook.com/search/?q=' + encodeURIComponent('"' + cmd + '"') + '" target="_blank" rel="noopener">Commander Spellbook ↗</a>' : '') + '</div>';
    }
    const blocked = options.filter(o => o.blocked);
    if (blocked.length) {
      body += '<div class="adv-blocked">' + blocked.map(o =>
        '<div class="adv-up-row muted">' + esc(dialName(o.dial, lang)) + ' — ' +
        esc(BLOCK_MSG[o.blocked] ? BLOCK_MSG[o.blocked][lang] : o.blocked) + '</div>').join('') + '</div>';
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
