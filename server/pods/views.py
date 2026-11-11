from django.db import transaction
from django.http import Http404, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from accounts.models import User
from decks.models import Deck
from decks.views import bad, body, clean_name, signed_in
from friends.models import are_friends

from .models import Pod, PodDeck, PodMember, new_code
from .rules import apply_edits, template

MAX_PODS = 20
MAX_PODDECKS = 100


def membership(request, id):
    try:
        return PodMember.objects.select_related("pod").get(pod_id=id, user=request.user)
    except PodMember.DoesNotExist:
        raise Http404


def summary(m):
    p = m.pod
    return {"id": p.id, "name": p.name, "role": m.role, "members": p.members.count(), "decks": p.entries.count()}


def detail_response(m, request, status=200):
    p = m.pod
    decks = []
    for e in p.entries.select_related("deck__owner").order_by("added_at", "id"):
        d, latest = e.deck, e.deck.versions.first()
        decks.append({"id": d.id, "name": d.name, "owner": d.owner.username, "mine": d.owner_id == request.user.id,
                      "added_at": e.added_at, "updated_at": d.updated_at,
                      "commanders": latest.list["commanders"] if latest else [],
                      "list": latest.list if latest and d.visibility in ("pods", "link") else None})
    members = [{"id": x.user_id, "name": x.user.username, "role": x.role, "me": x.user_id == request.user.id}
               for x in p.members.select_related("user").order_by("joined_at", "id")]
    return JsonResponse({"pod": {
        "id": p.id, "name": p.name, "role": m.role, "invite_code": p.invite_code if m.role == "admin" else None,
        "rules": p.rules, "rules_updated_at": p.rules_updated_at, "members": members, "decks": decks}},
        status=status)


def admin_only(m):
    return None if m.role == "admin" else JsonResponse({"error": "admin"}, status=403)


def at_limit(request):
    return request.user.pod_memberships.count() >= MAX_PODS


def other_admins(pod, user):
    return pod.members.filter(role="admin").exclude(user=user).exists()


@require_http_methods(["GET", "POST"])
@signed_in
def pods(request):
    if request.method == "GET":
        ms = list(request.user.pod_memberships.select_related("pod").order_by("pod__name", "pod_id"))
        current = next((m.pod for m in ms if m.pod_id == request.session.get("active_pod")), None)
        if current is None:
            request.session.pop("active_pod", None)
        return JsonResponse({"pods": [summary(m) for m in ms],
                             "active": {k: getattr(current, k) for k in ("id", "name", "rules", "rules_updated_at")}
                             if current else None})
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    name = clean_name(data.get("name"))
    if name is None:
        return bad({"name": "invalid"})
    source = data.get("from")
    if source is None:
        rules = template()
    elif type(source) is int:
        rules = membership(request, source).pod.rules
    else:
        raise Http404
    if at_limit(request):
        return bad({"pods": "limit"})
    with transaction.atomic():
        pod = Pod.objects.create(name=name, created_by=request.user, rules=rules)
        m = PodMember.objects.create(pod=pod, user=request.user, role="admin")
    request.session["active_pod"] = pod.id
    return detail_response(m, request, 201)


@require_http_methods(["POST"])
@signed_in
def join(request):
    data = body(request)
    code = data.get("code") if data else None
    pod = Pod.objects.filter(invite_code=code).first() if isinstance(code, str) else None
    if pod is None:
        raise Http404
    m = PodMember.objects.filter(pod=pod, user=request.user).first()
    if m is None:
        if at_limit(request):
            return bad({"pods": "limit"})
        m = PodMember.objects.create(pod=pod, user=request.user, role="member")
    request.session["active_pod"] = pod.id
    return detail_response(m, request)


@require_http_methods(["POST"])
@signed_in
def active(request):
    data = body(request)
    if data is None or "pod" not in data:
        return bad({"body": "invalid"})
    if data["pod"] is None:
        request.session.pop("active_pod", None)
    else:
        membership(request, data["pod"] if type(data["pod"]) is int else 0)
        request.session["active_pod"] = data["pod"]
    return HttpResponse(status=204)


