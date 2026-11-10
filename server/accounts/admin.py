from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.action(description="Approve")
def approve(modeladmin, request, queryset):
    queryset.update(is_active=True)


@admin.register(User)
class PodUserAdmin(UserAdmin):
    ordering = ("is_active", "-date_joined")
    list_filter = ("is_active",)
    list_display = ("username", "email", "is_active", "date_joined")
    actions = [approve]
