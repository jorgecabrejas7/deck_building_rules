import { L } from '../i18n.js';

export const TYPES = {C:{es:'Criaturas',en:'Creatures'},I:{es:'Instantáneos',en:'Instants'},S:{es:'Conjuros',en:'Sorceries'},A:{es:'Artefactos',en:'Artifacts'},E:{es:'Encantamientos',en:'Enchantments'},P:{es:'Planeswalkers',en:'Planeswalkers'},B:{es:'Batallas',en:'Battles'},L:{es:'Tierras',en:'Lands'},O:{es:'Otros',en:'Other'}};
export const TYPE_ORDER = ['C','I','S','A','E','P','B','L','O'];
export const CATS = {land:{es:'Tierras',en:'Lands'},ramp:{es:'Rampeo',en:'Ramp'},draw:{es:'Robo',en:'Card draw'},rem:{es:'Removal',en:'Removal'},burn:{es:'Daño directo',en:'Burn'},wipe:{es:'Barridos',en:'Board wipes'},prot:{es:'Protección',en:'Protection'},ctr:{es:'Counters',en:'Counterspells'},tut:{es:'Tutores',en:'Tutors'},sac:{es:'Sacrificio',en:'Sac outlets'},drain:{es:'Drenaje',en:'Drain'},tok:{es:'Tokens',en:'Tokens'},mot:{es:'Motores',en:'Engines'},eq:{es:'Equipos y auras',en:'Equipment & Auras'},life:{es:'Lifegain',en:'Lifegain'},rec:{es:'Recursión',en:'Recursion'},anthem:{es:'Anthems',en:'Anthems'},cre:{es:'Criaturas',en:'Creatures'},oth:{es:'Otros',en:'Other'}};

