import json

import pytest
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.test import Client

from accounts.models import User
from decks.models import Deck, DeckVersion
from games.models import Game, GamePlayer
from pod.asgi import application
from pods.models import Pod, PodMember

LIST = {"entries": [{"name": "Atraxa", "quantity": 1}, {"name": "Sol Ring", "quantity": 1}], "commanders": ["Atraxa"],
        "side": [{"name": "Mana Crypt", "quantity": 1}], "maybe": [{"name": "Island", "quantity": 2}]}

# Relies on table.py: new_game accepts {seat: {"entries","commanders"}}; apply(state, seat, {"type":"life",
# "seat":1..N,"delta":int}) changes state or raises ActionError("invalid") for a bad delta, and ("stale") for an unknown card id;
# view(state, seat) returns a dict with "players" keyed by str seat.
LIFE = {"type": "life", "seat": 1, "delta": -1}


def login(name):
    c = Client()
    c.user = User.objects.create_user(name, f"{name}@x.com", "pw")
    c.force_login(c.user)
    return c


def post(c, url, data):
    return c.post(url, json.dumps(data), content_type="application/json")


def mkdeck(user, cards=1):
    d = Deck.objects.create(owner=user, name="D")
    DeckVersion.objects.create(deck=d, list={**LIST, "entries": [LIST["entries"][0], {"name": "Sol Ring", "quantity": cards}]},
                               source="paste")
    return d


def choose(c, gid, deck=None):
    return post(c, f"/pod/api/games/{gid}/deck", {"deck": (deck or mkdeck(c.user)).id})


def ready(c, gid, ok=True, **boards):
    return post(c, f"/pod/api/games/{gid}/ready", {"ready": ok, **boards})


@pytest.fixture
def setup(db):
    a, b = login("ana"), login("ben")
    pod = Pod.objects.create(name="Mesa", rules={})
    PodMember.objects.create(pod=pod, user=a.user, role="admin")
    PodMember.objects.create(pod=pod, user=b.user, role="member")
    return a, b, pod


def lobby(a, b, pod, *more):
    r = post(a, f"/pod/api/pods/{pod.id}/games", {"opponents": [b.user.id, *(m.user.id for m in more)]})
    assert r.status_code == 201
    return r.json()["id"]


def active(a, b, pod, *more):
    gid = lobby(a, b, pod, *more)
    *first, last = (a, b, *more)
    for c in first:
        assert choose(c, gid).status_code == 200 and ready(c, gid).json()["status"] == "lobby"
    assert choose(last, gid).status_code == 200 and ready(last, gid).json()["status"] == "active"
    return gid


def comm(gid, c=None, origin=b"http://localhost"):
    headers = [(b"origin", origin)]
    if c:
        headers.append((b"cookie", f"{settings.SESSION_COOKIE_NAME}={c.cookies[settings.SESSION_COOKIE_NAME].value}".encode()))
    return WebsocketCommunicator(application, f"/pod/api/ws/game/{gid}", headers=headers)


def act(n, action=LIFE):
    return json.dumps({"n": n, "action": action})


def run(scenario):
    async_to_sync(scenario)()


# ---- REST ----

