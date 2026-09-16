// ---- decklist / URL parsing ----
const LINE_RE = /^\s*(\d+)\s*x?\s+(.+?)\s*$/;
const SET_SUFFIX_RE = /\s+\(([A-Za-z0-9]{2,6})\)(\s+[\w-★]+)?(\s+\*[FE]\*)?\s*$/;
const HEADER_RE = /^(commander|deck|mainboard|sideboard|maybeboard|considering|companion|tokens?)s?\s*(\(\d+\))?\s*:?$/i;

export function detectInput(text) {
  const t = text.trim();
  let m = t.match(/archidekt\.com\/decks\/(\d+)/i);
  if (m) return { kind: "archidekt", id: m[1] };
  if (/moxfield\.com/i.test(t)) return { kind: "moxfield" };
  return { kind: "list" };
}

export function parseDecklist(text) {
  const entries = new Map();
  const commanders = [];
  let section = "main";
  for (let raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const cm = line.match(/^commanders?\s*:\s*(.+)$/i);
    if (cm) { commanders.push(stripLine(cm[1]).name); addEntry(entries, stripLine(cm[1])); continue; }
    const hm = line.match(HEADER_RE);
    if (hm) {
      section = /commander/i.test(hm[1]) ? "commander"
        : /sideboard|maybeboard|considering|token/i.test(hm[1]) ? "skip" : "main";
      continue;
    }
    if (section === "skip") continue;
    const e = stripLine(line);
    if (!e.name) continue;
    if (section === "commander") commanders.push(e.name);
    addEntry(entries, e);
  }
  return { entries: [...entries.entries()].map(([name, quantity]) => ({ name, quantity })), commanders };
}
function stripLine(line) {
  const m = line.match(LINE_RE);
  let qty = 1, name = line;
  if (m) { qty = parseInt(m[1], 10); name = m[2]; }
  name = name.replace(SET_SUFFIX_RE, "").trim();
  return { name, quantity: qty };
}
function addEntry(map, e) { map.set(e.name, (map.get(e.name) || 0) + e.quantity); }

// Identity of a decklist, so state tied to a deck (the user's commander pick)
// can tell "same deck, new session" from "a different deck in the same box".
export function deckFingerprint(entries) {
  const s = entries.map(e => e.name).sort().join("|");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return entries.length + ":" + (h >>> 0).toString(36);
}
