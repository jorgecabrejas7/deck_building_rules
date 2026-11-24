import json
import re
from pathlib import Path
from unittest import mock

import pytest
from allauth.account.signals import user_signed_up
from allauth.socialaccount.signals import social_account_added
from django.contrib.admin.sites import site
from django.core import mail
from django.core.cache import cache
from django.test import Client
from django.utils import timezone

from accounts.admin import approve
from accounts.models import User

pytestmark = pytest.mark.django_db
BASE = "/pod/api/_allauth/browser/v1/"
ACCOUNT = "/pod/app/account.html"


def post(client, url, data):
    return client.post(url, json.dumps(data), content_type="application/json")


def signup(client, name="ana"):
    return post(client, BASE + "auth/signup",
                {"username": name, "email": f"{name}@x.com", "password": "correct-horse-42"})


@pytest.fixture(autouse=True)
def admin_email(settings):
    settings.ADMIN_EMAIL = "boss@x.com"


@pytest.fixture(autouse=True)
def fresh_rate_limits():
    cache.clear()


@pytest.fixture
def active(db):
    return User.objects.create_user("bob", "bob@x.com", "pw-bob-12345")


def test_signup_is_pending(client):
    r = signup(client)
    assert r.status_code == 401
    assert not User.objects.get(username="ana").is_active
    assert len(mail.outbox) == 1 and mail.outbox[0].to == ["boss@x.com"]
    # the Django session survives the 401, so /me can say pending
    assert client.get("/pod/api/me").json() == {"state": "pending"}


def test_inactive_login_401(client):
    signup(client)
    c = Client()
    assert post(c, BASE + "auth/login", {"username": "ana", "password": "correct-horse-42"}).status_code == 401


def test_gate_and_approval(client):
    assert client.get("/pod/api/gate")["Location"] == ACCOUNT
    signup(client)
    assert client.get("/pod/api/gate").status_code == 302
    approve(None, None, User.objects.filter(username="ana"))
    assert post(client, BASE + "auth/login", {"username": "ana", "password": "correct-horse-42"}).status_code == 200
    assert client.get("/pod/api/gate").status_code == 204


def test_me_states(client, active):
    assert client.get("/pod/api/me").json() == {"state": "anonymous"}
    client.force_login(active)
    body = client.get("/pod/api/me").json()
    assert body["state"] == "active" and body["user"]["username"] == "bob" and body["user"]["has_password"]


def test_me_post(client, active):
    assert post(client, "/pod/api/me", {"language": "en"}).status_code == 403
    client.force_login(active)
    assert post(client, "/pod/api/me", {"language": "fr"}).status_code == 400
    r = post(client, "/pod/api/me", {"language": "en", "display_name": "Bob"})
    assert r.status_code == 200 and r.json()["user"]["language"] == "en"
    assert r.json()["user"]["archidekt_username"] == ""
    assert post(client, "/pod/api/me", {"archidekt_username": "x"}).json()["user"]["archidekt_username"] == ""  # only the sign-in sets it


