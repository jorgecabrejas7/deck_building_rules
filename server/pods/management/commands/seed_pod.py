from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from pods.models import Pod, PodMember
from pods.rules import template


class Command(BaseCommand):
    help = "Create a pod from the rules template with <admin> as its admin and print its invite code."

    def add_arguments(self, parser):
        parser.add_argument("--name", required=True)
        parser.add_argument("--admin", required=True, help="username")

    def handle(self, *args, name, admin, **opts):
        try:
            user = User.objects.get(username=admin)
        except User.DoesNotExist:
            raise CommandError(f"no user {admin!r}")
        if PodMember.objects.filter(user=user, pod__name=name).exists():
            raise CommandError(f"{admin} already has a pod named {name!r}")
        with transaction.atomic():
            pod = Pod.objects.create(name=name, created_by=user, rules=template())
            PodMember.objects.create(pod=pod, user=user, role="admin")
        self.stdout.write(pod.invite_code)
