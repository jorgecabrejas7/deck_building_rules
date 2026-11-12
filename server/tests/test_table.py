import json
import random

import pytest

from games.table import ActionError, apply, new_game, view


def deck(tag, n=100):
    entries = [{"name": f"{tag}-card-{i:03d}", "quantity": 1} for i in range(n)]
    return {"entries": entries, "commanders": [entries[0]["name"]]}


@pytest.fixture
def game():
    return new_game({1: deck("a"), 2: deck("b")})


def all_cards(state):
    return [(c, z) for zs in state["zones"].values() for z, cs in zs.items() for c in cs]


def assert_no_leak(state, viewer, ever=None):
    """No hidden name in the view. The log may name a card that is hidden now, but only one this seat could
    see at some earlier check: pass the same `ever` dict along a game to remember those."""
    v = view(state, viewer)
    log = json.dumps(v.pop("log"))
    dumped = json.dumps(v)
    seen = {n for p in state["players"].values() for n in p["commanders"]}  # public in players
    seen |= {c["name"] for c, z in all_cards(state)
            if (z not in ("library", "hand") and not c["face_down"]) or viewer in c["known_by"]}
    ever = (ever if ever is not None else {}).setdefault(viewer, set())
    ever |= seen
    for c, z in all_cards(state):
        # a name also on a visible card (duplicate token names) cannot be told apart
        if c["name"] not in seen:
            assert json.dumps(c["name"]) not in dumped, f"{c['name']} leaked to seat {viewer}"
        if c["name"] not in ever:
            assert json.dumps(c["name"]) not in log, f"{c['name']} leaked to seat {viewer} in the log"
    for secret in ("known_by", "uid", "history", "seen", "peek"):
        assert f'"{secret}"' not in dumped + log


def check(state, ever=None):
    for v in (1, 2):
        assert_no_leak(state, v, ever)


def ids(state, seat, zone):
    return [c["id"] for c in state["zones"][str(seat)][zone]]


def hidden_ids(state, viewer):
    out = set()
    for s, zs in view(state, viewer)["zones"].items():
        for z in ("library", "hand"):
            out |= {c["id"] for c in zs[z]}
        out |= {c["id"] for z in ("battlefield", "exile") for c in zs[z] if "name" not in c}
    return out


def card(state, cid):
    return next(c for c, _ in all_cards(state) if c["id"] == cid)


def mv(cards, seat, zone, **kw):
    return {"type": "move", "cards": cards, "to": {"seat": seat, "zone": zone}, **kw}


def test_new_game(game):
    assert [c["name"] for c in game["zones"]["1"]["command"]] == ["a-card-000"]
    assert len(game["zones"]["1"]["library"]) == 92 and len(game["zones"]["1"]["hand"]) == 7
    for s in "12":
        assert sum(len(c) for c in game["zones"][s].values()) == 100
    assert game["players"]["1"]["cmd_damage"] == {"b-card-000": 0}
    assert game["players"]["1"]["life"] == 40
    check(game)


def test_new_game_quantities_and_limit():
    d = {"entries": [{"name": "Forest", "quantity": 30}, {"name": "Cmdr", "quantity": 1}], "commanders": ["Cmdr"]}
    g = new_game({1: d, 2: d})
    assert sum(c["name"] == "Forest" for c in g["zones"]["1"]["library"] + g["zones"]["1"]["hand"]) == 30
    big = {"entries": [{"name": "x", "quantity": 99}] * 3, "commanders": ["x"]}
    with pytest.raises(ActionError) as e:
        new_game({1: big, 2: big})
    assert e.value.code == "invalid"


def test_apply_does_not_mutate(game):
    snap = json.dumps(game)
    apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield"))
    assert json.dumps(game) == snap


def test_move_each_destination_and_ids(game):
    for seat in (1, 2):
        for zone in ("library", "hand", "battlefield", "graveyard", "exile"):
            for pos in ((None,) if zone != "library" else ("top", "bottom")):
                moving = ids(game, 1, "hand")[:2]
                kw = {"pos": pos} if pos else {}
                g = apply(game, 1, mv(moving, seat, zone, **kw))
                check(g)
                assert set(moving) <= {c["id"] for c, _ in all_cards(g)}


