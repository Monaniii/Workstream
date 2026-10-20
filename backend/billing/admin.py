from django.contrib import admin
from .models import SubscriptionPlan, Subscription, Invoice


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "slug",
        "amount",
        "currency",
        "interval",
        "max_users",
        "max_projects",
        "is_active",
    ]
    list_filter = ["is_active", "interval"]
    search_fields = ["name", "slug"]


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = [
        "workspace",
        "plan",
        "status",
        "stripe_subscription_id",
        "current_period_end",
    ]
    list_filter = ["status", "plan"]
    search_fields = ["workspace__slug", "stripe_customer_id", "stripe_subscription_id"]


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = [
        "stripe_invoice_id",
        "workspace",
        "amount",
        "currency",
        "status",
        "paid_at",
    ]
    list_filter = ["status", "currency"]
    search_fields = ["workspace__slug", "stripe_invoice_id"]
