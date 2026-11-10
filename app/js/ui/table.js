import * as PodEngine from '../engine/index.js';
import { state, cardCache, persistCache, saveSession } from '../state.js';
import { RULES } from '../rules.js';
import { T, fill } from '../i18n.js';
import { ARCH, DIAL_META, CATS } from './constants.js';
import { $, esc, eur, tierTone } from './helpers.js';
import { analyze, getCardTags, getComboDb, getLandDenial, getPrecons, getSaltDb } from '../pipeline.js';
import { renderInput } from './input.js';
import { slotsFor } from './comp.js';
import { bindSugPopovers } from './popover.js';
import { watchLine } from './verdict.js';

export function renderTableMode() {
  const t = T();
  $('tableModeBtn').textContent = t.tmBtn;
  const el = $('tableMode');
  el.hidden = !state.tableOpen;
  if (!state.tableOpen) return;
  let html = '<div class="panel tm-panel">' +
    '<h2 class="secT secT-lg">' + t.tmT + '</h2>' +
    '<div class="lbl-muted">' + t.tmHint + '</div>' +
    '<div class="tm-grid">' +
    [0, 1, 2, 3].map(i => '<textarea data-tm="' + i + '" rows="8" class="tm-ta" placeholder="' + t.tmDeck + ' ' + (i + 1) + '" aria-label="' + t.tmDeck + ' ' + (i + 1) + '">' + esc(state.tableTexts[i]) + '</textarea>').join('') + '</div>' +
    '<div><button id="tmRunBtn" ' + (state.tableBusy ? 'disabled' : '') + ' class="btn-accent">' +
    (state.tableBusy ? t.tmRunning + '…' : t.tmRun) + '</button></div>';
  const res = state.tableResults;
  if (res) {
    if (res.length >= 2) html += tableCheckHtml(res);
    html += '<div class="table-scroll"><table class="tm-table">' +
      '<tr><th>' + t.tmDeck + '</th><th>' + t.tierWord + '</th><th>' + t.pts + '</th><th>' + t.sumWizards + '</th><th>' + t.pfPractical + '</th><th>' + t.pfSalt + '</th><th>' + t.price + '</th><th>' + t.archetype + '</th><th></th></tr>' +
      res.map((d, i) => {
        return '<tr><td>' + esc(d.name) + '</td>' +
          '<td><span class="tier-pill ' + tierTone(d.tier) + '">' + t[d.tier] + '</span></td>' +
          '<td class="mono">' + d.pts + '</td>' +
          '<td><span class="tier-pill tone-neutral" title="' + (d.bracket.pending ? esc(t.brPending) : '') + '">' +
            (d.bracket.pending ? t.brChecking : d.bracket.checklist) + '</span></td>' +
          '<td class="mono">' + (d.level.pending ? '—' : d.level.bracket + ' · ' + d.level.score) + '</td><td class="mono">' + (d.salt === null ? '—' : d.salt) + '</td>' +
          '<td class="mono">€' + Math.round(d.price) + '</td><td>' + esc(d.arch) + '</td>' +
          '<td><button data-tmload="' + i + '" class="btn-ghost-sm">' + t.tmLoad + '</button></td></tr>';
      }).join('') + '</table></div>';
    if (res.length >= 2) html += cmpDials(res) + cmpComp(res) + cmpCards(res);
  }
  html += '</div>';
  el.innerHTML = html;
  for (const ta of el.querySelectorAll('[data-tm]'))
    ta.oninput = () => { state.tableTexts[+ta.dataset.tm] = ta.value; saveSession(); };
  $('tmRunBtn').onclick = runTableMode;
  for (const b of el.querySelectorAll('[data-tmload]'))
    b.onclick = () => { $('deckText').value = state.tableTexts.filter(x => x.trim())[+b.dataset.tmload]; analyze(); };
  for (const b of el.querySelectorAll('[data-cmpview]'))
    b.onclick = () => { state.cmpView = b.dataset.cmpview; renderTableMode(); };
  bindSugPopovers(el);
}

