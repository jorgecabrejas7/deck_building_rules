from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=50, blank=True)
    archidekt_username = models.CharField(max_length=40, blank=True)  # whose public decks Mis mazos syncs
    language = models.CharField(max_length=2, choices=[("es", "es"), ("en", "en")], default="es")