def test_library_move_keeps_ids_within_library(game):
    top = ids(game, 1, "library")[:3]
    g = apply(game, 1, mv(top, 1, "library", pos="bottom"))
    assert ids(g, 1, "library")[-3:] == top
    check(g)


def test_ids_survive_moves_and_draws_but_not_shuffles(game):
    c = ids(game, 1, "hand")[0]
    g = game
    for zone in ("battlefield", "graveyard", "hand"):
        g = apply(g, 1, mv([c], 1, zone))
        assert c in ids(g, 1, zone)
    top = ids(g, 1, "library")[0]
    g = apply(g, 1, mv([top], 1, "hand"))
    assert top in ids(g, 1, "hand")
    lib = set(ids(g, 1, "library"))
    assert not lib & set(ids(apply(g, 1, {"type": "shuffle", "seat": 1}), 1, "library"))
    mull = apply(g, 1, {"type": "mulligan", "n": 7})
    before = lib | set(ids(g, 1, "hand"))
    assert not before & (set(ids(mull, 1, "library")) | set(ids(mull, 1, "hand")))


def test_library_top_order(game):
    cs = ids(game, 1, "hand")[:2]
    names = [card(game, i)["name"] for i in cs]
    g = apply(game, 1, mv(cs, 1, "library"))
    assert [c["name"] for c in g["zones"]["1"]["library"][:2]] == names


def test_draw_then_bounce_opponent_knows(game):
    top = ids(game, 1, "library")[:1]
    name = card(game, top[0])["name"]
    g = apply(game, 1, mv(top, 1, "hand"))
    assert_no_leak(g, 2)
    assert 2 not in g["zones"]["1"]["hand"][-1]["known_by"]
    g = apply(g, 1, mv(ids(g, 1, "hand")[-1:], 1, "battlefield"))
    g = apply(g, 1, mv(ids(g, 1, "battlefield")[-1:], 1, "hand"))
    v = view(g, 2)["zones"]["1"]["hand"][-1]
    assert v["name"] == name and v["shared"] is True
    check(g)


def test_look_then_shuffle_nobody_knows(game):
    ever = {}
    top = ids(game, 2, "library")[:3]
    g = apply(game, 1, {"type": "look", "cards": top})
    v = view(g, 1)["zones"]["2"]["library"][:3]
    assert all("name" in c and c["shared"] is False for c in v)
    check(g, ever)
    g = apply(g, 1, {"type": "shuffle", "seat": 2})
    assert all(not c["known_by"] for c in g["zones"]["2"]["library"])
    assert not set(top) & set(ids(g, 2, "library"))
    check(g, ever)


def test_reveal(game):
    h = ids(game, 1, "hand")[:2]
    g = apply(game, 1, {"type": "reveal", "cards": h})
    assert all("name" in c for c in view(g, 2)["zones"]["1"]["hand"][:2])
    check(g)


def test_face_down_hidden_then_graveyard_face_up(game):
    h = ids(game, 1, "hand")[:1]
    g = apply(game, 1, mv(h, 1, "battlefield", face_down=True))
    c = view(g, 2)["zones"]["1"]["battlefield"][0]
    assert c["face_down"] and "name" not in c
    assert "name" in view(g, 1)["zones"]["1"]["battlefield"][0]
    check(g)
    g = apply(g, 1, mv(ids(g, 1, "battlefield"), 1, "graveyard", face_down=True))
    c = view(g, 2)["zones"]["1"]["graveyard"][0]
    assert not c["face_down"] and "name" in c
    check(g)


def test_flip(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield"))
    cid = ids(g, 1, "battlefield")
    g = apply(g, 1, {"type": "flip", "cards": cid, "face_down": True})
    assert ids(g, 1, "battlefield") == cid
    assert "name" in view(g, 1)["zones"]["1"]["battlefield"][0]
    check(g)
    g = apply(g, 2, {"type": "flip", "cards": cid, "face_down": False})
    assert "name" in view(g, 2)["zones"]["1"]["battlefield"][0]
    with pytest.raises(ActionError) as e:
        apply(g, 1, {"type": "flip", "cards": ids(g, 1, "hand")[:1], "face_down": True})
    assert e.value.code == "invalid"


def test_tap_and_untap_all(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:2], 1, "battlefield"))
    g = apply(g, 1, {"type": "tap", "cards": ids(g, 1, "battlefield"), "tapped": True})
    assert all(c["tapped"] for c in g["zones"]["1"]["battlefield"])
    g = apply(g, 2, {"type": "untap_all", "seat": 1})
    assert not any(c["tapped"] for c in g["zones"]["1"]["battlefield"])
    check(g)


