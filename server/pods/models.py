import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


def new_code():
    return secrets.token_urlsafe(12)


class Pod(models.Model):
    name = models.CharField(max_length=100)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    invite_code = models.CharField(max_length=32, unique=True, default=new_code)
    rules = models.JSONField()
    rules_updated_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)


class PodMember(models.Model):
    pod = models.ForeignKey(Pod, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pod_memberships")
    role = models.CharField(max_length=10, choices=[(r, r) for r in ("admin", "member")])
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["pod", "user"], name="one_membership")]


class PodDeck(models.Model):
    pod = models.ForeignKey(Pod, on_delete=models.CASCADE, related_name="entries")
    deck = models.ForeignKey("decks.Deck", on_delete=models.CASCADE, related_name="pod_entries")
    added_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["pod", "deck"], name="one_entry")]


def hand_over_pods(sender, instance, **kwargs):
    """Before a user is deleted: pods they solely administer go to the longest-standing member, or vanish."""
    for m in instance.pod_memberships.filter(role="admin").select_related("pod"):
        if m.pod.members.filter(role="admin").count() > 1:
            continue
        heir = m.pod.members.exclude(user=instance).order_by("joined_at", "id").first()
        if heir:
            heir.role = "admin"
            heir.save()
        else:
            m.pod.delete()
