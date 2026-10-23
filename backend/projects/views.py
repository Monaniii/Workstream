from rest_framework import viewsets, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Project, Board, Sprint
from .serializers import ProjectSerializer, BoardSerializer, SprintSerializer
from tenants.permissions import (
    TenantAccessPermission,
    IsWorkspaceMember,
    IsWorkspaceManager,
)
from tenants.entitlements import check_project_limit, check_board_limit
from audit.services import AuditService


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["workspace", "status", "priority", "archived"]
    search_fields = ["name", "key"]
    ordering_fields = ["name", "created_at", "key", "target_date", "priority"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        qs = Project.objects.filter(workspace=tenant)
        # By default, exclude archived projects unless explicitly requested
        if self.request.query_params.get("include_archived") != "true":
            qs = qs.filter(archived=False)
        return qs

    def _audit_ctx(self):
        return getattr(self.request, "audit_context", {}) or {}

    def _log_read(self, module, resource_type, resource_id, resource_name, description):
        tenant = getattr(self.request, "tenant", None)
        ctx = self._audit_ctx()
        AuditService.log_event(
            actor=self.request.user,
            workspace=tenant,
            action="read",
            module=module,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else "",
            resource_name=resource_name or "",
            description=description,
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        tenant = getattr(request, "tenant", None)
        result_count = len(response.data.get("results", [])) if isinstance(response.data, dict) else 0
        self._log_read(
            module="projects",
            resource_type="project",
            resource_id="",
            resource_name="",
            description=f"Viewed projects module ({result_count} projects)",
        )
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        data = response.data
        self._log_read(
            module="projects",
            resource_type="project",
            resource_id=data.get("id"),
            resource_name=data.get("name", ""),
            description=f"Viewed project: {data.get('key', '')} - {data.get('name', '')}",
        )
        return response

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        check_project_limit(tenant)
        project = serializer.save(
            workspace=tenant,
            created_by=self.request.user,
            owner=self.request.user,
        )
        ctx = self._audit_ctx()
        AuditService.log_event(
            actor=self.request.user,
            workspace=tenant,
            action="create",
            module="projects",
            resource_type="project",
            resource_id=project.id,
            resource_name=project.name,
            description=f"Project created: {project.key} - {project.name}",
            outcome="success",
            changed_fields={
                "status": {"from": None, "to": project.status},
                "priority": {"from": None, "to": project.priority},
            },
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        old = {
            "name": instance.name,
            "status": instance.status,
            "priority": instance.priority,
            "archived": instance.archived,
            "owner_id": instance.owner_id,
            "manager_id": instance.manager_id,
        }
        project = serializer.save()
        changes = {}
        for field in ("name", "status", "priority", "archived"):
            if old[field] != getattr(project, field):
                changes[field] = {"from": old[field], "to": getattr(project, field)}
        for field in ("owner_id", "manager_id"):
            if old[field] != getattr(project, field):
                changes[field] = {"from": old[field], "to": getattr(project, field)}
        ctx = self._audit_ctx()
        AuditService.log_event(
            actor=self.request.user,
            workspace=getattr(self.request, "tenant", None),
            action="update",
            module="projects",
            resource_type="project",
            resource_id=project.id,
            resource_name=project.name,
            description=f"Project updated: {project.key} - {project.name}",
            outcome="success",
            changed_fields=changes,
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )

    def perform_destroy(self, instance):
        name = instance.name
        key = instance.key
        pid = instance.id
        workspace = instance.workspace
        instance.delete()
        ctx = self._audit_ctx()
        AuditService.log_event(
            actor=self.request.user,
            workspace=workspace,
            action="delete",
            module="projects",
            resource_type="project",
            resource_id=pid,
            resource_name=name,
            description=f"Project deleted: {key} - {name}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        tenant = getattr(self.request, "tenant", None)
        project = get_object_or_404(
            Project.objects.filter(workspace=tenant), pk=pk
        )
        if project.archived:
            return Response(
                {"detail": "Project is already archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        project.archived = True
        project.archived_at = timezone.now()
        project.save(update_fields=["archived", "archived_at"])
        ctx = self._audit_ctx()
        AuditService.log_event(
            actor=self.request.user,
            workspace=tenant,
            action="archive",
            module="projects",
            resource_type="project",
            resource_id=project.id,
            resource_name=project.name,
            description=f"Project archived: {project.key} - {project.name}",
            outcome="success",
            changed_fields={"archived": {"from": False, "to": True}},
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )
        return Response({"detail": "Project archived."})

    @action(detail=True, methods=["post"], url_path="unarchive")
    def unarchive(self, request, pk=None):
        tenant = getattr(self.request, "tenant", None)
        project = get_object_or_404(
            Project.objects.filter(workspace=tenant), pk=pk
        )
        if not project.archived:
            return Response(
                {"detail": "Project is not archived."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        project.archived = False
        project.archived_at = None
        project.save(update_fields=["archived", "archived_at"])
        ctx = self._audit_ctx()
        AuditService.log_event(
            actor=self.request.user,
            workspace=tenant,
            action="unarchive",
            module="projects",
            resource_type="project",
            resource_id=project.id,
            resource_name=project.name,
            description=f"Project unarchived: {project.key} - {project.name}",
            outcome="success",
            changed_fields={"archived": {"from": True, "to": False}},
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )
        return Response({"detail": "Project unarchived."})


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
        check_board_limit(tenant)
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
