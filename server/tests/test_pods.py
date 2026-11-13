import copy
import json

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import User
from decks.models import Deck, DeckVersion
from pods.models import Pod, PodDeck, PodMember
from pods.rules import apply_edits, template

pytestmark = pytest.mark.django_db
LIST = {"entries": [{"name": "Sol Ring", "quantity": 1}], "commanders": ["Atraxa"], "side": [], "maybe": []}


def login(name):
    c = Client()
    c.user = User.objects.create_user(name, f"{name}@x.com", "pw")
    c.force_login(c.user)
    return c


@pytest.fixture
def a():
    return login("ana")


@pytest.fixture
def b():
    return login("ben")


@pytest.fixture
def c():
    return login("cat")


def send(cl, method, url, data=None):
    return getattr(cl, method)(url, json.dumps(data) if data is not None else "", content_type="application/json")


def mkpod(cl, name="Mesa", **extra):
    r = send(cl, "post", "/pod/api/pods", {"name": name, "from": None, **extra})
    assert r.status_code == 201
    return r.json()["pod"]


def join(cl, pod):
    r = send(cl, "post", "/pod/api/pods/join", {"code": Pod.objects.get(pk=pod["id"]).invite_code})
    assert r.status_code == 200
    return r.json()["pod"]


def mkdeck(cl, visibility="private"):
    d = Deck.objects.create(owner=cl.user, name="D", visibility=visibility)
    DeckVersion.objects.create(deck=d, list=LIST, source="paste")
    return d


def enter(cl, pod, deck):
    return send(cl, "post", f"/pod/api/pods/{pod['id']}/decks", {"deck": deck.id})


def test_anonymous_forbidden():
    r = send(Client(), "get", "/pod/api/pods")
    assert (r.status_code, r.json()) == (403, {"error": "forbidden"})


def test_create_from_template_and_copy(a, b):
    p = mkpod(a)
    assert p["role"] == "admin" and p["invite_code"] and p["rules"] == template()
    assert "power_brackets" not in p["rules"]
    assert [m["role"] for m in p["members"]] == ["admin"]
    assert send(a, "get", "/pod/api/pods").json()["active"]["id"] == p["id"]
    rules = copy.deepcopy(p["rules"])
    rules["overflow_per_unit"] = 3
    assert send(a, "post", f"/pod/api/pods/{p['id']}", {"rules": rules}).status_code == 200
    q = mkpod(a, "Otra", **{"from": p["id"]})
    assert q["rules"]["overflow_per_unit"] == 3
    assert send(b, "post", "/pod/api/pods", {"name": "X", "from": p["id"]}).status_code == 404
    assert send(a, "post", "/pod/api/pods", {"name": " "}).json() == {"errors": {"name": "invalid"}}


def test_non_member_404_member_403(a, b, c):
    p = mkpod(a)
    join(b, p)
    base = f"/pod/api/pods/{p['id']}"
    d = mkdeck(a)
    for method, url, data in [("get", base, None), ("post", base, {}), ("post", base + "/invite", {}),
                              ("post", base + "/leave", {}), ("delete", f"{base}/members/{a.user.id}", None),
                              ("post", f"{base}/members/{a.user.id}", {"role": "member"}),
                              ("post", base + "/decks", {"deck": d.id}), ("delete", f"{base}/decks/{d.id}", None),
                              ("post", "/pod/api/pods/active", {"pod": p["id"]})]:
        assert send(c, method, url, data).status_code == 404, url
    for method, url, data in [("post", base, {"name": "Z"}), ("post", base + "/invite", {}),
                              ("delete", f"{base}/members/{a.user.id}", None),
                              ("post", f"{base}/members/{a.user.id}", {"role": "member"})]:
        r = send(b, method, url, data)
        assert (r.status_code, r.json()) == (403, {"error": "admin"}), url
    assert send(b, "get", base).json()["pod"]["invite_code"] is None


def test_join(a, b):
    p = mkpod(a)
    assert send(b, "post", "/pod/api/pods/join", {"code": "nope"}).status_code == 404
    assert join(b, p)["role"] == "member"
    join(b, p)
    assert PodMember.objects.filter(pod_id=p["id"]).count() == 2
    assert send(b, "get", "/pod/api/pods").json()["active"]["id"] == p["id"]


def test_regenerate_invalidates(a, b):
    p = mkpod(a)
    old = p["invite_code"]
    new = send(a, "post", f"/pod/api/pods/{p['id']}/invite").json()["invite_code"]
    assert new != old
    assert send(b, "post", "/pod/api/pods/join", {"code": old}).status_code == 404
    assert send(b, "post", "/pod/api/pods/join", {"code": new}).status_code == 200


