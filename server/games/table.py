"""Pure two-player table reducer: no Django, no I/O. State is plain JSON (seat keys are "1"/"2").

Hidden information: view() never sends a name the viewer may not see. A card keeps its id across moves and draws;
only a shuffle (a mulligan shuffles too) issues new ids, so an id cannot be followed through a shuffle.
library[0] is the top of the library. state["seq"] counts applied actions.
An aura or equipment on the battlefield points at its host with "attached" (the host's id); the pointer follows
the host across a change of control and is dropped when either card leaves the battlefield.

Every card also carries a permanent "uid" that never leaves the server; undo uses it to keep what each seat
has already seen. state["history"] holds up to UNDO_DEPTH pre-action snapshots of one seat's latest run of
undoable actions; it and the raw log (names plus the seats that saw them) are never sent as they are.
"""
import copy
import secrets

_rng = secrets.SystemRandom()
ZONES = ("library", "hand", "battlefield", "graveyard", "exile", "command")
PUBLIC = ("battlefield", "graveyard", "exile", "command")
MAX_DECK = 250
MAX_CARDS = 600  # per game, bounds token spam
UNDO_DEPTH = 5  # the whole state, snapshots included, is written on every action
LOG_SIZE = 50
_NO_UNDO = {"shuffle", "mulligan", "look", "reveal", "roll"}  # random or informative: undo would cheat


class ActionError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _bad():
    raise ActionError("invalid")


def _new_id():
    return secrets.token_hex(6)


def _card(name, owner, token=False, known_by=()):
    return {"id": _new_id(), "uid": _new_id(), "name": name, "owner": owner, "tapped": False, "face_down": False,
            "counters": {}, "token": token, "known_by": sorted(known_by), "attached": None}


def _draw(state, seat, n):
    z = state["zones"][str(seat)]
    for c in z["library"][:n]:
        c["known_by"] = [seat]
        z["hand"].append(c)
    del z["library"][:n]


def _shuffle(state, seat):
    lib = state["zones"][str(seat)]["library"]
    _rng.shuffle(lib)
    for c in lib:
        c["id"] = _new_id()
        c["known_by"] = []


def new_game(decks):
    """decks: {1: {"entries": [{"name","quantity"}], "commanders": [name]}, 2: ...}"""
    state = {"seq": 0, "roll": None, "players": {}, "zones": {}, "log": [], "history": [],
             "turn": {"seat": _rng.choice((1, 2)), "number": 1}}
    for seat in (1, 2):
        d, other = decks[seat], decks[3 - seat]
        if sum(e["quantity"] for e in d["entries"]) > MAX_DECK:
            _bad()
        z = {k: [] for k in ZONES}
        pending = list(d["commanders"])
        for e in d["entries"]:
            for _ in range(e["quantity"]):
                if e["name"] in pending:
                    pending.remove(e["name"])
                    z["command"].append(_card(e["name"], seat, known_by=(1, 2)))
                else:
                    z["library"].append(_card(e["name"], seat))
        z["command"] += [_card(n, seat, known_by=(1, 2)) for n in pending]  # commander absent from entries
        state["zones"][str(seat)] = z
        state["players"][str(seat)] = {"life": 40, "commanders": list(d["commanders"]),
                                       "cmd_damage": {n: 0 for n in other["commanders"]}}
    for seat in (1, 2):
        _shuffle(state, seat)
        _draw(state, seat, 7)
    return state


# ---- view ----

def _visible(card, zone, viewer):
    return (zone in PUBLIC and not card["face_down"]) or viewer in card["known_by"]


def _view_card(card, zone, viewer):
    out = {"id": card["id"], "owner": card["owner"], "tapped": card["tapped"],
           "face_down": card["face_down"], "counters": dict(card["counters"])}
    if zone == "battlefield" and card.get("attached"):
        out["attached"] = card["attached"]
    if _visible(card, zone, viewer):
        out.update(name=card["name"], token=card["token"], shared=_visible(card, zone, 3 - viewer))
    return out


def _view_ref(ref, viewer):
    out = {"seat": ref["seat"], "zone": ref["zone"]}
    if viewer in ref["seen"]:
        out["name"] = ref["name"]
    return out


def _view_entry(entry, viewer):
    out = dict(entry)
    for k in ("cards", "card", "host"):
        if isinstance(entry.get(k), list):
            out[k] = [_view_ref(r, viewer) for r in entry[k]]
        elif entry.get(k):
            out[k] = _view_ref(entry[k], viewer)
    return out


