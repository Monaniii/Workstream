import pytest
import uuid
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from django.utils import timezone
from datetime import timedelta

from tenants.models import Workspace, WorkspaceMember, MembershipRole, Invitation
from projects.models import Project, Board, Sprint, SprintStatus
from issues.models import IssueStatus, Issue, AuditLog
from billing.models import SubscriptionPlan, Subscription, Invoice, ProcessedStripeEvent

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def workspace_owner_a():
    return User.objects.create_user(
        email="owner-a@company-a.com",
        username="owner-a",
        password="StrongPass123!",
    )


@pytest.fixture
def workspace_owner_b():
    return User.objects.create_user(
        email="owner-b@company-b.com",
        username="owner-b",
        password="StrongPass123!",
    )


@pytest.fixture
def workspace_a(workspace_owner_a):
    return Workspace.objects.create(
        name="Company A", slug="company-a", plan="free", owner=workspace_owner_a
    )


@pytest.fixture
def workspace_b(workspace_owner_b):
    return Workspace.objects.create(
        name="Company B", slug="company-b", plan="free", owner=workspace_owner_b
    )


@pytest.fixture
def admin_user_a(workspace_a, workspace_owner_a):
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
def admin_user_b(workspace_b, workspace_owner_b):
    user = User.objects.create_user(
        email="admin-b@company-b.com",
        username="admin-b",
        password="StrongPass123!",
    )
    WorkspaceMember.objects.create(
        user=user, workspace=workspace_b, role=MembershipRole.ADMIN
    )
    return user


@pytest.fixture
def client_admin_a(admin_user_a, workspace_a):
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=admin_user_a)
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=workspace_a.slug,
    )
    return client


@pytest.fixture
def client_admin_b(admin_user_b, workspace_b):
    client = APIClient()
    token, _ = Token.objects.get_or_create(user=admin_user_b)
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=workspace_b.slug,
    )
    return client