def test_lobby_flow(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    g = a.get(f"/pod/api/pods/{pod.id}/games").json()["games"]
    assert g == [{"id": gid, "status": "lobby", "seat": 1, "opponents": ["ben"],
                  "ready": {"1": False, "2": False}, "decks": {"1": False, "2": False}}]
    assert b.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["seat"] == 2
    assert choose(a, gid).json() == {"status": "lobby"}
    assert a.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["decks"] == {"1": True, "2": False}
    assert ready(a, gid).json() == {"status": "lobby"}
    assert a.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["ready"] == {"1": True, "2": False}
    assert Game.objects.get(pk=gid).state == {}
    choose(b, gid)
    assert ready(b, gid).json() == {"status": "active"}
    players = Game.objects.get(pk=gid).state["players"]
    assert players["1"]["life"] == players["2"]["life"] == 40
    assert choose(a, gid).status_code == 400 and ready(a, gid).status_code == 400


def test_ready_needs_a_deck_and_can_be_undone(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    assert ready(a, gid).json() == {"errors": {"deck": "none"}}
    assert post(a, f"/pod/api/games/{gid}/ready", {"ready": "yes"}).status_code == 400
    choose(a, gid), choose(b, gid)
    ready(a, gid)
    assert ready(a, gid, False).json() == {"status": "lobby"}
    assert ready(b, gid).json() == {"status": "lobby"}  # a took it back, so nobody starts
    assert not GamePlayer.objects.get(game_id=gid, seat=1).ready
    assert ready(a, gid).json() == {"status": "active"}


def played(gid, seat):
    zones = Game.objects.get(pk=gid).state["zones"][str(seat)]
    return sorted(c["name"] for z in zones.values() for c in z), [c["name"] for c in zones["command"]]


def test_moved_boards_are_what_is_dealt(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    choose(a, gid), choose(b, gid)
    moved = {"entries": [{"name": "Atraxa", "quantity": 1}, {"name": "Mana Crypt", "quantity": 1}, {"name": "Island", "quantity": 1}],
             "side": [{"name": "Sol Ring", "quantity": 1}], "maybe": [{"name": "Island", "quantity": 1}]}  # a split quantity
    assert ready(a, gid, **moved).json() == {"status": "lobby"}
    assert GamePlayer.objects.get(game_id=gid, seat=1).list == {**moved, "commanders": ["Atraxa"]}
    assert ready(b, gid).json() == {"status": "active"}
    assert played(gid, 1) == (["Atraxa", "Island", "Mana Crypt"], ["Atraxa"])
    assert played(gid, 2) == (["Atraxa", "Sol Ring"], ["Atraxa"])
    assert Deck.objects.get(owner=a.user).versions.get().list == LIST  # the saved deck is untouched


def test_bad_boards_refused(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    choose(a, gid, mkdeck(a.user, 3))
    atraxa, sol, crypt, isle = ({"name": n, "quantity": q} for n, q in (("Atraxa", 1), ("Sol Ring", 3), ("Mana Crypt", 1), ("Island", 2)))
    ok = {"entries": [atraxa, sol], "side": [crypt], "maybe": [isle]}
    cases = [
        {**ok, "side": [crypt, {"name": "Black Lotus", "quantity": 1}]},   # invented card
        {**ok, "side": []},                                                 # vanished
        {**ok, "entries": [atraxa, {"name": "Sol Ring", "quantity": 4}]},  # changed total
        {**ok, "entries": [sol], "side": [crypt, atraxa]},                  # commander moved out
        {"entries": [], "side": [atraxa, sol, crypt], "maybe": [isle]},     # empty main
        {**ok, "entries": [atraxa, {"name": "Sol Ring", "quantity": 0}]},   # malformed
        {**ok, "side": "x"},
        {"entries": ok["entries"]},                                         # others absent means empty
    ]
    for c in cases:
        assert ready(a, gid, **c).json() == {"errors": {"list": "invalid"}}, c
    assert not GamePlayer.objects.get(game_id=gid, seat=1).ready
    assert ready(a, gid, **ok).status_code == 200


def test_too_many_cards_in_main_refused(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    d = mkdeck(a.user, 249)
    d.versions.update(list={**LIST, "entries": [LIST["entries"][0], {"name": "Sol Ring", "quantity": 249}],
                            "side": [{"name": "Sol Ring", "quantity": 5}], "maybe": []})
    choose(a, gid, d)
    big = {"entries": [LIST["entries"][0], {"name": "Sol Ring", "quantity": 254}], "side": [], "maybe": []}
    assert ready(a, gid, **big).json() == {"errors": {"list": "invalid"}}


def test_rechoosing_resets_ready_and_boards(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    choose(a, gid)
    ready(a, gid, entries=[LIST["entries"][0]], side=[{"name": "Sol Ring", "quantity": 1}, *LIST["side"]], maybe=LIST["maybe"])
    p = GamePlayer.objects.get(game_id=gid, seat=1)
    assert p.ready and p.list["side"][0]["name"] == "Sol Ring"
    choose(a, gid)
    p = GamePlayer.objects.get(game_id=gid, seat=1)
    assert not p.ready and p.list == LIST


def test_lobby_refusals(setup):
    a, b, pod = setup
    c = login("cat")
    assert c.get(f"/pod/api/pods/{pod.id}/games").status_code == 404
    assert post(c, f"/pod/api/pods/{pod.id}/games", {"opponents": [a.user.id]}).status_code == 404
    gid = lobby(a, b, pod)
    assert post(c, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(c.user).id}).status_code == 404
    assert c.delete(f"/pod/api/games/{gid}").status_code == 404
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(b.user).id}).status_code == 404  # others' deck
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(a.user, 251).id}).json() == {"errors": {"deck": "size"}}
    assert post(c, f"/pod/api/games/{gid}/ready", {"ready": True}).status_code == 404
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": "x"}).status_code == 400
    assert Client().get(f"/pod/api/pods/{pod.id}/games").status_code == 403


def members(pod, n):
    out = []
    for i in range(n):
        c = login(f"p{i}")
        PodMember.objects.create(pod=pod, user=c.user, role="member")
        out.append(c)
    return out


@pytest.mark.parametrize("n", [3, 6])
def test_many_player_game_starts_after_the_last_ready(setup, n):
    a, b, pod = setup
    rest = members(pod, n - 2)
    gid = lobby(a, b, pod, *rest)
    everyone = [a, b, *rest]
    g = a.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]
    assert g["opponents"] == ["ben", *(f"p{i}" for i in range(n - 2))] and len(g["ready"]) == len(g["decks"]) == n
    assert [c.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["seat"] for c in everyone] == list(range(1, n + 1))
    for c in everyone:
        choose(c, gid)
    for c in everyone[:-1]:
        assert ready(c, gid).json()["status"] == "lobby"
    assert Game.objects.get(pk=gid).state == {}
    assert ready(everyone[-1], gid).json()["status"] == "active"
    assert sorted(Game.objects.get(pk=gid).state["players"]) == [str(s) for s in range(1, n + 1)]


