from rest_framework import serializers
from django.contrib.auth import get_user_model
from tenants.models import WorkspaceMember
from .models import Project, Board, Sprint


class ProjectSerializer(serializers.ModelSerializer):
    team_members = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=get_user_model().objects.all(),
        required=False,
    )
    owner_email = serializers.EmailField(source="owner.email", read_only=True)
    manager_email = serializers.EmailField(source="manager.email", read_only=True)
    owner_name = serializers.CharField(
        source="owner.get_full_name", read_only=True
    )
    manager_name = serializers.CharField(
        source="manager.get_full_name", read_only=True
    )
    health = serializers.CharField(read_only=True)
    progress_percentage = serializers.FloatField(read_only=True)

    def get_fields(self):
        fields = super().get_fields()
        if self.instance:
            fields["team_members"].read_only = True
        return fields

    class Meta:
        model = Project
        fields = (
            "id",
            "workspace",
            "name",
            "key",
            "description",
            "objectives",
            "status",
            "priority",
            "owner",
            "owner_email",
            "owner_name",
            "manager",
            "manager_email",
            "manager_name",
            "team_members",
            "start_date",
            "target_date",
            "actual_start_date",
            "actual_completion_date",
            "tags",
            "visibility",
            "archived",
            "archived_at",
            "health",
            "progress_percentage",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "workspace",
            "created_by",
            "created_at",
            "updated_at",
            "health",
            "progress_percentage",
            "archived_at",
        )

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        target_date = attrs.get("target_date")
        if start_date and target_date and target_date < start_date:
            raise serializers.ValidationError(
                {"target_date": "Target date cannot be earlier than start date."}
            )
        workspace = getattr(self.context.get("request"), "tenant", None)
        if workspace:
            for field in ("owner", "manager"):
                user = attrs.get(field)
                if user and not WorkspaceMember.objects.filter(
                    workspace=workspace, user=user
                ).exists():
                    raise serializers.ValidationError(
                        {field: "User must be a member of this workspace."}
                    )
            team_members = attrs.get("team_members", [])
            if team_members:
                member_ids = set(
                    WorkspaceMember.objects.filter(
                        workspace=workspace,
                        user__in=team_members,
                    ).values_list("user_id", flat=True)
                )
                if member_ids != {member.id for member in team_members}:
                    raise serializers.ValidationError(
                        {"team_members": "All project team members must belong to this workspace."}
                    )

            key = (attrs.get("key") or "").upper()
            if key:
                attrs["key"] = key
                existing = Project.objects.filter(workspace=workspace, key=key)
                if self.instance is not None:
                    existing = existing.exclude(pk=self.instance.pk)
                if existing.exists():
                    raise serializers.ValidationError(
                        {"key": f"A project with key '{key}' already exists in this workspace."}
                    )
        return attrs


class BoardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Board
        fields = (
            "id",
            "workspace",
            "project",
            "name",
            "columns",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class SprintSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sprint
        fields = (
            "id",
            "workspace",
            "board",
            "name",
            "goal",
            "status",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
