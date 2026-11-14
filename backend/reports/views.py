import csv
import io
import logging
from datetime import datetime, timedelta

from django.db.models import Count, Q, F, Avg
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from django.utils.encoding import smart_str
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from tenants.permissions import TenantAccessPermission, IsWorkspaceManager
from tenants.models import Workspace, WorkspaceMember, MembershipRole
from projects.models import Project, Board, Sprint
from issues.models import Issue, IssueStatus, AuditLog
from notifications.models import Notification
from .models import ReportExport
from .serializers import ReportExportSerializer
from audit.services import AuditService

logger = logging.getLogger(__name__)


def _tenant(request):
    return getattr(request, "tenant", None)


def _member_role(request):
    """Return the requesting user's workspace role, or None."""
    tenant = _tenant(request)
    if not tenant:
        return None
    return (
        WorkspaceMember.objects.filter(workspace=tenant, user=request.user)
        .values_list("role", flat=True)
        .first()
    )


def _scope(request, issues_qs, projects_qs):
    """Personalise analytics by role.

    - Admins (and platform superusers) see the whole workspace.
    - Managers and members see only the projects they are on (project team,
      owner or manager) and the tasks raised in or assigned to those projects.
    - Viewers keep read-only access but are not personalised, so their
      analytics match what they are allowed to browse.

    Returns ``(issues_qs, projects_qs, scope)`` where ``scope`` describes the
    applied scope for the response payload.
    """
    user = request.user
    tenant = _tenant(request)
    role = _member_role(request)

    if role == MembershipRole.VIEWER:
        scope = {"type": "workspace", "role": role, "project_ids": None}
        return issues_qs, projects_qs, scope

    if user.is_superuser or role == MembershipRole.ADMIN:
        scope = {"type": "workspace", "role": role or "admin", "project_ids": None}
        return issues_qs, projects_qs, scope

    my_projects = projects_qs.filter(
        Q(team_members=user) | Q(owner=user) | Q(manager=user)
    ).distinct()
    project_ids = list(my_projects.values_list("id", flat=True))
    scoped_issues = issues_qs.filter(
        Q(project_id__in=project_ids) | Q(assignee=user) | Q(reporter=user)
    )
    scope = {
        "type": "personal",
        "role": role,
        "project_ids": project_ids,
        "label": "Your projects",
    }
    return scoped_issues, my_projects, scope