def test_leave(a, b):
    p = mkpod(a)
    join(b, p)
    d = mkdeck(b)
    assert enter(b, p, d).status_code == 201
    assert send(a, "post", f"/pod/api/pods/{p['id']}/leave").json() == {"errors": {"role": "last_admin"}}
    assert send(b, "post", f"/pod/api/pods/{p['id']}/leave").status_code == 204
    assert not PodDeck.objects.exists() and Deck.objects.filter(pk=d.id).exists()
    assert send(b, "get", f"/pod/api/pods/{p['id']}").status_code == 404
    assert send(a, "post", f"/pod/api/pods/{p['id']}/leave").status_code == 204
    assert not Pod.objects.exists()


def test_remove_member_and_roles(a, b):
    p = mkpod(a)
    join(b, p)
    assert enter(b, p, mkdeck(b)).status_code == 201
    base = f"/pod/api/pods/{p['id']}/members"
    assert send(a, "post", f"{base}/{a.user.id}", {"role": "member"}).json() == {"errors": {"role": "last_admin"}}
    assert send(a, "post", f"{base}/{b.user.id}", {"role": "boss"}).status_code == 400
    assert send(a, "post", f"{base}/{b.user.id}", {"role": "admin"}).status_code == 204
    assert send(a, "post", f"{base}/{a.user.id}", {"role": "member"}).status_code == 204
    assert send(a, "delete", f"{base}/{b.user.id}").status_code == 403
    assert send(b, "delete", f"{base}/{b.user.id}").json() == {"errors": {"user": "self"}}
    assert send(b, "delete", f"{base}/{a.user.id}").status_code == 204
    assert send(b, "delete", f"{base}/{a.user.id}").status_code == 404
    assert PodMember.objects.count() == 1
    mkdeck(a)
    p2 = mkpod(b, "Dos")
    join(a, p2)
    assert enter(a, p2, Deck.objects.get(owner=a.user)).status_code == 201
    assert send(b, "delete", f"/pod/api/pods/{p2['id']}/members/{a.user.id}").status_code == 204
    assert not PodDeck.objects.filter(pod_id=p2["id"]).exists()


def test_enter_deck(a, b, c):
    p = mkpod(a)
    join(b, p)
    d = mkdeck(a)
    base = f"/pod/api/pods/{p['id']}/decks"
    assert enter(b, p, d).status_code == 404
    assert enter(c, p, mkdeck(c)).status_code == 404
    assert enter(a, p, d).status_code == 201
    d.refresh_from_db()
    assert d.visibility == "pods"
    assert enter(a, p, d).status_code == 200
    assert PodDeck.objects.count() == 1
    row = send(b, "get", f"/pod/api/pods/{p['id']}").json()["pod"]["decks"][0]
    assert row["list"] == LIST and row["owner"] == "ana" and not row["mine"] and row["commanders"] == ["Atraxa"]
    send(a, "post", f"/pod/api/decks/{d.id}", {"visibility": "private"})
    assert send(b, "get", f"/pod/api/pods/{p['id']}").json()["pod"]["decks"][0]["list"] is None
    assert send(b, "delete", f"{base}/{d.id}").status_code == 403
    assert send(a, "delete", f"{base}/{d.id}").status_code == 204
    assert enter(a, p, d).status_code == 201
    assert send(a, "delete", f"{base}/{d.id}").status_code == 204
    d2 = mkdeck(b)
    enter(b, p, d2)
    assert send(a, "delete", f"{base}/{d2.id}").status_code == 204  # admin may remove


def test_apply_edits_round_trip_and_rejections():
    t = template()
    assert apply_edits(t, copy.deepcopy(t)) == (t, {})

    def bad(mutate, path):
        s = copy.deepcopy(t)
        mutate(s)
        rules, errors = apply_edits(t, s)
        assert errors == {path: "invalid"}, errors

    bad(lambda s: s["tiers"]["tier1"].update(max_points="2"), "tiers.tier1.max_points")
    bad(lambda s: s["tiers"]["tier1"].update(max_points=True), "tiers.tier1.max_points")
    bad(lambda s: s.update(overflow_per_unit=11), "overflow_per_unit")
    bad(lambda s: s["tiers"]["tier1"].update(max_points=8), "tiers.tier1.max_points")
    bad(lambda s: s["dials"]["tutors"].update(point_steps={"1": 5, "2": 2}), "dials.tutors.point_steps")
    bad(lambda s: s["dials"]["tutors"].update(point_steps={"0": 1}), "dials.tutors.point_steps")
    bad(lambda s: s["dials"]["tutors"].update(point_steps={"x": 1}), "dials.tutors.point_steps")
    bad(lambda s: s["dials"]["combos"].update(free_combos=21), "dials.combos.free_combos")
    bad(lambda s: s["hard_bans"]["banned_cards"].update(true_fast_mana=["ok", " "]),
        "hard_bans.banned_cards.true_fast_mana")
    bad(lambda s: s["hard_bans"]["banned_cards"].update(true_fast_mana=[1]), "hard_bans.banned_cards.true_fast_mana")
    bad(lambda s: s["conditionals"][1].update(id="other"), "conditionals.1.id")
    bad(lambda s: s["conditionals"][3]["if_all"][0].update(value=201), "conditionals.3.if_all.0.value")


