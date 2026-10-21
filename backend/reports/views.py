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

logger = logging.getLogger(__name__)


def _tenant(request):
    return getattr(request, "tenant", None)


def _parse_date(value):
    """Parse an ISO-format date string. Returns None if invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except (ValueError, TypeError):
        return None


def _date_range_params(request):
    """Extract and validate date range from query params."""
    start = _parse_date(request.query_params.get("start_date"))
    end = _parse_date(request.query_params.get("end_date"))
    period = request.query_params.get("period")

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

        # Overdue tasks - NOTE: Issue model has no due_date field.
        # We report open tasks as "potentially overdue" only if they were
        # created more than 30 days ago and remain open.
        potentially_overdue = issues_qs.filter(
            status__is_final=False,
            created_at__date__lte=timezone.now().date() - timedelta(days=30),
        ).count()

        data = {
            "workspace": {
                "id": tenant.id,
                "name": tenant.name,
                "slug": tenant.slug,
                "plan": tenant.plan,
            },
            "period": {"start": str(start) if start else None, "end": str(end) if end else None},
            "kpis": {
                "total_projects": total_projects,
                "active_projects": total_projects,
                "total_tasks": issues_qs.count(),
                "open_tasks": open_tasks,
                "completed_tasks": completed_tasks,
                "potentially_overdue_tasks": potentially_overdue,
                "tasks_created_in_period": created_in_period,
                "projects_at_risk_count": len(projects_at_risk),
                "total_members": members_qs.count(),
            },
            "projects_at_risk": projects_at_risk,
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
        return Response({"workspace": tenant.id, "projects": results})

    @action(detail=False, methods=["get"], url_path="tasks")
    def tasks(self, request):
        """Task analytics: distribution by status, priority, assignee, project."""
        tenant = _tenant(request)
        start, end = _date_range_params(request)

        issues_qs = _apply_date_filter(
            Issue.objects.filter(workspace=tenant), start, end
        )

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

        issues_qs = _apply_date_filter(
            Issue.objects.filter(workspace=tenant), start, end
        )

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

        logs_qs = _apply_date_filter(
            AuditLog.objects.filter(workspace=tenant), start, end, date_field="created_at"
        )

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
            # Re-query to get full issue objects for CSV
            issues_qs = _apply_date_filter(
                Issue.objects.filter(workspace=tenant).select_related(
                    "project", "status", "assignee"
                ),
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
