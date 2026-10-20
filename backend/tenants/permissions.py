from rest_framework import permissions
from .models import WorkspaceMember, MembershipRole


class IsAuthenticated(permissions.IsAuthenticated):
    pass


class TenantAccessPermission(permissions.BasePermission):
    """Require an active tenant (workspace) on the request."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return bool(getattr(request, "tenant", None))


class WorkspaceRolePermission(permissions.BasePermission):
    """
    Role-based access control within a workspace.
    Required roles is a list/set of role slugs allowed for the action.
    """

    required_roles = frozenset()

    def get_required_roles(self, view):
        roles = getattr(view, "required_roles", self.required_roles)
        if isinstance(roles, str):
            return frozenset([roles])
        return frozenset(roles)

    def has_permission(self, request, view):
        if not request.user.is_authenticated or not getattr(request, "tenant", None):
            return False
        try:
            membership = WorkspaceMember.objects.get(
                user=request.user, workspace=request.tenant
            )
        except WorkspaceMember.DoesNotExist:
            return False
        return membership.role in self.get_required_roles(view)

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class IsWorkspaceAdmin(WorkspaceRolePermission):
    required_roles = frozenset([MembershipRole.ADMIN])


class IsWorkspaceManager(WorkspaceRolePermission):
    required_roles = frozenset([MembershipRole.ADMIN, MembershipRole.MANAGER])


class IsWorkspaceMember(WorkspaceRolePermission):
    required_roles = frozenset(
        [MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.MEMBER]
    )


class IsWorkspaceUser(WorkspaceRolePermission):
    """Any member of the workspace (read for viewers)."""

    required_roles = frozenset(
        [
            MembershipRole.ADMIN,
            MembershipRole.MANAGER,
            MembershipRole.MEMBER,
            MembershipRole.VIEWER,
        ]
    )
