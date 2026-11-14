from django.db import models
from rest_framework import viewsets, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Notification, NotificationScope
from tenants.permissions import TenantAccessPermission
from .service import project_member_ids


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "workspace",
            "project",
            "scope",
            "type",
            "title",
            "message",
            "read",
            "link",
            "created_at",
        )
        read_only_fields = fields


def _project_ids_for_user(user, workspace):
    """Return project IDs within a workspace that the user is a member of."""
    from projects.models import Project
    from issues.models import Issue

    project_ids = set(
        Project.objects.filter(workspace=workspace).filter(
            models.Q(created_by=user)
            | models.Q(owner=user)
            | models.Q(manager=user)
            | models.Q(team_members=user)
        ).values_list("id", flat=True)
    )
    project_ids.update(
        Issue.objects.filter(workspace=workspace).filter(
            models.Q(assignee=user) | models.Q(reporter=user)
        ).values_list("project_id", flat=True)
    )
    project_ids.discard(None)
    return list(project_ids)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        user = self.request.user
        qs = Notification.objects.filter(workspace=tenant, user=user)

        # Project-scoped notifications: only visible if the user is a member
        # of the project.
        project_scope_qs = qs.filter(scope=NotificationScope.PROJECT).filter(
            project__in=_project_ids_for_user(user, tenant)
        )
        workspace_scope_qs = qs.filter(scope=NotificationScope.WORKSPACE)

        return (workspace_scope_qs | project_scope_qs).distinct()

    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.read = True
        notification.save(update_fields=["read"])
        return Response({"status": "read"})

    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        self.get_queryset().update(read=True)
        return Response({"status": "all read"})
