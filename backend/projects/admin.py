from django.contrib import admin
from .models import Project, Board, Sprint


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "workspace", "created_by", "created_at")
    list_filter = ("workspace",)
    search_fields = ("key", "name")


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("name", "project", "workspace", "created_at")
    list_filter = ("workspace", "project")
    search_fields = ("name",)


@admin.register(Sprint)
class SprintAdmin(admin.ModelAdmin):
    list_display = ("name", "board", "workspace", "status", "start_date", "end_date")
    list_filter = ("status", "workspace")
    search_fields = ("name",)