def test_apply_edits_changes_and_ignores_extras():
    t = template()
    s = copy.deepcopy(t)
    s["dials"]["tutors"]["point_steps"] = {"1": 2, "3": 4}
    s["dials"]["combos"]["free_combos"] = 1
    s["conditionals"][3]["penalty_points"] = 5
    s["hard_bans"]["banned_cards"]["true_fast_mana"] = [" Mana Crypt ", "Mana Crypt", "Sol Ring"]
    s["hard_bans"]["max_card_price_eur"] = 999
    s["dials"]["mass_land_denial"]["forbidden"] = False
    s["tiers"]["tier1"]["label"] = "hacked"
    s["evil"] = 1
    s["conditionals"][0]["if"]["op"] = "<"
    rules, errors = apply_edits(t, s)
    assert errors == {}
    assert rules["dials"]["tutors"]["point_steps"] == {"1": 2, "3": 4} and rules["dials"]["tutors"]["hard_max"] == 3
    assert rules["dials"]["combos"]["baseline_max"] == 1 and rules["conditionals"][3]["penalty_points"] == 5
    assert rules["hard_bans"]["banned_cards"]["true_fast_mana"] == ["Mana Crypt", "Sol Ring"]
    assert rules["hard_bans"]["max_card_price_eur"] == 30.0 and rules["dials"]["mass_land_denial"]["forbidden"]
    assert rules["tiers"]["tier1"]["label"] == t["tiers"]["tier1"]["label"] and "evil" not in rules
    assert rules["conditionals"][0]["if"]["op"] == ">="


def test_edit_via_api(a):
    p = mkpod(a)
    before = p["rules_updated_at"]
    r = send(a, "post", f"/pod/api/pods/{p['id']}", {"name": "Nueva", "rules": p["rules"]})
    assert r.status_code == 200 and r.json()["pod"]["name"] == "Nueva" and r.json()["pod"]["rules_updated_at"] > before
    s = copy.deepcopy(p["rules"])
    s["overflow_per_unit"] = 99
    r = send(a, "post", f"/pod/api/pods/{p['id']}", {"rules": s})
    assert r.json() == {"errors": {"overflow_per_unit": "invalid"}}
    assert send(a, "post", f"/pod/api/pods/{p['id']}", {"rules": "x"}).status_code == 400


def test_account_deletion(a, b, c):
    p = mkpod(a)
    join(b, p)
    join(c, p)
    a.user.delete()
    assert PodMember.objects.get(pod_id=p["id"], user=b.user).role == "admin"
    assert PodMember.objects.get(pod_id=p["id"], user=c.user).role == "member"
    q = mkpod(b, "Solo")
    b.user.delete()
    assert PodMember.objects.get(pod_id=p["id"]).user_id == c.user.id
    assert PodMember.objects.get(pod_id=p["id"]).role == "admin"
    assert not Pod.objects.filter(pk=q["id"]).exists()
    c.user.delete()
    assert not Pod.objects.exists()


def test_active_pod(a, b):
    p = mkpod(a)
    join(b, p)
    send(b, "post", "/pod/api/pods/active", {"pod": None})
    assert send(b, "get", "/pod/api/pods").json()["active"] is None
    assert send(b, "post", "/pod/api/pods/active", {"pod": p["id"]}).status_code == 204
    assert send(b, "get", "/pod/api/pods").json()["active"]["rules"] == p["rules"]
    # removed by the admin: the stale session value is ignored and cleared
    send(a, "delete", f"/pod/api/pods/{p['id']}/members/{b.user.id}")
    r = send(b, "get", "/pod/api/pods").json()
    assert r["active"] is None and r["pods"] == [] and "active_pod" not in b.session
    join(b, p)
    send(b, "post", f"/pod/api/pods/{p['id']}/leave")
    assert send(b, "get", "/pod/api/pods").json()["active"] is None


def test_caps(a, b):
    now = timezone.now()
    Pod.objects.bulk_create([Pod(name=f"P{i}", rules={}) for i in range(20)])
    PodMember.objects.bulk_create([PodMember(pod=p, user=a.user, role="admin") for p in Pod.objects.all()])
    assert send(a, "post", "/pod/api/pods", {"name": "uno mas"}).json() == {"errors": {"pods": "limit"}}
    other = mkpod(b)
    assert send(a, "post", "/pod/api/pods/join",
                {"code": Pod.objects.get(pk=other["id"]).invite_code}).json() == {"errors": {"pods": "limit"}}
    p = Pod.objects.first()
    decks = Deck.objects.bulk_create([Deck(owner=a.user, name=f"d{i}") for i in range(101)])
    PodDeck.objects.bulk_create([PodDeck(pod=p, deck=d, added_at=now) for d in decks[:100]])
    assert enter(a, {"id": p.id}, decks[100]).json() == {"errors": {"decks": "limit"}}

