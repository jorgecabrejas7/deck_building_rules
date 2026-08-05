
(async () => {
"use strict";
let RULES;
try {
  RULES = await (await fetch('../rules/pod_rules.json')).json();
} catch (e) {
  document.body.innerHTML = '<div style="max-width:620px;margin:80px auto;font-family:system-ui;font-size:15px;line-height:1.7;padding:0 20px">' +
    '<h2>Pod Deck Checker</h2>' +
    '<p>No se pudieron cargar las reglas (<code>rules/pod_rules.json</code>). ' +
    'Esta app vive en la web y no funciona abriendo el archivo suelto (file://).</p>' +
    '<p>Ábrela aquí: <a href="https://jorgecabrejas7.github.io/deck_building_rules/app/">jorgecabrejas7.github.io/deck_building_rules/app/</a></p>' +
    '<p style="color:#888">Could not load the rules — this app lives on the web and does not work as a loose local file. Use the link above.</p></div>';
  return;
}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ================= i18n =================
const L = {
es:{appTag:'POD DECK CHECKER',copy:'Copiar informe',copied:'¡Copiado!',inputTitle:'ANALIZAR MAZO',
inputPh:'Pega una URL de Archidekt o una lista de cartas (una por línea: "1 Sol Ring")',
tryLabel:'Prueba con un ejemplo:',archLabel:'Arquetipo',auto:'Detección automática',analyze:'Analizar mazo',
analyzing:'Analizando…',fetchingCards:'Descargando cartas de Scryfall…',
mox:'Moxfield bloquea el acceso directo desde el navegador — pega la exportación de texto del mazo en su lugar (Export → Text).',
archErr:'Archidekt bloquea la lectura directa desde el navegador — en tu mazo usa Export → Copy to clipboard (o «Text») y pega aquí la lista.',
netErr:'Error de red hablando con Scryfall — ¿hay conexión a internet?',
tierWord:'NIVEL',tier1:'Tier 1 · Precon',tier2:'Tier 2 · Algo sobre precon',above:'Sobre el nivel del pod',
pts:'PUNTOS',price:'PRECIO',cardsN:'CARTAS',archetype:'ARQUETIPO',autoTag:'(auto)',
priceNote:'Los precios mostrados son de la impresión por defecto, no la más barata — el informe de poder puede ser pesimista.',
fetchBtn:'Buscar precios más baratos',fetchDone:'Precios más baratos aplicados — informe recalculado.',
power:'ANÁLISIS DE PODER',ptsOf:'pts gastados de',viols:'VIOLACIONES',flags:'AVISOS',tipT:'Consejo del pod',
budget:'PRESUPUESTO DE PUNTOS',comp:'COMPOSICIÓN DEL MAZO',compTargets:'objetivos:',
compHint:'Clic en una fila resalta sus cartas en el navegador ↓',clear:'Limpiar',few:'Pocas',ok:'OK',many:'Muchas',
browser:'NAVEGADOR DEL MAZO',groupBy:'Agrupar por:',byType:'Tipo de carta',byCat:'Categoría',
curve:'CURVA DE MANÁ',avg:'media',all:'Todas',cre:'Criaturas',draw:'Robo',rem:'Removal',ramp:'Rampeo',oth:'Otros',
nonlands:'no-tierras',pips:'PIPS DE COLOR',bands:'BANDAS DE PRECIO',guide:'GUÍA DE ARQUETIPOS',
build:'Construir este arquetipo →',slots:'Huecos clave:',
emptyT:'Sin mazo que analizar todavía',
emptyX:'Pega una lista o una URL de Archidekt arriba, elige arquetipo si quieres, y pulsa «Analizar mazo». O carga uno de los ejemplos.',
footer:'hecho para el pod · reglas del pod v'+RULES.version+' · precios Cardmarket vía Scryfall',
validT:'AVISOS DE CONSTRUCCIÓN',
podCap:'(límite del pod: ',
banLabel:{true_fast_mana:'maná rápido explosivo',extra_turn_recursion:'turnos extra recurrentes'},
tabLoad:'Cargar mazo',tabPower:'Poder',tabAnalysis:'Análisis',tabTips:'Consejos',tabGuide:'Guía',
commander:'COMANDANTE',
tipsT:'CONSEJOS DEL POD',tipsPower:'BAJAR DE NIVEL',tipsComp:'REDONDEAR LA COMPOSICIÓN',
tipsAdd:'Añade',tipsCutFrom:'y córtalo de',tipsCutCands:'candidatas a salir',
tipsCurated:'⚠ Sugerencias de la lista local — no se pudo consultar EDHREC/Scryfall en este momento.',
tipsLoading:'Buscando sugerencias en EDHREC/Scryfall…',
tipsNone:'Nada que arreglar: el mazo cumple los objetivos de composición de su arquetipo.',
tipsCutLabel:'corta',tipsFor:'para',
whatIf:'si la cortas',
handT:'MANO DE PRUEBA',handDraw:'Robar mano',handMull:'Mulligan',handHint:'Roba una mano inicial de 7 al azar para ver la consistencia del mazo.',
tmBtn:'Modo mesa',tmT:'MODO MESA — compara hasta 4 mazos',tmRun:'Comparar mesa',tmDeck:'Mazo',
tmHint:'Pega 2–4 listas y compara nivel y puntos de toda la mesa antes de quedar.',
tmLoad:'Cargar en el analizador',tmRunning:'Analizando mazo',
comboBtn:'Buscar combos infinitos',comboChecking:'Descargando base de combos y comprobando…',
comboProxyNote:'Descarga la base de combos de Commander Spellbook (~10 MB, alojada en esta misma web) y comprueba en tu navegador — sin terceros.',
comboNone:'Sin combos infinitos completos en el mazo.',comboUnchecked:'sin comprobar',
comboErr:'No se pudo consultar — comprueba a mano en commanderspellbook.com.',
fileProto:'Estás abriendo el archivo directamente (file://): los proxies públicos rechazan ese origen, así que Archidekt y la búsqueda de combos no funcionan así. Todo lo demás (análisis, precios, sugerencias) funciona igual. Para activarlos: sirve la página desde una web (p. ej. GitHub Pages), o pega la lista en texto y comprueba los combos a mano en commanderspellbook.com.',
comboProduces:'genera',comboOthers:'combos no infinitos detectados',
howBtn:'¿Cómo funciona?',
proxyBtn:'Intentar vía proxy público',
proxyNote:'El proxy es un servicio de terceros (corsproxy.io): tu petición del mazo pasa por él. Solo se usa si pulsas el botón.',
rampT:'ANÁLISIS DE RAMPEO',rampNone:'Este mazo no lleva aceleradores de maná detectables.',
rampPlay:'baja',rampAvail:'maná disponible',rampAhead:'te adelanta a',rampNothing:'(no hay cartas de ese coste en el mazo)',
rampAgg1:'aceleradores de maná',rampAgg2:'de maná extra potencial · curva media',
s1:'Tier 1 · Precon (Family Matters)',s2:'Tier 2 · Precon (Animated Army)',s3:'Pasado de vueltas · Spellslinger'},
en:{appTag:'POD DECK CHECKER',copy:'Copy report',copied:'Copied!',inputTitle:'ANALYZE DECK',
inputPh:'Paste an Archidekt deck URL or a card list (one per line: "1 Sol Ring")',
tryLabel:'Try a sample:',archLabel:'Archetype',auto:'Auto-detect',analyze:'Analyze deck',
analyzing:'Analyzing…',fetchingCards:'Downloading cards from Scryfall…',
mox:'Moxfield blocks direct access from browsers — paste the deck’s text export instead (Export → Text).',
archErr:'Archidekt blocks direct reads from browsers — in your deck use Export → Copy to clipboard (or "Text") and paste the list here.',
netErr:'Network error talking to Scryfall — is there an internet connection?',
tierWord:'TIER',tier1:'Tier 1 · Precon',tier2:'Tier 2 · Slightly above precon',above:'Above pod power level',
pts:'POINTS',price:'PRICE',cardsN:'CARDS',archetype:'ARCHETYPE',autoTag:'(auto)',
priceNote:'Prices shown are default printings, not the cheapest — the power report may be pessimistic.',
fetchBtn:'Fetch cheapest prices',fetchDone:'Cheapest prices applied — report recalculated.',
power:'POWER ANALYSIS',ptsOf:'pts spent of',viols:'VIOLATIONS',flags:'FLAGS',tipT:'Pod tip',
budget:'POINTS BUDGET',comp:'DECK COMPOSITION',compTargets:'targets:',
compHint:'Click a row to highlight its cards in the browser ↓',clear:'Clear',few:'Too few',ok:'OK',many:'Too many',
browser:'DECK BROWSER',groupBy:'Group by:',byType:'Card type',byCat:'Category',
curve:'MANA CURVE',avg:'avg',all:'All',cre:'Creatures',draw:'Draw',rem:'Removal',ramp:'Ramp',oth:'Other',
nonlands:'nonland',pips:'COLOR PIPS',bands:'PRICE BANDS',guide:'ARCHETYPE GUIDE',
build:'Build this archetype →',slots:'Key slots:',
emptyT:'No deck to analyze yet',
emptyX:'Paste a list or an Archidekt URL above, pick an archetype if you like, and hit "Analyze deck". Or load a sample.',
footer:'made for the pod · pod rules v'+RULES.version+' · Cardmarket prices via Scryfall',
validT:'DECKBUILDING NOTES',
podCap:'(pod cap: ',
banLabel:{true_fast_mana:'explosive fast mana',extra_turn_recursion:'repeatable extra turns'},
tabLoad:'Load deck',tabPower:'Power',tabAnalysis:'Analysis',tabTips:'Advice',tabGuide:'Guide',
commander:'COMMANDER',
tipsT:'POD ADVICE',tipsPower:'DROP A TIER',tipsComp:'ROUND OUT THE COMPOSITION',
tipsAdd:'Add',tipsCutFrom:'and cut it from',tipsCutCands:'cut candidates',
tipsCurated:'⚠ Suggestions from the built-in list — could not reach EDHREC/Scryfall right now.',
tipsLoading:'Fetching suggestions from EDHREC/Scryfall…',
tipsNone:'Nothing to fix: the deck meets its archetype composition targets.',
tipsCutLabel:'cut',tipsFor:'for',
whatIf:'if you cut it',
handT:'SAMPLE HAND',handDraw:'Draw hand',handMull:'Mulligan',handHint:'Draw a random opening 7 to feel the deck’s consistency.',
tmBtn:'Table mode',tmT:'TABLE MODE — compare up to 4 decks',tmRun:'Compare table',tmDeck:'Deck',
tmHint:'Paste 2–4 lists and compare tier and points for the whole table before game night.',
tmLoad:'Load into analyzer',tmRunning:'Analyzing deck',
comboBtn:'Find infinite combos',comboChecking:'Downloading combo database and checking…',
comboProxyNote:'Downloads the Commander Spellbook combo database (~10 MB, hosted on this same site) and checks in your browser — no third parties.',
comboNone:'No complete infinite combos in the deck.',comboUnchecked:'not checked',
comboErr:'Lookup failed — check manually on commanderspellbook.com.',
fileProto:'You are opening the file directly (file://): public proxies reject that origin, so Archidekt and the combo lookup cannot work this way. Everything else (analysis, prices, suggestions) works fine. To enable them: serve the page from the web (e.g. GitHub Pages), or paste the list as text and check combos manually on commanderspellbook.com.',
comboProduces:'produces',comboOthers:'non-infinite combos detected',
howBtn:'How it works',
proxyBtn:'Try via public proxy',
proxyNote:'The proxy is a third-party service (corsproxy.io): your deck request passes through it. Only used when you press the button.',
rampT:'RAMP ANALYSIS',rampNone:'This deck runs no detectable mana accelerators.',
rampPlay:'play',rampAvail:'mana available',rampAhead:'gets you ahead to',rampNothing:'(no cards at that cost in the deck)',
rampAgg1:'mana accelerators',rampAgg2:'of potential extra mana · avg curve',
s1:'Tier 1 · Precon (Family Matters)',s2:'Tier 2 · Precon (Animated Army)',s3:'Over the top · Spellslinger'}
};

const TYPES = {C:{es:'Criaturas',en:'Creatures'},I:{es:'Instantáneos',en:'Instants'},S:{es:'Conjuros',en:'Sorceries'},A:{es:'Artefactos',en:'Artifacts'},E:{es:'Encantamientos',en:'Enchantments'},P:{es:'Planeswalkers',en:'Planeswalkers'},B:{es:'Batallas',en:'Battles'},L:{es:'Tierras',en:'Lands'},O:{es:'Otros',en:'Other'}};
const TYPE_ORDER = ['C','I','S','A','E','P','B','L','O'];
const CATS = {land:{es:'Tierras',en:'Lands'},ramp:{es:'Rampeo',en:'Ramp'},draw:{es:'Robo',en:'Card draw'},rem:{es:'Removal',en:'Removal'},burn:{es:'Daño directo',en:'Burn'},wipe:{es:'Barridos',en:'Board wipes'},prot:{es:'Protección',en:'Protection'},ctr:{es:'Counters',en:'Counterspells'},tut:{es:'Tutores',en:'Tutors'},sac:{es:'Sacrificio',en:'Sac outlets'},drain:{es:'Drenaje',en:'Drain'},tok:{es:'Tokens',en:'Tokens'},mot:{es:'Motores',en:'Engines'},eq:{es:'Equipos y auras',en:'Equipment & Auras'},life:{es:'Lifegain',en:'Lifegain'},rec:{es:'Recursión',en:'Recursion'},anthem:{es:'Anthems',en:'Anthems'},cre:{es:'Criaturas',en:'Creatures'},oth:{es:'Otros',en:'Other'}};

// Dial display: order, names and help texts describing the REAL pod rules (v1.1).
const DIAL_META = [
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
 es:'Combos infinitos completos según Commander Spellbook (la base de combos que usa EDHREC); cada combo cuenta por separado, sin agrupar por cartas compartidas. Los 2 primeros son gratis (los precons llevan hasta 2 combos «de juguete»); cada uno más cuesta según lo compacto que sea: de 2 cartas +3, de 3 cartas +2, de 4 o más +1. Con cualquier combo, no se permiten tutores. La comprobación es opcional y pasa por un proxy externo.',
 en:'Complete infinite combos per Commander Spellbook (the combo database EDHREC uses); every combo counts separately, no grouping by shared cards. The first 2 are free (precons ship up to 2 “jank” combos); each extra is priced by compactness: 2-card +3, 3-card +2, 4+ +1. With any combo, no tutors allowed. Checking is optional and goes through an external proxy.'}},
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
const EXTRA_PTS = { mana_cheat_stacking: {es:'Maná rápido + hechizos gratis (acumulación)', en:'Fast mana + free spells (stacking)'} };

const MSG = {
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
function dialName(k, lang){ const m = DIAL_META.find(d=>d.k===k); return m? m.name[lang] : k; }

const BASECOMP = [['land',34,38],['ramp',8,12],['draw',8,12],['rem',8,11],['wipe',2,4],['prot',2,5]];
const ARCH = [
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
const CAT_HELP = {
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
const CAT_ROLE = {
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
const SEGC = {cre:'oklch(0.65 0.12 300)',draw:'oklch(0.62 0.1 260)',rem:'oklch(0.75 0.09 55)',ramp:'oklch(0.7 0.1 150)',oth:'oklch(0.65 0.02 260)'};
const PIP = {W:'oklch(0.93 0.05 95)',U:'oklch(0.7 0.11 240)',B:'oklch(0.35 0.03 300)',R:'oklch(0.6 0.17 30)',G:'oklch(0.62 0.13 150)'};
const BADGE_OF = [['game_changers','GC','bad'],['extra_turns','EX','warn'],['tutors','TUT','warn'],['board_wipes','WIPE','ok'],['counterspells','CTR','ok'],['free_spells','FREE','warn'],['fast_mana','FM','ok'],['stax_effects','STAX','warn']];

// ================= samples =================
const SAMPLES = {
s1:'1x Zinnia, Valley\'s Voice\n1x Arthur, Marigold Knight\n1x Elspeth, Sun\'s Champion\n1x Jazal Goldmane\n1x Martial Coup\n1x Storm of Souls\n1x Selfless Spirit\n1x Murmuration\n1x Blade Splicer\n1x Hanged Executioner\n1x Loyal Warhound\n1x Restoration Angel\n1x Jacked Rabbit\n1x Skyclave Apparition\n1x Dusk // Dawn\n1x Boss\'s Chauffeur\n1x Angel of the Ruins\n1x Luminous Broodmoth\n1x Sun Titan\n1x Pollywog Prodigy\n1x Fortune Teller\'s Talent\n1x Aether Channeler\n1x Pull from Tomorrow\n1x Shield Broker\n1x Stolen by the Fae\n1x Rapid Augmenter\n1x Bident of Thassa\n1x Curiosity Crafter\n1x Devilish Valet\n1x Siege-Gang Commander\n1x Echoing Assault\n1x Agate Instigator\n1x Calamity of Cinders\n1x Rose Room Treasurer\n1x Combat Celebrant\n1x Inferno Titan\n1x Time Wipe\n1x Solemn Simulacrum\n1x Helm of the Host\n1x Glacial Fortress\n1x Adarkar Wastes\n1x Temple of Enlightenment\n1x Castle Ardenvale\n1x Seachrome Coast\n1x Sulfur Falls\n1x Cascade Bluffs\n1x Exotic Orchard\n1x Clifftop Retreat\n1x Shivan Reef\n1x Temple of Triumph\n1x Battlefield Forge\n1x Skycloud Expanse\n1x Temple of Epiphany\n1x Ferrous Lake\n1x Rugged Prairie\n1x Sunscorched Divide\n1x Spirited Companion\n1x Inspiring Overseer\n1x Cut a Deal\n1x Path to Exile\n1x Illusory Ambusher\n1x Rowdy Research\n1x Plumecreed Escort\n1x Rapid Hybridization\n1x Junk Winder\n1x Aetherize\n1x Chart a Course\n1x Tetsuko Umezawa, Fugitive\n1x Thopter Engineer\n1x Cloudblazer\n1x Arcane Signet\n1x Boros Signet\n1x Ornithopter of Paradise\n1x Azorius Signet\n1x Izzet Signet\n1x Circuit Mender\n1x Fellwar Stone\n1x Sol Ring\n1x Mind Stone\n1x Terramorphic Expanse\n1x Path of Ancestry\n1x Thriving Heath\n1x Evolving Wilds\n1x Thriving Isle\n1x Thriving Bluff\n1x Command Tower\n1x Mystic Monastery\n5x Plains\n4x Island\n4x Mountain',
s2:'1x Bello, Bard of the Brambles\n1x Wildsear, Scouring Maw\n1x Domri, Anarch of Bolas\n1x Etali, Primal Storm\n1x Prosperous Bandit\n1x Pyreswipe Hawk\n1x Alchemist\'s Talent\n1x Berserkers\' Onslaught\n1x Outpost Siege\n1x Rain of Riches\n1x Chaos Warp\n1x Sunbird\'s Invocation\n1x Gratuitous Violence\n1x Warstorm Surge\n1x Starstorm\n1x Lotus Cobra\n1x Evercoat Ursine\n1x Brightcap Badger\n1x Trailtracker Scout\n1x Thickest in the Thicket\n1x Ghalta, Primal Hunger\n1x Esika\'s Chariot\n1x Unnatural Growth\n1x Greater Good\n1x Kodama of the East Tree\n1x Grothama, All-Devouring\n1x Rampaging Baloths\n1x Bootleggers\' Stash\n1x Primeval Bounty\n1x Gilded Lotus\n1x Spine of Ish Sah\n1x Temple of Abandon\n1x Karplusan Forest\n1x Exotic Orchard\n1x Sheltered Thicket\n1x Game Trail\n1x Raging Ravine\n1x Copperline Gorge\n1x Mossfire Valley\n1x Cinder Glade\n1x Rootbound Crag\n1x Mosswort Bridge\n1x Blasphemous Act\n1x Llanowar Loamspeaker\n1x Tendershoot Dryad\n1x Goreclaw, Terror of Qal Sisma\n1x Path of Discovery\n1x Decimate\n1x Rolling Hamsphere\n1x Teapot Slinger\n1x Explore\n1x Farseek\n1x Cultivate\n1x Grumgully, the Generous\n1x Wandertale Mentor\n1x Thought Vessel\n1x Arcane Signet\n1x Wooded Ridgeline\n1x Big Score\n1x Abrade\n1x Rampant Growth\n1x Sakura-Tribe Elder\n1x Beast Within\n1x Garruk\'s Packleader\n1x Harmonize\n1x Garruk\'s Uprising\n1x Gruul Signet\n1x Burnished Hart\n1x Hedron Archive\n1x Fellwar Stone\n1x Thran Dynamo\n1x Sol Ring\n1x Mind Stone\n1x Talisman of Impulse\n1x Terramorphic Expanse\n1x Path of Ancestry\n1x Gruul Turf\n1x Evolving Wilds\n1x Forgotten Cave\n1x Tranquil Thicket\n1x Command Tower\n1x Reliquary Tower\n8x Mountain\n10x Forest',
s3:'1x Niv-Mizzet, Parun\n1x Temporal Manipulation\n1x Fierce Guardianship\n1x Deflecting Swat\n1x Mana Crypt\n1x Jeska\'s Will\n1x Sol Ring\n1x Mana Vault\n1x Counterspell\n1x Negate\n1x An Offer You Can\'t Refuse\n1x Blasphemous Act\n1x Chain Reaction\n1x Mystical Tutor\n1x Ponder\n1x Preordain\n1x Brainstorm\n1x Opt\n1x Treasure Cruise\n1x Fact or Fiction\n1x Pull from Tomorrow\n1x Izzet Charm\n1x Expressive Iteration\n1x Light Up the Stage\n1x Big Score\n1x Unexpected Windfall\n1x Seize the Spoils\n1x Thrill of Possibility\n1x Valakut Awakening\n1x Curiosity\n1x Steam Augury\n1x Talrand, Sky Summoner\n1x Murmuring Mystic\n1x Young Pyromancer\n1x Third Path Iconoclast\n1x Sprite Dragon\n1x Improbable Alliance\n1x Archmage Emeritus\n1x Storm-Kiln Artist\n1x Birgi, God of Storytelling\n1x Goldspan Dragon\n1x Arcane Signet\n1x Izzet Signet\n1x Talisman of Creativity\n1x Mind Stone\n1x Fellwar Stone\n1x Lightning Bolt\n1x Chaos Warp\n1x Abrade\n1x Prismari Command\n1x Guttersnipe\n1x Electrostatic Field\n1x Firebrand Archer\n1x Kessig Flamebreather\n1x Thousand-Year Storm\n1x Dualcaster Mage\n1x Increasing Vengeance\n1x Bonus Round\n1x Reverberate\n1x Jace\'s Sanctum\n1x Ral, Storm Conduit\n1x Stormwing Entity\n1x Narset\'s Reversal\n1x Slip Out the Back\n1x Bolt Bend\n1x Command Tower\n1x Steam Vents\n1x Spirebluff Canal\n1x Shivan Reef\n1x Temple of Epiphany\n1x Izzet Boilerworks\n1x Evolving Wilds\n1x Mystic Sanctuary\n1x Desolate Lighthouse\n1x Sulfur Falls\n1x Cascade Bluffs\n1x Riverglide Pathway\n1x Frostboil Snarl\n13x Island\n9x Mountain'
};

// ================= state =================
const store = {
  get lang(){ return localStorage.getItem('pdc_lang') || 'es'; },
  set lang(v){ localStorage.setItem('pdc_lang', v); },
  get theme(){ return localStorage.getItem('pdc_theme') || ''; },
  set theme(v){ localStorage.setItem('pdc_theme', v); },
};
let cardCache = {};
try { const raw = JSON.parse(localStorage.getItem('pdc_cards_v2') || '{}');
  if (raw._ts && Date.now() - raw._ts < 30 * 864e5) cardCache = raw.cards || {};
} catch (e) {}
function persistCache(){ try { localStorage.setItem('pdc_cards_v2', JSON.stringify({ _ts: Date.now(), cards: cardCache })); } catch (e) {} }

const state = {
  lang: store.lang, theme: store.theme, sysDark: matchMedia('(prefers-color-scheme: dark)').matches,
  arch: 'auto', grp: 'type', cf: 'all', curveBin: null, hl: null, openArch: null, tab: 'load',
  deck: null,        // {entries, commanders, deckName}
  result: null,      // {stats, flagged, evalRes, cardsInfo, detected, notFound, validation, commander, whatIf}
  fetchSt: 'idle', fi: {done:0,total:0,card:''}, copied: false, busy: false, error: null,
  archFailId: null, archProxy: false,
  hand: null, combosData: null, tableOpen: false, tableTexts: ['', '', '', ''], tableResults: null, tableBusy: false,
  tipsCache: null,   // {key, html} — suggestions fetched per analysis+archetype
};
const TAB_KEYS = ['load', 'power', 'analysis', 'tips', 'guide'];
const TAB_LABEL = { load: 'tabLoad', power: 'tabPower', analysis: 'tabAnalysis', tips: 'tabTips', guide: 'tabGuide' };
const T = () => L[state.lang];

// ================= analysis pipeline =================
async function analyze() {
  const text = $('deckText').value;
  const det = PodEngine.detectInput(text);
  if (det.kind === 'moxfield') { state.error = 'mox'; renderInput(); return; }
  state.busy = true; state.error = null; renderInput();
  try {
    let parsed;
    if (det.kind === 'archidekt') {
      try { parsed = await PodEngine.fetchArchidekt(det.id, state.archProxy); }
      catch (e) { state.error = 'archErr'; state.archFailId = det.id; state.archProxy = false; state.busy = false; renderInput(); return; }
    } else {
      parsed = PodEngine.parseDecklist(text);
    }
    if (!parsed.entries.length) { state.busy = false; renderInput(); return; }
    const names = [...new Set(parsed.entries.map(e => e.name))];
    const { notFound } = await PodEngine.fetchCards(names, cardCache, p => {
      state.fi = { done: p.done, total: p.total, card: '' }; renderInput();
    });
    persistCache();
    state.deck = parsed;
    state.combosData = null;
    recompute(notFound);
    state.fetchSt = 'idle';
    state.tab = 'power';
  } catch (e) {
    console.error(e); state.error = 'netErr';
  }
  state.busy = false;
  renderAll();
}

function recompute(notFound) {
  const parsed = state.deck;
  const resolved = parsed.entries.filter(e => cardCache[e.name]);
  const { stats, flagged } = PodEngine.computeDeckStats(resolved, cardCache);
  const _cd = state.combosData && state.combosData.status === 'done' ? state.combosData : null;
  stats.combos = _cd ? _cd.count : 0;
  stats.combo_sizes = _cd ? _cd.list.filter(c => c.infinite).map(c => c.n) : [];
  const evalRes = PodEngine.evaluateDeck(stats, flagged, RULES, resolved.map(e => e.name));
  const cardsInfo = resolved.map(e => ({ card: cardCache[e.name], qty: e.quantity, name: e.name,
    cls: PodEngine.classifyCard(cardCache[e.name]) }));
  const detected = PodEngine.detectArchetype(cardsInfo);
  const commander = (parsed.commanders && parsed.commanders[0]) || PodEngine.guessCommander(resolved, cardCache);
  const commanders = parsed.commanders && parsed.commanders.length ? parsed.commanders : (commander ? [commander] : []);
  const validation = PodEngine.validateDeck(cardsInfo, commanders, cardCache,
    notFound !== undefined ? notFound : (state.result ? state.result.notFound : []));
  // what-if cut deltas for every card that drives a points dial or violation
  const drivingNames = new Set();
  for (const list of Object.values(evalRes.driving)) for (const [n] of list) drivingNames.add(n);
  const whatIf = {};
  const comboPts = evalRes.breakdown.combos || 0;
  for (const n of drivingNames) {
    const wi = PodEngine.whatIfCut(resolved, cardCache, RULES, n);
    whatIf[n] = { dPts: evalRes.points - comboPts - wi.points, tier: wi.tier,
      fixes: evalRes.violations.length > 0 && wi.violations < evalRes.violations.length };
  }
  state.result = { stats, flagged, evalRes, cardsInfo, detected, commander, commanders, whatIf,
    notFound: notFound !== undefined ? notFound : (state.result ? state.result.notFound : []), validation };
  state.hand = null;
  state.tipsCache = null;
}

let fetchCancelled = false;
async function startCheapest() {
  if (state.fetchSt !== 'idle' || !state.result) return;
  state.fetchSt = 'fetching'; fetchCancelled = false; renderBanner();
  const names = [...new Set(state.deck.entries.map(e => e.name))];
  await PodEngine.fetchCheapest(names, cardCache, p => {
    state.fi = { done: p.done, total: p.total, card: p.card || '' }; renderBanner();
  }, () => fetchCancelled);
  persistCache();
  recompute();
  state.fetchSt = 'done';
  renderAll();
}

// ================= advice (tip) =================
function buildTip() {
  const r = state.result, lang = state.lang, ev = r.evalRes;
  const t1 = RULES.tiers.tier1.max_points, t2 = RULES.tiers.tier2.max_points;
  const entries = Object.entries(ev.breakdown).sort((a, b) => b[1] - a[1]);
  const nameOf = k => EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang);
  const listCards = k => (ev.driving[k] || []).slice(0, 3).map(([n]) => n).join(', ');
  if (ev.tier === 'above') {
    const cuts = entries.slice(0, 2).map(([k, p]) => nameOf(k) + ' (−' + p + ' pts: ' + (listCards(k) || '') + ')').join('; ');
    return lang === 'es'
      ? 'Este mazo necesita recortes para sentarse en el pod. Empieza por las violaciones de arriba' + (cuts ? ', y después por lo que más puntos cuesta: ' + cuts : '') + '.'
      : 'This deck needs cuts to sit at the pod. Start with the violations above' + (cuts ? ', then with what costs the most points: ' + cuts : '') + '.';
  }
  if (ev.tier === 'tier2') {
    const need = ev.points - t1;
    const cuts = entries.map(([k, p]) => nameOf(k) + ' (+' + p + ': ' + (listCards(k) || '—') + ')').join('; ');
    return lang === 'es'
      ? 'Tier 2 con ' + ev.points + '/' + t2 + ' puntos. Para bajar a Tier 1 suelta ' + need + ' punto' + (need > 1 ? 's' : '') + ': ' + cuts + '.'
      : 'Tier 2 at ' + ev.points + '/' + t2 + ' points. To drop to Tier 1, shed ' + need + ' point' + (need > 1 ? 's' : '') + ': ' + cuts + '.';
  }
  const margin = t1 - ev.points;
  return lang === 'es'
    ? 'Mazo limpio de Tier 1: ' + ev.points + ' punto' + (ev.points === 1 ? '' : 's') + ' de los ' + t1 + ' permitidos. ' + (margin > 0 ? 'Tienes ' + margin + ' punto' + (margin > 1 ? 's' : '') + ' de margen para una mejora puntual sin salir de Tier 1.' : 'Estás justo en el límite de Tier 1.')
    : 'Clean Tier 1 deck: ' + ev.points + ' point' + (ev.points === 1 ? '' : 's') + ' of the ' + t1 + ' allowed. ' + (margin > 0 ? 'You have ' + margin + ' point' + (margin > 1 ? 's' : '') + ' of headroom for one targeted upgrade without leaving Tier 1.' : 'You are right at the Tier 1 limit.');
}

// ================= rendering =================
function applyTheme() {
  const eff = state.theme ? state.theme === 'dark' : state.sysDark;
  document.body.classList.toggle('dark', state.theme === 'dark');
  document.body.classList.toggle('light', state.theme === 'light');
  $('themeBtn').textContent = eff ? '◑' : '◐';
}

function renderHeader() {
  const t = T();
  $('appTag').textContent = t.appTag;
  $('copyBtn').textContent = '⧉ ' + (state.copied ? t.copied : t.copy);
  $('howBtn').textContent = '? ' + t.howBtn;
  $('enBtn').style.background = state.lang === 'en' ? 'var(--text)' : 'transparent';
  $('enBtn').style.color = state.lang === 'en' ? 'var(--bg)' : 'var(--muted)';
  $('esBtn').style.background = state.lang === 'es' ? 'var(--text)' : 'transparent';
  $('esBtn').style.color = state.lang === 'es' ? 'var(--bg)' : 'var(--muted)';
}

function renderInput() {
  const t = T();
  $('inputTitle').textContent = t.inputTitle;
  $('deckText').placeholder = t.inputPh;
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
    '<button data-sample="' + k + '" style="border:1px dashed var(--border);background:transparent;border-radius:99px;padding:5px 13px;font-size:12px;font-weight:600;color:var(--muted)">' + esc(t[k]) + '</button>').join('');
  for (const b of $('samples').querySelectorAll('[data-sample]'))
    b.onclick = () => { $('deckText').value = SAMPLES[b.dataset.sample]; state.error = null; renderInput(); };
  const notice = $('inputNotice');
  if (state.error === 'archErr' && state.archFailId) {
    notice.style.display = '';
    notice.innerHTML = (location.protocol === 'file:' ? '<div style="padding-bottom:6px">' + esc(t.fileProto) + '</div>' : '') +
      esc(t.archErr) + ' <button id="archProxyBtn" style="margin-left:8px;border:1px solid var(--warnBd);background:transparent;color:var(--warnFg);border-radius:7px;padding:4px 12px;font-size:12px;font-weight:600">' + t.proxyBtn + '</button>' +
      '<div style="padding-top:6px;font-size:11.5px;opacity:.85">' + t.proxyNote + '</div>';
    const pb = document.getElementById('archProxyBtn');
    if (pb) pb.onclick = () => { state.archProxy = true; state.error = null; analyze(); };
  }
  else if (state.error) { notice.style.display = ''; notice.textContent = t[state.error] || state.error; }
  else if (PodEngine.detectInput($('deckText').value).kind === 'moxfield') { notice.style.display = ''; notice.textContent = t.mox; }
  else notice.style.display = 'none';
}

function tierColors(k) {
  return { tier1: ['var(--okBg)', 'var(--okBd)', 'var(--okFg)'], tier2: ['var(--warnBg)', 'var(--warnBd)', 'var(--warnFg)'], above: ['var(--badBg)', 'var(--badBd)', 'var(--badFg)'] }[k];
}
function archKey() {
  if (state.arch !== 'auto') return state.arch;
  return state.result ? state.result.detected.key : 'generic';
}
function archName() {
  const a = ARCH.find(x => x.k === archKey()) || ARCH[ARCH.length - 1];
  return a.name[state.lang] + (state.arch === 'auto' ? ' ' + T().autoTag : '');
}

function renderSummary() {
  const t = T(), r = state.result, ev = r.evalRes;
  const [bg, bd, fg] = tierColors(ev.tier);
  const budgetN = RULES.tiers.tier2.max_points;
  const cmd = r.commander ? cardCache[r.commander] : null;
  const cmdTile = cmd
    ? '<div class="panel" style="padding:6px 14px 6px 6px;display:flex;align-items:center;gap:10px;min-width:180px">' +
      '<img src="' + (cmd.img_art || '') + '" style="width:56px;height:41px;object-fit:cover;border-radius:7px;background:var(--track)" alt="">' +
      '<div><div style="font-size:10.5px;color:var(--muted)">' + t.commander + '</div>' +
      '<div style="font-size:13px;font-weight:700;line-height:1.2">' + esc(cmd.name.split(' // ')[0]) + '</div>' +
      '<div style="display:flex;gap:3px;padding-top:3px">' + (cmd.color_identity || []).map(k =>
        '<span style="width:10px;height:10px;border-radius:50%;background:' + PIP[k] + ';border:1px solid var(--muted)"></span>').join('') + '</div></div></div>'
    : '';
  $('summary').innerHTML =
    '<div style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:12px;padding:12px 20px;display:flex;flex-direction:column;justify-content:center;min-width:200px">' +
      '<span style="font-size:10.5px;font-weight:600;letter-spacing:0.06em;color:' + fg + ';opacity:.75">' + t.tierWord + '</span>' +
      '<span style="font-size:18px;font-weight:700;color:' + fg + '">' + t[ev.tier] + '</span></div>' +
    cmdTile +
    '<div style="flex:1;min-width:280px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">' +
      stat(t.pts, ev.points + ' / ' + budgetN) +
      stat(t.price, '€' + Math.round(r.stats.total_price_eur)) +
      stat(t.cardsN, r.stats.total_cards) +
      '<div class="panel" style="padding:9px 14px"><div style="font-size:10.5px;color:var(--muted)">' + t.archetype + '</div><div style="font-size:13.5px;font-weight:600;padding-top:3px">' + esc(archName()) + '</div></div></div>';
  function stat(lbl, val) {
    return '<div class="panel" style="padding:9px 14px"><div style="font-size:10.5px;color:var(--muted)">' + lbl + '</div><div class="mono" style="font-weight:700;font-size:18px">' + val + '</div></div>';
  }
}

function renderTabbar() {
  const t = T();
  $('tabbar').innerHTML = TAB_KEYS.map(k => {
    const enabled = k === 'load' || k === 'guide' || !!state.result;
    const active = state.tab === k;
    return '<button data-tab="' + k + '" ' + (enabled ? '' : 'disabled') + ' style="border:none;border-bottom:2.5px solid ' +
      (active ? 'var(--accent)' : 'transparent') + ';background:transparent;padding:10px 18px;font-size:13.5px;font-weight:' +
      (active ? '700' : '600') + ';color:' + (active ? 'var(--text)' : enabled ? 'var(--muted)' : 'var(--faint)') +
      ';cursor:' + (enabled ? 'pointer' : 'default') + '">' + t[TAB_LABEL[k]] + '</button>';
  }).join('');
  for (const b of $('tabbar').querySelectorAll('[data-tab]'))
    b.onclick = () => { if (!b.disabled) { state.tab = b.dataset.tab; renderAll(); } };
  for (const k of TAB_KEYS) $('tab-' + k).style.display = state.tab === k ? 'flex' : 'none';
}

function renderBanner() {
  const t = T(), el = $('banner');
  if (!state.result) { el.innerHTML = ''; return; }
  if (state.fetchSt === 'idle') {
    el.innerHTML = '<div style="background:var(--warnBg);border:1px solid var(--warnBd);border-radius:12px;padding:13px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--warnFg)">' +
      '<span style="flex:1;min-width:260px">' + t.priceNote + '</span>' +
      '<button id="fetchBtn" style="border:1px solid var(--warnBd);background:transparent;color:var(--warnFg);border-radius:7px;padding:7px 16px;font-weight:600;font-size:12.5px;white-space:nowrap">' + t.fetchBtn + '</button></div>';
    $('fetchBtn').onclick = startCheapest;
  } else if (state.fetchSt === 'fetching') {
    const fi = state.fi, pct = fi.total ? Math.round(fi.done / fi.total * 100) : 0;
    el.innerHTML = '<div style="background:var(--warnBg);border:1px solid var(--warnBd);border-radius:12px;padding:13px 18px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--warnFg)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><span style="flex:1;min-width:180px">' + t.fetchBtn + '…</span>' +
      '<span class="mono" style="font-weight:600">' + fi.done + ' / ' + fi.total + (fi.card ? ' · ' + esc(fi.card) : '') + '…</span></div>' +
      '<div style="height:6px;background:var(--warnBd);border-radius:3px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--warnFg);transition:width .1s linear"></div></div></div>';
  } else {
    el.innerHTML = '<div style="background:var(--okBg);border:1px solid var(--okBd);border-radius:12px;padding:13px 18px;font-size:13px;color:var(--okFg)">✓ ' + t.fetchDone + '</div>';
  }
}

function renderPower() {
  const t = T(), r = state.result, ev = r.evalRes, lang = state.lang;
  const budgetN = RULES.tiers.tier2.max_points, t1N = RULES.tiers.tier1.max_points;
  let html = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:8px">' +
    '<span class="secT">' + t.power + '</span><span class="mono" style="font-size:11.5px;color:var(--muted)">' + ev.points + ' ' + t.ptsOf + ' ' + budgetN + '</span></div>';
  for (const m of DIAL_META) {
    const spec = RULES.dials[m.k];
    const value = r.stats[m.k] || 0;
    const stepKeys = Object.keys(spec.point_steps || {}).map(Number);
    const lastStep = stepKeys.length ? Math.max(...stepKeys) : spec.baseline_max;
    const axis = Math.max(lastStep, value, 1) * 1.4;
    const z0 = (spec.baseline_max + 0.5) / axis, z1 = Math.max((lastStep - spec.baseline_max) / axis, 0), z2 = Math.max(1 - z0 - z1, 0.08);
    const pos = Math.min(value / axis * 100, 98);
    const pts = ev.breakdown[m.k] || 0;
    const over = !!spec.forbidden && value > 0;
    const ptsLabel = over ? '✕' : (pts > 0 ? '+' + pts + (pts === 1 ? ' pt' : ' pts') : '0');
    const ptsColor = over ? 'var(--bad)' : pts === 0 ? 'var(--good)' : pts >= 3 ? 'var(--bad)' : 'var(--warn)';
    const isCombo = m.k === 'combos';
    const cd = state.combosData;
    const comboChecked = isCombo && cd && cd.status === 'done';
    const shownValue = isCombo && !comboChecked ? '–' : value;
    const chips = (!isCombo && value > spec.baseline_max ? (r.flagged[m.k] || []) : []).slice(0, 10);
    html += '<div style="display:flex;flex-direction:column;gap:12px;padding:14px 0;border-top:1px solid var(--border2)">' +
      '<div style="display:grid;grid-template-columns:minmax(120px,150px) 30px 1fr 56px;gap:12px;align-items:center;font-size:13px">' +
      '<span style="font-weight:600">' + m.name[lang] + '</span>' +
      '<span class="mono" style="font-weight:600;font-size:15px">' + shownValue + '</span>' +
      '<div style="position:relative;height:9px;display:flex;gap:2px">' +
      '<div style="flex:' + z0.toFixed(3) + ';background:var(--zoneA);border-radius:4px"></div>' +
      '<div style="flex:' + z1.toFixed(3) + ';background:var(--zoneB);border-radius:4px"></div>' +
      '<div style="flex:' + z2.toFixed(3) + ';background:var(--zoneC);border-radius:4px"></div>' +
      '<div style="position:absolute;left:' + pos.toFixed(1) + '%;top:-3px;width:2.5px;height:15px;background:var(--marker);border-radius:2px"></div></div>' +
      '<span class="mono" style="font-weight:600;font-size:12.5px;color:' + ptsColor + ';text-align:right">' + ptsLabel + '</span></div>' +
      '<div style="display:flex;gap:14px"><div style="width:3px;border-radius:2px;background:var(--border);flex:none"></div>' +
      '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
      '<div style="font-size:12.5px;line-height:1.6;color:var(--muted);max-width:760px">' + m.help[lang] + '</div>' +
      (chips.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' + chips.map(([n]) => {
        const c = cardCache[n] || {};
        return '<span style="display:flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--panel2);border-radius:99px;padding:4px 12px 4px 5px;font-size:11.5px;font-weight:600">' +
          '<span style="width:24px;height:24px;border-radius:99px;flex:none;background:var(--track) center/cover no-repeat;' + (c.img_art ? 'background-image:url(\'' + c.img_art + '\')' : '') + '"></span>' +
          esc(n) + ' <span class="mono" style="color:var(--muted)">' + (c.price != null ? '€' + c.price : '—') + '</span></span>';
      }).join('') + '</div>' : '') +
      (isCombo ? comboBlock() : '') + '</div></div></div>';
  }
  // violations + flags
  const viols = ev.violations.map(v => {
    if (v.id === 'conditional') return (MSG.conditional[v.condId] ? MSG.conditional[v.condId][lang](v) : v.condId);
    return MSG[v.id] ? MSG[v.id][lang](v) : JSON.stringify(v);
  });
  const flags = ev.flags.map(f => MSG['flag_' + f.id] ? MSG['flag_' + f.id][lang](f) : f.id);
  const nearCap = (r.flagged.price_20_30 || []).map(([n]) => n);
  if (nearCap.length) flags.push(MSG.flag_near_cap[lang]({ cards: nearCap }));
  if (viols.length) html += '<div style="margin-top:12px;background:var(--badBg);border:1px solid var(--badBd);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--badFg)">✕ ' + t.viols + '</span>' +
    viols.map(v => '<div style="font-size:13px;line-height:1.55;color:var(--badFg)">' + esc(v) + '</div>').join('') + '</div>';
  if (flags.length) html += '<div style="margin-top:10px;background:var(--warnBg);border:1px solid var(--warnBd);border-radius:10px;padding:12px 16px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--warnFg)">⚠ ' + t.flags + '</span>' +
    flags.map(f => '<div style="font-size:13px;line-height:1.55;color:var(--warnFg)">' + esc(f) + '</div>').join('') + '</div>';
  html += '<div style="margin-top:12px;background:var(--tipBg);border:1px solid var(--tipBd);border-radius:10px;padding:14px 18px;display:flex;gap:12px;align-items:flex-start">' +
    '<span class="mono" style="font-weight:700;font-size:9.5px;background:var(--tipFg);color:var(--tipBg);border-radius:5px;padding:3px 6px;flex:none;margin-top:2px">TIP</span>' +
    '<div style="font-size:12.5px;line-height:1.6;color:var(--tipFg)"><b>' + t.tipT + ':</b> ' + esc(buildTip()) + '</div></div>';
  // budget gauge — scale spans 0..(t2+3) so overspending stays visible
  const gMax = budgetN + 3;
  const pct = Math.min(ev.points / gMax * 100, 100);
  html += '<div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--muted)">' + t.budget + '</span>' +
    '<div style="position:relative;height:14px;background:var(--track);border-radius:7px">' +
    '<div style="position:absolute;left:0;top:0;bottom:0;width:' + pct.toFixed(1) + '%;background:linear-gradient(90deg,oklch(0.7 0.12 145),oklch(0.78 0.11 85) 60%,oklch(0.62 0.15 25));border-radius:7px"></div>' +
    '<div style="position:absolute;left:' + (t1N / gMax * 100).toFixed(1) + '%;top:-4px;bottom:-4px;width:2px;background:var(--muted)"></div>' +
    '<div style="position:absolute;left:' + (budgetN / gMax * 100).toFixed(1) + '%;top:-4px;bottom:-4px;width:2px;background:var(--muted)"></div></div>' +
    '<div class="mono" style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted)"><span>0</span><span>Tier 1 ≤' + t1N + '</span><span>Tier 2 ≤' + budgetN + '</span><span>' + gMax + '</span></div></div>';
  $('power').innerHTML = html;
  const cb = document.getElementById('comboBtn');
  if (cb) cb.onclick = checkCombos;
}

function comboBlock() {
  const t = T(), cd = state.combosData;
  const isFile = location.protocol === 'file:';
  if (!cd || cd.status === 'error') {
    return '<div style="display:flex;flex-direction:column;gap:8px">' +
      (isFile ? '<div style="font-size:12px;color:var(--warnFg)">' + t.fileProto + '</div>' : '') +
      (cd && cd.status === 'error' ? '<div style="font-size:12px;color:var(--badFg)">' + t.comboErr + '</div>' : '') +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button id="comboBtn" style="background:var(--accent);color:var(--accentFg);border:none;border-radius:7px;padding:7px 16px;font-size:12.5px;font-weight:600">' + t.comboBtn + '</button>' +
      '<span style="font-size:11.5px;color:var(--muted)">⚠ ' + t.comboProxyNote + '</span></div></div>';
  }
  if (cd.status === 'checking') return '<div style="font-size:12.5px;color:var(--muted)">' + t.comboChecking + '</div>';
  const inf = cd.list.filter(c => c.infinite);
  if (!inf.length) return '<div style="font-size:12.5px;color:var(--okFg)">✓ ' + t.comboNone +
    (cd.list.length ? ' (' + cd.list.length + ' ' + t.comboOthers + ')' : '') + '</div>';
  return '<div style="display:flex;flex-direction:column;gap:6px">' + inf.map(c =>
    '<div style="font-size:12.5px;line-height:1.5"><b>' + c.cards.map(esc).join(' + ') + '</b>' +
    ' <span style="color:var(--muted)">→ ' + esc(c.features[0] || '') + '</span></div>').join('') + '</div>';
}

let comboDb = null;
async function checkCombos() {
  if (!state.result || (state.combosData && state.combosData.status === 'checking')) return;
  state.combosData = { status: 'checking', list: [], count: 0 };
  renderPower();
  try {
    if (!comboDb) comboDb = await (await fetch('../data/combos.json')).json();
    const list = PodEngine.matchCombos(state.deck.entries.map(e => e.name), comboDb);
    state.combosData = { status: 'done', list, count: list.length, dbVersion: comboDb.version };
    recompute();
  } catch (e) {
    console.error(e);
    state.combosData = { status: 'error', list: [], count: 0 };
  }
  renderAll();
}

function renderValidation() {
  const t = T(), r = state.result, lang = state.lang, el = $('validation');
  if (!r.validation.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<div style="background:var(--panel);border:1px dashed var(--warnBd);border-radius:12px;padding:14px 18px;display:flex;flex-direction:column;gap:6px">' +
    '<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;color:var(--muted)">' + t.validT + '</span>' +
    r.validation.slice(0, 12).map(v => '<div style="font-size:12.5px;line-height:1.5;color:var(--muted)">· ' + esc(MSG['valid_' + v.id][lang](v)) + '</div>').join('') +
    (r.validation.length > 12 ? '<div style="font-size:12px;color:var(--faint)">+' + (r.validation.length - 12) + '…</div>' : '') + '</div>';
}

function compSlots() {
  const a = ARCH.find(x => x.k === archKey());
  const merged = new Map(BASECOMP.map(([c, mn, mx]) => [c, [mn, mx]]));
  for (const [c, mn, mx] of (a && a.spec) || []) merged.set(c, [mn, mx]);
  return [...merged.entries()].map(([cat, [mn, mx]]) => ({ cat, min: mn, max: mx }));
}
function tagCount(cat) {
  return state.result.cardsInfo.reduce((s, x) => s + ((x.cls.cat === cat || x.cls.tags.includes(cat)) ? x.qty : 0), 0);
}

function renderComp() {
  const t = T(), lang = state.lang;
  let html = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap">' +
    '<span style="font-size:12px;font-weight:700;letter-spacing:0.06em;color:var(--compMut)">' + t.comp + '</span>' +
    '<span style="font-size:11px;color:var(--compMut)">' + t.compTargets + ' ' + esc(archName()) + '</span></div><div style="display:flex;flex-direction:column">';
  for (const s of compSlots()) {
    const v = tagCount(s.cat);
    const scale = Math.max(s.max * 1.5, v * 1.15, 1);
    const status = v < s.min ? 'few' : v > s.max ? 'many' : 'ok';
    html += '<div data-hl="' + s.cat + '" style="display:grid;grid-template-columns:minmax(90px,130px) 1fr minmax(120px,auto);gap:12px;align-items:center;font-size:13px;padding:9px 10px;border-radius:8px;cursor:pointer;background:' + (state.hl === s.cat ? 'var(--panel)' : 'transparent') + '">' +
      '<span style="font-weight:600">' + catLabel(s.cat, lang) + '</span>' +
      '<div style="position:relative;height:9px;background:var(--compBd);border-radius:5px">' +
      '<div style="position:absolute;left:' + (s.min / scale * 100).toFixed(1) + '%;width:' + ((s.max - s.min) / scale * 100).toFixed(1) + '%;top:0;bottom:0;background:' + (state.hl === s.cat ? 'var(--accent)' : 'var(--faint)') + ';border-radius:5px"></div>' +
      '<div style="position:absolute;left:' + Math.min(v / scale * 100, 98).toFixed(1) + '%;top:-3px;width:2.5px;height:15px;background:var(--marker);border-radius:2px"></div></div>' +
      '<span style="justify-self:end;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:' + (status === 'ok' ? 'var(--okBg)' : 'var(--warnBg)') + ';color:' + (status === 'ok' ? 'var(--okFg)' : 'var(--warnFg)') + '">' + t[status] + ' · ' + v + '/' + s.min + '–' + s.max + '</span></div>';
  }
  html += '</div><div style="display:flex;gap:10px;align-items:center;font-size:11.5px;color:var(--compMut)"><span>' + t.compHint + '</span>' +
    (state.hl ? '<button id="clearHl" style="border:1px solid var(--compBd);background:transparent;color:var(--compMut);border-radius:99px;padding:3px 12px;font-size:11px;font-weight:600">✕ ' + t.clear + ': ' + CATS[state.hl][lang] + '</button>' : '') + '</div>';
  $('comp').innerHTML = html;
  for (const row of $('comp').querySelectorAll('[data-hl]'))
    row.onclick = () => { state.hl = state.hl === row.dataset.hl ? null : row.dataset.hl; renderComp(); renderBrowser(); };
  const cl = $('clearHl'); if (cl) cl.onclick = () => { state.hl = null; renderComp(); renderBrowser(); };
}

function badgeFor(name) {
  const r = state.result;
  for (const [dial, label, tone] of BADGE_OF) {
    const spec = RULES.dials[dial];
    if (!spec) continue;
    const inDial = (r.flagged[dial] || []).some(([n]) => n === name);
    if (inDial && ((r.stats[dial] || 0) > spec.baseline_max || dial === 'game_changers')) {
      const bg = tone === 'bad' ? 'var(--badBg)' : tone === 'warn' ? 'var(--warnBg)' : 'var(--border2)';
      const fg = tone === 'bad' ? 'var(--badFg)' : tone === 'warn' ? 'var(--warnFg)' : 'var(--muted)';
      return { label, bg, fg };
    }
  }
  return null;
}

function renderBrowser() {
  const t = T(), lang = state.lang, r = state.result;
  const byT = state.grp === 'type';
  $('gtBtn').style.background = byT ? 'var(--text)' : 'transparent'; $('gtBtn').style.color = byT ? 'var(--bg)' : 'var(--muted)';
  $('gcBtn').style.background = !byT ? 'var(--text)' : 'transparent'; $('gcBtn').style.color = !byT ? 'var(--bg)' : 'var(--muted)';
  $('browserT').textContent = t.browser; $('groupByLbl').textContent = t.groupBy;
  $('gtBtn').textContent = t.byType; $('gcBtn').textContent = t.byCat;
  const gmap = {};
  for (const x of r.cardsInfo) { const g = byT ? x.cls.type : x.cls.cat; (gmap[g] = gmap[g] || []).push(x); }
  const cnt = {}; for (const [g, arr] of Object.entries(gmap)) cnt[g] = arr.reduce((sum, x) => sum + x.qty, 0);
  const order = byT ? TYPE_ORDER.filter(k => gmap[k]) : Object.keys(gmap).sort((a, b) => cnt[b] - cnt[a]);
  $('groups').innerHTML = order.map(g => {
    const label = byT ? TYPES[g][lang] : (CATS[g] ? CATS[g][lang] : g);
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="font-size:12px;font-weight:700;color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:6px;letter-spacing:0.05em">' +
      esc(label.toUpperCase()) + ' · ' + cnt[g] + (!byT ? helpIcon(g) : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">' +
      gmap[g].sort((a, b) => (a.card.cmc || 0) - (b.card.cmc || 0) || a.name.localeCompare(b.name)).map(x => {
        const badge = badgeFor(x.name);
        const dim = state.hl && x.cls.cat !== state.hl && !x.cls.tags.includes(state.hl);
        const hit = state.hl && !dim;
        const mana = (x.card.mana_cost || '').replace(/[{}]/g, '') || '—';
        const wi = whatIfChip(x.name);
        return '<div class="cardTile" data-name="' + esc(x.name) + '" style="position:relative;display:flex;flex-direction:column;background:var(--panel2);border:1.5px solid ' + (hit ? 'var(--accent)' : 'var(--border)') + ';border-radius:10px;overflow:hidden;opacity:' + (dim ? 0.4 : 1) + '">' +
          '<img src="' + (x.card.img_art || '') + '" loading="lazy" style="width:100%;aspect-ratio:1.85;object-fit:cover;background:var(--track)" alt="">' +
          '<div style="position:absolute;top:5px;right:5px;display:flex;gap:4px">' +
          (badge ? '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:5px;background:' + badge.bg + ';color:' + badge.fg + ';box-shadow:0 1px 4px rgba(0,0,0,.35)">' + badge.label + '</span>' : '') +
          wi + '</div>' +
          '<div style="padding:7px 9px 8px;display:flex;flex-direction:column;gap:2px">' +
          '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.name.split(' // ')[0]) + '</div>' +
          '<div class="mono" style="font-size:10px;color:var(--muted)">' + esc(mana) + ' · ' + (x.card.price != null ? '€' + x.card.price : '—') + (x.qty > 1 ? ' · x' + x.qty : '') + '</div></div></div>';
      }).join('') + '</div></div>';
  }).join('');
  $('groups').style.display = 'flex';
  $('groups').style.flexDirection = 'column';
  $('groups').style.gap = '22px';
  $('groups').style.gridTemplateColumns = '';
  $('groups').style.alignItems = 'stretch';
  for (const tile of $('groups').querySelectorAll('.cardTile')) {
    tile.onmouseenter = () => {
      const c = cardCache[tile.dataset.name]; if (!c || !c.img_normal) return;
      const rect = tile.getBoundingClientRect();
      let x = rect.right + 12; if (x + 276 > innerWidth) x = Math.max(8, rect.left - 288);
      const y = Math.max(10, Math.min(rect.top - 60, innerHeight - 390));
      const pop = $('popover');
      pop.style.display = ''; pop.style.left = x + 'px'; pop.style.top = y + 'px';
      pop.style.backgroundImage = "url('" + c.img_normal + "')";
    };
    tile.onmouseleave = () => { $('popover').style.display = 'none'; };
    for (const img of tile.querySelectorAll('img')) img.onerror = () => {
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="170" height="92"><rect width="170" height="92" fill="#8a8794"/><text x="85" y="52" font-family="monospace" font-size="26" fill="#fff" text-anchor="middle">' + tile.dataset.name.charAt(0) + '</text></svg>');
    };
  }
}

function whatIfChip(name) {
  const r = state.result;
  const wi = r && r.whatIf && r.whatIf[name];
  if (!wi || (wi.dPts <= 0 && !wi.fixes)) return '';
  const t = T();
  const tierUp = wi.tier !== r.evalRes.tier;
  const label = (wi.dPts > 0 ? '−' + wi.dPts + ' pt' + (wi.dPts > 1 ? 's' : '') : '') +
    (tierUp ? (wi.dPts > 0 ? ' → ' : '→ ') + t[wi.tier].split(' · ')[0] : '');
  if (!label) return '';
  return '<span title="' + t.whatIf + '" style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;background:var(--okBg);color:var(--okFg);flex:none;white-space:nowrap">✂ ' + label + '</span>';
}

// ---------------- Consejos (tips) tab ----------------
function deckColorIdentity() {
  const r = state.result;
  const cmd = r.commander && cardCache[r.commander];
  if (cmd && cmd.color_identity && cmd.color_identity.length) return cmd.color_identity;
  const ci = new Set();
  for (const x of r.cardsInfo) for (const c of x.card.color_identity || []) ci.add(c);
  return [...ci];
}

function helpIcon(cat) {
  if (!CAT_HELP[cat]) return '';
  return '<span class="catHelp" data-cat="' + cat + '" style="display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1.2px solid var(--muted);color:var(--muted);font-size:10px;font-weight:700;cursor:help;vertical-align:1px;margin-left:5px">?</span>';
}
function catLabel(cat, lang) { return esc(CATS[cat][lang]) + helpIcon(cat); }

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
    ? '<img src="' + c.img_normal + '" loading="lazy" style="width:100%;border-radius:10px;background:var(--track);aspect-ratio:0.717" alt="">'
    : '<div style="width:100%;aspect-ratio:0.717;border:1px solid var(--border);border-radius:10px;display:grid;place-items:center;font-size:13px;font-weight:700;padding:8px;box-sizing:border-box;text-align:center">' + esc(c.name) + '</div>';
  return '<div class="sugTile" data-img="' + esc(c.img_normal || '') + '" style="display:flex;flex-direction:column;gap:7px">' + img +
    '<div style="font-size:12.5px;font-weight:700;line-height:1.25">' + esc(c.name) +
    (price ? ' <span class="mono" style="color:var(--muted);font-weight:600">' + price + '</span>' : '') + '</div>' +
    '<div style="font-size:11.5px;color:var(--muted);line-height:1.5">' + esc(whyAdd(c, cat)) + '</div></div>';
}

function sugChip(c) {
  const price = c.price != null ? '€' + c.price : '';
  return '<span class="sugTile" data-img="' + esc(c.img_normal || '') + '" style="display:flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--panel2);border-radius:99px;padding:4px 12px 4px 5px;font-size:11.5px;font-weight:600;cursor:default">' +
    '<span style="width:24px;height:24px;border-radius:99px;flex:none;background:var(--track) center/cover no-repeat;' + (c.img_art ? "background-image:url('" + c.img_art + "')" : '') + '"></span>' +
    esc(c.name) + (price ? ' <span class="mono" style="color:var(--muted)">' + price + '</span>' : '') + '</span>';
}

function bindSugPopovers(root) {
  for (const el of root.querySelectorAll('.sugTile')) {
    el.onmouseenter = () => {
      const src = el.dataset.img; if (!src) return;
      const rect = el.getBoundingClientRect();
      let x = rect.right + 12; if (x + 276 > innerWidth) x = Math.max(8, rect.left - 288);
      const y = Math.max(10, Math.min(rect.top - 60, innerHeight - 390));
      const pop = $('popover');
      pop.style.display = ''; pop.style.left = x + 'px'; pop.style.top = y + 'px';
      pop.style.backgroundImage = "url('" + src + "')";
    };
    el.onmouseleave = () => { $('popover').style.display = 'none'; };
  }
}

function tipsKey() {
  return state.result.stats.total_price_eur + '|' + state.result.stats.total_cards + '|' + archKey() + '|' + state.lang + '|' + state.fetchSt;
}

function renderTips() {
  const t = T(), r = state.result, lang = state.lang, ev = r.evalRes;
  if (state.tipsCache && state.tipsCache.key === tipsKey()) {
    $('tips').innerHTML = state.tipsCache.html;
    bindSugPopovers($('tips'));
    return;
  }
  // synchronous part first (power advice), async suggestions fill in after
  let html = '<div class="panel" style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">' +
    '<span class="secT">' + t.tipsT + '</span>' +
    '<div style="background:var(--tipBg);border:1px solid var(--tipBd);border-radius:10px;padding:14px 18px;font-size:13px;line-height:1.65;color:var(--tipFg)">' + esc(buildTip()) + '</div>';
  const entries = Object.entries(ev.breakdown).sort((a, b) => b[1] - a[1]);
  if (entries.length || ev.violations.length) {
    html += '<span class="secT" style="font-size:11px">' + t.tipsPower + '</span>';
    for (const [k, pts] of entries) {
      const nameK = EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang);
      const cards = (ev.driving[k] || []).slice(0, 8);
      html += '<div style="display:flex;flex-direction:column;gap:8px;border:1px solid var(--border2);border-radius:10px;padding:12px 14px">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px"><b>' + esc(nameK) + '</b>' +
        '<span class="mono" style="color:var(--warn);font-weight:700">+' + pts + ' pts</span></div>' +
        (cards.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' + cards.map(([n]) => {
          const c = cardCache[n] || { name: n };
          const wi = r.whatIf[n];
          return sugChip({ name: n, price: c.price, img_art: c.img_art, img_normal: c.img_normal }) +
            (wi && wi.dPts > 0 ? '<span style="align-self:center;font-size:10px;font-weight:700;color:var(--good)">✂ −' + wi.dPts + ' ' + t.whatIf + '</span>' : '');
        }).join('') + '</div>' : '') + '</div>';
    }
  }
  html += '</div>';
  // composition advice placeholder — filled by async fetch
  html += '<div class="panel" id="tipsComp" style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">' +
    '<span class="secT">' + t.tipsComp + '</span><div style="font-size:12.5px;color:var(--muted)">' + t.tipsLoading + '</div></div>';
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
    body += '<div style="display:flex;flex-direction:column;gap:12px;border:1px solid var(--border2);border-radius:12px;padding:16px 18px">' +
      '<div style="font-size:14.5px"><b>' + catLabel(sl.cat, lang) + '</b> — ' + sl.v + '/' + sl.min + '–' + sl.max +
      ' <span style="color:var(--warnFg);font-weight:700">' + t.few + '</span></div>';
    if (sug.cards.length) {
      body += '<div style="font-size:12.5px;color:var(--muted)">' + t.tipsAdd + ' ' + esc(CATS[sl.cat][lang]).toLowerCase() + ':</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px">' +
        sug.cards.map(c => bigSugTile(c, sl.cat)).join('') + '</div>';
    }
    const cutBlocks = many.map(m => {
      const cands = cutCandsOf(m);
      if (!cands.length) return '';
      return '<div style="font-size:12.5px;color:var(--muted);line-height:1.6">' + t.tipsCutFrom + ' <b>' + catLabel(m.cat, lang) + '</b>: ' +
        cands.map(x => esc(x.name) + ' <span style="color:var(--faint)">(' + esc(whyCut(x, m)) + ')</span>').join(' · ') + '</div>';
    }).filter(Boolean).join('');
    body += cutBlocks + '</div>';
  }
  if (!few.length) {
    if (many.length) {
      body += many.map(m => {
        const cands = cutCandsOf(m);
        return '<div style="font-size:13px;color:var(--muted);line-height:1.7"><b>' + catLabel(m.cat, lang) + '</b> ' + m.v + '/' + m.min + '–' + m.max +
          ' (' + t.many.toLowerCase() + ') — ' + t.tipsCutLabel + ': ' +
          cands.map(x => esc(x.name) + ' <span style="color:var(--faint)">(' + esc(whyCut(x, m)) + ')</span>').join(' · ') + '</div>';
      }).join('');
    } else {
      body += '<div style="font-size:13px;color:var(--muted)">' + t.tipsNone + '</div>';
    }
  }
  if (usedCurated) body += '<div style="font-size:12px;color:var(--warnFg)">' + t.tipsCurated + '</div>';
  const el = $('tipsComp');
  if (!el || tipsKey() !== key) return; // state changed while fetching
  el.innerHTML = '<span class="secT">' + t.tipsComp + '</span>' + body;
  bindSugPopovers(el);
  state.tipsCache = { key, html: $('tips').innerHTML };
}

