from collections import Counter

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from decks.models import DeckVersion
from decks.views import MAX_BOARD, bad, body, clean_entries, signed_in
from pods.views import membership

from . import table
from .models import Game, GamePlayer

MAX_GAMES = 5
MAX_CARDS = 250
DECK_SIZE = 100  # a Commander deck, commanders included
BOARDS = ("entries", "side", "maybe")


def group_send(game_id, message):
    async_to_sync(get_channel_layer().group_send)(f"game_{game_id}", message)


def my_seat(request, id):
    try:
        return GamePlayer.objects.select_related("game").get(game_id=id, user=request.user)
    except GamePlayer.DoesNotExist:
        raise Http404


@require_http_methods(["GET", "POST"])
@signed_in
def pod_games(request, id):
    m = membership(request, id)
    if request.method == "GET":
        mine = GamePlayer.objects.filter(game__pod_id=id, user=request.user).select_related("game").order_by("-game_id")
        games = [{"id": me.game_id, "status": me.game.status, "seat": me.seat, "ready": {str(p.seat): p.ready for p in me.game.players.all()},
                  "decks": {str(p.seat): p.deck_id is not None for p in me.game.players.all()},
                  "opponents": [p.name for p in me.game.players.select_related("user").order_by("seat") if p.seat != me.seat]}
                 for me in mine]
        return JsonResponse({"games": games})
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    opps = data.get("opponents")
    if (type(opps) is not list or not 1 <= len(opps) <= table.MAX_SEATS - 1
            or any(type(o) is not int or o == request.user.id for o in opps) or len(set(opps)) != len(opps)
            or m.pod.members.filter(user_id__in=opps).count() != len(opps)):
        return bad({"opponents": "invalid"})
    if GamePlayer.objects.filter(user=request.user).count() >= MAX_GAMES:
        return bad({"games": "limit"})
    with transaction.atomic():
        g = Game.objects.create(pod=m.pod)
        GamePlayer.objects.create(game=g, user=request.user, seat=1)
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
    if data is None or type(data.get("deck")) is not int:
        return bad({"deck": "invalid"})
    if "version" in data and type(data["version"]) is not int:
        return bad({"version": "invalid"})
    versions = DeckVersion.objects.select_related("deck").filter(deck_id=data["deck"], deck__owner=request.user)
    version = (versions.filter(pk=data["version"]) if "version" in data else versions).first()
    if version is None:
        raise Http404
    if sum(e["quantity"] for e in version.list["entries"]) > MAX_CARDS:
        return bad({"deck": "size"})

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