def test_leaving_battlefield_clears_tap_and_counters(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield"))
    cid = ids(g, 1, "battlefield")[0]
    g = apply(g, 1, {"type": "counter", "card": cid, "name": "+1/+1", "delta": 3})
    g = apply(g, 1, {"type": "tap", "cards": [cid], "tapped": True})
    g = apply(g, 1, mv([cid], 2, "battlefield"))  # give control keeps them
    cid = ids(g, 2, "battlefield")[0]
    assert g["zones"]["2"]["battlefield"][0]["counters"] == {"+1/+1": 3}
    g = apply(g, 1, mv([cid], 2, "graveyard"))
    c = g["zones"]["2"]["graveyard"][0]
    assert c["counters"] == {} and not c["tapped"]


def test_counter(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield"))
    cid = ids(g, 1, "battlefield")[0]
    g = apply(g, 1, {"type": "counter", "card": cid, "name": "loyalty", "delta": 999})
    g = apply(g, 1, {"type": "counter", "card": cid, "name": "loyalty", "delta": 5})
    assert g["zones"]["1"]["battlefield"][0]["counters"] == {"loyalty": 999}
    g = apply(g, 1, {"type": "counter", "card": cid, "name": "loyalty", "delta": -999})
    g = apply(g, 1, {"type": "counter", "card": cid, "name": "loyalty", "delta": -1})
    assert g["zones"]["1"]["battlefield"][0]["counters"] == {"loyalty": -1}
    g = apply(g, 1, {"type": "counter", "card": cid, "name": "loyalty", "delta": 1})
    assert g["zones"]["1"]["battlefield"][0]["counters"] == {}
    check(g)


def test_token_and_delete(game):
    g = apply(game, 1, {"type": "token", "seat": 2, "name": "Goblin", "count": 3})
    toks = g["zones"]["2"]["battlefield"]
    assert len(toks) == 3 and all(t["token"] and t["owner"] == 2 for t in toks)
    assert all(c["token"] and "name" in c for c in view(g, 1)["zones"]["2"]["battlefield"])
    g = apply(g, 1, {"type": "delete", "card": toks[0]["id"]})
    assert len(g["zones"]["2"]["battlefield"]) == 2
    with pytest.raises(ActionError) as e:
        apply(g, 1, {"type": "delete", "card": ids(g, 1, "hand")[0]})
    assert e.value.code == "invalid"
    check(g)


def test_shuffle(game):
    old = ids(game, 1, "library")
    g = apply(game, 2, {"type": "shuffle", "seat": 1})
    assert not set(old) & set(ids(g, 1, "library"))
    assert sorted(c["name"] for c in g["zones"]["1"]["library"]) == sorted(
        c["name"] for c in game["zones"]["1"]["library"])
    check(g)


def test_mulligan(game):
    old = set(ids(game, 1, "hand"))
    g = apply(game, 1, {"type": "mulligan"})
    new = ids(g, 1, "hand")
    assert len(new) == 7 and not old & set(new) and len(g["zones"]["1"]["library"]) == 92
    assert all(g["zones"]["1"]["hand"][i]["known_by"] == [1] for i in range(7))
    check(g)
    assert len(apply(g, 1, {"type": "mulligan", "n": 6})["zones"]["1"]["hand"]) == 6


def test_life(game):
    g = apply(game, 1, {"type": "life", "seat": 2, "delta": -7})
    assert view(g, 1)["players"]["2"]["life"] == 33
    assert apply(g, 1, {"type": "life", "seat": 2, "delta": -999})["players"]["2"]["life"] == -966


def test_cmd_damage(game):
    g = apply(game, 1, {"type": "cmd_damage", "seat": 1, "commander": "b-card-000", "delta": 4})
    assert view(g, 2)["players"]["1"]["cmd_damage"] == {"b-card-000": 4}
    for bad in ("a-card-000", "a-card-001", "nope"):
        with pytest.raises(ActionError) as e:
            apply(g, 1, {"type": "cmd_damage", "seat": 1, "commander": bad, "delta": 1})
        assert e.value.code == "invalid"
    check(g)


def test_roll(game):
    g = apply(game, 2, {"type": "roll", "sides": 20})
    r = g["roll"]
    assert r["seat"] == 2 and r["sides"] == 20 and 1 <= r["result"] <= 20 and r["seq"] == g["seq"] == 1
    assert view(g, 1)["roll"] == r


@pytest.mark.parametrize("seat,action,code", [
    (3, {"type": "life", "seat": 1, "delta": 1}, "invalid"),
    (True, {"type": "life", "seat": 1, "delta": 1}, "invalid"),
    (1, {"type": "bogus"}, "invalid"),
    (1, {}, "invalid"),
    (1, "move", "invalid"),
    (1, {"type": "life", "seat": 1, "delta": True}, "invalid"),
    (1, {"type": "life", "seat": 1, "delta": 1.0}, "invalid"),
    (1, {"type": "life", "seat": 1, "delta": 1000}, "invalid"),
    (1, {"type": "life", "seat": 1, "delta": 1, "extra": 1}, "invalid"),
    (1, {"type": "life", "seat": 1}, "invalid"),
    (1, {"type": "life", "seat": 0, "delta": 1}, "invalid"),
    (1, {"type": "roll", "sides": 1}, "invalid"),
    (1, {"type": "roll", "sides": 101}, "invalid"),
    (1, {"type": "token", "seat": 1, "name": "", "count": 1}, "invalid"),
    (1, {"type": "token", "seat": 1, "name": "x" * 101, "count": 1}, "invalid"),
    (1, {"type": "token", "seat": 1, "name": "x", "count": 21}, "invalid"),
    (1, {"type": "mulligan", "n": 8}, "invalid"),
    (1, {"type": "shuffle", "seat": "1"}, "invalid"),
    (1, {"type": "move", "cards": [], "to": {"seat": 1, "zone": "hand"}}, "invalid"),
    (1, {"type": "move", "cards": ["a", "a"], "to": {"seat": 1, "zone": "hand"}}, "invalid"),
    (1, {"type": "move", "cards": ["x"] * 101, "to": {"seat": 1, "zone": "hand"}}, "invalid"),
    (1, {"type": "move", "cards": [1], "to": {"seat": 1, "zone": "hand"}}, "invalid"),
    (1, {"type": "move", "cards": ["a"], "to": {"seat": 1, "zone": "sideboard"}}, "invalid"),
    (1, {"type": "move", "cards": ["a"], "to": {"seat": 1, "zone": "hand"}, "pos": "top"}, "invalid"),
    (1, {"type": "move", "cards": ["a"], "to": {"seat": 1, "zone": "library"}, "pos": "middle"}, "invalid"),
    (1, {"type": "move", "cards": ["a"], "to": {"seat": 1, "zone": "hand", "x": 1}}, "invalid"),
    (1, {"type": "move", "cards": ["a"], "to": {"seat": 1, "zone": "hand"}}, "stale"),
    (1, {"type": "tap", "cards": ["a"], "tapped": 1}, "invalid"),
    (1, {"type": "tap", "cards": ["a"], "tapped": True}, "stale"),
    (1, {"type": "look", "cards": ["a"]}, "stale"),
    (1, {"type": "counter", "card": "a", "name": "x" * 31, "delta": 1}, "invalid"),
    (1, {"type": "counter", "card": "a", "name": "x", "delta": 1}, "stale"),
    (1, {"type": "delete", "card": "a"}, "stale"),
])
def test_invalid_inputs(game, seat, action, code):
    with pytest.raises(ActionError) as e:
        apply(game, seat, action)
    assert e.value.code == code


def test_move_face_down_non_bool_and_cleared(game):
    h = ids(game, 1, "hand")
    with pytest.raises(ActionError):
        apply(game, 1, mv(h[:1], 1, "battlefield", face_down="yes"))
    g = apply(game, 1, mv(h[:1], 1, "graveyard", face_down=True))
    assert not g["zones"]["1"]["graveyard"][0]["face_down"]


def test_token_cap(game):
    g = game
    with pytest.raises(ActionError):
        for _ in range(40):
            g = apply(g, 1, {"type": "token", "seat": 1, "name": "t", "count": 20})


def test_move_to_top_after_shuffling(game):
    lib = ids(game, 1, "library")
    g = apply(game, 1, {"type": "look", "cards": lib[:50]})
    g = apply(g, 1, mv([lib[40]], 1, "library", pos="top", shuffle=True))
    top = g["zones"]["1"]["library"][0]
    assert top["name"] == card(game, lib[40])["name"] and top["known_by"] == [1]
    assert not any(c["known_by"] for c in g["zones"]["1"]["library"][1:])  # the rest was shuffled
    with pytest.raises(ActionError):
        apply(g, 1, mv(ids(g, 1, "hand")[:1], 1, "graveyard", shuffle=True))


def test_attach_follows_host_and_falls_off(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:3], 1, "battlefield"))
    aura, host, other = ids(g, 1, "battlefield")
    g = apply(g, 1, {"type": "attach", "card": aura, "to": host})
    assert card(g, aura)["attached"] == host
    assert view(g, 2)["zones"]["1"]["battlefield"][0]["attached"] == host
    g = apply(g, 1, mv([host], 2, "battlefield"))  # change of control: the aura follows
    new_host = ids(g, 2, "battlefield")[0]
    assert card(g, aura)["attached"] == new_host
    g = apply(g, 2, mv([new_host], 2, "graveyard"))  # host leaves: the aura stays, unattached
    assert card(g, aura)["attached"] is None
    g = apply(g, 1, {"type": "attach", "card": aura, "to": other})
    g = apply(g, 1, {"type": "attach", "card": aura, "to": None})
    assert card(g, aura)["attached"] is None
    g = apply(g, 1, {"type": "attach", "card": aura, "to": other})
    g = apply(g, 1, mv([aura], 1, "hand"))  # the attachment leaves: its pointer goes with it
    assert card(g, ids(g, 1, "hand")[-1])["attached"] is None


