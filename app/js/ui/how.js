import { state } from '../state.js';
import { RULES } from '../rules.js';
import { DIAL_META } from './constants.js';
import { $, esc } from './helpers.js';

function renderHow() {
  const lang = state.lang;
  const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
  const P = lang === 'es';
  const dialRows = DIAL_META.map(m => {
    const spec = RULES.dials[m.k];
    if (!spec) return '';
    let cost;
    if (spec.forbidden) cost = P ? 'PROHIBIDO (y cada copia suma +1 pt)' : 'FORBIDDEN (and each copy still adds +1 pt)';
    else if (spec.scoring === 'per_combo_size') cost = P ? '2 gratis; después: 2 cartas +3 · 3 cartas +2 · 4+ +1' : '2 free; then: 2-card +3 · 3-card +2 · 4+ +1';
    else {
      const steps = Object.entries(spec.point_steps).map(([k, v]) => k + '→' + v).join(', ');
      cost = (P ? 'gratis hasta ' : 'free up to ') + spec.baseline_max + (steps ? ' · ' + steps : '') + (P ? ' · después +1/unidad' : ' · then +1/unit');
    }
    return '<tr><td>' + m.name[lang] + '</td>' +
      '<td class="mono">' + esc(cost) + '</td></tr>';
  }).join('');
  const bans = RULES.hard_bans.banned_cards;
  const html = P ? `
<button id="howClose" class="modal-close" aria-label="Cerrar">✕</button>
<h2>¿Cómo funciona esta guía?</h2>
<p class="lead">Las reglas del pod sustituyen a los brackets oficiales. La referencia es sencilla: <b>Tier 1 = un precon de caja</b>. Están calibradas con datos reales de 36 precons oficiales (2024–2026).</p>
<h3>El presupuesto de puntos</h3>
<p>Cada mazo gasta puntos al pasarse de lo que hace un precon en cada «dial». <b>Tier 1: hasta ${t1} puntos. Tier 2: hasta ${t2}.</b> Más de ${t2}: por encima del nivel del pod. Los puntos <b>nunca dejan de contarse</b>: pasado el último escalón de un dial, cada unidad extra suma +1. Puedes concentrar todo tu presupuesto en un solo eje (p. ej. dos game changers), pero entonces el resto del mazo debe quedarse a nivel precon.</p>
<h3>Los diales</h3>
<div class="table-scroll"><table>${dialRows}</table></div>
<h3>Prohibiciones duras (nada de puntos: no se juegan)</h3>
<ul>
<li>Ninguna carta de más de <b>€${RULES.hard_bans.max_card_price_eur}</b> (impresión más barata de Cardmarket) sin aprobación explícita de la mesa.</li>
<li>Maná explosivo repetible: ${bans.true_fast_mana.slice(0, 6).join(', ')}… (${bans.true_fast_mana.length} cartas). Los rituales de un solo uso (Dark Ritual…) SÍ se permiten.</li>
<li>Turnos extra repetibles: ${bans.extra_turn_recursion.join(', ')}.</li>
<li>Destrucción masiva de tierras.</li></ul>
<h3>Condicionales (un lujo excluye otros)</h3>
<ul>
<li>Con un game changer: máximo 3 cartas de €10–20 y ninguna de €20–30.</li>
<li>Con tutores: cero game changers.</li>
<li>Con cualquier combo infinito: cero tutores.</li>
<li>Maná rápido alto (9+) y hechizos gratis altos (5+) a la vez: +2 puntos extra.</li></ul>
<h3>Precios, combos y sugerencias</h3>
<p>Los precios vienen de Scryfall (Cardmarket). El primer análisis usa la impresión por defecto; el botón «Buscar precios más baratos» busca la impresión más barata carta a carta. Los combos infinitos se comprueban automáticamente en cada análisis contra Commander Spellbook y las sugerencias de cartas salen de Scryfall ordenadas por popularidad en EDHREC, filtradas a tu identidad de color y a menos de €5 (mejoras de nivel: menos de €10). Las URLs de Archidekt se cargan automáticamente a través de un proxy público (corsproxy.io) porque Archidekt bloquea la lectura directa desde el navegador; si prefieres que tu mazo no pase por terceros, pega la lista en texto. Los combos se comprueban contra una base alojada en esta misma web, sin terceros.</p>`
  : `
<button id="howClose" class="modal-close" aria-label="Close">✕</button>
<h2>How this guide works</h2>
<p class="lead">The pod rules replace the official brackets. The reference is simple: <b>Tier 1 = a boxed precon</b>. Everything is calibrated on real data from 36 official precons (2024–2026).</p>
<h3>The point budget</h3>
<p>A deck spends points whenever it exceeds what precons do on each "dial". <b>Tier 1: up to ${t1} points. Tier 2: up to ${t2}.</b> More than ${t2}: above pod level. Points <b>never stop counting</b>: past a dial's last priced step, each extra unit adds +1. You may pour the whole budget into one axis (say, two game changers) — but then the rest of the deck must stay at precon level.</p>
<h3>The dials</h3>
<div class="table-scroll"><table>${dialRows}</table></div>
<h3>Hard bans (no points involved: just don't)</h3>
<ul>
<li>No card over <b>€${RULES.hard_bans.max_card_price_eur}</b> (cheapest Cardmarket printing) without explicit table approval.</li>
<li>Repeatable explosive mana: ${bans.true_fast_mana.slice(0, 6).join(', ')}… (${bans.true_fast_mana.length} cards). One-shot rituals (Dark Ritual…) ARE allowed.</li>
<li>Repeatable extra turns: ${bans.extra_turn_recursion.join(', ')}.</li>
<li>Mass land destruction.</li></ul>
<h3>Conditionals (one luxury excludes others)</h3>
<ul>
<li>With a game changer: at most 3 cards at €10–20 and none at €20–30.</li>
<li>With tutors: zero game changers.</li>
<li>With any infinite combo: zero tutors.</li>
<li>High fast mana (9+) and high free spells (5+) together: +2 extra points.</li></ul>
<h3>Prices, combos and suggestions</h3>
<p>Prices come from Scryfall (Cardmarket). The first pass uses the default printing; the "Fetch cheapest prices" button looks up the cheapest printing per card. Infinite combos are checked automatically on every analysis against Commander Spellbook and card suggestions come from Scryfall ranked by EDHREC popularity, filtered to your color identity and under €5 (tier upgrades: under €10). Archidekt URLs load automatically through a public proxy (corsproxy.io) because Archidekt blocks direct browser reads; if you prefer your deck not to transit a third party, paste the list as text. Combos are checked against a database hosted on this very site — no third parties.</p>`;
  $('howBody').innerHTML = html;
  $('howClose').onclick = closeHow;
}
export function openHow() { renderHow(); $('howModal').style.display = 'block'; }
export function closeHow() { $('howModal').style.display = 'none'; }
