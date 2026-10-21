import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_invitation_email(self, invitation_id, workspace_name, inviter_email, accept_url):
    """Send a workspace invitation email."""
    from tenants.models import Invitation

    try:
        invitation = Invitation.objects.get(id=invitation_id)
    except Invitation.DoesNotExist:
        logger.warning("Invitation %s not found, skipping email", invitation_id)
        return

    if invitation.status != invitation.PENDING:
        logger.info("Invitation %s is %s, not sending email", invitation_id, invitation.status)
        return

    subject = f"You're invited to join {workspace_name}"
    message = (
        f"You have been invited by {inviter_email} to join the workspace '{workspace_name}' "
        f"as a {invitation.role}.\n\n"
        f"Accept invitation: {accept_url}\n\n"
        f"This invitation expires on {invitation.expires_at.strftime('%Y-%m-%d')}."
    )

    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [invitation.email],
            fail_silently=False,
        )
        logger.info("Invitation email sent to %s", invitation.email)
    except Exception as exc:
        logger.error("Failed to send invitation email: %s", exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_issue_assigned_notification(self, issue_id, assignee_id, assigner_email):
    """Notify a user when they are assigned to an issue."""
    from issues.models import Issue
    from notifications.models import Notification

    try:
        issue = Issue.objects.select_related("project", "workspace").get(id=issue_id)
    except Issue.DoesNotExist:
        logger.warning("Issue %s not found, skipping notification", issue_id)
        return

    from tenants.models import User

    try:
        assignee = User.objects.get(id=assignee_id)
    except User.DoesNotExist:
        logger.warning("Assignee %s not found, skipping notification", assignee_id)
        return

    Notification.objects.create(
        workspace=issue.workspace,
        user=assignee,
        type="issue.assigned",
        title=f"Issue assigned: {issue.key}",
        message=(
            f"You have been assigned to issue {issue.key} ({issue.summary}) "
            f"in project {issue.project.key} by {assigner_email}."
        ),
        link=f"/app/{issue.workspace.slug}/projects/{issue.project.id}/issues/{issue.id}",
    )
    logger.info("Issue assignment notification created for issue %s", issue_id)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_issue_comment_notification(self, comment_id, issue_id, author_email):
    """Notify issue assignee and watchers of a new comment."""
    from issues.models import IssueComment, Issue
    from notifications.models import Notification
    from tenants.models import User

    try:
        comment = IssueComment.objects.select_related("issue").get(id=comment_id)
    except IssueComment.DoesNotExist:
        logger.warning("Comment %s not found, skipping notification", comment_id)
        return

    issue = comment.issue
    recipients = set()
    if issue.assignee_id and issue.assignee_id != comment.author_id:
        recipients.add(issue.assignee_id)
    if issue.reporter_id and issue.reporter_id != comment.author_id:
        recipients.add(issue.reporter_id)

    for user_id in recipients:
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            continue
        Notification.objects.create(
            workspace=issue.workspace,
            user=user,
            type="issue.commented",
            title=f"New comment on {issue.key}",
            message=(
                f"{author_email} commented on issue {issue.key} ({issue.summary}): "
                f"{comment.body[:100]}..."
            ),
            link=f"/app/{issue.workspace.slug}/projects/{issue.project.id}/issues/{issue.id}",
        )
    logger.info("Issue comment notifications created for issue %s", issue_id)


@shared_task
def send_due_date_reminders():
    """Remind assignees about issues due soon (for Celery Beat)."""
    from issues.models import Issue
    from notifications.models import Notification
    from tenants.models import User

    soon = timezone.now() + timedelta(days=1)
    issues = Issue.objects.filter(
        due_date__isnull=False,
        due_date__lte=soon,
        due_date__gte=timezone.now(),
        status__is_final=False,
    ).select_related("assignee", "workspace", "project")

    count = 0
    for issue in issues:
        if not issue.assignee_id:
            continue
        Notification.objects.create(
            workspace=issue.workspace,
            user=issue.assignee,
            type="issue.assigned",
            title=f"Due soon: {issue.key}",
            message=f"Issue {issue.key} ({issue.summary}) is due on {issue.due_date.strftime('%Y-%m-%d')}.",
            link=f"/app/{issue.workspace.slug}/projects/{issue.project.id}/issues/{issue.id}",
        )
        count += 1
    logger.info("Due date reminders sent: %d", count)
    return count


@shared_task
def send_sprint_reminders():
    """Remind teams about sprints starting soon (for Celery Beat)."""
    from projects.models import Sprint
    from notifications.models import Notification
    from issues.models import Issue

    soon = timezone.now() + timedelta(days=2)
    sprints = Sprint.objects.filter(
        start_date__isnull=False,
        start_date__lte=soon,
        start_date__gte=timezone.now(),
        status="planning",
    ).select_related("workspace", "board")

    count = 0
    for sprint in sprints:
        issues = Issue.objects.filter(
            workspace=sprint.workspace,
            sprint=sprint,
        ).select_related("assignee")
        for issue in issues:
            if issue.assignee_id:
                Notification.objects.create(
                    workspace=sprint.workspace,
                    user=issue.assignee,
                    type="issue.assigned",
                    title=f"Sprint starting: {sprint.name}",
                    message=f"Sprint '{sprint.name}' starts on {sprint.start_date.strftime('%Y-%m-%d')}. Issue {issue.key} is assigned to you.",
                    link=f"/app/{sprint.workspace.slug}/projects/{issue.project.id}/sprints/{sprint.id}",
                )
                count += 1
    logger.info("Sprint reminders sent: %d", count)
    return count


@shared_task
def cleanup_expired_invitations():
    """Mark expired invitations as expired (for Celery Beat)."""
    from tenants.models import Invitation

    now = timezone.now()
    expired = Invitation.objects.filter(
        status=Invitation.PENDING,
        expires_at__lt=now,
    )
    count = expired.update(status=Invitation.EXPIRED)
    logger.info("Expired invitations marked: %d", count)
    return count


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_subscription_notification(self, workspace_id, event_type, message):
    """Send subscription-related notifications to workspace admins."""
    from tenants.models import Workspace, WorkspaceMember
    from notifications.models import Notification

    try:
        workspace = Workspace.objects.get(id=workspace_id)
    except Workspace.DoesNotExist:
        logger.warning("Workspace %s not found, skipping subscription notification", workspace_id)
        return

    admins = WorkspaceMember.objects.filter(
        workspace=workspace,
        role__in=["admin"],
    ).select_related("user")

    for member in admins:
        Notification.objects.create(
            workspace=workspace,
            user=member.user,
            type="subscription.active" if event_type == "activated" else "subscription.past_due",
            title=f"Subscription {event_type}",
            message=message,
        )
    logger.info("Subscription notification sent for workspace %s: %s", workspace_id, event_type)