// ---------------- ramp castability ----------------
function renderRamp() {
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
    html += '<div style="font-size:12.5px;color:var(--muted)">' + t.rampNone + '</div>';
  } else {
    const nl = r.cardsInfo.filter(x => x.cls.type !== 'L');
    const totalProd = ramps.reduce((sum, e) => sum + e.prod * e.x.qty, 0);
    const nlQty = nl.reduce((sum, x) => sum + x.qty, 0) || 1;
    const avg = (nl.reduce((sum, x) => sum + (x.card.cmc || 0) * x.qty, 0) / nlQty).toFixed(2);
    html += '<div style="font-size:12.5px;color:var(--muted)">' + ramps.length + ' ' + t.rampAgg1 + ' · +' + totalProd + ' ' + t.rampAgg2 + ' ' + avg + '</div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px">' + ramps.map(({ x, prod, landR }) => {
      const c = x.card;
      const playT = Math.max(Math.ceil(c.cmc || 1), 1);
      const nextT = playT + 1;
      const avail = nextT + prod;  // a land per turn + this accelerator
      const examples = nl.filter(y => Math.floor(y.card.cmc || 0) === avail && y.name !== x.name)
        .sort((a, b) => (a.card.edhrec_rank || 1e9) - (b.card.edhrec_rank || 1e9)).slice(0, 3);
      const exStr = examples.length
        ? examples.map(y => '<b>' + esc(y.name) + '</b>').join(', ')
        : '<span style="color:var(--faint)">' + t.rampNothing + '</span>';
      const sentence = P
        ? 'T' + playT + ': ' + t.rampPlay + ' <b>' + esc(x.name) + '</b> → T' + nextT + ': ' + avail + ' ' + t.rampAvail +
          (landR ? ' (busca tierra)' : ' (+' + prod + ')') + ' — ' + t.rampAhead + ': ' + exStr
        : 'T' + playT + ': ' + t.rampPlay + ' <b>' + esc(x.name) + '</b> → T' + nextT + ': ' + avail + ' ' + t.rampAvail +
          (landR ? ' (fetches a land)' : ' (+' + prod + ')') + ' — ' + t.rampAhead + ': ' + exStr;
      return '<div class="sugTile" data-img="' + esc(c.img_normal || '') + '" style="display:flex;gap:10px;align-items:center;border:1px solid var(--border2);border-radius:10px;padding:8px 12px">' +
        '<span style="width:34px;height:34px;border-radius:8px;flex:none;background:var(--track) center/cover no-repeat;' + (c.img_art ? "background-image:url('" + c.img_art + "')" : '') + '"></span>' +
        '<div style="font-size:12.5px;line-height:1.55">' + sentence + '</div></div>';
    }).join('') + '</div>';
  }
  $('rampPanel').innerHTML = html;
  bindSugPopovers($('rampPanel'));
}

