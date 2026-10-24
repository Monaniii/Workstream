from rest_framework import serializers
from tenants.models import MembershipRole, WorkspaceMember
from .models import (
    IssueStatus,
    Issue,
    IssueComment,
    IssueAttachment,
    AuditLog,
)


class IssueStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = IssueStatus
        fields = (
            "id",
            "workspace",
            "name",
            "key",
            "color",
            "is_initial",
            "is_final",
            "position",
        )
        read_only_fields = ("id",)


class IssueSerializer(serializers.ModelSerializer):
    status_name = serializers.CharField(source="status.name", read_only=True)
    status_key = serializers.CharField(source="status.key", read_only=True)
    status_is_final = serializers.BooleanField(source="status.is_final", read_only=True)
    assignee_email = serializers.EmailField(source="assignee.email", read_only=True)
    reporter_email = serializers.EmailField(source="reporter.email", read_only=True)
    project_key = serializers.CharField(source="project.key", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)

    class Meta:
        model = Issue
        fields = (
            "id",
            "workspace",
            "project",
            "project_key",
            "project_name",
            "board",
            "sprint",
            "key",
            "summary",
            "description",
            "status",
            "status_name",
            "status_key",
            "status_is_final",
            "priority",
            "issue_type",
            "assignee",
            "assignee_email",
            "reporter",
            "reporter_email",
            "column_id",
            "position",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "workspace", "key", "created_at", "updated_at")

    def validate(self, attrs):
        request = self.context.get("request")
        project = attrs.get("project", self.instance.project if self.instance else None)
        if project and request and project.workspace_id != request.tenant.id:
            raise serializers.ValidationError(
                {"project": "Project does not belong to this workspace."}
            )

        assignee_provided = "assignee" in attrs
        assignee = attrs.get(
            "assignee",
            self.instance.assignee if self.instance else None,
        )
        project_changed = bool(
            self.instance and project and project.pk != self.instance.project_id
        )
        if assignee_provided or (project_changed and assignee is not None):
            if not project or not request:
                raise serializers.ValidationError(
                    {"assignee": "A project and authenticated workspace are required."}
                )
            role = WorkspaceMember.objects.filter(
                workspace=project.workspace, user=request.user
            ).values_list("role", flat=True).first()
            if (
                role not in (MembershipRole.ADMIN, MembershipRole.MANAGER)
                and project.manager_id != request.user.id
            ):
                raise serializers.ValidationError(
                    {"assignee": "Only workspace admins, managers, or the project manager can assign tasks."}
                )
            if assignee is not None:
                assignee_membership = (
                    WorkspaceMember.objects.filter(
                        workspace=project.workspace, user=assignee
                    )
                    .only("role")
                    .first()
                    if project
                    else None
                )
                if not assignee_membership:
                    raise serializers.ValidationError(
                        {"assignee": "Assignee must belong to this workspace."}
                    )
                if assignee_membership.role == MembershipRole.VIEWER:
                    raise serializers.ValidationError(
                        {"assignee": "Read-only viewers cannot be assigned tasks."}
                    )
                if not project.team_members.filter(pk=assignee.pk).exists():
                    raise serializers.ValidationError(
                        {"assignee": "Assignee must be a member of this project team."}
                    )
        return attrs


class IssueCommentSerializer(serializers.ModelSerializer):
    author_email = serializers.EmailField(source="author.email", read_only=True)

    class Meta:
        model = IssueComment
        fields = (
            "id",
            "issue",
            "author",
            "author_email",
            "body",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "author", "created_at", "updated_at")


class IssueAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(
        source="uploaded_by.email", read_only=True
    )
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = IssueAttachment
        fields = (
            "id",
            "issue",
            "uploaded_by",
            "uploaded_by_email",
            "file",
            "file_url",
            "filename",
            "content_type",
            "size",
            "created_at",
        )
        read_only_fields = (
            "id",
            "uploaded_by",
            "filename",
            "content_type",
            "size",
            "created_at",
            "file_url",
        )

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return ""


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "workspace",
            "actor",
            "actor_email",
            "action",
            "target_type",
            "target_id",
            "changes",
            "created_at",
        )
        read_only_fields = fields
