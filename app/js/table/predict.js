// Optimistic prediction of the viewer's next view. Mirrors server/games/table.py (_move, _attach, _tap, ...)
// and is guarded by scripts/test_table_predict.js, which replays random games through the real reducer.
// predict(view, action) returns a new view, or null when the server must answer first.
const PUBLIC = ['battlefield', 'graveyard', 'exile', 'command'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const str = (x, hi) => typeof x === 'string' && x.length >= 1 && x.length <= hi;
const seatOk = (v, x) => Number.isInteger(x) && x in v.players;
const keys = (a, req, opt = []) => req.every((k) => k in a) && Object.keys(a).every((k) => k === 'type' || req.includes(k) || opt.includes(k));
const ids = (x) => Array.isArray(x) && x.length >= 1 && x.length <= 100 && new Set(x).size === x.length && x.every((i) => str(i, 32));

function find(v, id) {
  for (const [seat, zones] of Object.entries(v.zones))
    for (const [zone, list] of Object.entries(zones)) {
      const card = list.find((c) => c.id === id);
      if (card) return { card, seat: Number(seat), zone, list };
    }
  return null;
}

// Move named cards to the end of seat/zone; false when the server must decide (unknown or hidden card, library).
function move(v, cardIds, seat, zone, faceDown, flipped) {
  const found = cardIds.map((id) => find(v, id));
  if (found.some((f) => !f || !f.card.name) || zone === 'library' || !v.zones[seat][zone]) return false;
  // into another's hand only that seat learns it: with 3+ players whether all the others now know it is not in the view
  const toOther = zone === 'hand' && seat !== v.you;
  if (toOther && Object.keys(v.players).length > 2 && found.some((f) => !f.card.shared)) return false;
  faceDown = faceDown && (zone === 'battlefield' || zone === 'exile');
  const left = new Set();
  for (const { card, list, zone: from } of found) {
    list.splice(list.indexOf(card), 1);
    if (from === 'battlefield' && zone !== 'battlefield') {
      Object.assign(card, { tapped: false, counters: {} });
      delete card.attached;
      left.add(card.id);
    }
    if (zone !== 'battlefield') card.flipped = false;
    else if (flipped !== undefined) card.flipped = flipped;
    card.face_down = faceDown;
    card.shared = (PUBLIC.includes(zone) && !faceDown) || card.shared || toOther;
    v.zones[seat][zone].push(card);
  }
  for (const zones of Object.values(v.zones)) for (const c of zones.battlefield) if (left.has(c.attached)) delete c.attached;
  return true;
}

function attach(v, a) {
  if (!keys(a, ['card', 'to']) || !str(a.card, 32)) return false;
  const f = find(v, a.card);
  if (!f) return false;
  if (a.to === null) return delete f.card.attached, true;
  const host = str(a.to, 32) && find(v, a.to);
  if (!host || host.zone !== 'battlefield' || host.card === f.card || host.card.attached) return false;
  if (f.zone !== 'battlefield' && !move(v, [a.card], v.you, 'battlefield', false)) return false;
  for (const zones of Object.values(v.zones)) for (const c of zones.battlefield) if (c.attached === a.card) delete c.attached;
  f.card.attached = a.to;
  return true;
}

const ACTIONS = {
  tap: (v, a) => keys(a, ['cards', 'tapped']) && ids(a.cards) && typeof a.tapped === 'boolean'
    && a.cards.map((id) => find(v, id)).every((f) => f && (f.card.tapped = a.tapped, true)),
  transform: (v, a) => keys(a, ['cards', 'flipped']) && ids(a.cards) && typeof a.flipped === 'boolean'
    && a.cards.map((id) => find(v, id)).every((f) => f && f.zone === 'battlefield')
    && (a.cards.forEach((id) => { find(v, id).card.flipped = a.flipped; }), true),
  untap_all: (v, a) => keys(a, ['seat']) && seatOk(v, a.seat) && (v.zones[a.seat].battlefield.forEach((c) => { c.tapped = false; }), true),
  life: (v, a) => keys(a, ['seat', 'delta']) && seatOk(v, a.seat) && int(a.delta, -999, 999)
    && (v.players[a.seat].life = clamp(v.players[a.seat].life + a.delta, -999, 999), true),
  counter: (v, a) => {
    if (!keys(a, ['card', 'name', 'delta']) || !str(a.card, 32) || !str(a.name, 30) || !int(a.delta, -999, 999)) return false;
    const f = find(v, a.card);
    if (!f || (!(a.name in f.card.counters) && Object.keys(f.card.counters).length >= 20)) return false;
    const n = clamp((f.card.counters[a.name] || 0) + a.delta, -999, 999);
    if (n) f.card.counters[a.name] = n; else delete f.card.counters[a.name];
    return true;
  },
  cmd_damage: (v, a) => {
    if (!keys(a, ['seat', 'from', 'commander', 'delta']) || !seatOk(v, a.seat) || !seatOk(v, a.from) || a.from === a.seat
      || !str(a.commander, 200) || !int(a.delta, -999, 999) || !v.players[a.from].commanders.includes(a.commander)) return false;
    const d = v.players[a.seat].cmd_damage[a.from];
    d[a.commander] = clamp(d[a.commander] + a.delta, 0, 999);
    return true;
  },
  out: (v, a) => keys(a, ['out']) && typeof a.out === 'boolean' && (v.players[v.you].out = a.out, true),
  move: (v, a) => keys(a, ['cards', 'to'], ['pos', 'face_down', 'flipped', 'shuffle']) && ids(a.cards) && a.to && keys(a.to, ['seat', 'zone'])
    && seatOk(v, a.to.seat) && !a.shuffle && a.pos == null && (a.face_down === undefined || typeof a.face_down === 'boolean')
    && (a.flipped === undefined || typeof a.flipped === 'boolean') && move(v, a.cards, a.to.seat, a.to.zone, !!a.face_down, a.flipped),
  attach,
};

export function predict(view, action) {
  const v = structuredClone(view);
  const run = action && Object.hasOwn(ACTIONS, action.type) && ACTIONS[action.type];
  if (!run || !run(v, action)) return null;
  v.can_undo = true;
  return v;
}