// ---------------- sample hand ----------------
function drawHand() {
  const r = state.result;
  const pool = [];
  for (const x of r.cardsInfo) {
    const isCmd = r.commanders && r.commanders.includes(x.name);
    for (let i = 0; i < x.qty - (isCmd ? 1 : 0); i++) pool.push(x.name);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  state.hand = pool.slice(0, 7);
  renderHand();
}

function renderHand() {
  const t = T();
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
    '<span class="secT">' + t.handT + '</span>' +
    '<div style="display:flex;gap:8px">' +
    '<button id="handDrawBtn" style="background:var(--accent);color:var(--accentFg);border:none;border-radius:7px;padding:7px 16px;font-size:12.5px;font-weight:600">' + (state.hand ? t.handMull : t.handDraw) + '</button></div></div>';
  if (!state.hand) html += '<div style="font-size:12.5px;color:var(--muted)">' + t.handHint + '</div>';
  else html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px">' +
    state.hand.map(n => {
      const c = cardCache[n] || {};
      return c.img_normal
        ? '<img src="' + c.img_normal + '" loading="lazy" style="width:100%;border-radius:8px;background:var(--track)" alt="' + esc(n) + '">'
        : '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;font-size:12px;min-height:80px">' + esc(n) + '</div>';
    }).join('') + '</div>';
  $('handPanel').innerHTML = html;
  $('handDrawBtn').onclick = drawHand;
}

// ---------------- pod table mode ----------------
function renderTableMode() {
  const t = T();
  $('tableModeBtn').textContent = t.tmBtn;
  const el = $('tableMode');
  if (!state.tableOpen) { el.style.display = 'none'; return; }
  el.style.display = '';
  let html = '<div class="panel" style="padding:20px;display:flex;flex-direction:column;gap:12px">' +
    '<span class="secT">' + t.tmT + '</span>' +
    '<div style="font-size:12px;color:var(--muted)">' + t.tmHint + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">' +
    [0, 1, 2, 3].map(i => '<textarea data-tm="' + i + '" rows="8" class="mono" placeholder="' + t.tmDeck + ' ' + (i + 1) + '" style="border:1px solid var(--border);border-radius:8px;background:var(--panel2);padding:10px;font-size:11px;resize:vertical">' + esc(state.tableTexts[i]) + '</textarea>').join('') + '</div>' +
    '<div><button id="tmRunBtn" ' + (state.tableBusy ? 'disabled' : '') + ' style="background:var(--accent);color:var(--accentFg);border:none;border-radius:8px;padding:10px 24px;font-weight:600;font-size:13.5px">' +
    (state.tableBusy ? t.tmRunning + '…' : t.tmRun) + '</button></div>';
  if (state.tableResults) {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
      '<tr style="text-align:left;color:var(--muted);font-size:11px"><th style="padding:8px">' + t.tmDeck + '</th><th>' + t.tierWord + '</th><th>' + t.pts + '</th><th>' + t.price + '</th><th>GC</th><th>' + t.archetype + '</th><th></th></tr>' +
      state.tableResults.map((d, i) => {
        const [bg, bd, fg] = tierColors(d.tier);
        return '<tr style="border-top:1px solid var(--border2)"><td style="padding:9px 8px;font-weight:600">' + esc(d.name) + '</td>' +
          '<td><span style="background:' + bg + ';border:1px solid ' + bd + ';color:' + fg + ';border-radius:99px;padding:3px 12px;font-size:11.5px;font-weight:700;white-space:nowrap">' + T()[d.tier] + '</span></td>' +
          '<td class="mono">' + d.pts + '</td><td class="mono">€' + Math.round(d.price) + '</td><td class="mono">' + d.gc + '</td><td>' + esc(d.arch) + '</td>' +
          '<td><button data-tmload="' + i + '" style="border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:7px;padding:4px 10px;font-size:11px;font-weight:600">' + t.tmLoad + '</button></td></tr>';
      }).join('') + '</table></div>';
  }
  html += '</div>';
  el.innerHTML = html;
  for (const ta of el.querySelectorAll('[data-tm]'))
    ta.oninput = () => { state.tableTexts[+ta.dataset.tm] = ta.value; };
  $('tmRunBtn').onclick = runTableMode;
  for (const b of el.querySelectorAll('[data-tmload]'))
    b.onclick = () => { $('deckText').value = state.tableTexts.filter(x => x.trim())[+b.dataset.tmload]; analyze(); };
}

async function runTableMode() {
  if (state.tableBusy) return;
  const texts = state.tableTexts.filter(x => x.trim());
  if (!texts.length) return;
  state.tableBusy = true; renderTableMode();
  const results = [];
  try {
    for (const text of texts) {
      const parsed = PodEngine.parseDecklist(text);
      const names = [...new Set(parsed.entries.map(e => e.name))];
      await PodEngine.fetchCards(names, cardCache, () => {});
      const resolved = parsed.entries.filter(e => cardCache[e.name]);
      const { stats, flagged } = PodEngine.computeDeckStats(resolved, cardCache);
      const ev = PodEngine.evaluateDeck(stats, flagged, RULES, resolved.map(e => e.name));
      const cardsInfo = resolved.map(e => ({ card: cardCache[e.name], qty: e.quantity, name: e.name, cls: PodEngine.classifyCard(cardCache[e.name]) }));
      const det = PodEngine.detectArchetype(cardsInfo);
      const cmd = (parsed.commanders && parsed.commanders[0]) || PodEngine.guessCommander(resolved, cardCache);
      const a = ARCH.find(x => x.k === det.key) || ARCH[ARCH.length - 1];
      results.push({ name: cmd ? cmd.split(' // ')[0] : T().tmDeck + ' ' + (results.length + 1),
        tier: ev.tier, pts: ev.points, price: stats.total_price_eur, gc: stats.game_changers, arch: a.name[state.lang] });
    }
    persistCache();
    state.tableResults = results;
  } catch (e) { console.error(e); state.error = 'netErr'; }
  state.tableBusy = false;
  renderTableMode(); renderInput();
}

function segOf(x) {
  if (x.cls.type === 'C') return 'cre';
  const k = x.cls.cat;
  if (k === 'draw') return 'draw';
  if (k === 'rem' || k === 'wipe' || k === 'burn') return 'rem';
  if (k === 'ramp') return 'ramp';
  return 'oth';
}

function renderCurve() {
  const t = T(), r = state.result;
  const nl = r.cardsInfo.filter(x => x.cls.type !== 'L');
  const bins = Array.from({ length: 8 }, () => ({ cre: 0, draw: 0, rem: 0, ramp: 0, oth: 0 }));
  for (const x of nl) bins[Math.min(Math.floor(x.card.cmc || 0), 7)][segOf(x)] += x.qty;
  const segKeys = state.cf === 'all' ? ['cre', 'draw', 'rem', 'ramp', 'oth'] : [state.cf];
  const totals = bins.map(b => segKeys.reduce((sum, k) => sum + b[k], 0));
  const maxT = Math.max(...totals, 1);
  const nlQty = nl.reduce((sum, x) => sum + x.qty, 0) || 1;
  const avgCmc = (nl.reduce((sum, x) => sum + (x.card.cmc || 0) * x.qty, 0) / nlQty).toFixed(2);
  const H = 200;
  let html = '<div style="grid-column:1/-1;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
    '<span class="secT" style="font-size:11.5px">' + t.curve + '</span>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' + ['all', 'cre', 'draw', 'rem', 'ramp'].map(k =>
      '<button data-cf="' + k + '" style="padding:4px 12px;border-radius:99px;border:1px solid ' + (state.cf === k ? 'var(--text)' : 'var(--border)') + ';background:' + (state.cf === k ? 'var(--text)' : 'transparent') + ';color:' + (state.cf === k ? 'var(--bg)' : 'var(--muted)') + ';font-size:11px;font-weight:600">' + t[k] + '</button>').join('') + '</div></div>' +
    '<div style="display:flex;align-items:flex-end;gap:10px;height:' + (H + 26) + 'px;border-bottom:1px solid var(--border2)">' +
    bins.map((b, i) => {
      const total = totals[i];
      const sel = state.curveBin === i;
      return '<div data-bin="' + i + '" style="flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;cursor:pointer;border-radius:8px;padding:2px;' + (sel ? 'background:var(--panel2);outline:1.5px solid var(--accent)' : '') + '">' +
        '<span class="mono" style="font-size:11px;font-weight:700;text-align:center;color:' + (total ? 'var(--text)' : 'var(--faint)') + '">' + (total || '') + '</span>' +
        '<div style="display:flex;flex-direction:column;justify-content:flex-end;border-radius:5px 5px 0 0;overflow:hidden">' +
        segKeys.filter(k => b[k] > 0).map(k => '<div title="' + t[k] + ': ' + b[k] + '" style="height:' + Math.round(b[k] / maxT * H) + 'px;background:' + SEGC[k] + ';transition:height .25s"></div>').join('') + '</div>' +
        '<span class="mono" style="font-size:10.5px;color:var(--muted);text-align:center">' + (i === 7 ? '7+' : i) + '</span></div>';
    }).join('') + '</div>';
  if (state.curveBin !== null) {
    const i = state.curveBin;
    const cardsInBin = nl.filter(x => Math.min(Math.floor(x.card.cmc || 0), 7) === i &&
      (state.cf === 'all' || segOf(x) === state.cf))
      .sort((a, b) => (a.card.edhrec_rank || 1e9) - (b.card.edhrec_rank || 1e9));
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      '<span class="mono" style="font-size:11px;color:var(--muted)">CMC ' + (i === 7 ? '7+' : i) + ' · ' + cardsInBin.reduce((sum, x) => sum + x.qty, 0) + '</span>' +
      cardsInBin.map(x => {
        const c = x.card;
        return '<span class="sugTile" data-img="' + esc(c.img_normal || '') + '" style="display:flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--panel2);border-radius:99px;padding:4px 12px 4px 5px;font-size:11.5px;font-weight:600">' +
          '<span style="width:24px;height:24px;border-radius:99px;flex:none;background:var(--track) center/cover no-repeat;' + (c.img_art ? "background-image:url('" + c.img_art + "')" : '') + '"></span>' +
          esc(x.name) + (x.qty > 1 ? ' ×' + x.qty : '') + '</span>';
      }).join('') +
      '<button id="binClear" style="border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:99px;padding:3px 12px;font-size:11px;font-weight:600">✕</button></div>';
  }
  html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--muted);padding-top:2px">' +
    ['cre', 'draw', 'rem', 'ramp', 'oth'].map(k => '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:' + SEGC[k] + '"></span>' + t[k] + helpIcon(k) + '</span>').join('') +
    '<span class="mono" style="margin-left:auto">' + t.avg + ' ' + avgCmc + ' · ' + nlQty + ' ' + t.nonlands + '</span></div></div>';
  // pips
  const pipCnt = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const x of r.cardsInfo) {
    const mana = x.card.mana_cost || '';
    for (const ch of mana.replace(/[{}/]/g, '')) if (pipCnt[ch] !== undefined) pipCnt[ch] += x.qty;
  }
  const pipTot = Object.values(pipCnt).reduce((a, b) => a + b, 0) || 1;
  html += '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:12px">' +
    '<span class="secT" style="font-size:11.5px">' + t.pips + '</span><div style="display:flex;flex-direction:column;gap:9px;font-size:12px">' +
    ['W', 'U', 'B', 'R', 'G'].filter(k => pipCnt[k] > 0).map(k => {
      const pc = Math.round(pipCnt[k] / pipTot * 100);
      const bar = k === 'W' ? 'oklch(0.8 0.07 95)' : PIP[k];
      return '<div style="display:flex;align-items:center;gap:9px"><div style="width:15px;height:15px;border-radius:50%;background:' + PIP[k] + ';border:1px solid var(--muted);flex:none"></div>' +
        '<div style="flex:1;height:8px;background:var(--track);border-radius:4px"><div style="width:' + pc + '%;height:100%;background:' + bar + ';border-radius:4px"></div></div>' +
        '<span class="mono" style="font-size:10.5px;color:var(--muted);width:36px;text-align:right">' + pc + '%</span></div>';
    }).join('') + '</div></div>';
  // price bands
  const bandDefs = [['<€1', pp => pp < 1, 'oklch(0.7 0.11 150)'], ['€1–5', pp => pp >= 1 && pp < 5, 'oklch(0.75 0.1 85)'], ['€5–10', pp => pp >= 5 && pp < 10, 'oklch(0.72 0.11 70)'], ['€10–20', pp => pp >= 10 && pp < 20, 'oklch(0.68 0.12 55)'], ['€20–30', pp => pp >= 20 && pp < 30, 'oklch(0.64 0.13 40)'], ['>€30', pp => pp >= 30, 'oklch(0.6 0.15 25)']];
  const bandCounts = bandDefs.map(([, f]) => r.cardsInfo.filter(x => x.card.price != null && f(x.card.price)).reduce((sum, x) => sum + x.qty, 0));
  const maxB = Math.max(...bandCounts, 1);
  html += '<div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:12px">' +
    '<span class="secT" style="font-size:11.5px">' + t.bands + '</span><div class="mono" style="display:flex;flex-direction:column;gap:9px;font-size:11px;color:var(--muted)">' +
    bandDefs.map(([lbl, , c], i) => '<div style="display:flex;align-items:center;gap:9px"><span style="width:48px">' + lbl + '</span>' +
      '<div style="flex:1;height:8px;background:var(--track);border-radius:4px"><div style="width:' + Math.round(bandCounts[i] / maxB * 100) + '%;height:100%;background:' + c + ';border-radius:4px"></div></div>' +
      '<span style="width:26px;text-align:right">' + bandCounts[i] + '</span></div>').join('') + '</div></div>';
  $('curveWrap').innerHTML = html;
  for (const b of $('curveWrap').querySelectorAll('[data-cf]')) b.onclick = (e) => { e.stopPropagation(); state.cf = b.dataset.cf; renderCurve(); };
  for (const b of $('curveWrap').querySelectorAll('[data-bin]')) b.onclick = () => { state.curveBin = state.curveBin === +b.dataset.bin ? null : +b.dataset.bin; renderCurve(); };
  const bc = document.getElementById('binClear'); if (bc) bc.onclick = (e) => { e.stopPropagation(); state.curveBin = null; renderCurve(); };
  bindSugPopovers($('curveWrap'));
}

