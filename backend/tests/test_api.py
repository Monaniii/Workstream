import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from tenants.models import Workspace, WorkspaceMember
from projects.models import Project, Board
from issues.models import IssueStatus, Issue

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="admin@example.com",
        username="admin",
        password="strongpass123",
        is_staff=True,
    )


@pytest.fixture
def member_user(db):
    return User.objects.create_user(
        email="member@example.com", username="member", password="strongpass123"
    )


@pytest.fixture
def workspace(admin_user):
    ws = Workspace.objects.create(name="Acme Corp", slug="acme", owner=admin_user)
    WorkspaceMember.objects.create(user=admin_user, workspace=ws, role="admin")
    return ws


@pytest.fixture
def client_admin(api_client, admin_user, workspace):
    token, _ = Token.objects.get_or_create(user=admin_user)
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=workspace.slug,
    )
    return api_client


@pytest.mark.django_db
class TestTenants:
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

    def test_workspace_list_requires_auth(self, api_client):
        resp = api_client.get("/api/tenants/workspaces/")
        assert resp.status_code == 401

    def test_workspace_crud(self, client_admin):
        resp = client_admin.post(
            "/api/tenants/workspaces/",
            {"name": "Test Co", "slug": "testco"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        ws_id = resp.data["id"]
        resp = client_admin.get(f"/api/tenants/workspaces/{ws_id}/")
        assert resp.status_code == 200
        assert resp.data["name"] == "Test Co"

    def test_isolation_different_workspace(self, api_client, admin_user):
        ws1 = Workspace.objects.create(name="One", slug="one", owner=admin_user)
        WorkspaceMember.objects.create(user=admin_user, workspace=ws1, role="admin")
        token, _ = Token.objects.get_or_create(user=admin_user)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG="nonexistent",
        )
        resp = api_client.get("/api/projects/")
        assert resp.status_code == 403


@pytest.mark.django_db
class TestProjects:
    def test_create_project(self, client_admin, workspace):
        resp = client_admin.post(
            "/api/projects/",
            {"name": "Project A", "key": "PROJ"},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["key"] == "PROJ"

    def test_list_projects_scoped(self, client_admin, workspace):
        Project.objects.create(workspace=workspace, name="P1", key="P1")
        resp = client_admin.get("/api/projects/")
        assert resp.status_code == 200
        assert all(p["workspace"] == workspace.id for p in resp.data["results"])


@pytest.mark.django_db
class TestIssues:
    def test_create_issue_and_key(self, client_admin, workspace):
        project = Project.objects.create(workspace=workspace, name="P", key="PRJ")
        board = Board.objects.create(
            workspace=workspace, project=project, name="B", columns=[]
        )
        status = IssueStatus.objects.create(
            workspace=workspace, name="To Do", key="todo", is_initial=True
        )
        resp = client_admin.post(
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

    def test_move_issue(self, client_admin, workspace):
        project = Project.objects.create(workspace=workspace, name="P", key="PRJ")
        board = Board.objects.create(
            workspace=workspace, project=project, name="B", columns=[]
        )
        status = IssueStatus.objects.create(
            workspace=workspace, name="To Do", key="todo", is_initial=True
        )
        issue = Issue.objects.create(
            workspace=workspace,
            project=project,
            board=board,
            status=status,
            key="PRJ-1",
            summary="s",
            column_id="todo",
            position=0,
        )
        resp = client_admin.post(
            f"/api/issues/{issue.id}/move/",
            {"column_id": "done", "position": 1},
            format="json",
        )
        assert resp.status_code == 200
        issue.refresh_from_db()
        assert issue.column_id == "done"
