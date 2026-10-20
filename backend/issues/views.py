from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
from .models import (
    Issue,
    IssueStatus,
    IssueComment,
    IssueAttachment,
    AuditLog,
)
from .serializers import (
    IssueSerializer,
    IssueCommentSerializer,
    IssueAttachmentSerializer,
    AuditLogSerializer,
    IssueStatusSerializer,
)
from tenants.permissions import (
    TenantAccessPermission,
    IsWorkspaceManager,
    IsWorkspaceMember,
)


def _audit(request, workspace, action, target_type, target_id, changes=None):
    AuditLog.objects.create(
        workspace=workspace,
        actor=request.user if request.user.is_authenticated else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        changes=changes or {},
    )


class IssueViewSet(viewsets.ModelViewSet):
    serializer_class = IssueSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = [
        "workspace",
        "project",
        "board",
        "sprint",
        "status",
        "priority",
        "issue_type",
        "assignee",
    ]
    search_fields = ["key", "summary", "description"]
    ordering_fields = ["key", "created_at", "updated_at", "position"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return Issue.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        project = serializer.validated_data.get("project")
        if project.workspace_id != tenant.id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Project does not belong to this workspace.")
        last = (
            Issue.objects.filter(workspace=tenant, project=project)
            .order_by("-id")
            .first()
        )
        next_num = (last.id + 1) if last else 0
        issue = serializer.save(
            workspace=tenant,
            reporter=self.request.user,
            key=f"{project.key}-{next_num + 1}",
        )
        _audit(
            self.request,
            tenant,
            "create",
            "issue",
            issue.id,
            {"key": issue.key, "summary": issue.summary},
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        tenant = getattr(self.request, "tenant", None)
        old_status = instance.status_id
        old_assignee = instance.assignee_id
        old_column = instance.column_id
        old_position = instance.position
        issue = serializer.save()
        changes = {}
        if old_status != issue.status_id:
            changes["status"] = {"from": old_status, "to": issue.status_id}
        if old_assignee != issue.assignee_id:
            changes["assignee"] = {"from": old_assignee, "to": issue.assignee_id}
        if old_column != issue.column_id:
            changes["column"] = {"from": old_column, "to": issue.column_id}
        if old_position != issue.position:
            changes["position"] = {"from": old_position, "to": issue.position}
        if changes:
            _audit(self.request, tenant, "update", "issue", issue.id, changes)

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request, pk=None):
        issue = self.get_object()
        tenant = getattr(request, "tenant", None)
        column_id = request.data.get("column_id", issue.column_id)
        position = request.data.get("position", issue.position)
        old_column = issue.column_id
        old_position = issue.position
        issue.column_id = column_id
        issue.position = position
        issue.save(update_fields=["column_id", "position", "updated_at"])
        _audit(
            request,
            tenant,
            "move",
            "issue",
            issue.id,
            {
                "column": {"from": old_column, "to": column_id},
                "position": {"from": old_position, "to": position},
            },
        )
        return Response(self.get_serializer(issue).data)

    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, pk=None):
        issue = self.get_object()
        tenant = getattr(request, "tenant", None)
        status_id = request.data.get("status_id")
        if not status_id:
            return Response(
                {"error": "status_id required"}, status=status.HTTP_400_BAD_REQUEST
            )
        new_status = get_object_or_404(IssueStatus, id=status_id, workspace=tenant)
        old_status = issue.status
        issue.status = new_status
        issue.save(update_fields=["status", "updated_at"])
        _audit(
            request,
            tenant,
            "transition",
            "issue",
            issue.id,
            {"status": {"from": old_status.key, "to": new_status.key}},
        )
        return Response(self.get_serializer(issue).data)


class IssueCommentViewSet(viewsets.ModelViewSet):
    serializer_class = IssueCommentSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["issue"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return IssueComment.objects.filter(issue__workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        issue = serializer.validated_data["issue"]
        if issue.workspace_id != tenant.id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Issue does not belong to this workspace.")
        comment = serializer.save(author=self.request.user)
        _audit(
            self.request,
            tenant,
            "comment",
            "issue",
            issue.id,
            {"comment_id": comment.id},
        )


class IssueAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = IssueAttachmentSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceMember]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["issue"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return IssueAttachment.objects.filter(issue__workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        issue = serializer.validated_data["issue"]
        if issue.workspace_id != tenant.id:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Issue does not belong to this workspace.")
        f = serializer.validated_data["file"]
        serializer.save(
            uploaded_by=self.request.user,
            filename=f.name,
            content_type=getattr(f, "content_type", "") or "",
            size=f.size,
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceManager]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["workspace", "action", "target_type"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return AuditLog.objects.filter(workspace=tenant)


class IssueStatusViewSet(viewsets.ModelViewSet):
    serializer_class = IssueStatusSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceManager]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["workspace"]
    ordering_fields = ["position", "name"]
    ordering = ["position"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return IssueStatus.objects.filter(workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        serializer.save(workspace=tenant)
