import { state, cardCache } from '../state.js';
import { T, fill } from '../i18n.js';
import { RULES } from '../rules.js';
import { wrapLines, fitList } from '../engine/index.js';

// A picture of the deck's readings to show the table before a game: it describes, and
// everything on it is what the report already says.
const W = 1080, H = 1350, PAD = 60, INNER = W - PAD * 2, ART_H = 570, WATCH_LINES = 7;

const loadArt = (url) => new Promise(done => {
  if (!url) return done(null);
  const img = new Image();
  img.crossOrigin = 'anonymous'; // without it the canvas taints and cannot export
  img.onload = () => done(img);
  img.onerror = () => done(null);
  img.src = url;
});

function drawCard(art) {
  const t = T(), r = state.result, ev = r.evalRes, l = r.level, b = r.bracket;
  const css = getComputedStyle(document.body), family = css.fontFamily;
  const h1 = css.getPropertyValue('--h1').trim(), h2 = css.getPropertyValue('--h2').trim();
  const ink = `oklch(.8 .14 ${h1})`, ink2 = `oklch(.8 .14 ${h2})`, wash = `oklch(.27 .05 ${h1})`, bg = `oklch(.18 .04 ${h1})`;
  const white = '#fff', muted = `oklch(.8 .03 ${h1})`;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  const setFont = (size, weight = 400) => { c.font = `${weight} ${size}px ${family}`; };
  const write = (s, x, y, size, color, weight = 400) => { setFont(size, weight); c.fillStyle = color; c.fillText(s, x, y); };
  const wrap = (s) => wrapLines(s, INNER, x => c.measureText(x).width);

  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  if (art) {
    const scale = Math.max(W / art.width, ART_H / art.height), w = art.width * scale, h = art.height * scale;
    c.drawImage(art, (W - w) / 2, (ART_H - h) / 2, w, h);
  } else {
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, `oklch(.45 .14 ${h1})`); g.addColorStop(1, `oklch(.45 .14 ${h2})`);
    c.fillStyle = g; c.fillRect(0, 0, W, ART_H);
  }
  const fade = c.createLinearGradient(0, 0, 0, ART_H);
  fade.addColorStop(.3, `oklch(.18 .04 ${h1} / 0)`); fade.addColorStop(1, bg);
  c.fillStyle = fade; c.fillRect(0, 0, W, ART_H);

  // the name shrinks until it fits two lines, down to a size where any real name does
  const name = r.commanders.join(' + ');
  let size = 76, lines;
  for (; ; size -= 8) {
    setFont(size, 600);
    lines = wrap(name);
    if (size <= 44 || (lines.length <= 2 && lines.every(s => c.measureText(s).width <= INNER))) break;
  }
  lines.forEach((s, i) => write(s, PAD, ART_H - 20 - (lines.length - 1 - i) * size * 1.1, size, white, 600));

  const tiles = [
    [t.pfPracticalLabel, l.bracket, fill(t.pfScore, { v: l.score }), ink],
    [t.sumPod, t['short_' + ev.tier], ev.points + ' ' + fill(t.sumOfBudget, { b: RULES.tiers.tier2.max_points }), ink2],
    [t.sumWizards, String(b.checklist), t['brName' + b.checklist], white],
  ];
  const tileW = (INNER - 40) / 3, tileY = 600;
  tiles.forEach(([label, value, sub, color], i) => {
    const x = PAD + i * (tileW + 20);
    c.fillStyle = wash;
    c.beginPath(); c.roundRect(x, tileY, tileW, 190, 24); c.fill();
    write(label, x + 24, tileY + 44, 26, muted);
    write(value, x + 24, tileY + 118, 64, color, 600);
    write(sub, x + 24, tileY + 162, 26, muted);
  });

  // what the table may want to look at; game changers have their own place below
  const rows = [
    ...(l.floor ? [[t.watch_land, l.floor.mld]] : []),
    ...l.watch.filter(w => w.kind !== 'gc').map(w => [t['watch_' + (w.kind === 'combo' ? w.tag : w.kind)], w.items]),
    ...(l.tips.length ? [[t.r0Tip, l.tips]] : []),
  ];
  write(t.r0Watch, PAD, 850, 30, ink2, 600);
  setFont(30);
  let y = 898, left = WATCH_LINES;
  for (let i = 0; i < rows.length; i++) {
    const [tpl, items] = rows[i];
    const rowLines = wrap(fill(tpl, { c: fitList(items, s => wrap(fill(tpl, { c: s })).length <= 2) }));
    if (rowLines.length > left - (i < rows.length - 1 ? 1 : 0)) { write('+' + (rows.length - i), PAD, y, 30, muted); break; }
    for (const s of rowLines) { write(s, PAD, y, 30, white); y += 40; }
    y += 8; left -= rowLines.length;
  }
  if (!rows.length) write(t.r0Clear, PAD, y, 30, muted);

  const gc = b.checks.find(x => x.id === 'game_changers').cards;
  write(t.br_game_changers + ' (' + gc.length + ')', PAD, 1190, 30, ink2, 600);
  setFont(30);
  wrap(fitList(gc, s => wrap(s).length <= 2)).forEach((s, i) => write(s, PAD, 1236 + i * 40, 30, white));

  const band = c.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, ink); band.addColorStop(1, ink2);
  c.fillStyle = band; c.fillRect(0, H - 10, W, 10);
  return canvas;
}

async function deliver(blob, name) {
  const file = new File([blob], name, { type: 'image/png' });
  // desktop browsers offer share too, but there a plain download is what a player expects
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) {
      if (e.name === 'AbortError') return; // the player closed the sheet
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function makeRuleZeroCard(e) {
  const btn = e.currentTarget, first = state.result.commanders[0];
  btn.disabled = true;
  try {
    const canvas = drawCard(await loadArt((cardCache[first] || {}).img_art));
    const blob = await new Promise(done => canvas.toBlob(done, 'image/png'));
    await deliver(blob, (first || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-rule-zero.png');
  } finally {
    btn.disabled = false;
  }
}
