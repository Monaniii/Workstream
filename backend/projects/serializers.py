from rest_framework import serializers
from .models import Project, Board, Sprint


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = (
            "id",
            "workspace",
            "name",
            "key",
            "description",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "workspace", "created_by", "created_at", "updated_at")


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
