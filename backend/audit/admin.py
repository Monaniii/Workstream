from django.contrib import admin
from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """Read-only admin representation of audit events.

    Audit records are append-only evidence; they cannot be added, changed, or
    deleted through the admin interface.
    """

    list_display = (
        "timestamp",
        "actor_email",
        "action",
        "module",
        "resource_type",
        "resource_id",
        "outcome",
        "workspace",
    )
    list_filter = ("action", "module", "outcome", "workspace", "timestamp")
    search_fields = ("actor_email", "description", "resource_name", "request_id")
    ordering = ["-timestamp"]
    readonly_fields = [f.name for f in AuditEvent._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