// Dial display: order, names and help texts describing the REAL pod rules (v1.1).
export const DIAL_META = [
{k:'game_changers',name:{es:'Cambia-partidas',en:'Game changers'},help:{
 es:'Cartas de la lista oficial de game changers de Wizards: generan una ventaja desproporcionada por sí solas. El primero cuesta 2 puntos y cada uno más suma +1 punto extra — el contador nunca se para. Además, si llevas alguno no puedes subir de 3 cartas de €10–20 ni llevar ninguna de €20–30: es tu único lujo.',
 en:'Cards on Wizards’ official game-changer list: they generate outsized advantage on their own. The first costs 2 points and each extra adds +1 more — the counter never stops. And with any of them you can’t exceed 3 cards at €10–20 or run any at €20–30: it must be your only luxury.'}},
{k:'extra_turns',name:{es:'Turnos extra',en:'Extra turns'},help:{
 es:'Los turnos extra dejan a la mesa mirando. El primero (de un solo uso) cuesta 3 puntos y cada uno más suma +1; todos exigen justificación en mesa. Las cartas que permiten repetirlos (lista vetada) siguen prohibidas.',
 en:'Extra turns leave the table watching. The first (one-shot) costs 3 points and each extra adds +1; all of them need table justification. Cards that make them repeatable (banned list) stay forbidden.'}},
{k:'tutors',name:{es:'Tutores',en:'Tutors'},help:{
 es:'Los tutores incondicionales convierten tu mejor carta en varias copias virtuales. El primero cuesta 2 puntos, el segundo sube a 5 en total, y cada uno más suma +1. Con tutores no se permiten game changers.',
 en:'Unconditional tutors turn your best card into several virtual copies. The first costs 2 points, the second raises it to 5 total, and each extra adds +1. With tutors, no game changers allowed.'}},
{k:'stax_effects',name:{es:'Stax',en:'Stax'},help:{
 es:'Las piezas de stax frenan a toda la mesa, no solo al que va ganando. La primera es gratis (los precons llevan alguna); la segunda cuesta 1 punto, la tercera 3 en total, y cada una más suma +1.',
 en:'Stax pieces slow the whole table, not just whoever is winning. The first is free (precons run some); the second costs 1 point, the third 3 total, and each extra adds +1.'}},
{k:'counterspells',name:{es:'Contrahechizos',en:'Counterspells'},help:{
 es:'Hasta 5 counters son defensa propia razonable a nivel precon. El sexto cuesta 1 punto, el séptimo 2 en total, y cada uno más suma +1 — puedes ir de mazo contramágico si pagas el presupuesto.',
 en:'Up to 5 counterspells is reasonable self-defense at precon level. The sixth costs 1 point, the seventh 2 total, and each extra adds +1 — you can go full countermagic if you pay the budget.'}},
{k:'board_wipes',name:{es:'Barridos',en:'Board wipes'},help:{
 es:'Los barridos mantienen la mesa sana en mazos lentos. Hasta 4 gratis; el quinto cuesta 1 punto, el sexto 2 en total, y cada uno más suma +1. Ojo: un barrido premium tipo Farewell es además game changer y paga por esa vía.',
 en:'Board wipes keep the table healthy in slower decks. Up to 4 free; the fifth costs 1 point, the sixth 2 total, and each extra adds +1. Note: a premium wipe like Farewell is also a game changer and pays through that dial.'}},
{k:'free_spells',name:{es:'Hechizos gratis',en:'Free spells'},help:{
 es:'Los hechizos gratis rompen la regla básica del maná: puedes responder incluso sin maná abierto. Hasta 4 gratis (los precons llevan alguno); del quinto al octavo cuestan 1–4 puntos acumulados, y cada uno más suma +1.',
 en:'Free spells break the basic rule of mana: you can respond even fully tapped out. Up to 4 free (precons run a few); the fifth through eighth cost 1–4 cumulative points, and each extra adds +1.'}},
{k:'fast_mana',name:{es:'Maná rápido',en:'Fast mana'},help:{
 es:'Rocas y criaturas de maná de coste ≤2 (Sol Ring, sellos…). Hasta 8 es el paquete normal de un precon. De 9 a 14 cuestan 1–6 puntos acumulados, y cada una más suma +1. El maná explosivo real (Mana Crypt, rituales…) sigue directamente prohibido. Y si además llevas hechizos gratis por encima de 4, pagas +2 puntos extra.',
 en:'Mana rocks and dorks costing ≤2 (Sol Ring, signets…). Up to 8 is a normal precon package. From 9 to 14 they cost 1–6 cumulative points, and each extra adds +1. Real explosive mana (Mana Crypt, rituals…) stays outright banned. And if you also run free spells above 4, you pay +2 extra points.'}},
{k:'mass_land_denial',name:{es:'Destrucción de tierras',en:'Mass land denial'},help:{
 es:'Destrucción masiva de tierras: prohibida sin excepciones. Ningún precon la lleva y este pod tampoco.',
 en:'Mass land destruction: banned, no exceptions. No precon runs it and neither does this pod.'}},
{k:'combos',name:{es:'Combos infinitos',en:'Infinite combos'},help:{
 es:'Combos infinitos completos según Commander Spellbook (la base de combos que usa EDHREC); cada combo cuenta por separado, sin agrupar por cartas compartidas. Los 2 primeros son gratis (los precons llevan hasta 2 combos «de juguete»); cada uno más cuesta según lo compacto que sea: de 2 cartas +3, de 3 cartas +2, de 4 o más +1. Con cualquier combo, no se permiten tutores. Se comprueban automáticamente al analizar, con la base de datos alojada en esta misma web.',
 en:'Complete infinite combos per Commander Spellbook (the combo database EDHREC uses); every combo counts separately, no grouping by shared cards. The first 2 are free (precons ship up to 2 “jank” combos); each extra is priced by compactness: 2-card +3, 3-card +2, 4+ +1. With any combo, no tutors allowed. Checked automatically on every analysis, against the database hosted on this same site.'}},
{k:'price_1_5',name:{es:'Cartas €1–5',en:'Cards €1–5'},help:{
 es:'Volumen de cartas de €1–5: mide cuánto se ha optimizado el mazo por encima de un precon. Zona libre amplia (hasta 18, como el precon que más lleva); de 19 a 24 cuestan 1–2 puntos, y cada una más suma +1.',
 en:'Volume of €1–5 cards: measures how far the deck is optimized past a precon. Wide free zone (up to 18, matching the biggest precon); 19–24 cost 1–2 points, and each extra adds +1.'}},
{k:'price_10_20',name:{es:'Cartas €10–20',en:'Cards €10–20'},help:{
 es:'Las cartas de €10–20 suelen ser los staples que suben el techo del mazo. Hasta 3 gratis (los precons llegan a 3); de la cuarta a la sexta cuestan 1–3 puntos, y cada una más suma +1.',
 en:'€10–20 cards are usually the staples that raise the deck’s ceiling. Up to 3 free (precons reach 3); the fourth through sixth cost 1–3 points, and each extra adds +1.'}},
{k:'price_20_30',name:{es:'Cartas €20–30',en:'Cards €20–30'},help:{
 es:'El escalón antes del límite duro de €30. Ningún precon tiene cartas aquí: la primera cuesta 3 puntos, la segunda 5 en total, y cada una más suma +1. Por encima de €30 hace falta aprobación explícita de la mesa, eso no cambia.',
 en:'The step before the hard €30 cap. No precon has cards here: the first costs 3 points, the second 5 total, and each extra adds +1. Above €30 still needs explicit table approval — that never changes.'}}
];

// Localized names for point-breakdown entries that aren't dials
export const EXTRA_PTS = { mana_cheat_stacking: {es:'Maná rápido + hechizos gratis (acumulación)', en:'Fast mana + free spells (stacking)'} };

