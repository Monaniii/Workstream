from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"endpoints", views.WebhookEndpointViewSet, basename="webhookendpoint")
router.register(r"deliveries", views.WebhookDeliveryViewSet, basename="webhookdelivery")

urlpatterns = [path("", include(router.urls))]