def _parse_date(value):
    """Parse an ISO-format date string. Returns None if invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except (ValueError, TypeError):
        return None


def _date_range_params(request):
    """Extract and validate date range from query params or a POST body."""
    params = request.data if request.method in ("POST", "PUT", "PATCH") else {}
    start = _parse_date(
        request.query_params.get("start_date") or params.get("start_date")
    )
    end = _parse_date(request.query_params.get("end_date") or params.get("end_date"))
    period = request.query_params.get("period") or params.get("period")

    today = timezone.now().date()

    if period == "today":
        start = today
        end = today
    elif period == "last_7_days":
        end = today
        start = today - timedelta(days=6)
    elif period == "last_30_days":
        end = today
        start = today - timedelta(days=29)
    elif period == "last_90_days":
        end = today
        start = today - timedelta(days=89)
    elif period == "this_month":
        start = today.replace(day=1)
        end = today
    elif period == "previous_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        start = last_prev.replace(day=1)
        end = last_prev

    if start and end and start > end:
        start, end = end, start

    return start, end


def _apply_date_filter(queryset, start, end, date_field="created_at"):
    """Apply a date range filter to a queryset."""
    if start:
        queryset = queryset.filter(**{f"{date_field}__date__gte": start})
    if end:
        queryset = queryset.filter(**{f"{date_field}__date__lte": end})
    return queryset


class ReportsViewSet(viewsets.ViewSet):
    """Read-only reporting endpoints scoped to the current tenant."""

    permission_classes = [IsAuthenticated, TenantAccessPermission]

    @action(detail=False, methods=["get"], url_path="overview")
    def overview(self, request):
        """Executive KPI summary for the current workspace."""
        tenant = _tenant(request)
        start, end = _date_range_params(request)

        projects_qs = Project.objects.filter(workspace=tenant)
        issues_qs = Issue.objects.filter(workspace=tenant)
        members_qs = WorkspaceMember.objects.filter(workspace=tenant)

        issues_qs, projects_qs, scope = _scope(request, issues_qs, projects_qs)

        total_projects = projects_qs.count()

        # Task status distribution
        status_counts = (
            issues_qs.values("status__key", "status__name", "status__is_final")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        open_tasks = issues_qs.filter(status__is_final=False).count()
        completed_tasks = issues_qs.filter(status__is_final=True).count()

        # Tasks created in period
        created_in_period = _apply_date_filter(issues_qs, start, end).count()

        # Per-project completion breakdown shown on the analytics cards
        projects_summary = []
        for p in projects_qs.only("id", "key", "name", "status"):
            p_total = issues_qs.filter(project_id=p.id).count()
            p_completed = issues_qs.filter(project_id=p.id, status__is_final=True).count()
            projects_summary.append(
                {
                    "id": p.id,
                    "key": p.key,
                    "name": p.name,
                    "status": p.status,
                    "total_tasks": p_total,
                    "completed_tasks": p_completed,
                    "completion_rate": (
                        round(p_completed / p_total * 100, 1) if p_total else 0
                    ),
                }
            )
        projects_summary.sort(key=lambda x: x["name"].lower())

        # Projects at risk: projects with open issues past a threshold
        # Since there is no due_date field, "at risk" = projects with
        # open issues where >50% of tasks are open and project has >5 tasks
        projects_at_risk = []
        for p in projects_qs:
            p_issues = issues_qs.filter(project=p)
            p_total = p_issues.count()
            p_open = p_issues.filter(status__is_final=False).count()
            if p_total >= 5 and p_open > p_total / 2:
                projects_at_risk.append(
                    {
                        "id": p.id,
                        "key": p.key,
                        "name": p.name,
                        "total_tasks": p_total,
                        "open_tasks": p_open,
                    }
                )

        # Deadlines: tasks with a real due date.
        today = timezone.localdate()
        overdue_tasks = issues_qs.filter(
            status__is_final=False, due_date__lt=today, due_date__isnull=False
        ).count()
        due_soon = issues_qs.filter(
            status__is_final=False,
            due_date__gte=today,
            due_date__lte=today + timedelta(days=7),
        ).count()
        # Legacy signal kept for the dashboard card.
        potentially_overdue = overdue_tasks

        total_tasks = issues_qs.count()
        data = {
            "workspace": {
                "id": tenant.id,
                "name": tenant.name,
                "slug": tenant.slug,
                "plan": tenant.plan,
            },
            "scope": scope,
            "period": {"start": str(start) if start else None, "end": str(end) if end else None},
            "kpis": {
                "total_projects": total_projects,
                "active_projects": total_projects,
                "total_tasks": total_tasks,
                "open_tasks": open_tasks,
                "completed_tasks": completed_tasks,
                "completion_rate": (
                    round(completed_tasks / total_tasks * 100, 1) if total_tasks else 0
                ),
                "potentially_overdue_tasks": potentially_overdue,
                "overdue_tasks": overdue_tasks,
                "due_soon_tasks": due_soon,
                "tasks_created_in_period": created_in_period,
                "projects_at_risk_count": len(projects_at_risk),
                "total_members": members_qs.count(),
            },
            "projects_at_risk": projects_at_risk,
            "projects_summary": projects_summary,
            "status_distribution": list(status_counts),
        }
        return Response(data)

    @action(detail=False, methods=["get"], url_path="projects")
    def projects(self, request):
        """Project-level performance breakdown."""
        tenant = _tenant(request)
        start, end = _date_range_params(request)

        issues_qs = Issue.objects.filter(workspace=tenant)
        projects_qs = Project.objects.filter(workspace=tenant)
        issues_qs, projects_qs, scope = _scope(request, issues_qs, projects_qs)

        results = []
        for p in projects_qs.select_related("created_by"):
            p_issues = issues_qs.filter(project=p)
            total = p_issues.count()
            completed = p_issues.filter(status__is_final=True).count()
            open_count = p_issues.filter(status__is_final=False).count()
            completion_rate = (completed / total * 100) if total > 0 else 0

            # Priority distribution for this project
            priority_dist = (
                p_issues.values("priority")
                .annotate(count=Count("id"))
                .order_by("-count")
            )

            results.append(
                {
                    "id": p.id,
                    "key": p.key,
                    "name": p.name,
                    "description": p.description,
                    "total_tasks": total,
                    "open_tasks": open_count,
                    "completed_tasks": completed,
                    "completion_rate": round(completion_rate, 1),
                    "priority_distribution": list(priority_dist),
                }
            )

        results.sort(key=lambda x: x["total_tasks"], reverse=True)
        return Response(
            {"workspace": tenant.id, "scope": scope, "projects": results}
        )

    @action(detail=False, methods=["get"], url_path="tasks")
    def tasks(self, request):
        """Task analytics: distribution by status, priority, assignee, project."""
        tenant = _tenant(request)
        start, end = _date_range_params(request)

        scoped_issues, _, scope = _scope(
            request, Issue.objects.filter(workspace=tenant), Project.objects.none()
        )
        issues_qs = _apply_date_filter(scoped_issues, start, end)

        # By status
        by_status = (
            issues_qs.values("status__key", "status__name", "status__is_final")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # By priority
        by_priority = (
            issues_qs.values("priority")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # By issue type
        by_type = (
            issues_qs.values("issue_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # By project
        by_project = (
            issues_qs.values("project__key", "project__name")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # By assignee
        by_assignee = (
            issues_qs.exclude(assignee__isnull=True)
            .values("assignee", "assignee__email", "assignee__username")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # Daily creation trend
        daily = (
            issues_qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )

        return Response(
            {
                "workspace": tenant.id,
                "scope": scope,
                "period": {"start": str(start) if start else None, "end": str(end) if end else None},
                "total": issues_qs.count(),
                "by_status": list(by_status),
                "by_priority": list(by_priority),
                "by_type": list(by_type),
                "by_project": list(by_project),
                "by_assignee": list(by_assignee),
                "daily_creation": list(daily),
            }
        )

    @action(detail=False, methods=["get"], url_path="team")
    def team(self, request):
        """Team workload distribution per workspace member."""
        tenant = _tenant(request)
        start, end = _date_range_params(request)

        scoped_issues, _, scope = _scope(
            request, Issue.objects.filter(workspace=tenant), Project.objects.none()
        )
        issues_qs = _apply_date_filter(scoped_issues, start, end)

        members = (
            WorkspaceMember.objects.filter(workspace=tenant)
            .select_related("user")
            .order_by("user__email")
        )

        results = []
        for m in members:
            member_issues = issues_qs.filter(assignee=m.user)
            total = member_issues.count()
            completed = member_issues.filter(status__is_final=True).count()
            open_count = member_issues.filter(status__is_final=False).count()
            results.append(
                {
                    "id": m.id,
                    "user_id": m.user.id,
                    "email": m.user.email,
                    "username": m.user.username,
                    "role": m.role,
                    "total_tasks": total,
                    "open_tasks": open_count,
                    "completed_tasks": completed,
                    "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
                }
            )

        return Response(
            {
                "workspace": tenant.id,
                "scope": scope,
                "period": {"start": str(start) if start else None, "end": str(end) if end else None},
                "members": results,
                "total_members": len(results),
            }
        )

    @action(detail=False, methods=["get"], url_path="activity")
    def activity(self, request):
        """Activity and audit events for the workspace."""
        tenant = _tenant(request)
        start, end = _date_range_params(request)

        logs_qs = AuditLog.objects.filter(workspace=tenant)
        role = _member_role(request)
        personal = not request.user.is_superuser and role not in (
            MembershipRole.ADMIN,
            MembershipRole.VIEWER,
        )
        if personal:
            # Managers and members only see activity on their own projects.
            logs_qs = logs_qs.filter(actor=request.user)
        logs_qs = _apply_date_filter(logs_qs, start, end, date_field="created_at")

        # By action type
        by_action = (
            logs_qs.values("action")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # By target type
        by_target = (
            logs_qs.values("target_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # By actor
        by_actor = (
            logs_qs.exclude(actor__isnull=True)
            .values("actor", "actor__email", "actor__username")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # Recent events
        recent = (
            logs_qs.select_related("actor")
            .order_by("-created_at")[:50]
        )
        recent_events = [
            {
                "id": l.id,
                "action": l.action,
                "target_type": l.target_type,
                "target_id": l.target_id,
                "actor_email": l.actor.email if l.actor else None,
                "created_at": l.created_at,
                "changes": l.changes,
            }
            for l in recent
        ]

        return Response(
            {
                "workspace": tenant.id,
                "scope": {
                    "type": "personal" if personal else "workspace",
                    "role": role,
                },
                "period": {"start": str(start) if start else None, "end": str(end) if end else None},
                "total_events": logs_qs.count(),
                "by_action": list(by_action),
                "by_target": list(by_target),
                "by_actor": list(by_actor),
                "recent_events": recent_events,
            }
        )

    @action(detail=False, methods=["post"], url_path="export/csv")
    def export_csv(self, request):
        """Export filtered report data as CSV."""
        tenant = _tenant(request)
        report_type = request.data.get("report_type", "overview")
        start, end = _date_range_params(request)

        filename = f"workstream_{report_type}_report.csv"
        buffer = io.StringIO()
        writer = csv.writer(buffer)

        if report_type == "overview":
            writer.writerow(["Metric", "Value"])
            resp = self.overview(request)
            data = resp.data
            kpis = data.get("kpis", {})
            for key, val in kpis.items():
                writer.writerow([key.replace("_", " ").title(), val])
            writer.writerow([])
            writer.writerow(["Projects At Risk", ""])
            for p in data.get("projects_at_risk", []):
                writer.writerow([p["key"], p["name"], p["open_tasks"], p["total_tasks"]])

        elif report_type == "tasks":
            writer.writerow(["Key", "Project", "Status", "Priority", "Type", "Assignee", "Created"])
            resp = self.tasks(request)
            # Re-query to get full issue objects for CSV (same role scoping)
            scoped_issues, _, _ = _scope(
                request, Issue.objects.filter(workspace=tenant), Project.objects.none()
            )
            issues_qs = _apply_date_filter(
                scoped_issues.select_related("project", "status", "assignee"),
                start,
                end,
            )
            for issue in issues_qs:
                writer.writerow(
                    [
                        issue.key,
                        issue.project.key,
                        issue.status.name,
                        issue.priority,
                        issue.issue_type,
                        issue.assignee.email if issue.assignee else "",
                        issue.created_at.isoformat(),
                    ]
                )

        elif report_type == "team":
            writer.writerow(["Email", "Role", "Total Tasks", "Open", "Completed", "Completion Rate"])
            resp = self.team(request)
            for m in resp.data.get("members", []):
                writer.writerow(
                    [
                        m["email"],
                        m["role"],
                        m["total_tasks"],
                        m["open_tasks"],
                        m["completed_tasks"],
                        m["completion_rate"],
                    ]
                )

        elif report_type == "activity":
            writer.writerow(["Action", "Target Type", "Target ID", "Actor", "Created At"])
            resp = self.activity(request)
            for e in resp.data.get("recent_events", []):
                writer.writerow(
                    [
                        e["action"],
                        e["target_type"],
                        e["target_id"],
                        e["actor_email"] or "",
                        e["created_at"],
                    ]
                )

        else:
            return Response(
                {"error": f"Unknown report type: {report_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Record the export
        try:
            ReportExport.objects.create(
                workspace=tenant,
                requested_by=request.user,
                report_type=report_type,
                format="csv",
                filters={
                    "start_date": str(start) if start else None,
                    "end_date": str(end) if end else None,
                },
                record_count=0,
                status="completed",
                completed_at=timezone.now(),
            )
        except Exception:
            logger.exception("Failed to record report export")

        try:
            AuditService.log_security_event(
                actor=request.user,
                workspace=tenant,
                action="export",
                module="reports",
                resource_type="report_export",
                resource_id="",
                description=f"Report export: {report_type}",
                outcome="success",
                request_id=getattr(request, "audit_context", {}).get("request_id", ""),
                http_method=request.method,
                route=getattr(request, "audit_context", {}).get("route", ""),
                ip_address=getattr(request, "audit_context", {}).get("ip_address"),
                user_agent=getattr(request, "audit_context", {}).get("user_agent", ""),
                metadata={
                    "report_type": report_type,
                    "format": "csv",
                    "start_date": str(start) if start else None,
                    "end_date": str(end) if end else None,
                },
            )
        except Exception:
            logger.exception("Failed to record audit event for report export")

        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ReportExportViewSet(viewsets.ReadOnlyModelViewSet):
    """List a workspace's report export history."""

    serializer_class = ReportExportSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceManager]

    def get_queryset(self):
        tenant = _tenant(self.request)
        return ReportExport.objects.filter(workspace=tenant)


