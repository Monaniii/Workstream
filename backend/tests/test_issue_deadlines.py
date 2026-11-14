import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from django.utils import timezone
from datetime import timedelta

from tenants.models import Workspace, WorkspaceMember, MembershipRole
from projects.models import Project, Board
from issues.models import IssueStatus, Issue

User = get_user_model()


@pytest.fixture
def workspace():
    owner = User.objects.create_user(
        email="owner@tasks.test", username="owner", password="StrongPass123!"
    )
    ws = Workspace.objects.create(name="Tasks WS", slug="tasks-ws", owner=owner)
    WorkspaceMember.objects.create(
        user=owner, workspace=ws, role=MembershipRole.ADMIN
    )
    return ws


@pytest.fixture
def client_for(workspace):
    def _make(user):
        c = APIClient()
        token, _ = Token.objects.get_or_create(user=user)
        c.credentials(
            HTTP_AUTHORIZATION=f"Token {token.key}",
            HTTP_X_TENANT_SLUG=workspace.slug,
        )
        return c

    return _make


@pytest.fixture
def admin(workspace):
    return WorkspaceMember.objects.get(workspace=workspace).user


@pytest.fixture
def statuses(workspace):
    todo = IssueStatus.objects.create(
        workspace=workspace, name="To Do", key="todo",
        is_initial=True, position=0,
    )
    done = IssueStatus.objects.create(
        workspace=workspace, name="Done", key="done",
        is_final=True, position=1,
    )
    return todo, done


@pytest.fixture
def project(workspace, admin, statuses):
    todo, done = statuses
    p = Project.objects.create(workspace=workspace, name="Task Project", key="TASK")
    p.team_members.add(admin)
    Board.objects.create(
        workspace=workspace,
        project=p,
        name="Task Project Board",
        columns=[
            {"id": todo.key, "name": todo.name, "position": 0},
            {"id": done.key, "name": done.name, "position": 1},
        ],
    )
    return p


@pytest.mark.django_db
class TestIssueDueDatesAndClosure:
    def test_creating_issue_with_due_date(
        self, client_for, admin, workspace, project, statuses
    ):
        todo, _ = statuses
        resp = client_for(admin).post(
            "/api/issues/",
            {
                "project": project.id,
                "status": todo.id,
                "summary": "Ship the release",
                "due_date": "2026-12-01",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["due_date"] == "2026-12-01"
        assert resp.data["is_closed"] is False
        assert resp.data["closed_at"] is None

    def test_filter_issues_by_due_date(
        self, client_for, admin, workspace, project, statuses
    ):
        todo, _ = statuses
        future = timezone.localdate() + timedelta(days=3)
        Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-1", summary="Dated", due_date=future,
        )
        Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-2", summary="Undated",
        )
        resp = client_for(admin).get(f"/api/issues/?due_date={future.isoformat()}")
        assert resp.status_code == 200
        keys = [i["key"] for i in resp.data["results"]]
        assert keys == ["TASK-1"]

    def test_moving_to_final_status_closes_task(
        self, client_for, admin, workspace, project, statuses
    ):
        todo, done = statuses
        issue = Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-3", summary="Close me",
        )
        resp = client_for(admin).post(
            f"/api/issues/{issue.id}/transition/", {"status_id": done.id}, format="json"
        )
        assert resp.status_code == 200, resp.data
        issue.refresh_from_db()
        assert issue.closed_at is not None
        assert resp.data["is_closed"] is True

    def test_close_and_reopen_actions(
        self, client_for, admin, workspace, project, statuses
    ):
        todo, done = statuses
        issue = Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-4", summary="Lifecycle",
        )
        client = client_for(admin)

        closed = client.post(f"/api/issues/{issue.id}/close/", {}, format="json")
        assert closed.status_code == 200, closed.data
        issue.refresh_from_db()
        assert issue.status_id == done.id
        assert issue.closed_at is not None
        assert closed.data["is_closed"] is True

        # Closing twice is a no-op error, not a crash.
        again = client.post(f"/api/issues/{issue.id}/close/", {}, format="json")
        assert again.status_code == 400

        reopened = client.post(f"/api/issues/{issue.id}/reopen/", {}, format="json")
        assert reopened.status_code == 200, reopened.data
        issue.refresh_from_db()
        assert issue.status_id == todo.id
        assert issue.closed_at is None
        assert reopened.data["is_closed"] is False

    def test_is_overdue_only_for_open_dated_tasks(
        self, workspace, project, statuses
    ):
        todo, done = statuses
        past = timezone.localdate() - timedelta(days=2)
        open_task = Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-5", summary="Late", due_date=past,
        )
        closed_task = Issue.objects.create(
            workspace=workspace, project=project, status=done,
            key="TASK-6", summary="Late but done", due_date=past,
        )
        undated = Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-7", summary="No deadline",
        )
        assert open_task.is_overdue is True
        assert closed_task.is_overdue is False
        assert closed_task.is_closed is True
        assert undated.is_overdue is False

    def test_overview_counts_overdue_from_due_dates(
        self, client_for, admin, workspace, project, statuses
    ):
        todo, _ = statuses
        Issue.objects.create(
            workspace=workspace, project=project, status=todo,
            key="TASK-8", summary="Overdue",
            due_date=timezone.localdate() - timedelta(days=5),
        )
        resp = client_for(admin).get("/api/reports/overview/")
        assert resp.status_code == 200
        assert resp.data["kpis"]["overdue_tasks"] == 1
