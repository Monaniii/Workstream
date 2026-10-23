from rest_framework import serializers
from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source="actor.email", read_only=True)
    workspace_slug = serializers.CharField(
        source="workspace.slug", read_only=True
    )
    workspace_name = serializers.CharField(
        source="workspace.name", read_only=True
    )
    action_display = serializers.CharField(
        source="get_action_display", read_only=True
    )
    outcome_display = serializers.CharField(
        source="get_outcome_display", read_only=True
    )
    module_display = serializers.CharField(
        source="get_module_display", read_only=True
    )

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "timestamp",
            "created_at",
            "actor",
            "actor_type",
            "actor_name",
            "actor_email",
            "workspace",
            "workspace_slug",
            "workspace_name",
            "action",
            "action_display",
            "module",
            "module_display",
            "resource_type",
            "resource_id",
            "resource_name",
            "description",
            "outcome",
            "outcome_display",
            "changed_fields",
            "request_id",
            "http_method",
            "route",
            "ip_address",
            "user_agent",
            "session_key",
            "metadata",
        )
        read_only_fields = fields
