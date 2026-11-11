import { state } from '../state.js';
import { T, fill } from '../i18n.js';
import { ARCH, SAMPLES } from './constants.js';
import { $, esc } from './helpers.js';
import { isLegalCommander, canPair, pairKinds } from '../engine/index.js';
import { searchCommanders, startDeck } from '../edits.js';

export function renderInput() {
  const t = T();
  $('inputTitle').textContent = t.inputTitle;
  $('loadT').textContent = t.loadT;
  $('heroX').textContent = t.heroX;
  $('heroNotice').hidden = !state.shareBad;
  $('heroNotice').textContent = t.shareBad;
  $('heroCta').textContent = t.heroCta;
  $('heroBuild').textContent = t.heroBuild;
  $('heroPlay').textContent = t.heroPlay;
  $('heroScroll').textContent = t.heroScroll;
  $('deckText').placeholder = t.inputPh;
  $('deckText').setAttribute('aria-label', t.inputAria);
  $('tryLabel').textContent = t.tryLabel;
  $('archLabel').textContent = t.archLabel;
  $('analyzeBtn').textContent = state.busy
    ? (state.fi.total ? t.fetchingCards + ' ' + state.fi.done + '/' + state.fi.total : t.analyzing)
    : t.analyze;
  $('analyzeBtn').disabled = state.busy;
  const sel = $('archSel');
  const cur = state.arch;
  sel.innerHTML = '<option value="auto">' + esc(t.auto) + '</option>' +
    ARCH.map(a => '<option value="' + a.k + '">' + esc(a.name[state.lang]) + '</option>').join('');
  sel.value = cur;
  $('samples').innerHTML = ['s1', 's2', 's3'].map(k =>
    '<button data-sample="' + k + '" class="chip-dashed">' + esc(t[k]) + '</button>').join('');
  for (const b of $('samples').querySelectorAll('[data-sample]'))
    b.onclick = () => { $('deckText').value = SAMPLES[b.dataset.sample]; state.error = null; renderInput(); };
  bindNewDeck();
  const notice = $('inputNotice');
  if (state.error) { notice.hidden = false; notice.textContent = state.error in t ? t[state.error] : state.error; }
  else notice.hidden = true;
}

// ---- Nuevo mazo: pick a commander (and a partner when it takes one), then the editor starts ----
let first = null, hits = null, q = '', typing;

function paintNew() {
  const t = T();
  $('ndSearch').placeholder = first ? t.ndPartner : t.ndSearch;
  $('ndSearch').setAttribute('aria-label', $('ndSearch').placeholder);
  $('ndPicked').innerHTML = first
    ? '<button type="button" class="chip-dashed nd-chip" aria-label="' + esc(fill(t.ndPicked, { c: first.name })) + '">' + esc(first.name) + ' ✕</button>' +
      '<button type="button" class="btn-accent nd-start">' + esc(t.ndStart) + '</button>'
    : '';
  if (first) {
    $('ndPicked').querySelector('.nd-chip').onclick = () => { first = null; hits = null; $('ndSearch').value = q = ''; paintNew(); };
    $('ndPicked').querySelector('.nd-start').onclick = () => startDeck([first]);
  }
  const list = (hits || []).filter(c => first ? canPair(first, c) : isLegalCommander(c));
  $('ndHits').innerHTML = hits === null ? '' : !list.length ? '<li class="dk-note">' + esc(t.ndNone) + '</li>'
    : list.map((c, i) => '<li><button type="button" class="dk-row" data-pick="' + i + '"><img src="' + esc(c.img_art) + '" loading="lazy" alt="">' +
      '<span class="dk-main"><span class="dk-name">' + esc(c.name) + '</span><span class="dk-sub">' + esc(c.type_line || '') + '</span></span></button></li>').join('');
  for (const b of $('ndHits').querySelectorAll('[data-pick]')) b.onclick = () => {
    const c = list[+b.dataset.pick];
    if (first) return startDeck([first, c]);
    if (!pairKinds(c).length) return startDeck([c]);
    first = c; hits = null; $('ndSearch').value = q = ''; paintNew();
  };
}

// only sets labels and handlers: the input is never rebuilt, so typing survives re-renders
function bindNewDeck() {
  const t = T();
  $('ndT').textContent = t.ndT;
  $('ndX').textContent = t.ndX;
  $('ndSearch').oninput = (e) => {
    const text = q = e.target.value;
    clearTimeout(typing);
    if (text.trim().length < 3) { hits = null; paintNew(); return; }
    typing = setTimeout(async () => {
      const found = await searchCommanders(text.trim()).catch(() => []);
      if (q === text) { hits = found; paintNew(); } // a slow answer for old text drops out
    }, 300);
  };
  paintNew();
}
