import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { BLOCK_MSG, dialName } from './constants.js';
import { $, esc, archKey, catLabel } from './helpers.js';
import { bindSugPopovers } from './popover.js';
import { buildTip } from '../pipeline.js';
import { compSlots, tagCount } from './comp.js';
import { orderedCuts, powerUpOptions, roomCuts, fetchUpgradeCards, deckColorIdentity, UPGRADE_QUERIES } from '../advice.js';

// Compact "why this card" line: rank · price · speed. One glance, no prose.
function whyAdd(c) {
  const parts = [];
  if (c.edhrec_rank) parts.push('EDHREC #' + fmtRank(c.edhrec_rank));
  if (c.price != null) parts.push('€' + c.price);
  if (c.cmc != null && c.cmc <= 2) parts.push('CMC ' + c.cmc);
  return parts.join(' · ');
}
function whyCut(x, slot) {
  const parts = [];
  if (x.card.edhrec_rank) parts.push('EDHREC #' + fmtRank(x.card.edhrec_rank));
  if (slot) parts.push(slot.v + '/' + slot.min + '–' + slot.max);
  return parts.join(' · ');
}
function fmtRank(r) { return r >= 1000 ? Math.round(r / 1000) + 'k' : String(r); }

// Suggestion tile: card image + name + compact why + a direct cut to make room.
function bigSugTile(c, cut) {
  const t = T();
  const price = c.price != null ? '€' + c.price : '';
  const img = c.img_normal
    ? '<img src="' + c.img_normal + '" loading="lazy" class="sug-img" alt="">'
    : '<div class="sug-ph">' + esc(c.name) + '</div>';
  return '<div class="sugTile sug-tile" data-img="' + esc(c.img_normal || '') + '">' + img +
    '<div class="sug-name">' + esc(c.name) +
    (price ? ' <span class="mono chip-price">' + price + '</span>' : '') + '</div>' +
    '<div class="sug-why">' + esc(whyAdd(c)) + '</div>' +
    (cut ? '<div class="sug-cut">✂ ' + esc(t.tipsSwap) + ': <b>' + esc(cut.name) + '</b>' +
      (cut.card.edhrec_rank ? ' <span class="mono">#' + fmtRank(cut.card.edhrec_rank) + '</span>' : '') + '</div>' : '') +
    '</div>';
}

export function sugChip(c) {
  const price = c.price != null ? '€' + c.price : '';
  return '<span class="sugTile card-chip" data-img="' + esc(c.img_normal || '') + '">' +
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
  // sync skeleton first: verdict + ordered power-down cuts; async panels fill in
  let html = '<h2 class="secT">' + t.tipsT + '</h2>' +
    '<div class="tip-note">' + esc(buildTip()) + '</div>';
  const cuts = orderedCuts(r);
  if (cuts.length || ev.violations.length) {
    html += '<h3 class="secT secT-sm">' + (ev.tier === 'above' ? t.advDownPod : t.advDownT1) + '</h3>';
    html += '<div class="stack-8">' + cuts.slice(0, 10).map((c, i) => {
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
  }
  $('tipsMain').innerHTML = html;
  $('tipsUp').innerHTML = '<h2 class="secT">' + t.tipsUp + '</h2><div class="note-muted">' + t.tipsLoading + '</div>';
  $('tipsComp').innerHTML = '<h2 class="secT">' + t.tipsComp + '</h2><div class="note-muted">' + t.tipsLoading + '</div>';
  bindTips();
  fillAsync();
}

function bindTips() {
  bindSugPopovers($('tips'));
  for (const b of $('tips').querySelectorAll('[data-retry]'))
    b.onclick = () => { state.tipsCache = null; renderTips(); };
}

async function fillAsync() {
  const key = tipsKey();
  const upOk = await fillUpgrades(key);
  const compOk = await fillCompAdvice(key);
  if (tipsKey() !== key) return;
  if (upOk && compOk) state.tipsCache = { key,
    main: $('tipsMain').innerHTML, up: $('tipsUp').innerHTML, comp: $('tipsComp').innerHTML };
}

// ---- climb to Tier 2: concrete cards per open upgrade path ----
async function fillUpgrades(key) {
  const t = T(), r = state.result, lang = state.lang, es = lang === 'es';
  const { room, options } = powerUpOptions(r);
  const many = compSlots().map(sl => ({ ...sl, v: tagCount(sl.cat) })).filter(sl => sl.v > sl.max);
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
      const cmd = r.commander ? r.commander.split(' // ')[0] : '';
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
  const el = $('tipsUp');
  if (!el || tipsKey() !== key) return false;
  el.innerHTML = '<h2 class="secT">' + t.tipsUp + '</h2>' + body;
  bindTips();
  return !failed;
}

// ---- round out the composition: adds paired with direct cuts ----
async function fillCompAdvice(key) {
  const t = T(), r = state.result, lang = state.lang;
  const slots = compSlots().map(sl => ({ ...sl, v: tagCount(sl.cat) }));
  const few = slots.filter(sl => sl.v < sl.min && sl.cat !== 'land');
  const many = slots.filter(sl => sl.v > sl.max);
  const ci = deckColorIdentity(r);
  const inDeck = r.cardsInfo.map(x => x.name);
  const banned = Object.values(RULES.hard_bans.banned_cards).flat();
  const cutPool = roomCuts(r, many.map(m => m.cat), 12);
  let body = '', usedCurated = false, cutIdx = 0;
  const slotOf = x => many.find(m => x.cls.cat === m.cat || x.cls.tags.includes(m.cat));
  for (const sl of few) {
    let sug = { cards: [], source: 'live' };
    try { sug = await PodEngine.suggestCards({ cat: sl.cat, colorIdentity: ci, excludeNames: inDeck, bannedNames: banned }); } catch (e) { usedCurated = true; }
    if (sug.source === 'curated') usedCurated = true;
    body += '<div class="advice-block">' +
      '<div class="advice-head"><b>' + catLabel(sl.cat, lang) + '</b> — ' + sl.v + '/' + sl.min + '–' + sl.max +
      ' <span class="few">' + t.few + '</span></div>';
    if (sug.cards.length) {
      body += '<div class="sug-grid">' + sug.cards.slice(0, 6).map(c => {
        const cut = cutPool.length ? cutPool[cutIdx++ % cutPool.length] : null;
        return bigSugTile(c, cut);
      }).join('') + '</div>';
    }
  }
  if (!few.length) {
    if (many.length) {
      body += many.map(m => {
        const cands = r.cardsInfo
          .filter(x => (x.cls.cat === m.cat || x.cls.tags.includes(m.cat)) && x.cls.type !== 'L')
          .sort((a, b) => (b.card.edhrec_rank || 1e9) - (a.card.edhrec_rank || 1e9)).slice(0, 3);
        return '<div class="over-line"><b>' + catLabel(m.cat, lang) + '</b> ' + m.v + '/' + m.min + '–' + m.max +
          ' (' + t.many.toLowerCase() + ') — ' + t.tipsCutLabel + ': ' +
          cands.map(x => esc(x.name) + ' <span class="why">(' + esc(whyCut(x, slotOf(x))) + ')</span>').join(' · ') + '</div>';
      }).join('');
    } else {
      body += '<div class="over-line">' + t.tipsNone + '</div>';
    }
  }
  if (usedCurated) body += retryRow();
  const el = $('tipsComp');
  if (!el || tipsKey() !== key) return false;
  el.innerHTML = '<h2 class="secT">' + t.tipsComp + '</h2>' + body;
  bindTips();
  return !usedCurated;
}
