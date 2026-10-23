import pytest
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from django.utils import timezone

from tenants.models import Workspace, WorkspaceMember, MembershipRole
from projects.models import Project, Board
from issues.models import IssueStatus, Issue
from audit.models import AuditEvent

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def owner_a():
    return User.objects.create_user(
        email="owner-a@company-a.com",
        username="owner-a",
        password="StrongPass123!",
        is_superuser=True,
    )


@pytest.fixture
def owner_b():
    return User.objects.create_user(
        email="owner-b@company-b.com",
        username="owner-b",
        password="StrongPass123!",
    )


@pytest.fixture
def workspace_a(owner_a):
    return Workspace.objects.create(
        name="Company A", slug="company-a", plan="free", owner=owner_a
    )


@pytest.fixture
def workspace_b(owner_b):
    return Workspace.objects.create(
        name="Company B", slug="company-b", plan="free", owner=owner_b
    )


@pytest.fixture
def admin_a(workspace_a):
    user = User.objects.create_user(
        email="admin-a@company-a.com",
        username="admin-a",
        password="StrongPass123!",
    )
    WorkspaceMember.objects.create(
        user=user, workspace=workspace_a, role=MembershipRole.ADMIN
    )
    return user


@pytest.fixture
def member_a(workspace_a):
    user = User.objects.create_user(
        email="member-a@company-a.com",
        username="member-a",
        password="StrongPass123!",
    )
    WorkspaceMember.objects.create(
        user=user, workspace=workspace_a, role=MembershipRole.MEMBER
    )
    return user


@pytest.fixture
def client_admin_a(admin_a, workspace_a):
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=admin_a)
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=workspace_a.slug,
    )
    return client


@pytest.fixture
def client_member_a(member_a, workspace_a):
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=member_a)
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=workspace_a.slug,
    )
    return client


@pytest.fixture
def client_superuser(owner_a):
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=owner_a)
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


@pytest.mark.django_db
class TestAuditAuthorization:
    def test_anonymous_cannot_access_audit_list(self, api_client):
        resp = api_client.get("/api/audit/events/")
        assert resp.status_code == 401

    def test_anonymous_cannot_access_audit_detail(self, api_client):
        resp = api_client.get("/api/audit/events/00000000-0000-0000-0000-000000000001/")
        assert resp.status_code == 401

    def test_ordinary_member_cannot_access_audit(self, client_member_a):
        resp = client_member_a.get("/api/audit/events/")
        assert resp.status_code == 403

    def test_workspace_admin_can_access_own_tenant_audit(
        self, client_admin_a, workspace_a
    ):
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="create",
            module="projects",
            resource_type="project",
            resource_id="1",
            outcome="success",
        )
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="login",
            module="auth",
            resource_type="user",
            resource_id="1",
            outcome="success",
        )
        resp = client_admin_a.get("/api/audit/events/")
        assert resp.status_code == 200, resp.data
        results = resp.data["results"] if "results" in resp.data else resp.data
        assert len(results) >= 2

    def test_workspace_admin_cannot_access_other_tenant_audit(
        self, client_admin_a, workspace_b
    ):
        AuditEvent.objects.create(
            workspace=workspace_b,
            action="create",
            module="projects",
            resource_type="project",
            resource_id="1",
            outcome="success",
        )
        resp = client_admin_a.get("/api/audit/events/")
        assert resp.status_code == 200, resp.data
        results = resp.data["results"] if "results" in resp.data else resp.data
        assert all(e["workspace"] != workspace_b.id for e in results)

    def test_superuser_sees_all_tenants_audit(
        self, client_superuser, workspace_a, workspace_b
    ):
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="create",
            module="projects",
            resource_type="project",
            resource_id="1",
            outcome="success",
        )
        AuditEvent.objects.create(
            workspace=workspace_b,
            action="create",
            module="projects",
            resource_type="project",
            resource_id="2",
            outcome="success",
        )
        resp = client_superuser.get("/api/audit/events/")
        assert resp.status_code == 200, resp.data
        results = resp.data["results"] if "results" in resp.data else resp.data
        workspaces = {e["workspace"] for e in results}
        assert workspace_a.id in workspaces
        assert workspace_b.id in workspaces

    def test_audit_stats_endpoint(self, client_admin_a, workspace_a):
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="create",
            module="projects",
            resource_type="project",
            resource_id="1",
            outcome="success",
        )
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="delete",
            module="projects",
            resource_type="project",
            resource_id="2",
            outcome="denied",
        )
        resp = client_admin_a.get("/api/audit/events/stats/")
        assert resp.status_code == 200, resp.data
        assert resp.data["total_events"] >= 2
        assert resp.data["denied_actions"] >= 1

    def test_no_update_or_delete_endpoints(self, client_admin_a):
        resp = client_admin_a.put(
            "/api/audit/events/00000000-0000-0000-0000-000000000001/",
            {},
            format="json",
        )
        assert resp.status_code in (404, 405, 403)
        resp = client_admin_a.delete(
            "/api/audit/events/00000000-0000-0000-0000-000000000001/"
        )
        assert resp.status_code in (404, 405, 403)


