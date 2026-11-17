"""A player's own Archidekt account: sign in once, then list and read their decks, private ones included.

Archidekt has no sign-in for other sites, so the player's email and password pass through here to Archidekt's own
sign-in once and are never stored or logged. Only the refresh token it answers with is kept, on the user.
"""
import json
import time
import urllib.error
import urllib.request

from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from .views import bad, body, is_str, signed_in

API = "https://archidekt.com/api/"
ACCESS_SECONDS = 240  # an access token is reused for this long, then refreshed
MAX_PAGES = 4         # 50 decks a page: more than the 100 a player can keep here


def call(path, data=None, token=None):
    """(status, parsed JSON or None) from Archidekt; status 0 when it cannot be reached."""
    headers = {"User-Agent": "pod-deck-checker", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "JWT " + token
    req = urllib.request.Request(API + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except OSError:
        return 0, None
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, None


def forget(request):
    request.user.archidekt_username = request.user.archidekt_refresh = ""
    request.user.save()
    request.session.pop("archidekt_access", None)


def access(request):
    """A working access token, or None: then the player has to sign in to Archidekt again."""
    u = request.user
    token, at = request.session.get("archidekt_access", ("", 0))
    if token and time.time() - at < ACCESS_SECONDS:
        return token
    if not u.archidekt_refresh:
        return None
    status, data = call("rest-auth/token/refresh/", {"refresh": u.archidekt_refresh})
    if status in (400, 401):  # the refresh token ran out or was revoked
        forget(request)
        return None
    if status != 200 or not isinstance(data, dict) or not data.get("access"):
        return None
    if data.get("refresh"):  # Archidekt may hand out a new one each time
        u.archidekt_refresh = data["refresh"]
        u.save()
    request.session["archidekt_access"] = (data["access"], time.time())
    return data["access"]


@require_http_methods(["POST", "DELETE"])
@signed_in
def account(request):
    if request.method == "DELETE":
        forget(request)
        return HttpResponse(status=204)
    data = body(request)
    if data is None or not is_str(data.get("email"), 1, 254) or not is_str(data.get("password"), 1, 200):
        return bad({"login": "invalid"})
    who = data["email"].strip()
    status, out = call("rest-auth/login/", {("email" if "@" in who else "username"): who, "password": data["password"]})
    if status == 400:
        return bad({"login": "refused"})
    out = out if isinstance(out, dict) else {}
    refresh, name = out.get("refresh_token") or out.get("refresh"), (out.get("user") or {}).get("username")
    if status != 200 or not is_str(refresh, 1, 600) or not is_str(name, 1, 40):
        return JsonResponse({"error": "upstream"}, status=502)
    request.user.archidekt_username, request.user.archidekt_refresh = name, refresh
    request.user.save()
    token = out.get("access_token") or out.get("access")
    if token:
        request.session["archidekt_access"] = (token, time.time())
    return JsonResponse({"username": name})


def needs_login():
    return JsonResponse({"error": "archidekt"}, status=401)


@require_GET
@signed_in
def decks(request):
    """Every Commander deck of the signed-in Archidekt account: [{id, name, updatedAt}]."""
    token = access(request)
    if not token:
        return needs_login()
    found, path = [], f"decks/v3/?ownerUsername={request.user.archidekt_username}&deckFormat=3&pageSize=50"
    for page in range(1, MAX_PAGES + 1):
        status, data = call(f"{path}&page={page}", token=token)
        if status == 401:
            return needs_login()
        if status != 200 or not isinstance(data, dict) or not isinstance(data.get("results"), list):
            return JsonResponse({"error": "upstream"}, status=502)
        found += [{"id": r.get("id"), "name": r.get("name"), "updatedAt": r.get("updatedAt")} for r in data["results"] if isinstance(r, dict)]
        if not data.get("next"):
            break
    return JsonResponse({"decks": found})


@require_GET
@signed_in
def deck(request, id):
    token = access(request)
    if not token:
        return needs_login()
    status, data = call(f"decks/{id}/", token=token)
    if status == 401:
        return needs_login()
    if status == 404:
        raise Http404
    if status != 200 or not isinstance(data, dict):
        return JsonResponse({"error": "upstream"}, status=502)
    return JsonResponse(data)
