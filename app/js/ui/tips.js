import * as PodEngine from '../engine/index.js';
import { state, cardCache } from '../state.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { CATS, CAT_ROLE, EXTRA_PTS, dialName } from './constants.js';
import { $, esc, archKey, catLabel } from './helpers.js';
import { bindSugPopovers } from './popover.js';
import { buildTip } from '../pipeline.js';
import { compSlots, tagCount } from './comp.js';

function deckColorIdentity() {
  const r = state.result;
  const cmd = r.commander && cardCache[r.commander];
  if (cmd && cmd.color_identity && cmd.color_identity.length) return cmd.color_identity;
  const ci = new Set();
  for (const x of r.cardsInfo) for (const c of x.card.color_identity || []) ci.add(c);
  return [...ci];
}

function whyAdd(c, cat) {
  const lang = state.lang, parts = [];
  if (CAT_ROLE[cat]) parts.push(CAT_ROLE[cat][lang]);
  if (c.edhrec_rank) parts.push(lang === 'es'
    ? (c.edhrec_rank <= 2500 ? 'de las más jugadas en EDHREC (#' + c.edhrec_rank + ')' : 'popular en EDHREC (#' + c.edhrec_rank + ')')
    : (c.edhrec_rank <= 2500 ? 'among the most played on EDHREC (#' + c.edhrec_rank + ')' : 'popular on EDHREC (#' + c.edhrec_rank + ')'));
  if (c.price != null) parts.push(lang === 'es' ? 'solo €' + c.price : 'only €' + c.price);
  if (c.cmc != null && c.cmc <= 2) parts.push(lang === 'es' ? 'entra pronto (coste ' + c.cmc + ')' : 'comes down early (cost ' + c.cmc + ')');
  return parts.join(' · ');
}

function whyCut(x, slot) {
  const lang = state.lang, r = x.card;
  const rank = r.edhrec_rank ? (lang === 'es' ? 'la menos jugada de tu ' + CATS[slot.cat][lang] + ' (EDHREC #' + r.edhrec_rank + ')'
    : 'the least-played card in your ' + CATS[slot.cat][lang] + ' (EDHREC #' + r.edhrec_rank + ')') : '';
  const over = lang === 'es' ? 'vas sobrado (' + slot.v + '/' + slot.min + '–' + slot.max + ')'
    : 'you are over target (' + slot.v + '/' + slot.min + '–' + slot.max + ')';
  return [rank, over].filter(Boolean).join(' y ');
}

function bigSugTile(c, cat) {
  const price = c.price != null ? '€' + c.price : '';
  const img = c.img_normal
    ? '<img src="' + c.img_normal + '" loading="lazy" class="sug-img" alt="">'
    : '<div class="sug-ph">' + esc(c.name) + '</div>';
  return '<div class="sugTile sug-tile" data-img="' + esc(c.img_normal || '') + '">' + img +
    '<div class="sug-name">' + esc(c.name) +
    (price ? ' <span class="mono chip-price">' + price + '</span>' : '') + '</div>' +
    '<div class="sug-why">' + esc(whyAdd(c, cat)) + '</div></div>';
}

export function sugChip(c) {
  const price = c.price != null ? '€' + c.price : '';
  return '<span class="sugTile card-chip" data-img="' + esc(c.img_normal || '') + '">' +
    '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
    esc(c.name) + (price ? ' <span class="mono chip-price">' + price + '</span>' : '') + '</span>';
}

function tipsKey() {
  return state.result.stats.total_price_eur + '|' + state.result.stats.total_cards + '|' + archKey() + '|' + state.lang + '|' + state.fetchSt;
}