def test_attach_from_hand_enters_battlefield(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield"))
    host, equip = ids(g, 1, "battlefield")[0], ids(g, 1, "hand")[0]
    g = apply(g, 1, {"type": "attach", "card": equip, "to": host})
    entered = g["zones"]["1"]["battlefield"][-1]
    assert entered["attached"] == host and entered["id"] == equip
    check(g)


@pytest.mark.parametrize("bad", ["self", "hand", "nested"])
def test_attach_invalid(game, bad):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:3], 1, "battlefield"))
    a, b, c = ids(g, 1, "battlefield")
    g = apply(g, 1, {"type": "attach", "card": b, "to": c})
    to = {"self": a, "hand": ids(g, 1, "hand")[0], "nested": b}[bad]
    with pytest.raises(ActionError):
        apply(g, 1, {"type": "attach", "card": a, "to": to})


def test_fuzz(game):
    rnd = random.Random(1234)
    g, ever = game, {}
    check(g, ever)
    for _ in range(500):
        cs = [c for c, _z in all_cards(g)]
        pick = lambda k=None: [c["id"] for c in rnd.sample(cs, min(len(cs), k or rnd.randint(1, 5)))]  # noqa: E731
        seat = rnd.choice((1, 2))
        t = rnd.choice(["move", "move", "move", "tap", "untap_all", "flip", "counter", "token", "delete",
                        "look", "reveal", "shuffle", "mulligan", "life", "cmd_damage", "roll", "attach",
                        "pass_turn", "undo", "undo"])
        other = 3 - seat
        a = {
            "move": lambda: mv(pick(), rnd.choice((1, 2)), z := rnd.choice(
                ["library", "hand", "battlefield", "graveyard", "exile", "command"]),
                **({"pos": rnd.choice(("top", "bottom"))} if z == "library" else {}),
                **({"face_down": rnd.random() < .5} if z in ("battlefield", "exile") else {})),
            "tap": lambda: {"cards": pick(), "tapped": rnd.random() < .5},
            "untap_all": lambda: {"seat": seat},
            "flip": lambda: {"cards": [c["id"] for c in g["zones"][str(seat)]["battlefield"]][:3] or ["x"],
                             "face_down": rnd.random() < .5},
            "counter": lambda: {"card": pick(1)[0], "name": rnd.choice(("a", "b", "c")), "delta": rnd.randint(-3, 3)},
            "token": lambda: {"seat": seat, "name": "tok", "count": rnd.randint(1, 3)},
            "delete": lambda: {"card": next((c["id"] for c in cs if c["token"]), "x")},
            "look": lambda: {"cards": pick()},
            "reveal": lambda: {"cards": pick(2)},
            "shuffle": lambda: {"seat": seat},
            "mulligan": lambda: {"n": rnd.randint(1, 7)},
            "life": lambda: {"seat": seat, "delta": rnd.randint(-5, 5)},
            "cmd_damage": lambda: {"seat": seat, "commander": f"{'ab'[other - 1]}-card-000", "delta": rnd.randint(-2, 5)},
            "roll": lambda: {"sides": rnd.randint(2, 20)},
            "attach": lambda: {"card": pick(1)[0], "to": rnd.choice([None] + [c["id"] for zs in g["zones"].values()
                                                                        for c in zs["battlefield"]][:4])},
            "pass_turn": lambda: {"draw": rnd.random() < .5},
            "undo": lambda: {},
        }[t]()
        if t != "move":
            a = {"type": t, **a}
        if "x" in (a.get("cards") or [a.get("card")]):
            continue
        try:
            g = apply(g, seat, a)
        except ActionError as e:
            # a random host can be the card itself or already attached; undo needs your own undoable action
            assert (t, e.code) in (("attach", "invalid"), ("undo", "undo"))
            assert t == "attach" or not view(g, seat)["can_undo"]
            continue
        check(g, ever)
        assert len(g["log"]) <= 50 and len(g["history"]) <= 5 and g["log"][-1]["type"] == t
        on_bf = {c["id"] for zs in g["zones"].values() for c in zs["battlefield"]}
        assert all(c.get("attached") in on_bf | {None} for c, _z in all_cards(g))
        if t == "move":
            assert set(a["cards"]) <= {c["id"] for c, _z in all_cards(g)}
    assert sum(len(c) for zs in g["zones"].values() for c in zs.values()) >= 1


