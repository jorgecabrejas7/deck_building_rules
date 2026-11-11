import json

import pytest
from django.test import Client

from accounts.models import User
from friends.models import Friendship, are_friends
from friends.views import MAX_FRIENDS
from pods.views import MAX_PODS

pytestmark = pytest.mark.django_db


def login(name):
    c = Client()
    c.user = User.objects.create_user(name, f"{name}@x.com", "pw")
    c.force_login(c.user)
    return c


def send(cl, method, url, data=None):
    return getattr(cl, method)(url, json.dumps(data) if data is not None else "", content_type="application/json")


def ask(cl, name):
    return send(cl, "post", "/pod/api/friends", {"username": name})


@pytest.fixture
def a():
    return login("ana")


@pytest.fixture
def b():
    return login("Ben")


def befriend(a, b):
    ask(a, b.user.username)
    ask(b, a.user.username)


def test_request_and_list(a, b):
    r = ask(a, "ben")
    assert (r.status_code, r.json()) == (201, {"status": "sent"})
    assert ask(a, "BEN").json() == {"status": "sent"}
    assert a.get("/pod/api/friends").json() == {"friends": [], "incoming": [], "outgoing": [{"id": b.user.id, "name": "Ben"}]}
    assert b.get("/pod/api/friends").json()["incoming"] == [{"id": a.user.id, "name": "ana"}]


def test_reverse_request_accepts(a, b):
    ask(a, "Ben")
    r = ask(b, "ana")
    assert (r.status_code, r.json()) == (200, {"status": "friends"})
    assert ask(a, "Ben").json() == {"status": "friends"}
    assert Friendship.objects.count() == 1 and are_friends(a.user.id, b.user.id)
    assert b.get("/pod/api/friends").json()["friends"] == [{"id": a.user.id, "name": "ana"}]


def test_accept_endpoint(a, b):
    ask(a, "Ben")
    assert send(a, "post", f"/pod/api/friends/{b.user.id}/accept").status_code == 404
    assert send(b, "post", f"/pod/api/friends/{a.user.id}/accept").status_code == 204
    assert are_friends(a.user.id, b.user.id)
    assert send(b, "post", f"/pod/api/friends/{a.user.id}/accept").status_code == 404


def test_decline_cancel_unfriend(a, b):
    assert send(a, "delete", f"/pod/api/friends/{b.user.id}").status_code == 404
    ask(a, "Ben")
    assert send(b, "delete", f"/pod/api/friends/{a.user.id}").status_code == 204
    ask(a, "Ben")
    assert send(a, "delete", f"/pod/api/friends/{b.user.id}").status_code == 204
    befriend(a, b)
    assert send(b, "delete", f"/pod/api/friends/{a.user.id}").status_code == 204
    assert Friendship.objects.count() == 0


def test_bad_usernames(a, b):
    b.user.is_active = False
    b.user.save()
    for name, err in (("nobody", "unknown"), ("Ben", "unknown"), ("ANA", "self"), (5, "unknown")):
        r = ask(a, name)
        assert (r.status_code, r.json()) == (400, {"errors": {"username": err}})


def test_signed_out():
    c = Client()
    assert c.get("/pod/api/friends").status_code == 403


def test_cap(a):
    for i in range(MAX_FRIENDS):
        Friendship.objects.create(from_user=a.user, to_user=User.objects.create_user(f"u{i}", f"u{i}@x.com", "pw"))
    login("late")
    r = ask(a, "late")
    assert (r.status_code, r.json()) == (400, {"errors": {"friends": "limit"}})


def new_pod(cl):
    return send(cl, "post", "/pod/api/pods", {"name": "P"}).json()["pod"]["id"]


def test_add_friend_to_pod(a, b):
    pid = new_pod(a)
    url = f"/pod/api/pods/{pid}/members"
    assert send(a, "post", url, {"user": b.user.id}).status_code == 400
    ask(a, "Ben")
    assert send(a, "post", url, {"user": b.user.id}).json() == {"errors": {"user": "invalid"}}
    befriend(a, b)
    r = send(a, "post", url, {"user": b.user.id})
    assert r.status_code == 201
    assert [m["name"] for m in r.json()["pod"]["members"]] == ["ana", "Ben"]
    assert send(a, "post", url, {"user": b.user.id}).status_code == 200
    assert send(b, "post", url, {"user": a.user.id}).json() == {"error": "admin"}


def test_add_friend_pod_limit(a, b):
    befriend(a, b)
    pid = new_pod(a)
    for _ in range(MAX_PODS):
        new_pod(b)
    r = send(a, "post", f"/pod/api/pods/{pid}/members", {"user": b.user.id})
    assert (r.status_code, r.json()) == (400, {"errors": {"pods": "limit"}})