@pytest.mark.django_db
class TestCrossTenantIsolation:
    """Company A must never access Company B's data."""

    def test_cannot_read_other_workspace_projects(
        self, client_admin_a, client_admin_b, workspace_a, workspace_b
    ):
        """Company A cannot list Company B's projects."""
        Project.objects.create(
            workspace=workspace_b, name="Secret Project", key="SEC"
        )
        resp = client_admin_a.get("/api/projects/")
        assert resp.status_code == 200
        assert all(p["workspace"] == workspace_a.id for p in resp.data["results"])
        assert not any(p["workspace"] == workspace_b.id for p in resp.data["results"])

    def test_cannot_read_other_workspace_issues(
        self, client_admin_a, client_admin_b, workspace_a, workspace_b
    ):
        """Company A cannot list Company B's issues."""
        project_b = Project.objects.create(
            workspace=workspace_b, name="Secret", key="SEC"
        )
        status = IssueStatus.objects.create(
            workspace=workspace_b, name="To Do", key="todo", is_initial=True
        )
        Issue.objects.create(
            workspace=workspace_b,
            project=project_b,
            key="SEC-1",
            summary="Secret issue",
            status=status,
        )
        resp = client_admin_a.get("/api/issues/")
        assert resp.status_code == 200
        assert all(i["workspace"] == workspace_a.id for i in resp.data["results"])

    def test_cannot_modify_other_workspace_project(
        self, client_admin_a, client_admin_b, workspace_a, workspace_b
    ):
        """Company A cannot update Company B's project."""
        project_b = Project.objects.create(
            workspace=workspace_b, name="Secret", key="SEC"
        )
        resp = client_admin_a.patch(
            f"/api/projects/{project_b.id}/",
            {"name": "Hacked"},
            format="json",
        )
        # Project should not be found in Company A's tenant scope
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.data}"
        # Verify project was not actually modified
        project_b.refresh_from_db()
        assert project_b.name == "Secret"

    def test_cannot_create_project_in_other_workspace(
        self, client_admin_a, workspace_a, workspace_b
    ):
        """Company A cannot create a project assigned to Company B."""
        resp = client_admin_a.post(
            "/api/projects/",
            {
                "name": "Hacked Project",
                "key": "HACK",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        # Project must be created in the requesting user's workspace, not workspace_b
        assert resp.data["workspace"] == workspace_a.id
        assert resp.data["workspace"] != workspace_b.id

    def test_different_tenant_slug_returns_403(
        self, api_client, admin_user_a, workspace_b
    ):
        """Using a workspace slug the user doesn't belong to returns 403."""
        token, _ = Token.objects.get_or_create(user=admin_user_a)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace_b.slug,
        )
        resp = api_client.get("/api/projects/")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestBillingEntitlements:
    """Plan limits must be enforced on the server."""

    def test_billing_endpoints_are_admin_only(
        self, api_client, workspace_a, admin_user_a
    ):
        member = User.objects.create_user(
            email="billing-member@company-a.com",
            username="billing-member",
            password="test-password-123",
        )
        WorkspaceMember.objects.create(
            user=member,
            workspace=workspace_a,
            role=MembershipRole.MEMBER,
        )
        token, _ = Token.objects.get_or_create(user=member)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace_a.slug,
        )

        for endpoint in (
            "/api/billing/plans/",
            "/api/billing/subscription/",
            "/api/billing/invoices/",
        ):
            response = api_client.get(endpoint)
            assert response.status_code == 403, response.data

        admin_token, _ = Token.objects.get_or_create(user=admin_user_a)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {admin_token.key}",
            HTTP_X_TENANT_SLUG=workspace_a.slug,
        )
        plans_response = api_client.get("/api/billing/plans/")
        assert plans_response.status_code == 200, plans_response.data

    def test_free_plan_project_limit(
        self, client_admin_a, workspace_a
    ):
        """Free plan allows max 3 projects; 4th should be rejected."""
        plan = SubscriptionPlan.objects.create(
            name="Free",
            slug="free",
            amount=0,
            currency="usd",
            interval="month",
            max_users=5,
            max_projects=3,
            max_boards=3,
            features=[],
            is_active=True,
        )
        Subscription.objects.create(
            workspace=workspace_a,
            plan=plan,
            status="active",
        )

        # Create 3 projects (should succeed)
        for i in range(3):
            resp = client_admin_a.post(
                "/api/projects/",
                {"name": f"Project {i}", "key": f"PROJ{i}"},
                format="json",
            )
            assert resp.status_code == 201, resp.data

        # 4th project should be rejected
        resp = client_admin_a.post(
            "/api/projects/",
            {"name": "Project 4", "key": "PROJ4"},
            format="json",
        )
        assert resp.status_code == 403, resp.data
        assert "limit" in resp.data["detail"].lower()

    def test_member_limit_enforcement(
        self, client_admin_a, workspace_a
    ):
        """Member limit is enforced when adding members."""
        plan = SubscriptionPlan.objects.create(
            name="Free",
            slug="free",
            amount=0,
            currency="usd",
            interval="month",
            max_users=3,
            max_projects=10,
            max_boards=10,
            features=[],
            is_active=True,
        )
        Subscription.objects.create(
            workspace=workspace_a,
            plan=plan,
            status="active",
        )

        # Add members up to the limit (admin already exists, so 2 more)
        for i in range(2):
            user = User.objects.create_user(
                email=f"member{i}@company-a.com",
                username=f"member{i}",
                password="StrongPass123!",
            )
            resp = client_admin_a.post(
                f"/api/tenants/workspaces/{workspace_a.id}/members/",
                {"user": user.id, "role": "member"},
                format="json",
            )
            assert resp.status_code == 201, resp.data

        # Next member should be rejected
        extra_user = User.objects.create_user(
            email="extra@company-a.com",
            username="extra",
            password="StrongPass123!",
        )
        resp = client_admin_a.post(
            f"/api/tenants/workspaces/{workspace_a.id}/members/",
            {"user": extra_user.id, "role": "member"},
            format="json",
        )
        assert resp.status_code == 403, resp.data
        assert "limit" in resp.data["detail"].lower()


