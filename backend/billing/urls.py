from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .webhook import StripeWebhookView

router = DefaultRouter()
router.register(r"plans", views.SubscriptionPlanViewSet, basename="plan")
router.register(r"subscription", views.SubscriptionViewSet, basename="subscription")
router.register(r"invoices", views.InvoiceViewSet, basename="invoice")

urlpatterns = [
    path("", include(router.urls)),
    path("webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
]