def test_opponents_refused(setup):
    a, b, pod = setup
    rest = members(pod, 5)
    outsider = login("out")
    ids = [m.user.id for m in rest]
    for bad in ([], ids + [b.user.id], [b.user.id, b.user.id], [a.user.id], [b.user.id, a.user.id],
                [outsider.user.id], [b.user.id, outsider.user.id], "x", None, [None], [True], [[1]], b.user.id):
        r = post(a, f"/pod/api/pods/{pod.id}/games", {"opponents": bad})
        assert r.status_code == 400 and r.json() == {"errors": {"opponents": "invalid"}}, bad
    assert post(a, f"/pod/api/pods/{pod.id}/games", {"opponent": b.user.id}).status_code == 400
    assert post(a, f"/pod/api/pods/{pod.id}/games", {"opponents": ids}).status_code == 201  # five is the most
    assert Game.objects.count() == 1 and GamePlayer.objects.count() == 6


def test_game_limit(setup):
    a, b, pod = setup
    for _ in range(5):
        lobby(a, b, pod)
    r = post(a, f"/pod/api/pods/{pod.id}/games", {"opponents": [b.user.id]})
    assert r.status_code == 400 and r.json() == {"errors": {"games": "limit"}}


def test_deleted_user_leaves_null_opponents(setup):
    a, b, pod = setup
    lobby(a, b, pod)
    b.user.delete()
    assert a.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["opponents"] == [None]


# ---- WebSocket ----