def test_turns(game):
    assert game["turn"]["seat"] in (1, 2) and game["turn"]["number"] == 1
    assert {new_game({1: deck("a"), 2: deck("b")})["turn"]["seat"] for _ in range(40)} == {1, 2}
    nxt = 3 - game["turn"]["seat"]
    g = apply(game, nxt, mv(ids(game, nxt, "hand")[:2], nxt, "battlefield"))
    g = apply(g, nxt, {"type": "tap", "cards": ids(g, nxt, "battlefield"), "tapped": True})
    g = apply(g, 3 - nxt, {"type": "pass_turn", "draw": True})
    assert view(g, 1)["turn"] == {"seat": nxt, "number": 2}
    assert not any(c["tapped"] for c in g["zones"][str(nxt)]["battlefield"])
    assert len(g["zones"][str(nxt)]["hand"]) == 6
    drawn = g["zones"][str(nxt)]["hand"][-1]["name"]
    mine, theirs = view(g, nxt)["log"][-1], view(g, 3 - nxt)["log"][-1]
    assert mine["cards"] == [{"seat": nxt, "zone": "library", "name": drawn}]
    assert theirs["cards"] == [{"seat": nxt, "zone": "library"}]
    assert theirs["type"] == "pass_turn" and theirs["target"] == nxt and theirs["turn"] == 2
    g = apply(g, nxt, {"type": "pass_turn"})
    assert g["turn"] == {"seat": 3 - nxt, "number": 3} and g["log"][-1]["cards"] == []
    with pytest.raises(ActionError):
        apply(g, 1, {"type": "pass_turn", "draw": 1})
    check(g)


