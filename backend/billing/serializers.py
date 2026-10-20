from rest_framework import serializers
from .models import SubscriptionPlan, Subscription, Invoice


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = (
            "id",
            "name",
            "slug",
            "stripe_price_id",
            "amount",
            "currency",
            "interval",
            "max_users",
            "max_projects",
            "max_boards",
            "features",
            "is_active",
            "created_at",
        )


class SubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = (
            "id",
            "workspace",
            "plan",
            "status",
            "stripe_customer_id",
            "stripe_subscription_id",
            "current_period_start",
            "current_period_end",
            "cancel_at_period_end",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = (
            "id",
            "workspace",
            "subscription",
            "stripe_invoice_id",
            "amount",
            "currency",
            "status",
            "due_date",
            "paid_at",
            "created_at",
        )
        read_only_fields = fields
