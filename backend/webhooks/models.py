from django.db import models
from tenants.models import Workspace


class WebhookEvent(models.TextChoices):
    ISSUE_CREATED = "issue.created", "Issue Created"
    ISSUE_UPDATED = "issue.updated", "Issue Updated"
    ISSUE_DELETED = "issue.deleted", "Issue Deleted"
    ISSUE_TRANSITIONED = "issue.transitioned", "Issue Transitioned"
    COMMENT_ADDED = "comment.added", "Comment Added"
    SUBSCRIPTION_UPDATED = "subscription.updated", "Subscription Updated"
    INVOICE_PAID = "invoice.paid", "Invoice Paid"


class WebhookEndpoint(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="webhook_endpoints"
    )
    url = models.URLField()
    secret = models.CharField(max_length=200, blank=True, default="")
    events = models.JSONField(
        default=list, help_text="List of event slugs to subscribe to"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.url


class WebhookDelivery(models.Model):
    endpoint = models.ForeignKey(
        WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries"
    )
    event = models.CharField(max_length=100, choices=WebhookEvent.choices)
    payload = models.JSONField(default=dict)
    status_code = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event} -> {self.endpoint.url}"
