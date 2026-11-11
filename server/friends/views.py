from django.db.models import Q
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from accounts.models import User
from decks.views import bad, body, signed_in

from .models import Friendship, between

MAX_FRIENDS = 200


def people(users):
    return [{"id": u.id, "name": u.username} for u in sorted(users, key=lambda u: u.username.lower())]


def listing(me):
    rows = Friendship.objects.filter(Q(from_user=me) | Q(to_user=me)).select_related("from_user", "to_user")
    other = lambda r: r.to_user if r.from_user_id == me.id else r.from_user
    return JsonResponse({
        "friends": people(other(r) for r in rows if r.accepted),
        "incoming": people(r.from_user for r in rows if not r.accepted and r.to_user_id == me.id),
        "outgoing": people(r.to_user for r in rows if not r.accepted and r.from_user_id == me.id)})


@require_http_methods(["GET", "POST"])
@signed_in
def friends(request):
    me = request.user
    if request.method == "GET":
        return listing(me)
    data = body(request)
    name = data.get("username") if data else None
    other = User.objects.filter(username__iexact=name.strip(), is_active=True).first() if isinstance(name, str) else None
    if other is None:
        return bad({"username": "unknown"})
    if other.id == me.id:
        return bad({"username": "self"})
    row = between(me.id, other.id).first()
    if row is None:
        if Friendship.objects.filter(Q(from_user=me) | Q(to_user=me)).count() >= MAX_FRIENDS:
            return bad({"friends": "limit"})
        Friendship.objects.create(from_user=me, to_user=other)
        return JsonResponse({"status": "sent"}, status=201)
    if row.accepted:
        return JsonResponse({"status": "friends"})
    if row.to_user_id == me.id:
        row.accepted = True
        row.save()
        return JsonResponse({"status": "friends"})
    return JsonResponse({"status": "sent"})


@require_http_methods(["POST"])
@signed_in
def accept(request, user_id):
    if not Friendship.objects.filter(from_user_id=user_id, to_user=request.user, accepted=False).update(accepted=True):
        raise Http404
    return HttpResponse(status=204)


@require_http_methods(["DELETE"])
@signed_in
def remove(request, user_id):
    if not between(request.user.id, user_id).delete()[0]:
        raise Http404
    return HttpResponse(status=204)
