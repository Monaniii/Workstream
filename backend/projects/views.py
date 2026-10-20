from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Project, Board, Sprint
from .serializers import ProjectSerializer, BoardSerializer, SprintSerializer
from tenants.permissions import (
    TenantAccessPermission,
    IsWorkspaceMember,
)


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["workspace"]
    search_fields = ["name", "key"]
    ordering_fields = ["name", "created_at", "key"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return Project.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        serializer.save(workspace=tenant, created_by=self.request.user)


class BoardViewSet(viewsets.ModelViewSet):
    serializer_class = BoardSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["workspace", "project"]
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return Board.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        serializer.save(workspace=tenant)


class SprintViewSet(viewsets.ModelViewSet):
    serializer_class = SprintSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["workspace", "board", "status"]
    search_fields = ["name", "goal"]
    ordering_fields = ["name", "start_date", "end_date", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return Sprint.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        serializer.save(workspace=tenant)
