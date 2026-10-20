from django.contrib import admin
from .models import (
    IssueStatus,
    Issue,
    IssueComment,
    IssueAttachment,
    AuditLog,
)


@admin.register(IssueStatus)
class IssueStatusAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "workspace", "color", "is_initial", "is_final")
    list_filter = ("workspace", "is_initial", "is_final")
    search_fields = ("name", "key")


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = (
        "key",
        "summary",
        "project",
        "status",
        "priority",
        "assignee",
        "created_at",
    )
    list_filter = ("workspace", "status", "priority", "issue_type")
    search_fields = ("key", "summary")


@admin.register(IssueComment)
class IssueCommentAdmin(admin.ModelAdmin):
    list_display = ("issue", "author", "created_at")
    list_filter = ("issue__workspace",)
    search_fields = ("body", "issue__key")


@admin.register(IssueAttachment)
class IssueAttachmentAdmin(admin.ModelAdmin):
    list_display = ("filename", "issue", "uploaded_by", "created_at")
    list_filter = ("issue__workspace",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("actor", "action", "target_type", "target_id", "created_at")
    list_filter = ("workspace", "action", "target_type")
    search_fields = ("actor__email", "target_type", "target_id")
    readonly_fields = ("created_at",)
