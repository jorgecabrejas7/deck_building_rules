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


def test_admin_superuser_only(client):
    staff = User.objects.create_user("st", is_staff=True, password="pw-staff-123")
    client.force_login(staff)
    r = client.get("/pod/api/admin/", follow=True)
    assert r.redirect_chain[-1][0] == ACCOUNT
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
