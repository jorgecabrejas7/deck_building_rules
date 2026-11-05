import { state } from '../state.js';
import { RULES } from '../rules.js';
import { DIAL_META } from './constants.js';
import { BRACKET3 } from '../engine/bracket.js';
import { $, esc } from './helpers.js';

function renderHow() {
  const lang = state.lang;
  const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
  const pow = RULES.power_tiers;
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
<h2 id="howTitle">¿Cómo funciona esta guía?</h2>
<p class="lead">El nivel del pod lo decide el <b>poder</b> del mazo. La referencia es sencilla: <b>Tier 1 = un precon de caja</b>.</p>
<h3>Quién entra en el pod</h3>
<p><b>Tier 1: poder hasta ${pow.tier1_max}. Tier 2: hasta ${pow.tier2_max}. Más: fuera del pod.</b> Las cartas prohibidas dejan fuera a un mazo tenga el poder que tenga. El poder es una escala propia de 1 a 10, calibrada con 36 precons y 8 listas cEDH públicas.</p>
<h3>Los puntos, solo como información</h3>
<p>Los puntos ya no deciden: miden cuánto se aleja un mazo de un precon en cada «dial», y el precio pesa mucho en ellos. Referencias: ${t1} y ${t2} puntos.</p>
<h3>Los diales</h3>
<div class="table-scroll"><table><thead><tr><th>Dial</th><th>Cantidad → puntos</th></tr></thead><tbody>${dialRows}</tbody></table></div>
<h3>Prohibiciones</h3>
<ul>
<li>Ninguna carta de más de <b>€${RULES.hard_bans.max_card_price_eur}</b> (impresión más barata de Cardmarket) sin aprobación explícita de la mesa.</li>
<li>Maná explosivo repetible: ${bans.true_fast_mana.slice(0, 6).join(', ')}… (${bans.true_fast_mana.length} cartas). Los rituales de un solo uso (Dark Ritual…) SÍ se permiten.</li>
<li>Turnos extra repetibles: ${bans.extra_turn_recursion.join(', ')}.</li>
<li>Destrucción masiva de tierras.</li></ul>
<h3>Condicionales de los puntos (informativos)</h3>
<ul>
<li>Con un game changer: en el RESTO del mazo, máximo 3 cartas de €10–20 y ninguna de €20–30. (Un game changer paga solo en su dial: no cuenta además como carta cara, así que uno barato y uno caro pesan igual. El tope duro de €30 sí se aplica a todas las cartas.)</li>
<li>Con tutores: cero game changers.</li>
<li>Con cualquier combo infinito: cero tutores.</li>
<li>Maná rápido alto (9+) y hechizos gratis altos (5+) a la vez: +2 puntos extra.</li></ul>
<h3>Qué se analiza</h3>
<p>Solo el mazo de verdad: las cartas de un <b>maybeboard</b> o un <b>sideboard</b> no se analizan, porque no se juegan. Se detectan por cabecera («SIDEBOARD:», «Maybeboard»), por comentario («// Maybeboard») y por la etiqueta de categoría de Archidekt («[Maybeboard]»).</p>
<h3>Brackets (el sistema oficial de Wizards)</h3>
<p>Aparte de los puntos del pod, cada mazo se mide con los <b>brackets</b> de Wizards. Son dos varas distintas: un mazo puede pasarse del presupuesto del pod y seguir siendo un Bracket 3 legal. Se dan dos lecturas: la lista de Wizards, que decide si cumple Bracket 3, y la estimación de Commander Spellbook, que avisa pero no suspende.</p>
<ul>
<li>Hasta <b>${BRACKET3.game_changers_max}</b> cartas de la lista de game changers.</li>
<li>Nada de destrucción masiva de tierras, ni por carta ni por combo. Cuenta también el bloqueo de maná de cartas como Winter Orb o Blood Moon, según la clasificación de Spellbook.</li>
<li>Turnos extra en poca cantidad (máximo ${BRACKET3.extra_turns_max}) y nunca encadenables ni en bucle, tampoco mediante un combo de turnos infinitos.</li>
<li>Ningún combo que <b>Commander Spellbook</b> sitúe en Bracket 4 o más (etiqueta Ruthless). Los de Bracket 3–4 (Spicy) caben, con aviso. El maná se muestra como información, no decide.</li>
<li>Y el mazo tiene que ser legal: 100 cartas, singleton, dentro de la identidad de color del comandante y sin cartas de la banlist oficial.</li></ul>
<p>Los tutores ya no tienen límite propio desde octubre de 2025: los más eficientes están en la lista de game changers. Una lista no demuestra la intención, así que la lectura va del Bracket 2 al 4: el 1 depende del tema y el 5 del metajuego competitivo.</p>
<h3>El bracket de cada combo</h3>
<p>Cada combo lleva la etiqueta de <b>Commander Spellbook</b>, de Exhibition (B1+) a Ruthless (B4+). Spellbook decide el bracket de cada combo, con su propia lógica: si una leyenda del combo es o no tu comandante, se recalcula igual que hace su estimador. Es su clasificación, no una regla de Wizards. Los combos que exigen una carta como comandante solo cuentan si esa carta está en la zona de mando.</p>
<h3>Bracket práctico</h3>
<p>El nivel del pod sale de una estimación propia de cómo juega el mazo, en la escala de brackets: los precons de caja son 2, y sube a 2*, 3, 3*, 4, 4* y 5. Tier 1 es Bracket 2, Tier 2 es 2* y Tier 3 (fuera del pod) es 3 o más. Las cartas prohibidas del pod dejan fuera a cualquier mazo. Es distinto de la lista oficial de Wizards, que se comprueba aparte. Un mazo con 10 o más cartas de 3 € o más y una lista que la gente juega se considera mejorado y sube un poco: el precio solo sirve como prueba de que no es un mazo de caja.</p>
<h3>Perfil del mazo</h3>
<p>El perfil explica el poder, y el poder decide el nivel del pod. Salt, sinergia y base de maná solo informan.</p>
<ul>
<li><b>Poder (1-10):</b> escala propia, no la de otra web. Sale de cuatro pilares (consistencia, eficiencia, interacción y formas de ganar), cada uno medido entre un precon flojo y una lista cEDH mediana. Se calibró con 36 precons y 8 listas cEDH públicas.</li>
<li><b>Salt:</b> la suma de las valoraciones de la comunidad de EDHREC para cada carta.</li>
<li><b>Sinergia:</b> cuántas cartas sin tierras tienen sinergia positiva en la página de EDHREC de tu comandante. Mide si sigues lo que juega la gente con él, así que un brew original puntúa bajo sin estar mal construido.</li>
<li><b>Qué hace cada carta:</b> sale de las etiquetas de Scryfall, que la gente asigna carta a carta. Las cartas aún sin etiquetar se leen por su texto.</li>
<li><b>Base de maná:</b> fuentes de cada color frente a sus manás en coste, tierras que siempre entran giradas y curva.</li></ul>
<h3>Precios, combos y sugerencias</h3>
<p>Los precios vienen de Scryfall (Cardmarket). El primer análisis usa la impresión por defecto; el botón «Buscar precios más baratos» busca la impresión más barata carta a carta. Los combos infinitos se comprueban automáticamente en cada análisis contra Commander Spellbook y las sugerencias de cartas salen de Scryfall ordenadas por popularidad en EDHREC, filtradas a tu identidad de color y a menos de €5 (mejoras de nivel: menos de €10). Las URLs de Archidekt se cargan a través de proxies públicos (r.jina.ai, allorigins, codetabs — se prueban en orden hasta que uno responde) porque Archidekt bloquea la lectura directa desde el navegador; si prefieres que tu mazo no pase por terceros, pega la lista en texto. Los combos se comprueban contra una base alojada en esta misma web, sin terceros.</p>`
  : `
<button id="howClose" class="modal-close" aria-label="Close">✕</button>
<h2 id="howTitle">How this guide works</h2>
<p class="lead">A deck's <b>power</b> decides its pod level. The reference is simple: <b>Tier 1 = a boxed precon</b>.</p>
<h3>Who is in the pod</h3>
<p><b>Tier 1: power up to ${pow.tier1_max}. Tier 2: up to ${pow.tier2_max}. Higher: out of the pod.</b> Banned cards keep a deck out at any power. Power is our own 1-10 scale, calibrated on 36 precons and 8 public cEDH lists.</p>
<h3>Points, as information only</h3>
<p>Points no longer decide: they measure how far a deck strays from a precon on each "dial", and price weighs heavily in them. Reference marks: ${t1} and ${t2} points.</p>
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
<li>With a game changer: in the REST of the deck, at most 3 cards at €10–20 and none at €20–30. (A game changer pays on its own dial only — it is not also counted as an expensive card, so a cheap one and a costly one weigh the same. The hard €30 cap does still apply to every card.)</li>
<li>With tutors: zero game changers.</li>
<li>With any infinite combo: zero tutors.</li>
<li>High fast mana (9+) and high free spells (5+) together: +2 extra points.</li></ul>
<h3>What gets analyzed</h3>
<p>Only the real deck: cards in a <b>maybeboard</b> or <b>sideboard</b> are not analyzed, because they are not played. They are detected by header ("SIDEBOARD:", "Maybeboard"), by comment marker ("// Maybeboard") and by Archidekt's per-line category tag ("[Maybeboard]").</p>
<h3>Brackets (Wizards' official system)</h3>
<p>Besides the pod points, every deck is measured against Wizards' <b>brackets</b>. They are two separate yardsticks: a deck can go over the pod budget and still be a legal Bracket 3 deck. You get two reads: Wizards' checklist, which decides whether the deck meets Bracket 3, and Commander Spellbook's estimate, which warns but does not fail.</p>
<ul>
<li>Up to <b>${BRACKET3.game_changers_max}</b> cards from the Game Changers list.</li>
<li>No mass land denial, by card or by combo. Mana locks such as Winter Orb or Blood Moon count too, per Spellbook's classification.</li>
<li>Extra turns in low quantities (max ${BRACKET3.extra_turns_max}), never chainable or looped, including through an infinite-turns combo.</li>
<li>No combo that <b>Commander Spellbook</b> places at Bracket 4 or higher (the Ruthless tag). Those at Bracket 3–4 (Spicy) fit, with a warning. Mana is shown for information and decides nothing.</li>
<li>And the deck has to be legal: 100 cards, singleton, inside the commander's colour identity and nothing on the official ban list.</li></ul>
<p>Tutors have had no limit of their own since October 2025: the most efficient ones are on the Game Changers list. A list cannot prove intent, so the read runs from Bracket 2 to 4: Bracket 1 depends on theme and Bracket 5 on the competitive metagame.</p>
<h3>Each combo's bracket</h3>
<p>Every combo carries <b>Commander Spellbook</b>'s tag, from Exhibition (B1+) to Ruthless (B4+). Spellbook decides each combo's bracket with its own logic: whether a legend in the combo is your commander is recalculated the way its estimator does. It is Spellbook's classification, not a Wizards rule. Combos that need a card as commander only count when that card is in the command zone.</p>
<h3>Practical bracket</h3>
<p>The pod level comes from our own estimate of how the deck plays, on the bracket scale: boxed precons are 2, rising through 2*, 3, 3*, 4, 4* and 5. Tier 1 is Bracket 2, Tier 2 is 2*, and Tier 3 (out of the pod) is 3 or higher. The pod's banned cards keep any deck out. This is separate from Wizards' official checklist, which is checked on its own. A deck with 10 or more cards worth €3 or more, on a list people actually play, counts as upgraded and rises slightly: price only serves as evidence it isn't a boxed deck.</p>
<h3>Deck profile</h3>
<p>The profile explains power, and power decides the pod level. Salt, synergy and the manabase are information only.</p>
<ul>
<li><b>Power (1-10):</b> our own scale, not another site's. It comes from four pillars (consistency, efficiency, interaction and ways to win), each measured between a weak precon and a median cEDH list. Calibrated on 36 precons and 8 public cEDH lists.</li>
<li><b>Salt:</b> EDHREC's community rating for each card, added up.</li>
<li><b>Synergy:</b> how many nonland cards have positive synergy on your commander's EDHREC page. It measures how closely you follow what people play with them, so an original brew scores low without being badly built.</li>
<li><b>What each card does:</b> this comes from Scryfall's tags, assigned by people card by card. Cards not tagged yet are read from their text.</li>
<li><b>Manabase:</b> sources of each colour against its pips, lands that always enter tapped, and the curve.</li></ul>
<h3>Prices, combos and suggestions</h3>
<p>Prices come from Scryfall (Cardmarket). The first pass uses the default printing; the "Fetch cheapest prices" button looks up the cheapest printing per card. Infinite combos are checked automatically on every analysis against Commander Spellbook and card suggestions come from Scryfall ranked by EDHREC popularity, filtered to your color identity and under €5 (tier upgrades: under €10). Archidekt URLs load through public proxies (r.jina.ai, allorigins, codetabs — tried in order until one answers) because Archidekt blocks direct browser reads; if you prefer your deck not to transit a third party, paste the list as text. Combos are checked against a database hosted on this very site — no third parties.</p>`;
  $('howBody').innerHTML = html;
  $('howClose').onclick = closeHow;
}
// Dialog semantics: focus moves into the modal on open, Tab cycles inside it,
// and closing hands focus back to the opener. Esc (wired in main.js) closes.
let opener = null;
function trapTab(e) {
  if (e.key !== 'Tab') return;
  const focusables = [...$('howBody').querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !$('howBody').contains(active))) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && (active === last || !$('howBody').contains(active))) {
    e.preventDefault(); first.focus();
  }
}
export function openHow() {
  renderHow();
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const m = $('howModal');
  m.style.display = 'block';
  document.body.classList.add('modal-open');
  m.addEventListener('keydown', trapTab);
  $('howClose').focus();
}
export function closeHow() {
  const m = $('howModal');
  if (m.style.display !== 'block') return;
  m.style.display = 'none';
  document.body.classList.remove('modal-open');
  m.removeEventListener('keydown', trapTab);
  if (opener && opener.isConnected) opener.focus();
  opener = null;
}
