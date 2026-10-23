from rest_framework import serializers
from .models import Project, Board, Sprint


class ProjectSerializer(serializers.ModelSerializer):
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