def view(state, viewer):
    """What `viewer` (1|2) may see. Player names and `picked` are added by the caller."""
    h = state["history"]
    return {
        "status": "active", "you": viewer,
        "players": copy.deepcopy(state["players"]),
        "zones": {s: {z: [_view_card(c, z, viewer) for c in cards] for z, cards in zs.items()}
                  for s, zs in state["zones"].items()},
        "roll": copy.deepcopy(state["roll"]),
        "turn": dict(state["turn"]),
        "can_undo": bool(h) and h[-1]["seat"] == viewer,
        "log": [_view_entry(e, viewer) for e in state["log"]],
    }


# ---- validation ----

def _seat(x):
    if type(x) is not int or x not in (1, 2):
        _bad()
    return x


def _int(x, lo, hi):
    if type(x) is not int or not lo <= x <= hi:
        _bad()
    return x


def _str(x, lo, hi):
    if type(x) is not str or not lo <= len(x) <= hi:
        _bad()
    return x


def _bool(x):
    if type(x) is not bool:
        _bad()
    return x


def _zone(x):
    if type(x) is not str or x not in ZONES:
        _bad()
    return x


def _fields(a, required, optional=(), typed=False):
    allowed = set(required) | set(optional) | ({"type"} if typed else set())
    if not isinstance(a, dict) or not set(required) <= set(a) <= allowed:
        _bad()


def _ids(x):
    if type(x) is not list or not 1 <= len(x) <= 100 or len(set(x)) != len(x):
        _bad()
    for i in x:
        _str(i, 1, 32)
    return x


def _locate(state, ids):
    """[(card, zone, seat)] in the order of ids; unknown id -> 'stale'."""
    index = {c["id"]: (c, z, int(s)) for s, zs in state["zones"].items() for z, cs in zs.items() for c in cs}
    try:
        return [index[i] for i in ids]
    except KeyError:
        raise ActionError("stale") from None


def _reattach(state, hosts):
    """Drop the attachments whose host id is in `hosts` (the host left the battlefield)."""
    for zs in state["zones"].values():
        for c in zs["battlefield"]:
            if c.get("attached") in hosts:
                c["attached"] = None


def _seen(card, zone):
    return {s for s in (1, 2) if _visible(card, zone, s)}


def _ref(card, seat, zone, seen):
    """A log reference to a card at seat/zone; its name goes only to the seats in `seen`."""
    return {"seat": seat, "zone": zone, "name": card["name"], "seen": sorted(seen)}


def _remove(state, ids):
    gone = set(ids)
    for zs in state["zones"].values():
        for z in zs:
            zs[z] = [c for c in zs[z] if c["id"] not in gone]


# ---- actions ----
# Each action mutates the state and returns its log entry. A "peek" key marks an action that showed the actor
# a card it could not see before; such an action cannot be undone.

def _move(state, seat, a):
    _fields(a, ("cards", "to"), ("pos", "face_down", "shuffle"), typed=True)
    ids = _ids(a["cards"])
    _fields(a["to"], ("seat", "zone"))
    dest_seat, zone = _seat(a["to"]["seat"]), _zone(a["to"]["zone"])
    pos = a.get("pos")
    if pos is not None and (zone != "library" or pos not in ("top", "bottom")):
        _bad()
    face_down = _bool(a["face_down"]) if "face_down" in a else False
    face_down = face_down and zone in ("battlefield", "exile")
    shuffle = _bool(a["shuffle"]) if "shuffle" in a else False  # a tutor's "shuffle, then put it on top"
    if shuffle and zone != "library":
        _bad()
    found = _locate(state, ids)
    _remove(state, ids)
    moved, left, refs, peek = [], set(), [], False
    for c, src, src_seat in found:
        before = _seen(c, src)
        if src == "battlefield" and zone != "battlefield":
            c["tapped"], c["counters"], c["attached"] = False, {}, None
            left.add(c["id"])
        c["face_down"] = face_down
        c["known_by"] = sorted(before | ({dest_seat} if zone == "hand" else set()))
        after = _seen(c, zone)
        peek = peek or (seat in after - before)
        refs.append(_ref(c, src_seat, src, before | after))
        moved.append(c)
    if shuffle:
        _shuffle(state, dest_seat)
    dest = state["zones"][str(dest_seat)][zone]
    if zone == "library" and pos != "bottom":
        dest[0:0] = moved
    else:
        dest.extend(moved)
    _reattach(state, left)
    return {"cards": refs, "to": {"seat": dest_seat, "zone": zone}, "pos": (pos or "top") if zone == "library" else None,
            "face_down": face_down, "shuffle": shuffle, "peek": peek}


