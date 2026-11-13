import json
from unittest import mock

import pytest
from django.test import Client

from accounts.models import User
from decks import views
from decks.models import Deck, DeckVersion

pytestmark = pytest.mark.django_db
LIST = {"entries": [{"name": "Sol Ring", "quantity": 1}, {"name": "Island", "quantity": 30}],
        "commanders": ["Atraxa"], "side": [{"name": "Mana Crypt", "quantity": 1}], "maybe": []}
BODY = {"name": "My deck", "list": LIST, "source": "paste"}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def refuse(*a, **k):
        raise AssertionError("network call")
    monkeypatch.setattr(views.urllib.request, "urlopen", refuse)


def login(name):
    c = Client()
    c.force_login(User.objects.create_user(name, f"{name}@x.com", "pw"))
    return c


@pytest.fixture
def a():
    return login("ana")


@pytest.fixture
def b():
    return login("ben")


def send(c, method, url, data=None):
    return getattr(c, method)(url, json.dumps(data) if data is not None else "", content_type="application/json")


def make(c, **over):
    r = send(c, "post", "/pod/api/decks", {**BODY, **over})
    assert r.status_code == 201
    return r.json()["deck"]


def test_anonymous_forbidden_everywhere():
    c = Client()
    for method, url in [("get", "/pod/api/decks"), ("post", "/pod/api/decks"), ("get", "/pod/api/decks/1"),
                        ("post", "/pod/api/decks/1"), ("delete", "/pod/api/decks/1"),
                        ("post", "/pod/api/decks/1/versions"), ("get", "/pod/api/decks/link/x"),
                        ("get", "/pod/api/archidekt/1"), ("get", "/pod/api/archidekt/user/x")]:
        r = send(c, method, url, {} if method == "post" else None)
        assert (r.status_code, r.json()) == (403, {"error": "forbidden"}), url


def test_create_list_get(a):
    d = make(a)
    assert d["version_count"] == 1 and d["commanders"] == ["Atraxa"] and d["visibility"] == "private"
    assert send(a, "get", "/pod/api/decks").json()["decks"][0]["id"] == d["id"]
    r = send(a, "get", f"/pod/api/decks/{d['id']}").json()
    assert r["versions"][0]["list"] == LIST and r["versions"][0]["source"] == "paste"


def test_non_owner_gets_404(a, b):
    d = make(a)
    url = f"/pod/api/decks/{d['id']}"
    assert send(b, "get", url).status_code == 404
    assert send(b, "post", url, {"name": "x"}).status_code == 404
    assert send(b, "delete", url).status_code == 404
    assert send(b, "post", url + "/versions", BODY).status_code == 404
    assert send(b, "get", "/pod/api/decks").json() == {"decks": []}
    assert Deck.objects.filter(pk=d["id"]).exists()


def test_link_token_follows_visibility(a, b):
    d = make(a)
    url, link = f"/pod/api/decks/{d['id']}", f"/pod/api/decks/link/{d['link_token']}"
    assert send(b, "get", link).status_code == 404
    send(a, "post", url, {"visibility": "pods"})
    assert send(b, "get", url).status_code == 404 and send(b, "get", link).status_code == 404
    send(a, "post", url, {"visibility": "link"})
    r = send(b, "get", link)
    assert r.status_code == 200
    assert r.json()["name"] == "My deck" and r.json()["owner"] == "ana"
    assert r.json()["version"]["list"] == LIST
    send(a, "post", url, {"visibility": "private"})
    assert send(b, "get", link).status_code == 404


def test_rename_and_bad_visibility(a):
    d = make(a)
    url = f"/pod/api/decks/{d['id']}"
    assert send(a, "post", url, {"name": "  New  "}).json()["deck"]["name"] == "New"
    r = send(a, "post", url, {"visibility": "public"})
    assert (r.status_code, r.json()) == (400, {"errors": {"visibility": "invalid"}})
    assert send(a, "post", url, {"name": " "}).status_code == 400


def test_new_version_keeps_old(a):
    d = make(a)
    before = Deck.objects.get(pk=d["id"]).updated_at
    new = {"entries": [{"name": "Forest", "quantity": 2}], "commanders": [], "side": [], "maybe": []}
    r = send(a, "post", f"/pod/api/decks/{d['id']}/versions", {"list": new, "source": "builder", "note": "swap"})
    assert r.status_code == 201 and r.json()["deck"]["version_count"] == 2
    assert Deck.objects.get(pk=d["id"]).updated_at > before
    vs = send(a, "get", f"/pod/api/decks/{d['id']}").json()["versions"]
    assert vs[0]["list"] == new and vs[0]["note"] == "swap" and vs[1]["list"] == LIST


