import json
import re
import urllib.error
import urllib.request
from functools import wraps

from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from .models import Deck, DeckVersion

MAX_DECKS = 100
MAX_VERSIONS = 100
MAX_BOARD = 100  # entries on the side and maybe boards
MAX_BODY_BYTES = 32000
SOURCES = ("paste", "moxfield", "archidekt", "builder")
VISIBILITIES = ("private", "pods", "link")


def signed_in(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "forbidden"}, status=403)
        return view(request, *args, **kwargs)
    return wrapped


def bad(errors):
    return JsonResponse({"errors": errors}, status=400)


def body(request):
    """Parsed JSON object, or None when oversized or malformed."""
    if len(request.body) > MAX_BODY_BYTES:
        return None
    try:
        data = json.loads(request.body)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def is_str(v, lo, hi):
    return isinstance(v, str) and lo <= len(v) <= hi


def clean_name(v):
    v = v.strip() if isinstance(v, str) else ""
    return v if 1 <= len(v) <= 100 else None


def clean_entries(v, lo, hi):
    """The [{name, quantity}] list v with only those two keys, or None when malformed or not lo..hi long."""
    if not (isinstance(v, list) and lo <= len(v) <= hi and all(
            isinstance(e, dict) and is_str(e.get("name"), 1, 200)
            and type(e.get("quantity")) is int and 1 <= e["quantity"] <= 99 for e in v)):
        return None
    return [{"name": e["name"], "quantity": e["quantity"]} for e in v]


def clean_version(data):
    """(fields, errors) for the list/source/source_url/note of a version."""
    lst, errors = data.get("list"), {}
    lst = lst if isinstance(lst, dict) else {}
    entries = clean_entries(lst.get("entries"), 1, 300)
    side = clean_entries(lst.get("side", []), 0, MAX_BOARD)
    maybe = clean_entries(lst.get("maybe", []), 0, MAX_BOARD)
    cmds = lst.get("commanders")
    if not (entries is not None and side is not None and maybe is not None
            and isinstance(cmds, list) and len(cmds) <= 3 and all(isinstance(c, str) for c in cmds)):
        errors["list"] = "invalid"
    if data.get("source") not in SOURCES:
        errors["source"] = "invalid"
    url = data.get("source_url", "")
    if not (is_str(url, 0, 300) and (url == "" or url.startswith("https://"))):
        errors["source_url"] = "invalid"
    if not is_str(data.get("note", ""), 0, 500):
        errors["note"] = "invalid"
    if errors:
        return None, errors
    return {"list": {"entries": entries, "commanders": cmds, "side": side, "maybe": maybe},
            "source": data["source"], "source_url": url, "note": data.get("note", "")}, None


def summary(d):
    latest = d.versions.first()
    return {"id": d.id, "name": d.name, "visibility": d.visibility, "link_token": d.link_token,
            "created_at": d.created_at, "updated_at": d.updated_at, "version_count": d.versions.count(),
            "commanders": latest.list["commanders"] if latest else []}


def own_deck(request, id):
    try:
        return Deck.objects.get(pk=id, owner=request.user)
    except Deck.DoesNotExist:
        raise Http404


@require_http_methods(["GET", "POST"])
@signed_in
def decks(request):
    if request.method == "GET":
        return JsonResponse({"decks": [summary(d) for d in request.user.decks.order_by("-updated_at")]})
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    fields, errors = clean_version(data)
    name = clean_name(data.get("name"))
    if name is None:
        errors = {**(errors or {}), "name": "invalid"}
    if errors:
        return bad(errors)
    if request.user.decks.count() >= MAX_DECKS:
        return bad({"decks": "limit"})
    d = Deck.objects.create(owner=request.user, name=name)
    DeckVersion.objects.create(deck=d, **fields)
    return JsonResponse({"deck": summary(d)}, status=201)


@require_http_methods(["GET", "POST", "DELETE"])
@signed_in
def deck(request, id):
    d = own_deck(request, id)
    if request.method == "DELETE":
        d.delete()
        return HttpResponse(status=204)
    if request.method == "POST":
        data = body(request)
        if data is None:
            return bad({"body": "invalid"})
        errors = {}
        if "name" in data:
            d.name = clean_name(data["name"])
            if d.name is None:
                errors["name"] = "invalid"
        if "visibility" in data:
            d.visibility = data["visibility"]
            if d.visibility not in VISIBILITIES:
                errors["visibility"] = "invalid"
        if errors:
            return bad(errors)
        d.save()
        return JsonResponse({"deck": summary(d)})
    versions = [{"id": v.id, "list": v.list, "source": v.source, "source_url": v.source_url,
                 "note": v.note, "created_at": v.created_at} for v in d.versions.all()]
    return JsonResponse({"deck": summary(d), "versions": versions})


@require_http_methods(["POST"])
@signed_in
def versions(request, id):
    d = own_deck(request, id)
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    fields, errors = clean_version(data)
    if errors:
        return bad(errors)
    if d.versions.count() >= MAX_VERSIONS:
        return bad({"versions": "limit"})
    DeckVersion.objects.create(deck=d, **fields)
    d.save()  # auto_now bumps updated_at
    return JsonResponse({"deck": summary(d)}, status=201)


@require_GET
@signed_in
def link(request, token):
    try:
        d = Deck.objects.select_related("owner").get(link_token=token, visibility="link")
    except Deck.DoesNotExist:
        raise Http404
    v = d.versions.first()
    return JsonResponse({"name": d.name, "owner": d.owner.display_name or d.owner.username,
                         "version": {"list": v.list, "source": v.source, "created_at": v.created_at}})


# Dev only (mounted under DEV_STATIC): prod proxies Archidekt in Caddy.
def archidekt_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pod-deck-checker"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    except OSError:
        return JsonResponse({"error": "upstream"}, status=502)
    return HttpResponse(raw, status=status, content_type="application/json")


@require_GET
@signed_in
def archidekt_deck(request, id):
    return archidekt_get(f"https://archidekt.com/api/decks/{id}/")


@require_GET
@signed_in
def archidekt_user(request, username):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,40}", username):
        raise Http404
    return archidekt_get(
        f"https://archidekt.com/api/decks/v3/?ownerUsername={username}&deckFormat=3&pageSize=50")
