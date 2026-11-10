import json
import secrets

from django.conf import settings
from django.core.management.base import BaseCommand

from accounts.models import User

ACCOUNTS = [("admin", True, True), ("tester", False, True), ("pending", False, False)]


class Command(BaseCommand):
    help = "Create dev accounts; passwords go to server/seed/dev_accounts.json"

    def handle(self, *args, **opts):
        out = settings.BASE_DIR / "seed" / "dev_accounts.json"
        known = json.loads(out.read_text()) if out.exists() else {}
        for name, superuser, active in ACCOUNTS:
            if name in known and User.objects.filter(username=name).exists():
                continue
            known[name] = secrets.token_urlsafe(16)
            User.objects.filter(username=name).delete()
            u = User(username=name, email=f"{name}@example.com", is_active=active,
                     is_staff=superuser, is_superuser=superuser)
            u.set_password(known[name])
            u.save()
        out.parent.mkdir(exist_ok=True)
        out.write_text(json.dumps(known, indent=2))
        out.chmod(0o600)