// ---- the table at a glance: how it reads, who stands out, what to mention ----
function tableCheckHtml(res) {
  const t = T(), c = PodEngine.tableCheck(res);
  const list = (keys) => new Intl.ListFormat(state.lang).format(keys.map(k => t['tcM_' + k]));
  const reading = c.pending
    ? '<p class="tc-lead">' + esc(t.tcPending) + '</p>'
    : '<p class="tc-lead">' + esc(fill(t['tcBal_' + c.balance], { a: c.low.toFixed(1), b: c.high.toFixed(1) })) + '</p>' +
      '<ol class="tc-ladder">' + [...res].sort((a, b) => b.level.score - a.level.score)
        .map(d => '<li>' + esc(d.name) + ' <b class="mono">' + d.level.score.toFixed(1) + '</b></li>').join('') + '</ol>';
  const standouts = c.pending ? '' : '<h4 class="tc-sub">' + esc(t.tcStandsT) + '</h4>' + (c.standouts.length
    ? '<ul class="tc-list">' + c.standouts.map(s => '<li><b>' + esc(s.name) + '.</b> ' +
        (s.more.length ? esc(fill(t.tcMore, { c: list(s.more) })) + ' ' : '') + (s.less ? esc(t.tcLess) : '') + '</li>').join('') + '</ul>'
    : '<p class="tc-none">' + esc(t.tcNoStands) + '</p>');
  const mention = '<h4 class="tc-sub">' + esc(t.tcMentionT) + '</h4>' + (c.mention.length
    ? '<ul class="tc-list">' + c.mention.map(m => '<li><b>' + esc(m.name) + '.</b><ul>' +
        m.watch.map(w => '<li>' + esc(watchLine(w, t)) + '</li>').join('') + '</ul></li>').join('') + '</ul>'
    : '<p class="tc-none">' + esc(t.tcNoMention) + '</p>');
  return '<div class="cmp-section"><h3 class="secT">' + esc(t.tcT) + '</h3>' + reading + standouts + mention +
    '<p class="tc-none">' + esc(t.pfApart) + '</p></div>';
}