function renderGuide() {
  const t = T(), lang = state.lang;
  $('guideT').textContent = t.guide;
  $('guideBody').innerHTML = ARCH.map(a => {
    const open = state.openArch === a.k;
    return '<div style="border-bottom:1px solid var(--border2)">' +
      '<div data-arch="' + a.k + '" style="display:flex;justify-content:space-between;align-items:center;padding:13px 22px;font-size:14px;cursor:pointer">' +
      '<span style="font-weight:600">' + esc(a.name[lang]) + '</span><span style="color:var(--muted);font-size:16px">' + (open ? '−' : '＋') + '</span></div>' +
      (open ? '<div style="padding:0 22px 16px;display:flex;flex-direction:column;gap:10px;background:var(--panel2)">' +
        '<div style="font-size:13px;line-height:1.6;max-width:720px;padding-top:12px">' + a.desc[lang] + '</div>' +
        '<div style="font-size:12.5px;line-height:1.6;color:var(--muted);max-width:720px">' + a.how[lang] + '</div>' +
        '<div class="mono" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:10.5px">' +
        '<span style="color:var(--muted)">' + t.slots + '</span>' +
        a.slots[lang].map(s => '<span style="border:1px solid var(--border);border-radius:99px;padding:3px 11px">' + esc(s) + '</span>').join('') +
        '<button data-build="' + a.k + '" style="background:var(--accent);color:var(--accentFg);border:none;border-radius:99px;padding:5px 14px;font:600 11px \'IBM Plex Sans\',sans-serif">' + t.build + '</button></div></div>' : '') + '</div>';
  }).join('');
  for (const h of $('guideBody').querySelectorAll('[data-arch]'))
    h.onclick = () => { state.openArch = state.openArch === h.dataset.arch ? null : h.dataset.arch; renderGuide(); };
  for (const b of $('guideBody').querySelectorAll('[data-build]'))
    b.onclick = (e) => { e.stopPropagation(); state.arch = b.dataset.build; state.openArch = null; renderAll(); };
}