@pytest.mark.django_db(transaction=True)
def test_connect_refused(setup):
    a, b, pod = setup
    c = login("cat")
    gid = active(a, b, pod)

    async def scenario():
        for who, g in ((None, gid), (c, gid), (a, gid + 99)):
            comm_ = comm(g, who)
            ok, code = await comm_.connect()
            assert not ok and code == 4403
        ok, _ = await comm(gid, a, origin=b"http://evil.example").connect()
        assert not ok

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_two_clients_same_seq_and_ack_only_to_actor(setup):
    a, b, pod = setup
    gid = active(a, b, pod)
    start = Game.objects.get(pk=gid).seq

    async def scenario():
        ca, cb = comm(gid, a), comm(gid, b)
        assert (await ca.connect())[0] and (await cb.connect())[0]
        sa, sb = await ca.receive_json_from(), await cb.receive_json_from()
        assert sa["seq"] == sb["seq"] == start and sa["ack"] is None
        assert sa["view"]["players"]["1"]["name"] == "ana" and sa["view"]["players"]["2"]["name"] == "ben"
        await ca.send_to(act(17))
        mine = await ca.receive_json_from()
        theirs = await cb.receive_json_from()
        assert mine["seq"] == theirs["seq"] == start + 1
        assert mine["ack"] == 17 and theirs["ack"] is None
        assert await ca.receive_nothing()  # the echo of its own change is skipped
        await ca.disconnect()
        await cb.disconnect()

    run(scenario)
    assert Game.objects.get(pk=gid).seq == start + 1


