from django.db import models
from django.conf import settings
from tenants.models import Workspace, WorkspaceMember, MembershipRole
from projects.models import Project
from .models import Notification, NotificationScope, NotificationType

User = settings.AUTH_USER_MODEL


def workspace_member_ids(workspace):
    """Return user IDs of all members of a workspace."""
    return list(
        WorkspaceMember.objects.filter(workspace=workspace).values_list(
            "user_id", flat=True
        )
    )


def project_member_ids(project):
    """Return user IDs of members of a project.

    A project member is anyone who:
    - created, owns, manages, or is explicitly on the project team, or
    - is assigned to or reported an issue in the project.
    """
    user_ids = set()
    if project.created_by_id:
        user_ids.add(project.created_by_id)
    if project.owner_id:
        user_ids.add(project.owner_id)
    if project.manager_id:
        user_ids.add(project.manager_id)
    user_ids.update(project.team_members.values_list("id", flat=True))

    from issues.models import Issue

    issue_user_ids = (
        Issue.objects.filter(project=project)
        .exclude(assignee__isnull=True)
        .values_list("assignee_id", flat=True)
    )
    user_ids.update(issue_user_ids)
    reporter_ids = (
        Issue.objects.filter(project=project)
        .exclude(reporter__isnull=True)
        .values_list("reporter_id", flat=True)
    )
    user_ids.update(reporter_ids)

    user_ids.discard(None)
    return list(user_ids)


def notify_workspace_members(
    workspace,
    *,
    type,
    title,
    message="",
    link="",
    exclude_user_id=None,
):
    """Create a workspace-scoped notification for every workspace member."""
    created = 0
    for user_id in workspace_member_ids(workspace):
        if exclude_user_id is not None and user_id == exclude_user_id:
            continue
        Notification.objects.create(
            workspace=workspace,
            project=None,
            scope=NotificationScope.WORKSPACE,
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            link=link,
        )
        created += 1
    return created


def notify_project_members(
    project,
    *,
    type,
    title,
    message="",
    link="",
    exclude_user_id=None,
):
    """Create a project-scoped notification for every project member.

    Only members of the project receive the notification; users outside the
    project never get it.
    """
    created = 0
    for user_id in project_member_ids(project):
        if exclude_user_id is not None and user_id == exclude_user_id:
            continue
        Notification.objects.create(
            workspace=project.workspace,
            project=project,
            scope=NotificationScope.PROJECT,
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            link=link,
        )
        created += 1
    return created
