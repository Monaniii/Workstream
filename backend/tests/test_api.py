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

    def test_member_cannot_create_project(self, api_client, member_user, workspace):
        WorkspaceMember.objects.create(
            user=member_user, workspace=workspace, role="member"
        )
        token, _ = Token.objects.get_or_create(user=member_user)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace.slug,
        )
        resp = api_client.post(
            "/api/projects/",
            {"name": "Restricted", "key": "REST"},
            format="json",
        )
        assert resp.status_code == 403

    def test_manager_onboards_project_team_board_and_task_assignment(
        self, api_client, workspace
    ):
        manager = User.objects.create_user(
            email="manager@example.com", username="manager", password="password123"
        )
        teammate = User.objects.create_user(
            email="teammate@example.com", username="teammate", password="password123"
        )
        other_member = User.objects.create_user(
            email="other@example.com", username="other", password="password123"
        )
        WorkspaceMember.objects.create(
            user=manager, workspace=workspace, role="manager"
        )
        WorkspaceMember.objects.create(
            user=teammate, workspace=workspace, role="member"
        )
        WorkspaceMember.objects.create(
            user=other_member, workspace=workspace, role="member"
        )
        token, _ = Token.objects.get_or_create(user=manager)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace.slug,
        )

        response = api_client.post(
            "/api/projects/",
            {
                "name": "Team Project",
                "key": "TEAM",
                "manager": manager.id,
                "team_members": [teammate.id],
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        project = Project.objects.get(id=response.data["id"])
        assert set(project.team_members.values_list("id", flat=True)) == {
            manager.id,
            teammate.id,
        }
        board = Board.objects.get(project=project)
        assert board.columns

        status = IssueStatus.objects.get(workspace=workspace, is_initial=True)
        assigned = api_client.post(
            "/api/issues/",
            {
                "project": project.id,
                "board": board.id,
                "status": status.id,
                "summary": "Assigned task",
                "assignee": teammate.id,
            },
            format="json",
        )
        assert assigned.status_code == 201, assigned.data
        teammate_token, _ = Token.objects.get_or_create(user=teammate)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {teammate_token.key}",
            HTTP_X_TENANT_SLUG=workspace.slug,
        )
        reassignment = api_client.patch(
            f"/api/issues/{assigned.data['id']}/",
            {"assignee": manager.id},
            format="json",
        )
        assert reassignment.status_code == 400

        manager_token, _ = Token.objects.get_or_create(user=manager)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {manager_token.key}",
            HTTP_X_TENANT_SLUG=workspace.slug,
        )
        rejected = api_client.post(
            "/api/issues/",
            {
                "project": project.id,
                "board": board.id,
                "status": status.id,
                "summary": "Out-of-team task",
                "assignee": other_member.id,
            },
            format="json",
        )
        assert rejected.status_code == 400

    def test_project_manager_can_assign_tasks_without_workspace_manager_role(
        self, api_client, workspace
    ):
        project_manager = User.objects.create_user(
            email="project-manager@example.com",
            username="project-manager",
            password="password123",
        )
        teammate = User.objects.create_user(
            email="project-teammate@example.com",
            username="project-teammate",
            password="password123",
        )
        WorkspaceMember.objects.create(
            user=project_manager, workspace=workspace, role="member"
        )
        WorkspaceMember.objects.create(
            user=teammate, workspace=workspace, role="member"
        )
        project = Project.objects.create(
            workspace=workspace,
            name="Managed project",
            key="MGR",
            manager=project_manager,
        )
        project.team_members.add(project_manager, teammate)
        board = Board.objects.create(
            workspace=workspace, project=project, name="Managed board", columns=[]
        )
        status = IssueStatus.objects.create(
            workspace=workspace, name="To Do", key="todo", is_initial=True
        )
        issue = Issue.objects.create(
            workspace=workspace,
            project=project,
            board=board,
            status=status,
            key="MGR-1",
            summary="Unassigned task",
        )

        token, _ = Token.objects.get_or_create(user=project_manager)
        api_client.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace.slug,
        )
        response = api_client.patch(
            f"/api/issues/{issue.id}/",
            {"assignee": teammate.id},
            format="json",
        )
        assert response.status_code == 200, response.data
        issue.refresh_from_db()
        assert issue.assignee_id == teammate.id

    def test_project_completion_percentage_uses_final_task_statuses(
        self, client_admin, workspace
    ):
        project = Project.objects.create(
            workspace=workspace, name="Progress project", key="PROG"
        )
        open_status = IssueStatus.objects.create(
            workspace=workspace, name="To Do", key="todo", is_initial=True
        )
        done_status = IssueStatus.objects.create(
            workspace=workspace, name="Done", key="done", is_final=True
        )
        Issue.objects.create(
            workspace=workspace,
            project=project,
            status=open_status,
            key="PROG-1",
            summary="Open task",
        )
        Issue.objects.create(
            workspace=workspace,
            project=project,
            status=done_status,
            key="PROG-2",
            summary="Completed task",
        )

        project_response = client_admin.get(f"/api/projects/{project.id}/")
        assert project_response.status_code == 200
        assert project_response.data["progress_percentage"] == 50

        issue_response = client_admin.get(
            "/api/issues/", {"project": project.id}, format="json"
        )
        assert issue_response.status_code == 200
        serialized_issues = issue_response.data["results"]
        assert {issue["status_is_final"] for issue in serialized_issues} == {
            False,
            True,
        }


@pytest.mark.django_db
class TestIssues:
    def test_create_issue_and_key(self, client_admin, workspace):
        project = Project.objects.create(workspace=workspace, name="P", key="PRJ")
        project.team_members.add(workspace.owner)
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
        project.team_members.add(workspace.owner)
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
