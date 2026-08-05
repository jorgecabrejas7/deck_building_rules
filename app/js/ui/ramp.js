import * as PodEngine from '../engine/index.js';
import { state } from '../state.js';
import { T } from '../i18n.js';
import { $, esc, helpIcon } from './helpers.js';
import { bindSugPopovers } from './popover.js';

export function renderRamp() {
  const t = T(), r = state.result, lang = state.lang, P = lang === 'es';
  const ramps = r.cardsInfo.filter(x => x.cls.type !== 'L' &&
    (x.cls.tags.includes('ramp') || PodEngine.isLandRamp(x.card)))
    .map(x => {
      const landR = PodEngine.isLandRamp(x.card);
      const prod = landR ? 1 : PodEngine.manaProduced(x.card);
      return { x, prod, landR };
    }).filter(e => e.prod > 0)
    .sort((a, b) => (a.x.card.cmc || 0) - (b.x.card.cmc || 0));
  let html = '<span class="secT">' + t.rampT + helpIcon('ramp') + '</span>';
  if (!ramps.length) {
    html += '<div class="note-muted">' + t.rampNone + '</div>';
  } else {
    const nl = r.cardsInfo.filter(x => x.cls.type !== 'L');
    const totalProd = ramps.reduce((sum, e) => sum + e.prod * e.x.qty, 0);
    const nlQty = nl.reduce((sum, x) => sum + x.qty, 0) || 1;
    const avg = (nl.reduce((sum, x) => sum + (x.card.cmc || 0) * x.qty, 0) / nlQty).toFixed(2);
    html += '<div class="note-muted">' + ramps.length + ' ' + t.rampAgg1 + ' · +' + totalProd + ' ' + t.rampAgg2 + ' ' + avg + '</div>';
    html += '<div class="stack-8">' + ramps.map(({ x, prod, landR }) => {
      const c = x.card;
      const playT = Math.max(Math.ceil(c.cmc || 1), 1);
      const nextT = playT + 1;
      const avail = nextT + prod;  // a land per turn + this accelerator
      const examples = nl.filter(y => Math.floor(y.card.cmc || 0) === avail && y.name !== x.name)
        .sort((a, b) => (a.card.edhrec_rank || 1e9) - (b.card.edhrec_rank || 1e9)).slice(0, 3);
      const exStr = examples.length
        ? examples.map(y => '<b>' + esc(y.name) + '</b>').join(', ')
        : '<span class="txt-faint">' + t.rampNothing + '</span>';
      const sentence = P
        ? 'T' + playT + ': ' + t.rampPlay + ' <b>' + esc(x.name) + '</b> → T' + nextT + ': ' + avail + ' ' + t.rampAvail +
          (landR ? ' (busca tierra)' : ' (+' + prod + ')') + ' — ' + t.rampAhead + ': ' + exStr
        : 'T' + playT + ': ' + t.rampPlay + ' <b>' + esc(x.name) + '</b> → T' + nextT + ': ' + avail + ' ' + t.rampAvail +
          (landR ? ' (fetches a land)' : ' (+' + prod + ')') + ' — ' + t.rampAhead + ': ' + exStr;
      return '<div class="sugTile ramp-line" data-img="' + esc(c.img_normal || '') + '">' +
        '<span class="ramp-art"' + (c.img_art ? ' style="background-image:url(\'' + c.img_art + '\')"' : '') + '></span>' +
        '<div class="ramp-text">' + sentence + '</div></div>';
    }).join('') + '</div>';
  }
  $('rampPanel').innerHTML = html;
  bindSugPopovers($('rampPanel'));
}
