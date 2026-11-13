import json
import time
from collections import deque

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.db import transaction

from . import table
from .models import Game, GamePlayer

MAX_FRAME = 4096
RATE = 10  # actions per second per connection


def lobby_view(game, seat):
    """Per seat only public facts; the viewer alone gets their own boards in `mine`."""
    players, mine = {}, None
    for p in game.players.select_related("user", "deck", "version"):
        lst = p.list
        players[str(p.seat)] = {"name": p.name, "deck": p.deck.name if p.deck else None,
                                "commanders": lst["commanders"] if lst else [],
                                "count": sum(e["quantity"] for e in lst["entries"]) if lst else 0, "ready": p.ready,
                                "version": p.version.name if p.version else ""}
        if p.seat == seat:
            mine = {"deck": p.deck_id, "version": p.version_id, **(lst or {"entries": [], "commanders": [], "side": [], "maybe": []})}
    return {"status": "lobby", "you": seat, "zones": {}, "players": players, "mine": mine}


def named_view(game, seat):
    if game.status == "lobby":
        return lobby_view(game, seat)
    view = table.view(game.state, seat)
    for p in game.players.select_related("user"):
        view["players"].setdefault(str(p.seat), {})["name"] = p.name
    return view


@database_sync_to_async
def seat_of(game_id, user):
    p = GamePlayer.objects.filter(game_id=game_id, user=user).first() if user.is_authenticated else None
    return p.seat if p else None


@database_sync_to_async
def current(game_id, seat):
    game = Game.objects.filter(pk=game_id).first()
    return (game.seq, named_view(game, seat)) if game else None


@database_sync_to_async
def act(game_id, seat, action):
    with transaction.atomic():
        game = Game.objects.filter(pk=game_id).first()
        if game is None or game.status != "active":
            raise table.ActionError("lobby")
        game.state = table.apply(game.state, seat, action)
        game.seq += 1
        game.save()
        return game.seq, named_view(game, seat)


class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.game_id = self.scope["url_route"]["kwargs"]["id"]
        self.seat = await seat_of(self.game_id, self.scope["user"])
        if self.seat is None:
            return await self.close(code=4403)
        self.group = f"game_{self.game_id}"
        self.sent = -1
        self.times = deque()
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.push()

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def push(self):
        found = await current(self.game_id, self.seat)
        if found and found[0] > self.sent:
            await self.state(*found, None)

    async def state(self, seq, view, ack):
        self.sent = seq
        await self.send(json.dumps({"type": "state", "seq": seq, "ack": ack, "view": view}))

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is None or len(text_data.encode()) > MAX_FRAME:
            return await self.close(code=4400)
        now = time.monotonic()
        while self.times and now - self.times[0] > 1:
            self.times.popleft()
        self.times.append(now)
        try:
            msg = json.loads(text_data)
            n, action = msg["n"], msg["action"]
            assert type(n) is int and isinstance(action, dict)
        except (ValueError, KeyError, TypeError, AssertionError):
            return await self.error(None, "invalid")
        if len(self.times) > RATE:
            return await self.error(n, "rate")
        try:
            seq, view = await act(self.game_id, self.seat, action)
        except table.ActionError as e:
            return await self.error(n, e.args[0])
        await self.state(seq, view, n)
        await self.channel_layer.group_send(self.group, {"type": "changed", "seq": seq})

    async def error(self, n, code):
        await self.send(json.dumps({"type": "error", "ack": n, "code": code}))

    async def changed(self, event):
        if event["seq"] > self.sent:
            await self.push()

    async def ended(self, event):
        await self.send(json.dumps({"type": "ended"}))
        await self.close(code=4000)
