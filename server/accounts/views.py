import json
import mimetypes
from pathlib import Path

from django.conf import settings
from django.contrib.auth import logout
from django.http import FileResponse, Http404, HttpResponse, HttpResponseRedirect, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import User

ACCOUNT_PAGE = "/pod/app/account.html"
# Paths as seen inside handle_path /pod/*; keep identical to deploy/pod.caddy.
OPEN_PATHS = [
    "/app/account.html", "/app/js/account.js", "/app/js/api.js", "/app/js/i18n.js", "/app/js/i18n/*",
    "/app/js/state.js", "/app/js/engine/history.js", "/app/js/engine/decks.js",
    "/app/styles/*",
]
GATED_API = ("/api/moxfield/", "/api/archidekt/")


def redirect_to_account():
    return HttpResponseRedirect(ACCOUNT_PAGE)


def is_open(path):
    if path.startswith("/api/"):
        return not path.startswith(GATED_API)
    return any(path == p or (p.endswith("*") and path.startswith(p[:-1])) for p in OPEN_PATHS)


def user_json(u):
    return {"username": u.username, "email": u.email, "display_name": u.display_name,
            "language": u.language, "archidekt_username": u.archidekt_username, "has_password": u.has_usable_password(),
            "is_admin": u.is_superuser}


def is_admin(request):
    return request.user.is_authenticated and request.user.is_superuser


# Accounts waiting for approval (signed up, is_active=False, not rejected), for the admins' Solicitudes view in account.html.
@require_GET
def requests(request):
    if not is_admin(request):
        return JsonResponse({"error": "forbidden"}, status=403)
    rows = [{"id": u.pk, "username": u.username, "email": u.email, "date_joined": u.date_joined.isoformat()}
            for u in User.objects.filter(is_active=False, rejected_at__isnull=True, deactivated_at__isnull=True)
            .order_by("date_joined")]
    return JsonResponse({"requests": rows})


# Approve lets the account in. Reject only marks it: it stays inactive, leaves the list, and nothing is deleted
# (a friend who mistyped a signup is not erased; the Django admin can still delete or approve it later).
@require_POST
def request_decide(request, id, decision):
    if not is_admin(request):
        return JsonResponse({"error": "forbidden"}, status=403)
    u = User.objects.filter(pk=id, is_active=False).first()
    if u is None:
        return JsonResponse({"error": "not found"}, status=404)
    if decision == "approve":
        u.activate()
    else:
        u.rejected_at = timezone.now()
        u.save(update_fields=["rejected_at"])
    return HttpResponse(status=204)


# Every account, for the admins' Usuarios view in account.html.
@require_GET
def users(request):
    if not is_admin(request):
        return JsonResponse({"error": "forbidden"}, status=403)
    rows = [{"id": u.pk, "username": u.username, "display_name": u.display_name, "email": u.email, "state": u.state,
             "is_self": u.pk == request.user.pk, "date_joined": u.date_joined.isoformat(),
             "last_login": u.last_login.isoformat() if u.last_login else None}
            for u in User.objects.order_by("username")]
    return JsonResponse({"users": rows})


# Dar de baja closes an account in use: it stays, inactive and marked, and its sessions stop working at once (Django
# drops an inactive user on the next request). Activate lets any inactive account in again. Delete removes the account
# and its data, as the user's own delete does. Admin accounts, the caller's own included, are left to the Django admin.
@require_POST
def user_action(request, id, action):
    if not is_admin(request):
        return JsonResponse({"error": "forbidden"}, status=403)
    u = User.objects.filter(pk=id).first()
    if u is None:
        return JsonResponse({"error": "not found"}, status=404)
    if u.is_superuser:
        return JsonResponse({"error": "protected"}, status=409)
    if action == "deactivate":
        if not u.is_active:
            return JsonResponse({"error": "state"}, status=409)
        u.is_active, u.deactivated_at = False, timezone.now()
        u.save(update_fields=["is_active", "deactivated_at"])
    elif action == "activate":
        if u.is_active:
            return JsonResponse({"error": "state"}, status=409)
        u.activate()
    else:
        u.delete()
    return HttpResponse(status=204)


@ensure_csrf_cookie
@require_http_methods(["GET", "POST"])
def me(request):
    u = request.user
    if request.method == "POST":
        if not u.is_authenticated:
            return JsonResponse({"error": "forbidden"}, status=403)
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict):
                raise ValueError
        except ValueError:
            return JsonResponse({"errors": {"body": "invalid"}}, status=400)
        errors = {}
        if "language" in data and data["language"] not in ("es", "en"):
            errors["language"] = "invalid"
        if "display_name" in data and not (isinstance(data["display_name"], str) and len(data["display_name"]) <= 50):
            errors["display_name"] = "invalid"
        if errors:
            return JsonResponse({"errors": errors}, status=400)
        for k in ("display_name", "language"):
            if k in data:
                setattr(u, k, data[k])
        u.save()
    if u.is_authenticated:
        return JsonResponse({"state": "active", "user": user_json(u)})
    # set by a signup or by signing in to an inactive account: pending waits for approval, closed had access removed
    held = User.objects.filter(pk=request.session.get("pod_pending"), is_active=False).first()
    if held:
        return JsonResponse({"state": "pending" if held.state == "pending" else "closed"})
    return JsonResponse({"state": "anonymous"})


@require_POST
def me_delete(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "forbidden"}, status=403)
    try:
        password = json.loads(request.body).get("password", "")
    except (ValueError, AttributeError):
        password = ""
    u = request.user
    if not (isinstance(password, str) and u.check_password(password)):
        return JsonResponse({"error": "password"}, status=400)
    logout(request)
    u.delete()
    return HttpResponse(status=204)


@require_GET
def gate(request):
    return HttpResponse(status=204) if request.user.is_authenticated else redirect_to_account()


def dev_redirect(request):
    return HttpResponseRedirect("/pod/app/")


@require_GET
def dev_static(request, root, rest):
    if root not in ("app", "rules", "data"):
        raise Http404
    if not (is_open(f"/{root}/{rest}") or request.user.is_authenticated):
        return redirect_to_account()
    base = Path(settings.BASE_DIR).parent.resolve()
    f = (base / root / (rest or "index.html")).resolve()
    if not f.is_relative_to(base / root) or not f.is_file():
        raise Http404
    ctype = "text/javascript" if f.suffix == ".js" else mimetypes.guess_type(f.name)[0]
    return FileResponse(open(f, "rb"), content_type=ctype or "application/octet-stream")