def test_me_post_requires_csrf(active):
    c = Client(enforce_csrf_checks=True)
    c.force_login(active)
    assert post(c, "/pod/api/me", {"language": "en"}).status_code == 403
    token = c.get("/pod/api/me").cookies["pod_csrftoken"].value
    r = c.post("/pod/api/me", json.dumps({"language": "en"}), content_type="application/json",
               HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200


def test_google_signup_pending_and_link_stays_active(rf, active):
    request = rf.get("/")
    request.session = {}
    user = User.objects.create_user("gus", "gus@x.com")
    user_signed_up.send(sender=User, request=request, user=user, sociallogin=mock.Mock())
    user.refresh_from_db()
    assert not user.is_active and len(mail.outbox) == 1
    social_account_added.send(sender=None, request=request, sociallogin=mock.Mock())
    active.refresh_from_db()
    assert active.is_active and len(mail.outbox) == 1


def test_delete(client, active):
    client.force_login(active)
    assert post(client, "/pod/api/me/delete", {"password": "nope"}).status_code == 400
    assert post(client, "/pod/api/me/delete", {"password": "pw-bob-12345"}).status_code == 204
    assert not User.objects.filter(username="bob").exists()


def test_requests_admin_only(client, active):
    assert client.get("/pod/api/requests").status_code == 403
    client.force_login(active)
    assert client.get("/pod/api/requests").status_code == 403
    assert client.post("/pod/api/requests/1/approve").status_code == 403
    staff = User.objects.create_user("st", is_staff=True, password="pw-staff-123")
    client.force_login(staff)
    assert client.get("/pod/api/requests").status_code == 403


def test_requests_list_approve_reject(client):
    signup(client, "ana")
    signup(client, "ben")
    root = User.objects.create_superuser("root", "r@x.com", "pw-root-12345")
    client.force_login(root)
    body = client.get("/pod/api/requests").json()
    assert [r["username"] for r in body["requests"]] == ["ana", "ben"]
    assert body["requests"][0]["email"] == "ana@x.com" and "date_joined" in body["requests"][0]
    ana, ben = User.objects.get(username="ana"), User.objects.get(username="ben")
    assert client.post(f"/pod/api/requests/{ana.pk}/approve").status_code == 204
    assert User.objects.get(username="ana").is_active
    assert client.post(f"/pod/api/requests/{ben.pk}/reject").status_code == 204
    # rejecting keeps the account, inactive and marked, and takes it off the list; nothing is deleted
    ben.refresh_from_db()
    assert not ben.is_active and ben.rejected_at is not None
    assert client.get("/pod/api/requests").json() == {"requests": []}
    c = Client()
    assert post(c, BASE + "auth/login", {"username": "ben", "password": "correct-horse-42"}).status_code == 401
    # an active account is not a request: it can be neither approved again nor rejected this way
    assert client.post(f"/pod/api/requests/{ana.pk}/approve").status_code == 404
    assert client.post(f"/pod/api/requests/{ana.pk}/reject").status_code == 404
    # a rejected account can still be let in later, which clears the mark
    assert client.post(f"/pod/api/requests/{ben.pk}/approve").status_code == 204
    ben.refresh_from_db()
    assert ben.is_active and ben.rejected_at is None


def test_users_admin_only(client, active):
    assert client.get("/pod/api/users").status_code == 403
    client.force_login(active)
    assert client.get("/pod/api/users").status_code == 403
    assert client.post(f"/pod/api/users/{active.pk}/deactivate").status_code == 403
    assert client.post(f"/pod/api/users/{active.pk}/delete").status_code == 403
    assert User.objects.filter(pk=active.pk, is_active=True).exists()


def test_users_list_states(client, active):
    signup(client, "ana")
    signup(client, "ben")
    ben = User.objects.get(username="ben")
    ben.rejected_at = timezone.now()
    ben.save()
    root = User.objects.create_superuser("root", "r@x.com", "pw-root-12345")
    client.force_login(root)
    rows = {r["username"]: r for r in client.get("/pod/api/users").json()["users"]}
    assert {k: v["state"] for k, v in rows.items()} == {"ana": "pending", "ben": "rejected", "bob": "active", "root": "admin"}
    assert rows["root"]["is_self"] and not rows["bob"]["is_self"]
    assert rows["bob"]["email"] == "bob@x.com" and rows["bob"]["last_login"] is None and "date_joined" in rows["bob"]


def test_deactivate_cuts_the_session_and_activate_restores(client, active):
    bob = Client()
    bob.force_login(active)
    assert bob.get("/pod/api/me").json()["state"] == "active"
    root = User.objects.create_superuser("root", "r@x.com", "pw-root-12345")
    client.force_login(root)
    assert client.post(f"/pod/api/users/{active.pk}/deactivate").status_code == 204
    active.refresh_from_db()
    assert not active.is_active and active.deactivated_at is not None and active.state == "inactive"
    # the open session stops working at once and the password no longer signs in
    assert bob.get("/pod/api/me").json() == {"state": "anonymous"}
    assert post(Client(), BASE + "auth/login", {"username": "bob", "password": "pw-bob-12345"}).status_code == 401
    # a closed account is not a signup waiting for approval
    assert client.get("/pod/api/requests").json() == {"requests": []}
    assert client.post(f"/pod/api/users/{active.pk}/deactivate").status_code == 409
    assert client.post(f"/pod/api/users/{active.pk}/activate").status_code == 204
    active.refresh_from_db()
    assert active.is_active and active.deactivated_at is None
    assert client.post(f"/pod/api/users/{active.pk}/activate").status_code == 409


def test_activate_lets_in_a_rejected_signup(client):
    signup(client, "ana")
    ana = User.objects.get(username="ana")
    ana.rejected_at = timezone.now()
    ana.save()
    client.force_login(User.objects.create_superuser("root", "r@x.com", "pw-root-12345"))
    assert client.post(f"/pod/api/users/{ana.pk}/activate").status_code == 204
    ana.refresh_from_db()
    assert ana.is_active and ana.rejected_at is None


def test_delete_user(client, active):
    client.force_login(User.objects.create_superuser("root", "r@x.com", "pw-root-12345"))
    assert client.post(f"/pod/api/users/{active.pk}/delete").status_code == 204
    assert not User.objects.filter(username="bob").exists()
    assert client.post(f"/pod/api/users/{active.pk}/delete").status_code == 404


def test_admin_accounts_are_protected(client):
    root = User.objects.create_superuser("root", "r@x.com", "pw-root-12345")
    other = User.objects.create_superuser("boss", "b@x.com", "pw-boss-12345")
    client.force_login(root)
    for target in (root, other):
        for action in ("deactivate", "delete"):
            assert client.post(f"/pod/api/users/{target.pk}/{action}").status_code == 409
    assert User.objects.filter(is_superuser=True, is_active=True).count() == 2


@pytest.mark.parametrize("mark, state", [(None, "pending"), ("rejected_at", "closed"), ("deactivated_at", "closed")])
def test_signin_to_inactive_account_says_why(active, mark, state):
    active.is_active = False
    if mark:
        setattr(active, mark, timezone.now())
    active.save()
    c = Client()
    assert post(c, BASE + "auth/login", {"username": "bob", "password": "pw-bob-12345"}).status_code == 401
    assert c.get("/pod/api/me").json() == {"state": state}
    # a wrong password says nothing about the account
    c2 = Client()
    assert post(c2, BASE + "auth/login", {"username": "bob", "password": "nope-nope"}).status_code == 400
    assert c2.get("/pod/api/me").json() == {"state": "anonymous"}


def test_admin_approve_action_clears_rejection(client):
    signup(client, "ana")
    ana = User.objects.get(username="ana")
    ana.rejected_at = timezone.now()
    ana.save()
    approve(None, None, User.objects.filter(pk=ana.pk))
    ana.refresh_from_db()
    assert ana.is_active and ana.rejected_at is None


def test_me_says_is_admin(client, active):
    client.force_login(active)
    assert client.get("/pod/api/me").json()["user"]["is_admin"] is False
    root = User.objects.create_superuser("root", "r@x.com", "pw-root-12345")
    client.force_login(root)
    assert client.get("/pod/api/me").json()["user"]["is_admin"] is True


def test_signup_email_links_requests_view(client, settings):
    settings.POD_HOST = "pod.example"
    signup(client)
    assert "https://pod.example/pod/app/account.html?view=requests" in mail.outbox[0].body


def test_admin_superuser_only(client):
    staff = User.objects.create_user("st", is_staff=True, password="pw-staff-123")
    client.force_login(staff)
    assert client.get("/pod/api/admin/", follow=True).redirect_chain[-1][0] == "/pod/app/"
    client.logout()
    assert client.get("/pod/api/admin/", follow=True).redirect_chain[-1][0] == ACCOUNT + "?next=admin"
    root = User.objects.create_superuser("root", "r@x.com", "pw-root-12345")
    client.force_login(root)
    assert client.get("/pod/api/admin/").status_code == 200
    assert site.has_permission(mock.Mock(user=staff)) is False


@pytest.fixture
def repo(tmp_path, settings):
    (tmp_path / "server").mkdir()
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "account.html").write_text("<p>hi</p>")
    (tmp_path / "app" / "index.html").write_text("<p>index</p>")
    (tmp_path / "app" / "x.js").write_text("1")
    (tmp_path / "secret.txt").write_text("no")
    settings.BASE_DIR = tmp_path / "server"
    return tmp_path