export const MSG = {
price_cap:{es:v=>'Carta(s) de más de €'+v.cap+': '+v.cards.join(', ')+' — necesita aprobación explícita de la mesa',
           en:v=>'Card(s) over €'+v.cap+': '+v.cards.join(', ')+' — needs explicit table approval'},
banned:{es:v=>'Carta prohibida ('+(L.es.banLabel[v.list]||v.list)+'): '+v.cards.join(', '),
        en:v=>'Banned card ('+(L.en.banLabel[v.list]||v.list)+'): '+v.cards.join(', ')},
dial_forbidden:{es:v=>dialName(v.dial,'es')+' = '+v.value+': prohibido en este pod, sin excepciones',
                en:v=>dialName(v.dial,'en')+' = '+v.value+': forbidden in this pod, no exceptions'},
conditional:{
 gc_locks_price:{es:v=>'Un game changer debe ser tu único lujo: con game changer, '+dialName(v.reqDial,'es')+' debe ser ≤ '+v.reqValue+' (tienes '+v.actual+')',
                 en:v=>'A game changer must be your only luxury: with one, '+dialName(v.reqDial,'en')+' must be ≤ '+v.reqValue+' (you have '+v.actual+')'},
 tutors_gate_gc:{es:v=>'Los tutores convierten tu mejor carta en copias virtuales: con tutores no se permiten game changers (tienes '+v.actual+')',
                 en:v=>'Tutors turn your best card in virtual copies: with tutors, no game changers allowed (you have '+v.actual+')'},
 combos_gate_tutors:{es:v=>'Un tutor convierte tu combo en consistencia de cada partida: con combos infinitos no se permiten tutores (tienes '+v.actual+')',
                     en:v=>'A tutor turns your combo into every-game consistency: with infinite combos, no tutors allowed (you have '+v.actual+')'}},
budget:{es:v=>'Gasto total de '+v.points+' puntos — supera el presupuesto de Tier 2 ('+v.max+')',
        en:v=>'Total spend of '+v.points+' points — exceeds the Tier 2 budget ('+v.max+')'},
flag_extra_turns:{es:v=>'Turno extra ('+v.cards.join(', ')+') — requiere justificación explícita en mesa',
                  en:v=>'Extra turn ('+v.cards.join(', ')+') — requires explicit table justification'},
flag_near_cap:{es:v=>v.cards.join(', ')+': en €20–30 — con subidas de precio pueden cruzar el límite de €30',
               en:v=>v.cards.join(', ')+': in €20–30 — price spikes could push them over the €30 cap'},
valid_count:{es:v=>'El mazo tiene '+v.total+' cartas (Commander son 100 con el comandante)',
             en:v=>'The deck has '+v.total+' cards (Commander is 100 including the commander)'},
valid_singleton:{es:v=>v.name+' ×'+v.qty+' — Commander es singleton (salvo tierras básicas)',
                 en:v=>v.name+' ×'+v.qty+' — Commander is singleton (except basic lands)'},
valid_identity:{es:v=>v.name+' está fuera de la identidad de color del comandante ('+v.colors.join('')+')',
                en:v=>v.name+' is outside the commander’s color identity ('+v.colors.join('')+')'},
valid_not_found:{es:v=>'No se encontró en Scryfall: «'+v.name+'» — revisa el nombre',
                 en:v=>'Not found on Scryfall: “'+v.name+'” — check the spelling'},
valid_banned_official:{es:v=>v.name+' está prohibida en Commander (banlist oficial de Wizards, aparte de las reglas del pod)',
                       en:v=>v.name+' is banned in Commander (official Wizards banlist, separate from pod rules)'},
};
// Names for point-driving keys that are not dials (price bands, conditionals).
const NONDIAL_NAMES = {
  price_30_plus:{es:'Cartas >€30',en:'Cards >€30'},
  price_under_1:{es:'Cartas <€1',en:'Cards <€1'},
  price_5_10:{es:'Cartas €5–10',en:'Cards €5–10'},
};
export function dialName(k, lang){
  const m = DIAL_META.find(d=>d.k===k);
  if (m) return m.name[lang];
  if (EXTRA_PTS[k]) return EXTRA_PTS[k][lang];
  return NONDIAL_NAMES[k] ? NONDIAL_NAMES[k][lang] : k;
}

// Why an upgrade path is closed, phrased direction-neutral (each conditional
// blocks adding either of its two dials while the other is present).
export const BLOCK_MSG = {
gc_locks_price:{es:'un game changer debe ser tu único lujo y ya llevas cartas de €10–30',
                en:'a game changer must be your only luxury and you already run €10–30 cards'},
tutors_gate_gc:{es:'tutores y game changers no pueden convivir',
                en:'tutors and game changers cannot coexist'},
combos_gate_tutors:{es:'combos infinitos y tutores no pueden convivir',
                    en:'infinite combos and tutors cannot coexist'},
};