// ---- side-by-side comparison matrices ----
function deckHeads(res) {
  return '<tr><th class="cmp-lbl"></th>' + res.map(d => {
    const c = cardCache[d.commander] || {};
    return '<th class="cmp-deck-head"><span class="chip-art"' +
      (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' + esc(d.name) + '</th>';
  }).join('') + '</tr>';
}
function section(title, extra, table) {
  return '<div class="cmp-section"><div class="row-between"><h3 class="secT">' + title + '</h3>' + (extra || '') + '</div>' +
    '<div class="table-scroll"><table class="cmp-table">' + table + '</table></div></div>';
}

// Power dials: one row per dial any deck uses, cells value (+pts), totals last.
function cmpDials(res) {
  const t = T(), lang = state.lang;
  let rows = '';
  for (const m of DIAL_META) {
    if (!res.some(d => (d.stats[m.k] || 0) > 0)) continue;
    rows += '<tr><td class="cmp-lbl">' + m.name[lang] + '</td>' + res.map(d => {
      const v = d.stats[m.k] || 0, p = d.ev.breakdown[m.k] || 0;
      const forb = RULES.dials[m.k].forbidden && v > 0;
      const best = Math.max(...res.map(x => x.stats[m.k] || 0));
      return '<td class="mono' + (v === best && best > 0 ? ' cmp-max' : '') + '">' + v +
        (p ? ' <span class="cmp-pts">+' + p + '</span>' : '') + (forb ? ' <span class="cmp-bad">✕</span>' : '') + '</td>';
    }).join('') + '</tr>';
  }
  rows += '<tr class="cmp-total"><td class="cmp-lbl">' + t.pts + '</td>' +
    res.map(d => '<td class="mono"><b>' + d.pts + '</b> <span class="tier-pill ' + tierTone(d.tier) + '">' + t[d.tier].split(' · ')[0] + '</span></td>').join('') + '</tr>';
  return section(t.cmpDials, '', deckHeads(res) + rows);
}

// Composition: each deck judged against its OWN archetype targets.
function cmpComp(res) {
  const t = T(), lang = state.lang;
  const perSlots = res.map(d => new Map(slotsFor(d.archKey).map(s => [s.cat, s])));
  const cats = [...new Set(perSlots.flatMap(m => [...m.keys()]))];
  const cnt = (d, cat) => d.cardsInfo.reduce((s, x) => s + ((x.cls.cat === cat || x.cls.tags.includes(cat)) ? x.qty : 0), 0);
  let rows = '';
  for (const cat of cats) {
    rows += '<tr><td class="cmp-lbl">' + esc(CATS[cat][lang]) + '</td>' + res.map((d, i) => {
      const v = cnt(d, cat), sl = perSlots[i].get(cat);
      if (!sl) return '<td class="mono">' + v + '</td>';
      const st = v < sl.min ? 'few' : v > sl.max ? 'many' : 'ok';
      return '<td class="mono"><span class="cmp-' + st + '">' + v + '</span> <span class="cmp-range">/' + sl.min + '–' + sl.max + '</span></td>';
    }).join('') + '</tr>';
  }
  const avg = d => d.stats.avg_cmc != null ? d.stats.avg_cmc : '—';
  rows += '<tr><td class="cmp-lbl">' + t.avg + ' CMC</td>' + res.map(d => '<td class="mono">' + avg(d) + '</td>').join('') + '</tr>';
  return section(t.cmpComp, '', deckHeads(res) + rows);
}

// Cards, category by category, one column per deck. Cards present in every
// compared deck get a shared tint; "solo diferencias" hides them.
function cmpCards(res) {
  const t = T(), lang = state.lang;
  const inDecks = new Map();
  for (const d of res) for (const n of new Set(d.cardsInfo.map(x => x.name))) inDecks.set(n, (inDecks.get(n) || 0) + 1);
  const diff = state.cmpView === 'diff';
  const chip = (x) => {
    const c = x.card, shared = inDecks.get(x.name) === res.length;
    if (diff && shared) return '';
    return '<span class="sugTile card-chip' + (shared ? ' chip-shared' : '') + '" data-img="' + esc(c.img_normal || '') + '">' + (shared ? '<span title="=">≡</span> ' : '') +
      '<span class="chip-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
      esc(x.name.split(' // ')[0]) + (c.price != null ? ' <span class="mono chip-price">' + eur(c.price) + '</span>' : '') + '</span>';
  };
  let rows = '';
  for (const cat of Object.keys(CATS)) {
    if (cat === 'land') continue;
    const per = res.map(d => d.cardsInfo
      .filter(x => x.cls.type !== 'L' && x.cls.cat === cat)
      .sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || a.name.localeCompare(b.name)));
    if (!per.some(list => list.length)) continue;
    const cells = per.map(list => {
      const chips = list.map(chip).filter(Boolean).join('');
      return '<td class="cmp-cards-cell">' + (chips || '<span class="txt-faint">—</span>') + '</td>';
    });
    if (diff && !cells.some(c => c.includes('card-chip'))) continue;
    rows += '<tr><td class="cmp-lbl">' + esc(CATS[cat][lang]) + '</td>' + cells.join('') + '</tr>';
  }
  rows += '<tr><td class="cmp-lbl">' + esc(CATS.land[lang]) + '</td>' +
    res.map(d => '<td class="mono">' + d.stats.land_count + '</td>').join('') + '</tr>';
  const toggle = '<div class="seg-toggle-sm">' +
    '<button data-cmpview="all" aria-pressed="' + !diff + '" class="' + (diff ? '' : 'active') + '">' + t.cmpAll + '</button>' +
    '<button data-cmpview="diff" aria-pressed="' + diff + '" class="' + (diff ? 'active' : '') + '">' + t.cmpDiff + '</button></div>';
  return section(t.cmpCards, toggle, deckHeads(res) + rows) +
    '<div class="note-sm">' + t.cmpSharedNote + '</div>';
}

