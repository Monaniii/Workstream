from django.db import models
from django.conf import settings
from tenants.models import Workspace
from projects.models import Project


class NotificationType(models.TextChoices):
    ISSUE_ASSIGNED = "issue.assigned", "Issue Assigned"
    ISSUE_COMMENTED = "issue.commented", "Issue Commented"
    ISSUE_TRANSITIONED = "issue.transitioned", "Issue Transitioned"
    ISSUE_MOVED = "issue.moved", "Issue Moved"
    SUBSCRIPTION_ACTIVE = "subscription.active", "Subscription Active"
    SUBSCRIPTION_PAST_DUE = "subscription.past_due", "Subscription Past Due"
    REPORT_READY = "report.ready", "Report Ready"


class NotificationScope(models.TextChoices):
    WORKSPACE = "workspace", "Workspace"
    PROJECT = "project", "Project"


class Notification(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="notifications"
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notifications",
    )
    scope = models.CharField(
        max_length=20,
        choices=NotificationScope.choices,
        default=NotificationScope.WORKSPACE,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=50, choices=NotificationType.choices)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default="")
    read = models.BooleanField(default=False)
    link = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "user", "-created_at"]),
            models.Index(fields=["user", "read"]),
            models.Index(fields=["project", "-created_at"]),
            models.Index(fields=["scope", "workspace", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.type} - {self.user.email}"