export const BASECOMP = [['land',34,38],['ramp',8,12],['draw',8,12],['rem',8,11],['wipe',2,4],['prot',2,5]];
export const ARCH = [
{k:'voltron',name:{es:'Voltron',en:'Voltron'},spec:[['prot',6,10],['eq',8,12]],
 desc:{es:'Un solo atacante enorme: tu comandante cargado de auras y equipos hasta matar de 21 de daño de comandante.',en:'One huge attacker: your commander stacked with auras and equipment until 21 commander damage kills.'},
 how:{es:'Prioriza protección barata (botas, capas) y robo que recargue la mano tras un barrido enemigo.',en:'Prioritize cheap protection (boots, capes) and draw that refills your hand after an enemy wipe.'},
 slots:{es:['Equipos/Auras 8–12','Protección 6–10','Robo 8–10'],en:['Equipment/Auras 8–12','Protection 6–10','Draw 8–10']}},
{k:'aristocrats',name:{es:'Aristocrats',en:'Aristocrats'},spec:[['sac',5,8],['drain',4,6],['tok',8,12]],
 desc:{es:'Sacrifica tus propias criaturas para drenar vida a toda la mesa. Gana sin atacar.',en:'Sacrifice your own creatures to drain the whole table. Wins without attacking.'},
 how:{es:'Necesitas tres patas: salidas de sacrificio, material sacrificable (fichas) y drenajes tipo Blood Artist. Recursión antes que cartas caras.',en:'You need three legs: sac outlets, sac fodder (tokens) and Blood Artist–style drains. Recursion over expensive cards.'},
 slots:{es:['Salidas de sacrificio 5–8','Drenajes 4–6','Fichas 8–12'],en:['Sac outlets 5–8','Drains 4–6','Tokens 8–12']}},
{k:'control',name:{es:'Control',en:'Control'},spec:[['ctr',5,7]],
 desc:{es:'Frena a la mesa con contrahechizos y barridos hasta cerrar con un finisher tardío.',en:'Slow the table with counterspells and wipes until a late finisher closes the game.'},
 how:{es:'Roba más que nadie, contesta solo lo que te mata y respeta el límite de contrahechizos del pod (máximo 7, y del sexto en adelante cuestan puntos).',en:'Draw more than anyone, answer only what kills you, and respect the pod’s counterspell cap (7 max, and the sixth onward cost points).'},
 slots:{es:['Contrahechizos 5–7 (límite del pod)','Barridos 3–5','Robo 10–14'],en:['Counterspells 5–7 (pod cap)','Wipes 3–5','Draw 10–14']}},
{k:'midrange',name:{es:'Midrange',en:'Midrange'},spec:[],
 desc:{es:'Cartas de valor jugadas en curva: cada permanente genera ventaja por sí solo.',en:'Value cards played on curve: every permanent generates advantage on its own.'},
 how:{es:'Curva 2–4 densa, remoción flexible y amenazas que sobreviven a un barrido.',en:'Dense 2–4 curve, flexible removal, and threats that survive a wipe.'},
 slots:{es:['Amenazas de valor 12–16','Remoción 8–11','Rampa 8–10'],en:['Value threats 12–16','Removal 8–11','Ramp 8–10']}},
{k:'tokens',name:{es:'Go-Wide Tokens',en:'Go-Wide Tokens'},spec:[['tok',10,14],['anthem',4,6]],
 desc:{es:'Inunda la mesa de fichas y gana con anthems que las convierten en un ejército real.',en:'Flood the board with tokens and win with anthems that turn them into a real army.'},
 how:{es:'Generadores repetibles > efectos de un solo uso; incluye protección contra barridos.',en:'Repeatable generators > one-shot effects; include wipe protection.'},
 slots:{es:['Generadores 10–14','Anthems 4–6','Protección 3–5'],en:['Generators 10–14','Anthems 4–6','Protection 3–5']}},
{k:'aggro',name:{es:'Aggro',en:'Aggro'},spec:[],
 desc:{es:'Presión desde el turno 1: criaturas baratas y daño constante antes de que la mesa se estabilice.',en:'Pressure from turn 1: cheap creatures and constant damage before the table stabilizes.'},
 how:{es:'Curva bajísima (media < 2.5), pocas tierras que entran giradas y robo que no frene el ritmo.',en:'Very low curve (avg < 2.5), few tapped lands, and draw that doesn’t slow the tempo.'},
 slots:{es:['Criaturas ≤3 maná 20–26','Impulso/robo 6–8','Remoción 6–8'],en:['Creatures ≤3 mana 20–26','Impulse/draw 6–8','Removal 6–8']}},
{k:'equipment',name:{es:'Equipment',en:'Equipment'},spec:[['eq',10,14]],
 desc:{es:'Un arsenal de equipos y portadores intercambiables: el valor vive en los objetos, no en las criaturas.',en:'An arsenal of equipment and interchangeable bearers: the value lives in the gear, not the creatures.'},
 how:{es:'Reduce costes de equipar, incluye portadores con evasión y recuperación de equipos destruidos.',en:'Cut equip costs, include evasive bearers, and recover destroyed equipment.'},
 slots:{es:['Equipos 10–14','Portadores 12–16','Tutores de equipo 2–4'],en:['Equipment 10–14','Bearers 12–16','Gear tutors 2–4']}},
{k:'lifegain',name:{es:'Lifegain',en:'Lifegain'},spec:[['life',10,14],['drain',4,6]],
 desc:{es:'Convierte cada punto de vida ganado en cartas, fichas o drenaje. La vida es tu motor, no tu escudo.',en:'Turn every life point gained into cards, tokens or drain. Life is your engine, not your shield.'},
 how:{es:'Necesitas pagos (payoffs) repetibles; ganar vida sin pagos no hace nada en Commander.',en:'You need repeatable payoffs; gaining life without payoffs does nothing in Commander.'},
 slots:{es:['Fuentes de vida 10–14','Pagos 6–9','Drenajes 4–6'],en:['Life sources 10–14','Payoffs 6–9','Drains 4–6']}},
{k:'spellslinger',name:{es:'Spellslinger',en:'Spellslinger'},spec:[['mot',6,10]],
 desc:{es:'Instantáneos y conjuros en cadena, con permanentes que premian cada hechizo lanzado.',en:'Chained instants and sorceries, with permanents that reward every spell cast.'},
 how:{es:'Motores primero (Guttersnipe, Archmage), luego densidad de hechizos baratos que los alimenten. Ojo con los hechizos gratis: el pod los limita a 8 y cobran puntos desde el quinto.',en:'Engines first (Guttersnipe, Archmage), then a density of cheap spells to feed them. Watch free spells: the pod caps them at 8 and charges points from the fifth.'},
 slots:{es:['Motores 6–10','Hechizos ≤2 maná 18–24','Robo 10–14'],en:['Engines 6–10','Spells ≤2 mana 18–24','Draw 10–14']}},
{k:'counters',name:{es:'+1/+1 Counters',en:'+1/+1 Counters'},spec:[],
 desc:{es:'Crece tus criaturas con contadores y multiplica el efecto con proliferar y señores.',en:'Grow your creatures with counters and multiply the effect with proliferate and lords.'},
 how:{es:'Sinergia > poder individual: cada carta debería poner o aprovechar contadores.',en:'Synergy > individual power: every card should add or exploit counters.'},
 slots:{es:['Fuentes de contadores 14–18','Proliferar 4–6','Pagos 6–8'],en:['Counter sources 14–18','Proliferate 4–6','Payoffs 6–8']}},
{k:'reanimator',name:{es:'Reanimator',en:'Reanimator'},spec:[['rec',6,9]],
 desc:{es:'Tira criaturas enormes al cementerio y devuélvelas a la mesa por una fracción de su coste.',en:'Dump huge creatures into the graveyard and return them to play for a fraction of their cost.'},
 how:{es:'Equilibra tres partes: descarte/molino propio, hechizos de reanimación y objetivos que ganen solos. Recuerda que los tutores incondicionales cobran puntos en este pod.',en:'Balance three parts: self-discard/mill, reanimation spells, and targets that win on their own. Remember unconditional tutors cost points in this pod.'},
 slots:{es:['Reanimación 6–9','Autodescarte 8–10','Objetivos gordos 6–8'],en:['Reanimation 6–9','Self-discard 8–10','Fat targets 6–8']}},
{k:'generic',name:{es:'Genérico',en:'Generic'},spec:[],
 desc:{es:'Un poco de todo: bueno para precons y primeros mazos. Sin plan dominante.',en:'A bit of everything: good for precons and first decks. No dominant plan.'},
 how:{es:'Cumple los mínimos de composición base y busca poco a poco una identidad.',en:'Meet the base composition minimums and slowly find an identity.'},
 slots:{es:['Composición base','Curva media 3.0–3.5'],en:['Base composition','Avg curve 3.0–3.5']}}
];

