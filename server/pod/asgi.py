import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pod.settings")
django_app = get_asgi_application()  # must run before the imports below touch models

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from django.urls import path  # noqa: E402

from games.consumers import GameConsumer  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_app,
    "websocket": AllowedHostsOriginValidator(AuthMiddlewareStack(URLRouter([
        path("pod/api/ws/game/<int:id>", GameConsumer.as_asgi()),
    ]))),
})
