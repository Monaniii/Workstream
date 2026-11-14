from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r"exports", views.ReportExportViewSet, basename="reportexport")

urlpatterns = [
    path("", include(router.urls)),
    path("overview/", views.ReportsViewSet.as_view({"get": "overview"}), name="report-overview"),
    path("projects/", views.ReportsViewSet.as_view({"get": "projects"}), name="report-projects"),
    path("tasks/", views.ReportsViewSet.as_view({"get": "tasks"}), name="report-tasks"),
    path("team/", views.ReportsViewSet.as_view({"get": "team"}), name="report-team"),
    path("activity/", views.ReportsViewSet.as_view({"get": "activity"}), name="report-activity"),
    path(
        "project-analytics/",
        views.ProjectAnalyticsView.as_view({"get": "list"}),
        name="report-project-analytics",
    ),
    path("export/csv/", views.ReportsViewSet.as_view({"post": "export_csv"}), name="report-export-csv"),
]
