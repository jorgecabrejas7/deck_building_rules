import secrets

from django.conf import settings
from django.db import models


def new_token():
    return secrets.token_urlsafe(16)


class Deck(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="decks")
    name = models.CharField(max_length=100)
    # "pods": readable by members of the pods it is entered in
    visibility = models.CharField(max_length=10, default="private",
                                  choices=[(v, v) for v in ("private", "pods", "link")])
    link_token = models.CharField(max_length=32, unique=True, default=new_token)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class DeckVersion(models.Model):
    deck = models.ForeignKey(Deck, on_delete=models.CASCADE, related_name="versions")
    list = models.JSONField()
    source = models.CharField(max_length=10, choices=[(s, s) for s in ("paste", "moxfield", "archidekt", "builder")])
    source_url = models.CharField(max_length=300, blank=True)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