export function renderTips() {
  const t = T(), r = state.result, lang = state.lang, ev = r.evalRes;
  if (state.tipsCache && state.tipsCache.key === tipsKey()) {
    $('tips').innerHTML = state.tipsCache.html;
    bindSugPopovers($('tips'));
    return;
  }
  // synchronous part first (power advice), async suggestions fill in after
  let html = '<div class="panel panel-pad-lg">' +
    '<span class="secT">' + t.tipsT + '</span>' +
    '<div class="tip-note">' + esc(buildTip()) + '</div>';
  const entries = Object.entries(ev.breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length || ev.violations.length) {
    html += '<span class="secT secT-sm">' + t.tipsPower + '</span>';
    for (const [k, pts] of entries) {
      const nameK = EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang);
      const cards = (ev.driving[k] || []).slice(0, 8);
      html += '<div class="tips-block">' +
        '<div class="tips-block-head"><b>' + esc(nameK) + '</b>' +
        '<span class="mono">+' + pts + ' pts</span></div>' +
        (cards.length ? '<div class="chip-row">' + cards.map(([n]) => {
          const c = cardCache[n] || { name: n };
          const wi = r.whatIf[n];
          return sugChip({ name: n, price: c.price, img_art: c.img_art, img_normal: c.img_normal }) +
            (wi && wi.dPts > 0 ? '<span class="wi-note">✂ −' + wi.dPts + ' ' + t.whatIf + '</span>' : '');
        }).join('') + '</div>' : '') + '</div>';
    }
  }
  html += '</div>';
  // composition advice placeholder — filled by async fetch
  html += '<div class="panel panel-pad-lg" id="tipsComp">' +
    '<span class="secT">' + t.tipsComp + '</span><div class="note-muted">' + t.tipsLoading + '</div></div>';
  $('tips').innerHTML = html;
  bindSugPopovers($('tips'));
  fillCompAdvice();
}

async function fillCompAdvice() {
  const t = T(), r = state.result, lang = state.lang;
  const key = tipsKey();
  const slots = compSlots().map(sl => ({ ...sl, v: tagCount(sl.cat) }));
  const few = slots.filter(sl => sl.v < sl.min && sl.cat !== 'land');
  const many = slots.filter(sl => sl.v > sl.max);
  const ci = deckColorIdentity();
  const inDeck = r.cardsInfo.map(x => x.name);
  const banned = Object.values(RULES.hard_bans.banned_cards).flat();
  let body = '', usedCurated = false;
  const cutCandsOf = (m) => r.cardsInfo
    .filter(x => (x.cls.cat === m.cat || x.cls.tags.includes(m.cat)) && x.cls.type !== 'L')
    .sort((a, b) => (b.card.edhrec_rank || 1e9) - (a.card.edhrec_rank || 1e9)).slice(0, 3);
  for (const sl of few) {
    let sug = { cards: [], source: 'live' };
    try { sug = await PodEngine.suggestCards({ cat: sl.cat, colorIdentity: ci, excludeNames: inDeck, bannedNames: banned }); } catch (e) {}
    if (sug.source === 'curated') usedCurated = true;
    body += '<div class="advice-block">' +
      '<div class="advice-head"><b>' + catLabel(sl.cat, lang) + '</b> — ' + sl.v + '/' + sl.min + '–' + sl.max +
      ' <span class="few">' + t.few + '</span></div>';
    if (sug.cards.length) {
      body += '<div class="note-muted">' + t.tipsAdd + ' ' + esc(CATS[sl.cat][lang]).toLowerCase() + ':</div>' +
        '<div class="sug-grid">' +
        sug.cards.map(c => bigSugTile(c, sl.cat)).join('') + '</div>';
    }
    const cutBlocks = many.map(m => {
      const cands = cutCandsOf(m);
      if (!cands.length) return '';
      return '<div class="cut-line">' + t.tipsCutFrom + ' <b>' + catLabel(m.cat, lang) + '</b>: ' +
        cands.map(x => esc(x.name) + ' <span class="why">(' + esc(whyCut(x, m)) + ')</span>').join(' · ') + '</div>';
    }).filter(Boolean).join('');
    body += cutBlocks + '</div>';
  }
  if (!few.length) {
    if (many.length) {
      body += many.map(m => {
        const cands = cutCandsOf(m);
        return '<div class="over-line"><b>' + catLabel(m.cat, lang) + '</b> ' + m.v + '/' + m.min + '–' + m.max +
          ' (' + t.many.toLowerCase() + ') — ' + t.tipsCutLabel + ': ' +
          cands.map(x => esc(x.name) + ' <span class="why">(' + esc(whyCut(x, m)) + ')</span>').join(' · ') + '</div>';
      }).join('');
    } else {
      body += '<div class="over-line">' + t.tipsNone + '</div>';
    }
  }
  if (usedCurated) body += '<div class="note-warn">' + t.tipsCurated + '</div>';
  const el = $('tipsComp');
  if (!el || tipsKey() !== key) return; // state changed while fetching
  el.innerHTML = '<span class="secT">' + t.tipsComp + '</span>' + body;
  bindSugPopovers(el);
  state.tipsCache = { key, html: $('tips').innerHTML };
}
