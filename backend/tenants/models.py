from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
from django.utils import timezone
import uuid


class InvitationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    EXPIRED = "expired", "Expired"
    REVOKED = "revoked", "Revoked"


class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar_url = models.URLField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    must_change_password = models.BooleanField(
        default=False,
        help_text=(
            "Set for accounts provisioned by a workspace admin: the user must "
            "replace the emailed temporary password before using the app."
        ),
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email


class Workspace(models.Model):
    """A tenant workspace. Every company gets its own isolated workspace."""

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=100, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="owned_workspaces",
    )
    plan = models.CharField(max_length=50, default="free")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class MembershipRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    MANAGER = "manager", "Manager"
    MEMBER = "member", "Member"
    VIEWER = "viewer", "Viewer"


class WorkspaceMember(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="members",
    )
    role = models.CharField(
        max_length=20, choices=MembershipRole.choices, default=MembershipRole.MEMBER
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "workspace")
        ordering = ["user__email"]

    def __str__(self):
        return f"{self.user.email} @ {self.workspace.slug} ({self.role})"


class Invitation(models.Model):
    """Workspace invitation — allows email-based users to join a workspace."""

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="invitations",
    )
    email = models.EmailField()
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_invitations",
    )
    role = models.CharField(
        max_length=20,
        choices=MembershipRole.choices,
        default=MembershipRole.MEMBER,
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
    )
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["workspace", "email"]),
            models.Index(fields=["status", "expires_at"]),
        ]
        unique_together = ("workspace", "email", "status")

    def __str__(self):
        return f"{self.email} -> {self.workspace.slug} ({self.status})"

    def is_expired(self):
        return self.status != InvitationStatus.PENDING or self.expires_at < timezone.now()

    def accept(self, user):
        if self.is_expired():
            raise ValueError("Invitation is expired or already processed.")
        self.status = InvitationStatus.ACCEPTED
        self.accepted_at = timezone.now()
        self.save(update_fields=["status", "accepted_at"])
        WorkspaceMember.objects.create(
            user=user,
            workspace=self.workspace,
            role=self.role,
        )
