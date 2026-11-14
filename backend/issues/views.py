import re
from datetime import timedelta

from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from projects.models import Board
from tenants.models import WorkspaceMember
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
from .permissions import IsProjectTeamMember, is_project_team_member
from tenants.permissions import (
    TenantAccessPermission,
    IsWorkspaceManager,
    IsWorkspaceMember,
)
from audit.services import AuditService
from notifications.models import Notification, NotificationScope, NotificationType
from notifications.service import notify_project_members, project_member_ids


def _audit_ctx(request):
    return getattr(request, "audit_context", {}) or {}


def _actor_info(request):
    user = request.user if request.user.is_authenticated else None
    return {
        "actor": user,
        "actor_name": (getattr(user, "get_full_name", lambda: user.email)() or user.email) if user else "",
        "actor_email": getattr(user, "email", "") if user else "",
    }


def _column_id_for_status(issue, issue_status, tenant):
    board = issue.board or (
        Board.objects.filter(workspace=tenant, project=issue.project)
        .order_by("id")
        .first()
    )
    if not board:
        return issue.column_id
    for column in board.columns or []:
        if not isinstance(column, dict):
            continue
        if (
            str(column.get("id")) == issue_status.key
            or str(column.get("name") or "").casefold()
            == issue_status.name.casefold()
        ):
            return str(column.get("id"))
    return issue.column_id


