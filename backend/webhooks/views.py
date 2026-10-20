from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import WebhookEndpoint, WebhookDelivery
from .serializers import WebhookEndpointSerializer, WebhookDeliverySerializer
from tenants.permissions import TenantAccessPermission, IsWorkspaceManager


class WebhookEndpointViewSet(viewsets.ModelViewSet):
    serializer_class = WebhookEndpointSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceManager]
    filterset_fields = ["workspace", "is_active"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return WebhookEndpoint.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        serializer.save(workspace=tenant)


class WebhookDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WebhookDeliverySerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceManager]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        endpoint_id = self.request.query_params.get("endpoint")
        qs = WebhookDelivery.objects.filter(endpoint__workspace=tenant)
        if endpoint_id:
            qs = qs.filter(endpoint_id=endpoint_id)
        return qs
