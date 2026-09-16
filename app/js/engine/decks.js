// ---- decklist / URL parsing ----
const LINE_RE = /^\s*(\d+)\s*x?\s+(.+?)\s*$/;
const SET_SUFFIX_RE = /\s+\(([A-Za-z0-9]{2,6})\)(\s+[\w-★]+)?(\s+\*[FE]\*)?\s*$/;
// Moxfield marks foils with a trailing *F*, which can arrive without a set code.
const FOIL_SUFFIX_RE = /\s+\*[FE]\*\s*$/;
// Archidekt's text export tags each line with its category: "1x Sol Ring (c21) 263 [Artifact]".
const CATEGORY_SUFFIX_RE = /\s*\[([^\]]*)\]\s*$/;
const HEADER_RE = /^(commander|deck|mainboard|sideboard|maybeboard|considering|companion|tokens?)s?\s*(\(\d+\))?\s*:?$/i;

// Cards parked outside the 100: a maybeboard, a sideboard or a token list is
// not the deck, so none of it is analyzed. Shared with the Archidekt loader,
// whose Sideboard category ships includedInDeck:true and would otherwise sail
// straight into the stats.
export const OUT_OF_DECK_RE = /^(sideboard|maybeboard|considering|companion|tokens?)s?$/i;

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
    if (!line) continue;
    // A comment can BE the section marker ("// Maybeboard"), so read it before
    // discarding it; anything else commented out stays ignored.
    const comment = line.match(/^(?:#+|\/\/)\s*(.*)$/);
    if (comment) {
      const h = comment[1].trim().match(HEADER_RE);
      if (h) section = sectionFor(h[1]);
      continue;
    }
    const cm = line.match(/^commanders?\s*:\s*(.+)$/i);
    if (cm) { commanders.push(stripLine(cm[1]).name); addEntry(entries, stripLine(cm[1])); continue; }
    const hm = line.match(HEADER_RE);
    if (hm) { section = sectionFor(hm[1]); continue; }
    if (section === "skip") continue;
    const e = stripLine(line);
    if (!e.name || e.skip) continue;
    if (section === "commander") commanders.push(e.name);
    addEntry(entries, e);
  }
  return { entries: [...entries.entries()].map(([name, quantity]) => ({ name, quantity })), commanders };
}
function sectionFor(word) {
  if (/commander/i.test(word)) return "commander";
  return OUT_OF_DECK_RE.test(word) ? "skip" : "main";
}
function stripLine(line) {
  let skip = false;
  // strip the category tag first: it sits after the set code, so leaving it on
  // would also break the set-suffix match and send a junk name to Scryfall
  const cat = line.match(CATEGORY_SUFFIX_RE);
  if (cat) {
    line = line.replace(CATEGORY_SUFFIX_RE, "");
    skip = cat[1].split(",").some(c => OUT_OF_DECK_RE.test(c.trim()));
  }
  const m = line.match(LINE_RE);
  let qty = 1, name = line;
  if (m) { qty = parseInt(m[1], 10); name = m[2]; }
  name = name.replace(SET_SUFFIX_RE, "").replace(FOIL_SUFFIX_RE, "").trim();
  return { name, quantity: qty, skip };
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