class IssueViewSet(viewsets.ModelViewSet):
    serializer_class = IssueSerializer
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        IsWorkspaceMember,
        IsProjectTeamMember,
    ]
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
        "due_date",
        "parent_issue",
        "blocked_by",
    ]
    search_fields = ["key", "summary", "description"]
    ordering_fields = ["key", "created_at", "updated_at", "position", "due_date"]
    ordering = ["-created_at"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return (
            Issue.objects.filter(workspace=tenant)
            .annotate(annotated_comment_count=Count("comments", distinct=True))
            .prefetch_related("subtasks", "blocked_by")
        )

    @action(detail=False, methods=["get"], url_path="my-work")
    def my_work(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(
            assignee=request.user
        )
        bucket = request.query_params.get("bucket", "all")
        today = timezone.localdate()
        if bucket == "open":
            queryset = queryset.filter(status__is_final=False)
        elif bucket == "overdue":
            queryset = queryset.filter(
                status__is_final=False, due_date__lt=today
            )
        elif bucket == "due_soon":
            queryset = queryset.filter(
                status__is_final=False,
                due_date__gte=today,
                due_date__lte=today + timedelta(days=7),
            )
        elif bucket == "completed":
            queryset = queryset.filter(status__is_final=True)
        elif bucket != "all":
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"bucket": "Choose all, open, overdue, due_soon, or completed."}
            )
        queryset = queryset.order_by("due_date", "-priority", "-updated_at")
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(self.get_serializer(queryset, many=True).data)

    def _log_read(self, module, resource_type, resource_id, resource_name, description):
        tenant = getattr(self.request, "tenant", None)
        info = _actor_info(self.request)
        ctx = _audit_ctx(self.request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="read",
            module=module,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else "",
            resource_name=resource_name or "",
            description=description,
            outcome="success",
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
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
            module="issues",
            resource_type="issue",
            resource_id="",
            resource_name="",
            description=f"Viewed issues module ({result_count} issues)",
        )
        return response

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        data = response.data
        self._log_read(
            module="issues",
            resource_type="issue",
            resource_id=data.get("id"),
            resource_name=data.get("key", "") or data.get("summary", ""),
            description=f"Viewed issue: {data.get('key', '')} - {data.get('summary', '')}",
        )
        return response

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        project = serializer.validated_data.get("project")
        if project.workspace_id != tenant.id:
            raise PermissionDenied("Project does not belong to this workspace.")
        if not is_project_team_member(self.request.user, project):
            raise PermissionDenied("Only project team members can modify issues.")
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
        info = _actor_info(self.request)
        ctx = _audit_ctx(self.request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="create",
            module="issues",
            resource_type="issue",
            resource_id=issue.id,
            resource_name=issue.summary,
            description=f"Issue created: {issue.key} - {issue.summary}",
            outcome="success",
            changed_fields={
                "key": {"from": None, "to": issue.key},
                "summary": {"from": None, "to": issue.summary},
                "status": {"from": None, "to": issue.status_id},
                "priority": {"from": None, "to": issue.priority},
                "assignee": {"from": None, "to": issue.assignee_id},
            },
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )
        notify_project_members(
            project,
            type=NotificationType.ISSUE_ASSIGNED,
            title=f"New issue: {issue.key}",
            message=f"{issue.summary} created by {self.request.user.email} in {project.key}.",
            link=f"/app/projects/{project.id}/board?issue={issue.id}",
            exclude_user_id=self.request.user.id,
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        project = serializer.validated_data.get("project")
        if project and not is_project_team_member(self.request.user, project):
            raise PermissionDenied("Only project team members can modify issues.")
        tenant = getattr(self.request, "tenant", None)
        old_status = instance.status_id
        old_assignee = instance.assignee_id
        old_column = instance.column_id
        old_position = instance.position
        new_status = serializer.validated_data.get("status")
        save_kwargs = {}
        if new_status and new_status.id != old_status:
            column_id = _column_id_for_status(instance, new_status, tenant)
            if column_id != instance.column_id:
                save_kwargs["column_id"] = column_id
        issue = serializer.save(**save_kwargs)
        project = issue.project
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
            info = _actor_info(self.request)
            ctx = _audit_ctx(self.request)
            AuditService.log_event(
                actor=info["actor"],
                workspace=tenant,
                action="update",
                module="issues",
                resource_type="issue",
                resource_id=issue.id,
                resource_name=issue.summary,
                description=f"Issue updated: {issue.key} - {issue.summary}",
                outcome="success",
                changed_fields=changes,
                actor_name=info["actor_name"],
                actor_email=info["actor_email"],
                request_id=ctx.get("request_id", ""),
                http_method=self.request.method,
                route=ctx.get("route", ""),
                ip_address=ctx.get("ip_address"),
                user_agent=ctx.get("user_agent", ""),
                session_key=getattr(self.request.session, "session_key", "") or "",
            )
        # Notify project members of assignee or status changes.
        if old_assignee != issue.assignee_id and issue.assignee_id:
            notify_project_members(
                project,
                type=NotificationType.ISSUE_ASSIGNED,
                title=f"Issue assigned: {issue.key}",
                message=f"{issue.key} assigned to {issue.assignee.email} by {self.request.user.email}.",
                link=f"/app/projects/{project.id}/board?issue={issue.id}",
                exclude_user_id=self.request.user.id,
            )
        elif old_status != issue.status_id:
            notify_project_members(
                project,
                type=NotificationType.ISSUE_TRANSITIONED,
                title=f"Issue transitioned: {issue.key}",
                message=f"{issue.key} status changed by {self.request.user.email}.",
                link=f"/app/projects/{project.id}/board?issue={issue.id}",
                exclude_user_id=self.request.user.id,
            )

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        # Close a task by moving it to a final status (falls back to the first).
        issue = self.get_object()
        tenant = getattr(request, "tenant", None)
        final_status = (
            IssueStatus.objects.filter(workspace=tenant, is_final=True)
            .order_by("position")
            .first()
        )
        if not final_status:
            return Response(
                {"detail": "This workspace has no final status configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._set_closed_state(issue, closed=True, final_status=final_status)

    @action(detail=True, methods=["post"], url_path="reopen")
    def reopen(self, request, pk=None):
        # Reopen a closed task by moving it back to the initial status.
        issue = self.get_object()
        tenant = getattr(request, "tenant", None)
        initial_status = (
            IssueStatus.objects.filter(workspace=tenant, is_initial=True)
            .order_by("position")
            .first()
            or IssueStatus.objects.filter(workspace=tenant, is_final=False)
            .order_by("position")
            .first()
        )
        if not initial_status:
            return Response(
                {"detail": "This workspace has no open status configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._set_closed_state(issue, closed=False, final_status=initial_status)

    def _set_closed_state(self, issue, closed, final_status):
        request = self.request
        tenant = getattr(request, "tenant", None)
        if closed and issue.status.is_final:
            return Response(
                {"detail": "This task is already closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not closed and not issue.status.is_final:
            return Response(
                {"detail": "This task is not closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = issue.status
        issue.status = final_status
        # Keep the Kanban column consistent with the new status.
        issue.column_id = _column_id_for_status(issue, final_status, tenant)
        issue.save()

        info = _actor_info(request)
        ctx = _audit_ctx(request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="close" if closed else "reopen",
            module="issues",
            resource_type="issue",
            resource_id=issue.id,
            resource_name=issue.summary,
            description=(
                f"Issue {'closed' if closed else 'reopened'}: "
                f"{issue.key} - {issue.summary}"
            ),
            outcome="success",
            changed_fields={
                "status": {"from": old_status.key, "to": final_status.key}
            },
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )
        return Response(self.get_serializer(issue).data)

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
        issue.save(update_fields=["column_id", "position", "closed_at", "updated_at"])
        info = _actor_info(request)
        ctx = _audit_ctx(request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="update",
            module="issues",
            resource_type="issue",
            resource_id=issue.id,
            resource_name=issue.summary,
            description=f"Issue moved: {issue.key} - {issue.summary}",
            outcome="success",
            changed_fields={
                "column": {"from": old_column, "to": column_id},
                "position": {"from": old_position, "to": position},
            },
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
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
        issue.column_id = _column_id_for_status(issue, new_status, tenant)
        # `closed_at` must be included: save() keeps it in sync with the status,
        # and update_fields would otherwise silently drop that change.
        issue.save(
            update_fields=["status", "column_id", "closed_at", "updated_at"]
        )
        info = _actor_info(request)
        ctx = _audit_ctx(request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="transition",
            module="issues",
            resource_type="issue",
            resource_id=issue.id,
            resource_name=issue.summary,
            description=f"Issue transitioned: {issue.key} - {issue.summary}",
            outcome="success",
            changed_fields={
                "status": {"from": old_status.key, "to": new_status.key}
            },
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )
        notify_project_members(
            issue.project,
            type=NotificationType.ISSUE_TRANSITIONED,
            title=f"Issue transitioned: {issue.key}",
            message=f"{issue.key} status changed to {new_status.key} by {request.user.email}.",
            link=f"/app/projects/{issue.project.id}/board?issue={issue.id}",
            exclude_user_id=request.user.id,
        )
        return Response(self.get_serializer(issue).data)


class IssueCommentViewSet(viewsets.ModelViewSet):
    serializer_class = IssueCommentSerializer
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        IsWorkspaceMember,
        IsProjectTeamMember,
    ]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["issue"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return IssueComment.objects.filter(issue__workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        issue = serializer.validated_data["issue"]
        if issue.workspace_id != tenant.id:
            raise PermissionDenied("Issue does not belong to this workspace.")
        if not is_project_team_member(self.request.user, issue.project):
            raise PermissionDenied("Only project team members can modify issues.")
        comment = serializer.save(author=self.request.user)
        info = _actor_info(self.request)
        ctx = _audit_ctx(self.request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="comment",
            module="issues",
            resource_type="issue",
            resource_id=issue.id,
            resource_name=issue.summary,
            description=f"Comment added on {issue.key}",
            outcome="success",
            changed_fields={"comment": {"from": None, "to": comment.id}},
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )
        notify_project_members(
            issue.project,
            type=NotificationType.ISSUE_COMMENTED,
            title=f"New comment on {issue.key}",
            message=f"{self.request.user.email} commented on {issue.key}.",
            link=f"/app/projects/{issue.project.id}/board?issue={issue.id}",
            exclude_user_id=self.request.user.id,
        )
        mentioned_emails = {
            email.casefold()
            for email in re.findall(
                r"(?<![\w.+-])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})",
                comment.body,
            )[:50]
        }
        project_user_ids = set(project_member_ids(issue.project))
        mentioned_members = WorkspaceMember.objects.filter(
            workspace=tenant,
            user_id__in=project_user_ids,
        ).select_related("user")
        for member in mentioned_members:
            if member.user_id == self.request.user.id:
                continue
            if member.user.email.casefold() not in mentioned_emails:
                continue
            Notification.objects.create(
                workspace=tenant,
                project=issue.project,
                scope=NotificationScope.PROJECT,
                user=member.user,
                type=NotificationType.ISSUE_COMMENTED,
                title=f"You were mentioned on {issue.key}",
                message=f"{self.request.user.email} mentioned you in a comment on {issue.key}.",
                link=f"/app/projects/{issue.project.id}/board?issue={issue.id}",
            )


class IssueAttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = IssueAttachmentSerializer
    permission_classes = [
        IsAuthenticated,
        TenantAccessPermission,
        IsWorkspaceMember,
        IsProjectTeamMember,
    ]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["issue"]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return IssueAttachment.objects.filter(issue__workspace=tenant)

    def perform_create(self, serializer):
        tenant = getattr(self.request, "tenant", None)
        issue = serializer.validated_data["issue"]
        if issue.workspace_id != tenant.id:
            raise PermissionDenied("Issue does not belong to this workspace.")
        if not is_project_team_member(self.request.user, issue.project):
            raise PermissionDenied("Only project team members can modify issues.")
        f = serializer.validated_data["file"]
        attachment = serializer.save(
            uploaded_by=self.request.user,
            filename=f.name,
            content_type=getattr(f, "content_type", "") or "",
            size=f.size,
        )
        info = _actor_info(self.request)
        ctx = _audit_ctx(self.request)
        AuditService.log_event(
            actor=info["actor"],
            workspace=tenant,
            action="attachment_add",
            module="issues",
            resource_type="issue",
            resource_id=issue.id,
            resource_name=issue.summary,
            description=f"Attachment uploaded: {attachment.filename}",
            outcome="success",
            changed_fields={
                "attachment": {
                    "from": None,
                    "to": {"filename": attachment.filename, "size": attachment.size},
                }
            },
            actor_name=info["actor_name"],
            actor_email=info["actor_email"],
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
            metadata={"content_type": attachment.content_type},
        )
        notify_project_members(
            issue.project,
            type=NotificationType.ISSUE_COMMENTED,
            title=f"New attachment on {issue.key}",
            message=f"{self.request.user.email} uploaded {attachment.filename} to {issue.key}.",
            link=f"/app/projects/{issue.project.id}/board?issue={issue.id}",
            exclude_user_id=self.request.user.id,
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
