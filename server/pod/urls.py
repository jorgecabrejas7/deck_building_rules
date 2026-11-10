from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from accounts import views
from decks import views as decks
from pods import views as pods

admin.site.has_permission = lambda request: request.user.is_active and request.user.is_superuser
admin.site.login = lambda request, extra_context=None: views.redirect_to_account()

urlpatterns = [
    path("pod/api/_allauth/", include("allauth.headless.urls")),
    path("pod/api/accounts/", include("allauth.urls")),
    path("pod/api/admin/", admin.site.urls),
    path("pod/api/me", views.me),
    path("pod/api/me/delete", views.me_delete),
    path("pod/api/gate", views.gate),
    path("pod/api/decks", decks.decks),
    path("pod/api/decks/<int:id>", decks.deck),
    path("pod/api/decks/<int:id>/versions", decks.versions),
    path("pod/api/decks/link/<str:token>", decks.link),
    path("pod/api/pods", pods.pods),
    path("pod/api/pods/join", pods.join),
    path("pod/api/pods/active", pods.active),
    path("pod/api/pods/<int:id>", pods.pod),
    path("pod/api/pods/<int:id>/invite", pods.invite),
    path("pod/api/pods/<int:id>/leave", pods.leave),
    path("pod/api/pods/<int:id>/members/<int:user_id>", pods.member),
    path("pod/api/pods/<int:id>/decks", pods.add_deck),
    path("pod/api/pods/<int:id>/decks/<int:deck_id>", pods.remove_deck),
]
if settings.DEV_STATIC:
    urlpatterns += [
        path("pod/api/archidekt/<int:id>", decks.archidekt_deck),
        path("pod/api/archidekt/user/<str:username>", decks.archidekt_user),
        path("pod/", views.dev_redirect),
        path("pod/app", views.dev_redirect),
        path("pod/app/", views.dev_static, {"root": "app", "rest": ""}),
        path("pod/<str:root>/<path:rest>", views.dev_static),
    ]
