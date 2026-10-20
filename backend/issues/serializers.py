from rest_framework import serializers
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