// ---------------- "how it works" modal ----------------
function renderHow() {
  const lang = state.lang, t = T();
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
    return '<tr style="border-top:1px solid var(--border2)"><td style="padding:7px 10px;font-weight:600;white-space:nowrap">' + m.name[lang] + '</td>' +
      '<td style="padding:7px 10px" class="mono" >' + esc(cost) + '</td></tr>';
  }).join('');
  const bans = RULES.hard_bans.banned_cards;
  const html = P ? `
<button id="howClose" style="position:absolute;top:14px;right:16px;border:1px solid var(--border);background:transparent;border-radius:7px;width:30px;height:30px;font-size:14px">✕</button>
<h2 style="margin:0 0 4px;font-size:20px">¿Cómo funciona esta guía?</h2>
<p style="color:var(--muted);font-size:13.5px;line-height:1.7">Las reglas del pod sustituyen a los brackets oficiales. La referencia es sencilla: <b>Tier 1 = un precon de caja</b>. Están calibradas con datos reales de 36 precons oficiales (2024–2026).</p>
<h3 style="font-size:15px;margin:18px 0 6px">El presupuesto de puntos</h3>
<p style="font-size:13px;line-height:1.7">Cada mazo gasta puntos al pasarse de lo que hace un precon en cada «dial». <b>Tier 1: hasta ${t1} puntos. Tier 2: hasta ${t2}.</b> Más de ${t2}: por encima del nivel del pod. Los puntos <b>nunca dejan de contarse</b>: pasado el último escalón de un dial, cada unidad extra suma +1. Puedes concentrar todo tu presupuesto en un solo eje (p. ej. dos game changers), pero entonces el resto del mazo debe quedarse a nivel precon.</p>
<h3 style="font-size:15px;margin:18px 0 6px">Los diales</h3>
<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;width:100%">${dialRows}</table></div>
<h3 style="font-size:15px;margin:18px 0 6px">Prohibiciones duras (nada de puntos: no se juegan)</h3>
<ul style="font-size:13px;line-height:1.8;margin:4px 0;padding-left:20px">
<li>Ninguna carta de más de <b>€${RULES.hard_bans.max_card_price_eur}</b> (impresión más barata de Cardmarket) sin aprobación explícita de la mesa.</li>
<li>Maná explosivo repetible: ${bans.true_fast_mana.slice(0, 6).join(', ')}… (${bans.true_fast_mana.length} cartas). Los rituales de un solo uso (Dark Ritual…) SÍ se permiten.</li>
<li>Turnos extra repetibles: ${bans.extra_turn_recursion.join(', ')}.</li>
<li>Destrucción masiva de tierras.</li></ul>
<h3 style="font-size:15px;margin:18px 0 6px">Condicionales (un lujo excluye otros)</h3>
<ul style="font-size:13px;line-height:1.8;margin:4px 0;padding-left:20px">
<li>Con un game changer: máximo 3 cartas de €10–20 y ninguna de €20–30.</li>
<li>Con tutores: cero game changers.</li>
<li>Con cualquier combo infinito: cero tutores.</li>
<li>Maná rápido alto (9+) y hechizos gratis altos (5+) a la vez: +2 puntos extra.</li></ul>
<h3 style="font-size:15px;margin:18px 0 6px">Precios, combos y sugerencias</h3>
<p style="font-size:13px;line-height:1.7">Los precios vienen de Scryfall (Cardmarket). El primer análisis usa la impresión por defecto; el botón «Buscar precios más baratos» busca la impresión más barata carta a carta. Los combos infinitos se comprueban contra Commander Spellbook y las sugerencias de cartas salen de Scryfall ordenadas por popularidad en EDHREC, filtradas a tu identidad de color y a menos de €5. Las consultas a Archidekt y Spellbook pasan por un proxy público <b>solo si tú pulsas el botón</b> — nada se envía a terceros sin avisar.</p>`
  : `
<button id="howClose" style="position:absolute;top:14px;right:16px;border:1px solid var(--border);background:transparent;border-radius:7px;width:30px;height:30px;font-size:14px">✕</button>
<h2 style="margin:0 0 4px;font-size:20px">How this guide works</h2>
<p style="color:var(--muted);font-size:13.5px;line-height:1.7">The pod rules replace the official brackets. The reference is simple: <b>Tier 1 = a boxed precon</b>. Everything is calibrated on real data from 36 official precons (2024–2026).</p>
<h3 style="font-size:15px;margin:18px 0 6px">The point budget</h3>
<p style="font-size:13px;line-height:1.7">A deck spends points whenever it exceeds what precons do on each "dial". <b>Tier 1: up to ${t1} points. Tier 2: up to ${t2}.</b> More than ${t2}: above pod level. Points <b>never stop counting</b>: past a dial's last priced step, each extra unit adds +1. You may pour the whole budget into one axis (say, two game changers) — but then the rest of the deck must stay at precon level.</p>
<h3 style="font-size:15px;margin:18px 0 6px">The dials</h3>
<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;width:100%">${dialRows}</table></div>
<h3 style="font-size:15px;margin:18px 0 6px">Hard bans (no points involved: just don't)</h3>
<ul style="font-size:13px;line-height:1.8;margin:4px 0;padding-left:20px">
<li>No card over <b>€${RULES.hard_bans.max_card_price_eur}</b> (cheapest Cardmarket printing) without explicit table approval.</li>
<li>Repeatable explosive mana: ${bans.true_fast_mana.slice(0, 6).join(', ')}… (${bans.true_fast_mana.length} cards). One-shot rituals (Dark Ritual…) ARE allowed.</li>
<li>Repeatable extra turns: ${bans.extra_turn_recursion.join(', ')}.</li>
<li>Mass land destruction.</li></ul>
<h3 style="font-size:15px;margin:18px 0 6px">Conditionals (one luxury excludes others)</h3>
<ul style="font-size:13px;line-height:1.8;margin:4px 0;padding-left:20px">
<li>With a game changer: at most 3 cards at €10–20 and none at €20–30.</li>
<li>With tutors: zero game changers.</li>
<li>With any infinite combo: zero tutors.</li>
<li>High fast mana (9+) and high free spells (5+) together: +2 extra points.</li></ul>
<h3 style="font-size:15px;margin:18px 0 6px">Prices, combos and suggestions</h3>
<p style="font-size:13px;line-height:1.7">Prices come from Scryfall (Cardmarket). The first pass uses the default printing; the "Fetch cheapest prices" button looks up the cheapest printing per card. Infinite combos are checked against Commander Spellbook and card suggestions come from Scryfall ranked by EDHREC popularity, filtered to your color identity and under €5. Archidekt and Spellbook lookups go through a public proxy <b>only when you press the button</b> — nothing is sent to third parties silently.</p>`;
  $('howBody').innerHTML = html;
  $('howClose').onclick = closeHow;
}
function openHow() { renderHow(); $('howModal').style.display = ''; }
function closeHow() { $('howModal').style.display = 'none'; }

