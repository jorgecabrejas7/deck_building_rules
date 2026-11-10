// Pod rules are the app's hard dependency: nothing renders without them.
// The template and the player's pods are asked at once; top-level await then blocks the module graph.
import { api } from './api.js';

const podsAsk = api('../api/pods').then(r => r.status === 200 ? r.data : null); // null: signed out or no server
export let TEMPLATE;
try {
  TEMPLATE = await (await fetch('../rules/pod_rules.json')).json();
} catch (e) {
  document.body.innerHTML = '<div style="max-width:620px;margin:80px auto;font-family:system-ui;font-size:15px;line-height:1.7;padding:0 20px">' +
    '<h2>Pod Deck Checker</h2>' +
    '<p>No se pudieron cargar las reglas (<code>rules/pod_rules.json</code>). ' +
    'Esta app vive en la web y no funciona abriendo el archivo suelto (file://).</p>' +
    '<p>Ábrela aquí: <a href="https://jorgecabrejas7.github.io/deck_building_rules/app/">jorgecabrejas7.github.io/deck_building_rules/app/</a></p>' +
    '<p style="color:#888">Could not load the rules — this app lives on the web and does not work as a loose local file. Use the link above.</p></div>';
  throw new Error('pod_rules.json unavailable');
}
export const bootPods = await podsAsk;

// The rules in force: the active pod's, or the template. The pod stores no power brackets, they are shared.
const podRules = (pod) => ({ ...pod.rules, power_brackets: TEMPLATE.power_brackets });
export let RULES = bootPods && bootPods.active ? podRules(bootPods.active) : TEMPLATE;
export function setRules(pod) { RULES = pod ? podRules(pod) : TEMPLATE; }
