import pytest
from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from issues.models import Issue, IssueStatus
from notifications.models import Notification
from projects.models import Board, Project
from tenants.models import Workspace, WorkspaceMember


User = get_user_model()


@pytest.fixture
def issue_api_context(db):
    user = User.objects.create_user(
        email="planner@example.com",
        username="planner",
        password="test-password-123",
    )
    workspace = Workspace.objects.create(
        name="Planning workspace",
        slug="planning-workspace",
        owner=user,
    )
    WorkspaceMember.objects.create(
        user=user,
        workspace=workspace,
        role="member",
    )
    project = Project.objects.create(
        workspace=workspace,
        name="Planning project",
        key="PLAN",
    )
    project.team_members.add(user)
    status = IssueStatus.objects.create(
        workspace=workspace,
        name="To Do",
        key="todo",
        is_initial=True,
    )
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=workspace.slug,
    )
    return {
        "client": client,
        "project": project,
        "status": status,
        "user": user,
        "workspace": workspace,
    }


def create_issue(context, summary, **extra):
    response = context["client"].post(
        "/api/issues/",
        {
            "project": context["project"].id,
            "status": context["status"].id,
            "summary": summary,
            **extra,
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    return response.data


@pytest.mark.django_db
def test_parent_issue_and_dependencies_are_serialized(issue_api_context):
    parent = create_issue(issue_api_context, "Parent task")
    dependency = create_issue(issue_api_context, "Prerequisite")
    child = create_issue(
        issue_api_context,
        "Subtask",
        parent_issue=parent["id"],
        blocked_by=[dependency["id"]],
    )

    assert child["parent_issue"] == parent["id"]
    assert child["blocked_by"] == [dependency["id"]]
    parent_issue = Issue.objects.get(pk=parent["id"])
    assert list(parent_issue.subtasks.values_list("id", flat=True)) == [child["id"]]


@pytest.mark.django_db
def test_dependency_cycle_is_rejected(issue_api_context):
    prerequisite = create_issue(issue_api_context, "Prerequisite")
    dependent = create_issue(
        issue_api_context,
        "Dependent",
        blocked_by=[prerequisite["id"]],
    )

    response = issue_api_context["client"].patch(
        f"/api/issues/{prerequisite['id']}/",
        {"blocked_by": [dependent["id"]]},
        format="json",
    )

    assert response.status_code == 400
    assert "blocked_by" in response.data


@pytest.mark.django_db
def test_team_member_cannot_move_issue_to_project_they_are_not_on(issue_api_context):
    issue = create_issue(issue_api_context, "Team task")
    other_project = Project.objects.create(
        workspace=issue_api_context["workspace"],
        name="Other project",
        key="OTHER",
    )

    response = issue_api_context["client"].patch(
        f"/api/issues/{issue['id']}/",
        {"project": other_project.id},
        format="json",
    )

    assert response.status_code == 403
    assert (
        Issue.objects.get(pk=issue["id"]).project_id
        == issue_api_context["project"].id
    )


@pytest.mark.django_db
def test_non_team_member_can_view_but_not_modify_issues(issue_api_context):
    issue_data = create_issue(issue_api_context, "Team task")
    outsider = User.objects.create_user(
        email="outsider@example.com",
        username="outsider",
        password="test-password-123",
    )
    WorkspaceMember.objects.create(
        user=outsider,
        workspace=issue_api_context["workspace"],
        role="manager",
    )
    token, _ = Token.objects.get_or_create(user=outsider)
    outsider_client = APIClient()
    outsider_client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=issue_api_context["workspace"].slug,
    )
    issue_url = f"/api/issues/{issue_data['id']}/"

    assert outsider_client.get(issue_url).status_code == 200

    update = outsider_client.patch(
        issue_url, {"summary": "Unauthorized"}, format="json"
    )
    move = outsider_client.post(
        f"{issue_url}move/",
        {"column_id": "done", "position": 1},
        format="json",
    )
    transition = outsider_client.post(
        f"{issue_url}transition/",
        {"status_id": issue_api_context["status"].id},
        format="json",
    )
    close = outsider_client.post(f"{issue_url}close/", {}, format="json")
    delete = outsider_client.delete(issue_url)
    create = outsider_client.post(
        "/api/issues/",
        {
            "project": issue_api_context["project"].id,
            "status": issue_api_context["status"].id,
            "summary": "Unauthorized issue",
        },
        format="json",
    )

    assert update.status_code == 403
    assert move.status_code == 403
    assert transition.status_code == 403
    assert close.status_code == 403
    assert delete.status_code == 403
    assert create.status_code == 403
    assert Issue.objects.get(pk=issue_data["id"]).summary == "Team task"


@pytest.mark.django_db
def test_non_team_member_cannot_comment_on_project_issue(issue_api_context):
    issue_data = create_issue(issue_api_context, "Team task")
    outsider = User.objects.create_user(
        email="commenter@example.com",
        username="commenter",
        password="test-password-123",
    )
    WorkspaceMember.objects.create(
        user=outsider,
        workspace=issue_api_context["workspace"],
        role="member",
    )
    token, _ = Token.objects.get_or_create(user=outsider)
    outsider_client = APIClient()
    outsider_client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=issue_api_context["workspace"].slug,
    )

    response = outsider_client.post(
        "/api/issues/comments/",
        {"issue": issue_data["id"], "body": "Unauthorized comment"},
        format="json",
    )

    assert response.status_code == 403
    assert Issue.objects.get(pk=issue_data["id"]).comments.count() == 0