def _tap(state, seat, a):
    _fields(a, ("cards", "tapped"), typed=True)
    ids, tapped = _ids(a["cards"]), _bool(a["tapped"])
    found = _locate(state, ids)
    for c, _, _ in found:
        c["tapped"] = tapped
    return {"tapped": tapped, "cards": [_ref(c, s, z, _seen(c, z)) for c, z, s in found]}


def _untap_all(state, seat, a):
    _fields(a, ("seat",), typed=True)
    s = _seat(a["seat"])
    for c in state["zones"][str(s)]["battlefield"]:
        c["tapped"] = False
    return {"target": s}


def _flip(state, seat, a):
    _fields(a, ("cards", "face_down"), typed=True)
    ids, down = _ids(a["cards"]), _bool(a["face_down"])
    found = _locate(state, ids)
    if any(z not in ("battlefield", "exile") for _, z, _ in found):
        _bad()
    refs, peek = [], False
    for c, z, at in found:
        before = _seen(c, z)
        c["known_by"] = sorted(before) if down else [1, 2]
        c["face_down"] = down
        after = _seen(c, z)
        peek = peek or (seat in after - before)
        refs.append(_ref(c, at, z, before | after))
    return {"face_down": down, "cards": refs, "peek": peek}


def _counter(state, seat, a):
    _fields(a, ("card", "name", "delta"), typed=True)
    cid, name, delta = _str(a["card"], 1, 32), _str(a["name"], 1, 30), _int(a["delta"], -999, 999)
    c, z, s = _locate(state, [cid])[0]
    if name not in c["counters"] and len(c["counters"]) >= 20:
        _bad()
    value = max(-999, min(999, c["counters"].get(name, 0) + delta))
    if value:
        c["counters"][name] = value
    else:
        c["counters"].pop(name, None)
    return {"card": _ref(c, s, z, _seen(c, z)), "name": name, "delta": delta, "value": value}


def _token(state, seat, a):
    _fields(a, ("seat", "name", "count"), typed=True)
    s, name, count = _seat(a["seat"]), _str(a["name"], 1, 100), _int(a["count"], 1, 20)
    if sum(len(cs) for zs in state["zones"].values() for cs in zs.values()) + count > MAX_CARDS:
        _bad()
    state["zones"][str(s)]["battlefield"] += [_card(name, s, token=True, known_by=(1, 2)) for _ in range(count)]
    return {"target": s, "name": name, "count": count}


def _delete(state, seat, a):
    _fields(a, ("card",), typed=True)
    cid = _str(a["card"], 1, 32)
    c, z, s = _locate(state, [cid])[0]
    if not c["token"]:
        _bad()
    _remove(state, [cid])
    _reattach(state, {cid})
    return {"card": _ref(c, s, z, _seen(c, z))}


def _attach(state, seat, a):
    """Attach `card` to the battlefield card `to`, or detach it with to=None. A card from any other zone
    enters the actor's battlefield first. No nesting: the host cannot itself be attached, and whatever
    was attached to the card falls off."""
    _fields(a, ("card", "to"), typed=True)
    cid = _str(a["card"], 1, 32)
    c, zone, cseat = _locate(state, [cid])[0]
    before = _seen(c, zone)
    if a["to"] is None:
        c["attached"] = None
        return {"card": _ref(c, cseat, zone, before), "host": None}
    host, hzone, hseat = _locate(state, [_str(a["to"], 1, 32)])[0]
    if hzone != "battlefield" or host is c or host.get("attached"):
        _bad()
    peek = False
    if zone != "battlefield":
        peek = _move(state, seat, {"type": "move", "cards": [cid], "to": {"seat": seat, "zone": "battlefield"}})["peek"]
        c = state["zones"][str(seat)]["battlefield"][-1]
    _reattach(state, {c["id"]})
    c["attached"] = host["id"]
    return {"card": _ref(c, cseat, zone, before | _seen(c, "battlefield")),
            "host": _ref(host, hseat, hzone, _seen(host, hzone)), "peek": peek}


def _look(state, seat, a):
    _fields(a, ("cards",), typed=True)
    refs = []
    for c, z, s in _locate(state, _ids(a["cards"])):
        refs.append(_ref(c, s, z, _seen(c, z) | {seat}))
        c["known_by"] = sorted(set(c["known_by"]) | {seat})
    return {"cards": refs}


def _reveal(state, seat, a):
    _fields(a, ("cards",), typed=True)
    found = _locate(state, _ids(a["cards"]))
    for c, _, _ in found:
        c["known_by"] = [1, 2]
    return {"cards": [_ref(c, s, z, (1, 2)) for c, z, s in found]}


