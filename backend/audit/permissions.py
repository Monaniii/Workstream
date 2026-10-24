from rest_framework import permissions
from tenants.models import WorkspaceMember, MembershipRole


class IsAuditAdministrator(permissions.BasePermission):
    """Allow platform superusers and tenant workspace administrators.

    Superusers have platform-wide access. Tenant workspace administrators may
    only access events within their own workspace; tenant isolation is enforced
    in the view queryset, not here.
    """

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(request.user, "is_superuser", False):
            return True
        # Audit events are always scoped to a workspace; without one there is
        # no tenant administrator context to authorise against.
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return False
        return WorkspaceMember.objects.filter(
            user=request.user, workspace=tenant, role=MembershipRole.ADMIN
        ).exists()
