import { state, cardCache, persistCache } from '../state.js';
import { fetchCards } from '../engine/index.js';
import { RULES } from '../rules.js';
import { T } from '../i18n.js';
import { ARCH, CATS, CAT_HELP, BADGE_OF } from './constants.js';

export const $ = (id) => document.getElementById(id);
export const eur = (v) => '€' + v.toFixed(2);
// Banned cards named by the pod rules, read off the point evaluation that finds them.
export const bannedCards = (r) => r.evalRes.violations.filter(v => v.id === 'banned')
  .flatMap(v => v.cards).map(c => String(Array.isArray(c) ? c[0] : c).split(' // ')[0]);
// Does what was typed appear in any of these texts? Case and accents do not count.
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const has = (q, ...texts) => fold(texts.join(' ')).includes(fold(q.trim()));
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function tierTone(k) {
  return { tier1: 'tone-ok', tier2: 'tone-warn', above: 'tone-neutral' }[k];
}
export function archKey() {
  if (state.arch !== 'auto') return state.arch;
  return state.result ? state.result.detected.key : 'generic';
}
export function archName() {
  const a = ARCH.find(x => x.k === archKey()) || ARCH[ARCH.length - 1];
  return a.name[state.lang] + (state.arch === 'auto' ? ' ' + T().autoTag : '');
}

export function badgeFor(name) {
  const r = state.result;
  for (const [dial, label, tone] of BADGE_OF) {
    const spec = RULES.dials[dial];
    if (!spec) continue;
    const inDial = (r.flagged[dial] || []).some(([n]) => n === name);
    if (inDial && ((r.stats[dial] || 0) > spec.baseline_max || dial === 'game_changers')) {
      return { label, tone };
    }
  }
  return null;
}

export function helpIcon(cat) {
  if (!CAT_HELP[cat]) return '';
  return '<button type="button" class="catHelp" data-cat="' + cat +
    '" aria-label="' + esc(T().helpAria + ': ' + CATS[cat][state.lang]) + '">?</button>';
}
export function catLabel(cat, lang) { return esc(CATS[cat][lang]) + helpIcon(cat); }

// Screen-reader status line (#srStatus is a visually-hidden aria-live region).
export function announce(msg) { const el = $('srStatus'); if (el) el.textContent = msg; }

// A dial's cost in words, straight from its rules spec (RULES is read at call time).
export function dialCost(spec, lang) {
  const P = lang === 'es';
  if (spec.forbidden) return P ? 'PROHIBIDO (y cada copia suma +1 pt)' : 'FORBIDDEN (and each copy still adds +1 pt)';
  if (spec.scoring === 'per_combo_size') {
    const sp = spec.size_points, d = spec.default_size_points;
    return P ? `${spec.free_combos} gratis; después: 2 cartas +${sp['2']} · 3 cartas +${sp['3']} · 4+ +${d}` : `${spec.free_combos} free; then: 2-card +${sp['2']} · 3-card +${sp['3']} · 4+ +${d}`;
  }
  const steps = Object.entries(spec.point_steps).map(([k, v]) => k + '→' + v).join(', ');
  return (P ? 'gratis hasta ' : 'free up to ') + spec.baseline_max + (steps ? ' · ' + steps : '') + (P ? ' · después +1/unidad' : ' · then +1/unit');
}

// A deck's cover: its commanders' art, from the cards the browser already knows (the tint shows until then).
const hueOf = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export const coverStyle = (name) => '--hue:' + hueOf(name);
export const coverArt = (commanders) => commanders.slice(0, 2).map(c => (cardCache[c] || {}).img_art).filter(Boolean).map(src =>
  '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" draggable="false">').join('');
// Looks up the commanders not known yet, all in one batched request, then redraws.
const asked = new Set();
export async function needCovers(decks, redraw) {
  const missing = [...new Set(decks.flatMap(d => d.slice(0, 2)))].filter(n => !cardCache[n] && !asked.has(n));
  if (!missing.length) return;
  for (const n of missing) asked.add(n);
  try { await fetchCards(missing, cardCache); persistCache(); redraw(); }
  catch (e) { console.error(e); for (const n of missing) asked.delete(n); } // the next redraw asks again
}
// Covers fade in once loaded; el is any ancestor of the images, bound once.
export function bindCovers(el) {
  if (el.dataset.covers) return;
  el.dataset.covers = '1';
  el.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('in'); }, true);
  el.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
}
// Runs a redraw as a view transition where the browser has them, so things glide to their new place.
export const glide = (fn) => document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(fn) : fn();
export const coverThumb = (name, commanders) => '<span class="gm-thumb" style="' + coverStyle(name) + '">' + coverArt(commanders.slice(0, 1)) + '</span>';