def _shuffle_action(state, seat, a):
    _fields(a, ("seat",), typed=True)
    s = _seat(a["seat"])
    _shuffle(state, s)
    return {"target": s}


def _mulligan(state, seat, a):
    _fields(a, (), ("n",), typed=True)
    n = _int(a["n"], 1, 7) if "n" in a else 7
    z = state["zones"][str(seat)]
    z["library"] += z["hand"]
    z["hand"] = []
    _shuffle(state, seat)
    _draw(state, seat, n)
    return {"n": n}


def _life(state, seat, a):
    _fields(a, ("seat", "delta"), typed=True)
    s, delta = _seat(a["seat"]), _int(a["delta"], -999, 999)
    p = state["players"][str(s)]
    p["life"] = max(-999, min(999, p["life"] + delta))
    return {"target": s, "delta": delta, "life": p["life"]}


def _cmd_damage(state, seat, a):
    _fields(a, ("seat", "commander", "delta"), typed=True)
    s, name, delta = _seat(a["seat"]), _str(a["commander"], 1, 200), _int(a["delta"], -999, 999)
    if name not in state["players"][str(3 - s)]["commanders"]:
        _bad()
    d = state["players"][str(s)]["cmd_damage"]
    d[name] = max(0, min(999, d.get(name, 0) + delta))
    return {"target": s, "commander": name, "delta": delta, "value": d[name]}


def _roll(state, seat, a):
    _fields(a, ("sides",), typed=True)
    sides = _int(a["sides"], 2, 100)
    state["roll"] = {"seat": seat, "sides": sides, "result": _rng.randint(1, sides), "seq": state["seq"]}
    return {"sides": sides, "result": state["roll"]["result"]}


def _pass_turn(state, seat, a):
    """Either seat may pass; no rules are enforced. The next seat untaps and, with draw=true, draws one."""
    _fields(a, (), ("draw",), typed=True)
    draw = _bool(a["draw"]) if "draw" in a else False
    turn = state["turn"]
    turn["seat"], turn["number"] = 3 - turn["seat"], turn["number"] + 1
    s = turn["seat"]
    z = state["zones"][str(s)]
    for c in z["battlefield"]:
        c["tapped"] = False
    drawn = z["library"][:1] if draw else []
    _draw(state, s, len(drawn))
    return {"target": s, "draw": draw, "cards": [_ref(c, s, "library", {s}) for c in drawn], "peek": bool(drawn)}


def _undo(state, seat):
    """Restore the snapshot before this seat's latest action. What any seat has seen stays seen."""
    hist = state["history"]
    if not hist or hist[-1]["seat"] != seat:
        raise ActionError("undo")
    last = hist.pop()
    known = {c["uid"]: _seen(c, z) for zs in state["zones"].values() for z, cs in zs.items() for c in cs}
    for zs in last["state"]["zones"].values():
        for cs in zs.values():
            for c in cs:
                c["known_by"] = sorted(set(c["known_by"]) | set(known.get(c["uid"], ())))
    state.update({k: v for k, v in last["state"].items() if k != "seq"})
    return {"undone": last["type"]}


_ACTIONS = {"move": _move, "tap": _tap, "untap_all": _untap_all, "flip": _flip, "counter": _counter,
            "token": _token, "delete": _delete, "look": _look, "reveal": _reveal,
            "shuffle": _shuffle_action, "mulligan": _mulligan, "life": _life,
            "cmd_damage": _cmd_damage, "roll": _roll, "attach": _attach, "pass_turn": _pass_turn}


def apply(state, seat, action):
    """Return a new state; the input is never mutated. Raises ActionError('invalid'|'stale'|'undo')."""
    _seat(seat)
    t = action.get("type") if isinstance(action, dict) else None
    if type(t) is not str or t not in _ACTIONS and t != "undo":
        _bad()
    new = copy.deepcopy(state)
    new["seq"] += 1
    if t == "undo":
        _fields(action, (), typed=True)
        entry = _undo(new, seat)
    else:
        entry = _ACTIONS[t](new, seat, action)
        if t in _NO_UNDO or entry.pop("peek", False) or action.get("shuffle"):
            new["history"] = []
        else:
            run = new["history"] if new["history"] and new["history"][-1]["seat"] == seat else []
            # shares the untouched input's objects: apply always deep-copies before it mutates anything
            snap = {k: v for k, v in state.items() if k not in ("history", "log")}
            new["history"] = (run + [{"seat": seat, "type": t, "state": snap}])[-UNDO_DEPTH:]
    new["log"] = (new["log"] + [{"seq": new["seq"], "turn": new["turn"]["number"], "seat": seat, "type": t,
                                 **entry}])[-LOG_SIZE:]
    return new
