from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods

from decks.models import DeckVersion
from decks.views import bad, body, signed_in
from pods.views import membership

from . import table
from .models import Game, GamePlayer

MAX_GAMES = 5
MAX_CARDS = 250


def group_send(game_id, message):
    async_to_sync(get_channel_layer().group_send)(f"game_{game_id}", message)


def my_seat(request, id):
    try:
        return GamePlayer.objects.select_related("game").get(game_id=id, user=request.user)
    except GamePlayer.DoesNotExist:
        raise Http404


def picked(game):
    return {str(p.seat): p.deck_version_id is not None for p in game.players.all()}


@require_http_methods(["GET", "POST"])
@signed_in
def pod_games(request, id):
    m = membership(request, id)
    if request.method == "GET":
        mine = GamePlayer.objects.filter(game__pod_id=id, user=request.user).select_related("game").order_by("-game_id")
        games = []
        for me in mine:
            other = next((p for p in me.game.players.select_related("user") if p.seat != me.seat), None)
            games.append({"id": me.game_id, "status": me.game.status, "seat": me.seat,
                          "opponent": other.name if other else None, "picked": picked(me.game)})
        return JsonResponse({"games": games})
    data = body(request)
    if data is None:
        return bad({"body": "invalid"})
    opp = data.get("opponent")
    if type(opp) is not int or opp == request.user.id or not m.pod.members.filter(user_id=opp).exists():
        return bad({"opponent": "invalid"})
    if GamePlayer.objects.filter(user=request.user).count() >= MAX_GAMES:
        return bad({"games": "limit"})
    with transaction.atomic():
        g = Game.objects.create(pod=m.pod)
        GamePlayer.objects.create(game=g, user=request.user, seat=1)
        GamePlayer.objects.create(game=g, user_id=opp, seat=2)
    return JsonResponse({"id": g.id}, status=201)


@require_http_methods(["POST"])
@signed_in
def game_deck(request, id):
    me = my_seat(request, id)
    data = body(request)
    if data is None or type(data.get("deck")) is not int:
        return bad({"deck": "invalid"})
    version = DeckVersion.objects.filter(deck_id=data["deck"], deck__owner=request.user).first()
    if version is None:
        raise Http404
    if sum(e["quantity"] for e in version.list["entries"]) > MAX_CARDS:
        return bad({"deck": "size"})
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
