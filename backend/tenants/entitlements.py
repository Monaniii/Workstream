from rest_framework.exceptions import PermissionDenied
from tenants.models import Workspace


def _get_subscription(workspace: Workspace):
    from billing.models import Subscription

    return Subscription.objects.filter(workspace=workspace).select_related("plan").first()


def check_member_limit(workspace: Workspace):
    """Raise PermissionDenied if the workspace has reached its plan's member limit."""
    subscription = _get_subscription(workspace)
    if not subscription or not subscription.plan:
        return
    max_users = subscription.plan.max_users
    if max_users is None:
        return  # unlimited
    current_count = workspace.members.count()
    if current_count >= max_users:
        raise PermissionDenied(
            f"Workspace member limit reached ({max_users}). Upgrade your plan to add more members."
        )


def check_project_limit(workspace: Workspace):
    """Raise PermissionDenied if the workspace has reached its plan's project limit."""
    subscription = _get_subscription(workspace)
    if not subscription or not subscription.plan:
        return
    max_projects = subscription.plan.max_projects
    if max_projects is None:
        return  # unlimited
    current_count = workspace.projects.count()
    if current_count >= max_projects:
        raise PermissionDenied(
            f"Workspace project limit reached ({max_projects}). Upgrade your plan to create more projects."
        )


def check_board_limit(workspace: Workspace):
    """Raise PermissionDenied if the workspace has reached its plan's board limit."""
    subscription = _get_subscription(workspace)
    if not subscription or not subscription.plan:
        return
    max_boards = subscription.plan.max_boards
    if max_boards is None:
        return  # unlimited
    current_count = workspace.boards.count()
    if current_count >= max_boards:
        raise PermissionDenied(
            f"Workspace board limit reached ({max_boards}). Upgrade your plan to create more boards."
        )


def enforce_entitlement(workspace: Workspace, resource: str):
    """Dispatch to the appropriate entitlement check for a resource type."""
    checks = {
        "member": check_member_limit,
        "project": check_project_limit,
        "board": check_board_limit,
    }
    check = checks.get(resource)
    if check:
        check(workspace)
