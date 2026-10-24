from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from django.contrib.auth import login
from django.contrib.auth import logout as django_logout
from .models import User, Workspace, WorkspaceMember, MembershipRole
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    ChangePasswordSerializer,
    WorkspaceSerializer,
    WorkspaceMemberSerializer,
    WorkspaceMemberProvisionSerializer,
    WorkspaceMemberRoleSerializer,
)
from .permissions import (
    IsAuthenticated,
    TenantAccessPermission,
    IsWorkspaceAdmin,
    IsWorkspaceManager,
)
from .entitlements import check_member_limit
from audit.services import AuditService
from .emails import (
    send_password_changed_email,
    send_provisioned_account_email,
)
import logging
import secrets
import string
logger = logging.getLogger(__name__)


def _current_tenant(request):
    return getattr(request, "tenant", None)


def _audit_context(request):
    return getattr(request, "audit_context", {}) or {}


def _actor_snapshot(user):
    if user is None:
        return {"actor": None, "actor_type": "", "actor_name": "", "actor_email": ""}
    return {
        "actor": user,
        "actor_type": None,  # service defaults to USER when actor present
        "actor_name": "",
        "actor_email": "",
    }


class RegisterView(generics.CreateAPIView):
    """Public self-registration is disabled.

    Workspace accounts are provisioned by a workspace admin, who creates the
    user and emails them a temporary password. Self-signup would users
    outside any workspace, so it is not offered.
    """

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        return Response(
            {
                "detail": (
                    "Self-registration is disabled. Ask your workspace admin to "
                    "create an account for you."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        ctx = _audit_context(request)
        AuditService.log_event(
            actor=user,
            workspace=None,
            action="create",
            module="auth",
            resource_type="user",
            resource_id=user.id,
            resource_name=user.email,
            description=f"User registered: {user.email}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )
        return Response(
            {"user": UserSerializer(user).data, "token": token.key},
            status=status.HTTP_201_CREATED,
        )


class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        ctx = _audit_context(request)
        email = (request.data or {}).get("email", "")
        if not serializer.is_valid():
            AuditService.log_security_event(
                actor=None,
                workspace=None,
                action="auth_failure",
                module="auth",
                resource_type="user",
                resource_id="",
                resource_name=email,
                description=f"Failed login attempt for {email}",
                outcome="denied",
                request_id=ctx.get("request_id", ""),
                http_method=request.method,
                route=ctx.get("route", ""),
                ip_address=ctx.get("ip_address"),
                user_agent=ctx.get("user_agent", ""),
                metadata={"email": email},
            )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.validated_data["user"]
        try:
            login(request, user)
        except Exception:
            pass  # Session save failure should not block token issuance
        token, _ = Token.objects.get_or_create(user=user)
        AuditService.log_event(
            actor=user,
            workspace=None,
            action="login",
            module="auth",
            resource_type="user",
            resource_id=user.id,
            resource_name=user.email,
            description=f"User logged in: {user.email}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )
        return Response({"user": UserSerializer(user).data, "token": token.key})


class LogoutView(generics.GenericAPIView):
    """Server-side logout: invalidates the user's token and records the event."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        ctx = _audit_context(request)
        user = request.user
        try:
            request.user.auth_token.delete()
        except (AttributeError, Token.DoesNotExist):
            pass
        django_logout(request)
        AuditService.log_event(
            actor=user,
            workspace=None,
            action="logout",
            module="auth",
            resource_type="user",
            resource_id=user.id,
            resource_name=user.email,
            description=f"User logged out: {user.email}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )
        return Response({"detail": "Logged out."})


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

class ChangePasswordView(generics.GenericAPIView):
    """Lets a signed-in user replace their password (first login or later)."""

    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        was_first_login = user.must_change_password
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        # Invalidate any other existing tokens for this account.
        Token.objects.filter(user=user).delete()
        token = Token.objects.create(user=user)
        try:
            send_password_changed_email(user)
        except Exception:
            pass  # Password is already changed; email failure must not block.
        ctx = _audit_context(request)
        AuditService.log_event(
            actor=user,
            workspace=None,
            action="update",
            module="auth",
            resource_type="user",
            resource_id=user.id,
            resource_name=user.email,
            description=(
                "Password set on first sign-in"
                if was_first_login
                else "Password changed"
            ),
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )
        return Response({"token": token.key, "user": UserSerializer(user).data})


class WorkspaceListCreateView(generics.ListCreateAPIView):
    serializer_class = WorkspaceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(members__user=self.request.user).distinct()

    def perform_create(self, serializer):
        workspace = serializer.save(owner=self.request.user)
        WorkspaceMember.objects.create(
            user=self.request.user, workspace=workspace, role=MembershipRole.ADMIN
        )
        ctx = _audit_context(self.request)
        AuditService.log_event(
            actor=self.request.user,
            workspace=workspace,
            action="create",
            module="teams",
            resource_type="workspace",
            resource_id=workspace.id,
            resource_name=workspace.name,
            description=f"Workspace created: {workspace.name}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )


class WorkspaceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WorkspaceSerializer
    permission_classes = [TenantAccessPermission, IsWorkspaceAdmin]

    def get_queryset(self):
        return Workspace.objects.all()

    def perform_update(self, serializer):
        workspace = serializer.save()
        ctx = _audit_context(self.request)
        AuditService.log_event(
            actor=self.request.user,
            workspace=workspace,
            action="update",
            module="teams",
            resource_type="workspace",
            resource_id=workspace.id,
            resource_name=workspace.name,
            description=f"Workspace updated: {workspace.name}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )

    def perform_destroy(self, instance):
        if instance.owner != self.request.user:
            raise PermissionDenied("Only the workspace owner can delete it.")
        name = instance.name
        wid = instance.id
        ws = instance
        instance.delete()
        ctx = _audit_context(self.request)
        AuditService.log_event(
            actor=self.request.user,
            workspace=None,
            action="delete",
            module="teams",
            resource_type="workspace",
            resource_id=wid,
            resource_name=name,
            description=f"Workspace deleted: {name}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )


class WorkspaceMemberListView(generics.ListCreateAPIView):
    """List workspace members, or provision a brand-new account.

    Members never sign themselves up: an admin supplies the email and role,
    the account is created here, and the new user receives their login
    credentials by email. They must set a new password on first sign-in.

    Managers may GET the roster (they need it to staff their own project
    teams) but may not POST: onboarding users is admin-only.
    """

    serializer_class = WorkspaceMemberSerializer
    permission_classes = [TenantAccessPermission, IsWorkspaceManager]

    def get_permissions(self):
        # POST provisions a new account, so it is tighter than GET. Managers
        # may read the roster (to staff their own project teams) but must not
        # onboard users into the system.
        if self.request.method == "POST":
            permission_classes = [TenantAccessPermission, IsWorkspaceAdmin]
        else:
            permission_classes = self.permission_classes
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        tenant = _current_tenant(self.request)
        qs = WorkspaceMember.objects.filter(workspace=tenant).select_related("user")
        user = self.request.user
        if user.is_superuser:
            return qs
        role = (
            WorkspaceMember.objects.filter(workspace=tenant, user=user)
            .values_list("role", flat=True)
            .first()
        )
        if role != MembershipRole.ADMIN:
            # Managers only see people on the projects they manage (plus
            # themselves and whoever those projects belong to), never the
            # whole workspace roster.
            from django.db.models import Q
            from projects.models import Project
            person_ids = Project.objects.filter(
                workspace=tenant, manager=user
            ).values_list("team_members__id", flat=True)
            qs = qs.filter(Q(user_id__in=person_ids) | Q(user_id=user.id))
        return qs

    @staticmethod
    def _generate_password(length=14):
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        return "".join(secrets.choice(alphabet) for _ in range(length))

    def create(self, request, *args, **kwargs):
        tenant = _current_tenant(self.request)
        serializer = WorkspaceMemberProvisionSerializer(
            data=request.data, context={"workspace": tenant, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        check_member_limit(tenant)

        email = serializer.validated_data["email"]
        role = serializer.validated_data["role"]
        first_name = serializer.validated_data.get("first_name", "")
        last_name = serializer.validated_data.get("last_name", "")
        temporary_password = self._generate_password()

        user = User.objects.create_user(
            email=email,
            username=email,
            password=temporary_password,
            first_name=first_name,
            last_name=last_name,
            must_change_password=True,
        )
        member = WorkspaceMember.objects.create(
            user=user, workspace=tenant, role=role
        )

        email_sent = True
        try:
            send_provisioned_account_email(
                user=user,
                workspace=tenant,
                role=role,
                temporary_password=temporary_password,
                invited_by=request.user,
            )
        except Exception:
            email_sent = False
            logger.exception("Could not email credentials to %s", user.email)
        ctx = _audit_context(request)
        AuditService.log_event(
            actor=request.user,
            workspace=tenant,
            action="membership_add",
            module="teams",
            resource_type="workspace_member",
            resource_id=member.id,
            resource_name=user.email,
            description=f"Account created and added as {role}: {user.email}",
            outcome="success",
            changed_fields={"role": {"from": None, "to": role}},
            request_id=ctx.get("request_id", ""),
            http_method=request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(request.session, "session_key", "") or "",
        )

        data = WorkspaceMemberSerializer(member).data
        data["email_sent"] = email_sent
        return Response(data, status=status.HTTP_201_CREATED)


class WorkspaceMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WorkspaceMemberSerializer
    permission_classes = [TenantAccessPermission, IsWorkspaceAdmin]
    lookup_url_kwarg = "member_id"

    def get_queryset(self):
        tenant = _current_tenant(self.request)
        return WorkspaceMember.objects.filter(workspace=tenant)

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return WorkspaceMemberRoleSerializer
        return WorkspaceMemberSerializer

    def perform_update(self, serializer):
        instance = serializer.instance
        old_role = instance.role
        member = serializer.save()
        ctx = _audit_context(self.request)
        if old_role != member.role:
            AuditService.log_event(
                actor=self.request.user,
                workspace=member.workspace,
                action="membership_role_change",
                module="teams",
                resource_type="workspace_member",
                resource_id=member.id,
                resource_name=member.user.email,
                description=(
                    f"Role changed for {member.user.email}: "
                    f"{old_role} -> {member.role}"
                ),
                outcome="success",
                changed_fields={
                    "role": {"from": old_role, "to": member.role}
                },
                request_id=ctx.get("request_id", ""),
                http_method=self.request.method,
                route=ctx.get("route", ""),
                ip_address=ctx.get("ip_address"),
                user_agent=ctx.get("user_agent", ""),
                session_key=getattr(self.request.session, "session_key", "") or "",
            )

    def perform_destroy(self, instance):
        email = instance.user.email
        workspace = instance.workspace
        mid = instance.id
        instance.delete()
        ctx = _audit_context(self.request)
        AuditService.log_event(
            actor=self.request.user,
            workspace=workspace,
            action="membership_remove",
            module="teams",
            resource_type="workspace_member",
            resource_id=mid,
            resource_name=email,
            description=f"Member removed: {email}",
            outcome="success",
            request_id=ctx.get("request_id", ""),
            http_method=self.request.method,
            route=ctx.get("route", ""),
            ip_address=ctx.get("ip_address"),
            user_agent=ctx.get("user_agent", ""),
            session_key=getattr(self.request.session, "session_key", "") or "",
        )
