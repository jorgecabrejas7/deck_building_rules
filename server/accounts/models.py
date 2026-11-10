from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=50, blank=True)
    language = models.CharField(max_length=2, choices=[("es", "es"), ("en", "en")], default="es")
