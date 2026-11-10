"""Pure two-player table reducer: no Django, no I/O. State is plain JSON (seat keys are "1"/"2").

Hidden information: view() never sends a name the viewer may not see, and every zone change
or shuffle issues a new card id, so an id cannot be followed into a hidden zone.
library[0] is the top of the library. state["seq"] counts applied actions.
"""
import copy
import secrets

_rng = secrets.SystemRandom()
ZONES = ("library", "hand", "battlefield", "graveyard", "exile", "command")
PUBLIC = ("battlefield", "graveyard", "exile", "command")
MAX_DECK = 250
MAX_CARDS = 600  # per game, bounds token spam


class ActionError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _bad():
    raise ActionError("invalid")


def _new_id():
    return secrets.token_hex(6)


def _card(name, owner, token=False, known_by=()):
    return {"id": _new_id(), "name": name, "owner": owner, "tapped": False, "face_down": False,
            "counters": {}, "token": token, "known_by": sorted(known_by)}


def _draw(state, seat, n):
    z = state["zones"][str(seat)]
    for c in z["library"][:n]:
        c["id"] = _new_id()
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
    state = {"seq": 0, "roll": None, "players": {}, "zones": {}}
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
    if _visible(card, zone, viewer):
        out.update(name=card["name"], token=card["token"], shared=_visible(card, zone, 3 - viewer))
    return out


