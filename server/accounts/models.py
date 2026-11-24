from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=50, blank=True)
    archidekt_username = models.CharField(max_length=40, blank=True)  # the Archidekt account Mis mazos syncs with
    archidekt_refresh = models.CharField(max_length=600, blank=True)  # its refresh token; the password is never kept
    language = models.CharField(max_length=2, choices=[("es", "es"), ("en", "en")], default="es")
    # set when an admin rejects the signup: the account stays inactive and leaves the requests list
    rejected_at = models.DateTimeField(null=True, blank=True)
    # set when an admin closes an account that was in use (dar de baja): inactive, kept, and not a request
    deactivated_at = models.DateTimeField(null=True, blank=True)

    @property
    def state(self):
        if self.is_superuser:
            return "admin"
        if self.is_active:
            return "active"
        if self.deactivated_at:
            return "inactive"
        return "rejected" if self.rejected_at else "pending"

    def activate(self):
        self.is_active, self.rejected_at, self.deactivated_at = True, None, None
        self.save(update_fields=["is_active", "rejected_at", "deactivated_at"])