@require_http_methods(["GET", "POST"])
@signed_in
def pod(request, id):
    m = membership(request, id)
    if request.method == "GET":
        return detail_response(m, request)
    if denied := admin_only(m):
        return denied
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    p, errors = m.pod, {}
    if "name" in data:
        name = clean_name(data["name"])
        if name is None:
            errors["name"] = "invalid"
        else:
            p.name = name
    if "rules" in data:
        rules, rule_errors = apply_edits(p.rules, data["rules"])
        errors.update(rule_errors)
        if not rule_errors:
            p.rules, p.rules_updated_at = rules, timezone.now()
    if errors:
        return bad(errors)
    p.save()
    return detail_response(m, request)


@require_http_methods(["POST"])
@signed_in
def invite(request, id):
    m = membership(request, id)
    if denied := admin_only(m):
        return denied
    m.pod.invite_code = new_code()
    m.pod.save()
    return JsonResponse({"invite_code": m.pod.invite_code})


@require_http_methods(["POST"])
@signed_in
def leave(request, id):
    m = membership(request, id)
    if m.pod.members.count() == 1:
        m.pod.delete()
    elif m.role == "admin" and not other_admins(m.pod, request.user):
        return bad({"role": "last_admin"})
    else:
        PodDeck.objects.filter(pod=m.pod, deck__owner=request.user).delete()
        m.delete()
    if request.session.get("active_pod") == id:
        del request.session["active_pod"]
    return HttpResponse(status=204)


@require_http_methods(["POST", "DELETE"])
@signed_in
def member(request, id, user_id):
    m = membership(request, id)
    if denied := admin_only(m):
        return denied
    target = m.pod.members.filter(user_id=user_id).first()
    if target is None:
        raise Http404
    if request.method == "DELETE":
        if target.user_id == request.user.id:
            return bad({"user": "self"})
        PodDeck.objects.filter(pod=m.pod, deck__owner_id=user_id).delete()
        target.delete()
        return HttpResponse(status=204)
    data = body(request)
    role = data.get("role") if data else None
    if role not in ("admin", "member"):
        return bad({"role": "invalid"})
    if role == "member" and not other_admins(m.pod, target.user):
        return bad({"role": "last_admin"})
    target.role = role
    target.save()
    return HttpResponse(status=204)


@require_http_methods(["POST"])
@signed_in
def add_deck(request, id):
    m = membership(request, id)
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    deck_id = data.get("deck")
    d = Deck.objects.filter(pk=deck_id, owner=request.user).first() if type(deck_id) is int else None
    if d is None:
        raise Http404
    entry = PodDeck.objects.filter(pod=m.pod, deck=d).first()
    created = entry is None
    if created:
        if m.pod.entries.count() >= MAX_PODDECKS:
            return bad({"decks": "limit"})
        entry = PodDeck.objects.create(pod=m.pod, deck=d)
    if d.visibility == "private":
        d.visibility = "pods"
        d.save()
    return JsonResponse({"id": d.id, "added_at": entry.added_at}, status=201 if created else 200)


@require_http_methods(["DELETE"])
@signed_in
def remove_deck(request, id, deck_id):
    m = membership(request, id)
    entry = m.pod.entries.select_related("deck").filter(deck_id=deck_id).first()
    if entry is None:
        raise Http404
    if entry.deck.owner_id != request.user.id and (denied := admin_only(m)):
        return denied
    entry.delete()
    return HttpResponse(status=204)


@require_http_methods(["POST"])
@signed_in
def add_member(request, id):
    m = membership(request, id)
    if denied := admin_only(m):
        return denied
    data = body(request)
    uid = data.get("user") if data else None
    friend = User.objects.filter(pk=uid, is_active=True).first() if type(uid) is int else None
    if friend is None or not are_friends(request.user.id, friend.id):
        return bad({"user": "invalid"})
    if m.pod.members.filter(user=friend).exists():
        return detail_response(m, request)
    if friend.pod_memberships.count() >= MAX_PODS:
        return bad({"pods": "limit"})
    PodMember.objects.create(pod=m.pod, user=friend, role="member")
    return detail_response(m, request, 201)