def test_limits(a):
    user = User.objects.get(username="ana")
    Deck.objects.bulk_create([Deck(owner=user, name=str(i), link_token=f"t{i}") for i in range(views.MAX_DECKS)])
    r = send(a, "post", "/pod/api/decks", BODY)
    assert (r.status_code, r.json()) == (400, {"errors": {"decks": "limit"}})
    d = Deck.objects.first()
    DeckVersion.objects.bulk_create([DeckVersion(deck=d, list=LIST, source="paste") for _ in range(views.MAX_VERSIONS)])
    r = send(a, "post", f"/pod/api/decks/{d.id}/versions", BODY)
    assert (r.status_code, r.json()) == (400, {"errors": {"versions": "limit"}})


@pytest.mark.parametrize("over", [
    {"name": "x" * 101}, {"name": ""}, {"source": "other"}, {"source_url": "http://x.com"},
    {"note": "x" * 501}, {"list": {"entries": [], "commanders": []}},
    {"list": {"entries": [{"name": "A", "quantity": 0}], "commanders": []}},
    {"list": {"entries": [{"name": "A", "quantity": True}], "commanders": []}},
    {"list": {"entries": [{"name": "", "quantity": 1}], "commanders": []}},
    {"list": {"entries": [{"name": "A", "quantity": 1}] * 301, "commanders": []}},
    {"list": {"entries": [{"name": "A", "quantity": 1}], "commanders": list("abcd")}},
    {"list": "x"}, {"list": {**LIST, "side": "x"}}, {"list": {**LIST, "maybe": [{"name": "A", "quantity": 0}]}},
    {"list": {**LIST, "side": [{"name": "A", "quantity": 1}] * 101}},
])
def test_bad_input(a, over):
    r = send(a, "post", "/pod/api/decks", {**BODY, **over})
    assert r.status_code == 400 and "errors" in r.json()


def test_body_too_big(a):
    r = send(a, "post", "/pod/api/decks", {**BODY, "note": "x" * views.MAX_BODY_BYTES})
    assert (r.status_code, r.json()) == (400, {"errors": {"body": "invalid"}})


def test_delete_cascades(a):
    d = make(a)
    assert send(a, "delete", f"/pod/api/decks/{d['id']}").status_code == 204
    assert not Deck.objects.exists() and not DeckVersion.objects.exists()


def test_account_delete_removes_decks(a):
    make(a)
    assert send(a, "post", "/pod/api/me/delete", {"password": "pw"}).status_code == 204
    assert not Deck.objects.exists() and not DeckVersion.objects.exists()


def test_csrf_enforced():
    user = User.objects.create_user("cy", "cy@x.com", "pw")
    c = Client(enforce_csrf_checks=True)
    c.force_login(user)
    assert send(c, "post", "/pod/api/decks", BODY).status_code == 403
    assert send(c, "get", "/pod/api/decks").status_code == 200


def test_archidekt_dev_proxy(a, monkeypatch):
    assert send(a, "get", "/pod/api/archidekt/user/bad%20name").status_code == 404
    assert send(a, "get", "/pod/api/archidekt/user/" + "x" * 41).status_code == 404
    resp = mock.MagicMock()
    resp.__enter__.return_value.status, resp.__enter__.return_value.read.return_value = 200, b'{"count": 0}'
    seen = []
    monkeypatch.setattr(views.urllib.request, "urlopen", lambda req, timeout: seen.append(req) or resp)
    r = send(a, "get", "/pod/api/archidekt/user/ana.b-1")
    assert r.status_code == 200 and r.json() == {"count": 0}
    assert seen[0].full_url == "https://archidekt.com/api/decks/v3/?ownerUsername=ana.b-1&deckFormat=3&pageSize=50"
    assert seen[0].get_header("User-agent") == "pod-deck-checker"
    send(a, "get", "/pod/api/archidekt/123")
    assert seen[1].full_url == "https://archidekt.com/api/decks/123/"


def test_boards_are_optional_and_stored(a):
    bare = {"entries": [{"name": "Forest", "quantity": 2}], "commanders": []}
    r = send(a, "post", "/pod/api/decks", {**BODY, "list": bare})
    d = send(a, "get", f"/pod/api/decks/{r.json()['deck']['id']}").json()
    assert d["versions"][0]["list"] == {**bare, "side": [], "maybe": []}


def test_version_names_and_summary_versions(a):
    d = make(a)
    assert [(v["name"], v["count"]) for v in d["versions"]] == [("", 31)]
    url = f"/pod/api/decks/{d['id']}/versions"
    assert send(a, "post", url, {"list": LIST, "source": "paste", "name": "x" * 61}).json() == {"errors": {"name": "invalid"}}
    r = send(a, "post", url, {"list": LIST, "source": "paste", "name": " Bracket 3 "})
    assert r.status_code == 201 and [v["name"] for v in r.json()["deck"]["versions"]] == ["Bracket 3", ""]
    assert [v["name"] for v in send(a, "get", f"/pod/api/decks/{d['id']}").json()["versions"]] == ["Bracket 3", ""]
    for _ in range(views.MAX_PICKER + 2):
        DeckVersion.objects.create(deck_id=d["id"], list=LIST, source="paste")
    assert len(send(a, "get", "/pod/api/decks").json()["decks"][0]["versions"]) == views.MAX_PICKER
