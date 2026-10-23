import uuid

from django.db import models
from django.conf import settings
from django.utils import timezone
from tenants.models import Workspace


class AuditEvent(models.Model):
    """Centralized, append-only audit event record.

    Security-sensitive evidence of who did what, when, where, and with what
    outcome across the Workstream application.
    """

    class Action(models.TextChoices):
        CREATE = "create", "Create"
        READ = "read", "Read"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        EXPORT = "export", "Export"
        INVITE = "invite", "Invite"
        PERMISSION_CHANGE = "permission_change", "Permission Change"
        ACCESS_DENIED = "access_denied", "Access Denied"
        AUTH_FAILURE = "auth_failure", "Authentication Failure"
        ARCHIVE = "archive", "Archive"
        UNARCHIVE = "unarchive", "Unarchive"
        TRANSITION = "transition", "Transition"
        ASSIGN = "assign", "Assign"
        UNASSIGN = "unassign", "Unassign"
        COMMENT = "comment", "Comment"
        ATTACHMENT_ADD = "attachment_add", "Attachment Added"
        ATTACHMENT_REMOVE = "attachment_remove", "Attachment Removed"
        MEMBERSHIP_ADD = "membership_add", "Member Added"
        MEMBERSHIP_REMOVE = "membership_remove", "Member Removed"
        MEMBERSHIP_ROLE_CHANGE = "membership_role_change", "Member Role Changed"
        INVITATION_CREATE = "invitation_create", "Invitation Created"
        INVITATION_ACCEPT = "invitation_accept", "Invitation Accepted"
        INVITATION_REVOKE = "invitation_revoke", "Invitation Revoked"
        SUBSCRIPTION_CHANGE = "subscription_change", "Subscription Change"
        INVOICE_PAID = "invoice_paid", "Invoice Paid"
        SETTINGS_CHANGE = "settings_change", "Settings Change"
        PREFERENCE_CHANGE = "preference_change", "Preference Change"
        SYSTEM = "system", "System"
        RETENTION_CLEANUP = "retention_cleanup", "Retention Cleanup"
        AUDIT_ACCESS = "audit_access", "Audit Access"
        AUDIT_EXPORT = "audit_export", "Audit Export"

    class Outcome(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILURE = "failure", "Failure"
        DENIED = "denied", "Denied"
        ERROR = "error", "Error"

    class ActorType(models.TextChoices):
        USER = "user", "Authenticated User"
        SYSTEM = "system", "System Process"
        API = "api", "API / Service Identity"

    class Module(models.TextChoices):
        AUTH = "auth", "Authentication"
        PROJECTS = "projects", "Projects"
        ISSUES = "issues", "Issues / Tasks"
        TEAMS = "teams", "Teams & Workspaces"
        REPORTS = "reports", "Reports & Exports"
        BILLING = "billing", "Billing & Subscription"
        WEBHOOKS = "webhooks", "Webhooks"
        NOTIFICATIONS = "notifications", "Notifications"
        SYSTEM_MODULE = "system", "System"
        AUDIT = "audit", "Audit"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    actor_type = models.CharField(
        max_length=20, choices=ActorType.choices, default=ActorType.USER
    )
    actor_name = models.CharField(max_length=255, blank=True, default="")
    actor_email = models.EmailField(blank=True, default="")
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=50, choices=Action.choices, db_index=True)
    module = models.CharField(max_length=50, choices=Module.choices, db_index=True)
    resource_type = models.CharField(
        max_length=100, blank=True, default="", db_index=True
    )
    resource_id = models.CharField(
        max_length=255, blank=True, default="", db_index=True
    )
    resource_name = models.CharField(max_length=255, blank=True, default="")
    description = models.CharField(max_length=1000, blank=True, default="")
    outcome = models.CharField(
        max_length=20, choices=Outcome.choices, default=Outcome.SUCCESS, db_index=True
    )
    changed_fields = models.JSONField(default=dict, blank=True)
    request_id = models.CharField(
        max_length=255, blank=True, default="", db_index=True
    )
    http_method = models.CharField(max_length=10, blank=True, default="")
    route = models.CharField(max_length=500, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, default="")
    session_key = models.CharField(max_length=255, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "-timestamp"]),
            models.Index(fields=["actor", "-timestamp"]),
            models.Index(fields=["action", "-timestamp"]),
            models.Index(fields=["module", "-timestamp"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["outcome", "-timestamp"]),
            models.Index(fields=["request_id"]),
        ]

    def __str__(self):
        return (
            f"{self.timestamp} {self.action} "
            f"{self.resource_type}#{self.resource_id} ({self.outcome})"
        )