def view(state, viewer):
    """What `viewer` (1|2) may see. Player names and `picked` are added by the caller."""
    return {
        "status": "active", "you": viewer,
        "players": copy.deepcopy(state["players"]),
        "zones": {s: {z: [_view_card(c, z, viewer) for c in cards] for z, cards in zs.items()}
                  for s, zs in state["zones"].items()},
        "roll": copy.deepcopy(state["roll"]),
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
    """[(card, zone)] in the order of ids; unknown id -> 'stale'."""
    index = {c["id"]: (c, z) for zs in state["zones"].values() for z, cs in zs.items() for c in cs}
    try:
        return [index[i] for i in ids]
    except KeyError:
        raise ActionError("stale") from None


def _remove(state, ids):
    gone = set(ids)
    for zs in state["zones"].values():
        for z in zs:
            zs[z] = [c for c in zs[z] if c["id"] not in gone]


# ---- actions ----

def _move(state, seat, a):
    _fields(a, ("cards", "to"), ("pos", "face_down"), typed=True)
    ids = _ids(a["cards"])
    _fields(a["to"], ("seat", "zone"))
    dest_seat, zone = _seat(a["to"]["seat"]), _zone(a["to"]["zone"])
    pos = a.get("pos")
    if pos is not None and (zone != "library" or pos not in ("top", "bottom")):
        _bad()
    face_down = _bool(a["face_down"]) if "face_down" in a else False
    face_down = face_down and zone in ("battlefield", "exile")
    found = _locate(state, ids)
    _remove(state, ids)
    moved = []
    for c, src in found:
        before = {s for s in (1, 2) if _visible(c, src, s)}
        if src == "battlefield" and zone != "battlefield":
            c["tapped"], c["counters"] = False, {}
        c["id"] = _new_id()
        c["face_down"] = face_down
        c["known_by"] = sorted(before | ({dest_seat} if zone == "hand" else set()))
        moved.append(c)
    dest = state["zones"][str(dest_seat)][zone]
    if zone == "library" and pos != "bottom":
        dest[0:0] = moved
    else:
        dest.extend(moved)


def _tap(state, seat, a):
    _fields(a, ("cards", "tapped"), typed=True)
    ids, tapped = _ids(a["cards"]), _bool(a["tapped"])
    for c, _ in _locate(state, ids):
        c["tapped"] = tapped


def _untap_all(state, seat, a):
    _fields(a, ("seat",), typed=True)
    for c in state["zones"][str(_seat(a["seat"]))]["battlefield"]:
        c["tapped"] = False


def _flip(state, seat, a):
    _fields(a, ("cards", "face_down"), typed=True)
    ids, down = _ids(a["cards"]), _bool(a["face_down"])
    found = _locate(state, ids)
    if any(z not in ("battlefield", "exile") for _, z in found):
        _bad()
    for c, z in found:
        c["known_by"] = [s for s in (1, 2) if _visible(c, z, s)] if down else [1, 2]
        c["face_down"] = down


def _counter(state, seat, a):
    _fields(a, ("card", "name", "delta"), typed=True)
    cid, name, delta = _str(a["card"], 1, 32), _str(a["name"], 1, 30), _int(a["delta"], -999, 999)
    c, _ = _locate(state, [cid])[0]
    if name not in c["counters"] and len(c["counters"]) >= 20:
        _bad()
    value = max(-999, min(999, c["counters"].get(name, 0) + delta))
    if value:
        c["counters"][name] = value
    else:
        c["counters"].pop(name, None)


def _token(state, seat, a):
    _fields(a, ("seat", "name", "count"), typed=True)
    s, name, count = _seat(a["seat"]), _str(a["name"], 1, 100), _int(a["count"], 1, 20)
    if sum(len(cs) for zs in state["zones"].values() for cs in zs.values()) + count > MAX_CARDS:
        _bad()
    state["zones"][str(s)]["battlefield"] += [_card(name, s, token=True, known_by=(1, 2)) for _ in range(count)]


def _delete(state, seat, a):
    _fields(a, ("card",), typed=True)
    cid = _str(a["card"], 1, 32)
    if not _locate(state, [cid])[0][0]["token"]:
        _bad()
    _remove(state, [cid])


def _look(state, seat, a):
    _fields(a, ("cards",), typed=True)
    for c, _ in _locate(state, _ids(a["cards"])):
        c["known_by"] = sorted(set(c["known_by"]) | {seat})


def _reveal(state, seat, a):
    _fields(a, ("cards",), typed=True)
    for c, _ in _locate(state, _ids(a["cards"])):
        c["known_by"] = [1, 2]


def _shuffle_action(state, seat, a):
    _fields(a, ("seat",), typed=True)
    _shuffle(state, _seat(a["seat"]))


def _mulligan(state, seat, a):
    _fields(a, (), ("n",), typed=True)
    n = _int(a["n"], 1, 7) if "n" in a else 7
    z = state["zones"][str(seat)]
    z["library"] += z["hand"]
    z["hand"] = []
    _shuffle(state, seat)
    _draw(state, seat, n)


def _life(state, seat, a):
    _fields(a, ("seat", "delta"), typed=True)
    p = state["players"][str(_seat(a["seat"]))]
    p["life"] = max(-999, min(999, p["life"] + _int(a["delta"], -999, 999)))


def _cmd_damage(state, seat, a):
    _fields(a, ("seat", "commander", "delta"), typed=True)
    s, name, delta = _seat(a["seat"]), _str(a["commander"], 1, 200), _int(a["delta"], -999, 999)
    if name not in state["players"][str(3 - s)]["commanders"]:
        _bad()
    d = state["players"][str(s)]["cmd_damage"]
    d[name] = max(0, min(999, d.get(name, 0) + delta))


def _roll(state, seat, a):
    _fields(a, ("sides",), typed=True)
    sides = _int(a["sides"], 2, 100)
    state["roll"] = {"seat": seat, "sides": sides, "result": _rng.randint(1, sides), "seq": state["seq"]}


_ACTIONS = {"move": _move, "tap": _tap, "untap_all": _untap_all, "flip": _flip, "counter": _counter,
            "token": _token, "delete": _delete, "look": _look, "reveal": _reveal,
            "shuffle": _shuffle_action, "mulligan": _mulligan, "life": _life,
            "cmd_damage": _cmd_damage, "roll": _roll}


def apply(state, seat, action):
    """Return a new state; the input is never mutated. Raises ActionError('invalid'|'stale')."""
    _seat(seat)
    if not isinstance(action, dict) or type(action.get("type")) is not str or action["type"] not in _ACTIONS:
        _bad()
    new = copy.deepcopy(state)
    new["seq"] += 1
    _ACTIONS[action["type"]](new, seat, action)
    return new
