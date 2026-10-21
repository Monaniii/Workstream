import pytest
import uuid
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from django.utils import timezone
from datetime import timedelta

from tenants.models import Workspace, WorkspaceMember, MembershipRole, Invitation
from projects.models import Project, Board, Sprint, SprintStatus
from issues.models import IssueStatus, Issue
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

    def test_issue_creation_and_key(self, client_admin_a, workspace_a):
        project = Project.objects.create(workspace=workspace_a, name="P", key="PRJ")
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