function copyReport() {
  if (!state.result) return;
  const t = T(), lang = state.lang, ev = state.result.evalRes;
  const lines = ['La guía del Yoryi — ' + t.power,
    t.tierWord + ': ' + t[ev.tier],
    t.pts + ': ' + ev.points + ' / ' + RULES.tiers.tier2.max_points,
    t.price + ': €' + Math.round(state.result.stats.total_price_eur),
    t.cardsN + ': ' + state.result.stats.total_cards,
    t.archetype + ': ' + archName()];
  for (const v of ev.violations) lines.push('✕ ' + (v.id === 'conditional' ? MSG.conditional[v.condId][lang](v) : MSG[v.id][lang](v)));
  for (const f of ev.flags) lines.push('⚠ ' + (MSG['flag_' + f.id] ? MSG['flag_' + f.id][lang](f) : f.id));
  for (const [k, p] of Object.entries(ev.breakdown)) lines.push('· ' + (EXTRA_PTS[k] ? EXTRA_PTS[k][lang] : dialName(k, lang)) + ': +' + p + ' pts');
  try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
  state.copied = true; renderHeader();
  setTimeout(() => { state.copied = false; renderHeader(); }, 1600);
}

function renderAll() {
  applyTheme(); renderHeader(); renderInput(); renderGuide(); renderTabbar(); renderTableMode();
  const t = T();
  $('emptyT').textContent = t.emptyT; $('emptyX').textContent = t.emptyX;
  $('footer').textContent = t.footer;
  const has = !!state.result;
  $('empty').style.display = has || state.tableOpen ? 'none' : '';
  $('stickyWrap').style.display = has ? 'flex' : 'none';
  if (has) {
    renderSummary(); renderBanner(); renderValidation();
    if (state.tab === 'power') renderPower();
    if (state.tab === 'analysis') { renderComp(); renderBrowser(); renderCurve(); renderRamp(); renderHand(); }
    if (state.tab === 'tips') renderTips();
  }
}

