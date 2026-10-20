import csv
import hashlib
import hmac
import io
import json

import requests
from celery import shared_task
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from notifications.models import Notification, NotificationType
from webhooks.models import WebhookEndpoint, WebhookDelivery
from tenants.models import Workspace


@shared_task(bind=True, max_retries=3)
def deliver_webhook_task(self, endpoint_id, event, payload):
    endpoint = WebhookEndpoint.objects.get(id=endpoint_id)
    payload_bytes = json.dumps(payload).encode("utf-8")
    signature = (
        hmac.new(endpoint.secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
        if endpoint.secret
        else ""
    )
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Event": event,
        "X-Webhook-Signature": signature,
    }
    try:
        resp = requests.post(
            endpoint.url, data=payload_bytes, headers=headers, timeout=10
        )
        WebhookDelivery.objects.create(
            endpoint=endpoint,
            event=event,
            payload=payload,
            status_code=resp.status_code,
            response_body=resp.text[:2000],
        )
        if resp.status_code >= 400:
            raise requests.HTTPError(f"HTTP {resp.status_code}")
    except Exception as exc:
        WebhookDelivery.objects.create(
            endpoint=endpoint,
            event=event,
            payload=payload,
            response_body=str(exc)[:2000],
        )
        raise self.retry(exc=exc, countdown=2**self.request.retries)


@shared_task
def send_notification_task(workspace_id, user_id, type_, title, message="", link=""):
    workspace = Workspace.objects.get(id=workspace_id)
    Notification.objects.create(
        workspace=workspace,
        user_id=user_id,
        type=type_,
        title=title,
        message=message,
        link=link,
    )


@shared_task
def send_assignment_notification(issue_id, assignee_id, actor_id):
    from issues.models import Issue

    User = get_user_model()
    issue = Issue.objects.get(id=issue_id)
    assignee = User.objects.get(id=assignee_id)
    actor = User.objects.get(id=actor_id)
    send_notification_task.delay(
        issue.workspace_id,
        assignee.id,
        NotificationType.ISSUE_ASSIGNED,
        f"Issue {issue.key} assigned to you",
        f"{actor.email} assigned you to {issue.key}: {issue.summary}",
        link=f"/projects/{issue.project_id}/board",
    )


@shared_task
def send_report_task(workspace_id, user_id, report_type, filters):
    """Generate a report (CSV/JSON) and notify the user when ready."""
    workspace = Workspace.objects.get(id=workspace_id)
    User = get_user_model()
    user = User.objects.get(id=user_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Key", "Summary", "Status", "Priority", "Assignee"])
    from issues.models import Issue

    qs = Issue.objects.filter(workspace=workspace, **filters)
    for issue in qs:
        writer.writerow(
            [
                issue.key,
                issue.summary,
                issue.status.name,
                issue.priority,
                issue.assignee.email if issue.assignee else "",
            ]
        )
    send_mail(
        subject=f"{report_type} report ready",
        message=f"Your {report_type} report is ready. {qs.count()} issues found.",
        from_email=None,
        recipient_list=[user.email],
    )
    send_notification_task.delay(
        workspace_id,
        user.id,
        NotificationType.REPORT_READY,
        f"{report_type} report ready",
        f"Your report contains {qs.count()} issues.",
    )
