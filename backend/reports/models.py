from django.db import models
from django.conf import settings
from tenants.models import Workspace


class ReportExport(models.Model):
    """Tracks generated report exports for audit and retry purposes."""

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="report_exports",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requested_report_exports",
    )
    report_type = models.CharField(max_length=50)  # overview, projects, tasks, team, activity
    format = models.CharField(max_length=10, default="csv")  # csv, pdf
    filters = models.JSONField(default=dict, blank=True)
    file_url = models.URLField(blank=True, default="")
    record_count = models.IntegerField(default=0)
    status = models.CharField(
        max_length=20,
        default="pending",
    )  # pending, completed, failed
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.report_type} export ({self.status})"