def test_dev_static(client, active, repo):
    r = client.get("/pod/app/account.html")
    assert r.status_code == 200 and r["Content-Type"].startswith("text/html")
    assert client.get("/pod/app/index.html")["Location"] == ACCOUNT
    assert client.get("/pod/app/")["Location"] == ACCOUNT
    assert client.get("/pod/")["Location"] == "/pod/app/"
    assert client.get("/pod/app")["Location"] == "/pod/app/"
    client.force_login(active)
    assert b"index" in b"".join(client.get("/pod/app/").streaming_content)
    assert client.get("/pod/app/x.js")["Content-Type"].startswith("text/javascript")


def test_dev_static_traversal(client, active, repo):
    client.force_login(active)
    assert client.get("/pod/app/../secret.txt").status_code in (301, 400, 404)
    assert client.get("/pod/app/%2e%2e/secret.txt").status_code == 404
    assert client.get("/pod/app/..%2fsecret.txt").status_code == 404


@pytest.mark.parametrize("lang, word", [("es", "corta"), ("en", "short")])
def test_allauth_errors_follow_accept_language(client, lang, word):
    r = client.post(
        BASE + "auth/signup", json.dumps({"username": "ana", "email": "a@x.com", "password": "a1"}),
        content_type="application/json", HTTP_ACCEPT_LANGUAGE=lang)
    assert r.status_code == 400
    assert word in r.json()["errors"][0]["message"]


def test_sixth_signup_from_one_ip_is_refused(client):
    assert [signup(client, f"u{i}").status_code for i in range(5)] == [401] * 5
    assert signup(client, "u5").status_code == 429


def test_open_paths_match_caddy():
    from accounts.views import GATED_API, OPEN_PATHS
    caddy = (Path(__file__).resolve().parents[2] / "deploy/pod.caddy").read_text()
    expr = re.search(r"@gated expression `(.*)`", caddy).group(1)
    assert re.search(r"!path\((.*?)\) &&", expr).group(1).replace("'", "").split(", ") == OPEN_PATHS
    for p in GATED_API:
        assert f"!path('{p}*')" in expr