class ProjectAnalyticsView(viewsets.ViewSet):
    """Per-project analytics for the project detail page.

    Managers and members are limited to projects they are part of; admins keep
    visibility of every project in the workspace.
    """

    permission_classes = [IsAuthenticated, TenantAccessPermission]

    def list(self, request):
        tenant = _tenant(request)
        project_id = request.query_params.get("project")
        if not project_id:
            return Response(
                {"detail": "A project id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = get_object_or_404(
            Project.objects.filter(workspace=tenant).select_related("owner", "manager"),
            pk=project_id,
        )
        _, scoped_projects, scope = _scope(
            request, Issue.objects.filter(workspace=tenant), Project.objects.filter(workspace=tenant)
        )
        if not request.user.is_superuser and _member_role(request) != MembershipRole.ADMIN:
            if not scoped_projects.filter(pk=project.id).exists():
                return Response(
                    {"detail": "You do not have access to this project's analytics."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        issues_qs = Issue.objects.filter(workspace=tenant, project=project)
        total = issues_qs.count()
        completed = issues_qs.filter(status__is_final=True).count()
        open_tasks = issues_qs.filter(status__is_final=False).count()

        by_status = list(
            issues_qs.values("status__key", "status__name", "status__is_final")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        by_priority = list(
            issues_qs.values("priority").annotate(count=Count("id")).order_by("-count")
        )
        by_assignee = list(
            issues_qs.exclude(assignee__isnull=True)
            .values("assignee", "assignee__email")
            .annotate(count=Count("id"), completed=Count("id", filter=Q(status__is_final=True)))
            .order_by("-count")
        )
        for row in by_assignee:
            row["completion_rate"] = (
                round(row["completed"] / row["count"] * 100, 1) if row["count"] else 0
            )

        my_tasks = issues_qs.filter(assignee=request.user)
        my_total = my_tasks.count()
        my_completed = my_tasks.filter(status__is_final=True).count()

        return Response(
            {
                "project": {
                    "id": project.id,
                    "key": project.key,
                    "name": project.name,
                    "status": project.status,
                    "owner_email": project.owner.email if project.owner else None,
                    "manager_email": project.manager.email if project.manager else None,
                },
                "scope": scope,
                "is_member": project.team_members.filter(id=request.user.id).exists(),
                "kpis": {
                    "total_tasks": total,
                    "open_tasks": open_tasks,
                    "completed_tasks": completed,
                    "completion_rate": round(completed / total * 100, 1) if total else 0,
                    "my_tasks": my_total,
                    "my_completed_tasks": my_completed,
                    "my_completion_rate": round(my_completed / my_total * 100, 1) if my_total else 0,
                },
                "by_status": by_status,
                "by_priority": by_priority,
                "by_assignee": by_assignee,
            }
        )
