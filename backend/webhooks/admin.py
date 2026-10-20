from django.contrib import admin
from .models import WebhookEndpoint, WebhookDelivery


@admin.register(WebhookEndpoint)
class WebhookEndpointAdmin(admin.ModelAdmin):
    list_display = ["url", "workspace", "is_active"]
    list_filter = ["is_active", "workspace"]
    search_fields = ["url"]


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    list_display = ["endpoint", "event", "status_code", "created_at"]
    list_filter = ["event", "endpoint__workspace"]
    search_fields = ["endpoint__url"]