def test_undo_play_keeps_what_was_seen(game):
    hand = ids(game, 1, "hand")
    g = apply(game, 1, mv(hand[:1], 1, "battlefield"))
    assert view(g, 1)["can_undo"] and not view(g, 2)["can_undo"]
    with pytest.raises(ActionError) as e:
        apply(g, 2, {"type": "undo"})
    assert e.value.code == "undo"
    g = apply(g, 1, {"type": "undo"})
    assert ids(g, 1, "hand") == hand and g["zones"]["1"]["battlefield"] == []
    assert g["zones"]["1"]["hand"][0]["known_by"] == [1, 2]  # seat 2 saw it played
    assert g["seq"] == 2 and g["log"][-1]["undone"] == "move" and not view(g, 1)["can_undo"]
    check(g)


def test_undo_depth_and_turn_order(game):
    g = game
    for _ in range(6):
        g = apply(g, 1, {"type": "life", "seat": 2, "delta": -1})
    for _ in range(5):
        g = apply(g, 1, {"type": "undo"})
    assert g["players"]["2"]["life"] == 39
    with pytest.raises(ActionError):
        apply(g, 1, {"type": "undo"})
    g = apply(g, 1, {"type": "life", "seat": 1, "delta": 1})
    g = apply(g, 2, {"type": "pass_turn"})  # the other seat acted: seat 1's run is gone
    assert not view(g, 1)["can_undo"] and view(g, 2)["can_undo"]
    turn = game["turn"]
    g = apply(g, 2, {"type": "undo"})
    assert g["turn"] == turn and not view(g, 1)["can_undo"] and not view(g, 2)["can_undo"]
    with pytest.raises(ActionError):
        apply(g, 1, {"type": "undo", "x": 1})


