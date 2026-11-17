import json
from unittest import mock

import pytest
from django.test import Client

from accounts.models import User
from decks import archidekt, views
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
                        ("get", "/pod/api/archidekt/1"), ("post", "/pod/api/sync/archidekt"), ("get", "/pod/api/sync/archidekt/decks"),
                        ("get", "/pod/api/sync/archidekt/decks/1")]:
        r = send(c, method, url, {} if method == "post" else None)
        assert (r.status_code, r.json()) == (403, {"error": "forbidden"}), url


def test_create_list_get(a):
    d = make(a)
    assert d["version_count"] == 1 and d["commanders"] == ["Atraxa"] and d["visibility"] == "private" and d["pods"] == []
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
    assert send(b, "get", "/pod/api/decks").json() == {"decks": [], "archidekt_username": ""}
    assert Deck.objects.filter(pk=d["id"]).exists()


def test_link_token_follows_visibility(a, b):
    d = make(a)
    url, link = f"/pod/api/decks/{d['id']}", f"/pod/api/decks/link/{d['link_token']}"
    assert send(b, "get", link).status_code == 404
    assert send(b, "get", url).status_code == 404
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
    for v in ("public", "pods"):
        r = send(a, "post", url, {"visibility": v})
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
    resp = mock.MagicMock()
    resp.__enter__.return_value.status, resp.__enter__.return_value.read.return_value = 200, b'{"count": 0}'
    seen = []
    monkeypatch.setattr(views.urllib.request, "urlopen", lambda req, timeout: seen.append(req) or resp)
    r = send(a, "get", "/pod/api/archidekt/123")
    assert r.status_code == 200 and r.json() == {"count": 0}
    assert seen[0].full_url == "https://archidekt.com/api/decks/123/"
    assert seen[0].get_header("User-agent") == "pod-deck-checker"


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


@pytest.mark.django_db(transaction=True)
def test_migration_folds_pods_visibility_into_private():
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor
    try:
        old = MigrationExecutor(connection).migrate([("decks", "0003_version_name")]).apps
        owner = old.get_model("accounts", "User").objects.create(username="old")
        for i, v in enumerate(("pods", "link", "private")):
            old.get_model("decks", "Deck").objects.create(owner=owner, name=v, visibility=v, link_token=f"t{i}")
        new = MigrationExecutor(connection).migrate([("decks", "0004_visibility_private_or_link")]).apps
        seen = dict(new.get_model("decks", "Deck").objects.values_list("name", "visibility"))
        assert seen == {"pods": "private", "link": "link", "private": "private"}
    finally:
        ex = MigrationExecutor(connection)
        ex.migrate(ex.loader.graph.leaf_nodes())


def test_summary_names_the_last_copy_from_archidekt(a):
    d = make(a)
    assert d["archidekt"] is None
    url = "https://archidekt.com/decks/7"
    send(a, "post", f"/pod/api/decks/{d['id']}/versions", {"list": LIST, "source": "archidekt", "source_url": url})
    r = send(a, "post", f"/pod/api/decks/{d['id']}/versions", {"list": LIST, "source": "builder"})  # edited here afterwards
    assert r.json()["deck"]["archidekt"]["url"] == url


# ---- the player's own Archidekt account ----

def archidekt_says(monkeypatch, answers):
    """Archidekt answers by path prefix; every call is recorded as (path, data, token)."""
    calls = []
    def call(path, data=None, token=None):
        calls.append((path, data, token))
        return next(v for k, v in answers.items() if path.startswith(k))
    monkeypatch.setattr(archidekt, "call", call)
    return calls


