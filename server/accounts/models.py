from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=50, blank=True)
    archidekt_username = models.CharField(max_length=40, blank=True)  # the Archidekt account Mis mazos syncs with
    archidekt_refresh = models.CharField(max_length=600, blank=True)  # its refresh token; the password is never kept
    language = models.CharField(max_length=2, choices=[("es", "es"), ("en", "en")], default="es")
    # set when an admin rejects the signup: the account stays inactive and leaves the requests list; only the Django admin deletes
    rejected_at = models.DateTimeField(null=True, blank=True)
