from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_project_team_member(user, project):
    return project.team_members.filter(pk=user.pk).exists()


class IsProjectTeamMember(BasePermission):
    message = "Only project team members can modify issues."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        issue = getattr(obj, "issue", obj)
        return is_project_team_member(request.user, issue.project)
