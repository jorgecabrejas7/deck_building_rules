import { state } from '../state.js';
import { T } from '../i18n.js';
import { synergyWeb } from '../engine/index.js';
import { $, esc, fill } from './helpers.js';
import { bindCardTilePopover } from './popover.js';
import { answer, cardList, cardName, paint } from './reading.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TICKS = 300, TICKS_PER_FRAME = 3; // about two seconds of settling, then it stops for good
const LABEL_ROOM = 70; // hub names hang past their dot, and the view box must not cut them off
const radius = (n) => 3 + Math.sqrt(n.degree) * 0.9;

// One per analysis: a re-render (a language switch, a view change) keeps the settled layout.
let graph = null;
function graphFor(r) {
  if (graph && graph.result === r) return graph;
  const web = synergyWeb({ cardsInfo: r.cardsInfo, combos: r.bracket.combos, cardTags: state.cardTags });
  graph = { result: r, web, sim: null, els: null,
    nodes: web.nodes.map(n => ({ ...n })),
    links: web.edges.map(e => ({ source: e.a, target: e.b, combo: e.reasons.includes('combo') })),
    hubs: new Set(web.hubs.map(h => h.name)),
    imgs: new Map(r.cardsInfo.map(({ card }) => [String(card.name).split(' // ')[0], card.img_normal])) };
  return graph;
}

function place(g) {
  const svg = g.els.svg;
  for (const [line, l] of g.els.lines) {
    line.setAttribute('x1', l.source.x); line.setAttribute('y1', l.source.y);
    line.setAttribute('x2', l.target.x); line.setAttribute('y2', l.target.y);
  }
  for (const [dot, n] of g.els.dots) dot.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')');
  const xs = g.nodes.map(n => n.x), ys = g.nodes.map(n => n.y);
  const x = Math.min(...xs) - LABEL_ROOM, y = Math.min(...ys) - LABEL_ROOM / 2;
  svg.setAttribute('viewBox', [x, y, Math.max(...xs) + LABEL_ROOM - x, Math.max(...ys) + LABEL_ROOM / 2 - y].join(' '));
}

function simulate(g, d3) {
  if (g.sim) return;
  g.sim = d3.forceSimulation(g.nodes)
    .force('link', d3.forceLink(g.links).id(n => n.name).distance(110).strength(0.12))
    .force('charge', d3.forceManyBody().strength(-420))
    .force('x', d3.forceX().strength(0.05))
    .force('y', d3.forceY().strength(0.08))
    .force('collide', d3.forceCollide(n => radius(n) + 2))
    .stop();
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) { g.sim.tick(TICKS); return; }
  let left = TICKS;
  const step = () => {
    if (graph !== g) return; // another deck took over
    g.sim.tick(Math.min(TICKS_PER_FRAME, left));
    left -= TICKS_PER_FRAME;
    place(g);
    if (left > 0) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function draw(g, box, t) {
  const make = (name, parent, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return parent.appendChild(el);
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'web-svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', fill(t.webGraphAria, { c: g.nodes.length, e: g.links.length }));
  const lines = g.links.map(l => [make('line', svg, { class: 'web-edge' + (l.combo ? ' web-edge-combo' : '') }), l]);
  const dots = g.nodes.map(n => {
    const dot = make('g', svg, { class: 'web-node' + (g.hubs.has(n.name) ? ' web-hub-node' : ''), 'data-name': n.name });
    make('circle', dot, { r: radius(n) });
    if (g.hubs.has(n.name)) make('text', dot, { y: radius(n) + 12 }).textContent = n.name;
    bindCardTilePopover(dot, () => g.imgs.get(n.name));
    // popover.js closes on any touch tap outside its own tiles: this tap must not count as outside
    dot.addEventListener('click', (e) => e.stopPropagation());
    return [dot, n];
  });
  g.els = { svg, lines, dots };
  place(g);
  box.prepend(svg);
}

// The graph is an extra on top of the lists, so it loads apart: if it fails, they still stand.
function showGraph(g, t) {
  const box = $('webGraph');
  if (!box) return;
  import('../../vendor/d3-force-3.0.0.min.js').then(d3 => {
    if (!box.isConnected) return; // re-rendered while loading: the newer box draws it
    simulate(g, d3);
    draw(g, box, t);
    box.hidden = false;
  }).catch(e => console.error(e));
}

const hubRow = (h, t) => '<li class="web-hub"><h5>' + cardName(h.name, 'rd-card', String(h.degree)) + '</h5>' +
  h.groups.map(gr => '<p class="rd-q">' + esc(t['webR_' + gr.reason]) + '</p>' + cardList(gr.cards, { cap: 8 })).join('') + '</li>';

export function renderWeb() {
  const t = T(), cd = state.combosData, root = $('web');
  const shell = (value, sub, body = '') => '<div class="panel rd">' + answer({ label: t.webLabel, value, sub }) + body + '</div>';
  if (!cd || cd.status === 'checking') return paint(root, shell('…', esc(t.comboChecking)));
  if (cd.status === 'error' || !state.cardTags) return paint(root, shell('—', esc(t.webNoData)));
  const g = graphFor(state.result), { web } = g;
  paint(root, shell(fill(t.webValue, { c: web.nodes.length, n: web.nodes.length + web.unconnected.length }),
    esc(fill(t.webSub, { e: web.edges.length })),
    '<p class="rd-why">' + esc(t.webCaveat) + '</p>' +
    (web.edges.length ? '<div id="webGraph" class="web-graph" hidden><p class="rd-q">' + esc(t.webLegend) + '</p></div>' : '') +
    '<section class="rd-section"><h4>' + esc(t.webHubs) + '</h4>' +
      (web.hubs.length ? '<ul class="web-hubs">' + web.hubs.map(h => hubRow(h, t)).join('') + '</ul>' : '<p class="rd-q">' + esc(t.webNoHubs) + '</p>') + '</section>' +
    '<section class="rd-section"><h4>' + esc(t.webLoose) + '</h4>' +
      (web.unconnected.length ? '<p class="rd-q">' + esc(t.webLooseX) + '</p>' + cardList(web.unconnected, { cap: 24 }) : '<p class="rd-q">' + esc(t.webNoLoose) + '</p>') + '</section>'));
  if (web.edges.length) showGraph(g, t);
}
