import json
from pathlib import Path

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Q
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from decks.models import DeckVersion
from decks.views import bad, body, signed_in
from friends.models import Friendship, are_friends
from pods.models import PodMember
from pods.views import membership

from . import table
from .models import Game, GamePlayer

MAX_GAMES = 5
MAX_CARDS = 250
PRACTICE_DECK = json.loads((Path(__file__).parent / "practice_deck.json").read_text())


def group_send(game_id, message):
    async_to_sync(get_channel_layer().group_send)(f"game_{game_id}", message)


def my_seat(request, id):
    try:
        return GamePlayer.objects.select_related("game").get(game_id=id, user=request.user)
    except GamePlayer.DoesNotExist:
        raise Http404


def picked(game):
    return {str(p.seat): p.deck_version_id is not None for p in game.players.all()}


def pick_version(request, deck):
    """The latest version of one of the player's own decks, as (version, refusal)."""
    if type(deck) is not int:
        return None, bad({"deck": "invalid"})
    version = DeckVersion.objects.filter(deck_id=deck, deck__owner=request.user).first()
    if version is None:
        raise Http404
    if sum(e["quantity"] for e in version.list["entries"]) > MAX_CARDS:
        return None, bad({"deck": "size"})
    return version, None


def people(user):
    """Everyone the player can invite: the members of their pods and their friends."""
    out = {}
    def entry(u):
        return out.setdefault(u.id, {"id": u.id, "name": u.username, "pods": [], "friend": False})
    mates = PodMember.objects.filter(pod__members__user=user).exclude(user=user).select_related("user", "pod")
    for m in mates.order_by("pod__name", "pod_id"):
        entry(m.user)["pods"].append({"id": m.pod_id, "name": m.pod.name})
    rows = Friendship.objects.filter(Q(from_user=user) | Q(to_user=user), accepted=True)
    for f in rows.select_related("from_user", "to_user"):
        entry(f.to_user if f.from_user_id == user.id else f.from_user)["friend"] = True
    return sorted(out.values(), key=lambda p: p["name"].lower())


@require_http_methods(["GET", "POST"])
@signed_in
def games(request):
    """My games in every pod and with friends. A game is between two members of one pod, or two friends (no pod)."""
    if request.method == "GET":
        mine = GamePlayer.objects.filter(user=request.user, game__practice=False).select_related("game__pod")
        listed = []
        for me in mine.order_by("-game_id"):
            other = next((p for p in me.game.players.select_related("user") if p.seat != me.seat), None)
            pod = me.game.pod
            listed.append({"id": me.game_id, "status": me.game.status, "seat": me.seat,
                           "opponent": other.name if other else None, "picked": picked(me.game),
                           "pod": {"id": pod.id, "name": pod.name} if pod else None})
        return JsonResponse({"games": listed, "people": people(request.user)})
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    opp, pod = data.get("opponent"), None
    if type(opp) is not int or opp == request.user.id:
        return bad({"opponent": "invalid"})
    if data.get("pod") is None:
        if not are_friends(request.user.id, opp):
            return bad({"opponent": "invalid"})
    else:
        if type(data["pod"]) is not int:
            return bad({"pod": "invalid"})
        pod = membership(request, data["pod"]).pod
        if not pod.members.filter(user_id=opp).exists():
            return bad({"opponent": "invalid"})
    version = None
    if data.get("deck") is not None:  # the inviter may pick a deck in the same step
        version, refusal = pick_version(request, data["deck"])
        if refusal:
            return refusal
    if GamePlayer.objects.filter(user=request.user).count() >= MAX_GAMES:
        return bad({"games": "limit"})
    with transaction.atomic():
        g = Game.objects.create(pod=pod)
        GamePlayer.objects.create(game=g, user=request.user, seat=1, deck_version=version)
        GamePlayer.objects.create(game=g, user_id=opp, seat=2)
    return JsonResponse({"id": g.id}, status=201)


@require_http_methods(["POST"])
@signed_in
def game_deck(request, id):
    me = my_seat(request, id)
    data = body(request)
    if data is None:
        return bad({"deck": "invalid"})
    version, refusal = pick_version(request, data.get("deck"))
    if refusal:
        return refusal
    with transaction.atomic():
        game = Game.objects.get(pk=id)
        if game.status != "lobby":
            return bad({"game": "active"})
        GamePlayer.objects.filter(pk=me.pk).update(deck_version=version)
        players = list(game.players.select_related("deck_version"))
        started = all(p.deck_version for p in players)
        if started:
            game.state = table.new_game({p.seat: p.deck_version.list for p in players})
            game.status = "active"
            game.seq += 1  # lobby clients hold seq 0
            game.save()
    if started:
        group_send(id, {"type": "changed", "seq": game.seq})
    return JsonResponse({"picked": picked(game), "status": game.status})


@require_http_methods(["DELETE"])
@signed_in
def game(request, id):
    my_seat(request, id).game.delete()
    group_send(id, {"type": "ended"})
    return HttpResponse(status=204)


@require_http_methods(["POST"])
@signed_in
def practice(request):
    """A solo game: the practice deck against an empty seat. Starting one ends the last one."""
    Game.objects.filter(practice=True, players__user=request.user).delete()
    if GamePlayer.objects.filter(user=request.user).count() >= MAX_GAMES:
        return bad({"games": "limit"})
    with transaction.atomic():
        g = Game.objects.create(status="active", practice=True,
                                state=table.new_game({1: PRACTICE_DECK, 2: {"entries": [], "commanders": []}}))
        GamePlayer.objects.create(game=g, user=request.user, seat=1)
        GamePlayer.objects.create(game=g, user=None, seat=2)
    return JsonResponse({"id": g.id}, status=201)
