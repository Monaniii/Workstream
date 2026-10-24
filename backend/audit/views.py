import csv
import io

import datetime

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import AuditEvent
from .serializers import AuditEventSerializer
from .permissions import IsAuditAdministrator
from tenants.models import WorkspaceMember, MembershipRole


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only audit event list/detail for authorized administrators.

    Superusers see platform-wide events. Tenant workspace administrators see
    only events within their own workspace.
    """

    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated, IsAuditAdministrator]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["action", "module", "outcome", "resource_type", "workspace"]
    search_fields = [
        "description",
        "actor_name",
        "actor_email",
        "resource_name",
        "request_id",
    ]
    ordering_fields = ["timestamp", "created_at"]
    ordering = ["-timestamp", "-created_at"]

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # Record that the audit log itself was accessed (security-relevant).
        # Writing here cannot recurse: AuditService writes to AuditEvent, not
        # to this endpoint, and middleware performs no auto-auditing.
        try:
            ctx = getattr(request, "audit_context", {}) or {}
            workspace = getattr(request, "tenant", None)
            user = request.user if request.user.is_authenticated else None
            AuditService.log_event(
                actor=user,
                workspace=workspace,
                action="audit_access",
                module="audit",
                resource_type="audit_event",
                resource_id="",
                description="Audit log accessed (list)",
                outcome="success",
                request_id=ctx.get("request_id", ""),
                http_method=request.method,
                route=ctx.get("route", ""),
                ip_address=ctx.get("ip_address"),
                user_agent=ctx.get("user_agent", ""),
                metadata={"returned_count": len(response.data.get("results", []))},
            )
        except Exception:
            # Audit-access logging must never break the audit response.
            pass
        return response

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(self.request, "tenant", None)
        # Audit events are only ever served inside the active workspace. Even
        # superusers read through the tenant header, so this module can never
        # become a cross-workspace data leak.
        if not tenant:
            return AuditEvent.objects.none()
        qs = AuditEvent.objects.filter(workspace=tenant)
        if getattr(user, "is_superuser", False):
            pass  # superuser may see every event in this workspace
        elif WorkspaceMember.objects.filter(
            user=user, workspace=tenant, role=MembershipRole.ADMIN
        ).exists():
            pass  # workspace admin: everything in their workspace
        else:
            return AuditEvent.objects.none()

        start = self.request.query_params.get("start_date")
        end = self.request.query_params.get("end_date")
        if start:
            try:
                qs = qs.filter(timestamp__date__gte=datetime.date.fromisoformat(start))
            except ValueError:
                pass
        if end:
            try:
                qs = qs.filter(timestamp__date__lte=datetime.date.fromisoformat(end))
            except ValueError:
                pass
        return qs

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Aggregate summary counts for the audit dashboard overview."""
        qs = self.get_queryset()
        total = qs.count()
        successful = qs.filter(outcome=AuditEvent.Outcome.SUCCESS).count()
        failed = qs.filter(outcome=AuditEvent.Outcome.FAILURE).count()
        denied = qs.filter(outcome=AuditEvent.Outcome.DENIED).count()
        error = qs.filter(outcome=AuditEvent.Outcome.ERROR).count()
        security = qs.filter(
            action__in=[
                AuditEvent.Action.ACCESS_DENIED,
                AuditEvent.Action.AUTH_FAILURE,
                AuditEvent.Action.PERMISSION_CHANGE,
            ]
        ).count()
        return Response(
            {
                "total_events": total,
                "successful_actions": successful,
                "failed_actions": failed,
                "denied_actions": denied,
                "error_actions": error,
                "security_events": security,
            }
        )

    @action(detail=False, methods=["get"], url_path="export/csv")
    def export_csv(self, request):
        """Export the current (filtered) audit results to safe CSV.

        The export itself is recorded as an audit event.
        """
        qs = self.filter_queryset(self.get_queryset())

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "Timestamp",
                "Actor",
                "Actor Email",
                "Actor Type",
                "Workspace",
                "Action",
                "Module",
                "Resource Type",
                "Resource ID",
                "Resource Name",
                "Outcome",
                "Description",
                "Request ID",
                "HTTP Method",
                "Route",
                "IP Address",
                "User Agent",
            ]
        )
        for event in qs.iterator():
            writer.writerow(
                [
                    event.timestamp.isoformat(),
                    event.actor_name or "System",
                    event.actor_email,
                    event.actor_type,
                    event.workspace.slug if event.workspace else "",
                    event.action,
                    event.module,
                    event.resource_type,
                    event.resource_id,
                    event.resource_name,
                    event.outcome,
                    event.description,
                    event.request_id,
                    event.http_method,
                    self._csv_safe(event.route),
                    event.ip_address or "",
                    self._csv_safe(event.user_agent),
                ]
            )

        # Record the export event (security-relevant administrative action).
        workspace = getattr(request, "tenant", None)
        AuditEvent.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            actor_type=AuditEvent.ActorType.USER,
            actor_name=getattr(request.user, "get_full_name", lambda: "")()
            or getattr(request.user, "email", ""),
            actor_email=getattr(request.user, "email", ""),
            workspace=workspace,
            action=AuditEvent.Action.AUDIT_EXPORT,
            module=AuditEvent.Module.AUDIT,
            resource_type="audit_event",
            description="Exported filtered audit records to CSV",
            outcome=AuditEvent.Outcome.SUCCESS,
            request_id=getattr(request, "audit_context", {}).get("request_id", ""),
            http_method=request.method,
            route=self._csv_safe(request.get_full_path()),
            ip_address=getattr(request, "audit_context", {}).get("ip_address"),
            user_agent=getattr(request, "audit_context", {}).get("user_agent", ""),
            metadata={"record_count": qs.count()},
        )

        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="workstream_audit_log.csv"'
        return response

    @staticmethod
    def _csv_safe(value):
        """Neutralize spreadsheet formula injection in CSV cells."""
        if value is None:
            return ""
        text = str(value)
        if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
            return "'" + text
        return text
