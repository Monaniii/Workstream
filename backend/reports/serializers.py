from rest_framework import serializers
from .models import ReportExport


class ReportExportSerializer(serializers.ModelSerializer):
    requested_by_email = serializers.EmailField(
        source="requested_by.email", read_only=True
    )

    class Meta:
        model = ReportExport
        fields = (
            "id",
            "workspace",
            "requested_by",
            "requested_by_email",
            "report_type",
            "format",
            "filters",
            "file_url",
            "record_count",
            "status",
            "created_at",
            "completed_at",
        )
        read_only_fields = fields
