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


def assert_no_leak(state, viewer):
    dumped = json.dumps(view(state, viewer))
    for c, z in all_cards(state):
        seen = (z not in ("library", "hand") and not c["face_down"]) or viewer in c["known_by"]
        if not seen and c["name"] not in ("a-card-000", "b-card-000"):  # commander names are public
            assert json.dumps(c["name"]) not in dumped, f"{c['name']} leaked to seat {viewer}"
    assert "known_by" not in dumped


def check(state):
    for v in (1, 2):
        assert_no_leak(state, v)


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
                assert not set(moving) & {c["id"] for c, _ in all_cards(g)}


def test_library_move_reissues_ids_within_library(game):
    top = ids(game, 1, "library")[:3]
    g = apply(game, 1, mv(top, 1, "library", pos="bottom"))
    assert not set(top) & set(ids(g, 1, "library"))
    check(g)


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
    top = ids(game, 2, "library")[:3]
    g = apply(game, 1, {"type": "look", "cards": top})
    v = view(g, 1)["zones"]["2"]["library"][:3]
    assert all("name" in c and c["shared"] is False for c in v)
    assert_no_leak(g, 2)
    g = apply(g, 1, {"type": "shuffle", "seat": 2})
    assert all(not c["known_by"] for c in g["zones"]["2"]["library"])
    assert not set(top) & set(ids(g, 2, "library"))
    check(g)


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


def test_fuzz(game):
    rnd = random.Random(1234)
    g = game
    check(g)
    for _ in range(500):
        cs = [c for c, _z in all_cards(g)]
        pick = lambda k=None: [c["id"] for c in rnd.sample(cs, min(len(cs), k or rnd.randint(1, 5)))]  # noqa: E731
        seat = rnd.choice((1, 2))
        t = rnd.choice(["move", "move", "move", "tap", "untap_all", "flip", "counter", "token", "delete",
                        "look", "reveal", "shuffle", "mulligan", "life", "cmd_damage", "roll"])
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
        }[t]()
        if t != "move":
            a = {"type": t, **a}
        if "x" in (a.get("cards") or [a.get("card")]):
            continue
        g = apply(g, seat, a)
        check(g)
        if t in ("move", "shuffle", "mulligan"):
            now = {c["id"] for c, _z in all_cards(g)}
            old = set(a.get("cards", [])) if t == "move" else set()
            assert not old & now
    assert sum(len(c) for zs in g["zones"].values() for c in zs.values()) >= 1