@pytest.mark.django_db
def test_parent_must_be_in_same_project(issue_api_context):
    parent = create_issue(issue_api_context, "Parent task")
    another_project = Project.objects.create(
        workspace=issue_api_context["workspace"],
        name="Other project",
        key="OTHER",
    )
    response = issue_api_context["client"].post(
        "/api/issues/",
        {
            "project": another_project.id,
            "status": issue_api_context["status"].id,
            "summary": "Invalid child",
            "parent_issue": parent["id"],
        },
        format="json",
    )

    assert response.status_code == 400
    assert "parent_issue" in response.data


@pytest.mark.django_db
def test_dependencies_cannot_cross_workspaces(issue_api_context):
    other_user = User.objects.create_user(
        email="other@example.com",
        username="other",
        password="test-password-123",
    )
    other_workspace = Workspace.objects.create(
        name="Other workspace",
        slug="other-workspace",
        owner=other_user,
    )
    other_project = Project.objects.create(
        workspace=other_workspace,
        name="Other project",
        key="OTHER",
    )
    other_status = IssueStatus.objects.create(
        workspace=other_workspace,
        name="To Do",
        key="todo",
        is_initial=True,
    )
    foreign_issue = Issue.objects.create(
        workspace=other_workspace,
        project=other_project,
        key="OTHER-1",
        summary="Private task",
        status=other_status,
    )
    own_issue = create_issue(issue_api_context, "Workspace task")

    response = issue_api_context["client"].patch(
        f"/api/issues/{own_issue['id']}/",
        {"blocked_by": [foreign_issue.id]},
        format="json",
    )

    assert response.status_code == 400
    assert "blocked_by" in response.data


@pytest.mark.django_db
def test_comment_mentions_notify_project_teammates(issue_api_context):
    teammate = User.objects.create_user(
        email="teammate@example.com",
        username="teammate",
        password="test-password-123",
    )
    WorkspaceMember.objects.create(
        user=teammate,
        workspace=issue_api_context["workspace"],
        role="member",
    )
    issue_api_context["project"].team_members.add(teammate)
    issue = create_issue(issue_api_context, "Review task")

    response = issue_api_context["client"].post(
        "/api/issues/comments/",
        {
            "issue": issue["id"],
            "body": "Please review this when you can, @teammate@example.com",
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    mention = Notification.objects.get(
        user=teammate,
        project=issue_api_context["project"],
        title=f"You were mentioned on {issue['key']}",
    )
    assert mention.scope == "project"

    token, _ = Token.objects.get_or_create(user=teammate)
    teammate_client = APIClient()
    teammate_client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_TENANT_SLUG=issue_api_context["workspace"].slug,
    )
    inbox = teammate_client.get("/api/notifications/notifications/")

    assert inbox.status_code == 200
    assert any(item["id"] == mention.id for item in inbox.data["results"])


@pytest.mark.django_db
def test_my_work_returns_only_assigned_tasks_and_filters_buckets(issue_api_context):
    task = Issue.objects.create(
        workspace=issue_api_context["workspace"],
        project=issue_api_context["project"],
        key="PLAN-1",
        summary="Assigned work",
        status=issue_api_context["status"],
        assignee=issue_api_context["user"],
    )

    response = issue_api_context["client"].get("/api/issues/my-work/?bucket=open")

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == task.id

    invalid_bucket = issue_api_context["client"].get(
        "/api/issues/my-work/?bucket=unknown"
    )
    assert invalid_bucket.status_code == 400


@pytest.mark.django_db
def test_status_transition_moves_task_to_matching_board_column(issue_api_context):
    final_status = IssueStatus.objects.create(
        workspace=issue_api_context["workspace"],
        name="Done",
        key="done",
        is_final=True,
    )
    Board.objects.create(
        workspace=issue_api_context["workspace"],
        project=issue_api_context["project"],
        name="Planning board",
        columns=[
            {"id": "todo", "name": "To Do"},
            {"id": "done", "name": "Done"},
        ],
    )
    issue = create_issue(issue_api_context, "Finish task")

    response = issue_api_context["client"].post(
        f"/api/issues/{issue['id']}/transition/",
        {"status_id": final_status.id},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["column_id"] == "done"
