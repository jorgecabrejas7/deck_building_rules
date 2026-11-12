// predict() (app/js/table/predict.js) must agree with the real reducer server/games/table.py: random games are
// replayed through Python, and every action predict() answers is compared with what the reducer produced.
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { predict } from '../app/js/table/predict.js';

const PY = `
import json, random, sys
from games.table import ActionError, apply, new_game, view

def deck(tag, n=40):
    entries = [{"name": f"{tag}-card-{i:03d}", "quantity": 1} for i in range(n)]
    return {"entries": entries, "commanders": [entries[0]["name"]]}

ZONES = ["library", "hand", "battlefield", "graveyard", "exile", "command"]

def out(g, seat, a):
    before = view(g, seat); before.pop("log")
    try:
        new = apply(g, seat, a)
    except ActionError:
        print(json.dumps({"before": before, "action": a, "after": None}))
        return g
    after = view(new, seat); after.pop("log")
    print(json.dumps({"before": before, "action": a, "after": after}))
    return new

N = int(sys.argv[1])
for seed in range(6):
    rnd = random.Random(seed)
    g = new_game({s: deck("abcdef"[s - 1]) for s in range(1, N + 1)})
    for _ in range(300):
        seat = rnd.randint(1, N)
        zs = g["zones"]
        cards = [c for s in zs.values() for z in s.values() for c in z]
        mine = [c for z in ("hand", "battlefield", "graveyard") for c in zs[str(seat)][z]]
        bf = [c for s in zs.values() for c in s["battlefield"]]
        def pick(k=None):
            pool = mine if mine and rnd.random() < .8 else cards
            return [c["id"] for c in rnd.sample(pool, min(len(pool), k or rnd.randint(1, 3)))]
        t = rnd.choice(["move"] * 8 + ["tap"] * 3 + ["untap_all", "life", "counter", "counter", "cmd_damage", "out", "attach", "attach",
                        "token", "flip", "delete", "look", "reveal", "shuffle", "mulligan", "roll", "pass_turn", "undo"])
        if t == "move":
            z = rnd.choice(ZONES + ["battlefield", "hand", "graveyard"])
            a = {"type": "move", "cards": pick(), "to": {"seat": rnd.choice((seat, seat, rnd.randint(1, N))), "zone": z}}
            if z in ("battlefield", "exile") and rnd.random() < .4:
                a["face_down"] = rnd.random() < .5
            if z == "library":
                a["pos"] = rnd.choice(("top", "bottom"))
            if rnd.random() < .03:
                a["shuffle"] = True
        elif t == "tap":
            a = {"type": t, "cards": pick(), "tapped": rnd.random() < .6}
        elif t == "untap_all":
            a = {"type": t, "seat": rnd.randint(1, N)}
        elif t == "life":
            a = {"type": t, "seat": rnd.randint(1, N), "delta": rnd.choice((-5, -1, 1, 5, 1000))}
        elif t == "counter":
            a = {"type": t, "card": pick(1)[0], "name": rnd.choice("abc"), "delta": rnd.choice((-2, -1, 1, 3))}
        elif t == "cmd_damage":
            s, f = rnd.randint(1, N), rnd.randint(1, N)  # f == s must be rejected
            a = {"type": t, "seat": s, "from": f, "commander": rnd.choice([f"{'abcdef'[f - 1]}-card-000", "nobody"] * 3 + ["x"][:rnd.randint(0, 1)]), "delta": rnd.choice((-3, 2, 7))}
        elif t == "out":
            a = {"type": t, "out": rnd.random() < .5}
        elif t == "attach":
            host = rnd.choice(bf)["id"] if bf and rnd.random() < .85 else None
            a = {"type": t, "card": pick(1)[0], "to": host}
        elif t == "token":
            a = {"type": t, "seat": seat, "name": "Goblin", "count": rnd.randint(1, 3)}
        elif t == "flip":
            a = {"type": t, "cards": pick(2), "face_down": rnd.random() < .5}
        elif t == "delete":
            a = {"type": t, "card": next((c["id"] for c in cards if c["token"]), "zz")}
        elif t in ("look", "reveal"):
            a = {"type": t, "cards": pick(2)}
        elif t == "shuffle":
            a = {"type": t, "seat": seat}
        elif t == "mulligan":
            a = {"type": t, "n": rnd.randint(1, 7)}
        elif t == "roll":
            a = {"type": t, "sides": 20}
        elif t == "pass_turn":
            a = {"type": t, "draw": rnd.random() < .5}
        else:
            a = {"type": t}
        g = out(g, seat, a)
`;

const runs = [2, 3, 4, 6].map((n) => {
  const run = spawnSync('python3', ['-c', PY, String(n)], {
    cwd: fileURLToPath(new URL('../server/', import.meta.url)), encoding: 'utf8', maxBuffer: 1 << 30,
  });
  if (run.status !== 0) { console.error(run.stderr); process.exit(1); }
  return [n, run.stdout.trim().split('\n')];
});

const SHOULD_BE_NULL = new Set(['shuffle', 'mulligan', 'look', 'reveal', 'roll', 'token', 'pass_turn', 'flip', 'delete', 'undo']);
const fields = ['zones', 'players', 'can_undo'];
let failed = 0, handToField = 0;
const fail = (msg, a) => { failed++; if (failed <= 10) console.error(`FAIL ${msg}: ${JSON.stringify(a)}`); };

function firstDiff(a, b, path = '') {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object')
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  return `${path}: predicted ${JSON.stringify(a)} actual ${JSON.stringify(b)}`;
}

const total = {};
for (const [n, lines] of runs) {
  const counts = {};
  for (const line of lines) {
    const { before, action: a, after } = JSON.parse(line);
    const snap = JSON.stringify(before);
    const p = predict(before, a);
    if (JSON.stringify(before) !== snap) fail('predict mutated its input', a);
    const unnamed = a.type === 'move' && a.cards.some((id) => !Object.values(before.zones).some((z) => Object.values(z).some((l) => l.some((c) => c.id === id && c.name))));
    if (SHOULD_BE_NULL.has(a.type) || (a.type === 'move' && (a.to.zone === 'library' || unnamed || a.shuffle))) {
      if (p !== null) fail('should be null', a);
      continue;
    }
    if (p === null) continue;
    counts[a.type] = (counts[a.type] || 0) + 1;
    if (!after) { fail('predicted an action the reducer rejected', a); continue; }
    for (const f of fields) {
      const d = firstDiff(p[f], after[f], f);
      if (d) { fail(d, a); break; }
    }
    if (a.type === 'move' && a.to.zone === 'battlefield' && a.to.seat === before.you
        && a.cards.every((id) => before.zones[before.you].hand.some((c) => c.id === id && c.name))) handToField++;
  }

  total[n] = counts;
  console.log(`  ${n} players: ${lines.length} actions, predicted ${JSON.stringify(counts)}`);
}

const counts = {};
for (const c of Object.values(total)) for (const [k, v] of Object.entries(c)) counts[k] = (counts[k] || 0) + v;
for (const n of Object.keys(total))
  for (const t of ['tap', 'untap_all', 'life', 'counter', 'cmd_damage', 'out', 'attach', 'move'])
    if (!total[n][t]) fail(`never predicted ${t} with ${n} players, the test is vacuous`, {});
if (!handToField) fail('no predicted move from hand to own battlefield', {});
if (failed) { console.error(`${failed} failure(s)`); process.exit(1); }
console.log(`table predict ok: players 2, 3, 4, 6; predicted ${JSON.stringify(counts)}, ${handToField} hand-to-battlefield`);