def test_archidekt_sign_in_keeps_the_token_and_never_the_password(a, monkeypatch):
    url = "/pod/api/sync/archidekt"
    calls = archidekt_says(monkeypatch, {"rest-auth/login/": (400, {"non_field_errors": ["no"]})})
    assert send(a, "post", url, {"email": "ana@x.com", "password": "bad"}).json() == {"errors": {"login": "refused"}}
    for body in ({}, {"email": "ana@x.com"}, {"email": "", "password": "x"}, {"email": 3, "password": "x"}):
        assert send(a, "post", url, body).json() == {"errors": {"login": "invalid"}}
    assert len(calls) == 1
    calls = archidekt_says(monkeypatch, {"rest-auth/login/": (200, {"access_token": "acc", "refresh_token": "ref", "user": {"username": "AnaDecks"}})})
    assert send(a, "post", url, {"email": " ana@x.com ", "password": "s3cret"}).json() == {"username": "AnaDecks"}
    assert calls == [("rest-auth/login/", {"email": "ana@x.com", "password": "s3cret"}, None)]
    send(a, "post", url, {"email": "AnaDecks", "password": "s3cret"})
    assert calls[1][1] == {"username": "AnaDecks", "password": "s3cret"}
    u = User.objects.get(username="ana")
    assert (u.archidekt_username, u.archidekt_refresh) == ("AnaDecks", "ref")
    assert "s3cret" not in json.dumps(list(User.objects.filter(pk=u.pk).values()), default=str)
    assert send(a, "get", "/pod/api/decks").json()["archidekt_username"] == "AnaDecks"
    assert "ref" not in a.get("/pod/api/me").content.decode()  # the token never reaches the browser
    assert a.delete(url).status_code == 204
    u.refresh_from_db()
    assert (u.archidekt_username, u.archidekt_refresh) == ("", "")
    archidekt_says(monkeypatch, {"rest-auth/login/": (0, None)})
    assert send(a, "post", url, {"email": "a@x.com", "password": "x"}).status_code == 502


def test_archidekt_decks_are_read_with_the_players_token(a, monkeypatch):
    assert send(a, "get", "/pod/api/sync/archidekt/decks").status_code == 401  # not signed in to Archidekt
    User.objects.filter(username="ana").update(archidekt_username="AnaDecks", archidekt_refresh="ref")
    page = lambda n, more: (200, {"next": "x" if more else None, "results": [{"id": n, "name": f"Deck {n}", "updatedAt": "2026-01-01T00:00:00Z", "private": True}]})
    calls = archidekt_says(monkeypatch, {
        "rest-auth/token/refresh/": (200, {"access": "acc", "refresh": "ref2"}),
        "decks/v3/?ownerUsername=AnaDecks&deckFormat=3&pageSize=50&page=1": page(1, True),
        "decks/v3/?ownerUsername=AnaDecks&deckFormat=3&pageSize=50&page=2": page(2, False),
        "decks/7/": (200, {"name": "Private one", "cards": []}), "decks/8/": (404, None)})
    r = send(a, "get", "/pod/api/sync/archidekt/decks")
    assert r.json() == {"decks": [{"id": 1, "name": "Deck 1", "updatedAt": "2026-01-01T00:00:00Z"}, {"id": 2, "name": "Deck 2", "updatedAt": "2026-01-01T00:00:00Z"}]}
    assert calls[0] == ("rest-auth/token/refresh/", {"refresh": "ref"}, None) and all(c[2] == "acc" for c in calls[1:])
    assert User.objects.get(username="ana").archidekt_refresh == "ref2"
    assert send(a, "get", "/pod/api/sync/archidekt/decks/7").json() == {"name": "Private one", "cards": []}
    assert send(a, "get", "/pod/api/sync/archidekt/decks/8").status_code == 404
    assert [c[0] for c in calls].count("rest-auth/token/refresh/") == 1  # the access token is reused


def test_dead_archidekt_token_asks_to_sign_in_again(a, monkeypatch):
    User.objects.filter(username="ana").update(archidekt_username="AnaDecks", archidekt_refresh="old")
    archidekt_says(monkeypatch, {"rest-auth/token/refresh/": (401, {"code": "token_not_valid"})})
    assert send(a, "get", "/pod/api/sync/archidekt/decks").json() == {"error": "archidekt"}
    assert User.objects.get(username="ana").archidekt_username == ""