// Plain-words definition of every category, shown behind the "?" icons.
export const CAT_HELP = {
land:{es:'Tierras: producen el maná con el que pagas todo. Un Commander típico lleva 34–38.',en:'Lands: they produce the mana that pays for everything. A typical Commander deck runs 34–38.'},
ramp:{es:'Rampeo: cartas que aceleran tu maná (rocas como Sol Ring, buscar tierras como Cultivate). Te dejan jugar cosas caras antes de tiempo.',en:'Ramp: cards that accelerate your mana (rocks like Sol Ring, land-fetch like Cultivate). They let you cast expensive things ahead of schedule.'},
draw:{es:'Robo: cartas que te dan más cartas. Sin robo te quedas sin mano hacia el turno 6 y dejas de jugar Magic.',en:'Card draw: cards that give you more cards. Without draw you run out of hand around turn 6 and stop playing Magic.'},
rem:{es:'Removal: destruir o exiliar UNA amenaza concreta (Swords to Plowshares, Beast Within). Tu seguro contra la mejor carta del rival.',en:'Removal: destroying or exiling ONE specific threat (Swords to Plowshares, Beast Within). Your insurance against the opponent’s best card.'},
burn:{es:'Daño directo: hechizos que hacen daño a criaturas o jugadores directamente (Lightning Bolt). Sirve de removal barato o de puntilla final.',en:'Burn: spells that deal damage directly to creatures or players (Lightning Bolt). Works as cheap removal or as the finishing blow.'},
wipe:{es:'Barridos (board wipes): destruyen TODAS las criaturas a la vez (Blasphemous Act, Day of Judgment). El botón de reinicio cuando la mesa se descontrola.',en:'Board wipes: destroy ALL creatures at once (Blasphemous Act, Day of Judgment). The reset button when the board gets out of hand.'},
prot:{es:'Protección: evita que maten tus piezas clave — antimaleficio, indestructible, botas (Swiftfoot Boots), o efectos tipo Propaganda que desaniman ataques.',en:'Protection: keeps your key pieces alive — hexproof, indestructible, boots (Swiftfoot Boots), or Propaganda-style attack deterrents.'},
ctr:{es:'Counters (contrahechizos): niegan un hechizo mientras se lanza (Counterspell). La única respuesta que llega ANTES de que pase la cosa mala.',en:'Counterspells: deny a spell as it’s being cast (Counterspell). The only answer that arrives BEFORE the bad thing happens.'},
tut:{es:'Tutores: buscan cualquier carta de tu biblioteca (Diabolic Tutor). Dan consistencia — y por eso cuestan puntos en este pod.',en:'Tutors: search your library for any card (Diabolic Tutor). They add consistency — which is why they cost points in this pod.'},
sac:{es:'Sacrificio: permanentes que te dejan sacrificar tus propias criaturas a voluntad (Viscera Seer). El motor de los mazos Aristocrats.',en:'Sac outlets: permanents that let you sacrifice your own creatures at will (Viscera Seer). The engine of Aristocrats decks.'},
drain:{es:'Drenaje: cada vez que muere una criatura tuya, los rivales pierden vida (Blood Artist). Gana partidas sin atacar.',en:'Drain: whenever your creatures die, opponents lose life (Blood Artist). Wins games without attacking.'},
tok:{es:'Tokens: cartas que crean fichas de criatura (Spectral Procession). Material para atacar, bloquear o sacrificar.',en:'Tokens: cards that create creature tokens (Spectral Procession). Material to attack, block or sacrifice.'},
mot:{es:'Motores: permanentes que premian lanzar hechizos (Guttersnipe, magecraft). El corazón de los mazos spellslinger.',en:'Engines: permanents that reward casting spells (Guttersnipe, magecraft). The heart of spellslinger decks.'},
eq:{es:'Equipos y auras: se pegan a una criatura para hacerla enorme o inmatable. La base de Voltron y Equipment.',en:'Equipment & Auras: attach to a creature to make it huge or unkillable. The backbone of Voltron and Equipment decks.'},
life:{es:'Lifegain: cartas que ganan vida. Solas no hacen nada — necesitan pagos que conviertan la vida en cartas, fichas o daño.',en:'Lifegain: cards that gain life. Alone they do nothing — they need payoffs that turn life into cards, tokens or damage.'},
rec:{es:'Recursión: recuperar cartas del cementerio a la mano o al campo (Eternal Witness, Animate Dead).',en:'Recursion: returning cards from the graveyard to hand or battlefield (Eternal Witness, Animate Dead).'},
anthem:{es:'Anthems: encantamientos que dan +X/+X a TODAS tus criaturas (Glorious Anthem). Convierten 10 fichas 1/1 en un ejército letal.',en:'Anthems: enchantments giving +X/+X to ALL your creatures (Glorious Anthem). They turn ten 1/1 tokens into a lethal army.'},
cre:{es:'Criaturas sin otra función detectada: tus amenazas y bloqueadores.',en:'Creatures with no other detected role: your threats and blockers.'},
oth:{es:'Otros: cartas cuya función no encaja en las categorías automáticas. Revísalas a mano.',en:'Other: cards whose role doesn’t fit the automatic categories. Review them by hand.'},
};
// Short role phrase used in "why add this card" explanations.
export const CAT_ROLE = {
ramp:{es:'acelera tu maná y adelanta tu curva',en:'accelerates your mana and speeds up your curve'},
draw:{es:'te rellena la mano y evita quedarte sin gas',en:'refills your hand so you never run out of gas'},
rem:{es:'respuesta flexible a la mejor amenaza del rival',en:'a flexible answer to the opponent’s best threat'},
wipe:{es:'resetea mesas desbocadas',en:'resets runaway boards'},
prot:{es:'mantiene vivas tus piezas clave',en:'keeps your key pieces alive'},
ctr:{es:'respuesta universal incluso en el turno del rival',en:'a universal answer even on the opponent’s turn'},
tut:{es:'da consistencia buscando tu pieza clave',en:'adds consistency by finding your key piece'},
sac:{es:'salida de sacrificio repetible para tu plan',en:'a repeatable sac outlet for your plan'},
drain:{es:'convierte cada muerte en daño a toda la mesa',en:'turns every death into table-wide damage'},
tok:{es:'genera cuerpos para ir a lo ancho',en:'makes bodies to go wide'},
mot:{es:'motor que premia cada hechizo que lanzas',en:'an engine that rewards every spell you cast'},
eq:{es:'hace letal a tu portador o comandante',en:'makes your bearer or commander lethal'},
life:{es:'fuente de vida constante para tus pagos',en:'a steady life source feeding your payoffs'},
rec:{es:'recupera valor del cementerio',en:'recovers value from the graveyard'},
anthem:{es:'multiplica todo tu ejército a la vez',en:'multiplies your whole army at once'},
burn:{es:'daño directo: removal barato o puntilla final',en:'direct damage: cheap removal or the finishing blow'},
};
export const SEGC = {cre:'oklch(0.65 0.12 300)',draw:'oklch(0.62 0.1 260)',rem:'oklch(0.75 0.09 55)',ramp:'oklch(0.7 0.1 150)',oth:'oklch(0.65 0.02 260)'};
// WUBRG pip colors live in tokens.css (--pipB is lighter in dark theme).
export const PIP = {W:'var(--pipW)',U:'var(--pipU)',B:'var(--pipB)',R:'var(--pipR)',G:'var(--pipG)'};
export const BADGE_OF = [['game_changers','GC','bad'],['extra_turns','EX','warn'],['tutors','TUT','warn'],['board_wipes','WIPE','ok'],['counterspells','CTR','ok'],['free_spells','FREE','warn'],['fast_mana','FM','ok'],['stax_effects','STAX','warn']];

