import json
from collections import Counter
from pathlib import Path

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Q
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from decks.models import DeckVersion
from decks.views import MAX_BOARD, bad, body, clean_entries, signed_in
from friends.models import Friendship, are_friends
from pods.models import PodMember
from pods.views import membership

from . import table
from .models import Game, GamePlayer

MAX_GAMES = 5
MAX_CARDS = 250
DECK_SIZE = 100  # a Commander deck, commanders included
BOARDS = ("entries", "side", "maybe")
PRACTICE_DECK = json.loads((Path(__file__).parent / "practice_deck.json").read_text())


def group_send(game_id, message):
    async_to_sync(get_channel_layer().group_send)(f"game_{game_id}", message)


def my_seat(request, id):
    try:
        return GamePlayer.objects.select_related("game").get(game_id=id, user=request.user)
    except GamePlayer.DoesNotExist:
        raise Http404


def pick_version(request, data):
    """The version of one of the player's own decks that the body names (the latest when it names none), as (version, refusal)."""
    if type(data.get("deck")) is not int:
        return None, bad({"deck": "invalid"})
    if "version" in data and type(data["version"]) is not int:
        return None, bad({"version": "invalid"})
    versions = DeckVersion.objects.select_related("deck").filter(deck_id=data["deck"], deck__owner=request.user)
    version = (versions.filter(pk=data["version"]) if "version" in data else versions).first()
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
    """My games in every pod and with friends. A game seats two to six members of one pod, or friends of the inviter (no pod)."""
    if request.method == "GET":
        mine = GamePlayer.objects.filter(user=request.user, game__practice=False).select_related("game__pod")
        listed = []
        for me in mine.order_by("-game_id"):
            players = list(me.game.players.select_related("user").order_by("seat"))
            pod = me.game.pod
            listed.append({"id": me.game_id, "status": me.game.status, "seat": me.seat,
                           "ready": {str(p.seat): p.ready for p in players},
                           "decks": {str(p.seat): p.deck_id is not None for p in players},
                           "opponents": [p.name for p in players if p.seat != me.seat],
                           "pod": {"id": pod.id, "name": pod.name} if pod else None})
        return JsonResponse({"games": listed, "people": people(request.user)})
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    opps, pod = data.get("opponents"), None
    if (type(opps) is not list or not 1 <= len(opps) <= table.MAX_SEATS - 1
            or any(type(o) is not int or o == request.user.id for o in opps) or len(set(opps)) != len(opps)):
        return bad({"opponents": "invalid"})
    if data.get("pod") is None:
        if not all(are_friends(request.user.id, o) for o in opps):
            return bad({"opponents": "invalid"})
    else:
        if type(data["pod"]) is not int:
            return bad({"pod": "invalid"})
        pod = membership(request, data["pod"]).pod
        if pod.members.filter(user_id__in=opps).count() != len(opps):
            return bad({"opponents": "invalid"})
    version = None
    if data.get("deck") is not None:  # the inviter may pick a deck in the same step; the lobby opens with it
        version, refusal = pick_version(request, data)
        if refusal:
            return refusal
    if GamePlayer.objects.filter(user=request.user).count() >= MAX_GAMES:
        return bad({"games": "limit"})
    with transaction.atomic():
        g = Game.objects.create(pod=pod)
        GamePlayer.objects.create(game=g, user=request.user, seat=1, deck=version and version.deck, version=version,
                                  list=version and version.list)
        for seat, opp in enumerate(opps, 2):
            GamePlayer.objects.create(game=g, user_id=opp, seat=seat)
    return JsonResponse({"id": g.id}, status=201)


def in_lobby(id, me, change):
    """Run change(player) on the caller's seat while the game is a lobby, start the game when every seat is ready,
    and tell every lobby client. change returns an error body or None."""
    with transaction.atomic():
        game = Game.objects.get(pk=id)
        if game.status != "lobby":
            return bad({"game": "active"})
        player = GamePlayer.objects.get(pk=me.pk)
        error = change(player)
        if error:
            return bad(error)
        player.save()
        players = list(game.players.all())
        if all(p.ready for p in players):
            game.state = table.new_game({p.seat: {"entries": p.list["entries"], "commanders": p.list["commanders"]} for p in players})
            game.status = "active"
        game.seq += 1  # every lobby change is a new view
        game.save()
    group_send(id, {"type": "changed", "seq": game.seq})
    return JsonResponse({"status": game.status})


@require_http_methods(["POST"])
@signed_in
def game_deck(request, id):
    me = my_seat(request, id)
    data = body(request)
    if data is None:
        return bad({"deck": "invalid"})
    version, refusal = pick_version(request, data)
    if refusal:
        return refusal

    def change(p):
        p.deck, p.version, p.list, p.ready = version.deck, version, version.list, False

    return in_lobby(id, me, change)


def tally(lst):
    cards = Counter()
    for board in BOARDS:
        for e in lst[board]:
            cards[e["name"]] += e["quantity"]
    return cards


@require_http_methods(["POST"])
@signed_in
def game_ready(request, id):
    me = my_seat(request, id)
    data = body(request)
    if data is None or type(data.get("ready")) is not bool:
        return bad({"ready": "invalid"})

    def change(p):
        if p.list is None:
            return {"deck": "none"}
        if "entries" in data:
            new = {"commanders": p.list["commanders"], "entries": clean_entries(data["entries"], 1, 300),
                   "side": clean_entries(data.get("side", []), 0, MAX_BOARD), "maybe": clean_entries(data.get("maybe", []), 0, MAX_BOARD)}
            if (any(new[b] is None for b in BOARDS) or tally(new) != tally(p.list)
                    or not set(new["commanders"]) <= {e["name"] for e in new["entries"]}
                    or sum(e["quantity"] for e in new["entries"]) > MAX_CARDS):
                return {"list": "invalid"}
            p.list = new
        if data["ready"] and sum(e["quantity"] for e in p.list["entries"]) != DECK_SIZE:
            return {"list": "count"}
        p.ready = data["ready"]

    return in_lobby(id, me, change)


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