// ================= boot =================
const __boot = () => {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { state.sysDark = e.matches; applyTheme(); });
  $('themeBtn').onclick = () => { const eff = state.theme ? state.theme === 'dark' : state.sysDark;
    state.theme = eff ? 'light' : 'dark'; store.theme = state.theme; applyTheme(); };
  $('esBtn').onclick = () => { state.lang = 'es'; store.lang = 'es'; renderAll(); };
  $('enBtn').onclick = () => { state.lang = 'en'; store.lang = 'en'; renderAll(); };
  $('copyBtn').onclick = copyReport;
  $('howBtn').onclick = openHow;
  $('howModal').onclick = (e) => { if (e.target === $('howModal')) closeHow(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHow(); });
  $('analyzeBtn').onclick = analyze;
  $('archSel').onchange = (e) => { state.arch = e.target.value; renderAll(); };
  $('deckText').oninput = () => { state.error = null; renderInput(); };
  $('gtBtn').onclick = () => { state.grp = 'type'; renderBrowser(); };
  $('gcBtn').onclick = () => { state.grp = 'cat'; renderBrowser(); };
  $('tableModeBtn').onclick = () => { state.tableOpen = !state.tableOpen; renderAll(); };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.catHelp');
    if (!el) return;
    const help = CAT_HELP[el.dataset.cat];
    if (!help) return;
    const tp = $('textPop'), rect = el.getBoundingClientRect();
    tp.textContent = help[state.lang];
    tp.style.display = '';
    let x = rect.left; if (x + 330 > innerWidth) x = Math.max(8, innerWidth - 335);
    tp.style.left = x + 'px';
    tp.style.top = Math.min(rect.bottom + 8, innerHeight - 120) + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest('.catHelp')) $('textPop').style.display = 'none';
  });
  const st = PodEngine.runSelfTest(RULES);
  if (!st.pass) console.warn('PodEngine selftest FAILED', st.results.filter(r => !r.pass));
  renderAll();
};
if (document.readyState !== 'loading') __boot();
else window.addEventListener('DOMContentLoaded', __boot);
})();