// ================= samples =================
export const SAMPLES = {
s1:'1x Zinnia, Valley\'s Voice\n1x Arthur, Marigold Knight\n1x Elspeth, Sun\'s Champion\n1x Jazal Goldmane\n1x Martial Coup\n1x Storm of Souls\n1x Selfless Spirit\n1x Murmuration\n1x Blade Splicer\n1x Hanged Executioner\n1x Loyal Warhound\n1x Restoration Angel\n1x Jacked Rabbit\n1x Skyclave Apparition\n1x Dusk // Dawn\n1x Boss\'s Chauffeur\n1x Angel of the Ruins\n1x Luminous Broodmoth\n1x Sun Titan\n1x Pollywog Prodigy\n1x Fortune Teller\'s Talent\n1x Aether Channeler\n1x Pull from Tomorrow\n1x Shield Broker\n1x Stolen by the Fae\n1x Rapid Augmenter\n1x Bident of Thassa\n1x Curiosity Crafter\n1x Devilish Valet\n1x Siege-Gang Commander\n1x Echoing Assault\n1x Agate Instigator\n1x Calamity of Cinders\n1x Rose Room Treasurer\n1x Combat Celebrant\n1x Inferno Titan\n1x Time Wipe\n1x Solemn Simulacrum\n1x Helm of the Host\n1x Glacial Fortress\n1x Adarkar Wastes\n1x Temple of Enlightenment\n1x Castle Ardenvale\n1x Seachrome Coast\n1x Sulfur Falls\n1x Cascade Bluffs\n1x Exotic Orchard\n1x Clifftop Retreat\n1x Shivan Reef\n1x Temple of Triumph\n1x Battlefield Forge\n1x Skycloud Expanse\n1x Temple of Epiphany\n1x Ferrous Lake\n1x Rugged Prairie\n1x Sunscorched Divide\n1x Spirited Companion\n1x Inspiring Overseer\n1x Cut a Deal\n1x Path to Exile\n1x Illusory Ambusher\n1x Rowdy Research\n1x Plumecreed Escort\n1x Rapid Hybridization\n1x Junk Winder\n1x Aetherize\n1x Chart a Course\n1x Tetsuko Umezawa, Fugitive\n1x Thopter Engineer\n1x Cloudblazer\n1x Arcane Signet\n1x Boros Signet\n1x Ornithopter of Paradise\n1x Azorius Signet\n1x Izzet Signet\n1x Circuit Mender\n1x Fellwar Stone\n1x Sol Ring\n1x Mind Stone\n1x Terramorphic Expanse\n1x Path of Ancestry\n1x Thriving Heath\n1x Evolving Wilds\n1x Thriving Isle\n1x Thriving Bluff\n1x Command Tower\n1x Mystic Monastery\n5x Plains\n4x Island\n4x Mountain',
s2:'1x Bello, Bard of the Brambles\n1x Wildsear, Scouring Maw\n1x Domri, Anarch of Bolas\n1x Etali, Primal Storm\n1x Prosperous Bandit\n1x Pyreswipe Hawk\n1x Alchemist\'s Talent\n1x Berserkers\' Onslaught\n1x Outpost Siege\n1x Rain of Riches\n1x Chaos Warp\n1x Sunbird\'s Invocation\n1x Gratuitous Violence\n1x Warstorm Surge\n1x Starstorm\n1x Lotus Cobra\n1x Evercoat Ursine\n1x Brightcap Badger\n1x Trailtracker Scout\n1x Thickest in the Thicket\n1x Ghalta, Primal Hunger\n1x Esika\'s Chariot\n1x Unnatural Growth\n1x Greater Good\n1x Kodama of the East Tree\n1x Grothama, All-Devouring\n1x Rampaging Baloths\n1x Bootleggers\' Stash\n1x Primeval Bounty\n1x Gilded Lotus\n1x Spine of Ish Sah\n1x Temple of Abandon\n1x Karplusan Forest\n1x Exotic Orchard\n1x Sheltered Thicket\n1x Game Trail\n1x Raging Ravine\n1x Copperline Gorge\n1x Mossfire Valley\n1x Cinder Glade\n1x Rootbound Crag\n1x Mosswort Bridge\n1x Blasphemous Act\n1x Llanowar Loamspeaker\n1x Tendershoot Dryad\n1x Goreclaw, Terror of Qal Sisma\n1x Path of Discovery\n1x Decimate\n1x Rolling Hamsphere\n1x Teapot Slinger\n1x Explore\n1x Farseek\n1x Cultivate\n1x Grumgully, the Generous\n1x Wandertale Mentor\n1x Thought Vessel\n1x Arcane Signet\n1x Wooded Ridgeline\n1x Big Score\n1x Abrade\n1x Rampant Growth\n1x Sakura-Tribe Elder\n1x Beast Within\n1x Garruk\'s Packleader\n1x Harmonize\n1x Garruk\'s Uprising\n1x Gruul Signet\n1x Burnished Hart\n1x Hedron Archive\n1x Fellwar Stone\n1x Thran Dynamo\n1x Sol Ring\n1x Mind Stone\n1x Talisman of Impulse\n1x Terramorphic Expanse\n1x Path of Ancestry\n1x Gruul Turf\n1x Evolving Wilds\n1x Forgotten Cave\n1x Tranquil Thicket\n1x Command Tower\n1x Reliquary Tower\n8x Mountain\n10x Forest',
s3:'1x Niv-Mizzet, Parun\n1x Temporal Manipulation\n1x Fierce Guardianship\n1x Deflecting Swat\n1x Mana Crypt\n1x Jeska\'s Will\n1x Sol Ring\n1x Mana Vault\n1x Counterspell\n1x Negate\n1x An Offer You Can\'t Refuse\n1x Blasphemous Act\n1x Chain Reaction\n1x Mystical Tutor\n1x Ponder\n1x Preordain\n1x Brainstorm\n1x Opt\n1x Treasure Cruise\n1x Fact or Fiction\n1x Pull from Tomorrow\n1x Izzet Charm\n1x Expressive Iteration\n1x Light Up the Stage\n1x Big Score\n1x Unexpected Windfall\n1x Seize the Spoils\n1x Thrill of Possibility\n1x Valakut Awakening\n1x Curiosity\n1x Steam Augury\n1x Talrand, Sky Summoner\n1x Murmuring Mystic\n1x Young Pyromancer\n1x Third Path Iconoclast\n1x Sprite Dragon\n1x Improbable Alliance\n1x Archmage Emeritus\n1x Storm-Kiln Artist\n1x Birgi, God of Storytelling\n1x Goldspan Dragon\n1x Arcane Signet\n1x Izzet Signet\n1x Talisman of Creativity\n1x Mind Stone\n1x Fellwar Stone\n1x Lightning Bolt\n1x Chaos Warp\n1x Abrade\n1x Prismari Command\n1x Guttersnipe\n1x Electrostatic Field\n1x Firebrand Archer\n1x Kessig Flamebreather\n1x Thousand-Year Storm\n1x Dualcaster Mage\n1x Increasing Vengeance\n1x Bonus Round\n1x Reverberate\n1x Jace\'s Sanctum\n1x Ral, Storm Conduit\n1x Stormwing Entity\n1x Narset\'s Reversal\n1x Slip Out the Back\n1x Bolt Bend\n1x Command Tower\n1x Steam Vents\n1x Spirebluff Canal\n1x Shivan Reef\n1x Temple of Epiphany\n1x Izzet Boilerworks\n1x Evolving Wilds\n1x Mystic Sanctuary\n1x Desolate Lighthouse\n1x Sulfur Falls\n1x Cascade Bluffs\n1x Riverglide Pathway\n1x Frostboil Snarl\n13x Island\n9x Mountain'
};
