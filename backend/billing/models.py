from django.db import models
from tenants.models import Workspace


class SubscriptionPlan(models.Model):
    """Billing plan (free, starter, business, enterprise)."""

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=50, unique=True)
    stripe_price_id = models.CharField(max_length=200, blank=True, default="")
    amount = models.IntegerField(help_text="Amount in cents")
    currency = models.CharField(max_length=10, default="usd")
    interval = models.CharField(max_length=20, default="month")  # month/year
    max_users = models.IntegerField(default=5)
    max_projects = models.IntegerField(default=3)
    max_boards = models.IntegerField(default=3)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["amount"]

    def __str__(self):
        return self.name


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    TRIALING = "trialing", "Trialing"
    PAST_DUE = "past_due", "Past Due"
    CANCELED = "canceled", "Canceled"
    UNPAID = "unpaid", "Unpaid"
    INCOMPLETE = "incomplete", "Incomplete"


class Subscription(models.Model):
    workspace = models.OneToOneField(
        Workspace, on_delete=models.CASCADE, related_name="subscription"
    )
    stripe_customer_id = models.CharField(max_length=200, blank=True, default="")
    stripe_subscription_id = models.CharField(max_length=200, blank=True, default="")
    plan = models.ForeignKey(
        SubscriptionPlan, on_delete=models.PROTECT, related_name="subscriptions"
    )
    status = models.CharField(
        max_length=30,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.INCOMPLETE,
    )
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.workspace.slug} - {self.plan.name} ({self.status})"


class Invoice(models.Model):
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="invoices"
    )
    subscription = models.ForeignKey(
        Subscription, on_delete=models.CASCADE, related_name="invoices"
    )
    stripe_invoice_id = models.CharField(max_length=200, blank=True, default="")
    amount = models.IntegerField(help_text="Amount in cents")
    currency = models.CharField(max_length=10, default="usd")
    status = models.CharField(max_length=50, default="")
    due_date = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invoice {self.stripe_invoice_id} - {self.amount}"


class ProcessedStripeEvent(models.Model):
    """Idempotency record for Stripe webhook events to prevent duplicate processing."""

    stripe_event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=100)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-processed_at"]
        indexes = [
            models.Index(fields=["stripe_event_id"]),
        ]

    def __str__(self):
        return f"{self.stripe_event_id} ({self.event_type})"
