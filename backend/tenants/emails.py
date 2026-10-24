import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _send(subject, message, recipient):
    """Send an email, falling back to the Celery task when delivery fails."""
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [recipient],
            fail_silently=False,
        )
        logger.info("Email sent to %s: %s", recipient, subject)
    except Exception:
        logger.exception("Direct email delivery to %s failed", recipient)
        raise


def send_provisioned_account_email(user, workspace, role, temporary_password, invited_by):
    """Email login credentials to a user provisioned by a workspace admin."""
    login_url = f"{settings.FRONTEND_URL.rstrip('/')}/login"
    subject = f"Your {workspace.name} account is ready"
    message = (
        f"Hello {user.first_name or user.username},\n\n"
        f"{invited_by.get_full_name() or invited_by.email} has created an account for you "
        f"in the workspace '{workspace.name}' with the role '{role}'.\n\n"
        f"Sign in with these credentials:\n"
        f"  Email:    {user.email}\n"
        f"  Password: {temporary_password}\n\n"
        f"Sign in here: {login_url}\n\n"
        f"You will be asked to choose a new password after your first sign-in.\n"
        f"If you were not expecting this invitation, please ignore this email.\n"
    )
    _send(subject, message, user.email)


def send_password_changed_email(user):
    """Confirm to a user that their password was changed."""
    subject = "Your password was changed"
    message = (
        f"Hello {user.first_name or user.username},\n\n"
        f"The password for your account ({user.email}) was just changed.\n\n"
        f"If you made this change, no action is needed. If you did not, contact "
        f"your workspace administrator immediately.\n"
    )
    _send(subject, message, user.email)