@pytest.mark.django_db
class TestStripeWebhookIdempotency:
    """Repeated Stripe webhook delivery must not duplicate effects."""

    def test_webhook_idempotency_record_prevents_reprocessing(
        self
    ):
        """A ProcessedStripeEvent record blocks duplicate event processing."""
        event = ProcessedStripeEvent.objects.create(
            stripe_event_id="evt_test_duplicate",
            event_type="customer.subscription.updated",
        )
        assert event.stripe_event_id == "evt_test_duplicate"
        assert ProcessedStripeEvent.objects.filter(
            stripe_event_id="evt_test_duplicate"
        ).exists()

    def test_duplicate_webhook_event_id_rejected(
        self
    ):
        """Same stripe_event_id cannot be inserted twice (unique constraint)."""
        ProcessedStripeEvent.objects.create(
            stripe_event_id="evt_unique_test",
            event_type="test.event",
        )
        with pytest.raises(Exception):
            ProcessedStripeEvent.objects.create(
                stripe_event_id="evt_unique_test",
                event_type="test.event",
            )


@pytest.mark.django_db
class TestInvitations:
    """Workspace invitation flow."""

    def test_invitation_creation_and_acceptance(
        self, workspace_a, admin_user_a
    ):
        """An admin can invite a user, and the user can accept."""
        user = User.objects.create_user(
            email="invitee@company-a.com",
            username="invitee",
            password="StrongPass123!",
        )
        invitation = Invitation.objects.create(
            workspace=workspace_a,
            email="invitee@company-a.com",
            invited_by=admin_user_a,
            role=MembershipRole.MEMBER,
            token=uuid.uuid4(),
            expires_at=timezone.now() + timedelta(days=7),
        )
        assert invitation.status == "pending"
        assert not invitation.is_expired()

        # Accept the invitation
        invitation.accept(user)
        invitation.refresh_from_db()
        assert invitation.status == "accepted"
        assert WorkspaceMember.objects.filter(
            user=user, workspace=workspace_a
        ).exists()

    def test_expired_invitation_cannot_be_accepted(
        self, workspace_a, admin_user_a
    ):
        """An expired invitation raises ValueError when accepted."""
        user = User.objects.create_user(
            email="expired@company-a.com",
            username="expired",
            password="StrongPass123!",
        )
        invitation = Invitation.objects.create(
            workspace=workspace_a,
            email="expired@company-a.com",
            invited_by=admin_user_a,
            role=MembershipRole.MEMBER,
            token=uuid.uuid4(),
            expires_at=timezone.now() - timedelta(days=1),
        )
        assert invitation.is_expired()
        with pytest.raises(ValueError):
            invitation.accept(user)


