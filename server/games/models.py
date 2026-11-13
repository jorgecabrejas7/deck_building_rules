from django.conf import settings
from django.db import models


class Game(models.Model):
    pod = models.ForeignKey("pods.Pod", on_delete=models.CASCADE, related_name="games")
    status = models.CharField(max_length=6, choices=[(s, s) for s in ("lobby", "active")], default="lobby")
    state = models.JSONField(default=dict)
    seq = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class GamePlayer(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="players")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    seat = models.IntegerField(choices=[(i, i) for i in range(1, 7)])
    deck = models.ForeignKey("decks.Deck", on_delete=models.SET_NULL, null=True, related_name="+")  # only to show the choice
    # This game's working copy {entries, commanders, side, maybe}: boards can be rearranged here, the saved deck never changes.
    # Once the game is active only entries/commanders were dealt; side and maybe are not part of the game state.
    list = models.JSONField(null=True)
    ready = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["game", "seat"], name="one_seat")]

    @property
    def name(self):
        return (self.user.display_name or self.user.username) if self.user else None
