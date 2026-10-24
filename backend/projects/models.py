from django.db import models
from django.conf import settings
from tenants.models import Workspace


class ProjectStatus(models.TextChoices):
    PLANNED = "planned", "Planned"
    ACTIVE = "active", "Active"
    ON_HOLD = "on_hold", "On Hold"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class ProjectPriority(models.TextChoices):
    LOW = "low", "Low"
    NORMAL = "normal", "Normal"
    HIGH = "high", "High"
    CRITICAL = "critical", "Critical"


class ProjectVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    INTERNAL = "internal", "Internal"
    PRIVATE = "private", "Private"


class Project(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="projects"
    )
    team_members = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="team_projects", blank=True
    )
    name = models.CharField(max_length=200)
    key = models.CharField(max_length=10, help_text="Short project key, e.g. PROJ")
    description = models.TextField(blank=True, default="")
    objectives = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=ProjectStatus.choices,
        default=ProjectStatus.PLANNED,
    )
    priority = models.CharField(
        max_length=20,
        choices=ProjectPriority.choices,
        default=ProjectPriority.NORMAL,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_projects",
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="managed_projects",
    )
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    actual_start_date = models.DateField(null=True, blank=True)
    actual_completion_date = models.DateField(null=True, blank=True)
    tags = models.JSONField(default=list, blank=True)
    visibility = models.CharField(
        max_length=20,
        choices=ProjectVisibility.choices,
        default=ProjectVisibility.INTERNAL,
    )
    archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_projects",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("workspace", "key")
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["workspace", "archived"]),
            models.Index(fields=["workspace", "key"]),
        ]

    def __str__(self):
        return f"{self.key} - {self.name}"

    @property
    def health(self):
        """Calculate project health based on task completion and dates."""
        from issues.models import Issue

        open_tasks = Issue.objects.filter(
            workspace=self.workspace, project=self, status__is_final=False
        ).count()
        total_tasks = Issue.objects.filter(
            workspace=self.workspace, project=self
        ).count()

        if self.status == ProjectStatus.COMPLETED:
            return "on_track"
        if self.status == ProjectStatus.CANCELLED:
            return "off_track"

        if total_tasks == 0:
            return "on_track"

        completion_rate = (total_tasks - open_tasks) / total_tasks

        if self.target_date:
            from django.utils import timezone

            today = timezone.now().date()
            if today > self.target_date and completion_rate < 1.0:
                return "off_track"
            if (
                today > self.target_date - timezone.timedelta(days=7)
                and completion_rate < 0.8
            ):
                return "at_risk"

        if open_tasks > 0 and completion_rate <= 0.5:
            return "at_risk"

        return "on_track"

    @property
    def progress_percentage(self):
        """Calculate project completion percentage from tasks."""
        from issues.models import Issue

        total = Issue.objects.filter(workspace=self.workspace, project=self).count()
        if total == 0:
            return 0
        completed = Issue.objects.filter(
            workspace=self.workspace, project=self, status__is_final=True
        ).count()
        return round((completed / total) * 100, 1)


class Board(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="boards"
    )
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="boards"
    )
    name = models.CharField(max_length=200)
    columns = models.JSONField(
        default=list,
        help_text="Kanban columns: [{id, name, color, wip_limit}]",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class SprintStatus(models.TextChoices):
    PLANNING = "planning", "Planning"
    ACTIVE = "active", "Active"
    COMPLETED = "completed", "Completed"
    ARCHIVED = "archived", "Archived"


class Sprint(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="sprints"
    )
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="sprints")
    name = models.CharField(max_length=200)
    goal = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=SprintStatus.choices,
        default=SprintStatus.PLANNING,
    )
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
