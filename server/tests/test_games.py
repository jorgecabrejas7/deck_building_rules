import json

import pytest
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.test import Client

from accounts.models import User
from decks.models import Deck, DeckVersion
from games.models import Game, GamePlayer
from pod.asgi import application
from pods.models import Pod, PodMember

LIST = {"entries": [{"name": "Sol Ring", "quantity": 1}], "commanders": ["Atraxa"]}

# Relies on table.py: new_game accepts {seat: {"entries","commanders"}}; apply(state, seat, {"type":"life",
# "seat":1|2,"delta":int}) changes state or raises ActionError("invalid") for a bad delta and ("stale") for a bad seat;
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
    DeckVersion.objects.create(deck=d, list={**LIST, "entries": [{"name": "Sol Ring", "quantity": cards}]},
                               source="paste")
    return d


@pytest.fixture
def setup(db):
    a, b = login("ana"), login("ben")
    pod = Pod.objects.create(name="Mesa", rules={})
    PodMember.objects.create(pod=pod, user=a.user, role="admin")
    PodMember.objects.create(pod=pod, user=b.user, role="member")
    return a, b, pod


def lobby(a, b, pod):
    r = post(a, f"/pod/api/pods/{pod.id}/games", {"opponent": b.user.id})
    assert r.status_code == 201
    return r.json()["id"]


def active(a, b, pod):
    gid = lobby(a, b, pod)
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(a.user).id}).status_code == 200
    assert post(b, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(b.user).id}).json()["status"] == "active"
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
    assert g == [{"id": gid, "status": "lobby", "seat": 1, "opponent": "ben", "picked": {"1": False, "2": False}}]
    assert b.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["seat"] == 2
    r = post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(a.user).id})
    assert r.json() == {"picked": {"1": True, "2": False}, "status": "lobby"}
    assert Game.objects.get(pk=gid).state == {}
    r = post(b, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(b.user).id})
    assert r.json()["status"] == "active"
    assert Game.objects.get(pk=gid).state["life"] == {"1": 40, "2": 40}
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(a.user).id}).status_code == 400


def test_lobby_refusals(setup):
    a, b, pod = setup
    c = login("cat")
    assert post(c, f"/pod/api/pods/{pod.id}/games", {"opponent": a.user.id}).status_code == 404
    assert c.get(f"/pod/api/pods/{pod.id}/games").status_code == 404
    for opp in (c.user.id, a.user.id, "x", None):  # outsider, self, junk
        r = post(a, f"/pod/api/pods/{pod.id}/games", {"opponent": opp})
        assert r.status_code == 400 and r.json() == {"errors": {"opponent": "invalid"}}
    gid = lobby(a, b, pod)
    assert post(c, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(c.user).id}).status_code == 404
    assert c.delete(f"/pod/api/games/{gid}").status_code == 404
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(b.user).id}).status_code == 404  # others' deck
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(a.user, 251).id}).json() == {"errors": {"deck": "size"}}
    assert post(a, f"/pod/api/games/{gid}/deck", {"deck": "x"}).status_code == 400
    assert Client().get(f"/pod/api/pods/{pod.id}/games").status_code == 403


def test_game_limit(setup):
    a, b, pod = setup
    for _ in range(5):
        lobby(a, b, pod)
    r = post(a, f"/pod/api/pods/{pod.id}/games", {"opponent": b.user.id})
    assert r.status_code == 400 and r.json() == {"errors": {"games": "limit"}}


def test_deleted_user_leaves_null_opponent(setup):
    a, b, pod = setup
    lobby(a, b, pod)
    b.user.delete()
    assert a.get(f"/pod/api/pods/{pod.id}/games").json()["games"][0]["opponent"] is None


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

    async def scenario():
        ca, cb = comm(gid, a), comm(gid, b)
        assert (await ca.connect())[0] and (await cb.connect())[0]
        sa, sb = await ca.receive_json_from(), await cb.receive_json_from()
        assert sa["seq"] == sb["seq"] == 1 and sa["ack"] is None
        assert sa["view"]["players"]["1"]["name"] == "ana" and sa["view"]["players"]["2"]["name"] == "ben"
        await ca.send_to(act(17))
        mine = await ca.receive_json_from()
        theirs = await cb.receive_json_from()
        assert mine["seq"] == theirs["seq"] == 2
        assert mine["ack"] == 17 and theirs["ack"] is None
        assert await ca.receive_nothing()  # the echo of its own change is skipped
        await ca.disconnect()
        await cb.disconnect()

    run(scenario)
    assert Game.objects.get(pk=gid).seq == 2


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
        await c.send_to(act(2, {"type": "life", "seat": 7, "delta": 1}))
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
    post(a, f"/pod/api/games/{gid}/deck", {"deck": mkdeck(a.user).id})

    async def scenario():
        c = comm(gid, b)
        await c.connect()
        s = await c.receive_json_from()
        assert s["seq"] == 0 and s["ack"] is None
        assert s["view"] == {"status": "lobby", "you": 2, "zones": {}, "picked": {"1": True, "2": False},
                             "players": {"1": {"name": "ana"}, "2": {"name": "ben"}}}
        await c.send_to(act(5))
        assert await c.receive_json_from() == {"type": "error", "ack": 5, "code": "lobby"}
        await c.disconnect()

    run(scenario)


@pytest.mark.django_db(transaction=True)
def test_reconnect_gets_current_seq(setup):
    a, b, pod = setup
    gid = active(a, b, pod)

    async def scenario():
        c = comm(gid, a)
        await c.connect()
        await c.receive_json_from()
        await c.send_to(act(1))
        await c.receive_json_from()
        await c.disconnect()
        c2 = comm(gid, a)
        await c2.connect()
        assert (await c2.receive_json_from())["seq"] == 2
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
        from asgiref.sync import sync_to_async
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
