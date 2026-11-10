from django.apps import AppConfig


class PodsConfig(AppConfig):
    name = "pods"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from django.db.models.signals import pre_delete

        from accounts.models import User

        from .models import hand_over_pods
        pre_delete.connect(hand_over_pods, sender=User)