@pytest.mark.parametrize("make", [
    lambda g: {"type": "shuffle", "seat": 1},
    lambda g: {"type": "mulligan"},
    lambda g: {"type": "look", "cards": ids(g, 1, "library")[:1]},
    lambda g: {"type": "reveal", "cards": ids(g, 1, "hand")[:1]},
    lambda g: {"type": "roll", "sides": 6},
    lambda g: {"type": "pass_turn", "draw": True},
    lambda g: mv(ids(g, 1, "hand")[:1], 1, "library", shuffle=True),
    lambda g: mv(ids(g, 1, "library")[:1], 1, "hand"),  # a draw shows the actor a card
    lambda g: mv(ids(g, 1, "library")[:2], 1, "graveyard"),  # a mill too
    lambda g: mv(ids(g, 2, "hand")[:1], 2, "graveyard"),  # so does discarding the opponent's card
    lambda g: {"type": "attach", "card": ids(g, 1, "library")[0], "to": ids(g, 1, "battlefield")[0]},
    lambda g: {"type": "flip", "cards": ids(g, 2, "battlefield"), "face_down": False},  # their morph
])
def test_actions_that_cannot_be_undone(game, make):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield"))
    g = apply(g, 2, mv(ids(g, 2, "hand")[:1], 2, "battlefield", face_down=True))
    g = apply(g, 1, {"type": "life", "seat": 1, "delta": 1})
    g = apply(g, 1, make(g))
    assert not view(g, 1)["can_undo"]
    with pytest.raises(ActionError):
        apply(g, 1, {"type": "undo"})


def test_undoable_own_face_down_flip(game):
    g = apply(game, 1, mv(ids(game, 1, "hand")[:1], 1, "battlefield", face_down=True))
    g = apply(g, 1, {"type": "flip", "cards": ids(g, 1, "battlefield"), "face_down": False})
    assert view(g, 1)["can_undo"]


def test_log_names_per_seat(game):
    top = ids(game, 1, "library")[0]
    name = card(game, top)["name"]
    g = apply(game, 1, mv([top], 1, "hand"))
    assert view(g, 1)["log"][-1]["cards"] == [{"seat": 1, "zone": "library", "name": name}]
    assert view(g, 2)["log"][-1] == {"seq": 1, "turn": 1, "seat": 1, "type": "move", "pos": None,
                                     "cards": [{"seat": 1, "zone": "library"}], "to": {"seat": 1, "zone": "hand"},
                                     "face_down": False, "shuffle": False}
    g = apply(g, 1, mv(ids(g, 1, "hand")[-1:], 1, "battlefield", face_down=True))
    assert "name" not in view(g, 2)["log"][-1]["cards"][0] and "name" in view(g, 1)["log"][-1]["cards"][0]
    g = apply(g, 1, mv(ids(g, 1, "hand")[:1], 1, "battlefield"))
    assert all("name" in view(g, s)["log"][-1]["cards"][0] for s in (1, 2))
    for _ in range(60):
        g = apply(g, 2, {"type": "roll", "sides": 6})
    log = view(g, 1)["log"]
    assert len(log) == 50 and log[-1]["type"] == "roll" and log[-1]["result"] == g["roll"]["result"]
    check(g)
