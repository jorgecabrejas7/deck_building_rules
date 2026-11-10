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
    seat = models.IntegerField(choices=[(1, 1), (2, 2)])
    deck_version = models.ForeignKey("decks.DeckVersion", on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["game", "seat"], name="one_seat")]

    @property
    def name(self):
        return (self.user.display_name or self.user.username) if self.user else None
