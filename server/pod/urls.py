from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from accounts import views

admin.site.has_permission = lambda request: request.user.is_active and request.user.is_superuser
admin.site.login = lambda request, extra_context=None: views.redirect_to_account()

urlpatterns = [
    path("pod/api/_allauth/", include("allauth.headless.urls")),
    path("pod/api/accounts/", include("allauth.urls")),
    path("pod/api/admin/", admin.site.urls),
    path("pod/api/me", views.me),
    path("pod/api/me/delete", views.me_delete),
    path("pod/api/gate", views.gate),
]
if settings.DEV_STATIC:
    urlpatterns += [
        path("pod/", views.dev_redirect),
        path("pod/app", views.dev_redirect),
        path("pod/app/", views.dev_static, {"root": "app", "rest": ""}),
        path("pod/<str:root>/<path:rest>", views.dev_static),
    ]