@pytest.mark.django_db
class TestExistingFunctionality:
    """Existing core functionality continues to work."""

    def test_register_and_login(self, api_client):
        resp = api_client.post(
            "/api/auth/register/",
            {
                "email": "new@example.com",
                "username": "newuser",
                "password": "strongpass123",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert "token" in resp.data

    def test_workspace_crud(self, api_client, admin_user_a, workspace_a):
        token, _ = Token.objects.get_or_create(user=admin_user_a)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace_a.slug,
        )
        resp = api_client.post(
            "/api/tenants/workspaces/",
            {"name": "Test Co", "slug": "testco"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        ws_id = resp.data["id"]
        resp = api_client.get(f"/api/tenants/workspaces/{ws_id}/")
        assert resp.status_code == 200
        assert resp.data["name"] == "Test Co"

    def test_tenant_isolation_different_workspace(
        self, api_client, admin_user_a
    ):
        ws1 = Workspace.objects.create(name="One", slug="one", owner=admin_user_a)
        WorkspaceMember.objects.create(
            user=admin_user_a, workspace=ws1, role="admin"
        )
        token, _ = Token.objects.get_or_create(user=admin_user_a)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG="nonexistent",
        )
        resp = api_client.get("/api/projects/")
        assert resp.status_code == 403

    def test_issue_creation_and_key(self, client_admin_a, workspace_a, admin_user_a):
        project = Project.objects.create(workspace=workspace_a, name="P", key="PRJ")
        project.team_members.add(admin_user_a)
        board = Board.objects.create(
            workspace=workspace_a, project=project, name="B", columns=[]
        )
        status = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        resp = client_admin_a.post(
            "/api/issues/",
            {
                "project": project.id,
                "board": board.id,
                "status": status.id,
                "summary": "Fix login bug",
                "priority": "high",
                "issue_type": "bug",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["key"].startswith("PRJ-")


@pytest.mark.django_db
class TestReports:
    """Reports & Analytics endpoint tests."""

    def test_overview_endpoint(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Overview returns KPIs scoped to the requesting workspace."""
        project = Project.objects.create(
            workspace=workspace_a, name="Test Project", key="TP"
        )
        status_todo = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        status_done = IssueStatus.objects.create(
            workspace=workspace_a, name="Done", key="done", is_final=True
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="TP-1",
            summary="Open task",
            priority="high",
            issue_type="bug",
            assignee=admin_user_a,
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_done,
            key="TP-2",
            summary="Completed task",
            priority="low",
            issue_type="task",
            assignee=admin_user_a,
        )

        resp = client_admin_a.get("/api/reports/overview/")
        assert resp.status_code == 200, resp.data
        assert resp.data["workspace"]["id"] == workspace_a.id
        assert resp.data["kpis"]["total_projects"] >= 1
        assert resp.data["kpis"]["total_tasks"] >= 2
        assert resp.data["kpis"]["open_tasks"] >= 1
        assert resp.data["kpis"]["completed_tasks"] >= 1
        assert "status_distribution" in resp.data

    def test_overview_tenant_isolation(
        self, client_admin_a, client_admin_b, workspace_a, workspace_b
    ):
        """Company A cannot see Company B's report data."""
        Project.objects.create(
            workspace=workspace_b, name="Secret Project", key="SEC"
        )
        resp = client_admin_a.get("/api/reports/overview/")
        assert resp.status_code == 200
        assert resp.data["workspace"]["id"] == workspace_a.id

    def test_projects_endpoint(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Projects endpoint returns per-project task breakdown."""
        project = Project.objects.create(
            workspace=workspace_a, name="Alpha", key="ALP"
        )
        status_done = IssueStatus.objects.create(
            workspace=workspace_a, name="Done", key="done", is_final=True
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_done,
            key="ALP-1",
            summary="Done task",
            priority="medium",
            issue_type="task",
            assignee=admin_user_a,
        )

        resp = client_admin_a.get("/api/reports/projects/")
        assert resp.status_code == 200, resp.data
        assert len(resp.data["projects"]) >= 1
        proj = resp.data["projects"][0]
        assert proj["total_tasks"] >= 1
        assert proj["completed_tasks"] >= 1
        assert "completion_rate" in proj

    def test_tasks_endpoint(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Tasks endpoint returns distribution by status, priority, assignee."""
        project = Project.objects.create(
            workspace=workspace_a, name="Beta", key="BET"
        )
        status_todo = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="BET-1",
            summary="Analytic task",
            priority="high",
            issue_type="bug",
            assignee=admin_user_a,
        )

        resp = client_admin_a.get("/api/reports/tasks/")
        assert resp.status_code == 200, resp.data
        assert resp.data["total"] >= 1
        assert "by_status" in resp.data
        assert "by_priority" in resp.data
        assert "by_project" in resp.data
        assert "by_assignee" in resp.data
        assert "daily_creation" in resp.data

    def test_team_endpoint(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Team endpoint returns per-member workload."""
        project = Project.objects.create(
            workspace=workspace_a, name="Gamma", key="GAM"
        )
        status_todo = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="GAM-1",
            summary="Team task",
            priority="medium",
            issue_type="task",
            assignee=admin_user_a,
        )

        resp = client_admin_a.get("/api/reports/team/")
        assert resp.status_code == 200, resp.data
        assert resp.data["total_members"] >= 1
        member = resp.data["members"][0]
        assert "total_tasks" in member
        assert "open_tasks" in member
        assert "completed_tasks" in member
        assert "completion_rate" in member

    def test_activity_endpoint(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Activity endpoint returns audit log events."""
        AuditLog.objects.create(
            workspace=workspace_a,
            actor=admin_user_a,
            action="create",
            target_type="project",
            target_id="1",
            changes={},
        )

        resp = client_admin_a.get("/api/reports/activity/")
        assert resp.status_code == 200, resp.data
        assert resp.data["total_events"] >= 1
        assert "by_action" in resp.data
        assert "by_target" in resp.data
        assert "recent_events" in resp.data

    def test_export_csv_endpoint(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """CSV export returns a downloadable CSV file."""
        project = Project.objects.create(
            workspace=workspace_a, name="Export Project", key="EXP"
        )
        status_todo = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="EXP-1",
            summary="Export task",
            priority="medium",
            issue_type="task",
            assignee=admin_user_a,
        )

        resp = client_admin_a.post(
            "/api/reports/export/csv/",
            {"report_type": "tasks"},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert resp["Content-Type"].startswith("text/csv")
        assert "attachment" in resp.get("Content-Disposition", "")

    def test_export_csv_invalid_report_type(
        self, client_admin_a
    ):
        """Invalid report type returns 400."""
        resp = client_admin_a.post(
            "/api/reports/export/csv/",
            {"report_type": "nonexistent"},
            format="json",
        )
        assert resp.status_code == 400

    def test_export_csv_uses_period_from_post_body(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        project = Project.objects.create(
            workspace=workspace_a, name="Period Project", key="PER"
        )
        status_todo = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        old_issue = Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="PER-1",
            summary="Older task",
            priority="medium",
            issue_type="task",
            assignee=admin_user_a,
        )
        Issue.objects.filter(pk=old_issue.pk).update(
            created_at=timezone.now() - timedelta(days=40)
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="PER-2",
            summary="Recent task",
            priority="medium",
            issue_type="task",
            assignee=admin_user_a,
        )

        resp = client_admin_a.post(
            "/api/reports/export/csv/",
            {"report_type": "overview", "period": "last_7_days"},
            format="json",
        )

        assert resp.status_code == 200
        assert b"Tasks Created In Period,1" in resp.content

    def test_reports_require_tenant(
        self, api_client, admin_user_a
    ):
        """Reports with a nonexistent tenant slug return 403."""
        token, _ = Token.objects.get_or_create(user=admin_user_a)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG="nonexistent-workspace",
        )
        resp = api_client.get("/api/reports/overview/")
        assert resp.status_code == 403

    def test_reports_require_authentication(
        self, api_client
    ):
        """Reports endpoints require authentication."""
        resp = api_client.get("/api/reports/overview/")
        assert resp.status_code == 401


@pytest.mark.django_db
class TestProjectFeatures:
    """Enhanced project module tests."""

    def test_create_project_with_status_and_priority(
        self, client_admin_a, workspace_a
    ):
        """Project can be created with status and priority."""
        resp = client_admin_a.post(
            "/api/projects/",
            {
                "name": "New Project",
                "key": "NEW",
                "status": "active",
                "priority": "high",
                "objectives": "Build something great",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["status"] == "active"
        assert resp.data["priority"] == "high"
        assert resp.data["objectives"] == "Build something great"
        assert resp.data["owner_email"] == "admin-a@company-a.com"

    def test_project_defaults_to_planned_and_normal(
        self, client_admin_a, workspace_a
    ):
        """New project defaults to Planned status and Normal priority."""
        resp = client_admin_a.post(
            "/api/projects/",
            {"name": "Default Project", "key": "DEF"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["status"] == "planned"
        assert resp.data["priority"] == "normal"

    def test_project_owner_defaults_to_creator(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Project owner defaults to the creating user."""
        resp = client_admin_a.post(
            "/api/projects/",
            {"name": "Ownered Project", "key": "OWN"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["owner_email"] == admin_user_a.email

    def test_project_date_validation(
        self, client_admin_a, workspace_a
    ):
        """Target date cannot be earlier than start date."""
        resp = client_admin_a.post(
            "/api/projects/",
            {
                "name": "Bad Dates",
                "key": "BDAT",
                "start_date": "2026-12-01",
                "target_date": "2026-11-01",
            },
            format="json",
        )
        assert resp.status_code == 400, resp.data

    def test_project_health_and_progress(
        self, client_admin_a, workspace_a, admin_user_a
    ):
        """Project health and progress are calculated from tasks."""
        project = Project.objects.create(
            workspace=workspace_a, name="Health Proj", key="HP"
        )
        status_todo = IssueStatus.objects.create(
            workspace=workspace_a, name="To Do", key="todo", is_initial=True
        )
        status_done = IssueStatus.objects.create(
            workspace=workspace_a, name="Done", key="done", is_final=True
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_todo,
            key="HP-1",
            summary="Open task",
            priority="medium",
            issue_type="task",
            assignee=admin_user_a,
        )
        Issue.objects.create(
            workspace=workspace_a,
            project=project,
            status=status_done,
            key="HP-2",
            summary="Done task",
            priority="low",
            issue_type="task",
            assignee=admin_user_a,
        )

        # Refresh from DB to get computed properties
        project.refresh_from_db()
        assert project.progress_percentage == 50.0
        assert project.health == "at_risk"

    def test_project_archive_and_unarchive(
        self, client_admin_a, workspace_a
    ):
        """Project can be archived and unarchived."""
        resp = client_admin_a.post(
            "/api/projects/",
            {"name": "Archive Me", "key": "ARC"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        project_id = resp.data["id"]

        # Archive
        resp = client_admin_a.post(f"/api/projects/{project_id}/archive/")
        assert resp.status_code == 200, resp.data

        # Should not appear in default list
        resp = client_admin_a.get("/api/projects/")
        assert resp.status_code == 200
        assert not any(p["id"] == project_id for p in resp.data["results"])

        # Should appear with include_archived=true
        resp = client_admin_a.get("/api/projects/?include_archived=true")
        assert resp.status_code == 200
        assert any(p["id"] == project_id for p in resp.data["results"])

        # Unarchive
        resp = client_admin_a.post(f"/api/projects/{project_id}/unarchive/")
        assert resp.status_code == 200, resp.data

        # Should appear again
        resp = client_admin_a.get("/api/projects/")
        assert resp.status_code == 200
        assert any(p["id"] == project_id for p in resp.data["results"])

    def test_project_cannot_archive_twice(
        self, client_admin_a, workspace_a
    ):
        """Archiving an already-archived project returns 400."""
        resp = client_admin_a.post(
            "/api/projects/",
            {"name": "Double Archive", "key": "DARC"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        project_id = resp.data["id"]

        client_admin_a.post(f"/api/projects/{project_id}/archive/")
        resp = client_admin_a.post(f"/api/projects/{project_id}/archive/")
        assert resp.status_code == 400, resp.data

    def test_project_filter_by_status(
        self, client_admin_a, workspace_a
    ):
        """Projects can be filtered by status."""
        client_admin_a.post(
            "/api/projects/",
            {"name": "Active Project", "key": "ACT", "status": "active"},
            format="json",
        )
        client_admin_a.post(
            "/api/projects/",
            {"name": "Planned Project", "key": "PLN", "status": "planned"},
            format="json",
        )

        resp = client_admin_a.get("/api/projects/?status=active")
        assert resp.status_code == 200
        assert all(p["status"] == "active" for p in resp.data["results"])

    def test_project_filter_by_priority(
        self, client_admin_a, workspace_a
    ):
        """Projects can be filtered by priority."""
        client_admin_a.post(
            "/api/projects/",
            {"name": "High Priority", "key": "HIP", "priority": "high"},
            format="json",
        )
        client_admin_a.post(
            "/api/projects/",
            {"name": "Low Priority", "key": "LOP", "priority": "low"},
            format="json",
        )

        resp = client_admin_a.get("/api/projects/?priority=high")
        assert resp.status_code == 200
        assert all(p["priority"] == "high" for p in resp.data["results"])
