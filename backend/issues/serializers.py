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
    subtasks = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    comment_count = serializers.SerializerMethodField()
    assignee_email = serializers.EmailField(source="assignee.email", read_only=True)
    reporter_email = serializers.EmailField(source="reporter.email", read_only=True)
    project_key = serializers.CharField(source="project.key", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    is_closed = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

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
            "parent_issue",
            "subtasks",
            "blocked_by",
            "comment_count",
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
            "due_date",
            "closed_at",
            "is_closed",
            "is_overdue",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "workspace",
            "key",
            "subtasks",
            "comment_count",
            "closed_at",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        request = self.context.get("request")
        project = attrs.get("project", self.instance.project if self.instance else None)
        if project and request and project.workspace_id != request.tenant.id:
            raise serializers.ValidationError(
                {"project": "Project does not belong to this workspace."}
            )
        project_changed = bool(
            self.instance and project and project.pk != self.instance.project_id
        )
        if project_changed:
            if self.instance.subtasks.exclude(project=project).exists():
                raise serializers.ValidationError(
                    {"project": "Remove or move subtasks before changing projects."}
                )
            if self.instance.blocking_issues.exclude(project=project).exists():
                raise serializers.ValidationError(
                    {"project": "Remove dependencies before changing projects."}
                )

        parent = attrs.get(
            "parent_issue",
            self.instance.parent_issue if self.instance else None,
        )
        if parent:
            if parent.workspace_id != request.tenant.id:
                raise serializers.ValidationError(
                    {"parent_issue": "Parent task must belong to this workspace."}
                )
            if project and parent.project_id != project.id:
                raise serializers.ValidationError(
                    {"parent_issue": "Parent task must belong to the same project."}
                )
            if self.instance:
                seen = set()
                ancestor = parent
                while ancestor:
                    if ancestor.pk == self.instance.pk:
                        raise serializers.ValidationError(
                            {"parent_issue": "Subtasks cannot create a parent cycle."}
                        )
                    if ancestor.pk in seen:
                        raise serializers.ValidationError(
                            {"parent_issue": "The selected parent already has a cycle."}
                        )
                    seen.add(ancestor.pk)
                    ancestor = ancestor.parent_issue

        dependencies = attrs.get(
            "blocked_by",
            list(self.instance.blocked_by.all()) if self.instance else [],
        )
        dependency_ids = {dependency.pk for dependency in dependencies}
        for dependency in dependencies:
            if dependency.workspace_id != request.tenant.id:
                raise serializers.ValidationError(
                    {"blocked_by": "Dependencies must belong to this workspace."}
                )
            if project and dependency.project_id != project.id:
                raise serializers.ValidationError(
                    {"blocked_by": "Dependencies must belong to the same project."}
                )

        if self.instance and dependency_ids:
            descendants = set()
            frontier = {self.instance.pk}
            while frontier:
                blocked_ids = set(
                    Issue.objects.filter(blocked_by__in=frontier)
                    .exclude(pk__in=descendants)
                    .values_list("pk", flat=True)
                )
                frontier = blocked_ids - descendants
                descendants.update(frontier)
            if dependency_ids.intersection(descendants | {self.instance.pk}):
                raise serializers.ValidationError(
                    {"blocked_by": "Dependencies cannot create a task cycle."}
                )

        assignee_provided = "assignee" in attrs
        assignee = attrs.get(
            "assignee",
            self.instance.assignee if self.instance else None,
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

    def get_comment_count(self, obj):
        if hasattr(obj, "annotated_comment_count"):
            return obj.annotated_comment_count
        return obj.comments.count()


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
