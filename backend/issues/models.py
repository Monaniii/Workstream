from django.db import models
from django.conf import settings
from tenants.models import Workspace
from projects.models import Project, Board, Sprint


class IssueStatus(models.Model):
    """A status within a workspace workflow (e.g. To Do, In Progress, Done)."""

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="statuses"
    )
    name = models.CharField(max_length=100)
    key = models.SlugField(max_length=50)  # e.g. todo, in-progress, done
    color = models.CharField(max_length=20, default="#6B7280")
    is_initial = models.BooleanField(default=False)
    is_final = models.BooleanField(default=False)
    position = models.IntegerField(default=0)

    class Meta:
        ordering = ["position"]
        unique_together = ("workspace", "key")

    def __str__(self):
        return self.name


class IssuePriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class IssueType(models.TextChoices):
    BUG = "bug", "Bug"
    TASK = "task", "Task"
    STORY = "story", "Story"
    EPIC = "epic", "Epic"


class Issue(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="issues"
    )
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="issues"
    )
    board = models.ForeignKey(
        Board,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
    )
    sprint = models.ForeignKey(
        Sprint,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
    )
    parent_issue = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subtasks",
    )
    blocked_by = models.ManyToManyField(
        "self",
        symmetrical=False,
        blank=True,
        related_name="blocking_issues",
    )
    key = models.CharField(max_length=30, unique=True)  # e.g. PROJ-42
    summary = models.CharField(max_length=300)
    description = models.TextField(blank=True, default="")
    status = models.ForeignKey(
        IssueStatus, on_delete=models.PROTECT, related_name="issues"
    )
    priority = models.CharField(
        max_length=20, choices=IssuePriority.choices, default=IssuePriority.MEDIUM
    )
    issue_type = models.CharField(
        max_length=20, choices=IssueType.choices, default=IssueType.TASK
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_issues",
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="reported_issues",
    )
    column_id = models.CharField(max_length=100, blank=True, default="")
    position = models.IntegerField(default=0)
    due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Optional deadline. Drives the calendar and overdue reporting.",
    )
    closed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Set when the issue moves to a final status, cleared when it reopens. "
            "A task is considered closed when its status is final."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["workspace", "project", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "project", "status"]),
            models.Index(fields=["workspace", "board", "column_id", "position"]),
            models.Index(fields=["workspace", "sprint"]),
            models.Index(fields=["key"]),
            models.Index(fields=["workspace", "due_date"]),
        ]

    def __str__(self):
        return f"{self.key}: {self.summary}"

    @property
    def is_closed(self):
        """A task is closed once it reaches a final workflow status."""
        return bool(self.status and self.status.is_final)

    @property
    def is_overdue(self):
        """Open, dated, and the deadline has passed."""
        from django.utils import timezone

        if self.is_closed or not self.due_date:
            return False
        return self.due_date < timezone.localdate()

    def save(self, *args, **kwargs):
        """Keep closed_at in sync with the workflow status."""
        from django.utils import timezone

        if self.status_id and self.status.is_final:
            if self.closed_at is None:
                self.closed_at = timezone.now()
        else:
            self.closed_at = None
        return super().save(*args, **kwargs)


class IssueComment(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment on {self.key} by {self.author}"

    @property
    def key(self):
        return self.issue.key


class IssueAttachment(models.Model):
    issue = models.ForeignKey(
        Issue, on_delete=models.CASCADE, related_name="attachments"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    file = models.FileField(upload_to="attachments/%Y/%m/")
    filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True, default="")
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename


class AuditLog(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    action = models.CharField(
        max_length=100
    )  # create, update, delete, transition, comment
    target_type = models.CharField(max_length=50)  # issue, comment, project, etc.
    target_id = models.CharField(max_length=100)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "target_type", "target_id"]),
            models.Index(fields=["workspace", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.action} {self.target_type}#{self.target_id}"
