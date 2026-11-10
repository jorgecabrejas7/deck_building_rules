import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get("DJANGO_DEBUG") == "1"
DEV_STATIC = DEBUG  # test runners force DEBUG off before urls load
SECRET_KEY = "dev-only-insecure-key" if DEBUG else os.environ["DJANGO_SECRET_KEY"]
POD_HOST = os.environ.get("POD_HOST", "localhost")
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"] if DEBUG else [POD_HOST]
CSRF_TRUSTED_ORIGINS = [f"https://{POD_HOST}"]
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "allauth",
    "allauth.account",
    "allauth.headless",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

USE_I18N = True
LANGUAGE_CODE = "es"
LANGUAGES = [("es", "Español"), ("en", "English")]

ROOT_URLCONF = "pod.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
ASGI_APPLICATION = "pod.asgi.application"

DATABASES = {"default": {
    "ENGINE": "django.db.backends.sqlite3",
    "NAME": os.environ.get("DB_PATH", BASE_DIR / "db.sqlite3"),
    "OPTIONS": {"init_command": "PRAGMA journal_mode=WAL;", "transaction_mode": "IMMEDIATE"},
}}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

STATIC_URL = "/pod/api/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

SESSION_COOKIE_NAME = "pod_session"
CSRF_COOKIE_NAME = "pod_csrftoken"
SESSION_COOKIE_PATH = CSRF_COOKIE_PATH = "/pod/"
SESSION_COOKIE_SAMESITE = CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = not DEBUG

if DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = "smtp.gmail.com"
    EMAIL_PORT = 587
    EMAIL_USE_TLS = True
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
    DEFAULT_FROM_EMAIL = SERVER_EMAIL = EMAIL_HOST_USER

HEADLESS_ONLY = True
_acct = "/pod/app/account.html?view="
HEADLESS_FRONTEND_URLS = {
    "account_signup": _acct + "signup",
    "account_confirm_email": _acct + "confirm/{key}",
    "account_reset_password_from_key": _acct + "reset/{key}",
    "socialaccount_login_error": _acct + "signin",
}
ACCOUNT_LOGIN_METHODS = {"username"}
ACCOUNT_SIGNUP_FIELDS = ["username*", "email", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "none"
ACCOUNT_RATE_LIMITS = {"signup": "5/h/ip"}  # each signup emails the admin; allauth merges this over its defaults

if os.environ.get("GOOGLE_CLIENT_ID"):
    SOCIALACCOUNT_PROVIDERS = {"google": {"APP": {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "secret": os.environ["GOOGLE_CLIENT_SECRET"],
    }}}