export async function runTableMode() {
  if (state.tableBusy) return;
  const texts = state.tableTexts.filter(x => x.trim());
  if (!texts.length) return;
  state.tableBusy = true; renderTableMode();
  const results = [];
  try {
    let comboDb = null;
    try { comboDb = await getComboDb(); } catch (e) { /* combos stay unchecked */ }
    const saltDb = await getSaltDb().catch(() => null);
    const cardTags = await getCardTags().catch(() => null);
    const landDenial = await getLandDenial().catch(() => null);
    const precons = await getPrecons().catch(() => null);
    for (const text of texts) {
      const parsed = PodEngine.parseDecklist(text);
      const names = [...new Set(parsed.entries.map(e => e.name))];
      const { notFound } = await PodEngine.fetchCards(names, cardCache, () => {});
      const resolved = parsed.entries.filter(e => cardCache[e.name]);
      const { stats, flagged } = PodEngine.computeDeckStats(resolved, cardCache);
      const commanders = PodEngine.pickCommanders(parsed, cardCache);
      let comboList = null;
      if (comboDb) {
        comboList = PodEngine.activeCombos(PodEngine.matchCombos(parsed.entries.map(e => e.name), comboDb), commanders);
        const infinite = comboList.filter(c => c.infinite);
        stats.combos = infinite.length;
        stats.combo_sizes = infinite.map(c => c.n);
      }
      const ev = PodEngine.evaluateDeck(stats, flagged, RULES, resolved.map(e => e.name));
      const cardsInfo = resolved.map(e => ({ card: cardCache[e.name], qty: e.quantity, name: e.name, cls: PodEngine.classifyCard(cardCache[e.name]) }));
      const det = PodEngine.detectArchetype(cardsInfo);
      const cmd = commanders[0] || null;
      const validation = PodEngine.validateDeck(cardsInfo, commanders, cardCache, notFound);
      const bracket = PodEngine.evaluateBrackets({
        stats, flagged, db: cardCache, validation, commanders,
        deckNames: resolved.map(e => e.name),
        combos: comboList, comboDb, landDenial,
        loopCards: RULES.hard_bans.banned_cards.extra_turn_recursion,
        unresolved: notFound.length,
      });
      const profile = PodEngine.computeProfile({ cardsInfo, stats, combos: comboList ? bracket.combos : null, commanders, cardTags });
      const salt = saltDb ? PodEngine.saltScore(resolved.map(e => e.name), saltDb) : null;
      const power = PodEngine.computePower(profile, stats, salt);
      const level = PodEngine.powerLevel({ power, rules: RULES, checked: !!comboList && !!salt, floor: comboList ? bracket.floor : null,
        precon: precons ? PodEngine.matchPrecon(resolved, precons) : null,
        combos: comboList ? bracket.combos : [], landMaybe: bracket.landMaybe, gameChangers: bracket.checks.find(c => c.id === 'game_changers').cards });
      const a = ARCH.find(x => x.k === det.key) || ARCH[ARCH.length - 1];
      results.push({ name: cmd ? cmd.split(' // ')[0] : T().tmDeck + ' ' + (results.length + 1),
        tier: ev.tier, pts: ev.points, price: stats.total_price_eur, gc: stats.game_changers,
        arch: a.name[state.lang], archKey: det.key, commander: cmd, bracket,
        power, level,
        salt: salt ? salt.total : null,
        stats, ev, cardsInfo });
    }
    persistCache();
    state.tableResults = results;
  } catch (e) { console.error(e); state.error = 'netErr'; }
  state.tableBusy = false;
  renderTableMode(); renderInput();
}
