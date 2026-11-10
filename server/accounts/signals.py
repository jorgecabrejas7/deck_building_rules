import logging

from allauth.account.signals import user_signed_up
from django.conf import settings
from django.core.mail import send_mail
from django.dispatch import receiver

log = logging.getLogger(__name__)


@receiver(user_signed_up)
def hold_for_approval(request, user, **kwargs):
    user.is_active = False
    user.save(update_fields=["is_active"])
    request.session["pod_pending"] = user.pk
    url = f"https://{settings.POD_HOST}/pod/api/admin/accounts/user/?is_active__exact=0"
    try:
        send_mail(
            "Nueva cuenta pendiente de aprobación",
            f"Usuario: {user.username}\nCorreo: {user.email}\nAprobar: {url}",
            None,
            [settings.ADMIN_EMAIL],
        )
    except Exception:
        log.exception("approval email failed")
