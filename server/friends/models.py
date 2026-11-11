from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Friendship(models.Model):
    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    to_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    accepted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["from_user", "to_user"], name="one_request"),
            models.CheckConstraint(condition=~Q(from_user=F("to_user")), name="not_self"),
        ]


def between(a_id, b_id):
    """The row linking two users, whichever way it points."""
    return Friendship.objects.filter(Q(from_user_id=a_id, to_user_id=b_id) | Q(from_user_id=b_id, to_user_id=a_id))


def are_friends(a_id, b_id):
    return between(a_id, b_id).filter(accepted=True).exists()