@pytest.mark.django_db(transaction=True)
def test_errors_and_rate_limit(setup):
    a, b, pod = setup
    gid = active(a, b, pod)

    async def scenario():
        c = comm(gid, a)
        await c.connect()
        await c.receive_json_from()
        await c.send_to(act(1, {"type": "life", "seat": 1, "delta": "x"}))
        assert await c.receive_json_from() == {"type": "error", "ack": 1, "code": "invalid"}
        await c.send_to(act(2, {"type": "tap", "cards": ["000000000000"], "tapped": True}))
        assert await c.receive_json_from() == {"type": "error", "ack": 2, "code": "stale"}
        await c.send_to("not json")
        assert (await c.receive_json_from())["code"] == "invalid"
        for n in range(3, 10):  # 3 rejected frames + 7 more = 10 within a second
            await c.send_to(act(n))
            assert (await c.receive_json_from())["type"] == "state"
        await c.send_to(act(11))
        assert await c.receive_json_from() == {"type": "error", "ack": 11, "code": "rate"}
        await c.disconnect()

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_three_players_each_get_their_own_view(setup):
    a, b, pod = setup
    (c,) = members(pod, 1)
    gid = active(a, b, pod, c)
    start = Game.objects.get(pk=gid).seq

    async def scenario():
        comms = [comm(gid, x) for x in (a, b, c)]
        for cm in comms:
            assert (await cm.connect())[0]
        states = [await cm.receive_json_from() for cm in comms]
        assert [s["view"]["you"] for s in states] == [1, 2, 3]
        assert all(sorted(s["view"]["players"]) == ["1", "2", "3"] for s in states)
        assert states[0]["view"]["players"]["3"]["name"] == "p0"
        await comms[2].send_to(act(1, {"type": "life", "seat": 1, "delta": -2}))
        assert (await comms[2].receive_json_from())["ack"] == 1
        for cm in comms[:2]:
            s = await cm.receive_json_from()
            assert s["seq"] == start + 1 and s["view"]["players"]["1"]["life"] == 38
        for cm in comms:
            await cm.disconnect()

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_big_frame_closes_4400(setup):
    a, b, pod = setup
    gid = active(a, b, pod)

    async def scenario():
        c = comm(gid, a)
        await c.connect()
        await c.receive_json_from()
        await c.send_to("x" * 5000)
        out = await c.receive_output()
        assert out == {"type": "websocket.close", "code": 4400}

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_lobby_view_and_action_refused(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)
    choose(a, gid)
    ready(a, gid)

    async def scenario():
        c = comm(gid, b)
        await c.connect()
        s = await c.receive_json_from()
        assert s["seq"] == 2 and s["ack"] is None
        assert s["view"] == {"status": "lobby", "you": 2, "zones": {},
                             "players": {"1": {"name": "ana", "deck": "D", "commanders": ["Atraxa"], "count": 2, "ready": True},
                                         "2": {"name": "ben", "deck": None, "commanders": [], "count": 0, "ready": False}},
                             "mine": {"deck": None, "entries": [], "commanders": [], "side": [], "maybe": []}}
        await c.send_to(act(5))
        assert await c.receive_json_from() == {"type": "error", "ack": 5, "code": "lobby"}
        await c.disconnect()

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_lobby_updates_live_and_hides_boards(setup):
    a, b, pod = setup
    gid = lobby(a, b, pod)

    async def scenario():
        ca, cb = comm(gid, a), comm(gid, b)
        await ca.connect(), await cb.connect()
        assert (await ca.receive_json_from())["seq"] == 0 and (await cb.receive_json_from())["seq"] == 0
        sync = sync_to_async
        d = await sync(mkdeck)(a.user)
        await sync(choose)(a, gid, d)
        sa, sb = await ca.receive_json_from(), await cb.receive_json_from()
        assert sa["seq"] == sb["seq"] == 1
        assert sb["view"]["players"]["1"]["deck"] == "D" and sb["view"]["players"]["1"]["ready"] is False
        assert sa["view"]["mine"]["deck"] == d.id and sa["view"]["mine"]["side"] == LIST["side"]
        assert sb["view"]["mine"]["deck"] is None and "Mana Crypt" not in json.dumps(sb)  # ana's boards are hers alone
        await sync(ready)(a, gid)
        assert (await cb.receive_json_from())["view"]["players"]["1"]["ready"] is True
        await ca.receive_json_from()
        await sync(choose)(b, gid)
        for cm in (ca, cb):
            assert (await cm.receive_json_from())["seq"] == 3
        await sync(ready)(b, gid)
        for cm in (ca, cb):
            last = await cm.receive_json_from()
            assert last["seq"] == 4 and last["view"]["status"] == "active"
        await ca.disconnect(), await cb.disconnect()

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_reconnect_gets_current_seq(setup):
    a, b, pod = setup
    gid = active(a, b, pod)
    start = Game.objects.get(pk=gid).seq

    async def scenario():
        c = comm(gid, a)
        await c.connect()
        await c.receive_json_from()
        await c.send_to(act(1))
        await c.receive_json_from()
        await c.disconnect()
        c2 = comm(gid, a)
        await c2.connect()
        assert (await c2.receive_json_from())["seq"] == start + 1
        await c2.disconnect()

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_delete_ends_game(setup):
    a, b, pod = setup
    gid = active(a, b, pod)

    async def scenario():
        c = comm(gid, b)
        await c.connect()
        await c.receive_json_from()
        assert (await sync_to_async(a.delete)(f"/pod/api/games/{gid}")).status_code == 204
        assert await c.receive_json_from() == {"type": "ended"}
        assert await c.receive_output() == {"type": "websocket.close", "code": 4000}

    run(scenario)
    assert not Game.objects.filter(pk=gid).exists()
    assert GamePlayer.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_deleted_opponent_shows_null_name(setup):
    a, b, pod = setup
    gid = active(a, b, pod)
    b.user.delete()

    async def scenario():
        c = comm(gid, a)
        await c.connect()
        s = await c.receive_json_from()
        assert s["view"]["players"]["2"]["name"] is None
        await c.send_to(act(1))
        assert (await c.receive_json_from())["ack"] == 1  # can still play both sides
        await c.disconnect()

    run(scenario)