@pytest.mark.django_db
class TestAuditEventCapture:
    def test_project_create_generates_event(self, client_admin_a, workspace_a):
        before = AuditEvent.objects.count()
        resp = client_admin_a.post(
            "/api/projects/",
            {"name": "Audit Project", "key": "AUD"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert AuditEvent.objects.count() == before + 1
        event = AuditEvent.objects.filter(
            workspace=workspace_a, module="projects", resource_type="project"
        ).latest("timestamp")
        assert event.action == "create"
        assert event.outcome == "success"
        assert event.resource_name == "Audit Project"

    def test_project_update_records_changed_fields(self, client_admin_a, workspace_a):
        project = Project.objects.create(
            workspace=workspace_a, name="Before", key="BEF"
        )
        before = AuditEvent.objects.count()
        resp = client_admin_a.patch(
            f"/api/projects/{project.id}/",
            {"name": "After"},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert AuditEvent.objects.count() == before + 1
        event = AuditEvent.objects.latest("timestamp")
        assert event.action == "update"
        assert "name" in event.changed_fields
        assert event.changed_fields["name"]["from"] == "Before"
        assert event.changed_fields["name"]["to"] == "After"

    def test_project_delete_generates_event(self, client_admin_a, workspace_a):
        project = Project.objects.create(
            workspace=workspace_a, name="Delete Me", key="DEL"
        )
        pid = project.id
        before = AuditEvent.objects.count()
        resp = client_admin_a.delete(f"/api/projects/{project.id}/")
        assert resp.status_code == 204, resp.data
        assert AuditEvent.objects.count() == before + 1
        event = AuditEvent.objects.filter(
            resource_type="project", resource_id=str(pid)
        ).latest("timestamp")
        assert event.action == "delete"

    def test_project_archive_generates_event(self, client_admin_a, workspace_a):
        project = Project.objects.create(
            workspace=workspace_a, name="Archive Me", key="ARC"
        )
        before = AuditEvent.objects.count()
        resp = client_admin_a.post(f"/api/projects/{project.id}/archive/")
        assert resp.status_code == 200, resp.data
        assert AuditEvent.objects.count() == before + 1
        event = AuditEvent.objects.latest("timestamp")
        assert event.action == "archive"
        assert event.changed_fields["archived"]["from"] is False
        assert event.changed_fields["archived"]["to"] is True


@pytest.mark.django_db
class TestAuditRedaction:
    def test_sensitive_fields_redacted_in_changed_fields(self, admin_a, workspace_a):
        from audit.services import AuditService

        event = AuditService.log_event(
            actor=admin_a,
            workspace=workspace_a,
            action="update",
            module="auth",
            resource_type="user",
            resource_id="1",
            description="redact test",
            outcome="success",
            changed_fields={
                "password": {"from": "old-secret", "to": "new-secret"},
                "token": "abc123secret",
                "name": {"from": "Old", "to": "New"},
            },
        )
        assert event.changed_fields["password"] == "[REDACTED]"
        assert event.changed_fields["token"] == "[REDACTED]"
        assert event.changed_fields["name"]["from"] == "Old"
        assert event.changed_fields["name"]["to"] == "New"

    def test_redact_dict_nested(self):
        from audit.services import redact_dict

        data = {
            "password": "hunter2",
            "api_key": "key-123",
            "profile": {"email": "a@b.com", "secret_token": "tok"},
            "name": "Alice",
        }
        redacted = redact_dict(data)
        assert redacted["password"] == "[REDACTED]"
        assert redacted["api_key"] == "[REDACTED]"
        assert redacted["profile"]["secret_token"] == "[REDACTED]"
        assert redacted["profile"]["email"] == "a@b.com"
        assert redacted["name"] == "Alice"


@pytest.mark.django_db
class TestAuditTransactionSafety:
    def test_rolled_back_transaction_does_not_log_success(self, workspace_a, admin_a):
        from audit.services import AuditService

        before = AuditEvent.objects.count()

        def do_work():
            Project.objects.create(workspace=workspace_a, name="X", key="X1")
            AuditService.log_on_commit(
                AuditService.log_event,
                actor=admin_a,
                workspace=workspace_a,
                action="create",
                module="projects",
                resource_type="project",
                resource_id="1",
                description="rolled back",
                outcome="success",
            )
            raise transaction.TransactionManagementError("boom")

        try:
            with transaction.atomic():
                do_work()
        except transaction.TransactionManagementError:
            pass

        # No committed audit event should exist for the rolled-back work.
        assert AuditEvent.objects.count() == before

    def test_system_event_identifies_source(self, workspace_a):
        event = AuditEvent.objects.create(
            actor=None,
            actor_type=AuditEvent.ActorType.SYSTEM,
            workspace=workspace_a,
            action="system",
            module="system",
            resource_type="job",
            resource_id="reminder",
            description="Scheduled reminder job ran",
            outcome="success",
        )
        assert event.actor is None
        assert event.actor_type == AuditEvent.ActorType.SYSTEM


@pytest.mark.django_db
class TestAuditFailedAuth:
    def test_failed_login_records_denied_event(self, api_client):
        before = AuditEvent.objects.filter(action="auth_failure").count()
        resp = api_client.post(
            "/api/auth/login/",
            {"email": "none@example.com", "password": "wrong"},
            format="json",
        )
        assert resp.status_code == 400
        assert (
            AuditEvent.objects.filter(action="auth_failure").count()
            == before + 1
        )
        event = AuditEvent.objects.filter(action="auth_failure").latest("timestamp")
        assert event.outcome == "denied"
        assert event.module == "auth"


@pytest.mark.django_db
class TestAuditExport:
    def test_export_csv_requires_admin(self, client_member_a):
        resp = client_member_a.get("/api/audit/events/export/csv/")
        assert resp.status_code == 403

    def test_export_csv_neutralizes_formula_injection(
        self, client_admin_a, workspace_a
    ):
        # An event whose route begins with a formula character must be made
        # safe in CSV output (spreadsheet formula injection protection).
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="create",
            module="projects",
            resource_type="project",
            resource_id="1",
            outcome="success",
            route="=HYPERLINK(\"http://evil.com\",\"click\")",
            description="malicious route",
        )
        resp = client_admin_a.get("/api/audit/events/export/csv/")
        assert resp.status_code == 200, resp.content
        text = resp.content.decode("utf-8")
        # The dangerous leading formula character must be neutralized by a
        # leading apostrophe so spreadsheets treat it as literal text.
        assert "'=HYPERLINK" in text
        # No cell should begin the formula unquoted.
        assert ',"=HYPERLINK"' not in text
        assert ',=HYPERLINK' not in text

    def test_export_csv_returns_csv(self, client_admin_a, workspace_a):
        AuditEvent.objects.create(
            workspace=workspace_a,
            action="login",
            module="auth",
            resource_type="user",
            resource_id="1",
            outcome="success",
        )
        resp = client_admin_a.get("/api/audit/events/export/csv/")
        assert resp.status_code == 200
        assert resp["Content-Type"].startswith("text/csv")
        # The export itself should be recorded as an audit event.
        assert AuditEvent.objects.filter(
            action="audit_export", module="audit"
        ).exists()
